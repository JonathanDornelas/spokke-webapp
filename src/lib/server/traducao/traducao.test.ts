import { afterEach, describe, expect, it, vi } from 'vitest';
import { languageProfiles } from '$lib/kernel/language/profiles';
import {
	TraducaoIndisponivel,
	completarTraducoes,
	getTradutor,
	isTraducaoLigada,
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
		expect(r).toEqual({ unidades: entrada, traduzidas: 0 });
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
		expect(r).toEqual({ unidades: [{ target: 'x', source: '' }], traduzidas: 0 });
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
