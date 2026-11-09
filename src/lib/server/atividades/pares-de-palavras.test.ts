import { describe, expect, it } from 'vitest';
import { paresDasFrases } from './pares-de-palavras';
import { enUS } from '$lib/kernel/language/profiles/en-US';
import { ptBR } from '$lib/kernel/language/profiles/pt-BR';
import type { StoredContentUnit } from '$lib/kernel/generators';
import type { Tradutor } from '$lib/server/traducao';

const perfis = { alvo: enUS, origem: ptBR };

const frases: StoredContentUnit[] = [
	{ id: 'a', kind: 'SentencePair', data: { target: 'The bookshop opens early.', source: 'x' } },
	{
		id: 'b',
		kind: 'SentencePair',
		data: { target: 'She kept working on her thesis.', source: 'y' }
	}
];

/**
 * Tradutor de mentira com dicionário nos dois sentidos, devolvendo como o modelo
 * devolve (maiúscula e ponto). "working" é o caso medido de verdade: sozinho,
 * vira "em funcionamento", e a volta não dá "working".
 */
function tradutorDeDicionario() {
	const ida: Record<string, string> = {
		bookshop: 'Livraria.',
		thesis: 'Tese.',
		working: 'Em funcionamento.',
		opens: 'Abre.',
		early: 'Cedo.'
	};
	const volta: Record<string, string> = {
		livraria: 'Bookshop.',
		tese: 'Thesis.',
		'em funcionamento': 'In operation.',
		abre: 'Opens.',
		cedo: 'Early.'
	};
	const chamadas: { textos: string[]; de: string; para: string }[] = [];
	const tradutor: Tradutor = {
		nome: 'dicionario',
		traduzir: async (textos, de, para) => {
			chamadas.push({ textos, de, para });
			const mapa = de === 'en-US' ? ida : volta;
			return textos.map((t) => mapa[t.toLowerCase()] ?? '');
		}
	};
	return { tradutor, chamadas };
}

describe('paresDasFrases', () => {
	it('só fica o par que faz a ida e volta, e o sentido sai limpo para o cartão', async () => {
		const { tradutor, chamadas } = tradutorDeDicionario();
		const pares = await paresDasFrases(frases, perfis, tradutor);

		// Ida e volta: dois pedidos, nos dois sentidos.
		expect(chamadas.map((c) => `${c.de}→${c.para}`)).toEqual(['en-US→pt-BR', 'pt-BR→en-US']);
		// Sem o ponto final, e com a minúscula do termo.
		expect(pares).toContainEqual({ termo: 'bookshop', sentido: 'livraria' });
		expect(pares).toContainEqual({ termo: 'thesis', sentido: 'tese' });
		// "working" → "em funcionamento" → "in operation": não volta, não entra.
		expect(pares.find((p) => p.termo === 'working')).toBeUndefined();
	});

	it('sem tradutor, ou com ele fora do ar, volta vazio e não trava a geração', async () => {
		expect(await paresDasFrases(frases, perfis, null)).toEqual([]);
		const fora: Tradutor = {
			nome: 'fora',
			traduzir: async () => {
				throw new Error('503');
			}
		};
		expect(await paresDasFrases(frases, perfis, fora)).toEqual([]);
	});

	it('com vocabulário que já enche o fecho, nem chama o tradutor', async () => {
		const vocab: StoredContentUnit[] = Array.from({ length: 5 }, (_, i) => ({
			id: `v${i}`,
			kind: 'VocabItem',
			data: { term: `w${i}`, translation: `p${i}` }
		}));
		const { tradutor, chamadas } = tradutorDeDicionario();
		expect(await paresDasFrases([...vocab, ...frases], perfis, tradutor)).toEqual([]);
		expect(chamadas).toHaveLength(0);
	});
});
