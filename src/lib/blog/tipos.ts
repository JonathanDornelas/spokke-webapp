/**
 * O blog como a tela o recebe (docs/blog.md). Isomórfico e sem lógica: quem lê
 * o Markdown, valida o frontmatter e monta estes objetos é `$lib/server/blog`.
 *
 * **Sem autor.** O artigo diz quando saiu (e quando mudou), não quem assinou:
 * decisão do dono em 2026-11-10. Os dados estruturados levam a organização como
 * autora.
 */

/** Para quem o artigo foi escrito. Decide o bloco do meio, a conversão e o hub das escolas. */
export type Publico = 'professor' | 'escola' | 'ambos';

export interface TemaDoBlog {
	slug: string;
	/** O nome curto: chip, migalha, cartão. */
	nome: string;
	/** O H1 do hub, do jeito que o professor (ou a escola) procura. */
	titulo: string;
	/** O `<title>` do hub, antes de " · Blog · Spokke". */
	tituloSeo: string;
	descricao: string;
	/** A abertura do hub, um parágrafo por item. */
	abertura: string[];
	/** O público principal do assunto: o hub de escola converte para a conversa sobre o plano. */
	publico: Publico;
}

export interface ItemDoSumario {
	id: string;
	titulo: string;
}

export interface LinhaDoExemplo {
	texto: string;
	traducao?: string;
}

export type BlocoDoArtigo =
	| { tipo: 'html'; html: string }
	| {
			tipo: 'exemplo';
			titulo: string;
			/** Tag BCP-47 de um `LanguageProfile`. */
			idioma: string;
			rotuloDoIdioma: string;
			codigoDoIdioma: string;
			direcao: 'ltr' | 'rtl';
			/** A língua da tradução embaixo de cada frase (o português, quase sempre). */
			idiomaDaTraducao: string;
			direcaoDaTraducao: 'ltr' | 'rtl';
			linhas: LinhaDoExemplo[];
	  }
	| { tipo: 'no-spokke'; id: string; titulo: string; html: string }
	| { tipo: 'questao'; itemId: string; texto: string }
	| {
			tipo: 'perguntas';
			id: string;
			titulo: string;
			perguntas: { pergunta: string; respostaHtml: string }[];
	  };

export interface Capa {
	src: string;
	alt: string;
}

/** O que o cartão, o feed e o sitemap precisam: tudo menos o corpo. */
export interface ResumoDoArtigo {
	slug: string;
	titulo: string;
	tituloSeo: string;
	descricao: string;
	linhaFina: string;
	tema: Pick<TemaDoBlog, 'slug' | 'nome'>;
	publico: Publico;
	/** AAAA-MM-DD */
	publicadoEm: string;
	atualizadoEm: string | null;
	minutos: number;
	capa: Capa | null;
	guiaDoTema: boolean;
	/** O artigo do topo do índice. No máximo um no blog inteiro. */
	destaque: boolean;
	rascunho: boolean;
}

export interface Artigo extends ResumoDoArtigo {
	blocos: BlocoDoArtigo[];
	sumario: ItemDoSumario[];
}
