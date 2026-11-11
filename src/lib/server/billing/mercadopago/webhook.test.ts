import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
	assinaturaDoWebhookValida,
	ehTopicoDeAssinatura,
	lerCabecalhoDeAssinatura,
	lerNotificacao,
	manifestoDoWebhook
} from './webhook';

const SEGREDO = 'segredo-de-teste';

function assinar(manifesto: string, segredo = SEGREDO): string {
	return createHmac('sha256', segredo).update(manifesto).digest('hex');
}

describe('a assinatura do webhook do Mercado Pago', () => {
	it('lê ts e v1 do cabeçalho, em qualquer ordem e com espaço', () => {
		expect(lerCabecalhoDeAssinatura('ts=1704908010,v1=abc')).toEqual({
			ts: '1704908010',
			v1: 'abc'
		});
		expect(lerCabecalhoDeAssinatura(' v1=abc , ts=1 ')).toEqual({ ts: '1', v1: 'abc' });
		expect(lerCabecalhoDeAssinatura('ts=1')).toBeNull();
		expect(lerCabecalhoDeAssinatura(null)).toBeNull();
	});

	it('monta a linha assinada; o par que falta sai inteiro, e o id alfanumérico vai em minúsculas', () => {
		expect(manifestoDoWebhook({ dataId: '123', requestId: 'req-1', ts: '99' })).toBe(
			'id:123;request-id:req-1;ts:99;'
		);
		expect(manifestoDoWebhook({ dataId: '2C9380', requestId: null, ts: '99' })).toBe(
			'id:2c9380;ts:99;'
		);
		expect(manifestoDoWebhook({ dataId: null, requestId: 'r', ts: '99' })).toBe(
			'request-id:r;ts:99;'
		);
	});

	it('aceita a notificação assinada com o segredo certo', () => {
		const ts = '1704908010';
		const v1 = assinar(`id:2c938084726fca48;request-id:req-9;ts:${ts};`);
		expect(
			assinaturaDoWebhookValida({
				xSignature: `ts=${ts},v1=${v1}`,
				xRequestId: 'req-9',
				dataId: '2C938084726FCA48',
				segredo: SEGREDO
			})
		).toBe(true);
	});

	it('recusa segredo errado, id trocado, assinatura ausente e segredo vazio', () => {
		const ts = '1';
		const v1 = assinar(`id:1;request-id:r;ts:${ts};`);
		const base = {
			xSignature: `ts=${ts},v1=${v1}`,
			xRequestId: 'r',
			dataId: '1',
			segredo: SEGREDO
		};
		expect(assinaturaDoWebhookValida(base)).toBe(true);
		expect(assinaturaDoWebhookValida({ ...base, segredo: 'outro' })).toBe(false);
		expect(assinaturaDoWebhookValida({ ...base, dataId: '2' })).toBe(false);
		expect(assinaturaDoWebhookValida({ ...base, xSignature: null })).toBe(false);
		expect(assinaturaDoWebhookValida({ ...base, segredo: '' })).toBe(false);
		expect(assinaturaDoWebhookValida({ ...base, xSignature: `ts=${ts},v1=curto` })).toBe(false);
	});
});

describe('lerNotificacao', () => {
	it('tópico e id do corpo, e o id da URL para a assinatura', () => {
		const url = new URL(
			'https://spokke.dev/api/mercadopago?data.id=abc123&type=subscription_preapproval'
		);
		const corpo = JSON.stringify({
			type: 'subscription_preapproval',
			action: 'updated',
			data: { id: 'abc123' }
		});
		expect(lerNotificacao(url, corpo)).toEqual({
			topico: 'subscription_preapproval',
			id: 'abc123',
			dataIdDaUrl: 'abc123'
		});
	});

	it('sem corpo útil, fica o que a URL diz; id numérico vira texto', () => {
		const url = new URL(
			'https://spokke.dev/api/mercadopago?topic=subscription_authorized_payment&id=6114264375'
		);
		expect(lerNotificacao(url, 'isto não é json')).toEqual({
			topico: 'subscription_authorized_payment',
			id: '6114264375',
			dataIdDaUrl: null
		});
		const comNumero = lerNotificacao(
			new URL('https://spokke.dev/api/mercadopago'),
			JSON.stringify({ type: 'subscription_authorized_payment', data: { id: 6114264375 } })
		);
		expect(comNumero.id).toBe('6114264375');
	});

	it('só os tópicos de assinatura interessam', () => {
		expect(ehTopicoDeAssinatura('subscription_preapproval')).toBe(true);
		expect(ehTopicoDeAssinatura('subscription_authorized_payment')).toBe(true);
		expect(ehTopicoDeAssinatura('payment')).toBe(false);
		expect(ehTopicoDeAssinatura(null)).toBe(false);
	});
});
