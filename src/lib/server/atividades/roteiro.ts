import { buildRuntimeItem, itemAudioHashes, type StoredItemRow } from '$lib/server/player/runtime';
import { parseContentUnit } from '$lib/kernel/content/parse';
import type { ContentUnitKind } from '$lib/kernel/content/types';
import { interactionSchema, promptSchema } from '$lib/kernel/item';
import { getInteraction } from '$lib/kernel/interactions/registry';
import { matchAuthoringSchema } from '$lib/kernel/interactions/match';
import { resumoDoItem, ROTULO_DO_MATERIAL } from '$lib/server/atividades/resumo';
import { readableAnswerKey } from '$lib/server/studio/answer-key';
import { habilidadeDaQuestao } from '$lib/atividades/questao-resumida';
import type { RuntimeDaQuestao } from '$lib/components/interactions/types';

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
		materialPorId: Map<string, MaterialDaQuestao>;
	}
) {
	let posicao = 0;
	return itens.map((item) => {
		const prompt = promptSchema.parse(item.prompt);
		const interaction = interactionSchema.parse(item.interaction);
		const skills = getInteraction(interaction.type).skills(prompt);
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
			runtime = buildRuntimeItem(item, contexto.semente, contexto.urlByHash);
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
			audioPendente: audioDaQuestao.some((hash) => !contexto.urlByHash.has(hash))
		};
	});
}

export type QuestaoDoRoteiro = ReturnType<typeof questoesDoRoteiro>[number];
