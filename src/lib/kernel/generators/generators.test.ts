import { describe, expect, it } from 'vitest';
import { runGenerators, type GenerationOptions, type StoredContentUnit } from './index';
import { clozeTarget, listenChoice, translateAssemble, translateType } from './sentence-pair';
import { vocabChoice } from './vocab-item';
import { ptBR } from '../language/profiles/pt-BR';
import { enUS } from '../language/profiles/en-US';
import { jaJP } from '../language/profiles/ja-JP';

const options: GenerationOptions = {
	targetProfile: enUS,
	sourceProfile: ptBR,
	seed: 'seed-de-geracao',
	capabilities: { asr: false, tts: true }
};

const pares: StoredContentUnit[] = [
	{
		id: 'cnt_1',
		kind: 'SentencePair',
		data: { source: 'Ela trabalha aqui desde 2019.', target: 'She has worked here since 2019.' }
	},
	{
		id: 'cnt_2',
		kind: 'SentencePair',
		data: { source: 'Eu já terminei o relatório.', target: 'I have already finished the report.' }
	},
	{
		id: 'cnt_3',
		kind: 'SentencePair',
		data: { source: 'Nós moramos em Lisboa.', target: 'We live in Lisbon.' }
	}
];

describe('runGenerators', () => {
	it('é puro: mesmo conteúdo, mesmo profile e mesma seed produzem os mesmos itens', () => {
		expect(runGenerators(pares, options)).toEqual(runGenerators(pares, options));
	});

	it('gera vários itens por material e agrupa por material', () => {
		const { groups } = runGenerators(pares, options);

		expect(groups).toHaveLength(3);
		expect(groups[0].contentId).toBe('cnt_1');
		expect(groups[0].items.length).toBeGreaterThan(1);
		// Todo item aponta para o material de origem e para o gerador que o fez.
		for (const item of groups[0].items) {
			expect(item.sourceContentId).toBe('cnt_1');
			expect(item.generatedBy).toBeTruthy();
		}
	});

	it('omite os itens de fala quando não há provedor de ASR', () => {
		const semAsr = runGenerators(pares, options).groups.flatMap((g) => g.items);
		expect(semAsr.some((i) => i.interaction.type === 'speak')).toBe(false);

		const comAsr = runGenerators(pares, {
			...options,
			capabilities: { asr: true, tts: true }
		}).groups.flatMap((g) => g.items);
		expect(comAsr.some((i) => i.interaction.type === 'speak')).toBe(true);
	});

	it('omite os itens de escuta quando não há provedor de TTS', () => {
		const semTts = runGenerators(pares, {
			...options,
			capabilities: { asr: false, tts: false }
		}).groups.flatMap((g) => g.items);
		expect(semTts.some((i) => i.prompt.kind === 'audio')).toBe(false);
	});

	it('explica o material que não gerou nada em vez de sumir com ele', () => {
		const soUmVocab: StoredContentUnit[] = [
			{ id: 'v1', kind: 'VocabItem', data: { term: 'bread', translation: 'pão' } }
		];
		const [group] = runGenerators(soUmVocab, options).groups;

		expect(group.items).toHaveLength(0);
		expect(group.reason).toBeTruthy();
		expect(group.excerpt).toBe('bread');
	});
});

// testing.md "Geradores": conjunto pequeno demais devolve MENOS exercícios,
// nunca um distrator inventado.
describe('variações da tradução', () => {
	it('translate-type aceita as variações do material depois da resposta do professor', () => {
		const [questao] = translateType.generate(
			{
				id: 'cnt_v',
				data: {
					source: 'Nunca desista dos seus sonhos.',
					target: 'Never give up on your dreams.',
					// a repetida não entra duas vezes
					variants: ['Nunca desista de seus sonhos.', 'Nunca desista dos seus sonhos.']
				}
			},
			{ ...options, siblings: [] }
		);
		expect(questao.interaction.payload).toEqual({
			accepted: ['Nunca desista dos seus sonhos.', 'Nunca desista de seus sonhos.']
		});
	});
});

describe('distratores', () => {
	const ctx = {
		targetProfile: enUS,
		sourceProfile: ptBR,
		seed: 'seed',
		capabilities: { asr: true, tts: true }
	};

	it('listen-choice não gera item quando não há outra frase no conjunto', () => {
		const sozinho = { id: 'cnt_1', data: { source: 'Oi.', target: 'Hi.' } };
		const items = listenChoice.generate(sozinho, { ...ctx, siblings: [] });
		expect(items).toHaveLength(0);
	});

	it('listen-choice só usa alternativas que vieram do próprio conjunto', () => {
		const alvo = { id: 'cnt_1', data: { source: 'Oi.', target: 'Hi.' } };
		const siblings = [
			{ id: 'cnt_2', data: { source: 'Tchau.', target: 'Bye.' } },
			{ id: 'cnt_3', data: { source: 'Obrigado.', target: 'Thanks.' } }
		];
		const [item] = listenChoice.generate(alvo, { ...ctx, siblings });

		const payload = item.interaction.payload as { options: string[]; correctIndex: number };
		expect(payload.options[payload.correctIndex]).toBe('Hi.');
		for (const option of payload.options) {
			expect(['Hi.', 'Bye.', 'Thanks.']).toContain(option);
		}
	});

	it('cloze-target mascara a PALAVRA, não a primeira vez que o texto dela aparece', () => {
		// "a" é a palavra do meio de "I have a cat." — e também uma letra de "have".
		const frase = { id: 'cnt_a', data: { source: 'Eu tenho um gato.', target: 'I have a cat.' } };
		const [item] = clozeTarget.generate(frase, { ...ctx, siblings: [] });
		expect(item?.interaction.payload).toEqual({ masked: 'I have ___ cat.', accepted: ['a'] });
	});

	it('vocab-choice não inventa tradução quando o conjunto tem um item só', () => {
		const sozinho = { id: 'v1', data: { term: 'bread', translation: 'pão' } };
		expect(vocabChoice.generate(sozinho, { ...ctx, siblings: [] })).toHaveLength(0);
	});

	it('tokeniza o idioma alvo sem depender de espaço (ja-JP)', () => {
		const japones = { id: 'cnt_ja', data: { source: 'Eu sou estudante.', target: '私は学生です' } };
		const [item] = translateAssemble.generate(japones, {
			...ctx,
			targetProfile: jaJP,
			siblings: []
		});

		const payload = item.interaction.payload as { tokens: string[] };
		expect(payload.tokens.length).toBeGreaterThan(1);
		expect(payload.tokens).toContain('学生');
	});
});
