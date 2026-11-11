import { describe, expect, it } from 'vitest';
import { CUSTO_IA } from './catalogo';
import { custoDaGeracao } from './ia';

/**
 * A conta dos créditos de uma geração por IA: é ela que o botão mostra e o servidor debita.
 * Os números esperados saem de `CUSTO_IA`, então o teste vale enquanto a REGRA valer (propostas +
 * leitura do arquivo, minuto começado conta inteiro), e não só para os valores de hoje.
 */
describe('custoDaGeracao', () => {
	it('prompt: só as propostas', () => {
		expect(custoDaGeracao({ quantos: 10, fonte: 'prompt' })).toEqual({
			propostas: 10 * CUSTO_IA.porProposta,
			leitura: 0,
			minutos: 0,
			total: 10 * CUSTO_IA.porProposta
		});
	});

	it('imagem: as propostas mais a leitura da foto', () => {
		const c = custoDaGeracao({ quantos: 10, fonte: 'imagem' });
		expect(c.leitura).toBe(CUSTO_IA.porImagem);
		expect(c.total).toBe(10 * CUSTO_IA.porProposta + CUSTO_IA.porImagem);
	});

	it('vídeo: cada minuto de fala começado conta inteiro', () => {
		const minutos = (segundos: number) =>
			custoDaGeracao({ quantos: 5, fonte: 'video', segundos }).minutos;
		expect(minutos(1)).toBe(1);
		expect(minutos(60)).toBe(1);
		expect(minutos(60.5)).toBe(2);
		expect(minutos(150)).toBe(3);
		expect(minutos(600)).toBe(10);
	});

	it('vídeo: o exemplo do brief, 2:30 de fala e 10 propostas', () => {
		const c = custoDaGeracao({ quantos: 10, fonte: 'video', segundos: 150 });
		expect(c.leitura).toBe(3 * CUSTO_IA.porMinutoDeFala);
		expect(c.total).toBe(10 * CUSTO_IA.porProposta + 3 * CUSTO_IA.porMinutoDeFala);
	});

	it('vídeo sem duração conhecida cobra o mínimo de um minuto, nunca zero', () => {
		expect(custoDaGeracao({ quantos: 5, fonte: 'video' }).minutos).toBe(1);
		expect(custoDaGeracao({ quantos: 5, fonte: 'video', segundos: 0 }).minutos).toBe(1);
	});
});
