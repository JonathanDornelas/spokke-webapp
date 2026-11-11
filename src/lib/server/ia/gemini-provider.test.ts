import { describe, expect, it } from 'vitest';
import { ThinkingLevel } from '@google/genai';
import {
	limiteDoProvedor,
	provedorOcupado,
	raciocinioAcima,
	raciocinioMinimo,
	recusouORaciocinio
} from './gemini-provider';

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

/**
 * Quando o modelo recusa o nível pedido, o provedor sobe UM degrau e tenta de novo — foi o caso do
 * `gemini-3.8-flash`, que não aceita o MINIMAL (400 "Thinking level MINIMAL is not supported").
 * Nunca cai no padrão do modelo: sem configuração ele raciocina no máximo, lento e caro.
 */
describe('o degrau acima quando o modelo recusa o raciocínio', () => {
	it('MINIMAL sobe para LOW, LOW para MEDIUM, e o MEDIUM é o teto', () => {
		expect(raciocinioAcima({ thinkingLevel: ThinkingLevel.MINIMAL })).toEqual({
			thinkingLevel: ThinkingLevel.LOW
		});
		expect(raciocinioAcima({ thinkingLevel: ThinkingLevel.LOW })).toEqual({
			thinkingLevel: ThinkingLevel.MEDIUM
		});
		expect(raciocinioAcima({ thinkingLevel: ThinkingLevel.MEDIUM })).toBeNull();
	});

	it('na 2.5 o orçamento zero sobe para o piso de 128; sem raciocínio não há degrau', () => {
		expect(raciocinioAcima({ thinkingBudget: 0 })).toEqual({ thinkingBudget: 128 });
		expect(raciocinioAcima({ thinkingBudget: 128 })).toBeNull();
		expect(raciocinioAcima(undefined)).toBeNull();
	});

	it('só a recusa por causa do raciocínio conta — chave, cota e o resto não', () => {
		const doRaciocinio = {
			status: 400,
			message: '{"error":{"message":"Thinking level MINIMAL is not supported for this model."}}'
		};
		expect(recusouORaciocinio(doRaciocinio)).toBe(true);
		expect(recusouORaciocinio({ status: 400, message: 'API key not valid' })).toBe(false);
		expect(recusouORaciocinio({ status: 429, message: 'thinking quota' })).toBe(false);
		expect(recusouORaciocinio(new Error('rede'))).toBe(false);
	});
});

/** A tela diz o que o professor pode fazer — esperar uns minutos não é o mesmo que o pedido estar errado. */
describe('o tipo da recusa', () => {
	it('503 é sobrecarga que passa sozinha; 429 é o limite da chave', () => {
		const alta = { status: 503, message: 'This model is currently experiencing high demand.' };
		expect(provedorOcupado(alta)).toBe(true);
		expect(limiteDoProvedor(alta)).toBe(false);
		expect(limiteDoProvedor({ status: 429, message: 'RESOURCE_EXHAUSTED' })).toBe(true);
		expect(provedorOcupado({ status: 400, message: 'API key not valid' })).toBe(false);
		expect(provedorOcupado(null)).toBe(false);
	});
});
