import { z } from 'zod';

/**
 * O cliente HTTP do Mercado Pago — só as quatro chamadas de assinatura que o
 * produto usa, com `fetch` e nada de SDK (billing.md "Mercado Pago"). Cada
 * resposta passa por Zod: o provedor é externo, e um campo que mudou de tipo
 * vira erro aqui, não um plano ativado pela metade.
 *
 * `process.env`, e não `$env/dynamic/private`: o worker importa este módulo
 * fora do SvelteKit (o mesmo motivo de `server/tts` e `server/email`).
 *
 * Referência (conferida em novembro de 2026):
 * - POST /preapproval — cria a assinatura; com `status: 'pending'` e sem cartão,
 *   o professor autoriza no `init_point` (o checkout do Mercado Pago);
 * - GET /preapproval/{id} — o estado da assinatura;
 * - PUT /preapproval/{id} — muda a assinatura (cancelar é `status`);
 * - GET /authorized_payments/{id} — uma fatura (cobrança recorrente).
 */

const BASE = 'https://api.mercadopago.com';

/** Tempo máximo de uma chamada. O webhook responde antes; quem espera é o worker. */
const TETO_MS = 15_000;

const numeroOuTexto = z.union([z.number(), z.string()]).transform((v) => Number(v));

export const assinaturaMpSchema = z.object({
	id: z.string(),
	status: z.string(),
	external_reference: z
		.union([z.string(), z.number()])
		.nullish()
		.transform((v) => (v == null ? null : String(v))),
	init_point: z.string().nullish(),
	reason: z.string().nullish(),
	payer_email: z.string().nullish(),
	next_payment_date: z.string().nullish(),
	date_created: z.string().nullish(),
	auto_recurring: z
		.object({
			frequency: z.number().nullish(),
			frequency_type: z.string().nullish(),
			transaction_amount: numeroOuTexto.nullish(),
			currency_id: z.string().nullish()
		})
		.nullish()
});
export type AssinaturaMp = z.infer<typeof assinaturaMpSchema>;

export const faturaMpSchema = z.object({
	id: z.union([z.number(), z.string()]).transform((v) => String(v)),
	preapproval_id: z.string(),
	status: z.string().nullish(),
	debit_date: z.string().nullish(),
	date_created: z.string().nullish(),
	transaction_amount: numeroOuTexto.nullish(),
	external_reference: z
		.union([z.string(), z.number()])
		.nullish()
		.transform((v) => (v == null ? null : String(v))),
	payment: z
		.object({
			id: z.union([z.number(), z.string()]).nullish(),
			status: z.string().nullish(),
			status_detail: z.string().nullish()
		})
		.nullish()
});
export type FaturaMp = z.infer<typeof faturaMpSchema>;

export interface NovaAssinaturaMp {
	reason: string;
	external_reference: string;
	payer_email: string;
	back_url: string;
	auto_recurring: {
		frequency: number;
		frequency_type: 'months';
		transaction_amount: number;
		currency_id: 'BRL';
	};
	status: 'pending';
}

/** A resposta de erro do provedor, com o status HTTP — o worker decide se tenta de novo. */
export class ErroDoMercadoPago extends Error {
	constructor(
		readonly status: number,
		mensagem: string
	) {
		super(mensagem);
		this.name = 'ErroDoMercadoPago';
	}
}

export interface ClienteMercadoPago {
	criarAssinatura(dados: NovaAssinaturaMp, chaveDeIdempotencia: string): Promise<AssinaturaMp>;
	buscarAssinatura(id: string): Promise<AssinaturaMp>;
	cancelarAssinatura(id: string): Promise<AssinaturaMp>;
	buscarFatura(id: string): Promise<FaturaMp>;
}

export function tokenDoMercadoPago(): string | null {
	return process.env.MERCADOPAGO_ACCESS_TOKEN?.trim() || null;
}

/**
 * O cliente de verdade. Sem token, toda chamada falha ALTO — nunca finge que
 * cobrou (o mesmo princípio do `getBillingProvider`).
 */
export function clienteMercadoPago(
	token: string | null = tokenDoMercadoPago()
): ClienteMercadoPago {
	async function chamar<T>(
		metodo: 'GET' | 'POST' | 'PUT',
		caminho: string,
		schema: z.ZodType<T>,
		corpo?: unknown,
		cabecalhos: Record<string, string> = {}
	): Promise<T> {
		if (!token) throw new ErroDoMercadoPago(0, 'MERCADOPAGO_ACCESS_TOKEN não configurado.');
		const resposta = await fetch(`${BASE}${caminho}`, {
			method: metodo,
			headers: {
				Authorization: `Bearer ${token}`,
				'Content-Type': 'application/json',
				...cabecalhos
			},
			body: corpo === undefined ? undefined : JSON.stringify(corpo),
			signal: AbortSignal.timeout(TETO_MS)
		});
		const texto = await resposta.text();
		if (!resposta.ok) {
			// A mensagem do provedor vai para o log do worker e para o painel de
			// jobs; o token nunca aparece nela (vai no cabeçalho, não na URL).
			throw new ErroDoMercadoPago(
				resposta.status,
				`${metodo} ${caminho}: ${resposta.status} ${texto.slice(0, 300)}`
			);
		}
		const json: unknown = texto ? JSON.parse(texto) : {};
		return schema.parse(json);
	}

	return {
		criarAssinatura: (dados, chave) =>
			chamar('POST', '/preapproval', assinaturaMpSchema, dados, { 'X-Idempotency-Key': chave }),
		buscarAssinatura: (id) =>
			chamar('GET', `/preapproval/${encodeURIComponent(id)}`, assinaturaMpSchema),
		// A grafia é a que a própria API devolve no status ("cancelled"). A página
		// de gerenciamento escreve "canceled" num trecho: conferir no sandbox.
		cancelarAssinatura: (id) =>
			chamar('PUT', `/preapproval/${encodeURIComponent(id)}`, assinaturaMpSchema, {
				status: 'cancelled'
			}),
		buscarFatura: (id) =>
			chamar('GET', `/authorized_payments/${encodeURIComponent(id)}`, faturaMpSchema)
	};
}
