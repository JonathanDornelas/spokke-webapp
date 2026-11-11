import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '$lib/server/db/client';
import { PRECO_EM_CENTAVOS } from '$lib/billing/precos';
import type { AssinaturaMp, ClienteMercadoPago, FaturaMp, NovaAssinaturaMp } from './cliente';
import { ErroDoMercadoPago } from './cliente';
import {
	aplicarAssinatura,
	aplicarFatura,
	chaveDaTroca,
	processarNotificacao
} from './sincronizar';
import { processarTroca } from './troca';
import { mercadoPagoBillingProvider } from './provider';

/**
 * O Mercado Pago contra o banco, com um cliente FALSO: o de verdade não entra
 * em teste (precisa de token e de rede). O que se prova aqui é a regra —
 * autorizada ativa, a mesma notificação de novo não muda nada, fatura aprovada
 * estende uma vez só, troca de plano cancela a antiga (pelo job da troca), e
 * assinatura de outro professor ou de fora do produto não mexe em conta
 * nenhuma. A devolução da troca tem o teste dela, em `troca.test.ts`.
 */

function falso(estado: Map<string, AssinaturaMp>, faturas = new Map<string, FaturaMp>()) {
	const criadas: NovaAssinaturaMp[] = [];
	const canceladas: string[] = [];
	const cliente: ClienteMercadoPago = {
		async criarAssinatura(dados) {
			criadas.push(dados);
			const id = `mp-${crypto.randomUUID().slice(0, 8)}`;
			const nova: AssinaturaMp = {
				id,
				status: 'pending',
				external_reference: dados.external_reference,
				init_point: `https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=${id}`
			};
			estado.set(id, nova);
			return nova;
		},
		async buscarAssinatura(id) {
			const a = estado.get(id);
			if (!a) throw new ErroDoMercadoPago(404, 'not found');
			return a;
		},
		async cancelarAssinatura(id) {
			canceladas.push(id);
			const a = { ...(estado.get(id) ?? { id, external_reference: null }), status: 'cancelled' };
			estado.set(id, a);
			return a;
		},
		async buscarFatura(id) {
			const f = faturas.get(id);
			if (!f) throw new ErroDoMercadoPago(404, 'not found');
			return f;
		},
		async buscarFaturasDaAssinatura(id) {
			return [...faturas.values()].filter((f) => f.preapproval_id === id);
		},
		async buscarPagamento(id) {
			return { id, status: 'approved', transaction_amount: 0, transaction_amount_refunded: 0 };
		},
		async devolver(id, valor) {
			return { id: `devolucao-${id}`, amount: valor, status: 'approved' };
		}
	};
	return { cliente, criadas, canceladas };
}

const AGORA = new Date('2026-11-10T12:00:00Z');

// Ids de fatura únicos por rodada: o `ProviderEvent` é global, e um id fixo faria
// a segunda rodada achar a fatura já aplicada pela primeira.
const RODADA = String(Date.now());
const fatura = (n: number) => `${RODADA}${n}`;

describe('Mercado Pago', () => {
	let professor: { id: string; name: string; email: string };
	let outro: { id: string; name: string; email: string };

	beforeAll(async () => {
		for (const nome of ['A', 'B']) {
			const t = await prisma.teacher.create({
				data: {
					id: crypto.randomUUID(),
					name: `Professor ${nome}`,
					email: `mp-${nome}-${crypto.randomUUID()}@test.dev`,
					subscriptionStatus: 'trialing',
					trialEndsAt: new Date('2026-11-20T00:00:00Z')
				}
			});
			if (nome === 'A') professor = { id: t.id, name: t.name, email: t.email };
			else outro = { id: t.id, name: t.name, email: t.email };
		}
	});

	afterAll(async () => {
		await prisma.providerEvent.deleteMany({
			where: { id: { startsWith: `mercadopago:fatura:${RODADA}` } }
		});
		const ids = [professor?.id, outro?.id].filter((id) => id !== undefined);
		// As marcas e os jobs da troca não têm chave estrangeira para o professor:
		// saem à mão, antes das assinaturas (que saem com ele, em cascata).
		const assinaturas = await prisma.providerSubscription.findMany({
			where: { teacherId: { in: ids } },
			select: { id: true }
		});
		await prisma.providerEvent.deleteMany({
			where: { id: { in: assinaturas.map((a) => chaveDaTroca(a.id)) } }
		});
		for (const a of assinaturas) {
			await prisma.job.deleteMany({
				where: { type: 'mercadopago-troca', payload: { path: ['nova'], equals: a.id } }
			});
		}
		if (ids.length > 0) await prisma.teacher.deleteMany({ where: { id: { in: ids } } });
	});

	it('o checkout cria a assinatura PENDENTE com o preço da tabela e devolve o link', async () => {
		const estado = new Map<string, AssinaturaMp>();
		const { cliente, criadas } = falso(estado);
		const r = await mercadoPagoBillingProvider(cliente).iniciarAssinatura(
			professor,
			'pro',
			'anual',
			{
				origem: 'https://spokke.dev'
			}
		);
		expect(r.tipo).toBe('redirecionar');
		expect(criadas[0]).toMatchObject({
			external_reference: professor.id,
			payer_email: professor.email,
			status: 'pending',
			back_url: 'https://spokke.dev/conta?aba=assinatura&checkout=mercadopago',
			auto_recurring: {
				frequency: 12,
				frequency_type: 'months',
				// O valor da tabela, não um número copiado: o teste não envelhece quando o preço muda.
				transaction_amount: PRECO_EM_CENTAVOS.pro.anual / 100,
				currency_id: 'BRL'
			}
		});
		const linhas = await prisma.providerSubscription.findMany({
			where: { teacherId: professor.id }
		});
		expect(linhas).toHaveLength(1);
		expect(linhas[0]).toMatchObject({ plano: 'pro', ciclo: 'anual', status: 'pending' });
		// Nada foi liberado: só a autorização do provedor libera.
		const conta = await prisma.teacher.findUniqueOrThrow({ where: { id: professor.id } });
		expect(conta.subscriptionStatus).toBe('trialing');
	});

	it('autorizada ativa o plano até a próxima cobrança — e a mesma notificação de novo não muda nada', async () => {
		const estado = new Map<string, AssinaturaMp>();
		const { cliente } = falso(estado);
		await mercadoPagoBillingProvider(cliente).iniciarAssinatura(professor, 'pro', 'mensal', {
			origem: 'https://spokke.dev'
		});
		const linha = (await prisma.providerSubscription.findFirst({
			where: { teacherId: professor.id, ciclo: 'mensal' },
			orderBy: { createdAt: 'desc' }
		}))!;
		estado.set(linha.id, {
			...estado.get(linha.id)!,
			status: 'authorized',
			next_payment_date: '2026-12-10T12:00:00.000-03:00'
		});

		expect(
			await processarNotificacao(
				{ topico: 'subscription_preapproval', id: linha.id },
				cliente,
				AGORA
			)
		).toBe('ativada');
		const conta = await prisma.teacher.findUniqueOrThrow({ where: { id: professor.id } });
		expect(conta).toMatchObject({ plan: 'pro', planCycle: 'mensal', subscriptionStatus: 'active' });
		expect(conta.currentPeriodEnd?.toISOString()).toBe('2026-12-10T15:00:00.000Z');

		expect(
			await processarNotificacao(
				{ topico: 'subscription_preapproval', id: linha.id },
				cliente,
				AGORA
			)
		).toBe('sem-mudanca');
		const ativacoes = await prisma.auditEvent.count({
			where: { teacherId: professor.id, type: 'plano_ativado' }
		});
		expect(ativacoes).toBe(1);
		// E o sino do professor sabe (docs/notificacoes.md).
		expect(
			await prisma.notification.count({ where: { teacherId: professor.id, kind: 'plano' } })
		).toBe(1);
	});

	it('fatura aprovada estende UMA vez; a primeira, junto da autorização, não dá mês de graça', async () => {
		const linha = (await prisma.providerSubscription.findFirst({
			where: { teacherId: professor.id, status: 'authorized' }
		}))!;
		const primeira: FaturaMp = {
			id: fatura(1),
			preapproval_id: linha.id,
			debit_date: '2026-11-10T12:00:00Z',
			external_reference: professor.id,
			payment: { id: 1, status: 'approved' }
		};
		expect(await aplicarFatura(primeira, AGORA)).toBe('sem-mudanca');

		const segunda: FaturaMp = { ...primeira, id: fatura(2), debit_date: '2026-12-10T15:00:00Z' };
		const depois = new Date('2026-12-10T16:00:00Z');
		expect(await aplicarFatura(segunda, depois)).toBe('estendida');
		expect(await aplicarFatura(segunda, depois)).toBe('sem-mudanca');
		const conta = await prisma.teacher.findUniqueOrThrow({ where: { id: professor.id } });
		expect(conta.currentPeriodEnd?.toISOString()).toBe('2027-01-10T15:00:00.000Z');

		const recusada: FaturaMp = {
			...primeira,
			id: fatura(3),
			payment: { id: 3, status: 'rejected' }
		};
		expect(await aplicarFatura(recusada, depois)).toBe('sem-mudanca');
	});

	it('trocar de plano: a nova autorizada vale na hora, o job da troca cancela a antiga lá, e a antiga não derruba a nova', async () => {
		const estado = new Map<string, AssinaturaMp>();
		for (const l of await prisma.providerSubscription.findMany({
			where: { teacherId: professor.id }
		})) {
			estado.set(l.id, { id: l.id, status: l.status, external_reference: professor.id });
		}
		const { cliente, canceladas } = falso(estado);
		const antigaId = (await prisma.providerSubscription.findFirst({
			where: { teacherId: professor.id, status: 'authorized' }
		}))!.id;
		await mercadoPagoBillingProvider(cliente).iniciarAssinatura(professor, 'super', 'mensal', {
			origem: 'https://spokke.dev'
		});
		const nova = (await prisma.providerSubscription.findFirst({
			where: { teacherId: professor.id, plano: 'super' }
		}))!;
		estado.set(nova.id, { ...estado.get(nova.id)!, status: 'authorized' });

		expect(await aplicarAssinatura(estado.get(nova.id)!, AGORA)).toBe('ativada');
		const conta = await prisma.teacher.findUniqueOrThrow({ where: { id: professor.id } });
		expect(conta.plan).toBe('super');
		// Cancelar lá é do job da troca, enfileirado na MESMA transação da ativação:
		// uma recusa do provedor não impede de ativar o que o professor pagou.
		expect(canceladas).toHaveLength(0);
		const job = await prisma.job.findFirst({
			where: { type: 'mercadopago-troca', payload: { path: ['nova'], equals: nova.id } }
		});
		expect(job).not.toBeNull();

		// A ANTIGA, ainda autorizada, manda notícia antes de o job rodar: ela não
		// devolve o professor ao plano de antes.
		expect(await aplicarAssinatura(estado.get(antigaId)!, AGORA)).toBe('sem-mudanca');
		expect((await prisma.teacher.findUniqueOrThrow({ where: { id: professor.id } })).plan).toBe(
			'super'
		);

		const troca = await processarTroca(job!.payload, cliente, AGORA);
		expect(troca).toMatchObject({ canceladas: 1, devolvidas: 0 });
		expect(canceladas).toEqual([antigaId]);
		// O mesmo job de novo não cancela nada outra vez.
		expect((await processarTroca(job!.payload, cliente, AGORA)).canceladas).toBe(0);

		// A notificação do cancelamento da ANTIGA chega depois — e não cancela a conta.
		const antiga = estado.get(antigaId)!;
		expect(await aplicarAssinatura(antiga, AGORA)).toBe('sem-mudanca');
		const depois = await prisma.teacher.findUniqueOrThrow({ where: { id: professor.id } });
		expect(depois.cancelAtPeriodEnd).toBe(false);

		// A NOVA cancelada (pelo professor no Mercado Pago) para a renovação, sem tirar o que foi pago.
		expect(await aplicarAssinatura({ ...estado.get(nova.id)!, status: 'cancelled' }, AGORA)).toBe(
			'cancelada'
		);
		const cancelada = await prisma.teacher.findUniqueOrThrow({ where: { id: professor.id } });
		expect(cancelada).toMatchObject({ cancelAtPeriodEnd: true, subscriptionStatus: 'active' });
	});

	it('assinatura de fora do produto ou com referência trocada não mexe em conta nenhuma', async () => {
		const { cliente } = falso(new Map());
		expect(
			await aplicarAssinatura(
				{ id: 'nao-existe', status: 'authorized', external_reference: outro.id },
				AGORA
			)
		).toBe('ignorada');

		const estado = new Map<string, AssinaturaMp>();
		const f = falso(estado);
		await mercadoPagoBillingProvider(f.cliente).iniciarAssinatura(outro, 'basico', 'mensal', {
			origem: 'https://spokke.dev'
		});
		const linha = (await prisma.providerSubscription.findFirst({
			where: { teacherId: outro.id }
		}))!;
		expect(
			await aplicarAssinatura(
				{ id: linha.id, status: 'authorized', external_reference: professor.id },
				AGORA
			)
		).toBe('ignorada');
		const conta = await prisma.teacher.findUniqueOrThrow({ where: { id: outro.id } });
		expect(conta.subscriptionStatus).toBe('trialing');

		// E o 404 do provedor termina sem erro (não vai cinco vezes para a fila).
		expect(
			await processarNotificacao(
				{ topico: 'subscription_preapproval', id: 'sumiu' },
				cliente,
				AGORA
			)
		).toBe('ignorada');
	});
});
