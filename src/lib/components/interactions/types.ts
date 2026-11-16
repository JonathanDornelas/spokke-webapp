/**
 * Formas de runtime consumidas pelos componentes de interação do Player.
 *
 * O kernel ainda não tem nenhuma interação implementada no registry (ver
 * `kernel/interactions/registry.ts` — populado pela skill `nova-interacao`), então
 * `toRuntime()` ainda não produz um payload concreto por tipo. Estes tipos descrevem
 * o formato que cada interação vai exigir da UI hoje — quando o módulo real de cada
 * interação existir, ele deve produzir exatamente isto a partir de `toRuntime()`.
 * Nunca `any`: enquanto o kernel não define a forma oficial, a forma vive aqui.
 */

import type { Teclado } from '$lib/kernel/language/teclado';
import type { MostraDoDialogo } from '$lib/kernel/interactions/types';
import type { PassoDaBoca, RigorDaPronuncia } from '$lib/kernel/language/pronuncia';
import type { LinhaDaPalavra } from '$lib/kernel/language/sintese';

export type Dir = 'ltr' | 'rtl';

/**
 * O contexto de um `composite` como chega ao browser (`server/player/runtime.ts`,
 * `contextoNoRuntime`). No diálogo: só as falas ANTES da parada, o texto só
 * quando o aluno lê, o áudio só quando ele ouve — e da fala da parada, só quem
 * fala ("Sua vez"), nunca o texto (regra nº 1).
 */
export type ContextoNoRuntime =
	| { tipo: 'texto'; texto: string }
	| {
			tipo: 'dialogo';
			mostra: MostraDoDialogo;
			falas: {
				falante: string;
				lado: 'inicio' | 'fim';
				texto?: string;
				audio?: string;
				audioSlow?: string;
			}[];
			vez?: { falante: string; lado: 'inicio' | 'fim' };
	  };

/** A Pronúncia como chega ao browser: a boca passo a passo e o áudio da palavra. */
export interface PronunciaNoRuntime {
	passos: PassoDaBoca[];
	audio?: string;
	audioSlow?: string;
	/**
	 * Onde cada FONEMA está no arquivo normal e no devagar (`LinhaDaPalavra`): o
	 * que toca uma sílaba só e anda a boca no tempo de cada som. Sem ela, a boca
	 * anda pelo peso e a sílaba só mostra a boca.
	 */
	linha?: LinhaDaPalavra;
	linhaLenta?: LinhaDaPalavra;
}

export interface RuntimeOption {
	id: string;
	text: string;
}

export interface RuntimeToken {
	id: string;
	text: string;
}

export interface ChoiceRuntimeItem {
	dir: Dir;
	options: RuntimeOption[];
}

export interface AssembleRuntimeItem {
	dir: Dir;
	translation?: string;
	tokens: RuntimeToken[];
}

export interface ClozeRuntimeItem {
	dir: Dir;
	/** O teclado virtual do idioma alvo, quando o aparelho não escreve o script. */
	teclado?: Teclado;
	masked: string;
	/** Largura de cada lacuna em caracteres — ver `TextRuntime.blanks` no kernel. */
	blanks?: number[];
}

export interface ClozeFeedback {
	state: 'correct' | 'partial' | 'incorrect';
	hint?: string;
	/**
	 * A resposta do aluno pedaço a pedaço, para a tela grifar o que saiu do
	 * lugar. Espelha `AnswerMark` do kernel (`grading/result.ts`).
	 */
	marks?: { text: string; ok: boolean }[];
	/** A resposta certa, pedaço a pedaço — a tela mostra abaixo do que o aluno montou. */
	expected?: string[];
	/**
	 * O que o serviço de áudio ENTENDEU, só em `speak`. Numa questão de fala isso
	 * é metade do retorno: "quase" sem dizer o que se ouviu não ensina nada — o
	 * aluno não sabe se pronunciou torto ou se o microfone cortou.
	 */
	heard?: string;
}

export interface MatchRuntimeItem {
	dir: Dir;
	left: RuntimeOption[];
	right: RuntimeOption[];
}

export interface MatchPair {
	left: string;
	right: string;
}

export interface OrderRuntimeItem {
	dir: Dir;
	lines: RuntimeOption[];
}

export interface SelectSegment {
	id: string;
	text: string;
	selectable: boolean;
}

export interface SelectRuntimeItem {
	dir: Dir;
	segments: SelectSegment[];
}

export interface SpeakRuntimeItem {
	dir: Dir;
	target: string;
	ipa?: string;
	/** Só na Pronúncia: as sílabas como se leem, e a boca com o áudio da palavra. */
	silabas?: { leitura: string; tonica: boolean }[];
	pronuncia?: PronunciaNoRuntime;
	/** E o rigor da correção (não é gabarito). */
	rigor?: RigorDaPronuncia;
}

export interface WritingRuntimeItem {
	dir: Dir;
	/** O teclado virtual do idioma alvo, quando o aparelho não escreve o script. */
	teclado?: Teclado;
	instructions: string;
	maxLength: number;
}

/**
 * Uma questão inteira como `buildRuntimeItem` a devolve (`server/player/runtime.ts`)
 * — o que `PreviaDaQuestao.svelte` desenha. O índice aberto no fim existe porque
 * cada interação acrescenta campos próprios (`options`, `tokens`, `masked`…);
 * nunca `any`: o que cada componente exige está tipado acima.
 */
export interface RuntimeDaQuestao {
	dir: Dir;
	interaction: import('$lib/kernel/interactions/types').InteractionKind;
	prompt: string;
	passage?: string;
	/** O trecho ou o diálogo antes da pergunta, e a pergunta (`composite` com contexto). */
	contexto?: ContextoNoRuntime;
	pergunta?: string;
	/** Só na Pronúncia. */
	silabas?: { leitura: string; tonica: boolean }[];
	pronuncia?: PronunciaNoRuntime;
	skillLabel: string;
	audio?: string;
	audioSlow?: string;
	gradedLater?: boolean;
	[extra: string]: unknown;
}
