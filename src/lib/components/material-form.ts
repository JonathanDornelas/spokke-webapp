import type { ContentUnitKind } from '$lib/kernel/content/types';

/**
 * O vocabulário que a biblioteca e a etapa 2 do wizard compartilham: os
 * quatro tipos de material COMO A TELA OS CHAMA, e a forma da linha que as
 * duas listas mostram. Mora fora do `.svelte` porque dois loaders e duas
 * páginas montam a mesma linha — e um tipo declarado duas vezes diverge no
 * primeiro campo novo.
 */

export type MaterialKind = 'pair' | 'vocab' | 'text' | 'dialogue';

export interface Pergunta {
	question: string;
	answer: string;
}
export interface Fala {
	speaker: string;
	text: string;
}

/**
 * Uma linha de material, como as duas listas a mostram. `primary` e
 * `secondary` são o RESUMO (o texto vem cortado, o diálogo vira contagem);
 * os campos crus embaixo existem para "Editar" reabrir o formulário
 * preenchido campo a campo, sem perder conteúdo.
 */
export interface MaterialRow {
	id: string;
	kind: MaterialKind;
	primary: string;
	secondary: string;
	/** Em quantas atividades ele está. */
	usedIn: number;
	/** A tag de idioma do material (`$lib/idiomas.ts`); nula = sem idioma. */
	idioma?: string | null;
	/** Wizard: está em mais de uma atividade, ou seja, veio da biblioteca. */
	daBiblioteca?: boolean;
	/** Biblioteca: arquivado (fora da biblioteca e do limite do plano; `ContentUnit.archivedAt`). */
	arquivado?: boolean;
	target: string;
	source: string;
	raw: string;
	note: string;
	example: string;
	questions: Pergunta[];
	lines: Fala[];
	/** Par de frases: as outras formas certas de traduzir (viram resposta aceita). */
	variants?: string[];
}

export const KIND_TO_KERNEL: Record<MaterialKind, ContentUnitKind> = {
	pair: 'SentencePair',
	vocab: 'VocabItem',
	text: 'Passage',
	dialogue: 'Dialogue'
};
export const KERNEL_TO_KIND: Record<ContentUnitKind, MaterialKind> = {
	SentencePair: 'pair',
	VocabItem: 'vocab',
	Passage: 'text',
	Dialogue: 'dialogue'
};

export interface TipoDeMaterial {
	id: MaterialKind;
	label: string;
	/** A explicação de um parágrafo, no `title` do cartão. */
	title: string;
	/** Traço do ícone, na grade de 24px (design-system.md "Ícones"). */
	icon: string;
	/**
	 * A cor da etiqueta: uma por tipo, das cores de etiqueta do produto
	 * (`$lib/etiquetas.ts`) menos o azul — o azul é a marca, e uma etiqueta azul
	 * leria como botão ou seleção.
	 */
	tone: 'teal' | 'violeta' | 'magenta' | 'ardosia';
}

/** Os quatro tipos de material, na ordem dos cartões do formulário. */
export const TIPOS: readonly TipoDeMaterial[] = [
	{
		id: 'pair',
		label: 'Sentença',
		title:
			'Uma frase no idioma alvo com a tradução. Rende três exercícios sem áudio — e mais quatro com escuta e fala.',
		icon: 'M4 8.5h11M4 8.5l3-3M4 8.5l3 3M20 15.5H9M20 15.5l-3-3M20 15.5l-3 3',
		tone: 'teal'
	},
	{
		id: 'vocab',
		label: 'Vocabulário',
		title: 'Termo e sentido. A alternativa errada sai de outro termo seu.',
		icon: 'M4 6.5h7v11H4zM13 6.5h7v11h-7z',
		tone: 'violeta'
	},
	{
		id: 'text',
		label: 'Texto',
		title: 'Texto corrido com perguntas de compreensão. Sem pergunta, nada é gerado.',
		icon: 'M5 5.5h14M5 10h14M5 14.5h9M5 19h6',
		tone: 'magenta'
	},
	{
		id: 'dialogue',
		label: 'Diálogo',
		title: 'Falas em sequência, no mínimo duas. Vira um exercício de ordenar.',
		icon: 'M3.5 6.5a2 2 0 012-2h9a2 2 0 012 2v4a2 2 0 01-2 2h-6l-4 3zM18.5 10.5h1a2 2 0 012 2v4a2 2 0 01-2 2h-1l-3 2.5V19h-3',
		tone: 'ardosia'
	}
];

export const tipoDe = (kind: MaterialKind): TipoDeMaterial =>
	TIPOS.find((t) => t.id === kind) ?? TIPOS[0];

/**
 * Classes da etiqueta de tipo, inteiras e literais — Tailwind só gera o que lê
 * no fonte. O texto de cada uma é uma cor DIFERENTE (o magenta de etiqueta de
 * turma tem o texto violeta; aqui ele ganha o próprio, para não virar um
 * segundo violeta ao lado do vocabulário). Verde, âmbar e vermelho ficam fora:
 * são a correção.
 */
export const PILL_TONE: Record<TipoDeMaterial['tone'], string> = {
	teal: 'bg-accent/14 text-accent',
	violeta: 'bg-violeta/14 text-violeta',
	magenta:
		'bg-[color-mix(in_oklab,var(--color-violeta)_12%,var(--color-error)_10%)] text-[color-mix(in_oklab,var(--color-violeta)_55%,var(--color-error))]',
	ardosia: 'border border-line bg-base-200 text-base-content/70'
};

export const FALAS_INICIAIS: readonly Fala[] = [
	{ speaker: 'A', text: '' },
	{ speaker: 'B', text: '' }
];
