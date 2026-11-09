import { error, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import type { PageServerLoad } from './$types';
import { playerRepo } from '$lib/server/db/repos/player';
import { publicationSettingsSchema } from '$lib/server/player/settings';
import { readableAnswer } from '$lib/server/player/readable-answer';
import { rotuloDoItem } from '$lib/server/player/rotulo';
import { getProfile } from '$lib/kernel/language/profiles';
import { getInteraction } from '$lib/kernel/interactions/registry';
import { gradingSchema, interactionSchema, promptSchema } from '$lib/kernel/item';
import { readableAnswerKey } from '$lib/server/studio/answer-key';
import { payloadParaCorrigir } from '$lib/server/escrita';
import { diaEMes, duracao } from '$lib/tempo';

type ItemState = 'correct' | 'partial' | 'incorrect' | 'pending';

/**
 * Fim da tentativa. Dois caminhos, decididos pelo professor ao publicar: com
 * feedback (o percurso inteiro, questão por questão) e sem feedback — e "sem
 * feedback" significa NENHUM veredito, nem contagem, senão dá para deduzir a
 * nota do mesmo jeito.
 *
 * **O tempo entra como informação de estudo, nunca como cobrança.** A média da
 * questão vem ao lado da média da turma, e a questão que mais demorou é
 * destacada como "onde você pensou mais", não como falta. Um aluno que leva o
 * dobro do tempo e acerta não errou nada.
 *
 * **Sem feedback o aluno ainda vê o PERCURSO** — quantas respondeu, quanto
 * levou, que tentativa é esta. Nenhum acerto vaza nisso: são números que
 * existem igual com resultado ligado ou desligado, e a tela diz em texto o que
 * eles são. Antes ele recebia só "enviado", o que é verdade e é pouco.
 */
export const load: PageServerLoad = async ({ params, cookies, locals }) => {
	const attemptId = cookies.get(`spokke_attempt_${params.slug}`);

	// Sem o cookie da tentativa, procura a que este aparelho (ou esta conta) já
	// entregou: é o caminho de quem volta pelo link depois, ou de quem abre a
	// atividade noutro celular estando logado. Sem isso, "Ver meu resultado"
	// da entrada devolvia para a própria entrada, em círculo.
	const attempt = attemptId
		? await playerRepo.attemptById(attemptId)
		: await (async () => {
				const publication = await playerRepo.publicationBySlug(params.slug);
				if (!publication) return null;
				const anterior = await playerRepo.concludedAttempt(publication.id, {
					anonId: cookies.get('spokke_anon'),
					accountId: locals.aluno?.id
				});
				return anterior ? playerRepo.attemptById(anterior.id) : null;
			})();

	if (!attempt) {
		// Nada para mostrar: a entrada é quem sabe o que oferecer (começar,
		// retomar ou ver o resultado).
		if (!attemptId) redirect(303, resolve('/a/[slug]', { slug: params.slug }));
		error(404, { message: 'Perdemos sua sessão', reason: 'attemptLost' });
	}

	const settings = publicationSettingsSchema.parse(attempt.publication.settings);
	const { activityVersion } = attempt.publication;
	const items = activityVersion.items;
	const { sourceLang, targetLang } = activityVersion.activity;
	const dir = getProfile(targetLang).direction;

	const answerByItem = new Map(attempt.items.map((row) => [row.itemId, row]));

	const stateOf = (itemId: string): ItemState => {
		const answer = answerByItem.get(itemId);
		if (!answer) return 'pending';
		if (answer.score >= 1) return 'correct';
		return answer.score > 0 ? 'partial' : 'incorrect';
	};

	const itemStates = items.map((item) => stateOf(item.id));
	const terminouEm = attempt.finishedAt ?? new Date();
	const msTotal = terminouEm.getTime() - attempt.startedAt.getTime();

	// O percurso desta pessoa neste link: quantas vezes ela entregou, e como foi
	// em cada uma. É o que dá sentido ao número de hoje — "2 de 2" com "na 1ª
	// você fez 3 de 8" conta uma história que "63%" sozinho não conta.
	const entregas = await playerRepo.concludedAttempts(attempt.publicationId, {
		anonId: attempt.anonId,
		accountId: attempt.accountId ?? undefined
	});
	const estaEntrega = entregas.findIndex((e) => e.id === attempt.id);
	const numeroDaTentativa = estaEntrega >= 0 ? estaEntrega + 1 : entregas.length + 1;
	const primeira = entregas[0];
	const acertosNaPrimeira =
		entregas.length > 1 && primeira && primeira.id !== attempt.id
			? primeira.items.filter((i) => i.score >= 1).length
			: null;

	const base = {
		showFeedback: settings.showResult,
		activity: {
			title: activityVersion.activity.title,
			itemCount: items.length,
			slug: params.slug,
			dir
		},
		student: {
			name: attempt.name,
			initials:
				attempt.name
					.split(/\s+/)
					.filter(Boolean)
					.slice(0, 2)
					.map((parte) => parte[0]?.toUpperCase())
					.join('') || '?',
			// Logado numa conta: o nome no cabeçalho leva ao painel dele. Sem
			// conta não há para onde ir — e a tela não pede que crie uma.
			temConta: !!locals.aluno,
			avatar: locals.aluno?.avatar ?? null
		},
		duration: duracao(msTotal),
		teacherNote: undefined,
		attempt: {
			numero: numeroDaTentativa,
			total: Math.max(entregas.length, numeroDaTentativa),
			quando: diaEMes(terminouEm),
			/** Quantas o aluno respondeu — o que sustenta o percurso sem revelar acerto. */
			respondidas: attempt.items.length
		}
	};

	if (!settings.showResult) {
		// Sem resultado liberado, nada de contagem de ACERTO nem de estado por
		// item. O percurso continua: quantas respondeu, quanto levou, que
		// tentativa é esta — nenhum dos três diz se acertou.
		return {
			...base,
			tally: { correct: 0, partial: 0, incorrect: 0, pending: 0 },
			percent: null,
			itemStates: [],
			questions: [],
			skills: [],
			stats: null
		};
	}

	// ── com feedback: o percurso inteiro ──────────────────────────────────
	const mediaDaTurmaMs = await playerRepo.avgMsPorQuestao(attempt.publicationId, attempt.id);

	const respondidas = items.filter((item) => answerByItem.has(item.id));
	const msSomados = respondidas.reduce(
		(total, item) => total + (answerByItem.get(item.id)?.ms ?? 0),
		0
	);
	const mediaPorQuestaoMs = respondidas.length > 0 ? msSomados / respondidas.length : 0;

	const questions = await Promise.all(
		items.map(async (item, i) => {
			const gravada = answerByItem.get(item.id);
			const prompt = promptSchema.parse(item.prompt);
			const interaction = interactionSchema.parse(item.interaction);
			const grading = gradingSchema.parse(item.grading);
			const registrada = getInteraction(interaction.type);
			const state = stateOf(item.id);

			// A MESMA seed de `buildRuntimeItem`: é o que faz os ids da resposta
			// gravada corresponderem ao que o aluno viu na tela.
			const seed = `${attempt.seed}:${item.id}`;
			const runtime = registrada.toRuntime(interaction.payload, seed);

			// O "por quê" da nota vem do GRADER, não de uma frase montada aqui:
			// `Score.feedback` é o que o kernel já explica ("faltou o acento"), e
			// `AttemptItem` guarda só o número. Recorrigir é determinístico e roda no
			// servidor, que é onde a correção sempre aconteceu (regra nº 2) — a
			// alternativa seria uma coluna nova repetindo o que o kernel sabe dizer.
			let porque: string | undefined;
			if (gravada && state !== 'correct' && state !== 'pending') {
				// O profile da língua em que a RESPOSTA vem, não o do item: em
				// `translate-type` o aluno escreve na língua dele.
				const profileDaResposta = getProfile(
					grading.answerLang === 'source' ? sourceLang : targetLang
				);
				const nota = registrada.grade(
					// A MESMA correção de `responderItem`, leitura incluída — senão o
					// "por quê" contradiria a nota que o aluno recebeu.
					await payloadParaCorrigir(interaction, grading, profileDaResposta),
					gravada.answer,
					profileDaResposta,
					seed
				);
				if (nota.ok) porque = nota.value.feedback;
			}

			const { answer: esperada } = readableAnswerKey(interaction.type, interaction.payload);

			return {
				n: i + 1,
				label: rotuloDoItem(prompt, interaction.type, grading.mode),
				state,
				ms: gravada?.ms ?? 0,
				time: gravada ? duracao(gravada.ms) : '—',
				/** O que ELE respondeu — não o gabarito. Vazio na pendente. */
				given: gravada ? readableAnswer(interaction.type, runtime, gravada.answer) : '',
				// Só o que não saiu certo precisa da resposta esperada ao lado, e nunca
				// no item que ainda vai para o professor: ali não existe "certo" ainda.
				expected: state === 'correct' || state === 'pending' ? undefined : esperada,
				porque
			};
		})
	);

	// Por habilidade: agrupado pelo que o aluno FEZ (`rotuloDoItem`), que é a
	// mesma palavra da lista de questões. Item pendente fica fora — ele não tem
	// veredito, e contá-lo como não-acerto reprovaria o aluno por uma fila do
	// professor.
	const porRotulo = new Map<string, { correct: number; partial: number; total: number }>();
	for (const q of questions) {
		if (q.state === 'pending') continue;
		const linha = porRotulo.get(q.label) ?? { correct: 0, partial: 0, total: 0 };
		linha.total++;
		if (q.state === 'correct') linha.correct++;
		else if (q.state === 'partial') linha.partial++;
		porRotulo.set(q.label, linha);
	}

	const skills = [...porRotulo.entries()]
		.map(([name, n]) => ({
			name,
			correct: n.correct,
			partial: n.partial,
			total: n.total,
			// A etiqueta é um convite, não uma nota: "vale voltar" é o pior que a
			// tela diz a alguém que acabou de terminar.
			tag:
				n.correct === n.total
					? ('firme' as const)
					: n.correct + n.partial >= n.total
						? ('quase lá' as const)
						: ('vale voltar' as const)
		}))
		.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'pt-BR'));

	const maisDemorada = respondidas.length > 0 ? questions.filter((q) => q.ms > 0) : [];
	const lenta = maisDemorada.reduce<(typeof questions)[number] | null>(
		(pior, q) => (!pior || q.ms > pior.ms ? q : pior),
		null
	);

	const correct = itemStates.filter((s) => s === 'correct').length;

	return {
		...base,
		tally: {
			correct,
			partial: itemStates.filter((s) => s === 'partial').length,
			incorrect: itemStates.filter((s) => s === 'incorrect').length,
			// "A corrigir" é faixa própria: somar ao erro esconde exatamente o
			// que ainda não tem veredito (design-system.md).
			pending: itemStates.filter((s) => s === 'pending').length
		},
		percent: items.length > 0 ? Math.round((correct / items.length) * 100) : 0,
		itemStates,
		questions,
		skills,
		stats: {
			tempoTotal: duracao(msTotal),
			mediaPorQuestao: duracao(mediaPorQuestaoMs),
			/** Nulo quando ninguém mais entregou: "a turma leva 0 s" é pior que o silêncio. */
			mediaDaTurma: mediaDaTurmaMs === null ? null : duracao(mediaDaTurmaMs),
			maisDemorada: lenta ? { n: lenta.n, time: lenta.time, label: lenta.label } : null,
			acertosNaPrimeira
		}
	};
};
