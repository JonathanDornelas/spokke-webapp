import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { artigosVisiveis, paginaDoIndice } from '$lib/server/blog';

/**
 * As páginas seguintes do índice, cada uma com o canonical para ela mesma.
 * `/blog/pagina/1` é o próprio `/blog` (301, para não haver duas URLs com o
 * mesmo conteúdo), e uma página que não existe é 404.
 */
export const load: PageServerLoad = ({ params }) => {
	if (!/^\d{1,4}$/.test(params.n)) error(404, 'Página não encontrada.');
	const n = Number(params.n);
	if (n === 1) redirect(301, '/blog');
	const dados = paginaDoIndice(artigosVisiveis(), n);
	if (!dados) error(404, 'Página não encontrada.');
	return { indice: dados };
};
