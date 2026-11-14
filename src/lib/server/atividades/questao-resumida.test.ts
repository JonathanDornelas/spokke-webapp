import { describe, expect, it } from 'vitest';
import { runGenerators, type StoredContentUnit } from '$lib/kernel/generators';
import { enUS } from '$lib/kernel/language/profiles/en-US';
import { ptBR } from '$lib/kernel/language/profiles/pt-BR';
import { resumirQuestao } from './questao-resumida';

const pares: StoredContentUnit[] = [
	{
		id: 'm1',
		kind: 'SentencePair',
		data: { source: 'Ela trabalha aqui desde 2019.', target: 'She has worked here since 2019.' }
	},
	{
		id: 'm2',
		kind: 'SentencePair',
		data: { source: 'Nós moramos em Lisboa.', target: 'We live in Lisbon.' }
	}
];

const { groups } = runGenerators(pares, {
	targetProfile: enUS,
	sourceProfile: ptBR,
	seed: 'atv',
	capabilities: { tts: true, asr: true }
});
const doPrimeiro = groups[0]?.items ?? [];
const pelo = (gerador: string) => {
	const item = doPrimeiro.find((i) => i.generatedBy === gerador);
	if (!item) throw new Error(`sem ${gerador}`);
	return resumirQuestao(item, true);
};

describe('resumirQuestao', () => {
	it('toda questão gerada vira uma questão resumida', () => {
		for (const item of doPrimeiro) expect(resumirQuestao(item, true).legenda).toBeTruthy();
	});

	it('ouvir e escolher: a certa é a frase do áudio, marcada', () => {
		const q = pelo('listen-choice');
		expect(q.habilidade).toBe('escuta');
		expect(q.corpo).toMatchObject({
			forma: 'ouvir-escolher',
			certa: 'She has worked here since 2019.'
		});
	});

	it('a lacuna separa a frase em volta da resposta', () => {
		const q = pelo('cloze-target');
		expect(q.habilidade).toBe('escrita');
		if (q.corpo.forma !== 'lacuna') throw new Error('não é lacuna');
		expect(`${q.corpo.antes}${q.corpo.resposta}${q.corpo.depois}`).toBe(
			'She has worked here since 2019.'
		);
		expect(q.corpo.apoio).toBe('Ela trabalha aqui desde 2019.');
	});

	it('a fala é de fala, mesmo lendo o enunciado', () => {
		expect(pelo('speak-target').habilidade).toBe('fala');
	});

	it('desligada pelo tipo, ela vem marcada para aparecer apagada', () => {
		const item = doPrimeiro[0];
		if (!item) throw new Error('sem item');
		expect(resumirQuestao(item, false).entra).toBe(false);
	});
});
