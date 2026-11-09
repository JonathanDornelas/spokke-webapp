import { beforeEach, describe, expect, it, vi } from 'vitest';

// O ambiente é trocado por teste: cada caso é uma configuração do `.env`.
const ambiente: Record<string, string | undefined> = {};
vi.mock('$env/dynamic/private', () => ({ env: ambiente }));

const { getGerador, isIaConfigurada } = await import('./index');

function configurar(valores: Record<string, string | undefined>) {
	for (const chave of Object.keys(ambiente)) delete ambiente[chave];
	Object.assign(ambiente, valores);
}

/**
 * A IA fica desligada até a chave chegar, e desligada de verdade: a tela não
 * oferece o botão e o servidor não quebra. É o estado de hoje (o token do
 * Gemini entra depois), então ele precisa ser um estado normal.
 */
describe('a IA sem a chave do Gemini', () => {
	beforeEach(() => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
	});

	it('sem LLM_PROVIDER: desligada nos dois lados', () => {
		configurar({});
		expect(isIaConfigurada()).toBe(false);
		expect(getGerador()).toBeNull();
	});

	it('provedor escolhido e a chave ainda não: desligada, sem lançar erro', () => {
		configurar({ LLM_PROVIDER: 'gemini', GEMINI_MODEL: 'modelo-qualquer' });
		expect(isIaConfigurada()).toBe(false);
		expect(getGerador()).toBeNull();
	});

	it('chave sem modelo: desligada', () => {
		configurar({ LLM_PROVIDER: 'gemini', GEMINI_API_KEY: 'chave-de-teste' });
		expect(isIaConfigurada()).toBe(false);
		expect(getGerador()).toBeNull();
	});

	it('configuração completa: ligada', () => {
		configurar({
			LLM_PROVIDER: 'gemini',
			GEMINI_API_KEY: 'chave-de-teste',
			GEMINI_MODEL: 'modelo-qualquer'
		});
		expect(isIaConfigurada()).toBe(true);
		expect(getGerador()).not.toBeNull();
	});

	it('provedor desconhecido continua sendo erro de configuração', () => {
		configurar({ LLM_PROVIDER: 'outro' });
		expect(() => getGerador()).toThrow(/não tem implementação/);
	});
});
