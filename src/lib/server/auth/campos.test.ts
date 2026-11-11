import { afterAll, describe, expect, it, vi } from 'vitest';

// O plugin `sveltekitCookies` grava o cookie no evento do request do SvelteKit,
// que não existe fora do `handle`. Um evento falso com `cookies.set` basta: o
// teste lê o cookie pelo `returnHeaders`, não pelo evento.
vi.mock('$app/server', () => ({
	getRequestEvent: () => ({ cookies: { set: () => {}, get: () => undefined, delete: () => {} } })
}));

const { auth } = await import('$lib/server/auth');
const { prisma } = await import('$lib/server/db/client');

/**
 * A falha que este teste tranca: os campos de cobrança eram `additionalFields`
 * sem `input: false`, e o Better Auth aceitava o campo vindo do CORPO do
 * cadastro e de `update-user`. Qualquer pessoa se cadastrava já como
 * `plan: "super"` / `subscriptionStatus: "active"`.
 *
 * Bate no banco de dev, como os testes de repositório: o que importa é a LINHA
 * que fica gravada, não o que a função devolve.
 */

const criados: string[] = [];
const email = () => `campos-${crypto.randomUUID()}@test.dev`;

afterAll(async () => {
	await prisma.teacher.deleteMany({ where: { id: { in: criados } } });
});

describe('campos de cobrança não vêm do corpo do pedido', () => {
	it('cadastro com plano no corpo é recusado e nada é gravado', async () => {
		const endereco = email();
		await expect(
			auth.api.signUpEmail({
				body: {
					name: 'Forjado',
					email: endereco,
					password: 'senha-de-teste-123',
					plan: 'super',
					subscriptionStatus: 'active'
				} as never
			})
		).rejects.toThrow(/not allowed/);
		expect(await prisma.teacher.findUnique({ where: { email: endereco } })).toBeNull();
	});

	it('cadastro normal nasce em trial com data de fim, carimbada no servidor', async () => {
		const endereco = email();
		const antes = Date.now();
		const resposta = await auth.api.signUpEmail({
			body: { name: 'Normal', email: endereco, password: 'senha-de-teste-123' }
		});
		criados.push(resposta.user.id);

		const linha = await prisma.teacher.findUniqueOrThrow({ where: { id: resposta.user.id } });
		expect(linha.plan).toBeNull();
		expect(linha.subscriptionStatus).toBe('trialing');
		expect(linha.trialEndsAt!.getTime()).toBeGreaterThan(antes + 13 * 24 * 3600 * 1000);

		const auditoria = await prisma.auditEvent.findMany({ where: { teacherId: resposta.user.id } });
		expect(auditoria.map((e) => e.type)).toEqual(['trial_iniciado']);
	});

	it('update-user com plano no corpo é recusado', async () => {
		const endereco = email();
		const cadastro = await auth.api.signUpEmail({
			body: { name: 'Alvo', email: endereco, password: 'senha-de-teste-123' },
			returnHeaders: true
		});
		criados.push(cadastro.response.user.id);
		const cookie = cadastro.headers.get('set-cookie') ?? '';
		const headers = new Headers({ cookie: cookie.split(';')[0] });

		await expect(
			auth.api.updateUser({
				headers,
				body: { subscriptionStatus: 'active', plan: 'super' } as never
			})
		).rejects.toThrow(/not allowed/);

		const linha = await prisma.teacher.findUniqueOrThrow({
			where: { id: cadastro.response.user.id }
		});
		expect({ plan: linha.plan, status: linha.subscriptionStatus }).toEqual({
			plan: null,
			status: 'trialing'
		});
	});

	it('o identificador do gateway não viaja na sessão', async () => {
		const endereco = email();
		const cadastro = await auth.api.signUpEmail({
			body: { name: 'Sessão', email: endereco, password: 'senha-de-teste-123' },
			returnHeaders: true
		});
		criados.push(cadastro.response.user.id);
		const cookie = cadastro.headers.get('set-cookie') ?? '';
		const sessao = await auth.api.getSession({
			headers: new Headers({ cookie: cookie.split(';')[0] })
		});
		expect(sessao?.user).toBeDefined();
		// Os ids do gateway moram na tabela própria (ProviderSubscription), nunca na
		// linha do professor — e por isso nunca na sessão que vai para o navegador.
		expect(Object.keys(sessao!.user)).not.toContain('providerSubscriptions');
		expect(JSON.stringify(sessao!.user)).not.toContain('mercadopago');
	});
});
