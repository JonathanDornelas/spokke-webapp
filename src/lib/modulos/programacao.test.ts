import { describe, expect, it } from 'vitest';
import {
	agendar,
	hojeEmBrasilia,
	instanteDe,
	programacaoSchema,
	resumoDaProgramacao,
	rotuloDaData,
	somarMeses,
	type Programacao
} from './programacao';

const ids = ['a1', 'a2', 'a3', 'a4'];
const nada = new Set<string>();
const prog = (p: Partial<Programacao>): Programacao =>
	programacaoSchema.parse({ modo: 'semana', inicio: '2026-10-15', ...p });
const datas = (g: ReturnType<typeof agendar>) => g.map((x) => [x.data, x.itens.map((i) => i.id)]);

describe('agendar', () => {
	it('toda quinta, uma por vez', () => {
		// 15/10/2026 é uma quinta.
		const g = agendar(prog({ dias: [4] }), ids, nada, '2026-10-09');
		expect(datas(g)).toEqual([
			['2026-10-15', ['a1']],
			['2026-10-22', ['a2']],
			['2026-10-29', ['a3']],
			['2026-11-05', ['a4']]
		]);
	});

	it('segunda e quarta, duas por vez', () => {
		const g = agendar(
			prog({ dias: [1, 3], porVez: 2, inicio: '2026-10-12' }),
			ids,
			nada,
			'2026-10-09'
		);
		expect(datas(g)).toEqual([
			['2026-10-12', ['a1', 'a2']],
			['2026-10-14', ['a3', 'a4']]
		]);
	});

	it('o que já saiu (ou não saiu) ocupa a vaga dele, e as outras ficam na data', () => {
		const g = agendar(prog({ dias: [4] }), ids, new Set(['a1', 'a2']), '2026-10-16');
		expect(datas(g)).toEqual([
			['2026-10-29', ['a3']],
			['2026-11-05', ['a4']]
		]);
	});

	it('atrasada recomeça de hoje, no mesmo ritmo', () => {
		// Pausada desde antes de 15/10; retomada numa terça, 03/11.
		const g = agendar(prog({ dias: [4] }), ids, new Set(['a1']), '2026-11-03');
		expect(datas(g)).toEqual([
			['2026-11-05', ['a2']],
			['2026-11-12', ['a3']],
			['2026-11-19', ['a4']]
		]);
	});

	it('1 por mês: dia 31 vira o último dia dos meses curtos', () => {
		const g = agendar(
			prog({ modo: 'intervalo', unidade: 'meses', inicio: '2027-01-31' }),
			['a1', 'a2', 'a3'],
			nada,
			'2026-10-09'
		);
		expect(g.map((x) => x.data)).toEqual(['2027-01-31', '2027-02-28', '2027-03-31']);
		expect(somarMeses('2028-01-31', 1)).toBe('2028-02-29');
	});

	it('tudo agora: um envio só, sem data', () => {
		expect(datas(agendar(prog({ modo: 'agora' }), ids, new Set(['a1']), '2026-10-09'))).toEqual([
			[null, ['a2', 'a3', 'a4']]
		]);
	});

	it('datas escolhidas, e a que caiu no passado sai hoje', () => {
		const g = agendar(
			prog({ modo: 'datas', datas: { a1: '2026-10-01', a2: '2026-10-20' } }),
			['a1', 'a2'],
			nada,
			'2026-10-09'
		);
		expect(datas(g)).toEqual([
			['2026-10-09', ['a1']],
			['2026-10-20', ['a2']]
		]);
	});

	it('fora não entra; pulada fica na lista marcada; adiada anda uma semana', () => {
		const g = agendar(
			prog({ dias: [4], fora: ['a4'], pulei: ['a2'], adiei: { a3: 1 } }),
			ids,
			nada,
			'2026-10-09'
		);
		expect(datas(g)).toEqual([
			['2026-10-15', ['a1']],
			['2026-10-22', ['a2']],
			['2026-11-05', ['a3']]
		]);
		expect(g[1].itens[0].pulada).toBe(true);
		expect(g[2].itens[0].adiada).toBe(true);
	});

	it('semana sem dia nenhum não inventa data', () => {
		expect(agendar(prog({ dias: [] }), ids, nada, '2026-10-09')).toEqual([]);
	});
});

describe('rótulos e fuso', () => {
	it('escreve como a prévia', () => {
		expect(rotuloDaData('2026-10-15')).toBe('qui 15/10');
		expect(resumoDaProgramacao(prog({ dias: [4] }))).toBe('toda quinta, 8h');
		expect(resumoDaProgramacao(prog({ dias: [6] }))).toBe('todo sábado, 8h');
		expect(resumoDaProgramacao(prog({ dias: [0] }))).toBe('todo domingo, 8h');
		// Módulo não manda e-mail: a programação gravada com o antigo `canal`
		// continua lendo, e o resumo não fala de e-mail nenhum.
		const antiga = programacaoSchema.parse({
			modo: 'semana',
			canal: 'email',
			inicio: '2026-10-15',
			dias: [4]
		});
		expect(antiga).not.toHaveProperty('canal');
		expect(resumoDaProgramacao(antiga)).toBe('toda quinta, 8h');
		expect(resumoDaProgramacao(prog({ dias: [3, 1], hora: '07:30' }))).toBe(
			'segunda e quarta, 7h30'
		);
		expect(resumoDaProgramacao(prog({ modo: 'intervalo', intervalo: 2 }))).toBe(
			'a cada 2 semanas, 8h'
		);
	});

	it('o instante é em Brasília, e o "hoje" também', () => {
		expect(instanteDe('2026-10-15', '08:00').toISOString()).toBe('2026-10-15T11:00:00.000Z');
		// 01h UTC do dia 16 ainda é dia 15 em Brasília.
		expect(hojeEmBrasilia(new Date('2026-10-16T01:00:00Z'))).toBe('2026-10-15');
	});
});
