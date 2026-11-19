import { describe, expect, it } from 'vitest';
import { avancoEfetivo, caminhoFeito, questaoAbre, questaoDaVez } from './sequencia';

describe('a atividade em sequência', () => {
	it('quem acabou de começar só abre a primeira', () => {
		expect(questaoAbre(1, 0, 10)).toBe(true);
		expect(questaoAbre(2, 0, 10)).toBe(false);
		expect(questaoDaVez(0, 10)).toBe(1);
	});

	it('trocar o número na URL não pula para a frente', () => {
		// Deixou três para trás: a 4 é a da vez, a 5 e a 9 não abrem.
		expect(questaoAbre(4, 3, 10)).toBe(true);
		expect(questaoAbre(5, 3, 10)).toBe(false);
		expect(questaoAbre(9, 3, 10)).toBe(false);
		expect(questaoDaVez(3, 10)).toBe(4);
	});

	it('voltar continua livre', () => {
		expect(questaoAbre(1, 3, 10)).toBe(true);
		expect(questaoAbre(3, 3, 10)).toBe(true);
	});

	it('fora do roteiro não abre, nem com o caminho feito', () => {
		expect(questaoAbre(0, 10, 10)).toBe(false);
		expect(questaoAbre(11, 10, 10)).toBe(false);
		expect(questaoAbre(2.5, 10, 10)).toBe(false);
		expect(questaoAbre(Number.NaN, 10, 10)).toBe(false);
	});

	it('com o caminho feito, a da vez é a última — não uma que não existe', () => {
		expect(questaoDaVez(10, 10)).toBe(10);
		expect(questaoAbre(10, 10, 10)).toBe(true);
	});

	it('resposta gravada conta como questão deixada para trás, mesmo sem o avanço', () => {
		const roteiro = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
		// Respondida pelo web antigo: a 3 tem resposta e o avanço ficou no 2.
		expect(avancoEfetivo(2, roteiro, [{ itemId: 'a' }, { itemId: 'c' }])).toBe(3);
		// O gravado vale quando é maior (a de fala pulada não grava resposta).
		expect(avancoEfetivo(4, roteiro, [{ itemId: 'a' }])).toBe(4);
		expect(avancoEfetivo(0, roteiro, [])).toBe(0);
		// Resposta de item que não é do roteiro não move nada.
		expect(avancoEfetivo(1, roteiro, [{ itemId: 'x' }])).toBe(1);
	});

	it('só entrega quem deixou TODAS para trás', () => {
		expect(caminhoFeito(9, 10)).toBe(false);
		expect(caminhoFeito(10, 10)).toBe(true);
	});
});
