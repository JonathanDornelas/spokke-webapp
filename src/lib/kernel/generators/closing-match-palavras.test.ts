import { describe, expect, it } from 'vitest';
import { runGenerators, type StoredContentUnit } from './index';
import { ptBR } from '../language/profiles/pt-BR';
import { enUS } from '../language/profiles/en-US';
import { matchAuthoringSchema } from '../interactions/match';

/**
 * Com o tradutor, as palavras das próprias frases completam o "ligue os pares"
 * do fecho. O kernel não traduz: as palavras chegam prontas, do servidor, em
 * `palavrasTraduzidas`.
 */

const options = {
	targetProfile: enUS,
	sourceProfile: ptBR,
	seed: 'atividade-1',
	capabilities: { asr: false, tts: false }
};

function frases(quantas: number): StoredContentUnit[] {
	return Array.from({ length: quantas }, (_, i) => ({
		id: `p${i}`,
		kind: 'SentencePair' as const,
		data: { target: `Sentence number ${i}.`, source: `Frase número ${i}.` }
	}));
}

function vocabulario(termos: [string, string][]): StoredContentUnit[] {
	return termos.map(([term, translation], i) => ({
		id: `v${i}`,
		kind: 'VocabItem' as const,
		data: { term, translation }
	}));
}

const palavras = [
	{ termo: 'thesis', sentido: 'tese' },
	{ termo: 'station', sentido: 'estação' },
	{ termo: 'working', sentido: 'trabalhando' },
	{ termo: 'hotel', sentido: 'hotel' }
];

function paresDe(unidades: StoredContentUnit[]) {
	const { closing } = runGenerators(unidades, { ...options, palavrasTraduzidas: palavras });
	return matchAuthoringSchema.parse(closing?.interaction.payload).pairs;
}

describe('closing-match com palavras das frases', () => {
	it('sem vocabulário, as palavras das frases fecham a atividade', () => {
		// "hotel" → "hotel" não é par: o aluno ligaria sem ler.
		expect(
			paresDe(frases(3))
				.map((p) => p.left)
				.sort()
		).toEqual(['station', 'thesis', 'working']);
	});

	it('sem tradutor (lista vazia) vale a regra de antes: sem vocabulário, sem fecho', () => {
		expect(runGenerators(frases(3), options).closing).toBeNull();
		expect(runGenerators(frases(3), { ...options, palavrasTraduzidas: [] }).closing).toBeNull();
	});

	it('o vocabulário cadastrado tem a vez, e as palavras só completam até cinco', () => {
		const pares = paresDe([
			...vocabulario([
				['bookshop', 'livraria'],
				['tram', 'bonde']
			]),
			...frases(3)
		]);
		expect(
			pares
				.slice(0, 2)
				.map((p) => p.left)
				.sort()
		).toEqual(['bookshop', 'tram']);
		expect(pares.length).toBeLessThanOrEqual(5);
	});

	it('palavra que repete um termo do vocabulário não entra de novo', () => {
		const esquerda = paresDe([
			...vocabulario([
				['station', 'estação'],
				['tram', 'bonde']
			]),
			...frases(3)
		]).map((p) => p.left);
		expect(esquerda.filter((l) => l === 'station')).toHaveLength(1);
	});

	it('é determinístico: a mesma atividade fecha sempre com os mesmos pares', () => {
		expect(paresDe(frases(3))).toEqual(paresDe(frases(3)));
	});
});
