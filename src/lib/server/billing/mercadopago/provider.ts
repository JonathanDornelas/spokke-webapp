import { prisma } from '$lib/server/db/client';
import { NOME_DO_PLANO } from '$lib/billing/catalogo';
import { MESES_DO_CICLO, PRECO_EM_CENTAVOS } from '$lib/billing/precos';
import { registrar } from '../assinaturas';
import type { BillingProvider } from '../provider';
import { clienteMercadoPago, type ClienteMercadoPago } from './cliente';
import { PROVEDOR } from './sincronizar';

/**
 * O Mercado Pago como `BillingProvider` (docs/adr-002-billing.md, billing.md
 * "Mercado Pago"). "Assinar" cria uma assinatura PENDENTE no provedor e devolve
 * o checkout dele (`init_point`): o cartão é digitado lá, nunca aqui — o produto
 * não toca em número de cartão.
 *
 * Nada é liberado neste momento. Quem ativa o plano é o webhook (pela fila) ou
 * a releitura na volta do checkout, os dois por `sincronizar.ts` — e os dois só
 * depois de o Mercado Pago dizer `authorized`.
 */
export function mercadoPagoBillingProvider(
	cliente: ClienteMercadoPago = clienteMercadoPago()
): BillingProvider {
	return {
		nome: 'mercadopago',
		podeDesfazerCancelamento: false,

		async iniciarAssinatura(teacher, plano, ciclo, contexto) {
			const centavos = PRECO_EM_CENTAVOS[plano][ciclo];
			// Fora de qualquer transação: chamada de rede não segura trava de banco.
			const mp = await cliente.criarAssinatura(
				{
					reason: `Spokke ${NOME_DO_PLANO[plano]} (${ciclo})`,
					// O id do professor: é o que a notificação traz de volta, e o que
					// `aplicarAssinatura` confere contra a linha gravada abaixo.
					external_reference: teacher.id,
					payer_email: teacher.email,
					back_url: `${contexto.origem}/conta?aba=assinatura&checkout=mercadopago`,
					auto_recurring: {
						frequency: MESES_DO_CICLO[ciclo],
						frequency_type: 'months',
						transaction_amount: centavos / 100,
						currency_id: 'BRL'
					},
					status: 'pending'
				},
				crypto.randomUUID()
			);
			if (!mp.init_point) {
				throw new Error('O Mercado Pago criou a assinatura sem o link do checkout.');
			}
			await prisma.$transaction(async (tx) => {
				await tx.providerSubscription.create({
					data: {
						id: mp.id,
						provider: PROVEDOR,
						teacherId: teacher.id,
						plano,
						ciclo,
						status: mp.status,
						checkoutUrl: mp.init_point
					}
				});
				await registrar(tx, {
					teacherId: teacher.id,
					actor: 'professor',
					type: 'checkout_iniciado',
					data: { provedor: PROVEDOR, plano, ciclo, assinatura: mp.id }
				});
			});
			return { tipo: 'redirecionar', url: mp.init_point };
		},

		// O Mercado Pago não tem portal de cliente: a assinatura aparece na conta
		// do Mercado Pago de quem pagou, e cancelar daqui é o botão da Conta.
		async abrirPortal() {
			return { tipo: 'indisponivel' };
		},

		async cancelarRenovacao(teacherId) {
			const vigentes = await prisma.providerSubscription.findMany({
				where: { teacherId, provider: PROVEDOR, status: { in: ['authorized', 'paused'] } }
			});
			for (const assinatura of vigentes) {
				const cancelada = await cliente.cancelarAssinatura(assinatura.id);
				await prisma.providerSubscription.update({
					where: { id: assinatura.id },
					data: { status: cancelada.status === 'canceled' ? 'cancelled' : cancelada.status }
				});
			}
		}
	};
}
