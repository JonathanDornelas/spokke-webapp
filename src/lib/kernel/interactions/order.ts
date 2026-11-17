import { z } from 'zod';
import { sequenceScore } from '../grading/compare';
import { assignRuntimeIds } from '../random';
import { regra, repetidos, vazios } from '../qualidade/comparar';
import { promptSkills } from './skills';
import type { InteractionType, OrderRuntime } from './types';

/**
 * Ordenar linhas (tipicamente as falas de um diálogo). `lines` chega na
 * ordem CERTA — ela é o gabarito, então o id não pode sair dela: se `ln0`
 * fosse sempre a primeira fala, bastava ordenar os ids pra resolver o
 * exercício. Por isso o id vem do embaralhamento pela seed, igual em
 * `assemble` e `match`.
 */

export const orderAuthoringSchema = z.object({
	lines: z.array(z.string().min(1)).min(2)
});

export const orderAnswerSchema = z.object({ sequence: z.array(z.string()) });

export type OrderPayload = z.infer<typeof orderAuthoringSchema>;
export type OrderAnswer = z.infer<typeof orderAnswerSchema>;

function shuffledLines(payload: OrderPayload, seed: string) {
	const indexed = payload.lines.map((text, originalIndex) => ({ text, originalIndex }));
	return assignRuntimeIds(indexed, seed, 'ln');
}

export const order: InteractionType<
	typeof orderAuthoringSchema,
	typeof orderAnswerSchema,
	OrderRuntime
> = {
	id: 'order',
	authoringSchema: orderAuthoringSchema,
	answerSchema: orderAnswerSchema,

	toRuntime: (payload, seed) => ({
		lines: shuffledLines(payload, seed).map((l) => ({ id: l.id, text: l.text.text }))
	}),

	grade: (payload, answer, _profile, seed) => {
		const byId = new Map(shuffledLines(payload, seed).map((l) => [l.id, l.text.originalIndex]));

		const positions: number[] = [];
		const rotulos: string[] = [];
		for (const id of answer.sequence) {
			const index = byId.get(id);
			if (index === undefined) return { ok: false, error: `id de linha desconhecido: ${id}` };
			positions.push(index);
			rotulos.push(payload.lines[index] ?? '');
		}

		const correct = payload.lines.map((_line, i) => i);
		return {
			ok: true,
			value: sequenceScore(positions, [correct], rotulos, payload.lines)
		};
	},

	skills: promptSkills,

	// A correção é pela POSIÇÃO de origem: com duas falas iguais ("Obrigado."),
	// trocar uma pela outra é a mesma ordem para o aluno e um erro para a nota.
	conferir: (payload, ctx) => [
		...vazios(payload.lines, ctx.perfis),
		...repetidos(payload.lines, ctx.perfis).map((texto) => regra('falas-repetidas', 'erro', texto))
	]
};
