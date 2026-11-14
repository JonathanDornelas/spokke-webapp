import { atividades } from '$lib/server/db/repos/activities';
import { getInteraction } from '$lib/kernel/interactions/registry';
import { gradingSchema, interactionSchema } from '$lib/kernel/item';
import { readableAnswer } from '$lib/server/player/readable-answer';
import { readableAnswerKey } from '$lib/server/studio/answer-key';
import { corrigirSemGravar, type Veredito } from '$lib/server/player/veredito';

/**
 * A PRÉVIA DO ALUNO (`atividades/[id]/previa`): o professor responde a atividade
 * na tela do Player, do começo ao resultado, e nada é gravado — nem tentativa,
 * nem resposta, nem gravação de voz.
 *
 * A versão é a que vai ao ar: o rascunho quando existe, senão a publicada. Os
 * descartados não entram (a publicação os remove). A seed é fixa por versão,
 * então o embaralhamento não muda entre um F5 e outro, e quem corrige usa a
 * MESMA (`${semente}:${item.id}`, como `buildRuntimeItem`) — sem ela os ids das
 * alternativas e das peças não batem com os que a tela embaralhou.
 */
export async function versaoDaPrevia(teacher: { id: string }, activityId: string) {
	const activity = await atividades(teacher).byId(activityId);
	if (!activity) return null;
	const [draft, published] = await Promise.all([
		atividades(teacher).draft(activityId),
		atividades(teacher).published(activityId)
	]);
	const versao = draft ?? published;
	return {
		activity,
		rascunho: !!draft,
		linhas: (versao?.items ?? []).filter((item) => !item.discarded),
		semente: `previa:${versao?.id ?? activity.id}`
	};
}

export type VersaoDaPrevia = NonNullable<Awaited<ReturnType<typeof versaoDaPrevia>>>;
type Linha = VersaoDaPrevia['linhas'][number];

/**
 * O que a tela de resultado da prévia mostra de uma resposta, além do veredito:
 * a resposta em texto (a mesma leitura do resultado do Player) e a resposta
 * certa por extenso. É a tela do professor, atrás do guard: o gabarito pode
 * chegar aqui, como chega no resultado do aluno com o resultado ligado.
 */
export interface CorrecaoDaPrevia {
	veredito: Veredito | null;
	/** Escrita por rubrica: o aluno manda e o professor corrige depois. */
	pendente: boolean;
	/** A resposta dada, em texto. */
	dada: string;
	/** A resposta certa, em texto. Vazia na que espera o professor. */
	esperada: string;
}

export async function corrigirNaPrevia(
	versao: VersaoDaPrevia,
	linha: Linha,
	resposta: unknown
): Promise<{ ok: true; correcao: CorrecaoDaPrevia } | { ok: false; erro: string }> {
	const interaction = interactionSchema.parse(linha.interaction);
	const registrada = getInteraction(interaction.type);
	const seed = `${versao.semente}:${linha.id}`;
	const respostaValida = registrada.answerSchema.safeParse(resposta);
	if (!respostaValida.success) return { ok: false, erro: 'Resposta em formato inesperado.' };

	// A resposta em texto lê o payload que o ALUNO viu (`toRuntime`), nunca o de
	// autoria: em montar, ordenar e associar ela é uma lista de ids embaralhados.
	const dada = readableAnswer(
		interaction.type,
		registrada.toRuntime(interaction.payload, seed),
		respostaValida.data
	);

	if (gradingSchema.parse(linha.grading).mode === 'rubric') {
		return { ok: true, correcao: { veredito: null, pendente: true, dada, esperada: '' } };
	}

	const correcao = await corrigirSemGravar(linha, respostaValida.data, seed);
	if (!correcao.ok) return { ok: false, erro: correcao.erro };
	return {
		ok: true,
		correcao: {
			veredito: correcao.veredito,
			pendente: false,
			dada,
			esperada:
				correcao.veredito.state === 'correct'
					? ''
					: readableAnswerKey(interaction.type, interaction.payload).answer
		}
	};
}
