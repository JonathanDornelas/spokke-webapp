import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import {
	assinaturaDoWebhookValida,
	ehTopicoDeAssinatura,
	lerNotificacao
} from '$lib/server/billing/mercadopago/webhook';
import { enqueueMercadoPago } from '$lib/server/queue';

/**
 * O webhook do Mercado Pago — billing.md "As três disciplinas" e "Mercado Pago".
 * Um `+server.ts` com o corpo cru, não remote function nem form action.
 *
 * Ele faz o mínimo e responde rápido: confere a assinatura (`x-signature`),
 * enfileira QUAL recurso mudou e devolve 200. Buscar o recurso na API e aplicar
 * é do worker (job `mercadopago`), com as retentativas da fila — o Mercado Pago
 * espera a resposta por poucos segundos, e um provedor lento do nosso lado não
 * pode virar notificação perdida do lado dele.
 *
 * Sem segredo configurado, 503: aceitar notificação que não dá para conferir
 * seria aceitar de qualquer um. (Mesmo conferida, ela não é a verdade — o worker
 * relê o recurso com o nosso token.)
 */
export const POST: RequestHandler = async ({ request, url }) => {
	const corpo = await request.text();
	const segredo = env.MERCADOPAGO_WEBHOOK_SECRET?.trim();
	if (!segredo) {
		console.error('[mercadopago] notificação recebida sem MERCADOPAGO_WEBHOOK_SECRET configurado');
		error(503, 'Webhook não configurado');
	}

	const notificacao = lerNotificacao(url, corpo);
	const valida = assinaturaDoWebhookValida({
		xSignature: request.headers.get('x-signature'),
		xRequestId: request.headers.get('x-request-id'),
		dataId: notificacao.dataIdDaUrl ?? notificacao.id,
		segredo
	});
	if (!valida) error(401, 'Assinatura inválida');

	// Tópico que não mexe em assinatura (pagamento avulso, plano) e id que não
	// parece id são aceitos e ignorados: um 4xx aqui faria o provedor reenviar
	// para sempre algo que nunca vai servir.
	if (
		ehTopicoDeAssinatura(notificacao.topico) &&
		notificacao.id &&
		/^[\w-]{1,100}$/.test(notificacao.id)
	) {
		await enqueueMercadoPago({ topico: notificacao.topico, id: notificacao.id });
	}
	return json({ recebido: true });
};
