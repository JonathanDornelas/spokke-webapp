import { z } from 'zod';
import { tolerantScore } from '../grading/compare';
import { tokenize } from '../language/tokenize';
import { regra, respostaNoEnunciado, textoVisivel, vazios } from '../qualidade/comparar';
import type { Problema } from '../qualidade/types';
import { promptSkills } from './skills';
import type { InteractionType, TextRuntime } from './types';

/**
 * A partir de quantas palavras uma tradução com UMA resposta aceita vira aviso.
 * Abaixo disso quase não há outro jeito de dizer ("Bom dia"), e o aviso seria
 * ruído; numa frase, uma resposta só é o que reprova o aluno que acertou
 * escrevendo diferente (kernel.md "Respostas aceitas").
 */
export const MIN_PALAVRAS_PARA_PEDIR_VARIANTES = 3;

/**
 * Digitar a resposta inteira. Toda questão aceita várias respostas válidas
 * (kernel.md "Respostas aceitas") — resposta única é a maior fonte de
 * frustração em app de idioma.
 *
 * Escrita longa por rubrica (`grading.mode === 'rubric'`) NÃO é um tipo à
 * parte: é este mesmo `type`, só que corrigido fora do kernel — pelo
 * professor, em cima da resposta, na tela da tentativa
 * (`(studio)/resultados/[activityId]/[attemptId]`). Por isso não existe campo
 * de rubrica aqui.
 */

export const typeAuthoringSchema = z.object({
	accepted: z.array(z.string().min(1)).min(1)
});

export const typeAnswerSchema = z.object({ text: z.string() });

export type TypePayload = z.infer<typeof typeAuthoringSchema>;
export type TypeAnswer = z.infer<typeof typeAnswerSchema>;

export const type: InteractionType<
	typeof typeAuthoringSchema,
	typeof typeAnswerSchema,
	TextRuntime
> = {
	id: 'type',
	authoringSchema: typeAuthoringSchema,
	answerSchema: typeAnswerSchema,

	// A UI do Player reusa o componente do cloze, que sempre lê `masked` —
	// aqui não existe lacuna, então vai vazio. Começar de um objeto vazio e
	// adicionar só o necessário é a regra do `toRuntime` (skill nova-interacao).
	toRuntime: () => ({ masked: '' }),

	grade: (payload, answer, profile) => ({
		ok: true,
		value: tolerantScore(answer.text, payload.accepted, profile)
	}),

	skills: (prompt) => [...promptSkills(prompt), 'writing'],

	conferir: (payload, ctx) => {
		// Escrita livre: o professor corrige em cima da resposta, e o que está em
		// `accepted` é referência dele, não gabarito.
		if (ctx.modo === 'rubric') return [];
		const problemas: Problema[] = [...vazios(payload.accepted, ctx.perfis)];
		for (const aceita of payload.accepted) {
			const noEnunciado = respostaNoEnunciado(aceita, ctx);
			if (noEnunciado) {
				problemas.push(noEnunciado);
				break;
			}
		}
		// "Traduza para o português" com uma resposta só: quem traduz certo com
		// outras palavras leva "quase". As outras traduções certas vêm do revisor,
		// na geração (server.md "Conferência das questões").
		const visivel = textoVisivel(ctx.prompt);
		const [principal] = payload.accepted;
		if (
			visivel &&
			principal &&
			ctx.answerLang === 'source' &&
			payload.accepted.length === 1 &&
			tokenize(principal, ctx.perfis.origem).length >= MIN_PALAVRAS_PARA_PEDIR_VARIANTES
		) {
			problemas.push(regra('resposta-unica-na-traducao', 'aviso'));
		}
		return problemas;
	}
};
