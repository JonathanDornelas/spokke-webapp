import { describe, expect, it } from 'vitest';
import { PLANOS_PAGOS } from './catalogo';
import { PRECO_EM_CENTAVOS, porMes, reais } from './precos';
import { planos } from '$lib/content/planos';

describe('preços', () => {
	it('escreve reais sem centavos quando é redondo, com eles quando não é', () => {
		expect(reais(2_900)).toBe('R$ 29');
		expect(reais(29_000)).toBe('R$ 290');
		expect(reais(2_417)).toBe('R$ 24,17');
	});

	it('o anual por mês é o total dividido por doze, arredondado', () => {
		expect(porMes('basico', 'anual')).toBe(2_400);
		expect(porMes('pro', 'mensal')).toBe(5_900);
	});

	it('a vitrine anuncia o que o checkout cobra', () => {
		for (const id of PLANOS_PAGOS) {
			const plano = planos.find((p) => p.id === id)!;
			expect(plano.preco.mensal).toBe(reais(PRECO_EM_CENTAVOS[id].mensal));
			expect(plano.nota.anual).toContain(reais(PRECO_EM_CENTAVOS[id].anual));
		}
	});
});
