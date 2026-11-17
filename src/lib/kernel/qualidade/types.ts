import type { LanguageProfile } from '../language/profile';
import type { GradingMode, Prompt } from '../interactions/types';

/**
 * A CONFERÊNCIA de qualidade de uma questão (kernel.md "Conferência de qualidade").
 *
 * O caso que trouxe isto: uma questão de vocabulário de espanhol para português
 * mostrava "la cometa" e esperava "la cometa" — o tradutor devolveu a palavra
 * sem traduzir, e nada no caminho percebeu. O pedido do dono do repositório foi
 * uma camada de controle "como a dos áudios" (server.md "TTS": toda síntese é
 * conferida antes de ir para o bucket), mas para toda questão, de todo formato.
 *
 * Aqui ficam **as regras**, puras: o que se confere sem saber idioma nenhum — a
 * resposta que já está escrita no enunciado, duas alternativas iguais, a peça
 * que falta no banco do "monte a frase". Cada interação confere a si mesma
 * (`InteractionType.conferir`, no registry): formato novo de exercício traz a
 * sua conferência junto, como traz o `toRuntime`.
 *
 * O que depende de SENTIDO não é do kernel, e também não é de IA: é do tradutor
 * do serviço de áudio, no servidor — a tradução automática conferida antes de
 * ser gravada e as outras traduções certas de cada questão (server.md
 * "Tradução do material").
 *
 * O kernel não carrega copy de interface: o problema sai como CÓDIGO, e quem o
 * escreve para o professor é `$lib/atividades/qualidade.ts`.
 */

/**
 * `erro`: a questão corrige errado ou não testa nada (a resposta está à vista,
 * duas alternativas iguais). Na geração ela vai para as "de fora".
 * `aviso`: vale olhar (só uma resposta aceita numa tradução, um par igual dos
 * dois lados). Fica onde está, marcada.
 */
export type GravidadeDoProblema = 'erro' | 'aviso';

export const CODIGOS_DAS_REGRAS = [
	/** O payload não passa no `authoringSchema` da interação. */
	'formato-invalido',
	/** A resposta certa é o próprio texto do enunciado: o aluno acerta sem saber. */
	'resposta-igual-ao-enunciado',
	/** Uma resposta ou alternativa some no normalizador (só pontuação): não há o que comparar. */
	'texto-vazio',
	/** Duas alternativas iguais: quem escolhe a "outra" igual leva errado. */
	'alternativas-repetidas',
	/** O gabarito do "monte a frase" usa uma peça que não está no banco. */
	'peca-faltando',
	/** Uma peça só não é exercício de montar. */
	'uma-peca-so',
	/** Tradução para a língua do aluno com uma resposta aceita só. */
	'resposta-unica-na-traducao',
	/** O texto da lacuna não tem lacuna. */
	'lacuna-ausente',
	/** A palavra da lacuna está escrita na frase de apoio. */
	'lacuna-no-apoio',
	/** Dois pares com o mesmo termo de um lado. */
	'pares-repetidos',
	/** Um par com o mesmo texto dos dois lados. */
	'par-igual-nos-dois-lados',
	/** Duas falas iguais no "coloque na ordem": a troca entre elas conta como erro. */
	'falas-repetidas',
	/** A palavra certa aparece mais de uma vez para tocar. */
	'palavra-certa-repetida',
	/** A tradução de apoio é igual à frase que o aluno fala: ela não foi traduzida. */
	'traducao-igual-ao-original'
] as const;

export type CodigoDoProblema = (typeof CODIGOS_DAS_REGRAS)[number];

export interface Problema {
	codigo: CodigoDoProblema;
	gravidade: GravidadeDoProblema;
	/** O texto da questão a que ele se refere: a alternativa repetida, a palavra da lacuna. */
	trecho?: string;
}

/** As duas línguas da atividade. */
export interface PerfisDaConferencia {
	/** O idioma que o aluno aprende. */
	alvo: LanguageProfile;
	/** O idioma do aluno. */
	origem: LanguageProfile;
}

/** O que a conferência de uma interação sabe da questão além do payload. */
export interface ContextoDaConferencia {
	prompt: Prompt;
	/** Em qual das duas línguas o aluno responde (`gradingSchema.answerLang`). */
	answerLang: 'source' | 'target';
	/** Como a questão é corrigida: a escrita livre (`rubric`) não tem gabarito a conferir. */
	modo: GradingMode;
	perfis: PerfisDaConferencia;
}
