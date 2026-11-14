import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireTeacher } from '$lib/server/auth/guard';
import { atividades } from '$lib/server/db/repos/activities';
import { materiais } from '$lib/server/db/repos/content-units';
import { labelForTag } from '$lib/kernel/language/profiles';
import { nivelOuNulo } from '$lib/atividades/nivel';

/**
 * A etapa 1 de uma atividade que JÁ existe — para onde o "voltar" da etapa de
 * materiais leva. Antes ele levava a `nova`, e continuar dali criava outra
 * atividade em vez de mudar esta.
 *
 * Os idiomas só mudam enquanto nada depende deles: o material da atividade tem
 * a tag do idioma dela, e as questões foram tokenizadas e corrigidas com ele.
 * Quem barra de verdade é `editarDetalhes`; aqui a tela diz por quê.
 */
export const load: PageServerLoad = async ({ locals, params }) => {
	const teacher = requireTeacher(locals);
	const repo = atividades(teacher);
	const activity = await repo.byId(params.id);
	if (!activity) error(404, 'Atividade não encontrada');

	const [units, draft, published] = await Promise.all([
		materiais(teacher).byActivity(params.id),
		repo.draft(params.id),
		repo.published(params.id)
	]);

	const idiomasTravados = published
		? 'Os idiomas ficam fixos depois de publicar: o link no ar é deles.'
		: units.length > 0 || draft
			? 'Os idiomas ficam fixos depois do primeiro material: ele e as questões são desses idiomas.'
			: null;

	return {
		activity: { id: activity.id, title: activity.title },
		valores: {
			title: activity.title,
			alvo: labelForTag(activity.targetLang),
			aluno: labelForTag(activity.sourceLang),
			nivel: nivelOuNulo(activity.level)
		},
		idiomasTravados
	};
};
