import type { SentencePair } from '../content/types';
import type { Item } from '../item';
import { segmentosDePalavra, tokenize } from '../language/tokenize';
import { distractorPhrases, distractorTokens } from './distractors';
import type { ContentRef, Generator, GeneratorContext } from './types';

/**
 * Os sete geradores de `SentencePair` — a tabela de kernel.md "Nível 2".
 * De UMA frase cadastrada saem até sete exercícios diferentes; vinte frases
 * viram cerca de cem. O professor revisa e descarta, nunca escreve item a
 * item.
 *
 * Todo gerador aqui é puro: mesmo conteúdo, mesmo profile e mesma seed
 * produzem exatamente os mesmos itens.
 */

type Ctx = GeneratorContext<SentencePair>;
type Ref = ContentRef<SentencePair>;

function base(content: Ref, generatedBy: string, ctx: Ctx) {
	return {
		id: `${content.id}:${generatedBy}`,
		sourceContentId: content.id,
		generatedBy,
		locale: { source: ctx.sourceProfile.tag, target: ctx.targetProfile.tag }
	};
}

const targetsOf = (siblings: Ref[]) => siblings.map((s) => s.data.target);

/** Mostra a frase na língua do aluno; ele monta a frase no idioma alvo. */
export const translateAssemble: Generator<SentencePair> = {
	id: 'translate-assemble',
	generate: (content, ctx) => {
		const tokens = tokenize(content.data.target, ctx.targetProfile);
		// Uma palavra só não é exercício de montar.
		if (tokens.length < 2) return [];

		const distractors = distractorTokens(
			targetsOf(ctx.siblings),
			content.data.target,
			2,
			ctx.targetProfile,
			`${ctx.seed}:${content.id}:translate-assemble`
		);

		const item: Item = {
			...base(content, 'translate-assemble', ctx),
			prompt: {
				kind: 'text',
				text: content.data.source,
				instructionKey: 'assemble-from-source'
			},
			interaction: { type: 'assemble', payload: { tokens, distractors, accepted: [tokens] } },
			grading: { mode: 'sequence' }
		};
		return [item];
	}
};

/** Mostra a frase no idioma alvo; ele digita a tradução. */
export const translateType: Generator<SentencePair> = {
	id: 'translate-type',
	generate: (content, ctx) => {
		const item: Item = {
			...base(content, 'translate-type', ctx),
			prompt: {
				kind: 'text',
				text: content.data.target,
				instructionKey: 'translate-to-source'
			},
			// As variações do material (as que o tradutor sugeriu e o professor
			// manteve, mais as que ele escreveu) também valem como resposta certa.
			interaction: {
				type: 'type',
				payload: {
					accepted: [...new Set([content.data.source, ...(content.data.variants ?? [])])]
				}
			},
			// A resposta vem na língua do ALUNO: ele lê o inglês e escreve em
			// português. É o único gerador que inverte, e sem dizer isso a
			// correção usava o profile errado.
			grading: { mode: 'tolerant', tolerance: 0.9, answerLang: 'source' }
		};
		return [item];
	}
};

/** Ouve a frase no idioma alvo e monta ela com os tokens. */
export const listenAssemble: Generator<SentencePair> = {
	id: 'listen-assemble',
	generate: (content, ctx) => {
		// Provedor ligado E voz para este idioma. Sem a segunda metade, um idioma
		// que o modelo não fala (árabe, hoje) gerava item de escuta cujo TTS o
		// provedor recusa — e a publicação ficava travada em "gerando áudio".
		if (!ctx.capabilities.tts || ctx.targetProfile.tts.voices.length === 0) return [];
		const tokens = tokenize(content.data.target, ctx.targetProfile);
		if (tokens.length < 2) return [];

		const distractors = distractorTokens(
			targetsOf(ctx.siblings),
			content.data.target,
			2,
			ctx.targetProfile,
			`${ctx.seed}:${content.id}:listen-assemble`
		);

		const item: Item = {
			...base(content, 'listen-assemble', ctx),
			// `mediaId` só existe depois do TTS rodar na publicação; até lá o
			// prompt carrega o texto a sintetizar (server.md "TTS") — e esse
			// texto é gabarito, nunca vai para a tela.
			prompt: {
				kind: 'audio',
				text: content.data.target,
				instructionKey: 'listen-and-assemble'
			},
			interaction: { type: 'assemble', payload: { tokens, distractors, accepted: [tokens] } },
			grading: { mode: 'sequence' }
		};
		return [item];
	}
};

/** Ouve a frase no idioma alvo e digita o que ouviu. */
export const listenType: Generator<SentencePair> = {
	id: 'listen-type',
	generate: (content, ctx) => {
		// Provedor ligado E voz para este idioma. Sem a segunda metade, um idioma
		// que o modelo não fala (árabe, hoje) gerava item de escuta cujo TTS o
		// provedor recusa — e a publicação ficava travada em "gerando áudio".
		if (!ctx.capabilities.tts || ctx.targetProfile.tts.voices.length === 0) return [];
		const item: Item = {
			...base(content, 'listen-type', ctx),
			prompt: {
				kind: 'audio',
				text: content.data.target,
				instructionKey: 'listen-and-type'
			},
			interaction: { type: 'type', payload: { accepted: [content.data.target] } },
			grading: { mode: 'tolerant', tolerance: 0.9 }
		};
		return [item];
	}
};

/** Ouve a frase e escolhe qual das alternativas foi dita. */
export const listenChoice: Generator<SentencePair> = {
	id: 'listen-choice',
	generate: (content, ctx) => {
		// Provedor ligado E voz para este idioma. Sem a segunda metade, um idioma
		// que o modelo não fala (árabe, hoje) gerava item de escuta cujo TTS o
		// provedor recusa — e a publicação ficava travada em "gerando áudio".
		if (!ctx.capabilities.tts || ctx.targetProfile.tts.voices.length === 0) return [];

		const distractors = distractorPhrases(
			targetsOf(ctx.siblings),
			content.data.target,
			3,
			ctx.targetProfile,
			`${ctx.seed}:${content.id}:listen-choice`
		);
		// Sem outras frases no conjunto não há alternativa errada plausível —
		// e inventar uma é justamente o que o kernel não faz.
		if (distractors.length < 1) return [];

		const options = [content.data.target, ...distractors];
		const item: Item = {
			...base(content, 'listen-choice', ctx),
			prompt: {
				kind: 'audio',
				text: content.data.target,
				instructionKey: 'listen-and-choose'
			},
			interaction: { type: 'choice', payload: { options, correctIndex: 0 } },
			grading: { mode: 'exact' }
		};
		return [item];
	}
};

/** Completa a lacuna na frase do idioma alvo. */
export const clozeTarget: Generator<SentencePair> = {
	id: 'cloze-target',
	generate: (content, ctx) => {
		const frase = content.data.target;
		// As palavras COM a posição de cada uma (regra nº 5: a fronteira é a do
		// segmentador do idioma). Mascarar pelo TEXTO da palavra trocava a primeira
		// ocorrência dele na frase: em "I have a cat." a lacuna do "a" caía dentro
		// de "have" ("I h___ve a cat.").
		const palavras = segmentosDePalavra(frase, ctx.targetProfile).filter((s) => s.palavra);
		// Precisa de contexto ao redor da lacuna para o exercício fazer sentido.
		if (palavras.length < 3) return [];

		// A lacuna cai numa posição determinística, nunca aleatória: a mesma
		// frase gera sempre o mesmo item.
		const lacuna = palavras[Math.floor(palavras.length / 2)];
		if (!lacuna) return [];
		const answer = lacuna.texto;
		const masked = `${frase.slice(0, lacuna.inicio)}___${frase.slice(lacuna.inicio + answer.length)}`;

		const item: Item = {
			...base(content, 'cloze-target', ctx),
			prompt: {
				kind: 'text',
				text: content.data.source,
				instructionKey: 'fill-the-blank'
			},
			interaction: { type: 'cloze', payload: { masked, accepted: [answer] } },
			grading: { mode: 'tolerant', tolerance: 0.9 }
		};
		return [item];
	}
};

/** Lê a frase da língua do aluno e fala a versão no idioma alvo. */
export const speakTarget: Generator<SentencePair> = {
	id: 'speak-target',
	generate: (content, ctx) => {
		// Sem provedor de ASR configurado o servidor omite o item inteiro, em
		// vez de mostrar uma tela de gravação que não corrige nada.
		if (!ctx.capabilities.asr) return [];

		const item: Item = {
			...base(content, 'speak-target', ctx),
			prompt: {
				kind: 'text',
				text: content.data.source,
				instructionKey: 'say-in-target'
			},
			interaction: {
				type: 'speak',
				payload: {
					target: content.data.target,
					// **`hints` são VOCABULÁRIO, não a frase.** Aqui ia
					// `tokenize(target)` — a frase inteira, palavra por palavra —, e
					// isso vira o `initial_prompt` do Whisper: uma lista separada por
					// vírgulas. O modelo imita o ESTILO do prompt, então a transcrição
					// voltava "Are, you, still, working, on, that, project" e o feedback
					// do aluno saía com vírgula entre cada palavra.
					//
					// Um gerador não tem como saber qual palavra o modelo erraria — isso
					// é conhecimento de língua, que o kernel não tem. Quem sabe é o
					// `LanguageProfile.asr.hints`, e é ele que o servidor manda.
					hints: []
				}
			},
			grading: { mode: 'asr' }
		};
		return [item];
	}
};

export const sentencePairGenerators: Generator<SentencePair>[] = [
	translateAssemble,
	translateType,
	listenAssemble,
	listenType,
	listenChoice,
	clozeTarget,
	speakTarget
];
