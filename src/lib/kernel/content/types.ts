import { z } from 'zod';

/**
 * As quatro formas de `ContentUnit` — kernel.md "Nível 1 — ContentUnit (o
 * input real)". É o que o professor realmente digita; os itens saem daqui
 * via gerador (kernel/generators), nunca escritos um a um.
 */

export const sentencePairSchema = z.object({
	source: z.string().min(1), // frase no idioma do aluno
	target: z.string().min(1), // frase no idioma alvo
	note: z.string().optional(),
	/**
	 * Outras formas CERTAS de traduzir a frase, na língua do aluno: as que o
	 * tradutor sugeriu enquanto o professor digitava, e as que ele acrescentou.
	 * Viram resposta aceita na questão de tradução (`translate-type`).
	 */
	variants: z.array(z.string().min(1)).optional()
});
export type SentencePair = z.infer<typeof sentencePairSchema>;

export const vocabItemSchema = z.object({
	term: z.string().min(1), // termo no idioma alvo
	translation: z.string().min(1),
	imageMediaId: z.string().optional(),
	example: z.string().optional()
});
export type VocabItem = z.infer<typeof vocabItemSchema>;

export const passageSchema = z.object({
	title: z.string().min(1),
	text: z.string().min(1), // texto no idioma alvo
	questions: z
		.array(z.object({ question: z.string().min(1), answer: z.string().min(1) }))
		.default([])
});
export type Passage = z.infer<typeof passageSchema>;

export const dialogueLineSchema = z.object({
	speaker: z.string().min(1),
	text: z.string().min(1)
});
export const dialogueSchema = z.object({
	// Ordem importa — regra do gerador `order-lines`. Mínimo 2 falas para
	// existir diálogo de verdade.
	lines: z.array(dialogueLineSchema).min(2),
	/**
	 * Perguntas sobre o diálogo, escritas pelo PROFESSOR (como as do texto):
	 * `dialogue-comprehension` as transforma em questões. Sem elas, o diálogo
	 * segue rendendo o ordenar e a "próxima fala".
	 */
	questions: z
		.array(z.object({ question: z.string().min(1), answer: z.string().min(1) }))
		.default([])
});
export type Dialogue = z.infer<typeof dialogueSchema>;

export const contentUnitKinds = ['SentencePair', 'VocabItem', 'Passage', 'Dialogue'] as const;
export type ContentUnitKind = (typeof contentUnitKinds)[number];

export const contentUnitSchemas = {
	SentencePair: sentencePairSchema,
	VocabItem: vocabItemSchema,
	Passage: passageSchema,
	Dialogue: dialogueSchema
} satisfies Record<ContentUnitKind, z.ZodType>;

export type ContentUnitData<K extends ContentUnitKind> = z.infer<(typeof contentUnitSchemas)[K]>;
