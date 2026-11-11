import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { artigosVisiveis, hubDasEscolas } from '$lib/server/blog';

/**
 * O hub das escolas: todo artigo marcado para escola (`publico` escola ou
 * ambos), venha do tema que vier, com a conversão para a conversa sobre o plano
 * da escola. Sem artigo de escola no ar, não existe (404).
 */
export const load: PageServerLoad = () => {
	const hub = hubDasEscolas(artigosVisiveis());
	if (!hub) error(404, 'Ainda não há artigos para escolas.');
	return {
		guia: hub.guia,
		artigos: hub.artigos,
		outrosTemas: hub.outrosTemas,
		indexar: hub.indexar
	};
};
