import type { RequestHandler } from './$types';
import { artigosVisiveis } from '$lib/server/blog';
import { CABECALHO_XML, urlsDasPaginas, urlsDoBlog, xmlDoIndice } from '$lib/server/sitemap';

/**
 * O índice de sitemaps do site (o endereço que o robots.txt declara). Aponta
 * para as páginas fixas e, com artigo no ar, para o blog. As regras do que
 * entra estão em `$lib/server/sitemap`.
 */
export const GET: RequestHandler = ({ url }) => {
	const corpo = xmlDoIndice(url.origin, [
		{ caminho: '/sitemap-paginas.xml', urls: urlsDasPaginas(url.origin) },
		{ caminho: '/sitemap-blog.xml', urls: urlsDoBlog(url.origin, artigosVisiveis()) }
	]);
	return new Response(corpo, { headers: CABECALHO_XML });
};
