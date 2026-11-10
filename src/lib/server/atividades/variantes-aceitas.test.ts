import { describe, expect, it } from 'vitest';
import { comVariantesDaTraducao } from './variantes-aceitas';
import { enUS } from '$lib/kernel/language/profiles/en-US';
import { ptBR } from '$lib/kernel/language/profiles/pt-BR';
import type { Item } from '$lib/kernel/item';
import type { Tradutor } from '$lib/server/traducao';
import { type } from '$lib/kernel/interactions/type';

const perfis = { alvo: enUS, origem: ptBR };

function traduzaParaOPortugues(id: string, frase: string, resposta: string): Item {
	return {
		id,
		sourceContentId: id,
		generatedBy: 'translate-type',
		prompt: { kind: 'text', text: frase, instructionKey: 'translate-to-source' },
		interaction: { type: 'type', payload: { accepted: [resposta] } },
		grading: { mode: 'tolerant', tolerance: 0.9, answerLang: 'source' },
		locale: { source: 'pt-BR', target: 'en-US' }
	};
}

/**
 * Tradutor de mentira com o que o MADLAD devolveu de verdade (feixe 6) para
 * estas frases, nos dois sentidos.
 */
function tradutorMedido() {
	const feixe: Record<string, string[]> = {
		'Where is the train station?': [
			'Onde fica a estação de trem?',
			'Onde está a estação de trem?',
			'Onde é a estação de trem?',
			'Onde fica a estação ferroviária?'
		],
		'Me gusta mucho leer libros por la noche.': [
			'Eu realmente gosto de ler livros à noite.',
			'Eu gosto muito de ler livros à noite.',
			'Eu realmente adoro ler livros à noite.'
		]
	};
	const volta: Record<string, string> = {
		'Onde fica a estação de trem?': 'Where is the train station?',
		'Onde está a estação de trem?': 'Where is the train station?',
		'Onde é a estação de trem?': 'Where is the train station?',
		'Onde fica a estação ferroviária?': 'Where is the railway station?',
		'Eu gosto muito de ler livros à noite.': 'Me gusta mucho leer libros por la noche.',
		'Eu realmente gosto de ler livros à noite.': 'Me gusta mucho leer libros por la noche.',
		'Eu realmente adoro ler livros à noite.': 'Me encanta leer libros por la noche.'
	};
	const chamadas: string[] = [];
	const tradutor: Tradutor = {
		nome: 'medido',
		traduzir: async (textos, de, para) => {
			chamadas.push(`traduzir ${de}→${para}`);
			return textos.map((t) => volta[t] ?? '');
		},
		alternativas: async (textos, de, para) => {
			chamadas.push(`alternativas ${de}→${para}`);
			return textos.map((t) => feixe[t] ?? [t]);
		}
	};
	return { tradutor, chamadas };
}

const aceitas = (item: Item | undefined) =>
	(item?.interaction.payload as { accepted: string[] }).accepted;

describe('comVariantesDaTraducao', () => {
	it('acrescenta a variante pequena que faz a ida e volta, depois da resposta do professor', async () => {
		const { tradutor, chamadas } = tradutorMedido();
		const [item] = await comVariantesDaTraducao(
			[traduzaParaOPortugues('a', 'Where is the train station?', 'Onde fica a estação de trem?')],
			perfis,
			tradutor
		);
		expect(aceitas(item)).toEqual([
			'Onde fica a estação de trem?',
			'Onde está a estação de trem?',
			'Onde é a estação de trem?'
			// "estação ferroviária" volta como "railway station": outro sentido para o modelo.
		]);
		// Um pedido de alternativas e UM de volta, para o lote inteiro.
		expect(chamadas).toEqual(['alternativas en-US→pt-BR', 'traduzir pt-BR→en-US']);
	});

	it('a ida e volta derruba a troca de sentido', async () => {
		const { tradutor } = tradutorMedido();
		const [item] = await comVariantesDaTraducao(
			[
				{
					...traduzaParaOPortugues(
						'b',
						'Me gusta mucho leer libros por la noche.',
						// O professor deixou a tradução automática: 'adoro' fica perto dela em
						// palavras e passa pelo kernel; quem a derruba é a volta ('me encanta').
						'Eu realmente gosto de ler livros à noite.'
					),
					locale: { source: 'pt-BR', target: 'es-ES' }
				}
			],
			perfis,
			tradutor
		);
		expect(aceitas(item)).toEqual([
			'Eu realmente gosto de ler livros à noite.',
			'Eu gosto muito de ler livros à noite.'
		]);
	});

	// No idioma alvo o que se ensina é a forma: uma alternativa do tradutor
	// trocaria o tempo verbal da lição.
	it('não mexe na questão respondida no idioma alvo', async () => {
		const { tradutor, chamadas } = tradutorMedido();
		const noAlvo: Item = {
			...traduzaParaOPortugues('c', 'Where is the train station?', 'Where is the train station?'),
			generatedBy: 'listen-type',
			grading: { mode: 'tolerant', tolerance: 0.9 }
		};
		const [item] = await comVariantesDaTraducao([noAlvo], perfis, tradutor);
		expect(item).toBe(noAlvo);
		expect(chamadas).toEqual([]);
	});

	it('sem tradutor, ou sem alternativas nele, os itens voltam como chegaram', async () => {
		const itens = [
			traduzaParaOPortugues('a', 'Where is the train station?', 'Onde fica a estação de trem?')
		];
		expect(await comVariantesDaTraducao(itens, perfis, null)).toBe(itens);
		const semAlternativas: Tradutor = { nome: 'simples', traduzir: async (t) => t };
		expect(await comVariantesDaTraducao(itens, perfis, semAlternativas)).toBe(itens);
	});

	it('tradutor fora do ar não trava a geração', async () => {
		const itens = [
			traduzaParaOPortugues('a', 'Where is the train station?', 'Onde fica a estação de trem?')
		];
		const caido: Tradutor = {
			nome: 'caido',
			traduzir: async () => {
				throw new Error('503');
			},
			alternativas: async () => {
				throw new Error('503');
			}
		};
		expect(await comVariantesDaTraducao(itens, perfis, caido)).toBe(itens);
	});

	// Regra inviolável nº 1: as variantes são gabarito e não podem atravessar o `toRuntime`.
	it('as variantes não chegam ao aluno', async () => {
		const { tradutor } = tradutorMedido();
		const [item] = await comVariantesDaTraducao(
			[traduzaParaOPortugues('a', 'Where is the train station?', 'Onde fica a estação de trem?')],
			perfis,
			tradutor
		);
		const runtime = JSON.stringify(
			type.toRuntime(item!.interaction.payload as { accepted: string[] }, 'seed')
		);
		for (const resposta of aceitas(item)) expect(runtime).not.toContain(resposta);
	});
});
