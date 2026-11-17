import { z } from 'zod';
import { contentUnitSchemas, type ContentUnitKind } from '$lib/kernel/content/types';
import { problemaDoVocabulario } from '$lib/kernel/content/vocabulario';
import { limparVariacoes } from '$lib/atividades/variacoes';
import { languageProfiles } from '$lib/kernel/language/profiles';
import { mesmoTexto } from '$lib/kernel/qualidade/comparar';

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
/**
 * Quantas outras traduções certas a IA propõe por frase. Elas viram resposta
 * aceita na questão de tradução (`SentencePair.variants`, kernel.md "Respostas
 * aceitas"): sem elas, o aluno que traduz certo com outras palavras leva "quase".
 */
export const MAX_VARIACOES_DA_IA = 3;

export const PROPOSTA_SCHEMAS = {
	SentencePair: z.object({
		source: z.string().min(1).describe('a frase no idioma do aluno'),
		target: z.string().min(1).describe('a frase no idioma alvo'),
		// Sem `min(1)` nem teto no schema de propósito: uma variação vazia ou a mais
		// derrubaria a proposta inteira. Quem limpa é `validarProposta`.
		variants: z
			.array(z.string())
			.optional()
			.describe(
				`até ${MAX_VARIACOES_DA_IA} outras traduções igualmente certas no idioma do aluno; lista vazia se não houver`
			)
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
 * As variações de uma frase proposta, como vão ser gravadas (`limparVariacoes`, a
 * mesma régua do formulário): aparadas, sem vazias, sem repetir a tradução — e sem
 * a própria frase no idioma alvo, que como "tradução" seria a resposta copiada do
 * enunciado. Sem nenhuma, a chave não é gravada: o material fica igual ao que o
 * professor teria digitado sem variações, e o reaproveitamento continua achando.
 */
function comVariacoesLimpas(kind: ContentUnitKind, dados: unknown): unknown {
	if (kind !== 'SentencePair') return dados;
	const { variants, ...resto } = dados as z.infer<typeof PROPOSTA_SCHEMAS.SentencePair>;
	const alvo = resto.target.trim().normalize('NFC');
	const limpas = limparVariacoes(variants, resto.source)
		.filter((v) => v.normalize('NFC') !== alvo)
		.slice(0, MAX_VARIACOES_DA_IA);
	return limpas.length > 0 ? { ...resto, variants: limpas } : resto;
}

/**
 * A proposta que "traduz" repetindo o original — a frase ou o termo no idioma
 * alvo igual ao que deveria ser a tradução. É o caso da "la cometa" (kernel.md
 * "Conferência de qualidade"): toda questão que sai dali mostra a resposta. Com
 * os dois idiomas conhecidos a comparação é a do normalizador do kernel (regra nº
 * 6); sem eles (a biblioteca "sem idioma"), só a forma Unicode. Atividade de um
 * idioma só não tem o que traduzir, e fica de fora da regra.
 */
function repeteOOriginal(
	kind: ContentUnitKind,
	dados: unknown,
	tags: { alvo: string; origem: string } | undefined
): boolean {
	const d = dados as Record<string, unknown>;
	const par =
		kind === 'SentencePair'
			? [d.target, d.source]
			: kind === 'VocabItem'
				? [d.term, d.translation]
				: null;
	if (!par || typeof par[0] !== 'string' || typeof par[1] !== 'string') return false;
	const [alvo, origem] = [languageProfiles[tags?.alvo ?? ''], languageProfiles[tags?.origem ?? '']];
	if (alvo && origem) {
		return alvo.tag !== origem.tag && mesmoTexto(par[0], par[1], { alvo, origem });
	}
	return par[0].trim().normalize('NFC') === par[1].trim().normalize('NFC');
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
	const doKernel = contentUnitSchemas[kind].safeParse(comVariacoesLimpas(kind, estreita.data));
	if (!doKernel.success) return null;
	if (repeteOOriginal(kind, doKernel.data, tags)) return null;
	if (kind === 'VocabItem' && tags) {
		const item = doKernel.data as { term: string; translation: string };
		if (problemaDoVocabulario(item, tags)) return null;
	}
	return doKernel.data;
}
