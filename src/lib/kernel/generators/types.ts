import type { LanguageProfile } from '../language/profile';
import type { Item } from '../item';
import type { Skill } from '../interactions/types';

/**
 * `(ContentUnit, LanguageProfile) => Item[]`, função pura, sem I/O — ver
 * .claude/rules/kernel.md "Nível 2 — geradores". Conjunto de conteúdo pequeno
 * demais para gerar distratores? Retorne menos itens, nunca invente distrator.
 */

/** A unidade de conteúdo mais o id dela no banco, que vira `Item.sourceContentId`. */
export interface ContentRef<D> {
	id: string;
	data: D;
}

export interface GeneratorContext<D> {
	/** Idioma que o aluno está aprendendo. */
	targetProfile: LanguageProfile;
	/** Idioma do aluno — usado nos enunciados e nas traduções. */
	sourceProfile: LanguageProfile;
	/**
	 * As outras unidades do MESMO lote. É a única origem de distrator que o
	 * kernel aceita: nunca dicionário, nunca heurística de língua — é isso que
	 * mantém o gerador agnóstico de idioma (kernel.md "Distratores").
	 */
	siblings: ContentRef<D>[];
	/** Determinismo na escolha dos distratores — regra inviolável nº 8. */
	seed: string;
	/**
	 * O que o servidor consegue entregar hoje. O kernel é puro e não lê `env`
	 * — quem sabe se existe provedor é o servidor, e ele informa aqui. Sem
	 * ASR, nenhum item de fala é gerado; sem TTS, nenhum item de escuta
	 * (server.md: "Sem provedor de ASR configurado, o servidor omite o item").
	 */
	capabilities: { asr: boolean; tts: boolean };
	/**
	 * O nível CEFR da atividade, quando o professor escolheu um. É rótulo
	 * (adr-004) com UMA exceção: no diálogo ele decide se o aluno recebe o texto
	 * das falas junto do áudio (`mostraDoDialogo`).
	 */
	nivel?: NivelCefr | null;
	/**
	 * A pronúncia de uma palavra do idioma alvo, quando o idioma tem
	 * (`LanguageProfile.pronuncia`). Quem consulta o dicionário é o servidor; sem
	 * ele, a questão de Pronúncia não é gerada.
	 */
	foneticaDe?: (palavra: string) => string[] | null;
	/**
	 * Os tipos que o professor pediu para ESTE material (etapa 2), quando a
	 * geração os conhece. Quem corta é o `selectItems`; aqui eles só decidem o
	 * que tem duas formas: o diálogo de um material SEM escuta vai lido — com
	 * áudio, as questões dele exigiriam a escuta e o corte tiraria todas.
	 */
	pedidas?: readonly Skill[];
}

export type NivelCefr = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

export interface Generator<D> {
	id: string;
	generate: (content: ContentRef<D>, context: GeneratorContext<D>) => Item[];
}
