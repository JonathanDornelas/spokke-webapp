import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireTeacher } from '$lib/server/auth/guard';
import { atividades } from '$lib/server/db/repos/activities';
import { materiais } from '$lib/server/db/repos/content-units';
import { itemSkills } from '$lib/server/player/runtime';
import { parseContentUnit } from '$lib/kernel/content/parse';
import { interactionSchema, promptSchema } from '$lib/kernel/item';
import { getProfile } from '$lib/kernel/language/profiles';
import { MAX_ITENS } from '$lib/kernel/generators/select';
import { iconeDoItem, resumoDoItem, ROTULO_DO_MATERIAL } from '$lib/server/atividades/resumo';
import { ROTULO_DA_INTERACAO } from '$lib/atividades/editor-item';
import { skillLabels } from '$lib/kernel/interactions/skill-schema';
import { readableAnswerKey } from '$lib/server/studio/answer-key';

/**
 * Etapa 3 — o professor revisa um RESUMO LEGÍVEL de cada item gerado.
 * Nenhum JSON aparece nesta tela (paginas.md "O professor nunca vê JSON"):
 * o que ele lê é a frase abaixo, montada a partir do gerador que produziu o
 * item.
 */
export const load: PageServerLoad = async ({ locals, params }) => {
	const teacher = requireTeacher(locals);
	const activity = await atividades(teacher).byId(params.id);
	if (!activity) error(404, 'Atividade não encontrada');

	// `draftFromPublished` e não `draft`: depois de publicar o rascunho deixa de
	// existir, e esta tela ficava VAZIA — "Editar atividade" jogava o professor
	// numa revisão sem nenhum item, como se a atividade dele tivesse sumido. A
	// chamada devolve o rascunho quando já existe e, quando não, clona o que
	// está no ar (a versão publicada continua intacta, regra nº 7).
	const [draft, units] = await Promise.all([
		atividades(teacher).draftFromPublished(params.id),
		materiais(teacher).byActivity(params.id)
	]);

	const excerptById = new Map(
		units.map((unit) => {
			const data = parseContentUnit(unit.kind, unit.data);
			const excerpt =
				'target' in data
					? data.target
					: 'term' in data
						? data.term
						: 'title' in data
							? data.title
							: (data.lines[0]?.text ?? '');
			return [unit.id, { excerpt, kindLabel: ROTULO_DO_MATERIAL[unit.kind] }];
		})
	);

	// Agrupa os itens do rascunho pelo material que os originou.
	const groups = new Map<
		string,
		{
			materialId: string;
			kindLabel: string;
			excerpt: string;
			items: {
				id: string;
				icon: string;
				summary: string;
				meta: string;
				accepted: boolean;
				discardReason?: string;
			}[];
		}
	>();

	for (const item of draft?.items ?? []) {
		const interaction = interactionSchema.parse(item.interaction);
		promptSchema.parse(item.prompt);
		const source = item.sourceContentId ?? 'manual';
		const info = excerptById.get(source);

		const group = groups.get(source) ?? {
			materialId: source,
			kindLabel: info?.kindLabel ?? 'item avulso',
			excerpt: info?.excerpt ?? '',
			items: []
		};

		// Quantas respostas a questão aceita ALÉM da principal — inclusive as que o
		// tradutor propôs ao gerar (`variantes-aceitas.ts`). Dito aqui para o
		// professor saber que há o que conferir no editor da questão.
		const outras = readableAnswerKey(interaction.type, interaction.payload).variants.length;
		const aceitaMais =
			outras === 0 ? '' : ` · aceita mais ${outras} ${outras === 1 ? 'resposta' : 'respostas'}`;

		group.items.push({
			id: item.id,
			icon: iconeDoItem(interaction.type),
			summary: resumoDoItem(item.generatedBy, interaction.type),
			// Habilidade DERIVADA, nunca declarada pelo professor.
			meta: `${ROTULO_DA_INTERACAO[interaction.type]} · ${itemSkills(item)
				.map((skill) => skillLabels[skill].toLocaleLowerCase('pt-BR'))
				.join(' + ')}${aceitaMais}`,
			// O item descartado CONTINUA no rascunho — a tela precisa dele para
			// oferecer "Restaurar". Ele só não entra na versão publicada.
			accepted: !item.discarded,
			discardReason: item.discarded ? 'Descartado por você' : undefined
		});
		groups.set(source, group);
	}

	// Material que não gerou nada precisa aparecer com o motivo, não sumir.
	for (const unit of units) {
		if (groups.has(unit.id)) continue;
		const info = excerptById.get(unit.id);
		groups.set(unit.id, {
			materialId: unit.id,
			kindLabel: info?.kindLabel ?? '',
			excerpt: info?.excerpt ?? '',
			items: []
		});
	}

	// **Por que este material não rendeu nada.** Havia UMA frase para as duas
	// causas, e ela culpava o gerador: "nenhum gerador conseguiu produzir". Na
	// maioria das vezes ele produziu — e a SELEÇÃO cortou, porque o alvo de
	// questões já tinha sido atingido por outros materiais. O professor lia que
	// a frase dele era ruim quando o que faltava era vaga.
	const cheio = (draft?.items.length ?? 0) >= Math.min(activity.itemTarget, MAX_ITENS);
	const motivo = cheio
		? `As ${draft?.items.length} questões pedidas na etapa 1 foram preenchidas por outros materiais — este ficou de fora do sorteio. Peça mais questões ou gere de novo.`
		: 'Nenhum gerador conseguiu produzir item deste material. Distrator sai sempre do seu próprio conjunto — com poucos materiais do mesmo tipo, alguns exercícios não têm alternativa errada plausível.';

	return {
		activity: {
			id: activity.id,
			title: activity.title,
			dir: getProfile(activity.targetLang).direction
		},
		generating: false,
		materialCount: units.length,
		groups: [...groups.values()].map((group) => ({
			...group,
			reason: group.items.length === 0 ? motivo : undefined
		}))
	};
};
