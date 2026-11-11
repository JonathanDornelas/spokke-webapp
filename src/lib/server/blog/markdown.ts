import { Marked, type Token, type Tokens, type TokensList } from 'marked';
import { parse as lerYaml } from 'yaml';
import { z } from 'zod';
import { getProfile } from '$lib/kernel/language/profiles';
import { codigoDoIdioma, ehIdioma, idiomaDe } from '$lib/idiomas';
import type { BlocoDoArtigo, ItemDoSumario, Publico } from '$lib/blog/tipos';

/**
 * O corpo do artigo, de Markdown para blocos (docs/blog.md "De onde vem o
 * conteúdo"). Markdown comum vira HTML; quatro blocos cercados viram componente:
 *
 * - ```exemplo — frases prontas no idioma alvo, com "Copiar a lista" (YAML:
 *   `titulo`, `idioma` com a tag de um LanguageProfile, `traducaoEm` (a língua
 *   da tradução, português se omitida) e `linhas` com `texto` e `traducao`).
 * - ```no-spokke — o bloco "No Spokke" (ou "Na sua escola", no artigo de
 *   escola), em Markdown, com a chamada que segue o público do artigo.
 * - ```questao — a questão de exemplo da home, respondível (YAML: `item`, o id
 *   de uma questão de `$lib/server/exemplo`, e `texto`, a instrução acima dela).
 * - ```perguntas — as perguntas frequentes (YAML: lista de `pergunta` e
 *   `resposta`, a resposta em Markdown de linha).
 *
 * O conteúdo vem do repositório e é revisado como código: o HTML sai daqui sem
 * sanitizar, como o resto do texto que o próprio projeto escreve. Nada que um
 * visitante digite passa por este caminho.
 */

const BLOCOS = new Set(['exemplo', 'no-spokke', 'questao', 'perguntas']);

const exemploSchema = z
	.object({
		titulo: z.string().min(3).default('Frases prontas para a atividade'),
		idioma: z.string().refine(ehIdioma, 'idioma sem LanguageProfile (use a tag, como en-US)'),
		// A língua da tradução embaixo de cada frase. O padrão é o português; o artigo
		// de português para estrangeiros traduz para a língua do aluno (en-US).
		traducaoEm: z.string().refine(ehIdioma, 'traducaoEm sem LanguageProfile').default('pt-BR'),
		linhas: z
			.array(
				z.object({ texto: z.string().min(1), traducao: z.string().min(1).optional() }).strict()
			)
			.min(1)
	})
	.strict();

const questaoSchema = z
	.object({
		item: z.string().min(1),
		texto: z.string().min(10).default('Responda como o seu aluno e veja a correção que ele recebe.')
	})
	.strict();

const perguntasSchema = z
	.array(z.object({ pergunta: z.string().min(5), resposta: z.string().min(5) }).strict())
	.min(1);

/** "Por que a turma trava no áudio?" → "por-que-a-turma-trava-no-audio". */
export function slugDoTitulo(texto: string): string {
	return (
		texto
			.normalize('NFD')
			.replace(/\p{M}/gu, '')
			.toLowerCase()
			.replace(/[^\p{L}\p{N}]+/gu, '-')
			.replace(/^-+|-+$/g, '') || 'secao'
	);
}

function reservarId(base: string, usados: Set<string>): string {
	let id = base;
	for (let n = 2; usados.has(id); n++) id = `${base}-${n}`;
	usados.add(id);
	return id;
}

/** O texto puro de um título, sem a marcação: o que o sumário mostra. */
function textoDosTokens(tokens: Token[]): string {
	return tokens
		.map((t) => {
			if ('tokens' in t && Array.isArray(t.tokens) && t.tokens.length > 0) {
				return textoDosTokens(t.tokens);
			}
			return 'text' in t && typeof t.text === 'string' ? t.text : '';
		})
		.join('');
}

function escaparAtributo(valor: string): string {
	return valor.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function ehExterno(href: string): boolean {
	return /^https?:\/\//i.test(href) && !/^https?:\/\/(www\.)?spokke\.com\.br(\/|$)/i.test(href);
}

/**
 * Palavras do texto, para o tempo de leitura. `Intl.Segmenter`, nunca
 * `split(' ')` (regra nº 5): o artigo pode trazer frases em japonês ou chinês.
 */
export function contarPalavras(texto: string): number {
	const limpo = texto
		.replace(/```[a-z-]*\n?/g, ' ')
		.replace(/\]\([^)]*\)/g, ']')
		.replace(/<[^>]+>/g, ' ');
	let n = 0;
	for (const s of new Intl.Segmenter('pt-BR', { granularity: 'word' }).segment(limpo)) {
		if (s.isWordLike) n++;
	}
	return n;
}

export interface CorpoConvertido {
	blocos: BlocoDoArtigo[];
	sumario: ItemDoSumario[];
	palavras: number;
}

export function converterCorpo(
	corpo: string,
	{
		arquivo,
		publico,
		questaoExiste
	}: { arquivo: string; publico: Publico; questaoExiste: (id: string) => boolean }
): CorpoConvertido {
	const sumario: ItemDoSumario[] = [];
	const ids = new Set<string>();
	const falhar = (motivo: string): never => {
		throw new Error(`blog: ${arquivo}: ${motivo}`);
	};

	const marked = new Marked({
		gfm: true,
		renderer: {
			heading({ tokens, depth }: Tokens.Heading) {
				const html = this.parser.parseInline(tokens);
				if (depth === 2) {
					const titulo = textoDosTokens(tokens).trim();
					const id = reservarId(slugDoTitulo(titulo), ids);
					sumario.push({ id, titulo });
					return `<h2 id="${id}">${html}</h2>\n`;
				}
				if (depth === 3 || depth === 4) return `<h${depth}>${html}</h${depth}>\n`;
				return falhar('o corpo não leva H1 (o título do frontmatter é o H1); use ## e ###.');
			},
			link({ href, title, tokens }: Tokens.Link) {
				const texto = this.parser.parseInline(tokens);
				const titulo = title ? ` title="${escaparAtributo(title)}"` : '';
				const fora = ehExterno(href) ? ' target="_blank" rel="noopener noreferrer"' : '';
				return `<a href="${escaparAtributo(href)}"${titulo}${fora}>${texto}</a>`;
			}
		}
	});

	const tokens = marked.lexer(corpo);
	const blocos: BlocoDoArtigo[] = [];
	let grupo: Token[] = [];

	const renderizar = (lista: Token[]): string => {
		const comLinks = Object.assign([...lista], { links: tokens.links }) as TokensList;
		return (
			marked
				.parser(comLinks)
				// A tabela rola de lado dentro de si mesma, nunca a página inteira.
				.replaceAll(
					'<table>',
					'<div class="tabela" role="region" aria-label="Tabela" tabindex="0"><table>'
				)
				.replaceAll('</table>', '</table></div>')
		);
	};
	const fecharGrupo = () => {
		if (grupo.length === 0) return;
		const html = renderizar(grupo).trim();
		if (html) blocos.push({ tipo: 'html', html });
		grupo = [];
	};
	const yaml = (texto: string, tipo: string): unknown => {
		try {
			return lerYaml(texto);
		} catch (e) {
			return falhar(`o bloco ${tipo} não é YAML válido (${(e as Error).message})`);
		}
	};
	const validar = <T>(schema: z.ZodType<T>, valor: unknown, tipo: string): T => {
		const lido = schema.safeParse(valor);
		if (!lido.success) {
			const problema = lido.error.issues[0];
			return falhar(`bloco ${tipo}: ${problema?.path.join('.') || '(raiz)'} ${problema?.message}`);
		}
		return lido.data;
	};

	for (const token of tokens) {
		const tipo = token.type === 'code' ? (token as Tokens.Code).lang?.trim() : undefined;
		if (!tipo || !BLOCOS.has(tipo)) {
			grupo.push(token);
			continue;
		}
		fecharGrupo();
		const texto = (token as Tokens.Code).text;

		if (tipo === 'exemplo') {
			const e = validar(exemploSchema, yaml(texto, tipo), tipo);
			blocos.push({
				tipo: 'exemplo',
				titulo: e.titulo,
				idioma: e.idioma,
				rotuloDoIdioma: idiomaDe(e.idioma)?.rotulo ?? e.idioma,
				codigoDoIdioma: codigoDoIdioma(e.idioma),
				direcao: getProfile(e.idioma).direction,
				idiomaDaTraducao: e.traducaoEm,
				direcaoDaTraducao: getProfile(e.traducaoEm).direction,
				linhas: e.linhas
			});
		} else if (tipo === 'no-spokke') {
			const titulo = publico === 'escola' ? 'Na sua escola' : 'No Spokke';
			const id = reservarId(slugDoTitulo(titulo), ids);
			sumario.push({ id, titulo });
			blocos.push({ tipo: 'no-spokke', id, titulo, html: renderizar(marked.lexer(texto)).trim() });
		} else if (tipo === 'questao') {
			const q = validar(questaoSchema, yaml(texto, tipo), tipo);
			if (!questaoExiste(q.item))
				falhar(`a questão "${q.item}" não existe em $lib/server/exemplo.`);
			blocos.push({ tipo: 'questao', itemId: q.item, texto: q.texto });
		} else {
			const lista = validar(perguntasSchema, yaml(texto, tipo), tipo);
			const titulo = 'Perguntas frequentes';
			const id = reservarId(slugDoTitulo(titulo), ids);
			sumario.push({ id, titulo });
			blocos.push({
				tipo: 'perguntas',
				id,
				titulo,
				perguntas: lista.map((p) => ({
					pergunta: p.pergunta,
					respostaHtml: marked.parseInline(p.resposta, { async: false })
				}))
			});
		}
	}
	fecharGrupo();

	return { blocos, sumario, palavras: contarPalavras(corpo) };
}
