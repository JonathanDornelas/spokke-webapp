import type { RequestHandler } from './$types';
import { CABECALHO_XML, urlsDasPaginas, xmlDoSitemap } from '$lib/server/sitemap';

/** As páginas públicas fixas abertas à busca (`PAGINAS_PUBLICAS`). */
export const GET: RequestHandler = ({ url }) =>
	new Response(xmlDoSitemap(urlsDasPaginas(url.origin)), { headers: CABECALHO_XML });
