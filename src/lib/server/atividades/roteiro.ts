import { buildRuntimeItem, itemAudioHashes, type StoredItemRow } from '$lib/server/player/runtime';
import type { LinhaDoTempo } from '$lib/kernel/language/sintese';
import { parseContentUnit } from '$lib/kernel/content/parse';
import type { ContentUnitKind } from '$lib/kernel/content/types';
import { gradingSchema, interactionSchema, promptSchema, type Item } from '$lib/kernel/item';
import { getInteraction } from '$lib/kernel/interactions/registry';
import { tetoCheio, usoDosTetos } from '$lib/kernel/generators/select';
import { matchAuthoringSchema } from '$lib/kernel/interactions/match';
import { resumoDoItem, ROTULO_DO_MATERIAL } from '$lib/server/atividades/resumo';
import { readableAnswerKey } from '$lib/server/studio/answer-key';
import { habilidadeDaQuestao } from '$lib/atividades/questao-resumida';
import type { RuntimeDaQuestao } from '$lib/components/interactions/types';
import {
	conferirItem,
	ordenarProblemas,
	type PerfisDaConferencia,
	type Problema
} from '$lib/kernel/qualidade';

/**
 * O ROTEIRO do aluno como as telas do professor o desenham — a revisão (etapa 3)
 * e a tela da atividade: cada questão com o enunciado, a habilidade, o material
 * de onde saiu, a resposta em texto e o runtime para o celular.
 *
 * O celular desenha o que `buildRuntimeItem` devolve — a mesma porta do Player,
 * então o gabarito não vai junto (regra nº 1). A `resposta` é a tela do
 * PROFESSOR, atrás do guard: ela vai em texto, à parte.
 */

export interface MaterialDaQuestao {
	/** O nome do tipo ("sentença"), ou "Revisão" no associar que fecha. */
	tipo: string;
	/** O texto principal do material, para a linha. */
	trecho: string;
	/** Nulo no associar que fecha: ele junta palavras de vários materiais. */
	kind: ContentUnitKind | null;
}

/** O material de cada questão, pelo id — a partir dos materiais da atividade. */
export function materiaisPorId(
	units: { id: string; kind: ContentUnitKind; data: unknown }[]
): Map<string, MaterialDaQuestao> {
	return new Map(
		units.map((unit) => {
			const data = parseContentUnit(unit.kind, unit.data);
			const trecho =
				'target' in data
					? data.target
					: 'term' in data
						? data.term
						: 'title' in data
							? data.title
							: (data.lines[0]?.text ?? '');
			return [unit.id, { tipo: ROTULO_DO_MATERIAL[unit.kind], trecho, kind: unit.kind }];
		})
	);
}

/**
 * A conferência de uma questão do roteiro (kernel.md "Conferência de
 * qualidade"). O `grading` vem de uma coluna JSON: sem passar no schema, a
 * questão não tem como ser corrigida, e é isso que a revisão diz.
 */
function problemasDe(
	prompt: Item['prompt'],
	interaction: Item['interaction'],
	gradingCru: unknown,
	perfis: PerfisDaConferencia
): Problema[] {
	const grading = gradingSchema.safeParse(gradingCru);
	if (!grading.success) return [{ codigo: 'formato-invalido', gravidade: 'erro' }];
	return ordenarProblemas(conferirItem({ prompt, interaction, grading: grading.data }, perfis));
}

type ItemDoRoteiro = StoredItemRow & {
	discarded: boolean;
	generatedBy: string | null;
	sourceContentId: string | null;
};

export function questoesDoRoteiro(
	itens: ItemDoRoteiro[],
	contexto: {
		/** A tag de idioma da atividade (o áudio sai do texto e da voz dela). */
		targetLang: string;
		/** A seed do runtime: a mesma que quem corrige vai usar. */
		semente: string;
		urlByHash: Map<string, string>;
		/** Onde cada som está em cada áudio, pelo hash (`linhasPorHash`). */
		linhasByHash?: Map<string, LinhaDoTempo>;
		materialPorId: Map<string, MaterialDaQuestao>;
		/**
		 * As duas línguas da atividade, para a CONFERÊNCIA de cada questão (a revisão
		 * mostra o aviso na linha). Sem elas — a tela da atividade, que só lê —, as
		 * questões vão sem problemas.
		 */
		perfis?: PerfisDaConferencia;
	}
) {
	let posicao = 0;
	const lidos = itens.map((item) => {
		const prompt = promptSchema.parse(item.prompt);
		const interaction = interactionSchema.parse(item.interaction);
		return { item, prompt, interaction, skills: getInteraction(interaction.type).skills(prompt) };
	});
	// Quanto de cada teto (fala, escuta) as de DENTRO já usam: é o que diz se uma
	// de fora ficou de fora pelo teto, e não pela quantidade.
	const usoDentro = usoDosTetos(lidos.filter((l) => !l.item.discarded).map((l) => l.skills));
	return lidos.map(({ item, prompt, interaction, skills }) => {
		const habilidade = habilidadeDaQuestao(skills);
		// O "ligue os pares" que fecha a atividade não tem material de origem: ele junta
		// palavras de vários. Sem isto a linha dizia "criada por você" de uma questão
		// que o professor não escreveu. As palavras do idioma alvo ficam do lado esquerdo.
		const fecho =
			item.generatedBy === 'closing-match' && interaction.type === 'match'
				? {
						tipo: 'Revisão',
						kind: null,
						trecho: matchAuthoringSchema
							.parse(interaction.payload)
							.pairs.map((par) => par.left)
							.join(' · ')
					}
				: undefined;
		const material =
			fecho ??
			(item.sourceContentId ? contexto.materialPorId.get(item.sourceContentId) : undefined);

		let runtime: RuntimeDaQuestao | null;
		try {
			runtime = buildRuntimeItem(item, contexto.semente, contexto.urlByHash, contexto.linhasByHash);
		} catch {
			runtime = null;
		}
		const audioDaQuestao = itemAudioHashes(item, contexto.targetLang);

		// A resposta legível. No "monte a frase" a frase inteira não fica no item
		// (só as peças): vem do áudio ou do material, e juntar as peças com espaço
		// quebraria o japonês (regra nº 5) — fica para o último caso.
		// Na próxima fala do diálogo, a resposta é a fala da parada (o trecho do
		// material seria a primeira fala da conversa).
		const falaDaParada =
			prompt.contexto?.tipo === 'dialogo' && prompt.contexto.ate !== undefined
				? prompt.contexto.falas[prompt.contexto.ate]?.texto
				: undefined;
		const resposta =
			interaction.type === 'assemble'
				? prompt.kind === 'audio' && prompt.text
					? prompt.text
					: (falaDaParada ??
						material?.trecho ??
						readableAnswerKey(interaction.type, interaction.payload).answer)
				: readableAnswerKey(interaction.type, interaction.payload).answer;

		return {
			id: item.id,
			dentro: !item.discarded,
			/** O "ligue os pares" que fecha a atividade: a questão nova entra antes dele. */
			fecho: item.generatedBy === 'closing-match',
			posicao: item.discarded ? null : ++posicao,
			titulo: runtime?.prompt || resumoDoItem(item.generatedBy, interaction.type),
			habilidade,
			material: material ?? null,
			resposta,
			runtime,
			audioPendente: audioDaQuestao.some((hash) => !contexto.urlByHash.has(hash)),
			/** Na de fora: a habilidade com teto que já está cheia no roteiro (`tetoCheio`). */
			foraPeloTeto: item.discarded ? tetoCheio(skills, usoDentro) : null,
			/** O que as regras do kernel acham da questão, erro antes de aviso. */
			problemas: contexto.perfis
				? problemasDe(prompt, interaction, item.grading, contexto.perfis)
				: []
		};
	});
}

export type QuestaoDoRoteiro = ReturnType<typeof questoesDoRoteiro>[number];
