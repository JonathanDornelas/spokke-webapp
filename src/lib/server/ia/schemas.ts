import { z } from 'zod';
import { contentUnitSchemas, type ContentUnitKind } from '$lib/kernel/content/types';
import { problemaDoVocabulario } from '$lib/kernel/content/vocabulario';

/**
 * O formato que a IA DEVOLVE, por tipo de material (docs/adr-003-ia-gemini.md).
 *
 * É mais estreito que o `ContentUnit` de propósito:
 * - sem `note` — a nota é do PROFESSOR, nunca da máquina, e nunca vai ao aluno;
 * - sem `imageMediaId` — depende de upload de mídia, que não existe;
 * - sem `default` — o JSON Schema de saída estruturada não precisa adivinhar
 *   valor nenhum, e o que faltar é proposta inválida, descartada e estornada.
 *
 * Tudo o que volta é validado DE NOVO contra o schema do kernel
 * (`contentUnitSchemas`), que é o mesmo da autoria manual: proposta aceita vira
 * exatamente o mesmo `ContentUnit` que o professor teria digitado.
 */
export const PROPOSTA_SCHEMAS = {
	SentencePair: z.object({
		source: z.string().min(1).describe('a frase no idioma do aluno'),
		target: z.string().min(1).describe('a frase no idioma alvo')
	}),
	VocabItem: z.object({
		term: z.string().min(1).describe('o termo no idioma alvo'),
		translation: z.string().min(1).describe('o sentido no idioma do aluno'),
		example: z.string().min(1).optional().describe('uma frase curta de exemplo no idioma alvo')
	}),
	Passage: z.object({
		title: z.string().min(1),
		text: z.string().min(1).describe('o texto no idioma alvo'),
		questions: z
			.array(
				z.object({
					question: z.string().min(1).describe('pergunta de compreensão, no idioma alvo'),
					answer: z.string().min(1).describe('a resposta, no idioma alvo')
				})
			)
			.min(1)
			.max(6)
	}),
	Dialogue: z.object({
		lines: z
			.array(z.object({ speaker: z.string().min(1), text: z.string().min(1) }))
			.min(2)
			.max(12)
	})
} satisfies Record<ContentUnitKind, z.ZodType>;

/** O envelope da resposta: uma lista de propostas, com teto. */
export function envelopeDaResposta(kind: ContentUnitKind, quantos: number) {
	return z.object({ propostas: z.array(PROPOSTA_SCHEMAS[kind]).max(quantos) });
}

/** O JSON Schema que vai para o modelo — saído do MESMO Zod que valida a volta. */
export function jsonSchemaDaResposta(kind: ContentUnitKind, quantos: number): unknown {
	return z.toJSONSchema(envelopeDaResposta(kind, quantos), { target: 'draft-7' });
}

/**
 * Valida uma proposta contra o schema do KERNEL — a régua da autoria manual.
 * `safeParse`, nunca `parse`: proposta ruim é descartada (e estornada), não
 * exceção no meio do lote. Com as tags dos idiomas, o vocabulário passa também
 * pela regra da autoria manual: palavra ou expressão curta, nunca frase
 * (`problemaDoVocabulario`).
 */
export function validarProposta(
	kind: ContentUnitKind,
	bruta: unknown,
	tags?: { alvo: string; origem: string }
) {
	const estreita = PROPOSTA_SCHEMAS[kind].safeParse(bruta);
	if (!estreita.success) return null;
	const doKernel = contentUnitSchemas[kind].safeParse(estreita.data);
	if (!doKernel.success) return null;
	if (kind === 'VocabItem' && tags) {
		const item = doKernel.data as { term: string; translation: string };
		if (problemaDoVocabulario(item, tags)) return null;
	}
	return doKernel.data;
}
