import { describe, expect, it } from 'vitest';
import { ehOPlanoEmVigor, type PlanoEmVigor } from './troca';

/**
 * A regra que a tela de planos e `solicitarPlano` dividem: o plano e o ciclo
 * que já renovam sozinhos no gateway não abrem checkout — seria a mesma
 * assinatura duas vezes, a segunda cobrada por inteiro.
 */
describe('ehOPlanoEmVigor', () => {
	const pro: PlanoEmVigor = { plano: 'pro', ciclo: 'mensal', renovaSozinha: true };

	it('o mesmo plano e ciclo, renovando: não abre checkout', () => {
		expect(ehOPlanoEmVigor(pro, 'pro', 'mensal')).toBe(true);
	});

	it('outro plano ou outro ciclo é troca', () => {
		expect(ehOPlanoEmVigor(pro, 'super', 'mensal')).toBe(false);
		expect(ehOPlanoEmVigor(pro, 'pro', 'anual')).toBe(false);
	});

	it('renovação cancelada: escolher o mesmo é assinar de novo', () => {
		expect(ehOPlanoEmVigor({ ...pro, renovaSozinha: false }, 'pro', 'mensal')).toBe(false);
	});

	it('sem plano pago pelo gateway, tudo é assinatura nova', () => {
		expect(ehOPlanoEmVigor(null, 'pro', 'mensal')).toBe(false);
	});
});
