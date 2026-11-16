import type { Passage } from '../content/types';
import type { Item } from '../item';
import { distractorPhrases } from './distractors';
import type { Generator } from './types';

/**
 * `Passage` — kernel.md lista `passage-cloze`, `passage-comprehension` e
 * `select-in-text`. Este arquivo implementa `passage-comprehension`; os
 * outros dois estão em "O que falta" de paginas.md.
 *
 * As perguntas de compreensão são opcionais no `ContentUnit`: sem elas, este
 * gerador devolve zero itens em vez de inventar pergunta.
 */
export const passageComprehension: Generator<Passage> = {
	id: 'passage-comprehension',
	generate: (content, ctx) => {
		const allAnswers = ctx.siblings.flatMap((s) => s.data.questions.map((q) => q.answer));

		return content.data.questions.flatMap((question, i) => {
			const distractors = distractorPhrases(
				[...allAnswers, ...content.data.questions.map((q) => q.answer)],
				question.answer,
				3,
				ctx.targetProfile,
				`${ctx.seed}:${content.id}:passage-comprehension:${i}`
			);
			if (distractors.length < 1) return [];

			const item: Item = {
				id: `${content.id}:passage-comprehension:${i}`,
				sourceContentId: content.id,
				generatedBy: 'passage-comprehension',
				// O TRECHO vai junto, no contexto. Antes ia só a pergunta, e o aluno
				// recebia "Responda sobre o texto." sem texto nenhum na tela.
				prompt: {
					kind: 'composite',
					text: question.question,
					instructionKey: 'answer-about-passage',
					contexto: { tipo: 'texto', texto: content.data.text }
				},
				interaction: {
					type: 'choice',
					payload: { options: [question.answer, ...distractors], correctIndex: 0 }
				},
				grading: { mode: 'exact' },
				locale: { source: ctx.sourceProfile.tag, target: ctx.targetProfile.tag }
			};
			return [item];
		});
	}
};

export const passageGenerators: Generator<Passage>[] = [passageComprehension];
