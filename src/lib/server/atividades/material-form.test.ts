import { describe, expect, it } from 'vitest';
import {
	AVISO_SEM_TRADUTOR,
	montarMaterial,
	preencherTraducao,
	traduzirLote,
	type CamposMaterial
} from './material-form';
import { TraducaoIndisponivel, type Tradutor } from '$lib/server/traducao';

const par = { de: 'en-US', para: 'pt-BR' };

const tradutor: Tradutor = {
	nome: 'falso',
	traduzir: async (textos, _de, para) => textos.map((t) => `[${para}] ${t}`)
};

const fora: Tradutor = {
	nome: 'fora',
	traduzir: async () => {
		throw new TraducaoIndisponivel('audiotext 503');
	}
};

/**
 * Um tradutor que também propõe ALTERNATIVAS, como o do serviço de áudio: a ida
 * em inglês → português, as alternativas do feixe e a volta, que confirma o
 * sentido. O que não está nos mapas volta irreconhecível e cai na ida e volta.
 */
const IDA: Record<string, string> = {
	'I have already finished the report.': 'Já terminei o relatório.',
	'We live in Lisbon.': 'Vivemos em Lisboa.'
};
const FEIXE: Record<string, string[]> = {
	'I have already finished the report.': [
		'Já terminei o relatório.',
		'Eu já terminei o relatório.'
	],
	'We live in Lisbon.': ['Vivemos em Lisboa.', 'Nós vivemos em Lisboa.']
};
const VOLTA: Record<string, string> = {
	'Já terminei o relatório.': 'I have already finished the report.',
	'Eu já terminei o relatório.': 'I have already finished the report.',
	'Vivemos em Lisboa.': 'We live in Lisbon.',
	'Nós vivemos em Lisboa.': 'We live in Lisbon.'
};
const comAlternativas: Tradutor = {
	nome: 'com alternativas',
	traduzir: async (textos, de) =>
		textos.map((t) => (de.startsWith('en') ? IDA[t] : VOLTA[t]) ?? `?${t}`),
	alternativas: async (textos) => textos.map((t) => FEIXE[t] ?? [])
};

const par_ = (campos: Partial<CamposMaterial>): CamposMaterial => ({
	kind: 'SentencePair',
	...campos
});

describe('preencherTraducao — um material', () => {
	it('frase sem tradução ganha a do tradutor, e o material monta', async () => {
		const r = await preencherTraducao(par_({ target: 'I have a cat.' }), par, tradutor);
		if ('error' in r) throw new Error(r.error);
		expect(r.traduzida).toBe(true);
		expect(montarMaterial(r.campos)).toEqual({
			dados: { target: 'I have a cat.', source: '[pt-BR] I have a cat.' }
		});
	});

	it('a frase que o tradutor traduziu ganha as variações, somadas às do professor', async () => {
		const r = await preencherTraducao(
			par_({
				target: 'I have already finished the report.',
				variants: JSON.stringify(['Terminei o relatório já.'])
			}),
			par,
			comAlternativas
		);
		if ('error' in r) throw new Error(r.error);
		expect(montarMaterial(r.campos)).toEqual({
			dados: {
				target: 'I have already finished the report.',
				source: 'Já terminei o relatório.',
				variants: ['Terminei o relatório já.', 'Eu já terminei o relatório.']
			}
		});
	});

	it('a tradução do professor nunca é trocada', async () => {
		const campos = par_({ target: 'I have a cat.', source: 'Tenho um gato.' });
		const r = await preencherTraducao(campos, par, tradutor);
		expect(r).toEqual({ campos, traduzida: false });
	});

	it('vocabulário usa o mesmo campo (o sentido do termo)', async () => {
		const r = await preencherTraducao({ kind: 'VocabItem', target: 'bookshop' }, par, tradutor);
		if ('error' in r) throw new Error(r.error);
		expect(montarMaterial(r.campos)).toEqual({
			dados: { term: 'bookshop', translation: '[pt-BR] bookshop' }
		});
	});

	it('sem tradutor nada muda: montar continua pedindo a tradução', async () => {
		const campos = par_({ target: 'I have a cat.' });
		const r = await preencherTraducao(campos, par, null);
		expect(r).toEqual({ campos, traduzida: false });
		expect(montarMaterial(campos)).toEqual({ error: 'Preencha a frase e a tradução.' });
	});

	it('material sem idioma na biblioteca: não há de onde traduzir, e a tela diz', async () => {
		const r = await preencherTraducao(par_({ target: 'I have a cat.' }), null, tradutor);
		expect(r).toEqual({
			error: 'Escolha o idioma do material para a tradução vir sozinha, ou escreva a tradução.'
		});
	});

	it('tradutor fora do ar vira a frase da tela, não um 500', async () => {
		const r = await preencherTraducao(par_({ target: 'I have a cat.' }), par, fora);
		expect(r).toEqual({ error: AVISO_SEM_TRADUTOR });
	});

	it('texto e diálogo não têm tradução por linha e passam direto', async () => {
		const campos: CamposMaterial = { kind: 'Passage', target: 'Título', raw: 'Texto.' };
		expect(await preencherTraducao(campos, par, fora)).toEqual({ campos, traduzida: false });
	});
});

describe('traduzirLote — a lista colada', () => {
	it('traduz só as linhas sem separador e diz quantas', async () => {
		const r = await traduzirLote(
			'SentencePair',
			[
				{ target: 'I have a cat.', source: 'Eu tenho um gato.' },
				{ target: 'She lives in Paris.', source: '' }
			],
			par,
			tradutor
		);
		expect(r).toEqual({
			unidades: [
				{ target: 'I have a cat.', source: 'Eu tenho um gato.' },
				{ target: 'She lives in Paris.', source: '[pt-BR] She lives in Paris.' }
			],
			traduzidas: 1
		});
	});

	it('as linhas que o tradutor completou ganham as variações; a do professor não', async () => {
		const r = await traduzirLote(
			'SentencePair',
			[
				{ target: 'I have already finished the report.', source: '' },
				{ target: 'We live in Lisbon.', source: 'Moramos em Lisboa.' }
			],
			par,
			comAlternativas
		);
		expect(r).toEqual({
			unidades: [
				{
					target: 'I have already finished the report.',
					source: 'Já terminei o relatório.',
					variants: ['Eu já terminei o relatório.']
				},
				{ target: 'We live in Lisbon.', source: 'Moramos em Lisboa.' }
			],
			traduzidas: 1
		});
	});

	it('falhou o tradutor, NADA é gravado: a lista pela metade não é a que ele colou', async () => {
		const r = await traduzirLote('VocabItem', [{ term: 'bookshop', translation: '' }], par, fora);
		expect(r).toMatchObject({ error: expect.stringContaining('não respondeu') });
	});

	it('sem tradutor, a linha sem tradução fica de fora (a guarda do parser)', async () => {
		const r = await traduzirLote(
			'VocabItem',
			[
				{ term: 'cat', translation: 'gato' },
				{ term: 'bookshop', translation: '' }
			],
			par,
			null
		);
		expect(r).toEqual({ unidades: [{ term: 'cat', translation: 'gato' }], traduzidas: 0 });
	});
});
