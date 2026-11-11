import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * O interruptor do envio (`ga-disable-<ID>`). Ele existe porque o gtag.js fica na página depois
 * de uma navegação do SvelteKit: sem desligar o envio, a medição automática do Google seguia
 * para o Studio quem tinha aceitado o aviso na home. O comportamento do gtag.js com o
 * interruptor foi medido à parte (ver `ligarEnvio`); aqui se garante que o site o aciona.
 */

const ID = 'G-TESTE12345';
let janela: Record<string, unknown>;

beforeEach(() => {
	vi.resetModules();
	janela = {};
	vi.stubGlobal('window', janela);
	vi.stubGlobal('document', {
		cookie: '',
		head: { appendChild: () => undefined },
		createElement: () => ({})
	});
	vi.stubGlobal('location', {
		hostname: 'spokke.com.br',
		href: 'https://spokke.com.br/',
		pathname: '/'
	});
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('ligarEnvio', () => {
	it('desligar marca o interruptor do Google, e ligar o desfaz', async () => {
		const { ligarEnvio } = await import('./medicao');
		ligarEnvio(ID, false);
		expect(janela[`ga-disable-${ID}`]).toBe(true);
		ligarEnvio(ID, true);
		expect(janela[`ga-disable-${ID}`]).toBe(false);
	});

	it('ID fora do formato do GA4 não mexe em nada', async () => {
		const { ligarEnvio } = await import('./medicao');
		ligarEnvio('UA-123', false);
		expect(Object.keys(janela)).toEqual([]);
	});
});

describe('revogar', () => {
	it('com o gtag.js carregado, para de enviar — não só nega o consentimento', async () => {
		const { carregarGa, revogar } = await import('./medicao');
		carregarGa(ID);
		revogar();
		expect(janela[`ga-disable-${ID}`]).toBe(true);
		expect(janela.dataLayer).toContainEqual(
			expect.objectContaining({ 0: 'consent', 1: 'update', 2: { analytics_storage: 'denied' } })
		);
	});

	it('sem o gtag.js na página, não há o que desligar', async () => {
		const { revogar } = await import('./medicao');
		revogar();
		expect(janela[`ga-disable-${ID}`]).toBeUndefined();
	});
});
