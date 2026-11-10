import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { artigosVisiveis, ehParaEscola, hubDoTema } from '$lib/server/blog';

/** O hub de um tema. Tema sem artigo no ar não tem página (404). */
export const load: PageServerLoad = ({ params }) => {
	const lista = artigosVisiveis();
	const hub = hubDoTema(lista, params.tema);
	if (!hub || !hub.tema) error(404, 'Tema não encontrado.');
	return {
		tema: hub.tema,
		guia: hub.guia,
		artigos: hub.artigos,
		outrosTemas: hub.outrosTemas,
		indexar: hub.indexar,
		temHubDasEscolas: lista.some((a) => ehParaEscola(a.publico))
	};
};
