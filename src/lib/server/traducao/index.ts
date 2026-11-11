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
	traduzirComAlternativas
} from '$lib/server/audiotext/client';

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

/**
 * Preenche as traduções que vieram EM BRANCO, num pedido só. O que o professor
 * escreveu fica como está.
 *
 * Genérico no formato: quem chama diz onde está o texto a traduzir e onde vai
 * a tradução (`SentencePair` é `target` → `source`; `VocabItem`, `term` →
 * `translation`). Devolve quantas traduções vieram do tradutor — a tela diz
 * isso, para o professor saber o que conferir.
 */
export async function completarTraducoes<T extends Record<string, unknown>>(
	unidades: T[],
	campos: { texto: keyof T & string; traducao: keyof T & string },
	par: ParDeIdiomas,
	tradutor: Tradutor
): Promise<{ unidades: T[]; traduzidas: number }> {
	const texto = (u: T, campo: string) => (typeof u[campo] === 'string' ? u[campo].trim() : '');
	const faltam = unidades
		.map((u, i) => ({ i, origem: texto(u, campos.texto) }))
		.filter(({ i, origem }) => origem && !texto(unidades[i], campos.traducao));
	if (faltam.length === 0) return { unidades, traduzidas: 0 };

	const traducoes = await tradutor.traduzir(
		faltam.map((f) => f.origem),
		par.de,
		par.para
	);
	const saida = [...unidades];
	let traduzidas = 0;
	faltam.forEach(({ i }, n) => {
		const traducao = traducoes[n]?.trim();
		if (!traducao) return;
		saida[i] = { ...saida[i], [campos.traducao]: traducao };
		traduzidas++;
	});
	return { unidades: saida, traduzidas };
}
