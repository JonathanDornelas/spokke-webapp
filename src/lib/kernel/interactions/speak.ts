import { z } from 'zod';
import { normalize } from '../language/normalize';
import { tokenize } from '../language/tokenize';
import { similarity } from '../grading/levenshtein';
import { promptSkills } from './skills';
import type { InteractionType, SpeakRuntime } from './types';

/**
 * Falar a frase. O `target` é conteúdo PÚBLICO — o aluno precisa ver o que
 * deve dizer; não há gabarito escondido aqui, só `hints` (vocabulário que o
 * ASR recebe para melhorar a transcrição), que fica no servidor.
 *
 * A transcrição acontece ANTES de `grade`: a remote function chama o
 * `AsrProvider` e passa o texto transcrito como resposta. Assim `grade`
 * continua puro e síncrono, e o teste não precisa de áudio.
 *
 * **Nunca reprova de forma dura** (kernel.md "Correção"): ASR erra muito com
 * sotaque não-nativo, que é exatamente o público. Score parcial com a
 * palavra provavelmente errada em destaque, e pular sempre disponível.
 */

export const speakAuthoringSchema = z.object({
	target: z.string().min(1),
	ipa: z.string().optional(),
	hints: z.array(z.string()).default([])
});

export const speakAnswerSchema = z.object({ transcript: z.string() });

export type SpeakPayload = z.infer<typeof speakAuthoringSchema>;
export type SpeakAnswer = z.infer<typeof speakAnswerSchema>;

const NEAR_NATIVE = 0.92;
// Piso de pontuação: mesmo uma transcrição ruim não zera a questão de fala.
const FLOOR = 0.3;

export const speak: InteractionType<
	typeof speakAuthoringSchema,
	typeof speakAnswerSchema,
	SpeakRuntime
> = {
	id: 'speak',
	authoringSchema: speakAuthoringSchema,
	answerSchema: speakAnswerSchema,

	toRuntime: (payload) => ({ target: payload.target, ipa: payload.ipa }),

	grade: (payload, answer, profile) => {
		const target = normalize(payload.target, profile);
		const said = normalize(answer.transcript, profile);
		const score = target === said ? 1 : similarity(said, target);

		if (score >= NEAR_NATIVE) return { ok: true, value: { value: 1 } };

		// Normaliza a FRASE e depois tokeniza, não o contrário: as equivalências do
		// profile trabalham sobre a frase inteira ("seven" → "7", "im" → "i am"), e
		// aplicá-las palavra a palavra deixaria "i am" do alvo sem par em "im".
		const spoken = new Set(tokenize(said, profile));
		const faltou = tokenize(target, profile).find((w) => !spoken.has(w));
		// A palavra mostrada é a do alvo COMO ESTÁ ESCRITA, não a normalizada:
		// "repare em Seven", não "repare em 7". Quando a forma normalizada não
		// corresponde a uma palavra só do alvo (uma contração expandida), vai a
		// normalizada mesmo — ainda é o pedaço que faltou.
		const missed = faltou
			? (tokenize(payload.target, profile).find((w) => normalize(w, profile) === faltou) ?? faltou)
			: undefined;

		return {
			ok: true,
			value: {
				value: Math.max(FLOOR, score),
				// Sem "Quase" na frase: o veredito é da tela (`AnswerFeedback`), e a
				// mensagem repetindo saía "Quase. Quase — repare em…" (kernel.md
				// "Correção" — a mesma regra que o `compare.ts` já segue).
				feedback: missed ? `Repare em "${missed}".` : 'Tente falar um pouco mais pausadamente.'
			}
		};
	},

	skills: (prompt) => [...promptSkills(prompt), 'speaking']
};
