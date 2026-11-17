import type { z, ZodType } from 'zod';
import type { LanguageProfile } from '../language/profile';
import type { RigorDaPronuncia } from '../language/pronuncia';
import type { Result, Score } from '../grading/result';
import type { ContextoDaConferencia, Problema } from '../qualidade/types';

export type PromptKind = 'text' | 'audio' | 'image' | 'composite';

/**
 * Como o aluno RECEBE o diálogo: o texto das falas e o áudio delas, só o áudio
 * (escuta), ou só o texto (leitura). Na geração quem decide é o nível da
 * atividade (`mostraDoDialogo`); no editor, o professor.
 */
export type MostraDoDialogo = 'ambos' | 'audio' | 'texto';

export interface FalaDoContexto {
	falante: string;
	texto: string;
}

/**
 * O que um prompt `composite` mostra ANTES da pergunta: o trecho de um texto,
 * ou as falas de um diálogo. Vai DENTRO do item, copiado do material na
 * geração: a versão publicada não pode depender do material (regra nº 7), que
 * o professor pode apagar.
 *
 * No diálogo, `ate` é a fala que o ALUNO tem de produzir ("Sua vez"): só as
 * anteriores a ela chegam ao browser, e nunca o texto dela (regra nº 1). Sem
 * `ate`, o diálogo inteiro é o contexto (a pergunta de compreensão).
 */
export type ContextoDoPrompt =
	| { tipo: 'texto'; texto: string }
	| { tipo: 'dialogo'; falas: FalaDoContexto[]; ate?: number; mostra: MostraDoDialogo };

export interface Prompt {
	kind: PromptKind;
	/**
	 * O CONTEÚDO do prompt. Público quando `kind` é `text` (o aluno lê a
	 * frase), mas **gabarito** quando `kind` é `audio`: aí este campo é o
	 * texto que o TTS vai sintetizar, ou seja, exatamente a frase que o aluno
	 * deveria descobrir de ouvido. Nunca mande este campo para o browser sem
	 * olhar o `kind` — ver `server/player/runtime.ts`.
	 */
	text?: string;
	mediaId?: string;
	/**
	 * Qual enunciado mostrar ("Ouça e escreva o que ouviu"). É uma CHAVE, não
	 * a frase pronta: o kernel é agnóstico de idioma e não carrega copy de
	 * interface. Quem traduz é a camada de apresentação.
	 */
	instructionKey?: string;
	/** Só no `composite`: o trecho ou o diálogo que vem antes da pergunta. */
	contexto?: ContextoDoPrompt;
}

export type InteractionKind =
	'choice' | 'assemble' | 'type' | 'cloze' | 'match' | 'order' | 'select' | 'speak';

export type GradingMode = 'exact' | 'tolerant' | 'sequence' | 'set' | 'asr' | 'rubric';

export type Skill = 'listening' | 'speaking' | 'reading' | 'writing';

/**
 * O que cada `toRuntime` produz — ou seja, tudo que o browser do aluno pode
 * ver de uma interação. Estes tipos são a forma escrita da regra inviolável
 * nº 1: se um campo de gabarito não aparece aqui, ele não chega no browser.
 * Espelham `$lib/components/interactions/types.ts` sem o `dir`, que é
 * injetado pela camada que monta o item (vem do LanguageProfile, não da
 * interação).
 */
export interface RuntimeOption {
	id: string;
	text: string;
}

export interface ChoiceRuntime {
	options: RuntimeOption[];
}
export interface AssembleRuntime {
	tokens: RuntimeOption[];
	translation?: string;
}
/** `type` e `cloze` compartilham a forma: o cloze preenche `masked`, o type manda vazio. */
export interface TextRuntime {
	masked: string;
	/**
	 * Quantos caracteres cabem em cada lacuna do `masked`, na ordem em que
	 * elas aparecem. A lacuna do tamanho da palavra é o que faz "She ___ here"
	 * parecer uma frase com um buraco em vez de um traço genérico.
	 *
	 * É um vazamento DELIBERADO e medido: entrega o comprimento da resposta,
	 * nunca as letras. O gabarito continua fora do payload (regra inviolável
	 * nº 1) — e por isso este campo é um número, não um texto mascarado.
	 */
	blanks?: number[];
}
export interface MatchRuntime {
	left: RuntimeOption[];
	right: RuntimeOption[];
}
export interface OrderRuntime {
	lines: RuntimeOption[];
}
export interface SelectRuntime {
	segments: { id: string; text: string; selectable: boolean }[];
}
export interface SpeakRuntime {
	target: string;
	ipa?: string;
	/** Só na Pronúncia: as sílabas como o aluno as lê, e os fonemas (para a boca). */
	silabas?: { leitura: string; tonica: boolean }[];
	fonemas?: string[];
	/** E o rigor da correção, que a `hint` da questão diz ao aluno. Não é gabarito. */
	rigor?: RigorDaPronuncia;
}

export type InteractionRuntime =
	| ChoiceRuntime
	| AssembleRuntime
	| TextRuntime
	| MatchRuntime
	| OrderRuntime
	| SelectRuntime
	| SpeakRuntime;

/**
 * Forma de todo tipo de interação no registry — ver .claude/rules/kernel.md
 * "Registry de interação". `authoringSchema` contém gabarito e só existe no
 * servidor; `toRuntime` é a fronteira de segurança do produto inteiro.
 */
export interface InteractionType<
	AuthoringSchema extends ZodType = ZodType,
	AnswerSchema extends ZodType = ZodType,
	RuntimePayload extends InteractionRuntime = InteractionRuntime
> {
	id: InteractionKind;
	authoringSchema: AuthoringSchema;
	answerSchema: AnswerSchema;
	toRuntime: (payload: z.infer<AuthoringSchema>, seed: string) => RuntimePayload;
	// `seed` também vai para `grade`, não só para `toRuntime`: em `assemble`,
	// `match` e `order` a resposta do aluno referencia ids atribuídos DEPOIS do
	// embaralhamento (kernel.md "toRuntime é a fronteira de segurança"). Um
	// esquema de id estático pela ordem de autoria vaza o gabarito por padrão
	// (ex.: em `match`, o item esquerdo de índice 2 sempre parearia com o
	// direito de índice 2) — por isso `grade` recomputa o mesmo embaralhamento
	// com a mesma seed para reconstruir a correspondência id → conteúdo.
	grade: (
		payload: z.infer<AuthoringSchema>,
		answer: z.infer<AnswerSchema>,
		profile: LanguageProfile,
		seed: string
	) => Result<Score>;
	skills: (prompt: Prompt) => Skill[];
	/**
	 * A CONFERÊNCIA de qualidade da questão (kernel.md "Conferência de qualidade"):
	 * o que este formato consegue dizer de errado sobre si mesmo sem saber idioma
	 * nenhum — a resposta escrita no enunciado, duas alternativas iguais, a peça
	 * que falta no banco. Formato novo traz a sua, como traz o `toRuntime`.
	 */
	conferir: (payload: z.infer<AuthoringSchema>, ctx: ContextoDaConferencia) => Problema[];
}

/**
 * A forma com que o registry guarda cada interação. O payload que chega do
 * banco é uma coluna `Json` — ou seja, `unknown` de verdade (db.md "JSON no
 * Postgres": nunca confie no tipo do Prisma). Por isso a entrada do registry
 * recebe `unknown` e valida com o schema da própria interação antes de
 * delegar para a implementação tipada.
 */
export interface RegisteredInteraction {
	id: InteractionKind;
	authoringSchema: ZodType;
	answerSchema: ZodType;
	toRuntime: (payload: unknown, seed: string) => InteractionRuntime;
	grade: (
		payload: unknown,
		answer: unknown,
		profile: LanguageProfile,
		seed: string
	) => Result<Score>;
	skills: (prompt: Prompt) => Skill[];
	/** O payload que não passa no schema volta como um problema `formato-invalido`, nunca exceção. */
	conferir: (payload: unknown, ctx: ContextoDaConferencia) => Problema[];
}
