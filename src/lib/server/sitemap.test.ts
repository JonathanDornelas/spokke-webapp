import { describe, expect, it } from 'vitest';
import { atualizadoEm, atualizadoEmIso } from '$lib/content/institucional';
import type { Artigo } from '$lib/blog/tipos';
import { lerArtigo } from '$lib/server/blog';
import { urlsDasPaginas, urlsDoBlog, xmlDoIndice, xmlDoSitemap } from './sitemap';

const ORIGEM = 'https://spokke.com.br';

function artigo(slug: string, fm: Record<string, unknown> = {}): Artigo {
	const base = {
		titulo: 'Como montar uma atividade de teste',
		tituloSeo: 'Atividade de teste com as frases da aula',
		descricao:
			'Uma descrição de teste com tamanho suficiente para passar no mínimo de cento e vinte caracteres que a busca pede, sem passar dos cento e sessenta.',
		linhaFina: 'Uma linha fina de teste que responde a pergunta logo no topo do artigo.',
		tema: 'atividades-com-o-material-da-aula',
		publico: 'professor',
		publicadoEm: '2026-11-01',
		...fm
	};
	const linhas = Object.entries(base).map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
	return lerArtigo(
		`/src/content/blog/${slug}.md`,
		`---\n${linhas.join('\n')}\n---\nUm parágrafo.\n`
	);
}

const muitos = Array.from({ length: 26 }, (_, i) =>
	artigo(`artigo-numero-${i + 1}`, { publicadoEm: `2026-10-${String(i + 1).padStart(2, '0')}` })
).reverse();

describe('sitemap das páginas', () => {
	it('lista as páginas públicas, sem as que levam noindex', () => {
		const locs = urlsDasPaginas(ORIGEM).map((u) => u.loc);
		expect(locs).toContain(`${ORIGEM}/`);
		expect(locs).toContain(`${ORIGEM}/cadastro`);
		expect(locs).not.toContain(`${ORIGEM}/entrar`);
		expect(locs).not.toContain(`${ORIGEM}/esqueci-senha`);
		expect(locs.every((l) => l.startsWith(ORIGEM))).toBe(true);
	});

	it('só as páginas legais levam lastmod, com a data real da revisão do texto', () => {
		const urls = urlsDasPaginas(ORIGEM);
		expect(urls.find((u) => u.loc.endsWith('/privacidade'))?.lastmod).toBe(atualizadoEmIso);
		expect(urls.find((u) => u.loc.endsWith('/planos'))?.lastmod).toBeUndefined();
	});

	it('a data ISO das páginas legais é a mesma que elas mostram no topo', () => {
		const [ano, mes, dia] = atualizadoEmIso.split('-').map(Number);
		const nome = new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' }).format(
			new Date(Date.UTC(ano!, mes! - 1, dia!))
		);
		expect(atualizadoEm).toBe(`${dia} de ${nome} de ${ano}`);
	});
});

describe('sitemap do blog', () => {
	it('leva a data real do artigo e só os hubs indexáveis, sem as páginas seguintes do índice', () => {
		const xml = xmlDoSitemap(urlsDoBlog(ORIGEM, muitos));
		expect(xml).toContain(
			`<loc>${ORIGEM}/blog/artigo-numero-26</loc><lastmod>2026-10-26</lastmod>`
		);
		expect(xml).toContain(`<loc>${ORIGEM}/blog</loc>`);
		expect(xml).not.toContain('/blog/pagina/');
		expect(xml).toContain('/blog/tema/atividades-com-o-material-da-aula');
		expect(xml).not.toContain('/blog/para-escolas');
		expect(xml).not.toContain('<priority>');
		expect(xml).not.toContain('<changefreq>');
	});

	it('a capa do artigo entra na extensão de imagem, e só quando existe', () => {
		const comCapa = artigo('artigo-com-capa', {
			capa: { src: '/blog/capa.png', alt: 'Uma capa de teste' }
		});
		const xml = xmlDoSitemap(urlsDoBlog(ORIGEM, [comCapa]));
		expect(xml).toContain('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"');
		expect(xml).toContain(
			`<image:image><image:loc>${ORIGEM}/blog/capa.png</image:loc></image:image>`
		);
		expect(xmlDoSitemap(urlsDoBlog(ORIGEM, muitos))).not.toContain('xmlns:image');
	});

	it('sem artigo no ar, o blog não tem sitemap e o índice não aponta para ele', () => {
		expect(urlsDoBlog(ORIGEM, [])).toEqual([]);
		const indice = xmlDoIndice(ORIGEM, [
			{ caminho: '/sitemap-paginas.xml', urls: urlsDasPaginas(ORIGEM) },
			{ caminho: '/sitemap-blog.xml', urls: [] }
		]);
		expect(indice).toContain(`<loc>${ORIGEM}/sitemap-paginas.xml</loc>`);
		expect(indice).not.toContain('sitemap-blog.xml');
	});
});

describe('índice de sitemaps', () => {
	it('cada parte leva a data mais recente de dentro dela', () => {
		const indice = xmlDoIndice(ORIGEM, [
			{ caminho: '/sitemap-paginas.xml', urls: urlsDasPaginas(ORIGEM) },
			{ caminho: '/sitemap-blog.xml', urls: urlsDoBlog(ORIGEM, muitos) }
		]);
		expect(indice).toContain('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
		expect(indice).toContain(`<loc>${ORIGEM}/sitemap-blog.xml</loc><lastmod>2026-10-26</lastmod>`);
		expect(indice).toContain(
			`<loc>${ORIGEM}/sitemap-paginas.xml</loc><lastmod>${atualizadoEmIso}</lastmod>`
		);
	});
});
