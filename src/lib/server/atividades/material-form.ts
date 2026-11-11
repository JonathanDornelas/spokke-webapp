import { z } from 'zod';
import { contentUnitKinds } from '$lib/kernel/content/types';
import { campoIdioma } from '$lib/idiomas';
import {
	TraducaoIndisponivel,
	completarTraducoes,
	type ParDeIdiomas,
	type Tradutor
} from '$lib/server/traducao';

/**
 * Os campos que um formulário de material manda, e como eles viram o
 * `ContentUnit` do kernel.
 *
 * Mora aqui e não dentro de uma `.remote.ts` porque DOIS lugares preenchem o
 * mesmo material: a etapa 2 do wizard e a biblioteca (`(studio)/materiais`) —
 * e um arquivo `.remote.ts` só pode exportar remote functions, então não dá
 * para compartilhar a partir de lá.
 */

export const camposMaterial = {
	kind: z.enum(contentUnitKinds),
	/** Frase no idioma alvo · termo · título do texto. */
	target: z.string().optional(),
	/** Tradução na língua do aluno · sentido do termo. */
	source: z.string().optional(),
	/** O corpo do `Passage`. */
	raw: z.string().optional(),
	/** Nota do professor num `SentencePair` — nunca vai para o aluno. */
	note: z.string().optional(),
	/** Frase de exemplo de um `VocabItem`. */
	example: z.string().optional(),
	/** `[{ question, answer }]` do `Passage`. */
	questions: z.string().optional(),
	/** `[{ speaker, text }]` do `Dialogue`. */
	lines: z.string().optional(),
	/**
	 * A tag de idioma, só na BIBLIOTECA — no wizard o material é da atividade e
	 * o idioma dela vale. Vazio = sem idioma.
	 */
	idioma: campoIdioma,
	/**
	 * Para onde vai a tradução automática, só na BIBLIOTECA: a mesma língua do
	 * aluno que a página usa para a IA. No wizard vale a da atividade.
	 */
	linguaDoAluno: campoIdioma
};

export type CamposMaterial = {
	kind: (typeof contentUnitKinds)[number];
	target?: string;
	source?: string;
	raw?: string;
	note?: string;
	example?: string;
	questions?: string;
	lines?: string;
	idioma?: string | null;
	linguaDoAluno?: string | null;
};

/** Quem diz "não deu para traduzir" escreve isto — uma frase, a mesma nas duas telas. */
export const AVISO_SEM_TRADUTOR =
	'O tradutor automático não respondeu agora. Escreva a tradução ou tente de novo em instantes.';

/**
 * A tradução que veio EM BRANCO num par de frases ou num termo sai do tradutor
 * automático (docs/adr-006-traducao.md). O que o professor escreveu nunca é
 * tocado, e sem tradutor nada muda: `montarMaterial` continua pedindo a
 * tradução, como sempre pediu.
 *
 * `par` nulo é material sem idioma na biblioteca — não há de onde traduzir.
 */
export async function preencherTraducao(
	campos: CamposMaterial,
	par: ParDeIdiomas | null,
	tradutor: Tradutor | null
): Promise<{ campos: CamposMaterial; traduzida: boolean } | { error: string }> {
	const temTraducao = campos.kind === 'SentencePair' || campos.kind === 'VocabItem';
	if (!temTraducao || !tradutor || !texto(campos.target) || texto(campos.source)) {
		return { campos, traduzida: false };
	}
	if (!par) {
		return {
			error: 'Escolha o idioma do material para a tradução vir sozinha, ou escreva a tradução.'
		};
	}
	try {
		const { unidades, traduzidas } = await completarTraducoes(
			[{ target: texto(campos.target), source: '' }],
			{ texto: 'target', traducao: 'source' },
			par,
			tradutor
		);
		return { campos: { ...campos, source: unidades[0].source }, traduzida: traduzidas > 0 };
	} catch (erro) {
		if (erro instanceof TraducaoIndisponivel) return { error: AVISO_SEM_TRADUTOR };
		throw erro;
	}
}

/**
 * O mesmo para o LOTE colado: as linhas sem separador (que o parser deixou com
 * a tradução em branco) são traduzidas num pedido só. Falhou o tradutor, nada é
 * gravado — metade da lista sem tradução não é a lista que o professor colou.
 */
export async function traduzirLote(
	kind: 'SentencePair' | 'VocabItem',
	unidades: unknown[],
	par: ParDeIdiomas | null,
	tradutor: Tradutor | null
): Promise<{ unidades: unknown[]; traduzidas: number } | { error: string }> {
	const registros = unidades.filter(
		(u): u is Record<string, unknown> => typeof u === 'object' && u !== null
	);
	const campos =
		kind === 'SentencePair'
			? { texto: 'target', traducao: 'source' }
			: { texto: 'term', traducao: 'translation' };
	const faltando = registros.some((u) => !texto(u[campos.traducao]));
	if (!faltando) return { unidades, traduzidas: 0 };
	if (!tradutor || !par) {
		// Sem tradutor o parser nem deixa a linha entrar; isto é a guarda.
		return { unidades: registros.filter((u) => texto(u[campos.traducao])), traduzidas: 0 };
	}
	try {
		return await completarTraducoes(registros, campos, par, tradutor);
	} catch (erro) {
		if (erro instanceof TraducaoIndisponivel) {
			return {
				error:
					'O tradutor automático não respondeu agora, e as linhas sem tradução ficaram de fora. Escreva a tradução depois do separador ou tente de novo em instantes.'
			};
		}
		throw erro;
	}
}

/** Lista montada na tela; JSON quebrado aqui é bug de código, não do professor. */
function listaDeJson(bruto: string | undefined): Record<string, unknown>[] {
	if (!bruto) return [];
	try {
		const valor: unknown = JSON.parse(bruto);
		return Array.isArray(valor) ? (valor as Record<string, unknown>[]) : [];
	} catch {
		return [];
	}
}

function texto(valor: unknown): string {
	return typeof valor === 'string' ? valor.trim() : '';
}

/**
 * Os campos da tela viram o `ContentUnit` do kernel — ou uma mensagem
 * dizendo o que falta. Nunca uma exceção: campo em branco é erro do
 * formulário, não corrupção de dado.
 */
export function montarMaterial(campos: CamposMaterial): { dados: unknown } | { error: string } {
	const alvo = texto(campos.target);
	const traducao = texto(campos.source);

	if (campos.kind === 'SentencePair') {
		if (!alvo || !traducao) return { error: 'Preencha a frase e a tradução.' };
		const nota = texto(campos.note);
		return { dados: { target: alvo, source: traducao, ...(nota ? { note: nota } : {}) } };
	}

	if (campos.kind === 'VocabItem') {
		if (!alvo || !traducao) return { error: 'Preencha o termo e o sentido.' };
		const exemplo = texto(campos.example);
		return {
			dados: { term: alvo, translation: traducao, ...(exemplo ? { example: exemplo } : {}) }
		};
	}

	if (campos.kind === 'Passage') {
		const corpo = texto(campos.raw);
		if (!alvo) return { error: 'Dê um título ao texto.' };
		if (!corpo) return { error: 'Escreva o texto.' };
		// Pergunta pela metade é descartada: meia pergunta não gera exercício
		// e guardá-la só faria o material parecer completo.
		const perguntas = listaDeJson(campos.questions)
			.map((q) => ({ question: texto(q.question), answer: texto(q.answer) }))
			.filter((q) => q.question && q.answer);
		return { dados: { title: alvo, text: corpo, questions: perguntas } };
	}

	const falas = listaDeJson(campos.lines)
		.map((l) => ({ speaker: texto(l.speaker) || 'A', text: texto(l.text) }))
		.filter((l) => l.text);
	if (falas.length < 2) return { error: 'Um diálogo precisa de pelo menos duas falas.' };
	return { dados: { lines: falas } };
}
