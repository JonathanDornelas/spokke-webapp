import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CURVA, DURACAO, STAGGER, TETO_DO_STAGGER, atrasoDoItem, bezier } from './movimento';

/**
 * O movimento tem DUAS fontes — o `app.css` (CSS) e `movimento.ts` (as
 * transições do Svelte e as esperas em JS). Este teste é o que impede as duas
 * de divergirem: lê o CSS como texto e compara número por número.
 */
const css = readFileSync(new URL('../app.css', import.meta.url), 'utf8');
const token = (nome: string) => css.match(new RegExp(`--${nome}:\\s*([^;]+);`))?.[1].trim();

describe('os tokens de movimento', () => {
	it('as durações do TS são as do app.css', () => {
		for (const [nome, ms] of Object.entries(DURACAO)) {
			expect(token(`duration-${nome}`), `--duration-${nome}`).toBe(`${ms}ms`);
		}
		expect(token('stagger')).toBe(`${STAGGER}ms`);
	});

	it('as curvas do TS são as do app.css', () => {
		const nomes: Record<keyof typeof CURVA, string> = {
			entrada: 'ease-out-soft',
			saida: 'ease-in-soft',
			movimento: 'ease-in-out-soft',
			retorno: 'ease-out-back'
		};
		for (const [papel, pontos] of Object.entries(CURVA)) {
			const nome = nomes[papel as keyof typeof CURVA];
			expect(token(nome), `--${nome}`).toBe(`cubic-bezier(${pontos.join(', ')})`);
		}
	});

	it('sair leva cerca de dois terços de entrar', () => {
		expect(DURACAO.curta / DURACAO.media).toBeGreaterThanOrEqual(0.6);
		expect(DURACAO.curta / DURACAO.media).toBeLessThanOrEqual(0.75);
	});

	it('a lista em sequência tem teto: o 20º item não espera 20 intervalos', () => {
		expect(atrasoDoItem(0)).toBe(0);
		expect(atrasoDoItem(2)).toBe(2 * STAGGER);
		expect(atrasoDoItem(20)).toBe(TETO_DO_STAGGER * STAGGER);
		expect(atrasoDoItem(-3)).toBe(0);
	});
});

describe('bezier — a mesma curva do CSS em JS', () => {
	it('começa em 0 e termina em 1', () => {
		for (const pontos of Object.values(CURVA)) {
			const f = bezier(pontos);
			expect(f(0)).toBe(0);
			expect(f(1)).toBe(1);
		}
	});

	it('a entrada vai na frente e a saída fica para trás', () => {
		expect(bezier(CURVA.entrada)(0.3)).toBeGreaterThan(0.7);
		expect(bezier(CURVA.saida)(0.3)).toBeLessThan(0.15);
	});

	it('o retorno passa um pouco do alvo — e só um pouco (orçamento de feedback)', () => {
		const f = bezier(CURVA.retorno);
		let maior = 0;
		for (let t = 0; t <= 1; t += 0.01) maior = Math.max(maior, f(t));
		expect(maior).toBeGreaterThan(1.02);
		expect(maior).toBeLessThan(1.06);
	});

	it('bate com o valor conhecido do easeInOutCubic no meio', () => {
		expect(bezier(CURVA.movimento)(0.5)).toBeCloseTo(0.5, 3);
	});
});
