import { env } from '$env/dynamic/private';
import { manualBillingProvider } from './manual-provider';
import { mercadoPagoBillingProvider } from './mercadopago/provider';
import { tokenDoMercadoPago } from './mercadopago/cliente';
import type { BillingProvider } from './provider';

/**
 * Qual provedor de cobrança está em uso (docs/adr-002-billing.md).
 *
 * - vazio ou `manual`: "Assinar" vira um pedido que a equipe atende no painel;
 * - `mercadopago`: o checkout do Mercado Pago, com o webhook ativando o plano.
 *
 * `mercadopago` sem `MERCADOPAGO_ACCESS_TOKEN` falha ALTO, e nome desconhecido
 * também — cair no manual em silêncio faria a equipe achar que o gateway cobrou.
 */
/** Qual provedor a TELA deve descrever. Não lança: a conta abre mesmo mal configurada. */
export function nomeDoProvedor(): 'manual' | 'mercadopago' {
	return env.BILLING_PROVIDER === 'mercadopago' ? 'mercadopago' : 'manual';
}

export function getBillingProvider(): BillingProvider {
	const nome = env.BILLING_PROVIDER;
	if (!nome || nome === 'manual') return manualBillingProvider;
	if (nome === 'mercadopago') {
		if (!tokenDoMercadoPago()) {
			throw new Error('BILLING_PROVIDER="mercadopago" sem MERCADOPAGO_ACCESS_TOKEN.');
		}
		return mercadoPagoBillingProvider();
	}
	throw new Error(
		`BILLING_PROVIDER="${nome}" não tem implementação. Use "manual" ou "mercadopago".`
	);
}
