import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudiotextError, traduzir, traduzirComAlternativas } from './client';

/**
 * O cliente da tradução sem rede: `fetch` é um dublê que traduz marcando o
 * texto. O que se prova é o CONTRATO do lado de cá — lotes do tamanho que o
 * serviço aceita, ordem preservada, resposta fora do formato recusada.
 */
describe('traduzir', () => {
	const pedidos: { texts: string[]; source: string; target: string }[] = [];

	beforeEach(() => {
		pedidos.length = 0;
		vi.stubEnv('AUDIOTEXT_URL', 'http://audiotext.test/');
		vi.stubEnv('AUDIOTEXT_TOKEN', 'segredo');
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string, init: RequestInit) => {
				expect(url).toBe('http://audiotext.test/v1/translate');
				expect((init.headers as Record<string, string>).authorization).toBe('Bearer segredo');
				const corpo = JSON.parse(String(init.body)) as (typeof pedidos)[number];
				pedidos.push(corpo);
				return new Response(JSON.stringify({ translations: corpo.texts.map((t) => `<${t}>`) }), {
					status: 200,
					headers: { 'content-type': 'application/json' }
				});
			})
		);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
	});

	it('lista grande vai em pedidos de até 32, em ordem, e volta na ordem', async () => {
		const textos = Array.from({ length: 70 }, (_, i) => `frase ${i}`);
		const saida = await traduzir(textos, 'en-US', 'pt-BR');
		expect(pedidos.map((p) => p.texts.length)).toEqual([32, 32, 6]);
		expect(pedidos[0]).toMatchObject({ source: 'en-US', target: 'pt-BR' });
		expect(saida).toEqual(textos.map((t) => `<${t}>`));
	});

	it('contagem diferente da pedida é recusada: casar por posição trocaria as frases', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(JSON.stringify({ translations: ['só uma'] }), { status: 200 }))
		);
		await expect(traduzir(['a', 'b'], 'en-US', 'pt-BR')).rejects.toBeInstanceOf(AudiotextError);
	});

	it('503 do serviço (carregando, fila cheia) sobe como AudiotextError com o status', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response(JSON.stringify({ detail: 'o tradutor ainda está carregando' }), {
						status: 503
					})
			)
		);
		await expect(traduzir(['a'], 'en-US', 'pt-BR')).rejects.toMatchObject({ status: 503 });
	});
});

describe('traduzirComAlternativas', () => {
	beforeEach(() => {
		vi.stubEnv('AUDIOTEXT_URL', 'http://audiotext.test/');
	});
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
	});

	it('pede as alternativas e devolve a principal primeiro, texto a texto', async () => {
		const corpos: { alternatives?: number }[] = [];
		vi.stubGlobal(
			'fetch',
			vi.fn(async (_url: string, init: RequestInit) => {
				const corpo = JSON.parse(String(init.body)) as { texts: string[]; alternatives?: number };
				corpos.push(corpo);
				return new Response(
					JSON.stringify({
						translations: corpo.texts.map((t) => `<${t}>`),
						alternatives: corpo.texts.map((t, i) => (i === 0 ? [`<${t}> 2`] : []))
					}),
					{ status: 200 }
				);
			})
		);
		const saida = await traduzirComAlternativas(['a', 'b'], 'en-US', 'pt-BR', 9);
		// O teto do serviço é 4: pedir mais seria 422.
		expect(corpos[0]?.alternatives).toBe(4);
		expect(saida).toEqual([['<a>', '<a> 2'], ['<b>']]);
	});

	it('serviço anterior às alternativas: cada texto fica só com a principal', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(JSON.stringify({ translations: ['x', 'y'] }), { status: 200 }))
		);
		expect(await traduzirComAlternativas(['a', 'b'], 'en-US', 'pt-BR', 2)).toEqual([['x'], ['y']]);
	});

	it('lista de alternativas com outra contagem é recusada', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response(JSON.stringify({ translations: ['x', 'y'], alternatives: [['z']] }), {
						status: 200
					})
			)
		);
		await expect(traduzirComAlternativas(['a', 'b'], 'en-US', 'pt-BR', 2)).rejects.toBeInstanceOf(
			AudiotextError
		);
	});
});
