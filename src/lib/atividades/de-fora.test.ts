import { describe, expect, it } from 'vitest';
import { fraseDoTeto, motivoDasDeFora } from './de-fora';

/**
 * O que a revisão diz acima de "Ficaram de fora". O caso que trouxe isto: só
 * Fala ligada, 10 pedidas, 5 dentro pelo teto (que era 5 e hoje é 10) — e a
 * frase culpava a quantidade.
 */
describe('fraseDoTeto', () => {
	it('fala, escuta e as duas', () => {
		expect(fraseDoTeto(['speaking'])).toBe(
			'A geração põe no máximo 10 questões de fala por atividade.'
		);
		expect(fraseDoTeto(['speaking', 'listening', 'speaking'])).toBe(
			'A geração põe no máximo 10 questões de escuta e 10 de fala por atividade.'
		);
	});

	it('sem tipo de teto, nada a dizer', () => {
		expect(fraseDoTeto(['reading', 'writing'])).toBeNull();
	});
});

describe('motivoDasDeFora', () => {
	const teto = { teto: 'speaking' as const, erro: false };
	const resto = { teto: null, erro: false };
	const comErro = { teto: null, erro: true };

	it('as de fora pelo teto: a frase fala do teto, não da quantidade', () => {
		const frase = motivoDasDeFora([teto, teto], { dentro: 10, alvo: 15 });
		expect(frase).toBe(
			'A geração põe no máximo 10 questões de fala por atividade. Aceite uma para ela entrar no fim do roteiro.'
		);
		expect(frase).not.toContain('quantidade');
	});

	it('roteiro cheio: passaram da quantidade pedida', () => {
		expect(motivoDasDeFora([resto], { dentro: 10, alvo: 10 })).toBe(
			'Passaram da quantidade pedida (10) ou você descartou. Aceite uma para ela entrar no fim do roteiro.'
		);
	});

	it('com vaga sobrando, a de fora só pode ter sido descartada', () => {
		expect(motivoDasDeFora([resto], { dentro: 6, alvo: 10 })).toBe(
			'Você descartou estas. Aceite uma para ela entrar no fim do roteiro.'
		);
	});

	it('motivos misturados, cada um na sua frase', () => {
		expect(motivoDasDeFora([teto, resto, comErro], { dentro: 12, alvo: 12 })).toBe(
			'A geração põe no máximo 10 questões de fala por atividade. As outras passaram da quantidade pedida (12) ou você descartou. A que tem problema fica no fim, com o motivo. Aceite uma para ela entrar no fim do roteiro.'
		);
	});

	it('a reprovada pela conferência é contada pelo problema, mesmo com o teto cheio', () => {
		expect(
			motivoDasDeFora([{ teto: 'speaking', erro: true }, comErro], { dentro: 10, alvo: 15 })
		).toBe(
			'As que têm problema ficam no fim, com o motivo. Aceite uma para ela entrar no fim do roteiro.'
		);
	});
});
