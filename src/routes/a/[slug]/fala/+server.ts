import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { playerRepo } from '$lib/server/db/repos/player';
import { putObject } from '$lib/server/storage';
import { falaExpiraEm, falaObjectKey } from '$lib/server/tts';
import { guardarResposta, hashDoAudio, respostaGuardada } from '$lib/server/asr/pre-transcricao';
import { vocabulario } from '$lib/server/asr/vocabulario';
import { ouvirFala } from '$lib/server/pronuncia';
import { publicationSettingsSchema } from '$lib/server/player/settings';
import { getInteraction } from '$lib/kernel/interactions/registry';
import { getProfile } from '$lib/kernel/language/profiles';
import { gradingSchema, interactionSchema, localeSchema } from '$lib/kernel/item';
import type { Prisma } from '../../../../../generated/prisma/client.ts';

/**
 * A resposta de uma questão de FALA — o único caminho do Player que sobe
 * binário.
 *
 * **Por que um endpoint e não uma remote function.** Remote function fala
 * JSON; áudio em base64 dentro de JSON infla 33% e ainda obriga os dois lados
 * a codificar. Este é o mesmo `responderItem`, com `multipart/form-data`.
 *
 * **Por que o servidor transcreve, e não o browser.** O `answerSchema` do
 * `speak` é `{ transcript }`, e a versão anterior deixava o cliente preencher
 * isso — ou seja, o aluno mandava o texto que quisesse. A transcrição acontece
 * AQUI, com o áudio que ele gravou, e só então a correção roda (regra
 * inviolável nº 2). O que chega do browser é som, não veredito.
 *
 * Sem sessão, como o resto do Player (server.md "A fronteira de segurança do
 * Player"): quem autoriza é o `attemptId`, que é imprevisível.
 *
 * **Dois modos, um endpoint.** `modo=ouvir` só transcreve e devolve o texto —
 * é o que a tela chama assim que a gravação para, para o aluno ver o que foi
 * entendido ANTES de enviar. O modo padrão corrige e grava a resposta, e
 * reaproveita o que o modo anterior ouviu quando os bytes são os mesmos
 * (`pre-transcricao.ts`): o modelo roda uma vez por gravação, não duas. As
 * checagens de tentativa, item e tipo valem igual nos dois — ouvir também é
 * uma chamada de ASR paga com CPU, e não pode ser feita em nome de qualquer
 * tentativa.
 */

/** Gravação de exercício tem segundos. O teto existe para um POST de 2 GB não derrubar o processo. */
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * A extensão do arquivo guardado, a partir do que o browser mandou.
 *
 * Não é enfeite: é ela que faz o `<audio>` do professor tocar. Cada browser
 * grava num contêiner diferente (webm no Chrome e no Firefox, mp4 no Safari), e
 * o tipo é dito pelo próprio `MediaRecorder` — não por nada que o aluno
 * escreva, então não há caminho de arquivo vindo de input (server.md "Mídia").
 */
function extensaoDe(contentType: string): string {
	const base = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
	if (base === 'audio/mp4' || base === 'audio/aac') return 'm4a';
	if (base === 'audio/ogg') return 'ogg';
	if (base === 'audio/mpeg') return 'mp3';
	if (base === 'audio/wav' || base === 'audio/x-wav') return 'wav';
	return 'webm';
}

export const POST: RequestHandler = async ({ request, params }) => {
	const form = await request.formData();
	const attemptId = form.get('attemptId');
	const itemId = form.get('itemId');
	const arquivo = form.get('audio');
	const ms = Number(form.get('ms') ?? 0);
	const somenteOuvir = form.get('modo') === 'ouvir';

	if (typeof attemptId !== 'string' || typeof itemId !== 'string') {
		error(400, 'attemptId e itemId são obrigatórios');
	}
	if (!(arquivo instanceof File) || arquivo.size === 0) {
		error(400, 'nenhum áudio recebido');
	}
	if (arquivo.size > MAX_BYTES) {
		error(413, 'gravação longa demais');
	}

	const attempt = await playerRepo.attemptById(attemptId);
	// A tentativa tem de ser desta publicação: sem esta checagem, um
	// `attemptId` de outra atividade responderia itens daqui.
	if (!attempt || attempt.publication.slug !== params.slug) {
		error(404, { message: 'Perdemos sua sessão', reason: 'attemptLost' });
	}
	if (attempt.finishedAt) error(409, 'esta tentativa já foi entregue');

	const item = attempt.publication.activityVersion.items.find((linha) => linha.id === itemId);
	if (!item) error(404, 'item não pertence a esta atividade');

	const interaction = interactionSchema.parse(item.interaction);
	if (interaction.type !== 'speak') error(400, 'este item não é de fala');

	const grading = gradingSchema.parse(item.grading);
	const locale = localeSchema.parse(item.locale);
	// O profile da língua em que a RESPOSTA vem, igual ao `responderItem`. Quase
	// sempre é a alvo — é ela que o aluno está aprendendo a falar —, mas quem
	// decide é o item: com o profile errado, o modelo de ASR seria o da língua
	// errada e a transcrição sairia lixo antes mesmo de a correção começar.
	const profile = getProfile(grading.answerLang === 'source' ? locale.source : locale.target);

	// O `hints` sai do payload de AUTORIA e nunca chega ao browser: são os
	// termos que o modelo tenderia a escrever errado. É a única parte do
	// gabarito que atravessa, e atravessa para o serviço de áudio, não para o
	// aluno (regra inviolável nº 1).
	const registered = getInteraction('speak');
	const payload = registered.authoringSchema.parse(interaction.payload) as {
		target: string;
		hints?: string[];
	};
	const hints = [...profile.asr.hints, ...vocabulario(payload.hints, payload.target, profile)];

	const bytes = new Uint8Array(await arquivo.arrayBuffer());
	const hash = hashDoAudio(bytes);

	// O que se ouviu: a transcrição, ou, na Pronúncia, os sons do reconhecedor de
	// fonemas (`ouvirFala`). Feito uma vez por gravação: o "Verificar" reaproveita.
	let answer = respostaGuardada(attemptId, itemId, hash);
	if (answer === null) {
		try {
			answer = await ouvirFala({
				payload: interaction.payload,
				bytes,
				contentType: arquivo.type || 'audio/webm',
				profile,
				hints
			});
		} catch (erro) {
			// Serviço de áudio fora do ar não pode virar 500 na cara do aluno no
			// meio do exercício: `speak` nunca reprova de forma dura (kernel.md), e
			// o rodapé sempre tem "Pular".
			console.error('[fala] transcrição falhou', erro);
			error(503, 'não conseguimos ouvir sua gravação agora — pule esta questão e siga em frente');
		}
		guardarResposta(attemptId, itemId, hash, answer);
	}
	const transcript = answer.transcript;

	// Só ouvir: o aluno decide se manda isto ou grava de novo. Nada é gravado.
	// O que o serviço entendeu não é gabarito — é a fala dele mesmo.
	if (somenteOuvir) return json({ transcript });

	const resultado = registered.grade(
		interaction.payload,
		answer,
		profile,
		`${attempt.seed}:${item.id}`
	);
	if (!resultado.ok) error(400, resultado.error);

	await playerRepo.recordAnswer(
		attemptId,
		itemId,
		answer as Prisma.InputJsonValue,
		resultado.value.value,
		Number.isFinite(ms) ? ms : 0
	);

	// **A gravação só é guardada com autorização do aluno.** Sem ela, os bytes
	// morrem com esta requisição — que é o comportamento de sempre e continua
	// sendo o padrão. Com ela, o professor consegue ouvir e comentar.
	//
	// Guardar depois de gravar a resposta, e não antes, é deliberado: falha no
	// bucket não pode custar ao aluno a resposta que ele acabou de dar.
	if (attempt.audioConsent) {
		try {
			const chave = falaObjectKey(attemptId, itemId, extensaoDe(arquivo.type));
			await putObject(chave, bytes, arquivo.type || 'audio/webm');
			await playerRepo.recordAudio(attemptId, itemId, chave, falaExpiraEm());
		} catch (erro) {
			// O exercício não para por causa disto. O aluno respondeu, a nota
			// está gravada, e o professor perde só o áudio daquela questão.
			console.error('[fala] não consegui guardar a gravação', erro);
		}
	}

	const settings = publicationSettingsSchema.parse(attempt.publication.settings);
	if (!settings.showResult) return json({ state: 'hidden' as const });

	const valor = resultado.value.value;
	return json({
		state: valor >= 1 ? 'correct' : valor > 0 ? 'partial' : 'incorrect',
		hint: resultado.value.feedback,
		// O que o serviço ENTENDEU. Numa questão de fala isso é metade do
		// retorno: "quase" sem dizer o que se ouviu não ensina nada.
		transcript,
		// Na Pronúncia, as sílabas da palavra com a que saiu fora marcada.
		marks: resultado.value.marks
	});
};
