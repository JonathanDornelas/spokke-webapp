import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '$lib/server/db/client';
import { reais } from '$lib/billing/precos';
import { ErroDoMercadoPago, type ClienteMercadoPago, type FaturaMp } from './cliente';
import { chaveDaTroca } from './sincronizar';
import {
	DEVOLUCAO_MINIMA_CENTAVOS,
	ESPERAS_PELO_PAGAMENTO,
	chaveDaDevolucao,
	planoEmVigor,
	processarTroca,
	ultimoPagamentoAprovado,
	valorNaoUsado
} from './troca';

/**
 * A troca de plano (billing.md "Troca de plano"): ciclo novo com o valor cheio,
 * a assinatura antiga cancelada lá e a parte não usada do último pagamento dela
 * de volta no cartão. A conta é pura; o job roda contra o banco com um cliente
 * FALSO — devolver dinheiro de verdade não entra em teste.
 *
 * O que se prova: a parte não usada é a do instante da troca e nunca um centavo
 * a mais; cada pagamento devolve UMA vez; nada volta antes de o plano novo estar
 * pago; devolução feita por fora não sai de novo; a que o Mercado Pago recusa
 * (o anual depois do prazo) vai para a equipe com o valor calculado; e a
 * assinatura ativada DEPOIS da nova não é tocada pelo job dela.
 */

const RODADA = String(Date.now());
const EM = '2026-11-10T12:00:00.000Z';
const AGORA = new Date(EM);

function falso(
	faturas: FaturaMp[],
	jaDevolvido: Record<string, number> = {},
	/** Pagamentos cuja devolução o Mercado Pago recusa — antigos demais, como o anual depois do prazo. */
	recusados: string[] = []
) {
	const canceladas: string[] = [];
	const devolucoes: { pagamento: string; valor: number; chave: string }[] = [];
	const cliente: ClienteMercadoPago = {
		async criarAssinatura() {
			throw new Error('não se cria assinatura na troca');
		},
		async buscarAssinatura(id) {
			throw new ErroDoMercadoPago(404, id);
		},
		async cancelarAssinatura(id) {
			canceladas.push(id);
			return { id, status: 'cancelled', external_reference: null };
		},
		async buscarFatura(id) {
			throw new ErroDoMercadoPago(404, id);
		},
		async buscarFaturasDaAssinatura(id) {
			return faturas.filter((f) => f.preapproval_id === id);
		},
		async buscarPagamento(id) {
			return {
				id,
				status: 'approved',
				transaction_amount: 0,
				transaction_amount_refunded: jaDevolvido[id] ?? 0
			};
		},
		async devolver(pagamento, valor, chave) {
			if (recusados.includes(pagamento)) {
				throw new ErroDoMercadoPago(
					400,
					`POST /v1/payments/${pagamento}/refunds: 400 {"message":"payment-too-old-to-be-refunded"}`
				);
			}
			devolucoes.push({ pagamento, valor, chave });
			return { id: `r-${pagamento}`, amount: valor, status: 'approved' };
		}
	};
	return { cliente, canceladas, devolucoes };
}

function fatura(
	assinatura: string,
	pagamento: string,
	reais: number,
	debito: string,
	status = 'approved'
): FaturaMp {
	return {
		id: `f-${pagamento}`,
		preapproval_id: assinatura,
		debit_date: debito,
		transaction_amount: reais,
		external_reference: null,
		payment: { id: pagamento, status }
	};
}

describe('valorNaoUsado — a parte do pagamento que o ciclo novo cobre', () => {
	const mensal = {
		centavos: 5_900,
		debitadoEm: new Date('2026-11-01T12:00:00Z'),
		ciclo: 'mensal' as const
	};

	it('no meio do ciclo: os dias que faltam, arredondados para baixo', () => {
		// 1/11 a 1/12 são 30 dias; trocando em 10/11, faltam 21.
		expect(valorNaoUsado(mensal, AGORA)).toBe(Math.floor((5_900 * 21) / 30));
	});

	it('cobrado depois da troca: nada foi usado, volta inteiro', () => {
		expect(valorNaoUsado(mensal, new Date('2026-10-31T12:00:00Z'))).toBe(5_900);
	});

	it('o ciclo já acabou: nada a devolver', () => {
		expect(valorNaoUsado(mensal, new Date('2026-12-01T12:00:00Z'))).toBe(0);
	});

	it('anual: a fração do ano que sobrou', () => {
		const anual = {
			centavos: 59_000,
			debitadoEm: new Date('2026-01-10T12:00:00Z'),
			ciclo: 'anual' as const
		};
		// 10/7 a 10/1 do ano seguinte são 184 dos 365 dias.
		expect(valorNaoUsado(anual, new Date('2026-07-10T12:00:00Z'))).toBe(
			Math.floor((59_000 * 184) / 365)
		);
	});
});

describe('ultimoPagamentoAprovado', () => {
	it('fica com o aprovado mais recente — a recusa depois dele não conta', () => {
		const ultimo = ultimoPagamentoAprovado([
			fatura('a', 'p1', 59, '2026-10-01T12:00:00Z'),
			fatura('a', 'p2', 59, '2026-11-01T12:00:00Z'),
			fatura('a', 'p3', 59, '2026-11-05T12:00:00Z', 'rejected')
		]);
		expect(ultimo).toMatchObject({ pagamentoId: 'p2', centavos: 5_900 });
	});

	it('sem nenhum aprovado, nada', () => {
		expect(ultimoPagamentoAprovado([fatura('a', 'p1', 59, EM, 'rejected')])).toBeNull();
	});
});

describe('processarTroca — o job da troca de plano', () => {
	const professores: string[] = [];
	const assinaturas: string[] = [];
	const pagamentos: string[] = [];

	async function professor(nome: string) {
		const t = await prisma.teacher.create({
			data: {
				id: crypto.randomUUID(),
				name: `Troca ${nome} ${RODADA}`,
				email: `troca-${nome}-${crypto.randomUUID()}@test.dev`,
				subscriptionStatus: 'active',
				plan: 'super',
				planCycle: 'mensal',
				currentPeriodEnd: new Date('2026-12-10T12:00:00Z')
			}
		});
		professores.push(t.id);
		return t;
	}

	async function assinatura(
		teacherId: string,
		nome: string,
		dados: { plano: string; ciclo: string; status: string; ativadaEm?: string }
	) {
		const id = `troca-${nome}-${RODADA}`;
		await prisma.providerSubscription.create({
			data: {
				id,
				provider: 'mercadopago',
				teacherId,
				plano: dados.plano,
				ciclo: dados.ciclo,
				status: dados.status
			}
		});
		assinaturas.push(id);
		if (dados.ativadaEm) {
			await prisma.providerEvent.create({
				data: { id: chaveDaTroca(id), type: 'troca', createdAt: new Date(dados.ativadaEm) }
			});
		}
		return id;
	}

	const pagamento = (nome: string) => {
		const id = `${RODADA}-${nome}`;
		pagamentos.push(id);
		return id;
	};

	afterAll(async () => {
		await prisma.providerEvent.deleteMany({
			where: {
				id: {
					in: [...assinaturas.map(chaveDaTroca), ...pagamentos.map(chaveDaDevolucao)]
				}
			}
		});
		for (const id of assinaturas) {
			await prisma.job.deleteMany({
				where: { type: 'mercadopago-troca', payload: { path: ['nova'], equals: id } }
			});
		}
		await prisma.job.deleteMany({
			where: { type: 'aviso-equipe', payload: { path: ['assunto'], string_contains: RODADA } }
		});
		await prisma.teacher.deleteMany({ where: { id: { in: professores } } });
	});

	let t: { id: string };
	let antiga: string;
	let nova: string;
	let depois: string;
	let pagoAntiga: string;
	let pagoNova: string;

	beforeAll(async () => {
		t = await professor('A');
		antiga = await assinatura(t.id, 'antiga', {
			plano: 'pro',
			ciclo: 'mensal',
			status: 'authorized',
			ativadaEm: '2026-11-01T12:00:00Z'
		});
		nova = await assinatura(t.id, 'nova', {
			plano: 'super',
			ciclo: 'mensal',
			status: 'authorized',
			ativadaEm: EM
		});
		// Ativada DEPOIS da nova: é ela quem vale agora, e o job da nova não a toca.
		depois = await assinatura(t.id, 'depois', {
			plano: 'basico',
			ciclo: 'mensal',
			status: 'authorized',
			ativadaEm: '2026-11-20T12:00:00Z'
		});
		pagoAntiga = pagamento('antiga');
		pagoNova = pagamento('nova');
	});

	it('cancela a substituída, devolve a parte não usada uma vez só, e não toca a ativada depois', async () => {
		const { cliente, canceladas, devolucoes } = falso([
			fatura(antiga, pagamento('antiga-outubro'), 59, '2026-10-01T12:00:00Z'),
			fatura(antiga, pagoAntiga, 59, '2026-11-01T12:00:00Z'),
			fatura(nova, pagoNova, 99, '2026-11-10T12:30:00Z')
		]);

		const d = await processarTroca({ nova, em: EM }, cliente, AGORA);
		expect(d).toEqual({ canceladas: 1, devolvidas: 1, porFora: 0, aguardando: false });
		expect(canceladas).toEqual([antiga]);
		const esperado = Math.floor((5_900 * 21) / 30);
		expect(devolucoes).toEqual([
			{ pagamento: pagoAntiga, valor: esperado / 100, chave: `spokke-devolucao-${pagoAntiga}` }
		]);
		expect(
			(await prisma.providerSubscription.findUniqueOrThrow({ where: { id: antiga } })).status
		).toBe('cancelled');
		const historico = await prisma.auditEvent.findMany({
			where: { teacherId: t.id, type: 'devolucao' }
		});
		expect(historico).toHaveLength(1);
		expect(historico[0]!.data).toMatchObject({ valor: esperado, plano: 'pro' });

		// O mesmo job de novo — a retentativa, ou a fatura atrasada que o chama outra
		// vez: nada sai em dobro.
		const deNovo = await processarTroca({ nova, em: EM }, cliente, AGORA);
		expect(deNovo).toEqual({ canceladas: 0, devolvidas: 0, porFora: 0, aguardando: false });
		expect(devolucoes).toHaveLength(1);
		expect(canceladas).toEqual([antiga]);
		expect(canceladas).not.toContain(depois);
	});

	it('nada volta antes de o plano novo estar pago: espera e tenta de novo, e depois de um dia chama a equipe', async () => {
		const u = await professor('B');
		const velha = await assinatura(u.id, 'velha', {
			plano: 'pro',
			ciclo: 'mensal',
			status: 'authorized',
			ativadaEm: '2026-11-01T12:00:00Z'
		});
		const semPagamento = await assinatura(u.id, 'sem-pagamento', {
			plano: 'super',
			ciclo: 'mensal',
			status: 'authorized',
			ativadaEm: EM
		});
		const { cliente, canceladas, devolucoes } = falso([
			fatura(velha, pagamento('velha'), 59, '2026-11-01T12:00:00Z')
		]);

		const d = await processarTroca({ nova: semPagamento, em: EM }, cliente, AGORA);
		// Cancelar não espera: duas assinaturas ativas seriam duas cobranças.
		expect(d).toEqual({ canceladas: 1, devolvidas: 0, porFora: 0, aguardando: true });
		expect(canceladas).toEqual([velha]);
		expect(devolucoes).toHaveLength(0);
		const seguinte = await prisma.job.findFirst({
			where: { type: 'mercadopago-troca', payload: { path: ['nova'], equals: semPagamento } }
		});
		expect(seguinte?.payload).toMatchObject({ nova: semPagamento, em: EM, tentativa: 1 });
		expect(seguinte!.runAfter.getTime()).toBe(AGORA.getTime() + 30 * 60 * 1000);

		// Esgotadas as esperas, a equipe fica sabendo — e nada é devolvido às cegas.
		const ultima = await processarTroca(
			{ nova: semPagamento, em: EM, tentativa: ESPERAS_PELO_PAGAMENTO },
			cliente,
			AGORA
		);
		expect(ultima.aguardando).toBe(false);
		expect(devolucoes).toHaveLength(0);
		const aviso = await prisma.job.findFirst({
			where: { type: 'aviso-equipe', payload: { path: ['assunto'], string_contains: RODADA } }
		});
		expect(aviso).not.toBeNull();
	});

	it('pagamento que já teve devolução por fora não devolve de novo', async () => {
		const v = await professor('C');
		const velha = await assinatura(v.id, 'devolvida-por-fora', {
			plano: 'pro',
			ciclo: 'mensal',
			status: 'cancelled',
			ativadaEm: '2026-11-01T12:00:00Z'
		});
		const atual = await assinatura(v.id, 'atual', {
			plano: 'super',
			ciclo: 'mensal',
			status: 'authorized',
			ativadaEm: EM
		});
		const pago = pagamento('devolvida-por-fora');
		const { cliente, devolucoes } = falso(
			[
				fatura(velha, pago, 59, '2026-11-01T12:00:00Z'),
				fatura(atual, pagamento('atual'), 99, '2026-11-10T12:30:00Z')
			],
			{ [pago]: 59 }
		);

		const d = await processarTroca({ nova: atual, em: EM }, cliente, AGORA);
		expect(d.devolvidas).toBe(0);
		expect(devolucoes).toHaveLength(0);
		expect(
			await prisma.providerEvent.findUnique({ where: { id: chaveDaDevolucao(pago) } })
		).toMatchObject({ type: 'devolucao_externa' });
	});

	it('o último dia do ciclo não vira devolução de centavos', async () => {
		const w = await professor('D');
		const velha = await assinatura(w.id, 'ultimo-dia', {
			plano: 'basico',
			ciclo: 'mensal',
			status: 'authorized',
			ativadaEm: '2026-10-10T12:00:00Z'
		});
		const atual = await assinatura(w.id, 'ultimo-dia-nova', {
			plano: 'pro',
			ciclo: 'mensal',
			status: 'authorized',
			ativadaEm: EM
		});
		// 29 reais pagos em 10/10: em 10/11 sobram zero dias; um minuto antes, centavos.
		const { cliente, devolucoes } = falso([
			fatura(velha, pagamento('ultimo-dia'), 29, '2026-10-10T12:01:00Z'),
			fatura(atual, pagamento('ultimo-dia-nova'), 59, '2026-11-10T12:30:00Z')
		]);
		expect(
			valorNaoUsado(
				{ centavos: 2_900, debitadoEm: new Date('2026-10-10T12:01:00Z'), ciclo: 'mensal' },
				AGORA
			)
		).toBeLessThan(DEVOLUCAO_MINIMA_CENTAVOS);
		const d = await processarTroca({ nova: atual, em: EM }, cliente, AGORA);
		expect(d).toEqual({ canceladas: 1, devolvidas: 0, porFora: 0, aguardando: false });
		expect(devolucoes).toHaveLength(0);
	});

	it('anual depois do prazo de devolução: o Mercado Pago recusa, e a equipe recebe o valor para devolver por fora', async () => {
		const z = await professor('G');
		const anual = await assinatura(z.id, 'anual-antigo', {
			plano: 'pro',
			ciclo: 'anual',
			status: 'authorized',
			ativadaEm: '2026-03-10T12:00:00Z'
		});
		const atual = await assinatura(z.id, 'anual-antigo-nova', {
			plano: 'super',
			ciclo: 'anual',
			status: 'authorized',
			ativadaEm: EM
		});
		const pago = pagamento('anual-antigo');
		const { cliente, devolucoes } = falso(
			[
				fatura(anual, pago, 590, '2026-03-10T12:00:00Z'),
				fatura(atual, pagamento('anual-antigo-nova'), 990, '2026-11-10T12:30:00Z')
			],
			{},
			[pago]
		);

		const d = await processarTroca({ nova: atual, em: EM }, cliente, AGORA);
		expect(d).toEqual({ canceladas: 1, devolvidas: 0, porFora: 1, aguardando: false });
		expect(devolucoes).toHaveLength(0);
		// De 10/11 a 10/3 do ano seguinte sobram 120 dos 365 dias do anual.
		const valor = Math.floor((59_000 * 120) / 365);
		expect(
			await prisma.providerEvent.findUnique({ where: { id: chaveDaDevolucao(pago) } })
		).toMatchObject({ type: 'devolucao_por_fora' });
		const historico = await prisma.auditEvent.findFirstOrThrow({
			where: { teacherId: z.id, type: 'devolucao_por_fora' }
		});
		expect(historico.data).toMatchObject({ valor, plano: 'pro', ciclo: 'anual' });
		const avisos = () =>
			prisma.job.findMany({
				where: {
					type: 'aviso-equipe',
					payload: { path: ['assunto'], string_contains: `para Troca G ${RODADA}` }
				}
			});
		const [aviso, ...outros] = await avisos();
		expect(outros).toHaveLength(0);
		// O e-mail já leva o valor calculado e o pagamento: a equipe não refaz a conta.
		expect(aviso?.payload).toMatchObject({ assunto: expect.stringContaining(reais(valor)) });
		expect(JSON.stringify(aviso?.payload)).toContain(pago);

		// O job de novo não pede outra vez nem manda outro e-mail.
		const deNovo = await processarTroca({ nova: atual, em: EM }, cliente, AGORA);
		expect(deNovo.porFora).toBe(0);
		expect(await avisos()).toHaveLength(1);
	});

	it('planoEmVigor: só existe quando quem paga é o Mercado Pago', async () => {
		const x = await professor('E');
		await assinatura(x.id, 'em-vigor', { plano: 'pro', ciclo: 'anual', status: 'authorized' });
		expect(await planoEmVigor(x.id, 'assinatura', AGORA)).toEqual({
			plano: 'pro',
			ciclo: 'anual',
			renovaSozinha: true
		});
		// Equipe, escola e trial não têm assinatura no gateway por trás.
		expect(await planoEmVigor(x.id, 'equipe', AGORA)).toBeNull();

		// Renovação cancelada pelo professor: o plano segue até o fim, e escolher o
		// mesmo é assinar de novo.
		const y = await professor('F');
		await prisma.teacher.update({ where: { id: y.id }, data: { cancelAtPeriodEnd: true } });
		await assinatura(y.id, 'cancelada', { plano: 'basico', ciclo: 'mensal', status: 'cancelled' });
		expect(await planoEmVigor(y.id, 'assinatura', AGORA)).toEqual({
			plano: 'basico',
			ciclo: 'mensal',
			renovaSozinha: false
		});
	});
});
