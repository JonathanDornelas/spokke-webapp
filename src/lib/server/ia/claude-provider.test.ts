import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { aceitaReservaDoServidor, criarClaude, tipoDaFalhaDoClaude } from './claude-provider';
import { FalhaDoProvedor } from './provider';
import type { PedidoDeMateriais } from './prompt';

/**
 * O provedor do Claude contra a API SIMULADA (o `fetch` que o SDK usa): o que vai no pedido, como
 * a resposta volta e como cada falha é lida — "sem créditos" é o caso que manda para o Gemini. O
 * Claude de verdade não entra em teste.
 */

const PEDIDO: PedidoDeMateriais = {
	kind: 'SentencePair',
	quantos: 2,
	pedido: 'frases de restaurante',
	idiomaAlvo: 'Inglês (EUA)',
	idiomaOrigem: 'Português (Brasil)'
};
const OPCOES = { schema: {}, timeoutMs: 5_000 };

interface PedidoFeito {
	corpo: Record<string, unknown>;
	cabecalhos: Headers;
}
let pedidos: PedidoFeito[] = [];

function responder(status: number, corpo: unknown) {
	vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
		pedidos.push({ corpo: JSON.parse(String(init.body)), cabecalhos: new Headers(init.headers) });
		return new Response(JSON.stringify(corpo), {
			status,
			headers: { 'content-type': 'application/json' }
		});
	});
}

function mensagem(texto: string, extra: Record<string, unknown> = {}) {
	return {
		id: 'msg_1',
		type: 'message',
		role: 'assistant',
		model: 'claude-opus-5-5',
		content: [{ type: 'text', text: texto }],
		stop_reason: 'end_turn',
		stop_sequence: null,
		usage: { input_tokens: 700, output_tokens: 120 },
		...extra
	};
}

const PROPOSTA = { source: 'Eu quero um café.', target: 'I want a coffee.' };

beforeEach(() => {
	pedidos = [];
	vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('o pedido e a resposta', () => {
	it('effort baixo, saída estruturada, a reserva do servidor, e a resposta já validada', async () => {
		responder(200, mensagem(JSON.stringify({ propostas: [PROPOSTA] })));
		const r = await criarClaude({ apiKey: 'k', model: 'claude-opus-5-5' }).propor(PEDIDO, OPCOES);

		const { corpo, cabecalhos } = pedidos[0];
		expect(corpo.model).toBe('claude-opus-5-5');
		expect(corpo).not.toHaveProperty('temperature');
		const saida = corpo.output_config as { effort: string; format: { type: string } };
		expect(saida.effort).toBe('low');
		expect(saida.format.type).toBe('json_schema');
		expect(corpo.fallbacks).toBe('default');
		expect(cabecalhos.get('anthropic-beta')).toContain('server-side-fallback-2026-07-01');

		expect(r.dados).toEqual({ propostas: [PROPOSTA] });
		expect(r.uso).toEqual({ entrada: 700, saida: 120, raciocinio: null });
		expect(r.modelo).toBe('claude:claude-opus-5-5');
	});

	it('modelo sem a reserva do servidor: o parâmetro não vai', async () => {
		responder(200, mensagem(JSON.stringify({ propostas: [] }), { model: 'claude-haiku-5-5' }));
		await criarClaude({ apiKey: 'k', model: 'claude-haiku-5-5' }).propor(PEDIDO, OPCOES);
		expect(pedidos[0].corpo).not.toHaveProperty('fallbacks');
	});

	it('recusa e resposta cortada viram falha do provedor (a reserva assume)', async () => {
		const claude = criarClaude({ apiKey: 'k', model: 'claude-opus-5-5' });
		responder(200, mensagem('', { stop_reason: 'refusal' }));
		await expect(claude.propor(PEDIDO, OPCOES)).rejects.toThrow(FalhaDoProvedor);
		// Cortada, o JSON nem termina: o próprio `parse` do SDK recusa antes do `stop_reason` — o que
		// importa é virar `FalhaDoProvedor`, que é o que passa a vez para a reserva.
		responder(200, mensagem('{"propostas": [', { stop_reason: 'max_tokens' }));
		await expect(claude.propor(PEDIDO, OPCOES)).rejects.toThrow(FalhaDoProvedor);
	});
});

describe('as falhas da API', () => {
	it('sem créditos (402 billing_error): uma falha que diz isso — e a reserva assume', async () => {
		responder(402, {
			type: 'error',
			error: { type: 'billing_error', message: 'Your credit balance is too low.' }
		});
		const claude = criarClaude({ apiKey: 'k', model: 'claude-opus-5-5' });
		await expect(claude.propor(PEDIDO, OPCOES)).rejects.toThrow(/créditos/);
	});

	it('a leitura é pelo status e pelo tipo, nunca pelo texto', () => {
		expect(tipoDaFalhaDoClaude({ status: 402, type: 'billing_error' })).toBe('sem-creditos');
		expect(tipoDaFalhaDoClaude({ status: 529, type: 'overloaded_error' })).toBe('ocupado');
		expect(tipoDaFalhaDoClaude({ status: 429, type: 'rate_limit_error' })).toBe('limite');
		expect(tipoDaFalhaDoClaude(new Anthropic.APIConnectionTimeoutError())).toBe('tempo');
		expect(tipoDaFalhaDoClaude({ status: 401, type: 'authentication_error' })).toBe('outra');
	});
});

describe('a reserva do próprio servidor numa recusa', () => {
	it('só nos modelos que a oferecem', () => {
		for (const m of ['claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5', 'claude-fable-5-2']) {
			expect(aceitaReservaDoServidor(m)).toBe(true);
		}
		for (const m of ['claude-haiku-5-5', 'claude-sonnet-5', 'claude-opus-4-8']) {
			expect(aceitaReservaDoServidor(m)).toBe(false);
		}
	});
});
