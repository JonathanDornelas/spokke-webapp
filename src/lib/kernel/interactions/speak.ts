import { z } from 'zod';
import { normalize } from '../language/normalize';
import { tokenize } from '../language/tokenize';
import { similarity } from '../grading/levenshtein';
import { mesmoTexto, regra, textoVisivel, vazios } from '../qualidade/comparar';
import type { Problema } from '../qualidade/types';
import { promptSkills } from './skills';
import {
	compararPronuncia,
	compararSons,
	RIGORES,
	type Pronuncia,
	type RegrasDePronuncia,
	type SomOuvido
} from '../language/pronuncia';
import type { LanguageProfile } from '../language/profile';
import type { Result, Score } from '../grading/result';
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

/**
 * A pronúncia da palavra, na questão de PRONÚNCIA (`vocab-pronuncia`): os
 * fonemas do dicionário e as sílabas. Não é gabarito — o aluno vê a palavra, a
 * pronúncia escrita e a boca —, e por isso vai inteira para o runtime.
 */
export const pronunciaSchema = z.object({
	fonemas: z.array(z.string().min(1)).min(1),
	silabas: z
		.array(
			z.object({
				leitura: z.string(),
				tonica: z.boolean(),
				fonemas: z.array(z.string().min(1)).min(1)
			})
		)
		.min(1),
	/** O quanto a correção exige (`TOLERANCIA`). Ausente nas de antes dos níveis: vale o normal. */
	rigor: z.enum(RIGORES).optional()
});

/** Um som que o reconhecedor de fonemas ouviu (`SomOuvido`). */
const somOuvidoSchema = z.object({
	s: z.string(),
	p: z.number(),
	alt: z.array(z.object({ s: z.string(), p: z.number() })).optional()
});

export const speakAuthoringSchema = z.object({
	target: z.string().min(1),
	ipa: z.string().optional(),
	hints: z.array(z.string()).default([]),
	pronuncia: pronunciaSchema.optional()
});

/**
 * Na questão de Pronúncia a resposta leva o que se OUVIU, para a correção
 * refeita no resultado dar o mesmo veredito:
 *
 * - `sons`: os sons que o RECONHECEDOR DE FONEMAS ouviu, com a certeza de cada
 *   um. É a correção de verdade, e aí `transcript` é a leitura desses sons
 *   ("prai · aw · ree · tee"), não uma transcrição do Whisper.
 * - `fonemas`: a reserva, com o reconhecedor fora do ar — o dicionário aplicado
 *   ao que o Whisper transcreveu.
 */
export const speakAnswerSchema = z.object({
	transcript: z.string(),
	fonemas: z.array(z.string()).optional(),
	sons: z.array(somOuvidoSchema).optional()
});

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

	toRuntime: (payload) => ({
		target: payload.target,
		ipa: payload.ipa,
		...(payload.pronuncia
			? {
					silabas: payload.pronuncia.silabas.map((s) => ({ leitura: s.leitura, tonica: s.tonica })),
					fonemas: payload.pronuncia.fonemas,
					rigor: payload.pronuncia.rigor ?? 'normal'
				}
			: {})
	}),

	grade: (payload, answer, profile) => {
		if (payload.pronuncia && answer.sons && profile.pronuncia)
			return corrigirPelosSons(payload.pronuncia, answer.sons, profile.pronuncia);
		if (payload.pronuncia)
			return corrigirPronuncia(payload.pronuncia, payload.target, answer, profile);
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

	skills: (prompt) => [...promptSkills(prompt), 'speaking'],

	conferir: (payload, ctx) => {
		const problemas: Problema[] = [...vazios([payload.target], ctx.perfis)];
		// O aluno vê a frase que fala (ela é pública), então o texto de cima é APOIO
		// — quase sempre a tradução. Igual à frase, ele não foi traduzido: é a "la
		// cometa" de novo, só que sem entregar resposta nenhuma.
		const apoio = textoVisivel(ctx.prompt);
		if (apoio && mesmoTexto(apoio, payload.target, ctx.perfis)) {
			problemas.push(regra('traducao-igual-ao-original', 'aviso', apoio));
		}
		return problemas;
	}
};

/**
 * O veredito da Pronúncia a partir do resultado por sílaba: "Correto" com todas
 * certas; "Quase" com UMA fora numa palavra de duas ou mais; o resto é erro, sem
 * o piso de 0,3 da fala comum. O retorno sempre diz a sílaba (`marks`, uma por
 * sílaba, e o texto).
 */
function vereditoPorSilaba(
	silabas: { leitura: string; ok: boolean }[],
	tudoCerto: () => Result<Score>
): Result<Score> {
	const fora = silabas.filter((s) => !s.ok);
	if (fora.length === 0) return tudoCerto();
	const nomes = fora.map((s) => `"${s.leitura}"`);
	const quase = fora.length === 1 && silabas.length >= 2;
	return {
		ok: true,
		value: {
			value: quase ? 0.5 : 0,
			marks: silabas.map((s) => ({ text: s.leitura, ok: s.ok })),
			feedback:
				nomes.length === 1
					? `A sílaba ${nomes[0]} saiu diferente.`
					: `As sílabas ${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)} saíram diferentes.`
		}
	};
}

/**
 * A correção da PRONÚNCIA pelos sons que o RECONHECEDOR DE FONEMAS ouviu — a de
 * verdade, e a exceção deliberada a "speak nunca reprova de forma dura"
 * (kernel.md): aqui o som é o exercício. O rigor da questão (`pronuncia.rigor`)
 * diz o que conta como o som certo (`compararSons`, `TOLERANCIA`).
 */
function corrigirPelosSons(
	pronuncia: Pronuncia,
	sons: SomOuvido[],
	regras: RegrasDePronuncia
): Result<Score> {
	if (sons.length === 0) {
		return { ok: true, value: { value: 0, feedback: 'Não deu para ouvir a palavra.' } };
	}
	const comparacao = compararSons(pronuncia, sons, regras, pronuncia.rigor ?? 'normal');
	return vereditoPorSilaba(comparacao.silabas, () => ({
		ok: true,
		value: { value: 1, marks: comparacao.silabas.map((s) => ({ text: s.leitura, ok: true })) }
	}));
}

/**
 * A correção da PRONÚNCIA de RESERVA, com o reconhecedor de fonemas fora do ar:
 * o dicionário aplicado ao que o Whisper transcreveu (`fonemas`). O Whisper
 * puxa o som para a palavra real mais próxima, então "priority" mal dita ainda
 * sai "priority" — esta só pega palavra trocada, e diz em que sílaba.
 *
 * Sem os sons ouvidos (palavra fora do dicionário, nada transcrito), vale a
 * palavra: a mesma, certa; outra, errada, com o que se ouviu.
 */
function corrigirPronuncia(
	pronuncia: Pronuncia,
	target: string,
	answer: SpeakAnswer,
	profile: LanguageProfile
): Result<Score> {
	const alvo = normalize(target, profile);
	const ouvido = normalize(answer.transcript, profile);
	const tudoCerto = (): Result<Score> => ({
		ok: true,
		value: { value: 1, marks: pronuncia.silabas.map((s) => ({ text: s.leitura, ok: true })) }
	});
	if (ouvido === alvo) return tudoCerto();
	if (!answer.fonemas || answer.fonemas.length === 0) {
		return {
			ok: true,
			value: {
				value: 0,
				feedback: ouvido
					? `Ouvimos outra palavra: "${answer.transcript.trim()}".`
					: 'Não deu para ouvir a palavra.'
			}
		};
	}
	return vereditoPorSilaba(compararPronuncia(pronuncia, answer.fonemas).silabas, tudoCerto);
}
