import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { artigosVisiveis } from '$lib/server/blog';
import { CABECALHO_XML, urlsDoBlog, xmlDoSitemap } from '$lib/server/sitemap';

/** O blog: índice, páginas seguintes, hubs indexáveis e artigos. Sem artigo no ar, 404 (e o índice não aponta para cá). */
export const GET: RequestHandler = ({ url }) => {
	const urls = urlsDoBlog(url.origin, artigosVisiveis());
	if (urls.length === 0) error(404, 'O blog ainda não tem artigos publicados.');
	return new Response(xmlDoSitemap(urls), { headers: CABECALHO_XML });
};
