import { describe, expect, it } from 'vitest';
import { redes } from '$lib/content/institucional';
import {
	artigoEstruturado,
	organizacaoEstruturada,
	serializarJsonLd,
	siteEstruturado
} from './dados-estruturados';

const ORIGEM = 'https://spokke.com.br';

/**
 * A empresa e o site, na home — o que o Google usa para o nome nos resultados, o logo e o painel
 * da marca. A regra que mais importa: a empresa da home e a autora dos artigos são a MESMA
 * entidade (o mesmo `@id`), e só perfil que existe entra em `sameAs`.
 */
describe('a empresa e o site para o Google', () => {
	it('a organização da home tem nome, site, logo quadrado de 112 px ou mais e contexto', () => {
		const org = organizacaoEstruturada(ORIGEM, 'Exercícios de idiomas.');
		expect(org).toMatchObject({
			'@context': 'https://schema.org',
			'@type': 'Organization',
			'@id': `${ORIGEM}/#organizacao`,
			name: 'Spokke',
			url: `${ORIGEM}/`,
			description: 'Exercícios de idiomas.'
		});
		const logo = org.logo as { url: string; width: number; height: number };
		expect(logo.url).toBe(`${ORIGEM}/apple-touch-icon.png`);
		expect(logo.width).toBe(logo.height);
		expect(logo.width).toBeGreaterThanOrEqual(112);
	});

	it('sameAs só com os perfis que já têm endereço', () => {
		const org = organizacaoEstruturada(ORIGEM, 'x');
		const comEndereco = redes.flatMap((r) => (r.url ? [r.url] : []));
		if (comEndereco.length === 0) expect(org).not.toHaveProperty('sameAs');
		else expect(org.sameAs).toEqual(comEndereco);
	});

	it('o site aponta para a mesma organização que assina os artigos', () => {
		const site = siteEstruturado(ORIGEM);
		expect(site).toMatchObject({ '@type': 'WebSite', name: 'Spokke', url: `${ORIGEM}/` });
		const artigo = artigoEstruturado(
			{
				titulo: 't',
				descricao: 'd',
				publicadoEm: '2026-11-10',
				tema: { nome: 'Tema' }
			} as Parameters<typeof artigoEstruturado>[0],
			{ origem: ORIGEM, url: `${ORIGEM}/blog/t`, imagem: `${ORIGEM}/c.jpg` }
		);
		const autor = artigo.author as { '@id': string };
		expect((site.publisher as { '@id': string })['@id']).toBe(autor['@id']);
	});

	it('serializa sem deixar fechar o bloco de script no meio', () => {
		expect(serializarJsonLd({ name: '</script>' })).not.toContain('</');
	});
});
