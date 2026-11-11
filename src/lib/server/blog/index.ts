import { dev } from '$app/environment';
import { parse as lerYaml } from 'yaml';
import { z } from 'zod';
import { SLUGS_DOS_TEMAS, TEMAS, temaPorSlug } from '$lib/blog/temas';
import { hojeNoBrasil } from '$lib/blog/formato';
import type { Artigo, Publico, ResumoDoArtigo, TemaDoBlog } from '$lib/blog/tipos';
import { questoesDoExemplo } from '$lib/server/exemplo';
import { converterCorpo } from './markdown';

/**
 * Os artigos do blog (docs/blog.md). Markdown no repositório, em
 * `src/content/blog/<slug>.md`, lido no build pelo Vite e validado aqui: um
 * frontmatter errado derruba o `pnpm dev` e o build com o nome do arquivo, em
 * vez de publicar um artigo pela metade.
 *
 * **Sem autor** (decisão do dono em 2026-11-10): o frontmatter recusa a chave.
 * O artigo mostra a data de publicação e, quando houver, a de atualização.
 */

const ARQUIVOS = import.meta.glob('/src/content/blog/*.md', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;

const dia = z.iso.date();

export const frontmatterSchema = z
	.object({
		/** O H1. */
		titulo: z.string().min(10),
		/** O `<title>`, antes de " · Spokke" (~60 caracteres no total). */
		tituloSeo: z.string().min(10).max(52),
		descricao: z.string().min(120).max(160),
		linhaFina: z.string().min(40),
		tema: z.enum(SLUGS_DOS_TEMAS),
		publico: z.enum(['professor', 'escola', 'ambos']),
		publicadoEm: dia,
		atualizadoEm: dia.optional(),
		// A capa: um arquivo de `static/` (1200 × 630). A extensão é o que diz o
		// `og:image:type` da prévia (Metadados.svelte), por isso só as três que
		// todo robô de prévia lê. Todo artigo que vai ao ar tem uma (blog.test.ts).
		capa: z
			.object({
				src: z
					.string()
					.regex(/^\/[a-z0-9/-]+\.(?:jpg|png|webp)$/, 'capa em static/, .jpg, .png ou .webp'),
				alt: z.string().min(10)
			})
			.strict()
			.optional(),
		guiaDoTema: z.boolean().default(false),
		// O artigo do topo do índice, escolhido por quem edita. Sem nenhum, o
		// topo é o guia mais recente para professor, ou o artigo mais recente.
		destaque: z.boolean().default(false),
		rascunho: z.boolean().default(false)
	})
	.strict();

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+){1,9}$/;

/** Separa o frontmatter (entre os dois `---`) do corpo. */
function separar(fonte: string, arquivo: string): { dados: unknown; corpo: string } {
	const texto = fonte.replace(/\r\n?/g, '\n');
	const casou = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(texto);
	if (!casou) throw new Error(`blog: ${arquivo}: o arquivo começa pelo frontmatter, entre "---".`);
	return { dados: lerYaml(casou[1]!), corpo: casou[2]! };
}

function questaoExiste(id: string): boolean {
	return questoesDoExemplo([id]).length === 1;
}

export function lerArtigo(caminho: string, fonte: string): Artigo {
	const arquivo = caminho.split('/').pop() ?? caminho;
	const slug = arquivo.replace(/\.md$/, '');
	if (!SLUG.test(slug)) {
		throw new Error(
			`blog: ${arquivo}: o nome do arquivo é o slug (minúsculas, sem acento, hífen).`
		);
	}
	const { dados, corpo } = separar(fonte, arquivo);
	const lido = frontmatterSchema.safeParse(dados);
	if (!lido.success) {
		const p = lido.error.issues[0];
		throw new Error(
			`blog: ${arquivo}: frontmatter, ${p?.path.join('.') || '(raiz)'}: ${p?.message}`
		);
	}
	const fm = lido.data;
	if (fm.atualizadoEm && fm.atualizadoEm <= fm.publicadoEm) {
		throw new Error(`blog: ${arquivo}: atualizadoEm tem de ser depois de publicadoEm.`);
	}
	const tema = temaPorSlug(fm.tema)!;
	const { blocos, sumario, palavras } = converterCorpo(corpo, {
		arquivo,
		publico: fm.publico,
		questaoExiste
	});

	return {
		slug,
		titulo: fm.titulo,
		tituloSeo: fm.tituloSeo,
		descricao: fm.descricao,
		linhaFina: fm.linhaFina,
		tema: { slug: tema.slug, nome: tema.nome },
		publico: fm.publico,
		publicadoEm: fm.publicadoEm,
		atualizadoEm: fm.atualizadoEm ?? null,
		// ~200 palavras por minuto, o ritmo de quem lê para aplicar.
		minutos: Math.max(1, Math.round(palavras / 200)),
		capa: fm.capa ?? null,
		guiaDoTema: fm.guiaDoTema,
		destaque: fm.destaque,
		rascunho: fm.rascunho,
		blocos,
		sumario
	};
}

/** Mais recente primeiro; no mesmo dia, pelo título. */
function ordenar(a: Artigo, b: Artigo): number {
	return b.publicadoEm.localeCompare(a.publicadoEm) || a.titulo.localeCompare(b.titulo, 'pt-BR');
}

export function lerTodos(arquivos: Record<string, string>): Artigo[] {
	const artigos = Object.entries(arquivos)
		.map(([caminho, fonte]) => lerArtigo(caminho, fonte))
		.sort(ordenar);
	if (artigos.filter((a) => a.destaque).length > 1) {
		throw new Error('blog: mais de um artigo com `destaque: true`; o topo do índice é um só.');
	}
	const guias = new Set<string>();
	for (const a of artigos) {
		if (!a.guiaDoTema) continue;
		if (guias.has(a.tema.slug)) {
			throw new Error(`blog: o tema "${a.tema.slug}" tem dois guias principais.`);
		}
		guias.add(a.tema.slug);
	}
	return artigos;
}

let todos: Artigo[] | null = null;

export function todosOsArtigos(): Artigo[] {
	todos ??= lerTodos(ARQUIVOS);
	return todos;
}

/**
 * O que está no ar. Fora do `pnpm dev` só entra o que não é rascunho e cuja
 * data já chegou (o artigo agendado sai sozinho no dia). Em dev entra tudo,
 * para revisar o rascunho na tela de verdade antes de publicar.
 */
export function filtrarVisiveis(
	artigos: Artigo[],
	{ previa, hoje }: { previa: boolean; hoje: string }
): Artigo[] {
	return previa ? artigos : artigos.filter((a) => !a.rascunho && a.publicadoEm <= hoje);
}

export function artigosVisiveis(): Artigo[] {
	return filtrarVisiveis(todosOsArtigos(), { previa: dev, hoje: hojeNoBrasil() });
}

/** O artigo sem o corpo: o que o cartão precisa, sem levar o texto inteiro para o browser. */
export function resumo(a: ResumoDoArtigo): ResumoDoArtigo {
	return {
		slug: a.slug,
		titulo: a.titulo,
		tituloSeo: a.tituloSeo,
		descricao: a.descricao,
		linhaFina: a.linhaFina,
		tema: a.tema,
		publico: a.publico,
		publicadoEm: a.publicadoEm,
		atualizadoEm: a.atualizadoEm,
		minutos: a.minutos,
		capa: a.capa,
		guiaDoTema: a.guiaDoTema,
		destaque: a.destaque,
		rascunho: a.rascunho
	};
}

export function ehParaEscola(publico: Publico): boolean {
	return publico === 'escola' || publico === 'ambos';
}

export interface TemaComContagem {
	slug: string;
	nome: string;
	artigos: number;
}

/** Os temas que têm artigo no ar, na ordem de `TEMAS`. */
export function temasComArtigos(artigos: ResumoDoArtigo[]): TemaComContagem[] {
	return TEMAS.map((t) => ({
		slug: t.slug,
		nome: t.nome,
		artigos: artigos.filter((a) => a.tema.slug === t.slug).length
	})).filter((t) => t.artigos > 0);
}

/** Hub com menos de 3 artigos fica fora da busca (`noindex`) até ter 3: página fina não ranqueia. */
export const MINIMO_PARA_INDEXAR = 3;

export const POR_PAGINA = 12;

export interface PaginaDoIndice {
	destaque: ResumoDoArtigo | null;
	artigos: ResumoDoArtigo[];
	pagina: number;
	total: number;
	temas: TemaComContagem[];
	artigosParaEscolas: number;
}

/**
 * Uma página do índice. O destaque (o marcado com `destaque`, ou o guia mais
 * recente para professor, ou o artigo mais recente) só aparece na primeira e
 * não se repete na lista. `null` quando
 * a página não existe, inclusive quando o blog ainda não tem artigo no ar.
 */
export function paginaDoIndice(lista: Artigo[], pagina: number): PaginaDoIndice | null {
	if (lista.length === 0) return null;
	// O índice abre falando com o professor (a escola tem a faixa própria logo
	// abaixo): sem destaque escolhido, vale o guia mais recente que não é só de
	// escola, depois o artigo mais recente que não é só de escola.
	const destaque =
		lista.find((a) => a.destaque) ??
		lista.find((a) => a.guiaDoTema && a.publico !== 'escola') ??
		lista.find((a) => a.publico !== 'escola') ??
		lista[0]!;
	const resto = lista.filter((a) => a !== destaque);
	const total = Math.max(1, Math.ceil(resto.length / POR_PAGINA));
	if (!Number.isInteger(pagina) || pagina < 1 || pagina > total) return null;
	return {
		destaque: pagina === 1 ? resumo(destaque) : null,
		artigos: resto.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA).map(resumo),
		pagina,
		total,
		temas: temasComArtigos(lista),
		artigosParaEscolas: lista.filter((a) => ehParaEscola(a.publico)).length
	};
}

export interface Hub {
	tema: TemaDoBlog | null;
	guia: ResumoDoArtigo | null;
	artigos: ResumoDoArtigo[];
	indexar: boolean;
	outrosTemas: TemaComContagem[];
}

function montarHub(lista: Artigo[], doHub: Artigo[], tema: TemaDoBlog | null): Hub | null {
	if (doHub.length === 0) return null;
	const guia = doHub.find((a) => a.guiaDoTema) ?? null;
	return {
		tema,
		guia: guia ? resumo(guia) : null,
		artigos: doHub.filter((a) => a !== guia).map(resumo),
		indexar: doHub.length >= MINIMO_PARA_INDEXAR,
		outrosTemas: temasComArtigos(lista).filter((t) => t.slug !== tema?.slug)
	};
}

export function hubDoTema(lista: Artigo[], slug: string): Hub | null {
	const tema = temaPorSlug(slug);
	if (!tema) return null;
	return montarHub(
		lista,
		lista.filter((a) => a.tema.slug === slug),
		tema
	);
}

/** O hub das escolas: todo artigo para escola, venha do tema que vier. O guia é o do primeiro tema de escola que tiver um. */
export function hubDasEscolas(lista: Artigo[]): Hub | null {
	return montarHub(
		lista,
		lista.filter((a) => ehParaEscola(a.publico)),
		null
	);
}

/** "Leia também": o guia do tema (se não for este), os irmãos do tema e, faltando, os mais recentes. */
export function relacionados(artigo: Artigo, lista: Artigo[]): ResumoDoArtigo[] {
	const outros = lista.filter((a) => a.slug !== artigo.slug);
	const doTema = outros.filter((a) => a.tema.slug === artigo.tema.slug);
	const guia = doTema.find((a) => a.guiaDoTema);
	const ordem = [...(guia ? [guia] : []), ...doTema.filter((a) => a !== guia)];
	const resto = outros.filter((a) => !ordem.includes(a));
	return [...ordem, ...resto].slice(0, 3).map(resumo);
}
