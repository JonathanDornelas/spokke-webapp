import { getInteraction } from '$lib/kernel/interactions/registry';
import { gradingSchema, interactionSchema, localeSchema } from '$lib/kernel/item';
import { getProfile } from '$lib/kernel/language/profiles';
import type { Score } from '$lib/kernel/grading/result';
import { payloadParaCorrigir } from '$lib/server/escrita';

/**
 * Corrigir uma resposta SEM gravar nada — o veredito que o aluno receberia, para
 * quem só quer ver: a atividade de exemplo (o visitante da home) e a revisão do
 * professor, que responde a questão no celular do palco antes de publicar.
 *
 * É o mesmo caminho do \`responderItem\` do Player: valida pelo \`answerSchema\` da
 * interação, usa o profile da língua da RESPOSTA, o payload com a leitura do
 * japonês e do chinês (\`payloadParaCorrigir\`) e a seed do item — sem ela os ids
 * das alternativas e das peças não batem com os que a tela embaralhou.
 */

export type Veredito = {
	state: 'correct' | 'partial' | 'incorrect';
	hint?: string;
	marks?: Score['marks'];
	expected?: string[];
};

export type Correcao = { ok: true; veredito: Veredito } | { ok: false; erro: string };

function vereditoDe(score: Score): Veredito {
	return {
		state: score.value >= 1 ? 'correct' : score.value > 0 ? 'partial' : 'incorrect',
		hint: score.feedback,
		marks: score.marks,
		expected: score.expected
	};
}

export async function corrigirSemGravar(
	linha: { interaction: unknown; grading: unknown; locale: unknown },
	resposta: unknown,
	seed: string
): Promise<Correcao> {
	const interaction = interactionSchema.parse(linha.interaction);
	const grading = gradingSchema.parse(linha.grading);
	const locale = localeSchema.parse(linha.locale);
	const registered = getInteraction(interaction.type);

	const answer = registered.answerSchema.safeParse(resposta);
	if (!answer.success) return { ok: false, erro: 'resposta em formato inesperado' };

	const profile = getProfile(grading.answerLang === 'source' ? locale.source : locale.target);
	const resultado = registered.grade(
		await payloadParaCorrigir(interaction, grading, profile),
		answer.data,
		profile,
		seed
	);
	if (!resultado.ok) return { ok: false, erro: resultado.error };
	return { ok: true, veredito: vereditoDe(resultado.value) };
}
