import { z } from 'zod';
import { contentUnitKinds } from '$lib/kernel/content/types';
import { campoIdioma } from '$lib/idiomas';
import { limparVariacoes } from '$lib/atividades/variacoes';
import { getProfile } from '$lib/kernel/language/profiles';
import {
	TraducaoIndisponivel,
	completarTraducoes,
	type ParDeIdiomas,
	type Tradutor
} from '$lib/server/traducao';
import { variantesDasFrases } from '$lib/server/atividades/variantes-aceitas';
import { MAX_PALAVRAS_DO_TERMO, problemaDoVocabulario } from '$lib/kernel/content/vocabulario';
import { previewRawLines } from '$lib/kernel/content/parse-raw';

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
	 * As outras formas certas de traduzir um par de frases, em JSON (`string[]`):
	 * as que o tradutor sugeriu e o professor manteve, mais as que ele escreveu.
	 */
	variants: z.string().optional(),
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
	variants?: string;
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
 * **No par de frases, as variações vêm junto** — as mesmas que a tela mostraria
 * se a sugestão tivesse chegado antes de ele salvar (`variantesDasFrases`),
 * somadas às que ele escreveu. Falhar nelas não impede gravar.
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
		const source = unidades[0].source;
		if (campos.kind !== 'SentencePair' || traduzidas === 0) {
			// O sentido de uma PALAVRA não leva ponto final: o tradutor às vezes põe, e a
			// regra do vocabulário (`problemaDoVocabulario`) recusaria o que ele escreveu.
			const sentido = campos.kind === 'VocabItem' ? semPontoFinal(source) : source;
			return { campos: { ...campos, source: sentido }, traduzida: traduzidas > 0 };
		}
		const [automaticas] = await variacoesAutomaticas(
			[{ original: texto(campos.target), principal: source }],
			par,
			tradutor
		);
		const doProfessor = variantesDe(campos.variants, source);
		return {
			campos: {
				...campos,
				source,
				variants: JSON.stringify(limparVariacoes([...doProfessor, ...(automaticas ?? [])], source))
			},
			traduzida: true
		};
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
		const embranco = new Set(registros.flatMap((u, i) => (texto(u[campos.traducao]) ? [] : [i])));
		const traduzido = await completarTraducoes(registros, campos, par, tradutor);
		if (kind !== 'SentencePair') {
			// O sentido de uma palavra, sem o ponto final que o tradutor às vezes põe.
			const unidades = traduzido.unidades.map((u, i) =>
				embranco.has(i) && typeof u === 'object' && u !== null
					? {
							...(u as Record<string, unknown>),
							translation: semPontoFinal(texto((u as Record<string, unknown>).translation))
						}
					: u
			);
			return { unidades, traduzidas: traduzido.traduzidas };
		}
		// As linhas que o tradutor completou ganham as variações também, num pedido
		// para a lista toda (`variantesDasFrases`).
		const alvos = traduzido.unidades.flatMap((u, i) => {
			if (!embranco.has(i) || typeof u !== 'object' || u === null) return [];
			const registro = u as Record<string, unknown>;
			return [{ i, original: texto(registro.target), principal: texto(registro.source) }];
		});
		const variacoes = await variacoesAutomaticas(alvos, par, tradutor);
		const unidades = [...traduzido.unidades];
		alvos.forEach(({ i, principal }, n) => {
			const lista = limparVariacoes(variacoes[n] ?? [], principal);
			if (lista.length > 0) unidades[i] = { ...(unidades[i] as object), variants: lista };
		});
		return { unidades, traduzidas: traduzido.traduzidas };
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

/**
 * As variações que o tradutor propõe para as frases que ELE traduziu, pelo
 * mesmo funil das questões. Nunca derruba a gravação: sem resposta, nenhuma.
 */
async function variacoesAutomaticas(
	frases: { original: string; principal: string }[],
	par: ParDeIdiomas,
	tradutor: Tradutor
): Promise<string[][]> {
	if (frases.length === 0) return [];
	return variantesDasFrases(
		frases,
		{ alvo: getProfile(par.de), origem: getProfile(par.para) },
		tradutor
	).catch(() => frases.map(() => []));
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

/** As variações do campo escondido (JSON), como vão ser gravadas (`limparVariacoes`). */
function variantesDe(bruto: string | undefined, traducao: string): string[] {
	if (!bruto) return [];
	try {
		return limparVariacoes(JSON.parse(bruto), traducao);
	} catch {
		return [];
	}
}

function texto(valor: unknown): string {
	return typeof valor === 'string' ? valor.trim() : '';
}

/** Sem o ponto final (de qualquer escrita do produto) que o tradutor põe no fim. */
function semPontoFinal(valor: string): string {
	return valor.replace(/[.。．｡]+\s*$/u, '').trim();
}

/**
 * Por que nenhuma linha da lista colada entrou, numa frase para o professor: a
 * falta de separador, ou, no vocabulário, linhas que são frase. As duas telas de
 * colar (wizard e biblioteca) dizem a mesma coisa.
 */
export function nenhumaLinhaEntrou(
	kind: 'SentencePair' | 'VocabItem',
	raw: string,
	temTradutor: boolean
): string {
	const temSeparador = previewRawLines(raw, { traduzirSemSeparador: temTradutor }).some(
		(linha) => linha.ok
	);
	if (kind === 'VocabItem' && temSeparador) {
		return `Nenhuma linha virou vocabulário: ele é palavra ou expressão curta, de até ${MAX_PALAVRAS_DO_TERMO} palavras, sem pontuação de frase. Frases inteiras entram como Sentença.`;
	}
	return 'Nenhuma linha tem o separador. Use "alvo · tradução", um por linha.';
}

/**
 * Os campos da tela viram o `ContentUnit` do kernel — ou uma mensagem
 * dizendo o que falta. Nunca uma exceção: campo em branco é erro do
 * formulário, não corrupção de dado.
 */
export function montarMaterial(
	campos: CamposMaterial,
	/** As tags do par de idiomas: ligam a regra do vocabulário (só palavra, nunca frase). */
	tags?: { alvo: string; origem: string }
): { dados: unknown } | { error: string } {
	const alvo = texto(campos.target);
	const traducao = texto(campos.source);

	if (campos.kind === 'SentencePair') {
		if (!alvo || !traducao) return { error: 'Preencha a frase e a tradução.' };
		const nota = texto(campos.note);
		const variantes = variantesDe(campos.variants, traducao);
		return {
			dados: {
				target: alvo,
				source: traducao,
				...(nota ? { note: nota } : {}),
				...(variantes.length > 0 ? { variants: variantes } : {})
			}
		};
	}

	if (campos.kind === 'VocabItem') {
		if (!alvo || !traducao) return { error: 'Preencha o termo e o sentido.' };
		const problema = tags
			? problemaDoVocabulario({ term: alvo, translation: traducao }, tags)
			: null;
		if (problema) return { error: problema };
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
	// As perguntas sobre o diálogo, como as do texto. Sem nenhuma, o campo nem vai:
	// o material igual ao que já existe (gravado antes das perguntas) continua
	// sendo o MESMO para o reaproveitamento, que compara o jsonb inteiro.
	const perguntas = listaDeJson(campos.questions)
		.map((q) => ({ question: texto(q.question), answer: texto(q.answer) }))
		.filter((q) => q.question && q.answer);
	return {
		dados: perguntas.length > 0 ? { lines: falas, questions: perguntas } : { lines: falas }
	};
}
