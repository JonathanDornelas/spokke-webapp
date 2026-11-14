import { describe, expect, it } from 'vitest';
import {
	ULTIMO_DA_ATIVIDADE,
	ULTIMO_DE_UM_MATERIAL,
	ULTIMO_DO_MATERIAL,
	alternarNoGeral,
	alternarNoMaterial,
	bloqueioNoGeral,
	bloqueioNoMaterial,
	estadoNoGeral,
	lerTiposPorMaterial,
	montarPlano
} from './tipos-por-material';

const MATERIAIS = ['a', 'b', 'c'];

describe('tipos por material', () => {
	it('material sem lista própria nasce com o bloco de cima', () => {
		const plano = montarPlano(['reading', 'writing'], { a: ['reading'] }, MATERIAIS);
		expect(plano.porMaterial).toEqual({
			a: ['reading'],
			b: ['reading', 'writing'],
			c: ['reading', 'writing']
		});
	});

	it('o bloco de cima é a união dos materiais', () => {
		const plano = montarPlano(['listening'], { a: ['reading'], b: ['writing'], c: [] }, MATERIAIS);
		expect(plano.geral).toEqual(['reading', 'writing']);
	});

	it('mexer no bloco de cima muda todos os materiais', () => {
		const plano = montarPlano(['reading'], {}, MATERIAIS);
		const com = alternarNoGeral(plano, 'writing', MATERIAIS);
		expect(Object.values(com.porMaterial)).toEqual([
			['reading', 'writing'],
			['reading', 'writing'],
			['reading', 'writing']
		]);
		const sem = alternarNoGeral(com, 'writing', MATERIAIS);
		expect(sem.geral).toEqual(['reading']);
		expect(Object.values(sem.porMaterial).every((l) => !l.includes('writing'))).toBe(true);
	});

	it('ligar num material um tipo que o bloco não tem liga no bloco também, e só naquele material', () => {
		const plano = montarPlano(['reading'], {}, MATERIAIS);
		const depois = alternarNoMaterial(plano, 'b', 'speaking', MATERIAIS);
		expect(depois.geral).toEqual(['speaking', 'reading']);
		expect(depois.porMaterial.a).toEqual(['reading']);
		expect(depois.porMaterial.b).toEqual(['speaking', 'reading']);
		expect(estadoNoGeral(depois, 'speaking', MATERIAIS)).toEqual({
			tipo: 'alguns',
			ligados: 1,
			total: 3
		});
	});

	it('desligado em todos os materiais, o tipo sai do bloco de cima', () => {
		let plano = montarPlano(['reading'], {}, MATERIAIS);
		plano = alternarNoMaterial(plano, 'a', 'speaking', MATERIAIS);
		plano = alternarNoMaterial(plano, 'a', 'speaking', MATERIAIS);
		expect(plano.geral).toEqual(['reading']);
	});

	it('o clique no parcial liga em todos', () => {
		let plano = montarPlano(['reading'], {}, MATERIAIS);
		plano = alternarNoMaterial(plano, 'a', 'writing', MATERIAIS);
		plano = alternarNoGeral(plano, 'writing', MATERIAIS);
		expect(estadoNoGeral(plano, 'writing', MATERIAIS)).toEqual({ tipo: 'todos' });
	});

	it('sem material, o bloco de cima é o que o professor marcou', () => {
		const plano = alternarNoGeral(montarPlano(['reading'], {}, []), 'writing', []);
		expect(plano.geral).toEqual(['reading', 'writing']);
		expect(plano.porMaterial).toEqual({});
	});

	it('material que saiu da atividade sai do mapa', () => {
		const plano = montarPlano(['reading'], { a: ['writing'], z: ['speaking'] }, MATERIAIS);
		expect(Object.keys(plano.porMaterial)).toEqual(MATERIAIS);
	});

	describe('nenhum material fica sem tipo', () => {
		it('o último tipo de um material não desliga, e o motivo vai para a tela', () => {
			const plano = montarPlano(['reading', 'writing'], { a: ['reading'] }, MATERIAIS);
			expect(bloqueioNoMaterial(plano.porMaterial.a ?? [], 'reading')).toBe(ULTIMO_DO_MATERIAL);
			expect(alternarNoMaterial(plano, 'a', 'reading', MATERIAIS)).toBe(plano);
			// Ligar nunca é barrado, e com dois ligados o clique desliga.
			expect(bloqueioNoMaterial(plano.porMaterial.a ?? [], 'writing')).toBeNull();
			expect(bloqueioNoMaterial(plano.porMaterial.b ?? [], 'reading')).toBeNull();
		});

		it('o bloco de cima não desliga o tipo que é o único de algum material', () => {
			const plano = montarPlano(['reading', 'writing'], { a: ['reading'] }, MATERIAIS);
			expect(bloqueioNoGeral(plano, 'reading', MATERIAIS)).toBe(ULTIMO_DE_UM_MATERIAL);
			expect(alternarNoGeral(plano, 'reading', MATERIAIS)).toBe(plano);
			// O parcial (escrita em 2 de 3) liga em todos: nunca é barrado.
			expect(bloqueioNoGeral(plano, 'writing', MATERIAIS)).toBeNull();
		});

		it('o último tipo da atividade não desliga, com ou sem material', () => {
			expect(bloqueioNoGeral(montarPlano(['reading'], {}, MATERIAIS), 'reading', MATERIAIS)).toBe(
				ULTIMO_DA_ATIVIDADE
			);
			expect(bloqueioNoGeral(montarPlano(['reading'], {}, []), 'reading', [])).toBe(
				ULTIMO_DA_ATIVIDADE
			);
		});

		it('tipo que não entrega hoje não conta como "ainda ligado"', () => {
			const semVoz = new Set(['listening'] as const);
			const plano = montarPlano(['listening', 'reading'], {}, MATERIAIS);
			expect(bloqueioNoGeral(plano, 'reading', MATERIAIS, semVoz)).toBe(ULTIMO_DA_ATIVIDADE);
			expect(bloqueioNoMaterial(['listening', 'reading'], 'reading', semVoz)).toBe(
				ULTIMO_DO_MATERIAL
			);
		});
	});

	it('lê o Json do banco sem confiar no tipo', () => {
		expect(lerTiposPorMaterial({ a: ['reading', 'voar'] })).toEqual({});
		expect(lerTiposPorMaterial(null)).toEqual({});
		expect(lerTiposPorMaterial({ a: ['reading'] })).toEqual({ a: ['reading'] });
	});
});
