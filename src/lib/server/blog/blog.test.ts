import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { serializarJsonLd } from '$lib/blog/dados-estruturados';
import { conversaoDoPublico } from '$lib/blog/links';
import { hojeNoBrasil } from '$lib/blog/formato';
import { languageLabels } from '$lib/kernel/language/profiles';
import type { Artigo } from '$lib/blog/tipos';
import {
	filtrarVisiveis,
	hubDasEscolas,
	hubDoTema,
	lerArtigo,
	lerTodos,
	paginaDoIndice,
	relacionados,
	todosOsArtigos
} from './index';
import { contarPalavras, converterCorpo } from './markdown';

const BASE = {
	titulo: 'Como montar uma atividade de teste',
	tituloSeo: 'Atividade de teste com as frases da aula',
	descricao:
		'Uma descrição de teste com tamanho suficiente para passar no mínimo de cento e vinte caracteres que a busca pede, sem passar dos cento e sessenta.',
	linhaFina: 'Uma linha fina de teste que responde a pergunta logo no topo do artigo.',
	tema: 'atividades-com-o-material-da-aula',
	publico: 'professor',
	publicadoEm: '2026-11-01'
};

function fonte(fm: Record<string, unknown>, corpo = 'Um parágrafo.\n'): string {
	const linhas = Object.entries({ ...BASE, ...fm }).map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
	return `---\n${linhas.join('\n')}\n---\n${corpo}`;
}

function artigo(slug: string, fm: Record<string, unknown> = {}, corpo?: string): Artigo {
	return lerArtigo(`/src/content/blog/${slug}.md`, fonte(fm, corpo));
}

const contexto = { arquivo: 'teste.md', publico: 'professor' as const, questaoExiste: () => true };

describe('conteúdo do repositório', () => {
	it('todo artigo em src/content/blog lê e valida', () => {
		const todos = todosOsArtigos();
		expect(todos.length).toBeGreaterThan(0);
		expect(new Set(todos.map((a) => a.slug)).size).toBe(todos.length);
	});

	it('todo artigo de professor traz pelo menos um exemplo pronto no idioma alvo', () => {
		for (const a of todosOsArtigos().filter((a) => a.publico === 'professor')) {
			expect(
				a.blocos.some((b) => b.tipo === 'exemplo'),
				a.slug
			).toBe(true);
		}
	});

	it('o sumário de cada artigo tem âncoras únicas', () => {
		for (const a of todosOsArtigos()) {
			expect(new Set(a.sumario.map((s) => s.id)).size, a.slug).toBe(a.sumario.length);
		}
	});

	it('há artigo no ar hoje: o "Blog" do menu nunca leva a uma página vazia', () => {
		const noAr = filtrarVisiveis(todosOsArtigos(), { previa: false, hoje: hojeNoBrasil() });
		expect(noAr.length).toBeGreaterThan(0);
	});

	it('todo artigo que vai ao ar tem capa, e o arquivo dela existe em static/', () => {
		for (const a of todosOsArtigos().filter((a) => !a.rascunho)) {
			expect(a.capa, a.slug).not.toBeNull();
			expect(existsSync(join('static', a.capa?.src ?? '')), a.capa?.src).toBe(true);
		}
	});

	it('cada idioma do produto tem um artigo para quem o ensina', () => {
		const idiomas = new Set(
			todosOsArtigos().flatMap((a) =>
				a.blocos.flatMap((b) => (b.tipo === 'exemplo' ? [b.idioma.split('-')[0]] : []))
			)
		);
		for (const tag of Object.values(languageLabels)) {
			expect(idiomas.has(tag.split('-')[0]), tag).toBe(true);
		}
	});
});

describe('frontmatter', () => {
	it('recusa autor: o blog não assina (decisão de 2026-11-10)', () => {
		expect(() => artigo('com-autor-aqui', { autor: 'fulana' })).toThrow(/autor|Unrecognized/i);
	});

	it('recusa descrição fora de 120 a 160 caracteres e tema que não existe', () => {
		expect(() => artigo('descricao-curta', { descricao: 'curta demais' })).toThrow(/descricao/);
		expect(() => artigo('tema-errado', { tema: 'nao-existe' })).toThrow(/tema/);
	});

	it('recusa capa fora de static/ ou num formato que a prévia não lê', () => {
		const alt = 'Uma capa de teste';
		expect(() =>
			artigo('capa-externa', { capa: { src: 'https://exemplo.com/capa.jpg', alt } })
		).toThrow(/capa/);
		expect(() => artigo('capa-em-gif', { capa: { src: '/blog/capas/capa.gif', alt } })).toThrow(
			/capa/
		);
		expect(artigo('capa-em-jpg', { capa: { src: '/blog/capas/capa.jpg', alt } }).capa?.src).toBe(
			'/blog/capas/capa.jpg'
		);
	});

	it('recusa slug com acento ou maiúscula, que é o nome do arquivo', () => {
		expect(() => artigo('Atividade-de-Escuta')).toThrow(/slug/);
	});

	it('recusa atualização que não vem depois da publicação', () => {
		expect(() => artigo('atualizado-antes', { atualizadoEm: '2026-10-01' })).toThrow(
			/atualizadoEm/
		);
	});

	it('recusa dois guias principais no mesmo tema', () => {
		const arquivos = {
			'/src/content/blog/guia-um-aqui.md': fonte({ guiaDoTema: true }),
			'/src/content/blog/guia-dois-aqui.md': fonte({ guiaDoTema: true })
		};
		expect(() => lerTodos(arquivos)).toThrow(/dois guias/);
	});

	it('recusa dois destaques: o topo do índice é um só', () => {
		const arquivos = {
			'/src/content/blog/destaque-um-aqui.md': fonte({ destaque: true }),
			'/src/content/blog/destaque-dois-aqui.md': fonte({ destaque: true })
		};
		expect(() => lerTodos(arquivos)).toThrow(/destaque/);
	});

	it('calcula o tempo de leitura do texto, com piso de 1 minuto', () => {
		expect(artigo('curto-demais').minutos).toBe(1);
		const longo = `${'palavra '.repeat(1000)}\n`;
		expect(artigo('bem-longo-aqui', {}, longo).minutos).toBe(5);
	});
});

describe('corpo em Markdown', () => {
	it('dá âncora aos H2 e monta o sumário na ordem', () => {
		const { blocos, sumario } = converterCorpo(
			'## Por que a turma trava?\n\nTexto.\n\n## Escolha as frases\n\nMais.\n',
			contexto
		);
		expect(sumario).toEqual([
			{ id: 'por-que-a-turma-trava', titulo: 'Por que a turma trava?' },
			{ id: 'escolha-as-frases', titulo: 'Escolha as frases' }
		]);
		expect(blocos[0]).toMatchObject({ tipo: 'html' });
		expect((blocos[0] as { html: string }).html).toContain('<h2 id="por-que-a-turma-trava">');
	});

	it('recusa H1 no corpo: o título do frontmatter é o único H1', () => {
		expect(() => converterCorpo('# Outro título\n', contexto)).toThrow(/H1/);
	});

	it('o exemplo pega idioma, direção e rótulo do LanguageProfile', () => {
		const { blocos } = converterCorpo(
			'```exemplo\nidioma: ar-SA\nlinhas:\n  - texto: أعيش هنا منذ سنتين.\n    traducao: Eu moro aqui há dois anos.\n```\n',
			contexto
		);
		expect(blocos[0]).toMatchObject({
			tipo: 'exemplo',
			idioma: 'ar-SA',
			direcao: 'rtl',
			codigoDoIdioma: 'AR',
			titulo: 'Frases prontas para a atividade'
		});
	});

	it('o exemplo traduz para outra língua quando o artigo pede (português para estrangeiros)', () => {
		const { blocos } = converterCorpo(
			[
				'```exemplo',
				'idioma: pt-BR',
				'traducaoEm: en-US',
				'linhas:',
				"  - texto: 'Tô cansado hoje.'",
				`    traducao: "I'm tired today."`,
				'```',
				''
			].join('\n'),
			contexto
		);
		expect(blocos[0]).toMatchObject({
			tipo: 'exemplo',
			idiomaDaTraducao: 'en-US',
			direcaoDaTraducao: 'ltr'
		});
		const padrao = converterCorpo(
			['```exemplo', 'idioma: en-US', 'linhas:', "  - texto: 'Hi'", '```', ''].join('\n'),
			contexto
		);
		expect(padrao.blocos[0]).toMatchObject({ idiomaDaTraducao: 'pt-BR' });
	});

	it('recusa exemplo em idioma sem profile e questão que não existe', () => {
		expect(() =>
			converterCorpo('```exemplo\nidioma: xx-XX\nlinhas:\n  - texto: oi\n```\n', contexto)
		).toThrow(/idioma/);
		expect(() =>
			converterCorpo('```questao\nitem: nenhuma\n```\n', {
				...contexto,
				questaoExiste: () => false
			})
		).toThrow(/nenhuma/);
	});

	it('o bloco do meio chama "Na sua escola" no artigo de escola, e entra no sumário', () => {
		const { blocos, sumario } = converterCorpo('```no-spokke\nTexto do bloco.\n```\n', {
			...contexto,
			publico: 'escola'
		});
		expect(blocos[0]).toMatchObject({ tipo: 'no-spokke', titulo: 'Na sua escola' });
		expect(sumario.map((s) => s.titulo)).toEqual(['Na sua escola']);
	});

	it('a tabela rola dentro da própria moldura e o link externo abre fora', () => {
		const { blocos } = converterCorpo(
			'| a | b |\n| - | - |\n| 1 | 2 |\n\n[fonte](https://www.coe.int/cefr) e [planos](/planos)\n',
			contexto
		);
		const html = blocos.map((b) => (b.tipo === 'html' ? b.html : '')).join('');
		expect(html).toContain('<div class="tabela"');
		expect(html).toContain(
			'href="https://www.coe.int/cefr" target="_blank" rel="noopener noreferrer"'
		);
		expect(html).toContain('<a href="/planos">');
	});

	it('conta palavras com Intl.Segmenter, não por espaço (regra nº 5)', () => {
		expect(contarPalavras('ここに住んで二年になります。')).toBeGreaterThan(1);
		expect(contarPalavras('Uma frase [com link](https://exemplo.com) aqui.')).toBe(5);
	});
});

describe('o que está no ar', () => {
	const lista = [
		artigo('rascunho-de-hoje', { rascunho: true, publicadoEm: '2026-11-10' }),
		artigo('agendado-para-depois', { publicadoEm: '2026-12-01' }),
		artigo('publicado-ontem', { publicadoEm: '2026-11-09' })
	];

	it('fora do dev, rascunho e artigo agendado não aparecem', () => {
		const visiveis = filtrarVisiveis(lista, { previa: false, hoje: '2026-11-10' });
		expect(visiveis.map((a) => a.slug)).toEqual(['publicado-ontem']);
	});

	it('em dev aparece tudo, para revisar na tela de verdade', () => {
		expect(filtrarVisiveis(lista, { previa: true, hoje: '2026-11-10' })).toHaveLength(3);
	});
});

describe('índice, hubs e sitemap', () => {
	const muitos = Array.from({ length: 26 }, (_, i) =>
		artigo(`artigo-numero-${i + 1}`, { publicadoEm: `2026-10-${String(i + 1).padStart(2, '0')}` })
	).reverse();

	it('pagina de 12 em 12, com o destaque só na primeira e fora da lista', () => {
		const p1 = paginaDoIndice(muitos, 1)!;
		expect(p1.destaque?.slug).toBe('artigo-numero-26');
		expect(p1.artigos).toHaveLength(12);
		expect(p1.artigos.some((a) => a.slug === p1.destaque?.slug)).toBe(false);
		expect(p1.total).toBe(3);
		expect(paginaDoIndice(muitos, 3)!.destaque).toBeNull();
		expect(paginaDoIndice(muitos, 4)).toBeNull();
		expect(paginaDoIndice([], 1)).toBeNull();
	});

	it('o destaque escolhido abre o índice; sem ele, o guia de professor vence o de escola', () => {
		const escola = artigo('guia-de-escola-aqui', {
			publico: 'escola',
			tema: 'gestao-da-escola',
			guiaDoTema: true
		});
		const professor = artigo('artigo-de-professor-aqui');
		const escolhido = artigo('artigo-escolhido-aqui', { destaque: true });
		expect(paginaDoIndice([escola, professor, escolhido], 1)!.destaque?.slug).toBe(
			'artigo-escolhido-aqui'
		);
		expect(paginaDoIndice([escola, professor], 1)!.destaque?.slug).toBe('artigo-de-professor-aqui');
	});

	it('hub com menos de 3 artigos fica fora da busca', () => {
		const dois = muitos.slice(0, 2);
		expect(hubDoTema(dois, 'atividades-com-o-material-da-aula')!.indexar).toBe(false);
		expect(hubDoTema(muitos, 'atividades-com-o-material-da-aula')!.indexar).toBe(true);
		expect(hubDoTema(muitos, 'speaking-e-pronuncia')).toBeNull();
	});

	it('o hub das escolas junta escola e "ambos", de qualquer tema', () => {
		const misto = [
			artigo('so-professor-aqui'),
			artigo('para-escola-aqui', { publico: 'escola', tema: 'gestao-da-escola' }),
			artigo('para-os-dois-aqui', { publico: 'ambos' })
		];
		expect(
			hubDasEscolas(misto)!
				.artigos.map((a) => a.slug)
				.sort()
		).toEqual(['para-escola-aqui', 'para-os-dois-aqui']);
	});

	it('"Leia também" traz o guia do tema primeiro e nunca o próprio artigo', () => {
		const guia = artigo('guia-do-tema-aqui', { guiaDoTema: true });
		const lista = [muitos[0]!, muitos[1]!, guia];
		const r = relacionados(muitos[0]!, lista);
		expect(r[0]!.slug).toBe('guia-do-tema-aqui');
		expect(r.some((a) => a.slug === muitos[0]!.slug)).toBe(false);
	});
});

describe('conversão e dados estruturados', () => {
	it('a conversão segue o público e leva a origem do artigo', () => {
		const escola = conversaoDoPublico('escola', 'um-artigo');
		expect(escola.primaria.href).toBe('/contato?assunto=escolas&origem=blog-um-artigo');
		const professor = conversaoDoPublico('professor', 'um-artigo');
		expect(professor.primaria.href).toBe('/cadastro?origem=blog-um-artigo');
		expect(professor.secundaria.href).toBe('/exemplo');
		expect(conversaoDoPublico('ambos').secundaria.href).toContain('assunto=escolas');
	});

	it('o JSON-LD não deixa um título fechar a tag', () => {
		const json = serializarJsonLd({ headline: 'Antes </script><b>depois' });
		expect(json).not.toContain('<');
		expect(JSON.parse(json).headline).toBe('Antes </script><b>depois');
	});
});
