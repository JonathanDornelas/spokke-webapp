import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireTeacher } from '$lib/server/auth/guard';
import { corrigirNaPrevia, versaoDaPrevia } from '$lib/server/atividades/previa';
import { guardarResposta, hashDoAudio, respostaGuardada } from '$lib/server/asr/pre-transcricao';
import { vocabulario } from '$lib/server/asr/vocabulario';
import { ouvirFala } from '$lib/server/pronuncia';
import { getInteraction } from '$lib/kernel/interactions/registry';
import { getProfile } from '$lib/kernel/language/profiles';
import { gradingSchema, interactionSchema, localeSchema } from '$lib/kernel/item';

/**
 * A questão de FALA na prévia do aluno. O mesmo desenho de `a/[slug]/fala`: o
 * browser manda som, o servidor transcreve e corrige (regra inviolável nº 2), e
 * `modo=ouvir` devolve só o que foi entendido, para o professor decidir entre
 * enviar e gravar de novo — como o aluno decide.
 *
 * O que muda é quem autoriza e o que fica: aqui é a SESSÃO do professor, dono da
 * atividade (um endpoint é público como uma remote function, regra nº 3), e nada
 * fica — nem resposta, nem gravação. Os bytes morrem com esta requisição.
 */
const MAX_BYTES = 10 * 1024 * 1024;

export const POST: RequestHandler = async ({ locals, params, request }) => {
	const teacher = requireTeacher(locals);
	const versao = await versaoDaPrevia(teacher, params.id);
	if (!versao) error(404, 'Atividade não encontrada');

	const form = await request.formData();
	const itemId = form.get('itemId');
	const arquivo = form.get('audio');
	const somenteOuvir = form.get('modo') === 'ouvir';
	if (typeof itemId !== 'string') error(400, 'itemId é obrigatório');
	if (!(arquivo instanceof File) || arquivo.size === 0) error(400, 'nenhum áudio recebido');
	if (arquivo.size > MAX_BYTES) error(413, 'gravação longa demais');

	const linha = versao.linhas.find((l) => l.id === itemId);
	if (!linha) error(404, 'questão não encontrada nesta atividade');
	const interaction = interactionSchema.parse(linha.interaction);
	if (interaction.type !== 'speak') error(400, 'esta questão não é de fala');

	// As mesmas escolhas do endpoint do Player: o profile da língua da RESPOSTA e
	// as dicas de vocabulário, que vão para o serviço de áudio e nunca para a tela.
	const grading = gradingSchema.parse(linha.grading);
	const locale = localeSchema.parse(linha.locale);
	const profile = getProfile(grading.answerLang === 'source' ? locale.source : locale.target);
	const payload = getInteraction('speak').authoringSchema.parse(interaction.payload) as {
		target: string;
		hints?: string[];
	};
	const hints = [...profile.asr.hints, ...vocabulario(payload.hints, payload.target, profile)];

	const bytes = new Uint8Array(await arquivo.arrayBuffer());
	const hash = hashDoAudio(bytes);
	// O "Verificar" chega com os mesmos bytes do "ouvir": o modelo roda uma vez.
	const chave = `previa:${teacher.id}`;
	let resposta = respostaGuardada(chave, itemId, hash);
	if (resposta === null) {
		try {
			resposta = await ouvirFala({
				payload: interaction.payload,
				bytes,
				contentType: arquivo.type || 'audio/webm',
				profile,
				hints
			});
		} catch (erro) {
			console.error('[previa/fala] transcrição falhou', erro);
			error(503, 'não conseguimos ouvir a gravação agora — pule esta questão e siga em frente');
		}
		guardarResposta(chave, itemId, hash, resposta);
	}
	const transcript = resposta.transcript;

	if (somenteOuvir) return json({ transcript });

	const correcao = await corrigirNaPrevia(versao, linha, resposta);
	if (!correcao.ok) error(400, correcao.erro);
	return json({ ...correcao.correcao, transcript });
};
