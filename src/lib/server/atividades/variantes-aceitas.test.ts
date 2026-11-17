import { describe, expect, it } from 'vitest';
import { comVariantesDaTraducao, variantesDaFrase } from './variantes-aceitas';
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
 * Tradutor de mentira com o que o MADLAD devolveu de verdade no serviço de
 * áudio para estas frases: o feixe da ida, a volta de cada variante (a primeira
 * tradução e as outras hipóteses) e a tradução que COMEÇA por um pronome.
 */
function tradutorMedido(opcoes: { semComeco?: boolean } = {}) {
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
		],
		'It is raining a lot today.': [
			'Está chovendo muito hoje.',
			'Hoje está chovendo muito.',
			'Está chovendo bastante agora.'
		],
		'There is a cat in the garden.': ['Há um gato no jardim.'],
		'We live in a small house.': ['Vivemos em uma casa pequena.'],
		'I have to work on Saturday.': ['Eu tenho que trabalhar no sábado.']
	};
	/** A primeira tradução da volta. */
	const volta: Record<string, string> = {
		'Onde fica a estação de trem?': 'Where is the train station?',
		'Onde está a estação de trem?': 'Where is the train station?',
		'Onde é a estação de trem?': 'Where is the train station?',
		'Onde fica a estação ferroviária?': 'Where is the railway station?',
		'Eu gosto muito de ler livros à noite.': 'Me gusta mucho leer libros por la noche.',
		'Eu realmente gosto de ler livros à noite.': 'Me gusta mucho leer libros por la noche.',
		'Eu realmente adoro ler livros à noite.': 'Me encanta leer libros por la noche.',
		'Estou ansioso para o fim de semana': "I'm looking forward to the weekend",
		'Estou ansiosa para o fim de semana.': "I'm looking forward to the weekend.",
		'Estou ansioso pelo fim de semana.': "I'm looking forward to the weekend.",
		'Está chovendo muito hoje.': "It's raining a lot today.",
		'Hoje está chovendo muito.': 'Today it is raining a lot.',
		'Está chovendo bastante agora.': "It's raining quite a bit now.",
		'Há um gato no jardim.': 'There is a cat in the garden.',
		'Moramos em uma casa pequena.': 'We live in a small house.',
		'Vivemos em uma casa pequena.': 'We live in a small house.',
		'Eu tenho que trabalhar no sábado.': 'I have to work on Saturday.'
	};
	/** As outras hipóteses da volta, para a segunda chance. */
	const outrasDaVolta: Record<string, string[]> = {
		'Onde fica a estação ferroviária?': ['Where is the railway station?', 'Where is the station?'],
		'Eu realmente adoro ler livros à noite.': [
			'Me encanta leer libros por la noche.',
			'Adoro leer libros por la noche.'
		],
		'Hoje está chovendo muito.': [
			'Today it is raining a lot.',
			"Today it's raining a lot.",
			'It is raining a lot today.'
		],
		'Está chovendo bastante agora.': ["It's raining quite a bit now.", "It's raining a lot now."]
	};
	/** O que o modelo escreve quando é obrigado a começar por cada pronome. */
	const comecando: Record<string, Record<string, string[]>> = {
		Eu: {
			'Where is the train station?': ['Eu quero ir para a estação de trem.'],
			"I'm looking forward to the weekend.": [
				'Eu estou ansioso para o fim de semana.',
				'Eu estou ansiosa para o fim de semana.'
			],
			'It is raining a lot today.': ['Eu estou chovendo muito hoje.'],
			'There is a cat in the garden.': ['Eu tenho um gato no jardim.', 'Eu tenho um gato.'],
			'We live in a small house.': ['Eu moro em uma pequena casa.']
		},
		Nós: {
			'Where is the train station?': ['Nós vamos para a estação de trem.'],
			'It is raining a lot today.': ['Nós estamos chovendo muito hoje.'],
			'There is a cat in the garden.': ['Nós temos um gato no jardim.'],
			'We live in a small house.': [
				'Nós vivemos em uma pequena casa.',
				'Nós vivemos em uma casa pequena.'
			]
		}
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
			return textos.map((t) => (de === 'pt-BR' ? outrasDaVolta[t] : feixe[t]) ?? [t]);
		},
		...(opcoes.semComeco
			? {}
			: {
					comecandoPor: async (textos: string[], de: string, para: string, comeco: string) => {
						chamadas.push(`comecandoPor ${comeco} ${de}→${para}`);
						return textos.map((t) => comecando[comeco]?.[t] ?? []);
					}
				})
	};
	return { tradutor, chamadas };
}

const aceitas = (item: Item | undefined) =>
	(item?.interaction.payload as { accepted: string[] }).accepted;

describe('comVariantesDaTraducao — as variantes do feixe', () => {
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
			// "estação ferroviária" volta como "railway station", e nem a segunda
			// chance traz "train station": outro sentido para o modelo.
		]);
		// Para o lote inteiro: o feixe, a volta, a segunda chance das que não voltaram
		// e um pedido por pronome do idioma.
		expect(chamadas).toEqual([
			'alternativas en-US→pt-BR',
			'traduzir pt-BR→en-US',
			'alternativas pt-BR→en-US',
			'comecandoPor Eu en-US→pt-BR',
			'comecandoPor Nós en-US→pt-BR'
		]);
	});

	it('a ida e volta derruba a troca de sentido, com segunda chance e tudo', async () => {
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

	// Medido: "Hoje está chovendo muito" volta "Today it is raining a lot", com uma
	// palavra fora do lugar, e a frase original está entre as outras hipóteses.
	it('a segunda chance aceita a variante cuja volta está entre as outras hipóteses', async () => {
		const { tradutor } = tradutorMedido();
		const [item] = await comVariantesDaTraducao(
			[traduzaParaOPortugues('e', 'It is raining a lot today.', 'Está chovendo muito hoje.')],
			perfis,
			tradutor
		);
		expect(aceitas(item)).toEqual([
			'Está chovendo muito hoje.',
			'Hoje está chovendo muito.'
			// "bastante agora" não volta "a lot today" em hipótese nenhuma.
		]);
	});

	it('a segunda chance fora do ar não perde o que a primeira volta já aprovou', async () => {
		const { tradutor } = tradutorMedido();
		const semSegunda: Tradutor = {
			...tradutor,
			alternativas: async (textos, de, para, quantas) => {
				if (de === 'pt-BR') throw new Error('503');
				return tradutor.alternativas!(textos, de, para, quantas);
			}
		};
		const [item] = await comVariantesDaTraducao(
			[traduzaParaOPortugues('a', 'Where is the train station?', 'Onde fica a estação de trem?')],
			perfis,
			semSegunda
		);
		expect(aceitas(item)).toEqual([
			'Onde fica a estação de trem?',
			'Onde está a estação de trem?',
			'Onde é a estação de trem?'
		]);
	});
});

/**
 * O sujeito que a língua do aluno deixa omitir. A ida e volta não serve para
 * escolher o pronome (o modelo ignora o que sobra, e "Eu há um gato no jardim"
 * voltava igual à frase certa): quem confirma é a tradução que COMEÇA por ele.
 */
describe('comVariantesDaTraducao — o sujeito explícito', () => {
	it('entra quando o modelo, começando pelo pronome, escreve a frase do professor', async () => {
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
			// Antes das do feixe e fora do teto delas.
			'Eu estou ansioso para o fim de semana',
			'Estou ansiosa para o fim de semana.',
			// "ansiosa pelo" troca duas palavras: fica fora pelo tamanho da diferença.
			'Estou ansioso pelo fim de semana.'
		]);
		// Com o "eu" numa aceita, a correção o aceita em qualquer variante.
		expect(tolerantScore('Eu estou ansiosa para o fim de semana', aceitas(item), ptBR).value).toBe(
			1
		);
		// Confirmado o "Eu", ninguém pergunta pelo "Nós".
		expect(chamadas.filter((c) => c.startsWith('comecandoPor'))).toEqual([
			'comecandoPor Eu en-US→pt-BR'
		]);
	});

	it('o pronome que só sobraria na frase não vira resposta aceita', async () => {
		const { tradutor } = tradutorMedido();
		const itens = [
			// Começando por "Eu", o modelo escreve "Eu tenho um gato no jardim".
			traduzaParaOPortugues('f', 'There is a cat in the garden.', 'Há um gato no jardim.'),
			// "Eu estou chovendo muito hoje" não é "Eu está chovendo muito hoje".
			traduzaParaOPortugues('e', 'It is raining a lot today.', 'Está chovendo muito hoje.')
		];
		const [gato, chuva] = await comVariantesDaTraducao(itens, perfis, tradutor);
		expect(gato).toBe(itens[0]);
		expect(aceitas(chuva).some((r) => /^(eu|nós) /i.test(r))).toBe(false);
	});

	it('vale o pronome na frente de uma variante já aprovada', async () => {
		const { tradutor } = tradutorMedido();
		const [item] = await comVariantesDaTraducao(
			[traduzaParaOPortugues('g', 'We live in a small house.', 'Moramos em uma casa pequena.')],
			perfis,
			tradutor
		);
		// O modelo escreve "Nós vivemos…", com o verbo da variante: o sujeito é "nós".
		expect(aceitas(item)).toEqual([
			'Moramos em uma casa pequena.',
			'Nós moramos em uma casa pequena.',
			'Vivemos em uma casa pequena.'
		]);
	});

	it('nada a perguntar quando alguma resposta aceita já traz o sujeito', async () => {
		const { tradutor, chamadas } = tradutorMedido();
		const itens = [
			traduzaParaOPortugues('h', 'I have to work on Saturday.', 'Eu tenho que trabalhar no sábado.')
		];
		expect(await comVariantesDaTraducao(itens, perfis, tradutor)).toBe(itens);
		expect(chamadas.some((c) => c.startsWith('comecandoPor'))).toBe(false);
	});

	// Provedor sem o começo forçado: sem confirmação, o sujeito não é proposto. Um
	// serviço de áudio anterior a ele ignora o campo e devolve a tradução livre,
	// que não começa pelo pronome — o mesmo desfecho.
	it('sem o começo forçado, o sujeito fica de fora e as do feixe entram', async () => {
		const { tradutor } = tradutorMedido({ semComeco: true });
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
			'Estou ansiosa para o fim de semana.',
			'Estou ansioso pelo fim de semana.'
		]);
	});

	it('a volta fora do ar não perde o sujeito, e o sujeito fora do ar não perde as do feixe', async () => {
		const { tradutor } = tradutorMedido();
		const frase = traduzaParaOPortugues(
			'd',
			"I'm looking forward to the weekend.",
			'Estou ansioso para o fim de semana'
		);
		const semVolta: Tradutor = {
			...tradutor,
			traduzir: async () => {
				throw new Error('503');
			}
		};
		expect(aceitas((await comVariantesDaTraducao([frase], perfis, semVolta))[0])).toEqual([
			'Estou ansioso para o fim de semana',
			'Eu estou ansioso para o fim de semana'
		]);
		const semSujeito: Tradutor = {
			...tradutor,
			comecandoPor: async () => {
				throw new Error('503');
			}
		};
		expect(aceitas((await comVariantesDaTraducao([frase], perfis, semSujeito))[0])).toEqual([
			'Estou ansioso para o fim de semana',
			'Estou ansiosa para o fim de semana.',
			'Estou ansioso pelo fim de semana.'
		]);
	});
});

describe('comVariantesDaTraducao — o que não muda', () => {
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
		const runtime = JSON.stringify(
			type.toRuntime(item!.interaction.payload as { accepted: string[] }, 'seed')
		);
		expect(aceitas(item).length).toBeGreaterThan(1);
		for (const resposta of aceitas(item)) expect(runtime).not.toContain(resposta);
	});
});

/** "Sugerir outras traduções", no editor de questão: só as NOVAS voltam. */
describe('variantesDaFrase', () => {
	it('não repete o que a questão já aceita', async () => {
		const { tradutor } = tradutorMedido();
		expect(
			await variantesDaFrase(
				'Where is the train station?',
				'Onde fica a estação de trem?',
				perfis,
				tradutor,
				['Onde está a estação de trem?']
			)
		).toEqual(['Onde é a estação de trem?']);
	});

	it('sem tradutor, nenhuma', async () => {
		expect(
			await variantesDaFrase(
				'Where is the train station?',
				'Onde fica a estação de trem?',
				perfis,
				null
			)
		).toEqual([]);
	});
});
