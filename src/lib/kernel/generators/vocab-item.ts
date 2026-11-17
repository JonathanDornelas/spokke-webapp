import type { VocabItem } from '../content/types';
import type { Item } from '../item';
import { distractorPhrases } from './distractors';
import { tokenize } from '../language/tokenize';
import { pronunciaDe, type RigorDaPronuncia } from '../language/pronuncia';
import { mesmoTexto } from '../qualidade/comparar';
import type { ContentRef, Generator, GeneratorContext, NivelCefr } from './types';

/**
 * Os geradores de `VocabItem` (kernel.md "Nível 2"): a tradução nos dois
 * sentidos (`vocab-choice`, `vocab-choice-term`), a escuta (`listen-vocab-choice`,
 * `listen-vocab-type`), a escrita (`vocab-type`) e a fala — a Pronúncia
 * (`vocab-pronuncia`) onde o idioma tem, a fala comum (`speak-vocab`) onde não.
 * Faltam `vocab-image-choice` (depende de upload de imagem) e `vocab-match` (o
 * `closing-match` já liga os termos no fim da atividade).
 */
/**
 * Os SENTIDOS dos outros termos, de onde saem as alternativas erradas de "escolha
 * o sentido". O irmão cujo "sentido" é o próprio termo — a tradução que voltou sem
 * traduzir (a "la cometa" de kernel.md "Conferência de qualidade") — não empresta
 * alternativa: ela apareceria no idioma alvo, no meio de sentidos na língua do
 * aluno. O termo em si continua valendo como alternativa de "escolha a palavra".
 */
function sentidosDosOutros(ctx: GeneratorContext<VocabItem>): string[] {
	const perfis = { alvo: ctx.targetProfile, origem: ctx.sourceProfile };
	return ctx.siblings
		.filter((s) => !mesmoTexto(s.data.term, s.data.translation, perfis))
		.map((s) => s.data.translation);
}

export const vocabChoice: Generator<VocabItem> = {
	id: 'vocab-choice',
	generate: (content, ctx) => {
		const distractors = distractorPhrases(
			sentidosDosOutros(ctx),
			content.data.translation,
			3,
			ctx.sourceProfile,
			`${ctx.seed}:${content.id}:vocab-choice`
		);
		// Conjunto pequeno demais gera MENOS exercícios — nunca um distrator
		// inventado (kernel.md "Distratores").
		if (distractors.length < 1) return [];

		const item: Item = {
			id: `${content.id}:vocab-choice`,
			sourceContentId: content.id,
			generatedBy: 'vocab-choice',
			prompt: { kind: 'text', text: content.data.term, instructionKey: 'choose-translation' },
			interaction: {
				type: 'choice',
				payload: { options: [content.data.translation, ...distractors], correctIndex: 0 }
			},
			// As alternativas são SENTIDOS, na língua do aluno: é nela que ele responde.
			// A correção da escolha é pelo índice e não usa o perfil; quem lê isto é a
			// conferência (o sentido igual ao termo é a palavra que não foi traduzida).
			grading: { mode: 'exact', answerLang: 'source' },
			locale: { source: ctx.sourceProfile.tag, target: ctx.targetProfile.tag }
		};
		return [item];
	}
};

/**
 * O rigor da correção da Pronúncia pelo NÍVEL da atividade (pedido do dono do
 * repositório, como o `mostraDoDialogo`): A1 e A2 começam no leve, B1 e B2 no
 * normal, C1 e C2 no rigoroso, e sem nível vale o normal. O professor troca no
 * editor de questão.
 */
export function rigorDaPronuncia(nivel: NivelCefr | null | undefined): RigorDaPronuncia {
	if (nivel === 'A1' || nivel === 'A2') return 'leve';
	if (nivel === 'C1' || nivel === 'C2') return 'rigoroso';
	return 'normal';
}

/**
 * A PRONÚNCIA do termo: a palavra, como ela se lê em sílabas, a boca a cada
 * som e o microfone, com a correção rígida (`speak` com `pronuncia`).
 *
 * Só sai quando tudo existe: o idioma declara pronúncia (`LanguageProfile`),
 * o servidor tem o dicionário (`foneticaDe`) e o ASR está ligado. E só para
 * UMA palavra: é exercício de som de palavra, e "look up" teria duas.
 */
export const vocabPronuncia: Generator<VocabItem> = {
	id: 'vocab-pronuncia',
	generate: (content, ctx) => {
		const regras = ctx.targetProfile.pronuncia;
		const fonemas = fonemasDoTermo(content, ctx);
		if (!regras || !fonemas) return [];
		const termo = content.data.term.trim();

		const item: Item = {
			id: `${content.id}:vocab-pronuncia`,
			sourceContentId: content.id,
			generatedBy: 'vocab-pronuncia',
			// O sentido do termo vai como apoio, como a tradução na fala de uma frase.
			prompt: {
				kind: 'text',
				text: content.data.translation,
				instructionKey: 'pronounce-the-word'
			},
			interaction: {
				type: 'speak',
				payload: {
					target: termo,
					hints: [],
					pronuncia: { ...pronunciaDe(fonemas, regras), rigor: rigorDaPronuncia(ctx.nivel) }
				}
			},
			grading: { mode: 'asr' },
			locale: { source: ctx.sourceProfile.tag, target: ctx.targetProfile.tag }
		};
		return [item];
	}
};

/**
 * Os fonemas do termo, quando ele vira Pronúncia: o idioma declara pronúncia, o
 * servidor tem o dicionário, o ASR está ligado e o termo é UMA palavra que o
 * dicionário conhece. Nulo em qualquer outro caso, e aí a fala do vocabulário é
 * a comum (`speak-vocab`).
 */
function fonemasDoTermo(content: Ref, ctx: Ctx): string[] | null {
	if (!ctx.targetProfile.pronuncia || !ctx.foneticaDe || !ctx.capabilities.asr) return null;
	const termo = content.data.term.trim();
	if (tokenize(termo, ctx.targetProfile).length !== 1) return null;
	const fonemas = ctx.foneticaDe(termo);
	return fonemas && fonemas.length > 0 ? fonemas : null;
}

// ── as outras habilidades, do mesmo termo ─────────────────────────────────
// Pedido do dono do repositório: o vocabulário rende tradução, escuta, escrita e
// fala, como a frase, e não só "escolha a tradução" e a Pronúncia. As erradas
// saem sempre dos OUTROS termos do conjunto (kernel.md "Distratores"): sem
// eles, a escolha não sai.

type Ref = ContentRef<VocabItem>;
type Ctx = GeneratorContext<VocabItem>;

function base(content: Ref, generatedBy: string, ctx: Ctx) {
	return {
		id: `${content.id}:${generatedBy}`,
		sourceContentId: content.id,
		generatedBy,
		locale: { source: ctx.sourceProfile.tag, target: ctx.targetProfile.tag }
	};
}

/** Provedor de TTS ligado E voz no idioma (o árabe, hoje, não tem): sem isso, nada de escuta. */
const temVoz = (ctx: Ctx) => ctx.capabilities.tts && ctx.targetProfile.tts.voices.length > 0;

/** Vê o sentido e escolhe a palavra no idioma alvo: a tradução no outro sentido. */
export const vocabChoiceTerm: Generator<VocabItem> = {
	id: 'vocab-choice-term',
	generate: (content, ctx) => {
		const distractors = distractorPhrases(
			ctx.siblings.map((s) => s.data.term),
			content.data.term,
			3,
			ctx.targetProfile,
			`${ctx.seed}:${content.id}:vocab-choice-term`
		);
		if (distractors.length < 1) return [];
		const item: Item = {
			...base(content, 'vocab-choice-term', ctx),
			prompt: { kind: 'text', text: content.data.translation, instructionKey: 'choose-the-word' },
			interaction: {
				type: 'choice',
				payload: { options: [content.data.term, ...distractors], correctIndex: 0 }
			},
			grading: { mode: 'exact' }
		};
		return [item];
	}
};

/** Ouve a palavra e escolhe o sentido dela. */
export const listenVocabChoice: Generator<VocabItem> = {
	id: 'listen-vocab-choice',
	generate: (content, ctx) => {
		if (!temVoz(ctx)) return [];
		const distractors = distractorPhrases(
			sentidosDosOutros(ctx),
			content.data.translation,
			3,
			ctx.sourceProfile,
			`${ctx.seed}:${content.id}:listen-vocab-choice`
		);
		if (distractors.length < 1) return [];
		const item: Item = {
			...base(content, 'listen-vocab-choice', ctx),
			// O texto do áudio é gabarito: o enunciado vem da chave, nunca dele.
			prompt: {
				kind: 'audio',
				text: content.data.term,
				instructionKey: 'listen-and-choose-meaning'
			},
			interaction: {
				type: 'choice',
				payload: { options: [content.data.translation, ...distractors], correctIndex: 0 }
			},
			// Ouve no idioma alvo e escolhe o SENTIDO, na língua do aluno.
			grading: { mode: 'exact', answerLang: 'source' }
		};
		return [item];
	}
};

/** Ouve a palavra e escreve o que ouviu. */
export const listenVocabType: Generator<VocabItem> = {
	id: 'listen-vocab-type',
	generate: (content, ctx) => {
		if (!temVoz(ctx)) return [];
		const item: Item = {
			...base(content, 'listen-vocab-type', ctx),
			prompt: { kind: 'audio', text: content.data.term, instructionKey: 'listen-and-type-word' },
			interaction: { type: 'type', payload: { accepted: [content.data.term] } },
			grading: { mode: 'tolerant', tolerance: 0.9 }
		};
		return [item];
	}
};

/** Vê o sentido e escreve a palavra no idioma alvo. */
export const vocabType: Generator<VocabItem> = {
	id: 'vocab-type',
	generate: (content, ctx) => {
		const item: Item = {
			...base(content, 'vocab-type', ctx),
			prompt: { kind: 'text', text: content.data.translation, instructionKey: 'write-the-word' },
			interaction: { type: 'type', payload: { accepted: [content.data.term] } },
			grading: { mode: 'tolerant', tolerance: 0.9 }
		};
		return [item];
	}
};

/**
 * Diz a palavra em voz alta, na fala comum (a transcrição comparada com o
 * termo). Só quando o termo NÃO vira Pronúncia — idioma sem pronúncia, palavra
 * fora do dicionário, expressão de mais de uma palavra: com ela, a Pronúncia já é
 * a fala desse termo, e duas questões de dizer a mesma palavra seriam uma a mais.
 */
export const speakVocab: Generator<VocabItem> = {
	id: 'speak-vocab',
	generate: (content, ctx) => {
		if (!ctx.capabilities.asr || fonemasDoTermo(content, ctx)) return [];
		const item: Item = {
			...base(content, 'speak-vocab', ctx),
			prompt: { kind: 'text', text: content.data.translation, instructionKey: 'say-the-word' },
			interaction: { type: 'speak', payload: { target: content.data.term, hints: [] } },
			grading: { mode: 'asr' }
		};
		return [item];
	}
};

export const vocabItemGenerators: Generator<VocabItem>[] = [
	vocabChoice,
	vocabChoiceTerm,
	listenVocabChoice,
	vocabType,
	listenVocabType,
	vocabPronuncia,
	speakVocab
];
