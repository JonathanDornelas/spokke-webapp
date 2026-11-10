import { describe, expect, it } from 'vitest';
import { candidatasComSujeito, variantesProximas } from './variantes';
import { enUS } from '../language/profiles/en-US';
import { ptBR } from '../language/profiles/pt-BR';
import { jaJP } from '../language/profiles/ja-JP';

/**
 * As candidatas são as do MADLAD-400 de verdade (feixe 6), medidas para
 * calibrar: o que o tradutor propõe para frases de aula, e o que fica.
 */
describe('variantesProximas', () => {
	it('fica a reescrita pequena, sai a grande', () => {
		const principal = 'Nós vamos para a praia amanhã.';
		const candidatas = [
			'Nós vamos para a praia amanhã.', // a própria principal
			'Amanhã vamos à praia.', // reescrita grande
			'Nós vamos à praia amanhã.',
			'Vamos para a praia amanhã.',
			'Amanhã vamos para a praia.'
		];
		expect(variantesProximas(principal, candidatas, ptBR)).toEqual([
			'Nós vamos à praia amanhã.',
			'Vamos para a praia amanhã.',
			'Amanhã vamos para a praia.'
		]);
	});

	it('não repete o que a correção já trata como igual', () => {
		// Pontuação e caixa saem no normalizador, e "dos seus" é "de seus" pelas
		// equivalências do português.
		expect(
			variantesProximas(
				'Nunca desista de seus sonhos',
				['nunca desista de seus sonhos!', 'Nunca desista dos seus sonhos.'],
				ptBR
			)
		).toEqual([]);
	});

	it('não devolve a que a questão já aceita', () => {
		expect(
			variantesProximas(
				'Onde fica a estação de trem?',
				['Onde está a estação de trem?', 'Onde é a estação de trem?'],
				ptBR,
				['Onde está a estação de trem']
			)
		).toEqual(['Onde é a estação de trem?']);
	});

	it('a frase reescrita inteira é diferença grande', () => {
		expect(
			variantesProximas(
				'Eles já terminaram o relatório.',
				['Já terminaram o relatório.', 'O relatório já foi concluído.'],
				ptBR
			)
		).toEqual(['Já terminaram o relatório.']);
	});

	it('para no teto', () => {
		const candidatas = [
			'Eu não gosto de chá',
			'Não gosto de café',
			'Eu não curto café',
			'Eu não gosto do café'
		];
		expect(variantesProximas('Eu não gosto de café', candidatas, ptBR, [], 2)).toHaveLength(2);
	});

	// Regra inviolável nº 5: a contagem de palavras é do `Intl.Segmenter`.
	it('funciona em língua sem espaço', () => {
		expect(
			variantesProximas('駅はどこですか', ['駅はどこにありますか', '駅はどこですか。'], jaJP)
		).not.toContain('駅はどこですか。');
	});

	it('principal vazia não tem variante', () => {
		expect(variantesProximas('  ', ['qualquer coisa'], ptBR)).toEqual([]);
	});
});

describe('candidatasComSujeito', () => {
	it('propõe a resposta com cada pronome omitível na frente, mantendo o resto como está', () => {
		expect(candidatasComSujeito('Estou ansioso para o fim de semana.', ptBR)).toEqual([
			'Eu estou ansioso para o fim de semana.',
			'Nós estou ansioso para o fim de semana.'
		]);
	});

	it('nada a propor quando alguma aceita já começa com o pronome: a correção cuida', () => {
		expect(candidatasComSujeito('Eu não gosto de café', ptBR)).toEqual([]);
		expect(candidatasComSujeito('Não gosto de café', ptBR, ['Eu não gosto de café'])).toEqual([]);
	});

	it('língua que não omite o sujeito não ganha candidata', () => {
		expect(candidatasComSujeito('Looking forward to it', enUS)).toEqual([]);
		expect(candidatasComSujeito('  ', ptBR)).toEqual([]);
	});
});
