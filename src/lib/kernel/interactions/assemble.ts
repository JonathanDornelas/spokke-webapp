import { z } from 'zod';
import { normalize } from '../language/normalize';
import { tokenize } from '../language/tokenize';
import { sequenceScore } from '../grading/compare';
import { assignRuntimeIds } from '../random';
import { perfilDaResposta, regra, textoVisivel } from '../qualidade/comparar';
import type { Problema } from '../qualidade/types';
import { promptSkills } from './skills';
import type { AssembleRuntime, InteractionType } from './types';

/**
 * Montar frase a partir de tokens. `tokens` é a frase certa na ordem certa;
 * `distractors` sempre vem de OUTRAS frases do mesmo lote de conteúdo, nunca
 * de dicionário (kernel.md "Distratores"). `accepted` guarda a sequência
 * principal mais variantes de ordem que também valem.
 */

export const assembleAuthoringSchema = z.object({
	tokens: z.array(z.string().min(1)).min(1),
	distractors: z.array(z.string().min(1)).default([]),
	accepted: z.array(z.array(z.string().min(1))).min(1),
	translation: z.string().optional() // legenda de apoio mostrada ao lado — não é gabarito
});

export const assembleAnswerSchema = z.object({ sequence: z.array(z.string()) });

export type AssemblePayload = z.infer<typeof assembleAuthoringSchema>;
export type AssembleAnswer = z.infer<typeof assembleAnswerSchema>;

// Token e distrator entram no MESMO sorteio antes de ganhar id: se o id
// viesse da ordem de autoria, o intervalo dele já diria quais tokens são os
// verdadeiros.
function bank(payload: AssemblePayload, seed: string) {
	return assignRuntimeIds([...payload.tokens, ...payload.distractors], seed, 'tk');
}

export const assemble: InteractionType<
	typeof assembleAuthoringSchema,
	typeof assembleAnswerSchema,
	AssembleRuntime
> = {
	id: 'assemble',
	authoringSchema: assembleAuthoringSchema,
	answerSchema: assembleAnswerSchema,

	toRuntime: (payload, seed) => ({
		tokens: bank(payload, seed).map((t) => ({ id: t.id, text: t.text })),
		translation: payload.translation
	}),

	grade: (payload, answer, profile, seed) => {
		const byId = new Map(bank(payload, seed).map((t) => [t.id, t.text]));

		const words: string[] = [];
		// Os rótulos ficam no texto ORIGINAL: é o que o aluno tem na tela. As
		// palavras normalizadas servem só para comparar (regra inviolável nº 6).
		const rotulos: string[] = [];
		for (const id of answer.sequence) {
			const text = byId.get(id);
			if (text === undefined) return { ok: false, error: `id de token desconhecido: ${id}` };
			words.push(normalize(text, profile));
			rotulos.push(text);
		}

		const accepted = payload.accepted.map((seq) => seq.map((w) => normalize(w, profile)));
		// Com os rótulos, a correção volta MARCADA: a tela grifa a palavra fora
		// de lugar dentro da frase que ele montou, em vez de contar posições. E
		// com o esperado, ela mostra logo abaixo como a frase deveria ficar — a
		// principal das `accepted`, que é a que o professor escreveu.
		return {
			ok: true,
			value: sequenceScore(words, accepted, rotulos, payload.accepted[0])
		};
	},

	skills: promptSkills,

	conferir: (payload, ctx) => {
		// A régua é a da CORREÇÃO: o `grade` normaliza com o perfil da resposta.
		const perfil = perfilDaResposta(ctx);
		const chave = (texto: string) => normalize(texto, perfil);
		const problemas: Problema[] = [];
		if (payload.tokens.length < 2) problemas.push(regra('uma-peca-so', 'aviso'));

		// Cada sequência aceita tem de caber no banco, contando repetição: "the" duas
		// vezes na frase pede duas peças "the".
		const banco = new Map<string, number>();
		for (const peca of [...payload.tokens, ...payload.distractors]) {
			banco.set(chave(peca), (banco.get(chave(peca)) ?? 0) + 1);
		}
		const faltando = new Set<string>();
		for (const sequencia of payload.accepted) {
			const usadas = new Map<string, number>();
			for (const peca of sequencia) {
				const k = chave(peca);
				usadas.set(k, (usadas.get(k) ?? 0) + 1);
				if ((usadas.get(k) ?? 0) > (banco.get(k) ?? 0)) faltando.add(peca);
			}
		}
		for (const peca of faltando) problemas.push(regra('peca-faltando', 'erro', peca));

		// A frase a montar escrita no enunciado: comparada palavra a palavra, pelo
		// segmentador (regra nº 5) — juntar as peças com espaço quebraria o japonês.
		const visivel = textoVisivel(ctx.prompt);
		const principal = payload.accepted[0];
		if (visivel && principal) {
			const doEnunciado = tokenize(visivel, perfil).map(chave);
			const daResposta = principal.map(chave).filter(Boolean);
			if (
				daResposta.length > 0 &&
				doEnunciado.length === daResposta.length &&
				doEnunciado.every((k, i) => k === daResposta[i])
			) {
				problemas.push(regra('resposta-igual-ao-enunciado', 'erro', visivel));
			}
		}
		return problemas;
	}
};
