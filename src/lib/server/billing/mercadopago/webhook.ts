import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

/**
 * A porta do webhook do Mercado Pago — o que dá para decidir sem rede.
 *
 * **A assinatura (`x-signature`)** prova que a notificação veio do Mercado Pago:
 * HMAC-SHA256, em hexadecimal, da linha
 * `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`, com o segredo do painel
 * ("Suas integrações" › Webhooks). O `data.id` é o da URL da notificação, em
 * minúsculas quando é alfanumérico; o par que faltar sai da linha inteiro.
 *
 * **E mesmo assinada, a notificação não é a verdade** (billing.md "As três
 * disciplinas"): ela só diz QUAL recurso mudou. O estado vem de buscar esse
 * recurso na API com o nosso token. Por isso uma notificação repetida, atrasada
 * ou fora de ordem não faz estrago — ela só manda reler.
 */

export function lerCabecalhoDeAssinatura(
	valor: string | null | undefined
): { ts: string; v1: string } | null {
	if (!valor) return null;
	const partes = new Map(
		valor.split(',').map((parte) => {
			const [chave, ...resto] = parte.split('=');
			return [chave?.trim() ?? '', resto.join('=').trim()] as const;
		})
	);
	const ts = partes.get('ts');
	const v1 = partes.get('v1');
	return ts && v1 ? { ts, v1 } : null;
}

/** A linha que o Mercado Pago assina. Valor ausente = o par sai inteiro. */
export function manifestoDoWebhook(partes: {
	dataId: string | null;
	requestId: string | null;
	ts: string | null;
}): string {
	const id =
		partes.dataId && /[a-z]/i.test(partes.dataId) ? partes.dataId.toLowerCase() : partes.dataId;
	return [
		id ? `id:${id};` : '',
		partes.requestId ? `request-id:${partes.requestId};` : '',
		partes.ts ? `ts:${partes.ts};` : ''
	].join('');
}

export function assinaturaDoWebhookValida(entrada: {
	xSignature: string | null;
	xRequestId: string | null;
	dataId: string | null;
	segredo: string;
}): boolean {
	const cabecalho = lerCabecalhoDeAssinatura(entrada.xSignature);
	if (!cabecalho || !entrada.segredo) return false;
	const esperado = createHmac('sha256', entrada.segredo)
		.update(
			manifestoDoWebhook({
				dataId: entrada.dataId,
				requestId: entrada.xRequestId,
				ts: cabecalho.ts
			})
		)
		.digest('hex');
	const a = Buffer.from(esperado, 'utf8');
	const b = Buffer.from(cabecalho.v1.toLowerCase(), 'utf8');
	// Comparação em tempo constante: a igualdade simples vaza, pelo tempo, quantos
	// caracteres batem.
	return a.length === b.length && timingSafeEqual(a, b);
}

/** Os tópicos que mexem na assinatura. O resto (pagamento avulso, plano) é ignorado com 200. */
export const TOPICOS_DE_ASSINATURA = [
	'subscription_preapproval',
	'subscription_authorized_payment'
] as const;
export type TopicoDeAssinatura = (typeof TOPICOS_DE_ASSINATURA)[number];

const corpoSchema = z
	.object({
		type: z.string().optional(),
		topic: z.string().optional(),
		action: z.string().optional(),
		data: z
			.object({ id: z.union([z.string(), z.number()]) })
			.partial()
			.optional()
	})
	.passthrough();

/**
 * O tópico e o id do recurso, de onde vierem: o corpo JSON (`type`, `data.id`)
 * ou a URL (`type`/`topic`, `data.id`/`id`). `dataIdDaUrl` é o que entra na
 * assinatura — o Mercado Pago assina o id que pôs na URL.
 */
export function lerNotificacao(
	url: URL,
	corpoCru: string
): { topico: string | null; id: string | null; dataIdDaUrl: string | null } {
	let corpo: z.infer<typeof corpoSchema> = {};
	try {
		const lido = corpoSchema.safeParse(corpoCru ? JSON.parse(corpoCru) : {});
		if (lido.success) corpo = lido.data;
	} catch {
		// Corpo que não é JSON: fica o que a URL disser.
	}
	const dataIdDaUrl = url.searchParams.get('data.id');
	const idDoCorpo = corpo.data?.id;
	return {
		topico:
			corpo.type ?? corpo.topic ?? url.searchParams.get('type') ?? url.searchParams.get('topic'),
		id: dataIdDaUrl ?? (idDoCorpo == null ? null : String(idDoCorpo)) ?? url.searchParams.get('id'),
		dataIdDaUrl
	};
}

export function ehTopicoDeAssinatura(topico: string | null): topico is TopicoDeAssinatura {
	return (TOPICOS_DE_ASSINATURA as readonly string[]).includes(topico ?? '');
}
