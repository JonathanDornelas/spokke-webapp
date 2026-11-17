import { afterEach, describe, expect, it, vi } from 'vitest';
import { languageProfiles } from '$lib/kernel/language/profiles';
import {
	TraducaoIndisponivel,
	candidatasDaPalavra,
	completarTraducoes,
	getTradutor,
	isTraducaoLigada,
	traduzirConferindo,
	voltouSemTraduzir,
	type Tradutor
} from './index';

/** Tradutor de mentira: marca o destino e conta as chamadas — sem rede. */
function tradutorFalso(): Tradutor & { chamadas: string[][] } {
	const chamadas: string[][] = [];
	return {
		nome: 'falso',
		chamadas,
		async traduzir(textos, _de, para) {
			chamadas.push([...textos]);
			return textos.map((t) => `[${para}] ${t}`);
		}
	};
}

describe('completarTraducoes', () => {
	const par = { de: 'en-US', para: 'pt-BR' };
	const campos = { texto: 'target', traducao: 'source' } as const;

	it('preenche só o que veio em branco, num pedido só', async () => {
		const tradutor = tradutorFalso();
		const { unidades, traduzidas } = await completarTraducoes(
			[
				{ target: 'I have a cat.', source: '' },
				{ target: 'She lives here.', source: 'Ela mora aqui.' },
				{ target: 'bookshop', source: '   ' }
			],
			campos,
			par,
			tradutor
		);
		expect(unidades).toEqual([
			{ target: 'I have a cat.', source: '[pt-BR] I have a cat.' },
			// A do professor NUNCA é sobrescrita.
			{ target: 'She lives here.', source: 'Ela mora aqui.' },
			{ target: 'bookshop', source: '[pt-BR] bookshop' }
		]);
		expect(traduzidas).toBe(2);
		expect(tradutor.chamadas).toEqual([['I have a cat.', 'bookshop']]);
	});

	it('sem nada em branco, não chama o tradutor', async () => {
		const tradutor = tradutorFalso();
		const entrada = [{ target: 'a', source: 'b' }];
		const r = await completarTraducoes(entrada, campos, par, tradutor);
		expect(r).toEqual({ unidades: entrada, traduzidas: 0, semTraducao: 0 });
		expect(tradutor.chamadas).toHaveLength(0);
	});

	it('frase vazia não vai ao tradutor (ele "traduziria" o nada)', async () => {
		const tradutor = tradutorFalso();
		await completarTraducoes([{ target: '  ', source: '' }], campos, par, tradutor);
		expect(tradutor.chamadas).toHaveLength(0);
	});

	it('tradução que volta vazia deixa o campo em branco, sem contar', async () => {
		const vazio: Tradutor = { nome: 'vazio', traduzir: async (t) => t.map(() => '  ') };
		const r = await completarTraducoes([{ target: 'x', source: '' }], campos, par, vazio);
		expect(r).toEqual({
			unidades: [{ target: 'x', source: '' }],
			traduzidas: 0,
			semTraducao: 1
		});
	});

	it('a falha do tradutor sobe para quem chama decidir', async () => {
		const fora: Tradutor = {
			nome: 'fora',
			traduzir: async () => {
				throw new TraducaoIndisponivel('503');
			}
		};
		await expect(
			completarTraducoes([{ target: 'x', source: '' }], campos, par, fora)
		).rejects.toBeInstanceOf(TraducaoIndisponivel);
	});
});

/**
 * A tradução CONFERIDA (kernel.md "Conferência de qualidade"): o caso que a
 * trouxe é "la cometa", que o tradutor devolveu sem traduzir e virou material
 * com a "tradução" igual ao termo.
 */
describe('traduzirConferindo — a tradução que volta igual ao original', () => {
	const esPt = { de: 'es-ES', para: 'pt-BR' };
	/** Devolve "la cometa" sem traduzir; o resto, traduz. */
	const teimoso = (): Tradutor => ({
		nome: 'teimoso',
		traduzir: async (textos) => textos.map((t) => (t === 'el perro' ? 'o cachorro' : `${t}.`))
	});

	it('reconhece a cópia mesmo com caixa e pontuação diferentes', () => {
		expect(voltouSemTraduzir('la cometa', 'La cometa.', esPt)).toBe(true);
		expect(voltouSemTraduzir('la cometa', 'a pipa', esPt)).toBe(false);
		// Idioma igual dos dois lados não tem o que traduzir: fica de fora da regra.
		expect(voltouSemTraduzir('casa', 'casa', { de: 'pt-BR', para: 'pt-BR' })).toBe(false);
	});

	it('a reprovada volta VAZIA: nada de gravar a frase como tradução dela', async () => {
		expect(await traduzirConferindo(['la cometa', 'el perro'], esPt, teimoso())).toEqual([
			'',
			'o cachorro'
		]);
	});

	it('completarTraducoes conta o que ficou sem tradução', async () => {
		const r = await completarTraducoes(
			[
				{ term: 'la cometa', translation: '' },
				{ term: 'el perro', translation: '' }
			],
			{ texto: 'term', traducao: 'translation' },
			esPt,
			teimoso()
		);
		expect(r).toEqual({
			unidades: [
				{ term: 'la cometa', translation: '' },
				{ term: 'el perro', translation: 'o cachorro' }
			],
			traduzidas: 1,
			semTraducao: 1
		});
	});
});

/**
 * A conferência da PALAVRA (server.md "Tradução do material"). As hipóteses são
 * as que o MADLAD deu de verdade no serviço de áudio: a primeira de "el perro"
 * é "Sobre o cão", e a certa vem depois.
 */
describe('traduzirConferindo — a palavra, pela ida e volta', () => {
	const esPt = { de: 'es-ES', para: 'pt-BR' };
	const perfis = { alvo: languageProfiles['es-ES']!, origem: languageProfiles['pt-BR']! };
	const FEIXE: Record<string, string[]> = {
		// ida
		'el perro': ['Sobre o cão', 'o cão', 'O cão'],
		'el jefe': ['O chefe.', 'O chefe', 'O patrão.', 'o chefe'],
		'la rata': ['a taxa', 'taxa', 'Taxa'],
		'la cometa': ['La cometa', 'o cometa'],
		'el pañuelo': ['o lenço'],
		// volta
		'Sobre o cão': ['Sobre el perro', 'Acerca del perro'],
		'o cão': ['El perro'],
		'o chefe': ['El jefe.'],
		'O patrão.': ['El patrón.'],
		'a taxa': ['a tasa', 'la tasa'],
		taxa: ['Tasa'],
		'o cometa': ['o cometa'],
		// A certa nem sempre é a primeira da volta: vale estar entre as hipóteses.
		'o lenço': ['La bufanda', 'El pañuelo']
	};
	function dePalavras() {
		const pedidos: string[][] = [];
		const tradutor: Tradutor = {
			nome: 'de palavras',
			traduzir: async (textos) => textos.map((t) => FEIXE[t]?.[0] ?? ''),
			alternativas: async (textos) => {
				pedidos.push([...textos]);
				return textos.map((t) => FEIXE[t] ?? []);
			}
		};
		return { tradutor, pedidos };
	}
	const conferir = (textos: string[]) =>
		traduzirConferindo(textos, esPt, dePalavras().tradutor, { idaEVolta: true });

	it('fica a hipótese que volta, não a primeira do feixe', async () => {
		expect(await conferir(['el perro'])).toEqual(['o cão']);
	});

	it('vale a volta que está entre as hipóteses, não só a primeira', async () => {
		expect(await conferir(['el pañuelo'])).toEqual(['o lenço']);
	});

	it('nenhuma hipótese volta: VAZIO, e o professor escreve', async () => {
		// "a taxa" volta "la tasa", não "la rata"; "o cometa" não é "la cometa".
		expect(await conferir(['la rata', 'la cometa'])).toEqual(['', '']);
	});

	it('entre as formas iguais para a correção, fica a que tem a forma do original', async () => {
		// "O chefe.", "O chefe" e "o chefe" são a mesma resposta: sem ponto e em minúscula,
		// como "el jefe". Numa questão de escolher, a única com maiúscula entregaria a certa.
		expect(await conferir(['el jefe'])).toEqual(['o chefe']);
		expect(
			candidatasDaPalavra('el jefe', ['O chefe.', 'O chefe', 'O patrão.', 'o chefe'], esPt, perfis)
		).toEqual(['o chefe', 'O patrão.']);
		// A que repete o original não é candidata.
		expect(candidatasDaPalavra('la cometa', ['La cometa.', 'o cometa'], esPt, perfis)).toEqual([
			'o cometa'
		]);
	});

	it('são DOIS pedidos para a lista inteira: a ida e a volta', async () => {
		const { tradutor, pedidos } = dePalavras();
		expect(
			await traduzirConferindo(['el perro', '', 'la rata'], esPt, tradutor, { idaEVolta: true })
		).toEqual(['o cão', '', '']);
		expect(pedidos).toHaveLength(2);
		expect(pedidos[0]).toEqual(['el perro', '', 'la rata']);
	});

	it('sem a opção (a frase), vale só a regra de não repetir o original', async () => {
		const { tradutor, pedidos } = dePalavras();
		expect(await traduzirConferindo(['el perro'], esPt, tradutor)).toEqual(['Sobre o cão']);
		expect(pedidos).toHaveLength(0);
	});

	it('provedor sem alternativas: a palavra fica só com a primeira regra', async () => {
		const simples: Tradutor = { nome: 'simples', traduzir: async (t) => t.map(() => 'o cão') };
		expect(await traduzirConferindo(['el perro'], esPt, simples, { idaEVolta: true })).toEqual([
			'o cão'
		]);
	});

	it('resposta com outra contagem é falha do tradutor, não tradução trocada de linha', async () => {
		const torto: Tradutor = {
			nome: 'torto',
			traduzir: async () => [],
			alternativas: async () => [['o cão']]
		};
		await expect(
			traduzirConferindo(['el perro', 'la rata'], esPt, torto, { idaEVolta: true })
		).rejects.toBeInstanceOf(TraducaoIndisponivel);
	});
});

describe('qual tradutor', () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('vazio é desligado — e a tela pede a tradução ao professor', () => {
		vi.stubEnv('TRANSLATE_PROVIDER', '');
		expect(isTraducaoLigada()).toBe(false);
		expect(getTradutor()).toBeNull();
	});

	it('audiotext é o do serviço de áudio', () => {
		vi.stubEnv('TRANSLATE_PROVIDER', 'audiotext');
		expect(isTraducaoLigada()).toBe(true);
		expect(getTradutor()?.nome).toBe('audiotext');
	});

	it('provedor desconhecido é erro de configuração, não "desligado"', () => {
		vi.stubEnv('TRANSLATE_PROVIDER', 'outro');
		expect(() => getTradutor()).toThrow(/não é um provedor conhecido/);
	});
});

/**
 * Os idiomas que o tradutor do serviço de áudio aceita, pelo código BASE. A
 * fonte é `audiotext-service/app/traducao.py` (`IDIOMAS`).
 *
 * Mora no teste, não no kernel, pela mesma razão do mapa de vozes de
 * `profiles.test.ts`: ele é a contraparte independente. Idioma novo no produto
 * sem tradutor faria a tela prometer "sai sozinha" e o serviço responder 400.
 */
const IDIOMAS_DO_TRADUTOR = ['pt', 'en', 'es', 'fr', 'it', 'hi', 'zh', 'ja', 'ar'];

describe('cobertura de idiomas', () => {
	it('todo idioma do produto tem tradução', () => {
		const semTradutor = Object.keys(languageProfiles).filter(
			(tag) => !IDIOMAS_DO_TRADUTOR.includes(tag.split('-')[0].toLowerCase())
		);
		expect(semTradutor).toEqual([]);
	});
});
