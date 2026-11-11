import { describe, expect, it } from 'vitest';
import { ThinkingLevel } from '@google/genai';
import { raciocinioMinimo } from './gemini-provider';

/**
 * O raciocínio do modelo entra na conta dos preços (docs/adr-002-billing.md
 * "Preços"): ligado no padrão, ele dobrava o pior caso dos créditos. E cada
 * geração do Gemini aceita uma opção diferente — pedir a errada é recusa em
 * TODA geração, com a tela dizendo só "o provedor recusou o pedido".
 */
describe('raciocínio mínimo por modelo', () => {
	it('Gemini 3 em diante: o nível mínimo no Flash, o baixo no Pro', () => {
		expect(raciocinioMinimo('gemini-3-flash-preview')).toEqual({
			thinkingLevel: ThinkingLevel.MINIMAL
		});
		expect(raciocinioMinimo('gemini-3.8-flash')).toEqual({ thinkingLevel: ThinkingLevel.MINIMAL });
		expect(raciocinioMinimo('gemini-3-pro-preview')).toEqual({ thinkingLevel: ThinkingLevel.LOW });
	});

	it('Gemini 2.5: orçamento zero no Flash, o piso de 128 no Pro', () => {
		expect(raciocinioMinimo('gemini-2.5-flash')).toEqual({ thinkingBudget: 0 });
		expect(raciocinioMinimo('gemini-2.5-flash-lite')).toEqual({ thinkingBudget: 0 });
		expect(raciocinioMinimo('gemini-2.5-pro')).toEqual({ thinkingBudget: 128 });
	});

	it('antes da 2.5 não há raciocínio, e a opção nem vai', () => {
		expect(raciocinioMinimo('gemini-2.0-flash')).toBeUndefined();
		expect(raciocinioMinimo('gemini-1.5-flash')).toBeUndefined();
	});

	it('aceita o id com o prefixo "models/"', () => {
		expect(raciocinioMinimo('models/gemini-2.5-flash')).toEqual({ thinkingBudget: 0 });
	});
});
