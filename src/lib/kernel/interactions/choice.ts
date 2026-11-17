import { z } from 'zod';
import { assignRuntimeIds } from '../random';
import { mesmoTexto, regra, repetidos, respostaNoEnunciado, vazios } from '../qualidade/comparar';
import type { Problema } from '../qualidade/types';
import { promptSkills } from './skills';
import type { ChoiceRuntime, InteractionType } from './types';

/**
 * Escolha múltipla. `options` contém a certa mais os distratores — o
 * gerador é quem decide de onde vêm os distratores (kernel.md "Distratores");
 * esta interação só sabe embaralhar e conferir qual id é o certo.
 */

export const choiceAuthoringSchema = z
	.object({
		options: z.array(z.string().min(1)).min(2),
		correctIndex: z.number().int().min(0)
	})
	.refine((v) => v.correctIndex < v.options.length, {
		message: 'correctIndex precisa apontar para um item de options'
	});

export const choiceAnswerSchema = z.object({ optionId: z.string() });

export type ChoicePayload = z.infer<typeof choiceAuthoringSchema>;
export type ChoiceAnswer = z.infer<typeof choiceAnswerSchema>;

export const choice: InteractionType<
	typeof choiceAuthoringSchema,
	typeof choiceAnswerSchema,
	ChoiceRuntime
> = {
	id: 'choice',
	authoringSchema: choiceAuthoringSchema,
	answerSchema: choiceAnswerSchema,

	toRuntime: (payload, seed) => ({
		options: assignRuntimeIds(payload.options, seed, 'opt').map((o) => ({ id: o.id, text: o.text }))
	}),

	grade: (payload, answer, _profile, seed) => {
		// Indexado (não por texto): duas opções com o mesmo texto por acaso não
		// podem fazer a resposta errada passar por certa.
		const indexed = payload.options.map((text, i) => ({ text, originalIndex: i }));
		const chosen = assignRuntimeIds(indexed, seed, 'opt').find((o) => o.id === answer.optionId);
		if (!chosen) return { ok: false, error: 'optionId desconhecido' };
		return {
			ok: true,
			value: { value: chosen.text.originalIndex === payload.correctIndex ? 1 : 0 }
		};
	},

	skills: promptSkills,

	conferir: (payload, ctx) => {
		const problemas: Problema[] = [...vazios(payload.options, ctx.perfis)];
		// A correção é pelo ÍNDICE: com duas alternativas iguais, quem escolhe a
		// "outra" leva errado por ter acertado.
		for (const texto of repetidos(payload.options, ctx.perfis)) {
			problemas.push(regra('alternativas-repetidas', 'erro', texto));
		}
		const certa = payload.options[payload.correctIndex];
		if (certa === undefined) return problemas;
		const noEnunciado = respostaNoEnunciado(certa, ctx);
		if (noEnunciado) problemas.push(noEnunciado);
		// "Ouça e escolha o SENTIDO": a resposta é na língua do aluno, e uma
		// alternativa certa igual ao que se ouve é a palavra que não foi traduzida.
		// Em "ouça e escolha o que ouviu" (resposta no idioma alvo) ser igual ao
		// áudio é a própria questão.
		const ouvido = ctx.prompt.kind === 'audio' ? ctx.prompt.text?.trim() : undefined;
		if (ouvido && ctx.answerLang === 'source' && mesmoTexto(certa, ouvido, ctx.perfis)) {
			problemas.push(regra('resposta-igual-ao-enunciado', 'erro', certa));
		}
		return problemas;
	}
};
