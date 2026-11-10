import { describe, expect, it } from 'vitest';
import {
	acessoriosLigados,
	alternarAcessorio,
	ciclar,
	codigoDaOpcao,
	escolhaAtual,
	trocarCasa
} from './editar';
import { CASAS_ACESSORIO, CATEGORIAS, MAX_ACESSORIOS } from './catalogo';
import { CASAS, CODIGO_PADRAO, decodificar } from './montar';

describe('trocarCasa', () => {
	it('troca só a casa pedida', () => {
		const antes = decodificar(CODIGO_PADRAO);
		const depois = decodificar(trocarCasa(CODIGO_PADRAO, 1, 5));
		expect({ ...depois, cabelo: antes.cabelo }).toEqual(antes);
	});

	it('devolve sempre as dezoito casas', () => {
		expect(trocarCasa('2-3', 10, 4).split('-')).toHaveLength(CASAS);
	});

	it('dá a volta em valor acima do limite', () => {
		// 8 bocas não existem (são 7): a escolha volta para a primeira.
		expect(decodificar(trocarCasa(CODIGO_PADRAO, 5, 7)).boca).toBe(0);
	});

	it('ignora casa fora do código', () => {
		expect(() => trocarCasa(CODIGO_PADRAO, 99, 1)).not.toThrow();
	});
});

describe('acessórios — a única escolha múltipla', () => {
	it('começa sem nenhum', () => {
		expect(acessoriosLigados(CODIGO_PADRAO)).toEqual([]);
	});

	it('liga uma peça', () => {
		expect(acessoriosLigados(alternarAcessorio(CODIGO_PADRAO, 4))).toEqual([4]);
	});

	it('liga três ao mesmo tempo', () => {
		let c = CODIGO_PADRAO;
		for (const peca of [8, 4, 12]) c = alternarAcessorio(c, peca);
		expect(acessoriosLigados(c)).toEqual([8, 4, 12]);
	});

	it('tocar de novo desliga', () => {
		let c = alternarAcessorio(CODIGO_PADRAO, 8);
		c = alternarAcessorio(c, 4);
		expect(acessoriosLigados(alternarAcessorio(c, 8))).toEqual([4]);
	});

	it('no teto, a mais antiga sai para a nova entrar', () => {
		let c = CODIGO_PADRAO;
		for (const peca of [2, 4, 5]) c = alternarAcessorio(c, peca);
		expect(acessoriosLigados(alternarAcessorio(c, 12))).toEqual([4, 5, 12]);
	});

	it('nunca passa do teto, por mais que se toque', () => {
		let c = CODIGO_PADRAO;
		for (const peca of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
			c = alternarAcessorio(c, peca);
			expect(acessoriosLigados(c).length).toBeLessThanOrEqual(MAX_ACESSORIOS);
		}
	});

	it('"nenhum" limpa as três casas de uma vez', () => {
		let c = CODIGO_PADRAO;
		for (const peca of [2, 4, 5]) c = alternarAcessorio(c, peca);
		expect(acessoriosLigados(alternarAcessorio(c, 0))).toEqual([]);
	});

	it('mexer em acessório não mexe no resto do avatar', () => {
		const base = '3-5-2-1-4-2-3-1-2-1-7-4-3-0-1-6-0-0';
		const depois = decodificar(alternarAcessorio(base, 9));
		const antes = decodificar(base);
		expect({ ...depois, acessorio: 0, acessorio2: 0, acessorio3: 0 }).toEqual({
			...antes,
			acessorio: 0,
			acessorio2: 0,
			acessorio3: 0
		});
	});
});

describe('codigoDaOpcao', () => {
	it('mostra a peça no avatar de agora, não num manequim', () => {
		const base = '4-2-6-3-1-2-1-1-1-1-9-5-2-0-1-7-0-0';
		const p = decodificar(codigoDaOpcao(base, 1, 11));
		expect({ cabelo: p.cabelo, pele: p.pele, roupa: p.roupa }).toEqual({
			cabelo: 11,
			pele: 4,
			roupa: 9
		});
	});

	it('em acessório mostra a peça SOZINHA', () => {
		let c = CODIGO_PADRAO;
		for (const peca of [2, 4, 5]) c = alternarAcessorio(c, peca);
		expect(acessoriosLigados(codigoDaOpcao(c, CASAS_ACESSORIO[0], 9))).toEqual([9]);
	});
});

describe('a escolha atual e as setas do editor', () => {
	const cat = (chave: string) => CATEGORIAS.find((c) => c.chave === chave)!;

	it('diz o nome da peça, a posição e o total', () => {
		const codigo = trocarCasa(CODIGO_PADRAO, 1, 2);
		expect(escolhaAtual(cat('cabelo'), codigo)).toMatchObject({
			indice: 2,
			total: cat('cabelo').nFormas,
			nome: 'longo',
			cicla: true
		});
	});

	it('onde só há cor, a escolha é a cor', () => {
		const codigo = trocarCasa(CODIGO_PADRAO, 0, 3);
		expect(escolhaAtual(cat('pele'), codigo)).toMatchObject({ indice: 3, nome: 'tom de pele 4' });
	});

	it('acessório não cicla e lista o que está ligado', () => {
		let codigo = alternarAcessorio(CODIGO_PADRAO, 8);
		codigo = alternarAcessorio(codigo, 4);
		expect(escolhaAtual(cat('acessorio'), codigo)).toMatchObject({
			indice: 2,
			nome: 'coroa e fone',
			cicla: false
		});
		expect(ciclar(cat('acessorio'), codigo, 1)).toBe(codigo);
	});

	it('as setas dão a volta nas duas pontas', () => {
		const ultimo = trocarCasa(CODIGO_PADRAO, 1, cat('cabelo').nFormas - 1);
		expect(escolhaAtual(cat('cabelo'), ciclar(cat('cabelo'), ultimo, 1)).indice).toBe(0);
		const primeiro = trocarCasa(CODIGO_PADRAO, 1, 0);
		expect(escolhaAtual(cat('cabelo'), ciclar(cat('cabelo'), primeiro, -1)).indice).toBe(
			cat('cabelo').nFormas - 1
		);
	});
});
