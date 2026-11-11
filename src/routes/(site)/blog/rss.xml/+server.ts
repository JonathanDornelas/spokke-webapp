import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { artigosVisiveis } from '$lib/server/blog';

/** O feed do blog: os 20 artigos mais recentes, para leitor de RSS e para quem agrega. */

function xml(texto: string): string {
	return texto
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

/** O dia do artigo no formato de data do RSS (RFC 822), ao meio-dia UTC para não mudar de dia em fuso nenhum. */
function dataRss(dia: string): string {
	return new Date(`${dia}T12:00:00Z`).toUTCString();
}

export const GET: RequestHandler = ({ url }) => {
	const lista = artigosVisiveis().slice(0, 20);
	if (lista.length === 0) error(404, 'O blog ainda não tem artigos publicados.');

	const origem = url.origin;
	const ultimo = lista
		.map((a) => a.atualizadoEm ?? a.publicadoEm)
		.sort()
		.at(-1)!;
	const itens = lista
		.map(
			(a) => `		<item>
			<title>${xml(a.titulo)}</title>
			<link>${origem}/blog/${a.slug}</link>
			<guid isPermaLink="true">${origem}/blog/${a.slug}</guid>
			<pubDate>${dataRss(a.publicadoEm)}</pubDate>
			<category>${xml(a.tema.nome)}</category>
			<description>${xml(a.descricao)}</description>
		</item>`
		)
		.join('\n');

	const corpo = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
	<channel>
		<title>Blog do Spokke</title>
		<link>${origem}/blog</link>
		<atom:link href="${origem}/blog/rss.xml" rel="self" type="application/rss+xml" />
		<description>Ideias e material pronto para a próxima aula de idiomas, e roteiros para quem coordena uma escola de idiomas.</description>
		<language>pt-BR</language>
		<lastBuildDate>${dataRss(ultimo)}</lastBuildDate>
${itens}
	</channel>
</rss>
`;
	return new Response(corpo, {
		headers: { 'content-type': 'application/rss+xml; charset=utf-8' }
	});
};
