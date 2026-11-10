import { z } from 'zod';
import { command, form, getRequestEvent } from '$app/server';
import { error, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { playerRepo } from '$lib/server/db/repos/player';
import { itemAudioHashes } from '$lib/server/player/runtime';
import { publicationSettingsSchema } from '$lib/server/player/settings';
import { atualizarCorrecao } from '$lib/server/notificacoes';
import { codigoConfere } from '$lib/server/player/access-code';
import { convitePorToken } from '$lib/server/db/repos/deliveries';
import { fichaDaConta } from '$lib/server/db/repos/student-accounts';
import { getInteraction } from '$lib/kernel/interactions/registry';
import { gradingSchema, interactionSchema, localeSchema } from '$lib/kernel/item';
import { getProfile } from '$lib/kernel/language/profiles';
import { payloadParaCorrigir } from '$lib/server/escrita';
import { criarLimite } from '$lib/server/limite-por-ip';
import { registrarRelato } from '$lib/server/relatos';
import { relatoSchema } from '$lib/server/relatos/schema';
import { dev, version } from '$app/environment';
import type { Prisma } from '../../../../generated/prisma/client.ts';

/**
 * O fluxo do aluno — três funções, nenhuma delas recebe sessão (server.md "A
 * fronteira de segurança do Player"). O aluno é anônimo por design: o único
 * dado de identificação é o nome que ele digita, mais um `anonId` em cookie
 * para permitir retomar (auth.md "Dados do aluno e LGPD").
 *
 * PENDÊNCIA: rate limit por IP em `iniciarTentativa` e `responderItem` —
 * sem ele um script de três linhas enche o relatório do professor de lixo
 * (server.md "Fila"/"fronteira"). Mesmo padrão provisório do formulário de
 * contato.
 */

const ANON_COOKIE = 'spokke_anon';
const CODE_COOKIE_PREFIX = 'spokke_code_';

function anonId(): string {
	const { cookies } = getRequestEvent();
	const existing = cookies.get(ANON_COOKIE);
	if (existing) return existing;

	const fresh = crypto.randomUUID();
	cookies.set(ANON_COOKIE, fresh, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		maxAge: 60 * 60 * 24 * 180
	});
	return fresh;
}

async function publicationOr404(slug: string) {
	const publication = await playerRepo.publicationBySlug(slug);
	if (!publication) error(404, { message: 'Link não encontrado', reason: 'notFound' });
	return publication;
}

/**
 * A publicação ABERTA para começar algo novo. Atividade arquivada recusa
 * (docs/adr-002-billing.md) — mas só aqui, nas portas de COMEÇAR: responder,
 * retomar e finalizar continuam abertos, porque quem já estava respondendo
 * termina com o que abriu.
 */
async function publicacaoAbertaOr410(slug: string) {
	const publication = await publicationOr404(slug);
	if (publication.activityVersion.activity.archivedAt) {
		error(410, { message: 'Esta atividade foi encerrada', reason: 'unpublished' });
	}
	return publication;
}

type Publication = Awaited<ReturnType<typeof publicationOr404>>;

/** A publicação só abre quando todo o áudio dela existe (server.md "TTS"). */
async function ensureAudioReady(publication: Publication) {
	const { activityVersion } = publication;
	const targetLang = activityVersion.activity.targetLang;
	const hashes = activityVersion.items.flatMap((item) => itemAudioHashes(item, targetLang));
	const { done, total } = await playerRepo.audioReady(activityVersion.activity.teacherId, hashes);
	if (done < total) {
		error(503, { message: 'Áudio ainda sendo gerado', reason: 'audioPending' });
	}
}

export const iniciarTentativa = form(
	z.object({
		slug: z.string(),
		displayName: z.string().min(1).max(40).optional(),
		// Checkbox: desmarcado não envia nada, então o campo é uma string
		// opcional e não um boolean (server.md "Remote functions").
		guardarAudio: z.string().optional()
	}),
	async ({ slug, displayName, guardarAudio }) => {
		const publication = await publicacaoAbertaOr410(slug);
		const settings = publicationSettingsSchema.parse(publication.settings);
		await ensureAudioReady(publication);

		const { cookies } = getRequestEvent();
		if (settings.requireCode && cookies.get(CODE_COOKIE_PREFIX + slug) !== settings.code) {
			redirect(303, resolve('/a/[slug]/codigo', { slug }));
		}

		// Quem chegou pelo link pessoal já está identificado e não digitou nome:
		// o nome do cadastro é melhor do que qualquer coisa que ele escrevesse,
		// e é isso que faz o professor ver "Juliana Pereira" e não "ju".
		const studentId = cookies.get(`spokke_aluno_${slug}`) ?? null;
		const conta = getRequestEvent().locals.aluno;
		// Logado sem o cookie do convite (o QR da sala, outro aparelho): a ficha
		// dele com ESTE professor ainda o identifica — senão o professor via um
		// anônimo com o nome da conta, mesmo com o aluno na chamada.
		const student = studentId
			? await convitePorToken.studentById(studentId)
			: conta
				? await fichaDaConta(
						conta.id,
						publication.activityVersion.activity.teacherId,
						publication.id
					)
				: null;

		// A conta é OPCIONAL e nunca é exigida aqui: quem não tem entra pelo
		// nome, como sempre. Quem tem não digita nada — o nome da conta vale,
		// e a tentativa fica no histórico dela mesmo em outro aparelho.
		const nome = student?.name ?? conta?.name ?? displayName?.trim();
		if (!nome) error(400, 'Diga como o professor vai te reconhecer.');

		const attempt = await playerRepo.createAttempt(
			publication.id,
			nome,
			anonId(),
			// Não sequencial e não adivinhável — a seed manda em toda a
			// aleatorização desta tentativa (regra inviolável nº 8).
			crypto.randomUUID(),
			student?.id ?? null,
			conta?.id ?? null,
			// **A autorização vem do formulário, e a ausência é NÃO.** É dado
			// pessoal novo do aluno (auth.md), então o padrão nunca pode ser o
			// consentimento presumido: sem a marca, a gravação segue sendo
			// transcrita e descartada.
			guardarAudio !== undefined
		);

		cookies.set(`spokke_attempt_${slug}`, attempt.id, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			maxAge: 60 * 60 * 24 * 7
		});

		redirect(303, resolve('/a/[slug]/q/[n]', { slug, n: '1' }));
	}
);

/**
 * Retomada. A tela oferecia "Continuar de onde parei" e "Começar de novo"
 * apontando para `?/resume` e `?/restart`, que nunca existiram — os dois
 * botões não faziam nada.
 */
export const retomarTentativa = form(z.object({ slug: z.string() }), async ({ slug }) => {
	const publication = await publicationOr404(slug);
	await ensureAudioReady(publication);

	const { cookies } = getRequestEvent();
	const anterior = await playerRepo.resumableAttempt(publication.id, anonId());
	if (!anterior) redirect(303, resolve('/a/[slug]', { slug }));

	cookies.set(`spokke_attempt_${slug}`, anterior.id, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		maxAge: 60 * 60 * 24 * 7
	});

	// A próxima questão é a primeira sem resposta, não a seguinte à última
	// gravada: pular uma questão não pode deixar buraco no meio.
	const respondidos = new Set(anterior.items.map((linha) => linha.itemId));
	const itens = publication.activityVersion.items;
	const proximo = itens.findIndex((item) => !respondidos.has(item.id));
	const n = String(proximo === -1 ? itens.length : proximo + 1);

	redirect(303, resolve('/a/[slug]/q/[n]', { slug, n }));
});

export const recomecarTentativa = form(z.object({ slug: z.string() }), async ({ slug }) => {
	const publication = await publicacaoAbertaOr410(slug);
	const { cookies } = getRequestEvent();

	await playerRepo.discardResumable(publication.id, anonId());
	cookies.delete(`spokke_attempt_${slug}`, { path: '/' });

	redirect(303, resolve('/a/[slug]', { slug }));
});

/**
 * "Não sou eu" — o aluno cai de volta no fluxo anônimo. Existe porque o
 * aparelho pode ser compartilhado (laboratório da escola, celular emprestado)
 * e responder no lugar de outro é pior do que responder sem nome.
 */
export const naoSouEu = form(z.object({ slug: z.string() }), async ({ slug }) => {
	getRequestEvent().cookies.delete(`spokke_aluno_${slug}`, { path: '/' });
	redirect(303, resolve('/a/[slug]', { slug }));
});

export const validarCodigo = form(
	z.object({ slug: z.string(), code: z.string().min(1) }),
	async ({ slug, code }) => {
		const publication = await publicacaoAbertaOr410(slug);
		const settings = publicationSettingsSchema.parse(publication.settings);

		// O erro não conta quantas tentativas restam: o limite fica no
		// servidor (paginas.md "Player").
		if (!settings.code || !codigoConfere(settings.code, code)) return { invalid: true };

		getRequestEvent().cookies.set(CODE_COOKIE_PREFIX + slug, settings.code, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			maxAge: 60 * 60 * 24
		});
		redirect(303, resolve('/a/[slug]', { slug }));
	}
);

async function attemptOr404(attemptId: string) {
	const attempt = await playerRepo.attemptById(attemptId);
	if (!attempt) error(404, { message: 'Tentativa não encontrada', reason: 'attemptLost' });
	return attempt;
}

/**
 * A correção acontece AQUI, no servidor — regra inviolável nº 2. O cliente
 * nunca decide certo/errado, nem otimisticamente.
 */
export const responderItem = command(
	z.object({
		attemptId: z.string(),
		itemId: z.string(),
		answer: z.unknown(),
		ms: z.number().int().min(0).default(0)
	}),
	async ({ attemptId, itemId, answer, ms }) => {
		const attempt = await attemptOr404(attemptId);
		const settings = publicationSettingsSchema.parse(attempt.publication.settings);

		const item = attempt.publication.activityVersion.items.find((i) => i.id === itemId);
		if (!item) error(404, 'Item não pertence a esta tentativa');

		const interaction = interactionSchema.parse(item.interaction);
		const grading = gradingSchema.parse(item.grading);
		const locale = localeSchema.parse(item.locale);
		const registered = getInteraction(interaction.type);

		// A resposta é gravada VALIDADA pelo `answerSchema` da interação, não
		// embrulhada num objeto para escapar do tipo do Prisma: era assim que
		// ela ia para o banco como `{ answer: { text } }`, e a tela de revisão
		// procurava `text` na raiz e mostrava um traço.
		const parsedAnswer = registered.answerSchema.safeParse(answer);
		if (!parsedAnswer.success) error(400, 'Resposta em formato inesperado');
		const paraGravar = parsedAnswer.data as Prisma.InputJsonValue;

		// Escrita por rubrica não é corrigida agora: vai para a fila do
		// professor (kernel.md "Correção", nível 4).
		if (grading.mode === 'rubric') {
			await playerRepo.recordAnswer(attemptId, itemId, paraGravar, 0, ms);
			// O sino do professor (docs/notificacoes.md). Sem `await`: o aluno não
			// espera o aviso de outra pessoa, e uma falha ali não custa a resposta.
			const atividade = attempt.publication.activityVersion.activity;
			void atualizarCorrecao(atividade.teacherId, atividade, { criar: true });
			return { state: 'pending' as const };
		}

		// O profile da língua em que a RESPOSTA vem, não o do item: em
		// `translate-type` o aluno escreve na língua dele.
		const profileDaResposta = getProfile(
			grading.answerLang === 'source' ? locale.source : locale.target
		);
		const result = registered.grade(
			// Com a leitura da frase quando o teclado do idioma não escreve o
			// gabarito — o kana de uma resposta em kanji (`server/escrita`).
			await payloadParaCorrigir(interaction, grading, profileDaResposta),
			answer,
			profileDaResposta,
			`${attempt.seed}:${item.id}`
		);
		if (!result.ok) error(400, result.error);

		await playerRepo.recordAnswer(attemptId, itemId, paraGravar, result.value.value, ms);

		// Sem "mostrar resultado", o aluno não recebe veredito nenhum — nem
		// por item, senão dá para deduzir a nota mesmo assim.
		if (!settings.showResult) return { state: 'hidden' as const };

		const value = result.value.value;
		return {
			state:
				value >= 1
					? ('correct' as const)
					: value > 0
						? ('partial' as const)
						: ('incorrect' as const),
			hint: result.value.feedback,
			// As marcas são a resposta DELE pedaço a pedaço — nada do gabarito
			// (regra inviolável nº 1) — e só saem daqui com o resultado ligado,
			// como o resto do veredito.
			marks: result.value.marks,
			// A resposta certa. É gabarito, e sai pelo MESMO portão do resto do
			// veredito: acima, sem `showResult`, a função já devolveu 'hidden'.
			expected: result.value.expected
		};
	}
);

export const finalizarTentativa = command(
	z.object({ attemptId: z.string() }),
	async ({ attemptId }) => {
		const attempt = await attemptOr404(attemptId);
		await playerRepo.finishAttempt(attemptId);

		const settings = publicationSettingsSchema.parse(attempt.publication.settings);
		if (!settings.showResult) return { showFeedback: false as const };

		const correct = attempt.items.filter((i) => i.score >= 1).length;
		const partial = attempt.items.filter((i) => i.score > 0 && i.score < 1).length;
		const incorrect = attempt.items.filter((i) => i.score === 0).length;
		return { showFeedback: true as const, tally: { correct, partial, incorrect } };
	}
);

/**
 * "Relatar problema", de dentro de uma questão. Sem sessão, como o resto do
 * Player: a prova de onde o relato veio é a tentativa (o `attemptId` não é
 * adivinhável) e a questão tem de ser dela. Quem monta e grava é
 * `$lib/server/relatos` (testável sem SvelteKit); aqui ficam o teto por IP —
 * é endpoint público, e cada relato vira um e-mail para a equipe — e a
 * tradução da recusa em erro HTTP.
 */
const limiteDeRelatos = criarLimite({ maximo: 8, janelaMs: 10 * 60 * 1000 });

export const relatarProblema = command(relatoSchema, async (entrada) => {
	const evento = getRequestEvent();
	if (!limiteDeRelatos.permitir(evento.getClientAddress())) {
		error(429, 'Muitos relatos em pouco tempo. Espere alguns minutos e tente de novo.');
	}
	const desfecho = await registrarRelato(entrada, {
		userAgent: evento.request.headers.get('user-agent'),
		idiomaDoNavegador: evento.request.headers.get('accept-language'),
		versao: version,
		ambiente: dev ? 'desenvolvimento' : 'producao'
	});
	if (!desfecho.ok) error(desfecho.status, desfecho.mensagem);
	return { codigo: desfecho.codigo };
});
