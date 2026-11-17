import { z } from 'zod';
import { mesmoTexto, regra, respostaNoEnunciado } from '../qualidade/comparar';
import type { Problema } from '../qualidade/types';
import { promptSkills } from './skills';
import type { InteractionType, SelectRuntime } from './types';

/**
 * Selecionar um trecho dentro do texto. Os segmentos NÃO são embaralhados —
 * eles formam o texto corrido que o aluno lê; embaralhar destruiria a frase.
 * O que não pode vazar é qual dos trechos selecionáveis é o certo.
 */

export const selectAuthoringSchema = z
	.object({
		segments: z.array(z.object({ text: z.string().min(1), selectable: z.boolean() })).min(1),
		correctIndex: z.number().int().min(0)
	})
	.refine((v) => v.segments[v.correctIndex]?.selectable === true, {
		message: 'correctIndex precisa apontar para um segmento selecionável'
	});

export const selectAnswerSchema = z.object({ segmentId: z.string() });

export type SelectPayload = z.infer<typeof selectAuthoringSchema>;
export type SelectAnswer = z.infer<typeof selectAnswerSchema>;

export const select: InteractionType<
	typeof selectAuthoringSchema,
	typeof selectAnswerSchema,
	SelectRuntime
> = {
	id: 'select',
	authoringSchema: selectAuthoringSchema,
	answerSchema: selectAnswerSchema,

	// O id é a posição no texto, e isso é público: o aluno vê a ordem das
	// palavras de qualquer forma. O gabarito é `correctIndex`, que fica fora.
	toRuntime: (payload) => ({
		segments: payload.segments.map((s, i) => ({
			id: `seg${i}`,
			text: s.text,
			selectable: s.selectable
		}))
	}),

	grade: (payload, answer) => {
		const match = /^seg(\d+)$/.exec(answer.segmentId);
		if (!match) return { ok: false, error: 'segmentId inválido' };
		const index = Number(match[1]);
		const segment = payload.segments[index];
		if (!segment) return { ok: false, error: 'segmentId fora do intervalo' };
		if (!segment.selectable) return { ok: false, error: 'segmento não é selecionável' };
		return { ok: true, value: { value: index === payload.correctIndex ? 1 : 0 } };
	},

	skills: promptSkills,

	conferir: (payload, ctx) => {
		const certa = payload.segments[payload.correctIndex]?.text;
		if (!certa) return [];
		const problemas: Problema[] = [];
		// A correção é pela POSIÇÃO: com a palavra duas vezes na frase, quem toca a
		// outra leva errado por ter acertado.
		const repetida = payload.segments.some(
			(s, i) => i !== payload.correctIndex && s.selectable && mesmoTexto(s.text, certa, ctx.perfis)
		);
		if (repetida) problemas.push(regra('palavra-certa-repetida', 'erro', certa));
		// A pista que É a palavra: o aluno toca a igual, sem ler a frase.
		const naPista = respostaNoEnunciado(certa, ctx);
		if (naPista) problemas.push(naPista);
		return problemas;
	}
};
