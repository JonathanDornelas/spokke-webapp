import { z } from 'zod';
import type { GradingMode, InteractionKind, Prompt } from './interactions/types';

/**
 * Forma do Item — ver .claude/rules/kernel.md "Forma do Item". `payload` é
 * validado pelo `authoringSchema` da interação correspondente, nunca lido
 * cru: contém gabarito e só existe no servidor.
 */
export interface Item {
	id: string;
	sourceContentId: string | null;
	generatedBy: string | null;
	prompt: Prompt;
	interaction: { type: InteractionKind; payload: unknown };
	/** `answerLang` diz em qual das duas línguas o aluno responde — ver `gradingSchema`. */
	grading: { mode: GradingMode; tolerance?: number; answerLang?: 'source' | 'target' };
	locale: { source: string; target: string };
}

/**
 * As colunas `prompt`, `interaction`, `grading` e `locale` são `Json` no
 * Postgres — o tipo do Prisma não garante nada (db.md "JSON no Postgres").
 * Toda leitura passa por estes schemas.
 */

export const mostraDoDialogoSchema = z.enum(['ambos', 'audio', 'texto']);

/** O contexto do `composite` (`ContextoDoPrompt`): o trecho, ou as falas do diálogo. */
export const contextoDoPromptSchema = z.discriminatedUnion('tipo', [
	z.object({ tipo: z.literal('texto'), texto: z.string().min(1) }),
	z.object({
		tipo: z.literal('dialogo'),
		falas: z.array(z.object({ falante: z.string().min(1), texto: z.string().min(1) })).min(2),
		ate: z.number().int().min(1).optional(),
		mostra: mostraDoDialogoSchema.default('ambos')
	})
]);

export const promptSchema = z.object({
	kind: z.enum(['text', 'audio', 'image', 'composite']),
	text: z.string().optional(),
	mediaId: z.string().optional(),
	instructionKey: z.string().optional(),
	contexto: contextoDoPromptSchema.optional(),
	/**
	 * Enunciado escrito pelo professor no editor de item, quando ele não
	 * quer o texto padrão da `instructionKey`. Fica aqui e não no kernel de
	 * copy porque é conteúdo dele, não string de interface — e por isso pode
	 * estar em qualquer idioma.
	 */
	instruction: z.string().optional()
});

export const interactionKindSchema = z.enum([
	'choice',
	'assemble',
	'type',
	'cloze',
	'match',
	'order',
	'select',
	'speak'
]);

export const interactionSchema = z.object({
	type: interactionKindSchema,
	payload: z.unknown()
});

export const gradingSchema = z.object({
	mode: z.enum(['exact', 'tolerant', 'sequence', 'set', 'asr', 'rubric']),
	tolerance: z.number().optional(),
	/**
	 * Em qual das duas línguas do item o ALUNO responde.
	 *
	 * Quase sempre é a alvo — é ela que ele está aprendendo. Mas
	 * `translate-type` mostra a frase em inglês e espera a tradução em
	 * português: ali a resposta é `source`, e corrigi-la com o profile do
	 * inglês normalizava com as regras erradas (o acento de "você" sumia por
	 * uma regra que é do inglês) e tokenizava com o segmentador errado — o que
	 * em japonês ou chinês devolve lixo.
	 *
	 * `target` por padrão para todo item que já existe no banco sem o campo.
	 */
	answerLang: z.enum(['source', 'target']).default('target')
});

export const localeSchema = z.object({ source: z.string(), target: z.string() });
