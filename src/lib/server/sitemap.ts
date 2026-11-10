import { TEMAS } from '$lib/blog/temas';
import type { Artigo, ResumoDoArtigo } from '$lib/blog/tipos';
import { atualizadoEmIso } from '$lib/content/institucional';
import { hubDasEscolas, hubDoTema, paginaDoIndice } from '$lib/server/blog';

/**
 * O sitemap do site inteiro, dividido em dois (docs/seo/sitemap-STRUCTURE.md):
 * `/sitemap.xml` é o ÍNDICE, que aponta para `/sitemap-paginas.xml` (as
 * páginas públicas fixas) e `/sitemap-blog.xml` (o blog). Separado assim, o
 * Search Console mostra a cobertura de cada parte, e o blog pode crescer sem
 * mexer no resto.
 *
 * Regras que valem para as duas partes (análise da skill seo-sitemap):
 * - só URL indexável e canônica: nada de `noindex` (hub com menos de 3
 *   artigos, o hub das escolas ainda pequeno, entrar, área do aluno), nada que
 *   redirecione (`/blog/pagina/1`), nada de rota logada;
 * - `lastmod` só onde a data é REAL: a do artigo e a da última revisão das
 *   páginas legais. As outras páginas fixas não levam data, em vez de uma
 *   inventada ou da data do deploy;
 * - sem `priority` nem `changefreq`, que o Google ignora;
 * - a origem é a do pedido, e em produção o `ORIGIN` do adapter-node a fixa em
 *   `https://spokke.com.br` (a mesma dos canonicals).
 */

export interface UrlDoSitemap {
	loc: string;
	lastmod?: string;
	/** Imagens da página (a capa do artigo), na extensão de imagem do Google. */
	imagens?: string[];
}

/**
 * As páginas públicas FIXAS abertas à busca. Entrar e recuperar a senha levam
 * `noindex` e ficam fora; o cadastro, não. Página nova aberta à busca entra aqui.
 */
export const PAGINAS_PUBLICAS: readonly { caminho: string; lastmod?: string }[] = [
	{ caminho: '/' },
	{ caminho: '/planos' },
	{ caminho: '/exemplo' },
	{ caminho: '/cadastro' },
	{ caminho: '/sobre' },
	{ caminho: '/ajuda' },
	{ caminho: '/contato' },
	{ caminho: '/privacidade', lastmod: atualizadoEmIso },
	{ caminho: '/termos', lastmod: atualizadoEmIso },
	{ caminho: '/cookies', lastmod: atualizadoEmIso },
	{ caminho: '/acessibilidade', lastmod: atualizadoEmIso }
];

function maisRecente(datas: (string | undefined)[]): string | undefined {
	return datas
		.filter((d): d is string => !!d)
		.sort()
		.at(-1);
}

function dataDoArtigo(a: ResumoDoArtigo): string {
	return a.atualizadoEm ?? a.publicadoEm;
}

export function urlsDasPaginas(origem: string): UrlDoSitemap[] {
	return PAGINAS_PUBLICAS.map((p) => ({ loc: origem + p.caminho, lastmod: p.lastmod }));
}

/**
 * O blog: o índice, os hubs indexáveis e os artigos. Vazio sem artigo no ar.
 *
 * As páginas seguintes do índice (`/blog/pagina/2` em diante) ficam FORA, por
 * decisão de 2026-11-10: são navegação, não conteúdo para ranquear, e cada
 * artigo que elas listam já está aqui. Continuam rastreáveis pelos links da
 * paginação, com canonical próprio.
 */
export function urlsDoBlog(origem: string, lista: Artigo[]): UrlDoSitemap[] {
	if (!paginaDoIndice(lista, 1)) return [];
	const urls: UrlDoSitemap[] = [];
	urls.push({ loc: `${origem}/blog`, lastmod: maisRecente(lista.map(dataDoArtigo)) });

	for (const t of TEMAS) {
		const hub = hubDoTema(lista, t.slug);
		if (!hub?.indexar) continue;
		urls.push({
			loc: `${origem}/blog/tema/${t.slug}`,
			lastmod: maisRecente([...(hub.guia ? [hub.guia] : []), ...hub.artigos].map(dataDoArtigo))
		});
	}
	const escolas = hubDasEscolas(lista);
	if (escolas?.indexar) {
		urls.push({
			loc: `${origem}/blog/para-escolas`,
			lastmod: maisRecente(
				[...(escolas.guia ? [escolas.guia] : []), ...escolas.artigos].map(dataDoArtigo)
			)
		});
	}
	for (const a of lista) {
		urls.push({
			loc: `${origem}/blog/${a.slug}`,
			lastmod: dataDoArtigo(a),
			imagens: a.capa ? [origem + a.capa.src] : undefined
		});
	}
	return urls;
}

function xml(texto: string): string {
	return texto
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

export function xmlDoSitemap(urls: UrlDoSitemap[]): string {
	const comImagem = urls.some((u) => u.imagens?.length);
	const linhas = urls.map((u) => {
		const partes = [`<loc>${xml(u.loc)}</loc>`];
		if (u.lastmod) partes.push(`<lastmod>${u.lastmod}</lastmod>`);
		for (const img of u.imagens ?? [])
			partes.push(`<image:image><image:loc>${xml(img)}</image:loc></image:image>`);
		return `\t<url>${partes.join('')}</url>`;
	});
	const ns = comImagem
		? ' xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"'
		: ' xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"';
	return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset${ns}>\n${linhas.join('\n')}\n</urlset>\n`;
}

/** O índice: um `<sitemap>` por parte que tem URL, com a data mais recente de dentro dela. */
export function xmlDoIndice(
	origem: string,
	partes: { caminho: string; urls: UrlDoSitemap[] }[]
): string {
	const linhas = partes
		.filter((p) => p.urls.length > 0)
		.map((p) => {
			const data = maisRecente(p.urls.map((u) => u.lastmod));
			return `\t<sitemap><loc>${xml(origem + p.caminho)}</loc>${data ? `<lastmod>${data}</lastmod>` : ''}</sitemap>`;
		});
	return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${linhas.join('\n')}\n</sitemapindex>\n`;
}

export const CABECALHO_XML = { 'content-type': 'application/xml; charset=utf-8' } as const;
