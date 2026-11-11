import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '$lib/server/db/client';
import { acessoDoProfessor } from '$lib/server/billing/acesso';
import { concederCreditos, debitar } from '$lib/server/billing/creditos';
import { LIMITES } from '$lib/billing/catalogo';
import { languageProfiles } from '$lib/kernel/language/profiles';
import { gerarPropostas } from './gerar';
import { instrucoesDoSistema } from './prompt';
import { FalhaDoProvedor, type GeradorDeMateriais } from './provider';

/**
 * Créditos e geração por IA contra o banco de dev, com um provedor FALSO — o
 * Gemini de verdade não entra em teste (custa, e responde diferente a cada vez).
 */

const ids = { pro: crypto.randomUUID(), outro: crypto.randomUUID(), basico: crypto.randomUUID() };
const futuro = new Date(Date.now() + 30 * 24 * 3600 * 1000);

const usoFalso = { entrada: 700, saida: 120, raciocinio: 30 };

function falso(dados: unknown): GeradorDeMateriais {
	return { nome: 'falso', propor: async () => ({ dados, uso: usoFalso }) };
}
const quebrado: GeradorDeMateriais = {
	nome: 'quebrado',
	propor: async () => {
		throw new FalhaDoProvedor('O provedor de IA recusou o pedido.');
	}
};

const pedidoBase = {
	kind: 'SentencePair' as const,
	quantos: 5 as const,
	pedido: 'frases sobre rotina',
	idiomaAlvo: 'Inglês (EUA)',
	idiomaOrigem: 'Português'
};

beforeAll(async () => {
	for (const [id, plan] of [
		[ids.pro, 'pro'],
		[ids.outro, 'pro'],
		[ids.basico, 'basico']
	] as const) {
		await prisma.teacher.create({
			data: {
				id,
				name: 'IA',
				email: `ia-${id}@test.dev`,
				plan,
				subscriptionStatus: 'active',
				currentPeriodEnd: futuro,
				cycleAnchor: new Date()
			}
		});
	}
});

afterAll(async () => {
	await prisma.teacher.deleteMany({ where: { id: { in: Object.values(ids) } } });
});

const saldo = async (id: string) => (await acessoDoProfessor({ id })).creditos.saldo;

describe('geração por IA', () => {
	it('cobra só o que serviu: inválida e repetida são estornadas', async () => {
		const antes = await saldo(ids.pro);
		const requestId = crypto.randomUUID();
		const r = await gerarPropostas(
			{ id: ids.pro },
			{ ...pedidoBase, requestId },
			falso({
				propostas: [
					{ source: 'Eu acordo cedo.', target: 'I wake up early.' },
					{ source: 'Eu acordo cedo.', target: 'I wake up early.' }, // repetida
					{ source: '', target: 'vazia' }, // inválida
					{ source: 'Eu tomo café.', target: 'I have breakfast.', note: 'nota não é da IA' }
				]
			})
		);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.propostas.map((p) => p.resumo.esq)).toEqual(['I wake up early.', 'I have breakfast.']);
		// A nota é do PROFESSOR — a proposta não carrega uma inventada pela máquina.
		expect(r.propostas.every((p) => !('note' in p.dados))).toBe(true);
		expect({ debitados: r.debitados, estornados: r.estornados }).toEqual({
			debitados: 2,
			estornados: 3
		});
		expect(await saldo(ids.pro)).toBe(antes - 2);

		// A medição dos preços: os tokens que o provedor informou, no professor
		// que pediu, com o que foi pedido e o que ficou cobrado — e nada do texto.
		const uso = await prisma.aiUsage.findUnique({ where: { requestId } });
		expect(uso).toMatchObject({
			teacherId: ids.pro,
			model: 'falso',
			kind: 'SentencePair',
			requested: 5,
			accepted: 2,
			inputTokens: 700,
			outputTokens: 120,
			thoughtsTokens: 30
		});
	});

	it('provedor fora do ar devolve tudo, e não há uso a gravar', async () => {
		const antes = await saldo(ids.pro);
		const requestId = crypto.randomUUID();
		const r = await gerarPropostas({ id: ids.pro }, { ...pedidoBase, requestId }, quebrado);
		expect(r.ok).toBe(false);
		expect(await saldo(ids.pro)).toBe(antes);
		expect(await prisma.aiUsage.count({ where: { requestId } })).toBe(0);
	});

	it('provedor que não informa tokens: o uso é gravado com eles nulos', async () => {
		const requestId = crypto.randomUUID();
		const semUso: GeradorDeMateriais = {
			nome: 'sem-uso',
			propor: async () => ({
				dados: { propostas: [{ source: 'Eu leio.', target: 'I read.' }] },
				uso: null
			})
		};
		const r = await gerarPropostas({ id: ids.pro }, { ...pedidoBase, requestId }, semUso);
		expect(r.ok).toBe(true);
		expect(await prisma.aiUsage.findUnique({ where: { requestId } })).toMatchObject({
			teacherId: ids.pro,
			accepted: 1,
			inputTokens: null,
			outputTokens: null,
			thoughtsTokens: null
		});
	});

	it('o mesmo requestId debita uma vez só', async () => {
		const antes = await saldo(ids.pro);
		const requestId = crypto.randomUUID();
		const [a, b] = await Promise.all([
			debitar({ id: ids.pro }, 3, requestId),
			debitar({ id: ids.pro }, 3, requestId)
		]);
		expect([a.ok, b.ok]).toEqual([true, true]);
		expect([a, b].filter((x) => x.ok && x.repetido)).toHaveLength(1);
		expect(await saldo(ids.pro)).toBe(antes - 3);
	});

	it('débitos simultâneos nunca passam do saldo', async () => {
		const disponivel = await saldo(ids.outro);
		expect(disponivel).toBe(LIMITES.pro.creditosPorCiclo);
		const pedidos = Array.from({ length: 4 }, () =>
			debitar({ id: ids.outro }, 100, crypto.randomUUID())
		);
		const resultados = await Promise.all(pedidos);
		expect(resultados.filter((r) => r.ok)).toHaveLength(3);
		expect(await saldo(ids.outro)).toBe(0);
	});

	it('o livro-razão é por professor', async () => {
		// O `outro` gastou tudo; o `pro` não foi tocado por isso.
		expect(await saldo(ids.pro)).toBeGreaterThan(0);
	});

	it('cortesia soma ao saldo do ciclo', async () => {
		await concederCreditos(ids.outro, 25, 'teste', 'sistema');
		expect(await saldo(ids.outro)).toBe(25);
	});

	it('o básico não gera, nem com crédito de cortesia', async () => {
		const r = await gerarPropostas(
			{ id: ids.basico },
			{ ...pedidoBase, requestId: crypto.randomUUID() },
			falso({ propostas: [] })
		);
		expect(r).toMatchObject({ ok: false, motivo: 'ia' });
	});
});

describe('o pedido ao modelo é agnóstico de idioma', () => {
	it('a estrutura é a mesma para todo profile — só o rótulo muda', () => {
		const molde = (rotulo: string) =>
			instrucoesDoSistema({ ...pedidoBase, idiomaAlvo: rotulo }).replace(rotulo, '<IDIOMA>');
		const moldes = new Set(Object.keys(languageProfiles).map((tag) => molde(`rótulo de ${tag}`)));
		expect(moldes.size).toBe(1);
	});
});
