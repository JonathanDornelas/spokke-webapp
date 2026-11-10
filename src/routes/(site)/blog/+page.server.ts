import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { artigosVisiveis, paginaDoIndice } from '$lib/server/blog';

/**
 * O índice do blog, página 1. Sem artigo no ar o blog não existe (404), em vez
 * de uma página vazia indexada. O "Blog" do menu é fixo, e um teste garante que
 * sempre haja artigo no ar (`blog.test.ts`).
 */
export const load: PageServerLoad = () => {
	const dados = paginaDoIndice(artigosVisiveis(), 1);
	if (!dados) error(404, 'O blog ainda não tem artigos publicados.');
	return { indice: dados };
};
