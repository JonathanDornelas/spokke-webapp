import type { ZodType } from 'zod';
import type {
	InteractionKind,
	InteractionRuntime,
	InteractionType,
	RegisteredInteraction
} from './types';
import { choice } from './choice';
import { assemble } from './assemble';
import { type } from './type';
import { cloze } from './cloze';
import { match } from './match';
import { order } from './order';
import { select } from './select';
import { speak } from './speak';

/**
 * Embrulha uma interação tipada na forma do registry: valida o `unknown` que
 * vem da coluna Json antes de entregar à implementação. Um lugar só faz esse
 * `parse`, então nenhuma remote function precisa lembrar de fazer.
 */
function register<A extends ZodType, S extends ZodType, R extends InteractionRuntime>(
	interaction: InteractionType<A, S, R>
): RegisteredInteraction {
	return {
		id: interaction.id,
		authoringSchema: interaction.authoringSchema,
		answerSchema: interaction.answerSchema,
		toRuntime: (payload, seed) =>
			interaction.toRuntime(interaction.authoringSchema.parse(payload), seed),
		grade: (payload, answer, profile, seed) =>
			interaction.grade(
				interaction.authoringSchema.parse(payload),
				interaction.answerSchema.parse(answer),
				profile,
				seed
			),
		skills: interaction.skills,
		conferir: (payload, ctx) => {
			const lido = interaction.authoringSchema.safeParse(payload);
			if (!lido.success) return [{ codigo: 'formato-invalido', gravidade: 'erro' }];
			return interaction.conferir(lido.data, ctx);
		}
	};
}

/**
 * Tipo novo de exercício = entrada nova aqui, nunca migration — ver
 * .claude/rules/kernel.md. Oito interações vezes quatro prompts cobrem tudo
 * que o produto precisa; não existe enum `tipoDeExercicio` em lugar nenhum.
 */
export const interactionRegistry: Record<InteractionKind, RegisteredInteraction> = {
	choice: register(choice),
	assemble: register(assemble),
	type: register(type),
	cloze: register(cloze),
	match: register(match),
	order: register(order),
	select: register(select),
	speak: register(speak)
};

export function getInteraction(kind: InteractionKind): RegisteredInteraction {
	return interactionRegistry[kind];
}
