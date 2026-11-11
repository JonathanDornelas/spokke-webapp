import { redes } from '$lib/content/institucional';
import type { ResumoDoArtigo } from './tipos';

/**
 * Os dados estruturados (JSON-LD) do blog, como objetos simples. Quem os põe na
 * página é `DadosEstruturados.svelte`, com `serializarJsonLd`.
 *
 * Sem `FAQPage` e sem `HowTo` (o Google restringiu um e descontinuou o outro):
 * as perguntas e o passo a passo continuam como conteúdo. Sem `Person`: o blog
 * não tem autor, e a organização assina (decisão de 2026-11-10).
 */

type Objeto = Record<string, unknown>;

/**
 * A marca, como autora e como editora do blog — e, na home, como a EMPRESA que o Google liga ao
 * site (o painel da marca na busca, o logo ao lado do resultado). O `@id` é o mesmo em todo
 * lugar: é o que diz ao Google que o autor do artigo e a empresa da home são a mesma entidade.
 *
 * `sameAs` são os perfis oficiais (`redes`, no rodapé) — só os que JÁ têm endereço: um perfil
 * que ainda não existe não pode ser apontado como a mesma entidade.
 */
export function organizacao(origem: string): Objeto {
	const perfis = redes.flatMap((rede) => (rede.url ? [rede.url] : []));
	return {
		'@type': 'Organization',
		'@id': `${origem}/#organizacao`,
		name: 'Spokke',
		url: `${origem}/`,
		// Quadrado e acima dos 112 px que o Google pede para o logo da organização.
		logo: {
			'@type': 'ImageObject',
			url: `${origem}/apple-touch-icon.png`,
			width: 180,
			height: 180
		},
		email: 'suporte@spokke.com.br',
		...(perfis.length > 0 ? { sameAs: perfis } : {})
	};
}

/** A empresa, sozinha na home: a mesma `organizacao`, com o que só a home diz. */
export function organizacaoEstruturada(origem: string, descricao: string): Objeto {
	return { '@context': 'https://schema.org', ...organizacao(origem), description: descricao };
}

/**
 * O SITE, na home: é daqui que o Google tira o nome que mostra acima do endereço nos resultados
 * ("Spokke" em vez de "spokke.com.br").
 */
export function siteEstruturado(origem: string): Objeto {
	return {
		'@context': 'https://schema.org',
		'@type': 'WebSite',
		'@id': `${origem}/#site`,
		name: 'Spokke',
		alternateName: 'spokke.com.br',
		url: `${origem}/`,
		inLanguage: 'pt-BR',
		publisher: { '@id': `${origem}/#organizacao` }
	};
}

export function artigoEstruturado(
	artigo: ResumoDoArtigo,
	{ origem, url, imagem }: { origem: string; url: string; imagem: string }
): Objeto {
	const marca = organizacao(origem);
	return {
		'@context': 'https://schema.org',
		'@type': 'BlogPosting',
		headline: artigo.titulo,
		description: artigo.descricao,
		image: [imagem],
		datePublished: artigo.publicadoEm,
		dateModified: artigo.atualizadoEm ?? artigo.publicadoEm,
		author: marca,
		publisher: marca,
		mainEntityOfPage: { '@type': 'WebPage', '@id': url },
		articleSection: artigo.tema.nome,
		inLanguage: 'pt-BR'
	};
}

/** As migalhas: o último item é a própria página, sem link na tela e com URL aqui. */
export function trilhaEstruturada(itens: { nome: string; url: string }[]): Objeto {
	return {
		'@context': 'https://schema.org',
		'@type': 'BreadcrumbList',
		itemListElement: itens.map((item, i) => ({
			'@type': 'ListItem',
			position: i + 1,
			name: item.nome,
			item: item.url
		}))
	};
}

/** Hub de tema e hub das escolas. */
export function colecaoEstruturada({
	nome,
	descricao,
	url,
	origem,
	artigos
}: {
	nome: string;
	descricao: string;
	url: string;
	origem: string;
	artigos: ResumoDoArtigo[];
}): Objeto {
	return {
		'@context': 'https://schema.org',
		'@type': 'CollectionPage',
		name: nome,
		description: descricao,
		url,
		inLanguage: 'pt-BR',
		mainEntity: {
			'@type': 'ItemList',
			itemListElement: artigos.map((a, i) => ({
				'@type': 'ListItem',
				position: i + 1,
				url: `${origem}/blog/${a.slug}`,
				name: a.titulo
			}))
		}
	};
}

/** O índice: o blog e os artigos desta página. */
export function blogEstruturado({
	url,
	origem,
	descricao,
	artigos
}: {
	url: string;
	origem: string;
	descricao: string;
	artigos: ResumoDoArtigo[];
}): Objeto {
	return {
		'@context': 'https://schema.org',
		'@type': 'Blog',
		name: 'Blog do Spokke',
		description: descricao,
		url,
		inLanguage: 'pt-BR',
		publisher: organizacao(origem),
		blogPost: artigos.map((a) => ({
			'@type': 'BlogPosting',
			headline: a.titulo,
			url: `${origem}/blog/${a.slug}`,
			datePublished: a.publicadoEm,
			dateModified: a.atualizadoEm ?? a.publicadoEm
		}))
	};
}

/**
 * JSON pronto para ir dentro de `<script type="application/ld+json">`. O `<`
 * vira `<`: um título com `</script>` fecharia a tag no meio e o resto
 * viraria HTML. Continua sendo o mesmo JSON para quem lê.
 */
export function serializarJsonLd(dados: Objeto | Objeto[]): string {
	return JSON.stringify(dados).replace(/</g, '\\u003c');
}
