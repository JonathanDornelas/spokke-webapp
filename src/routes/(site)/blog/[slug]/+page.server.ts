import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { artigosVisiveis, ehParaEscola, relacionados, resumo } from '$lib/server/blog';
import { questoesDoExemplo } from '$lib/server/exemplo';

/**
 * Um artigo. A questão embutida, quando há, é a da atividade de exemplo, já
 * passada por `toRuntime()`: o leitor responde de verdade e a correção é a do
 * servidor, sem gabarito no browser (regra inviolável nº 1).
 */
export const load: PageServerLoad = ({ params }) => {
	const lista = artigosVisiveis();
	const artigo = lista.find((a) => a.slug === params.slug);
	if (!artigo) error(404, 'Artigo não encontrado.');

	const ids = artigo.blocos.flatMap((b) => (b.tipo === 'questao' ? [b.itemId] : []));
	return {
		artigo: { ...resumo(artigo), blocos: artigo.blocos, sumario: artigo.sumario },
		questoes: ids.length > 0 ? questoesDoExemplo(ids) : [],
		relacionados: relacionados(artigo, lista),
		temHubDasEscolas: lista.some((a) => ehParaEscola(a.publico))
	};
};
