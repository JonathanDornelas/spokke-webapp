import { describe, expect, it } from 'vitest';
import { normalize } from './normalize';
import { numerais } from './equivalences';
import { enUS } from './profiles/en-US';
import { ptBR } from './profiles/pt-BR';
import { esES } from './profiles/es-ES';
import { tolerantScore } from '../grading/compare';
import { speak } from '../interactions/speak';

describe('equivalências do profile', () => {
	// O caso que motivou tudo: o ASR escreveu "7" onde o aluno disse "seven", e
	// a frase alvo tinha "seven" — um "quase" por um acerto.
	it('trata o numeral por extenso e o dígito como a mesma coisa', () => {
		expect(normalize('I wake up at seven', enUS)).toBe(normalize('I wake up at 7', enUS));
		expect(normalize('twenty-one students', enUS)).toBe(normalize('21 students', enUS));
		expect(normalize('vinte e um alunos', ptBR)).toBe(normalize('21 alunos', ptBR));
		expect(normalize('duas casas', ptBR)).toBe(normalize('2 casas', ptBR));
		expect(normalize('veintiuno', esES)).toBe(normalize('21', esES));
		expect(normalize('treinta y cinco', esES)).toBe(normalize('35', esES));
	});

	it('só troca palavra inteira', () => {
		// "one" dentro de "someone" e "ten" dentro de "tension" ficam como estão.
		expect(normalize('someone', enUS)).toBe('someone');
		expect(normalize('tension', enUS)).toBe('tension');
	});

	it('iguala contração e forma cheia em inglês', () => {
		expect(normalize("I'm here", enUS)).toBe(normalize('I am here', enUS));
		expect(normalize("don't", enUS)).toBe(normalize('do not', enUS));
	});

	// A pergunta do dono do repositório: "Você irá trabalhar amanhã" recebia
	// "quase" contra "Você vai trabalhar amanhã?".
	it('aceita o futuro perifrástico e o simples como a mesma resposta em português', () => {
		const nota = tolerantScore('Você irá trabalhar amanhã', ['Você vai trabalhar amanhã?'], ptBR);
		expect(nota.value).toBe(1);
	});

	it('no speak, o numeral escrito pelo ASR não vira palavra faltando', () => {
		const resultado = speak.grade(
			{ target: 'I usually wake up at seven in the morning.', hints: [] },
			{ transcript: 'I usually wake up at 7 in the morning.' },
			enUS,
			'seed'
		);
		expect(resultado.ok).toBe(true);
		if (resultado.ok) expect(resultado.value.value).toBe(1);
	});

	it('quando falta uma palavra, mostra a do alvo como está escrita', () => {
		const resultado = speak.grade(
			{ target: 'She has been working here since 2019.', hints: [] },
			{ transcript: 'She has working here since 2019.' },
			enUS,
			'seed'
		);
		expect(resultado.ok).toBe(true);
		if (resultado.ok) expect(resultado.value.feedback).toContain('"been"');
	});

	it('gera os compostos de 21 a 99 a partir das duas listas', () => {
		const grupos = numerais(['zero', 'um|uma', 'dois'], ['vinte'], (dezena, unidade) => [
			`${dezena} e ${unidade}`
		]);
		expect(grupos).toContainEqual(['1', 'um', 'uma']);
		expect(grupos).toContainEqual(['21', 'vinte e um', 'vinte e uma']);
		expect(grupos).toContainEqual(['22', 'vinte e dois']);
	});
});

// O caso relatado: "Never give up on your dreams", o aluno escreveu "nunca
// desista dos seus sonhos" e o gabarito tinha "de seus" — recebia "quase".
describe('o artigo antes do possessivo, em português', () => {
	it('aceita "dos seus" e "de seus" como a mesma resposta', () => {
		const nota = tolerantScore(
			'nunca desista dos seus sonhos',
			['Nunca desista de seus sonhos'],
			ptBR
		);
		expect(nota.value).toBe(1);
	});

	it('vale com "em" e com o artigo solto', () => {
		expect(normalize('Ela está no seu quarto', ptBR)).toBe(
			normalize('Ela está em seu quarto', ptBR)
		);
		expect(normalize('Nas suas férias', ptBR)).toBe(normalize('Em suas férias', ptBR));
		expect(normalize('Siga os seus sonhos', ptBR)).toBe(normalize('Siga seus sonhos', ptBR));
		expect(normalize('da nossa casa', ptBR)).toBe(normalize('de nossa casa', ptBR));
	});

	// O "a" solto pode ser a preposição: apagá-lo aceitaria "dei o livro sua irmã".
	it('não apaga o "a" do feminino singular solto', () => {
		expect(normalize('dei o livro a sua irmã', ptBR)).not.toBe(
			normalize('dei o livro sua irmã', ptBR)
		);
	});

	it('não mexe no possessivo trocado — aí é outra resposta', () => {
		expect(
			tolerantScore('nunca desista dos meus sonhos', ['Nunca desista de seus sonhos'], ptBR).value
		).toBeLessThan(1);
	});
});
