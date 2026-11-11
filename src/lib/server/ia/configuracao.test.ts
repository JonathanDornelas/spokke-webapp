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

/**
 * A fila "claude,gemini" (decisão do dono, 2026-11-11): o Claude primeiro, o Gemini se ele falhar.
 * Quem está na lista sem a configuração completa fica de fora da fila, sem derrubar o resto.
 */
describe('a fila de provedores', () => {
	beforeEach(() => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
	});

	const claude = { ANTHROPIC_API_KEY: 'chave-claude', CLAUDE_MODEL: 'claude-opus-5-5' };
	const gemini = { GEMINI_API_KEY: 'chave-gemini', GEMINI_MODEL: 'gemini-3.6-flash' };

	it('os dois completos: a fila na ordem pedida', () => {
		configurar({ LLM_PROVIDER: 'claude,gemini', ...claude, ...gemini });
		expect(isIaConfigurada()).toBe(true);
		expect(getGerador()?.nome).toBe('claude:claude-opus-5-5 → gemini:gemini-3.6-flash');
	});

	it('a ordem é a da lista, com espaços tolerados', () => {
		configurar({ LLM_PROVIDER: ' gemini , claude ', ...claude, ...gemini });
		expect(getGerador()?.nome).toBe('gemini:gemini-3.6-flash → claude:claude-opus-5-5');
	});

	it('o Claude sem chave fica de fora: segue só o Gemini', () => {
		configurar({ LLM_PROVIDER: 'claude,gemini', CLAUDE_MODEL: 'claude-opus-5-5', ...gemini });
		expect(isIaConfigurada()).toBe(true);
		expect(getGerador()?.nome).toBe('gemini:gemini-3.6-flash');
	});

	it('o Claude sozinho', () => {
		configurar({ LLM_PROVIDER: 'claude', ...claude });
		expect(getGerador()?.nome).toBe('claude:claude-opus-5-5');
	});

	it('um nome desconhecido na lista é erro de configuração, e a tela não oferece o botão', () => {
		configurar({ LLM_PROVIDER: 'claude,outro', ...claude });
		expect(isIaConfigurada()).toBe(false);
		expect(() => getGerador()).toThrow(/não tem implementação/);
	});
});
