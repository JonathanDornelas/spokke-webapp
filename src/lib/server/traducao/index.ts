/**
 * A tradução automática do MATERIAL (docs/adr-006-traducao.md).
 *
 * O professor cadastra no idioma que ensina e a frase do aluno sai daqui: ele
 * confere e ajusta, mas não digita duas vezes. As três formas de ter a
 * tradução continuam valendo, nesta ordem de força:
 *
 * 1. a que o PROFESSOR escreveu — nunca é sobrescrita;
 * 2. a da IA, quando ele gera o material com ela (`server/ia`);
 * 3. a automática, deste módulo, que só preenche o que veio em branco.
 *
 * **É tradução de autoria, não de runtime.** Acontece quando o professor
 * cadastra, nunca quando o aluno responde, e nada aqui é veredito de correção.
 *
 * Atrás de interface própria, como a IA e a voz: `TRANSLATE_PROVIDER` vazio é
 * DESLIGADA (a tela pede a tradução ao professor, como sempre pediu), e
 * `audiotext` é o tradutor do serviço de áudio (`../audiotext-service`, o outro
 * projeto do workspace). `process.env`, como o TTS e o ASR.
 */
import {
	AudiotextError,
	traduzir as traduzirNoAudiotext,
	traduzirComAlternativas,
	traduzirComecandoPor
} from '$lib/server/audiotext/client';
import { languageProfiles } from '$lib/kernel/language/profiles';
import { normalize } from '$lib/kernel/language/normalize';
import { mesmoTexto } from '$lib/kernel/qualidade/comparar';
import type { PerfisDaConferencia } from '$lib/kernel/qualidade';

export interface Tradutor {
	readonly nome: string;
	/** Na ordem e na quantidade do pedido. Texto vazio volta vazio. */
	traduzir(textos: string[], de: string, para: string): Promise<string[]>;
	/**
	 * Várias traduções por texto, na ordem do pedido: a principal primeiro e as
	 * alternativas que o modelo achou quase tão boas depois. Opcional — o
	 * provedor que não sabe fazer isso não oferece, e as questões ficam só com a
	 * resposta do professor.
	 */
	alternativas?(textos: string[], de: string, para: string, quantas: number): Promise<string[][]>;
	/**
	 * Como `alternativas`, com cada tradução COMEÇANDO por `comeco` ("Eu", "Nós"):
	 * o modelo escreve o resto. Serve para conferir o sujeito que a língua do aluno
	 * deixa omitir (`variantes-aceitas.ts`). Opcional, como as alternativas.
	 */
	comecandoPor?(
		textos: string[],
		de: string,
		para: string,
		comeco: string,
		quantas: number
	): Promise<string[][]>;
}

/**
 * O tradutor não respondeu — fora do ar, carregando, fila cheia. A tela vira
 * "escreva a tradução" e nada é gravado pela metade: um lote com metade das
 * linhas sem tradução não é um lote que o professor pediu.
 */
export class TraducaoIndisponivel extends Error {}

const audiotext: Tradutor = {
	nome: 'audiotext',
	async traduzir(textos, de, para) {
		try {
			return await traduzirNoAudiotext(textos, de, para);
		} catch (erro) {
			const detalhe = erro instanceof AudiotextError ? erro.message : String(erro);
			throw new TraducaoIndisponivel(detalhe);
		}
	},
	async alternativas(textos, de, para, quantas) {
		try {
			return await traduzirComAlternativas(textos, de, para, quantas);
		} catch (erro) {
			const detalhe = erro instanceof AudiotextError ? erro.message : String(erro);
			throw new TraducaoIndisponivel(detalhe);
		}
	},
	async comecandoPor(textos, de, para, comeco, quantas) {
		try {
			return await traduzirComecandoPor(textos, de, para, comeco, quantas);
		} catch (erro) {
			const detalhe = erro instanceof AudiotextError ? erro.message : String(erro);
			throw new TraducaoIndisponivel(detalhe);
		}
	}
};

export function isTraducaoLigada(): boolean {
	return !!process.env.TRANSLATE_PROVIDER;
}

export function getTradutor(): Tradutor | null {
	const nome = process.env.TRANSLATE_PROVIDER;
	if (!nome) return null;
	if (nome === 'audiotext') return audiotext;
	throw new Error(
		`TRANSLATE_PROVIDER="${nome}" não é um provedor conhecido. Use "audiotext" (o tradutor do serviço de áudio) ou deixe vazio para desligar.`
	);
}

/** De que idioma, para qual. As duas pontas são tags de `LanguageProfile`. */
export interface ParDeIdiomas {
	de: string;
	para: string;
}

/** Os dois perfis do par, quando as duas pontas são tags de `LanguageProfile`. */
function perfisDoPar(par: ParDeIdiomas): PerfisDaConferencia | null {
	const alvo = languageProfiles[par.de];
	const origem = languageProfiles[par.para];
	return alvo && origem ? { alvo, origem } : null;
}

/**
 * A "tradução" que voltou IGUAL ao original não é tradução: o modelo devolveu o
 * texto sem traduzir. Foi o caso da "la cometa" (kernel.md "Conferência de
 * qualidade") — do espanhol para o português o tradutor devolveu "la cometa", e
 * toda questão daquele termo mostrava a resposta no enunciado.
 *
 * A comparação é a do normalizador do kernel (regra nº 6), pelos dois perfis:
 * "La cometa." e "la cometa" são o mesmo texto. Sem os dois perfis (não acontece
 * hoje: o par vem de tags de `LanguageProfile`), só a forma Unicode.
 */
export function voltouSemTraduzir(original: string, traducao: string, par: ParDeIdiomas): boolean {
	const perfis = perfisDoPar(par);
	if (perfis) {
		return perfis.alvo.tag !== perfis.origem.tag && mesmoTexto(original, traducao, perfis);
	}
	return original.trim().normalize('NFC') === traducao.trim().normalize('NFC');
}

export interface OpcoesDaConferencia {
	/**
	 * A conferência da PALAVRA (o vocabulário): além de não repetir o original, a
	 * tradução tem de fazer a ida e volta. Sem isto, só a primeira regra vale.
	 */
	idaEVolta?: boolean;
}

/**
 * Traduz CONFERINDO, para o material (a tradução que vai ser gravada) — o mesmo
 * desenho da síntese de voz, que é ouvida antes de ir para o bucket e trocada
 * quando sai errada (server.md "TTS"). Sem IA: quem confere é o próprio tradutor.
 *
 * **Toda tradução**: a que volta IGUAL ao original é reprovada e fica em branco
 * (`voltouSemTraduzir`).
 *
 * **A da palavra passa pela ida e volta** (`idaEVolta`, o vocabulário). Medido no
 * MADLAD com 88 palavras de aula, do espanhol e do inglês para o português:
 * solta, sem contexto, uma em quatro sai errada — "el perro" virou "Sobre o cão",
 * "el tenedor" "com o garfo", "la rata" "a taxa", "hat" "O quê?". Mas a certa
 * quase sempre está entre as outras hipóteses do feixe ("o cão", "o garfo"), e
 * o que separa uma da outra é traduzir de volta: "o cão" volta "el perro",
 * "Sobre o cão" volta "Sobre el perro". Então:
 *
 * 1. pede-se a tradução com as alternativas do feixe;
 * 2. cada hipótese (até `CANDIDATAS_POR_PALAVRA`, na ordem de confiança do
 *    modelo) é traduzida de volta, também com alternativas;
 * 3. fica a PRIMEIRA cuja volta dá o original — a reserva da reprovada é a
 *    hipótese seguinte, como a fala devagar reprovada é trocada pela normal
 *    esticada;
 * 4. nenhuma voltou: VAZIO. Quem chama não grava, e o professor escreve —
 *    tradução errada em silêncio é pior que campo vazio.
 *
 * O preço é conhecido e foi medido junto: a ida e volta também recusa tradução
 * certa ("parents" → "pais" volta "country", "eraser" → "borracha" volta
 * "rubber"). Essas o professor escreve.
 *
 * Entre duas hipóteses que a correção trataria como a mesma ("O cão", "o cão",
 * "O cão."), fica a que tem a FORMA do original: sem ponto final se ele não tem,
 * com a inicial na mesma caixa. Numa questão de escolher, a única alternativa
 * com maiúscula entregaria a resposta.
 *
 * Na ordem e na quantidade do pedido. A falha do tradutor sobe
 * (`TraducaoIndisponivel`). Sem alternativas no provedor, ou com um idioma fora
 * dos profiles, a palavra fica só com a primeira regra.
 */
export async function traduzirConferindo(
	textos: string[],
	par: ParDeIdiomas,
	tradutor: Tradutor,
	opcoes: OpcoesDaConferencia = {}
): Promise<string[]> {
	const perfis = perfisDoPar(par);
	if (opcoes.idaEVolta && tradutor.alternativas && perfis) {
		return traduzirPelaIdaEVolta(textos, par, tradutor.alternativas.bind(tradutor), perfis);
	}
	const traducoes = (await tradutor.traduzir(textos, par.de, par.para)).map((t) => t?.trim() ?? '');
	return textos.map((original, i) => {
		const traducao = traducoes[i] ?? '';
		return traducao && !voltouSemTraduzir(original, traducao, par) ? traducao : '';
	});
}

/** Quantas hipóteses do feixe são traduzidas de volta, por palavra. */
export const CANDIDATAS_POR_PALAVRA = 3;
/** Quantas alternativas pedir ao serviço — o teto dele. */
const ALTERNATIVAS_PEDIDAS = 4;

/** O texto termina em pontuação ("O chefe.", "O quê?"). */
const terminaEmPontuacao = (texto: string) => /\p{P}$/u.test(texto.trim());

/** A primeira letra é maiúscula. Em escrita sem caixa, nunca é. */
function comecaEmMaiuscula(texto: string, tag: string): boolean {
	const primeira = [...texto.trim()][0] ?? '';
	return primeira !== primeira.toLocaleLowerCase(tag);
}

/**
 * As hipóteses do feixe que valem a pena traduzir de volta, na ordem do modelo:
 * sem a vazia, sem a que repete o original e uma só de cada grupo que o
 * normalizador iguala — a que tem a forma do original.
 */
export function candidatasDaPalavra(
	original: string,
	hipoteses: string[],
	par: ParDeIdiomas,
	perfis: PerfisDaConferencia
): string[] {
	const grupos = new Map<string, string[]>();
	for (const bruta of hipoteses) {
		const hipotese = bruta?.trim() ?? '';
		if (!hipotese || voltouSemTraduzir(original, hipotese, par)) continue;
		const chave = normalize(hipotese, perfis.origem).trim();
		if (!chave) continue;
		grupos.set(chave, [...(grupos.get(chave) ?? []), hipotese]);
	}
	const distancia = (hipotese: string) =>
		Number(terminaEmPontuacao(hipotese) !== terminaEmPontuacao(original)) +
		Number(
			comecaEmMaiuscula(hipotese, perfis.origem.tag) !==
				comecaEmMaiuscula(original, perfis.alvo.tag)
		);
	return [...grupos.values()]
		.slice(0, CANDIDATAS_POR_PALAVRA)
		.map((formas) => formas.reduce((melhor, f) => (distancia(f) < distancia(melhor) ? f : melhor)));
}

async function traduzirPelaIdaEVolta(
	textos: string[],
	par: ParDeIdiomas,
	alternativas: NonNullable<Tradutor['alternativas']>,
	perfis: PerfisDaConferencia
): Promise<string[]> {
	const pendentes = textos.map((t) => t.trim());
	const ida = await alternativas(pendentes, par.de, par.para, ALTERNATIVAS_PEDIDAS);
	if (ida.length !== textos.length) {
		throw new TraducaoIndisponivel('o tradutor devolveu outra quantidade de textos');
	}
	const candidatas = pendentes.map((original, i) =>
		original ? candidatasDaPalavra(original, ida[i] ?? [], par, perfis) : []
	);
	const planas = candidatas.flat();
	if (planas.length === 0) return textos.map(() => '');

	const volta = await alternativas(planas, par.para, par.de, ALTERNATIVAS_PEDIDAS);
	if (volta.length !== planas.length) {
		throw new TraducaoIndisponivel('o tradutor devolveu outra quantidade de textos');
	}
	let cursor = 0;
	return pendentes.map((original, i) => {
		const lista = candidatas[i] ?? [];
		const confirmada = lista.find((_, n) =>
			(volta[cursor + n] ?? []).some((v) => mesmoTexto(v, original, perfis))
		);
		cursor += lista.length;
		return confirmada ?? '';
	});
}

/**
 * Preenche as traduções que vieram EM BRANCO, num pedido só. O que o professor
 * escreveu fica como está.
 *
 * Genérico no formato: quem chama diz onde está o texto a traduzir e onde vai
 * a tradução (`SentencePair` é `target` → `source`; `VocabItem`, `term` →
 * `translation`), e se a tradução é de palavra (`opcoes.idaEVolta`). Devolve
 * quantas traduções vieram do tradutor — a tela diz isso, para o professor saber
 * o que conferir — e quantas ele NÃO soube fazer (`semTraducao`: reprovadas pela
 * conferência, ver `traduzirConferindo`), que continuam em branco.
 */
export async function completarTraducoes<T extends Record<string, unknown>>(
	unidades: T[],
	campos: { texto: keyof T & string; traducao: keyof T & string },
	par: ParDeIdiomas,
	tradutor: Tradutor,
	opcoes: OpcoesDaConferencia = {}
): Promise<{ unidades: T[]; traduzidas: number; semTraducao: number }> {
	const texto = (u: T, campo: string) => (typeof u[campo] === 'string' ? u[campo].trim() : '');
	const faltam = unidades
		.map((u, i) => ({ i, origem: texto(u, campos.texto) }))
		.filter(({ i, origem }) => origem && !texto(unidades[i], campos.traducao));
	if (faltam.length === 0) return { unidades, traduzidas: 0, semTraducao: 0 };

	const traducoes = await traduzirConferindo(
		faltam.map((f) => f.origem),
		par,
		tradutor,
		opcoes
	);
	const saida = [...unidades];
	let traduzidas = 0;
	faltam.forEach(({ i }, n) => {
		const traducao = traducoes[n]?.trim();
		if (!traducao) return;
		saida[i] = { ...saida[i], [campos.traducao]: traducao };
		traduzidas++;
	});
	return { unidades: saida, traduzidas, semTraducao: faltam.length - traduzidas };
}
