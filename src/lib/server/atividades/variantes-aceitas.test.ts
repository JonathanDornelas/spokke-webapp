import { describe, expect, it } from 'vitest';
import { comVariantesDaTraducao } from './variantes-aceitas';
import { enUS } from '$lib/kernel/language/profiles/en-US';
import { ptBR } from '$lib/kernel/language/profiles/pt-BR';
import type { Item } from '$lib/kernel/item';
import type { Tradutor } from '$lib/server/traducao';
import { type } from '$lib/kernel/interactions/type';
import { tolerantScore } from '$lib/kernel/grading/compare';

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
		],
		// O feixe só varia gênero e preposição: o "Eu estou…" nunca vem dele.
		"I'm looking forward to the weekend.": [
			'Estou ansioso para o fim de semana.',
			'Estou ansiosa para o fim de semana.',
			'Estou ansiosa pelo fim de semana.',
			'Estou ansioso pelo fim de semana.'
		]
	};
	const volta: Record<string, string> = {
		'Onde fica a estação de trem?': 'Where is the train station?',
		'Onde está a estação de trem?': 'Where is the train station?',
		'Onde é a estação de trem?': 'Where is the train station?',
		'Onde fica a estação ferroviária?': 'Where is the railway station?',
		'Eu gosto muito de ler livros à noite.': 'Me gusta mucho leer libros por la noche.',
		'Eu realmente gosto de ler livros à noite.': 'Me gusta mucho leer libros por la noche.',
		'Eu realmente adoro ler livros à noite.': 'Me encanta leer libros por la noche.',
		'Estou ansioso para o fim de semana': "I'm looking forward to the weekend",
		'Eu estou ansioso para o fim de semana': "I'm looking forward to the weekend",
		'Nós estou ansioso para o fim de semana': 'We look forward to the weekend',
		'Estou ansiosa para o fim de semana.': "I'm looking forward to the weekend.",
		'Estou ansioso pelo fim de semana.': "I'm looking forward to the weekend."
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

	it('propõe o sujeito que o feixe não trouxe, e a ida e volta escolhe o pronome', async () => {
		const { tradutor, chamadas } = tradutorMedido();
		const [item] = await comVariantesDaTraducao(
			[
				traduzaParaOPortugues(
					'd',
					"I'm looking forward to the weekend.",
					'Estou ansioso para o fim de semana'
				)
			],
			perfis,
			tradutor
		);
		expect(aceitas(item)).toEqual([
			'Estou ansioso para o fim de semana',
			// "Nós estou…" voltou como "We look forward…" e caiu.
			'Eu estou ansioso para o fim de semana',
			'Estou ansiosa para o fim de semana.',
			// "ansiosa pelo" troca duas palavras: fica fora pelo tamanho da diferença.
			'Estou ansioso pelo fim de semana.'
		]);
		// Com o "eu" numa aceita, a correção o aceita em qualquer variante.
		expect(tolerantScore('Eu estou ansiosa para o fim de semana', aceitas(item), ptBR).value).toBe(
			1
		);
		// Os mesmos dois pedidos: as candidatas de sujeito vão na ida e volta de sempre.
		expect(chamadas).toEqual(['alternativas en-US→pt-BR', 'traduzir pt-BR→en-US']);
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
