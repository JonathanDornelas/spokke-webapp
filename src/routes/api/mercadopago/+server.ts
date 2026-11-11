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
	// Toda saída daqui deixa uma linha no log do web. O adapter-node não registra
	// pedidos, então "a notificação não chegou", "chegou e a assinatura não
	// conferiu" e "chegou com outro tópico" eram iguais vistos do servidor: plano
	// sem ativar e nenhum rastro. Nunca o segredo nem o valor da assinatura —
	// só o que diz ONDE parou.
	if (!valida) {
		const tem = (nome: string) => (request.headers.has(nome) ? 'sim' : 'não');
		console.warn(
			`[mercadopago] notificação recusada (401): a assinatura não confere — tópico ${notificacao.topico ?? '?'}, ` +
				`id ${notificacao.id ?? '?'}, data.id na URL: ${notificacao.dataIdDaUrl ? 'sim' : 'não'}, ` +
				`x-signature: ${tem('x-signature')}, x-request-id: ${tem('x-request-id')}`
		);
		error(401, 'Assinatura inválida');
	}

	// Tópico que não mexe em assinatura (pagamento avulso, plano) e id que não
	// parece id são aceitos e ignorados: um 4xx aqui faria o provedor reenviar
	// para sempre algo que nunca vai servir.
	if (
		ehTopicoDeAssinatura(notificacao.topico) &&
		notificacao.id &&
		/^[\w-]{1,100}$/.test(notificacao.id)
	) {
		await enqueueMercadoPago({ topico: notificacao.topico, id: notificacao.id });
		console.info(`[mercadopago] notificação na fila: ${notificacao.topico} ${notificacao.id}`);
	} else {
		console.info(
			`[mercadopago] notificação ignorada: tópico ${notificacao.topico ?? '?'}, id ${notificacao.id ?? '?'}`
		);
	}
	return json({ recebido: true });
};
