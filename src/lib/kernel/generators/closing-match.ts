import type { VocabItem } from '../content/types';
import type { Item } from '../item';
import { normalize } from '../language/normalize';
import { mesmoTexto } from '../qualidade/comparar';
import { pickWithSeed } from '../random';
import type { ContentRef, GeneratorContext } from './types';

/**
 * O exercício de ASSOCIAÇÃO que fecha a atividade.
 *
 * É o único gerador que não olha UMA unidade de conteúdo: ele varre o lote
 * inteiro e monta um item só, com material que apareceu ao longo do caminho —
 * uma revisão do que o aluno acabou de ver. Por isso mora fora de
 * `sentence-pair.ts` e companhia, e por isso a assinatura recebe listas em vez
 * de um `ContentRef`.
 *
 * **Associação é exercício de PALAVRA.** Ligar frases inteiras é outra coisa, e
 * mais fraca — o aluno casa pelo tamanho do cartão antes de ler. Os pares vêm
 * de duas fontes, nesta ordem:
 *
 * 1. **O vocabulário cadastrado** (`VocabItem`, termo ↔ sentido): é a palavra que
 *    o professor escolheu e o sentido que ELE escreveu.
 * 2. **Palavras das frases da atividade, com a tradução do tradutor**
 *    (`palavras`). O kernel não sabe que "manager" é "gerente" dentro de duas
 *    frases inteiras — isso é alinhamento de palavras, conhecimento de língua, e
 *    continua fora daqui. Quem escolhe as palavras é `palavrasParaAssociar`
 *    (`content/palavras.ts`, puro); quem as traduz é o SERVIDOR, e o resultado
 *    chega como dado pronto. Sem tradutor a lista vem vazia, e vale a regra de
 *    antes: sem vocabulário, a atividade não ganha o item de fecho.
 */

/** Um par pronto para o `match`. */
interface Par {
	left: string;
	right: string;
}

/** Uma palavra das frases e o sentido que o tradutor deu a ela. */
export interface PalavraTraduzida {
	termo: string;
	sentido: string;
}

/**
 * Quantos pares o item leva. Cinco é o teto porque `match` é uma tela de duas
 * colunas num celular: acima disso o aluno rola para achar o par, e o
 * exercício vira caça ao tesouro.
 */
export const MAX_PARES = 5;
/** Menos que isto não é associação — e o `matchAuthoringSchema` recusa. */
const MIN_PARES = 2;

export interface ClosingContext {
	vocab: ContentRef<VocabItem>[];
	/** Palavras das frases, já traduzidas pelo servidor. Vazio sem tradutor. */
	palavras?: PalavraTraduzida[];
	options: Pick<GeneratorContext<unknown>, 'sourceProfile' | 'targetProfile' | 'seed'>;
}

export function closingMatch({ vocab, palavras = [], options }: ClosingContext): Item | null {
	const { sourceProfile, targetProfile } = options;

	// O termo cujo "sentido" é ele mesmo — a tradução que voltou sem traduzir (a
	// "la cometa" de kernel.md "Conferência de qualidade"), o cognato — não vira par,
	// pela mesma razão das palavras das frases, abaixo: ele se liga sozinho.
	const perfis = { alvo: targetProfile, origem: sourceProfile };
	const doVocab = unicos(
		vocab
			.map((ref) => ({ left: ref.data.term, right: ref.data.translation }))
			.filter((par) => !mesmoTexto(par.left, par.right, perfis))
	);
	// Palavra que o tradutor devolveu igual (nome, cognato que ele não traduziu)
	// não é par: o aluno ligaria "hotel" a "hotel" sem ler nada.
	const dasFrases = unicos(
		palavras
			.filter(
				(p) =>
					p.termo.trim() &&
					p.sentido.trim() &&
					normalize(p.termo, targetProfile) !== normalize(p.sentido, sourceProfile)
			)
			.map((p) => ({ left: p.termo, right: p.sentido })),
		doVocab
	);
	if (doVocab.length + dasFrases.length < MIN_PARES) return null;

	// Determinístico a partir da seed da atividade (regra inviolável nº 8): a
	// mesma atividade fecha sempre com os mesmos pares. Quem embaralha as
	// colunas na tela é o `toRuntime`, com a seed da TENTATIVA.
	//
	// O vocabulário que o professor cadastrou tem a vez; as palavras das frases
	// só completam até o teto. Cada fonte é sorteada entre ela mesma.
	const daVez = pickWithSeed(doVocab, Math.min(MAX_PARES, doVocab.length), `${options.seed}:fecho`);
	const completam = pickWithSeed(
		dasFrases,
		Math.min(MAX_PARES - daVez.length, dasFrases.length),
		`${options.seed}:fecho-frases`
	);

	return {
		// Sem `sourceContentId`: este item não nasce de UMA unidade, nasce de
		// várias. Preencher com uma delas mentiria no relatório do professor.
		id: `${options.seed}:closing-match`,
		sourceContentId: null,
		generatedBy: 'closing-match',
		prompt: { kind: 'text', instructionKey: 'match-pairs' },
		interaction: { type: 'match', payload: { pairs: [...daVez, ...completam] } },
		grading: { mode: 'set' },
		locale: { source: sourceProfile.tag, target: targetProfile.tag }
	};
}

/**
 * Termos repetidos quebram a associação: com dois "livro" à direita, dois pares
 * ficam igualmente certos e o aluno perde ponto por acertar. Fica o primeiro —
 * e `jaUsados` são os pares de outra fonte, que também contam como repetidos.
 */
function unicos(pares: Par[], jaUsados: Par[] = []): Par[] {
	const esquerda = new Set(jaUsados.map((p) => p.left));
	const direita = new Set(jaUsados.map((p) => p.right));
	return pares.filter((par) => {
		if (esquerda.has(par.left) || direita.has(par.right)) return false;
		esquerda.add(par.left);
		direita.add(par.right);
		return true;
	});
}
