import { error, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import type { RequestHandler } from './$types';
import { requireTeacher } from '$lib/server/auth/guard';
import { atividades } from '$lib/server/db/repos/activities';

/**
 * O editor de questão deixou de ser uma tela: ele abre como MODAL sobre a
 * revisão (`revisar?questao=<id>`), para o professor corrigir uma questão sem
 * perder a lista de vista. Este endereço continua existindo porque a tela de
 * detalhes e a prévia da atividade levam a ele.
 *
 * O id pode ser de uma questão PUBLICADA: a tela de detalhes lista a versão no
 * ar, e o editor trabalha no rascunho. Editar uma questão publicada é editar a
 * cópia editável dela, então aqui a cópia é aberta (`draftFromPublished`) e o
 * professor vai para a questão equivalente — a POSIÇÃO liga um id ao outro (o
 * clone copia na mesma ordem), nunca o id.
 */
export const GET: RequestHandler = async ({ locals, params }) => {
	const teacher = requireTeacher(locals);
	const repo = atividades(teacher);
	if (!(await repo.byId(params.id))) error(404, 'Atividade não encontrada');

	const revisar = (itemId: string) =>
		`${resolve('/(studio)/atividades/[id]/revisar', { id: params.id })}?questao=${encodeURIComponent(itemId)}`;

	const draft = await repo.draft(params.id);
	if (draft?.items.some((item) => item.id === params.itemId)) redirect(303, revisar(params.itemId));

	const published = await repo.published(params.id);
	const posicao = published?.items.findIndex((item) => item.id === params.itemId) ?? -1;
	if (posicao >= 0) {
		const editavel = await repo.draftFromPublished(params.id);
		const equivalente = editavel?.items[posicao];
		if (equivalente) redirect(303, revisar(equivalente.id));
	}
	error(404, 'Questão não encontrada nesta atividade');
};
