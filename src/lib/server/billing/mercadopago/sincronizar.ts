import { prisma } from '$lib/server/db/client';
import { ehCiclo, ehPlanoPago } from '$lib/billing/catalogo';
import { ativarPlano, cancelar, fimDoPeriodo } from '../assinaturas';
import {
	ErroDoMercadoPago,
	clienteMercadoPago,
	type AssinaturaMp,
	type ClienteMercadoPago,
	type FaturaMp
} from './cliente';
import type { TopicoDeAssinatura } from './webhook';

/**
 * O estado do Mercado Pago aplicado à conta (billing.md "Mercado Pago"). Quem
 * chama é o worker (job `mercadopago`, disparado pelo webhook) e a volta do
 * checkout (`sincronizarPendentes`). As duas portas convergem aqui, e as duas
 * BUSCAM o recurso na API antes de mudar qualquer coisa — a notificação só diz
 * o que mudou, nunca como ficou.
 *
 * Quem escreve o plano continua sendo `assinaturas.ts`, com o ator `provedor`.
 */

export const PROVEDOR = 'mercadopago';

export type Desfecho = 'ignorada' | 'sem-mudanca' | 'ativada' | 'cancelada' | 'estendida';

/** "cancelled" é o que a API devolve; "canceled" aparece em trecho da documentação. */
function normalizarStatus(status: string): string {
	return status === 'canceled' ? 'cancelled' : status;
}

/** Folga para não reativar por segundos: a primeira fatura chega junto da autorização. */
const FOLGA_MS = 2 * 24 * 60 * 60 * 1000;

function dataNoFuturo(valor: string | null | undefined, agora: Date): Date | null {
	if (!valor) return null;
	const data = new Date(valor);
	return Number.isNaN(data.getTime()) || data <= agora ? null : data;
}

/**
 * Aplica uma assinatura (`preapproval`). `authorized` ativa o plano até a
 * próxima cobrança; `cancelled` e `paused` param a renovação — o professor usa
 * até o fim do que pagou (billing.md "Degradação, não desligamento"); `pending`
 * é o checkout que ainda não foi concluído.
 */
export async function aplicarAssinatura(
	mp: AssinaturaMp,
	cliente: ClienteMercadoPago,
	agora: Date = new Date()
): Promise<Desfecho> {
	const linha = await prisma.providerSubscription.findUnique({ where: { id: mp.id } });
	// Assinatura que não nasceu aqui (outro app na mesma conta do Mercado Pago, um
	// teste de notificação do painel): não é de ninguém do produto.
	if (!linha || linha.provider !== PROVEDOR) return 'ignorada';
	// A referência é o id do professor, gravada por nós no checkout. Divergiu, não
	// é de quem o banco diz — melhor não mexer em conta nenhuma.
	if (mp.external_reference && mp.external_reference !== linha.teacherId) {
		console.warn(`[mercadopago] ${mp.id}: external_reference não confere com a assinatura gravada`);
		return 'ignorada';
	}
	if (!ehPlanoPago(linha.plano) || !ehCiclo(linha.ciclo)) return 'ignorada';
	const plano = linha.plano;
	const ciclo = linha.ciclo;

	const status = normalizarStatus(mp.status);
	if (status !== linha.status) {
		await prisma.providerSubscription.update({ where: { id: linha.id }, data: { status } });
	}

	if (status === 'authorized') {
		// Troca de plano: a assinatura nova vale, e a antiga é cancelada lá — sem
		// isso o professor pagaria as duas todo mês.
		const antigas = await prisma.providerSubscription.findMany({
			where: {
				teacherId: linha.teacherId,
				provider: PROVEDOR,
				status: { in: ['authorized', 'paused'] },
				id: { not: linha.id }
			}
		});
		for (const antiga of antigas) {
			const cancelada = await cliente.cancelarAssinatura(antiga.id);
			await prisma.providerSubscription.update({
				where: { id: antiga.id },
				data: { status: normalizarStatus(cancelada.status) }
			});
		}

		const conta = await prisma.teacher.findUniqueOrThrow({
			where: { id: linha.teacherId },
			select: {
				plan: true,
				planCycle: true,
				subscriptionStatus: true,
				currentPeriodEnd: true,
				cancelAtPeriodEnd: true
			}
		});
		const jaVale =
			conta.subscriptionStatus === 'active' &&
			conta.plan === plano &&
			conta.planCycle === ciclo &&
			!conta.cancelAtPeriodEnd &&
			!!conta.currentPeriodEnd &&
			conta.currentPeriodEnd > agora;
		if (jaVale) return 'sem-mudanca';

		const ate = dataNoFuturo(mp.next_payment_date, agora) ?? fimDoPeriodo(agora, ciclo);
		await ativarPlano(linha.teacherId, { plano, ciclo, ate }, 'provedor', { agora });
		return 'ativada';
	}

	if (status === 'cancelled' || status === 'paused') {
		// Só a assinatura EM VIGOR para a conta: a antiga, cancelada na troca de
		// plano, chega aqui também — e não pode cancelar a nova.
		const outraVigente = await prisma.providerSubscription.count({
			where: {
				teacherId: linha.teacherId,
				provider: PROVEDOR,
				status: 'authorized',
				id: { not: linha.id }
			}
		});
		if (outraVigente > 0) return 'sem-mudanca';
		const conta = await prisma.teacher.findUniqueOrThrow({
			where: { id: linha.teacherId },
			select: { subscriptionStatus: true, cancelAtPeriodEnd: true }
		});
		if (conta.subscriptionStatus !== 'active' || conta.cancelAtPeriodEnd) return 'sem-mudanca';
		await cancelar(linha.teacherId, { noFimDoPeriodo: true }, 'provedor');
		return 'cancelada';
	}

	return 'sem-mudanca';
}

/**
 * Uma FATURA (a cobrança recorrente). Aprovada, estende o período por um ciclo
 * a partir do débito — uma vez só por fatura (`ProviderEvent`, na MESMA
 * transação da extensão). Recusada não muda nada: o período corre até o fim e a
 * carência entra pelas datas (`entitlements.ts`), enquanto o Mercado Pago tenta
 * cobrar de novo.
 */
export async function aplicarFatura(fatura: FaturaMp, agora: Date = new Date()): Promise<Desfecho> {
	const linha = await prisma.providerSubscription.findUnique({
		where: { id: fatura.preapproval_id }
	});
	if (!linha || linha.provider !== PROVEDOR) return 'ignorada';
	if (!ehPlanoPago(linha.plano) || !ehCiclo(linha.ciclo)) return 'ignorada';
	if (fatura.payment?.status !== 'approved') return 'sem-mudanca';
	const plano = linha.plano;
	const ciclo = linha.ciclo;

	const base = fatura.debit_date ? new Date(fatura.debit_date) : agora;
	const ate = fimDoPeriodo(Number.isNaN(base.getTime()) ? agora : base, ciclo);
	if (ate <= agora) return 'sem-mudanca';

	return prisma.$transaction(async (tx) => {
		const ja = await tx.providerEvent.findUnique({
			where: { id: `${PROVEDOR}:fatura:${fatura.id}` }
		});
		if (ja) return 'sem-mudanca' as const;
		await tx.providerEvent.create({
			data: { id: `${PROVEDOR}:fatura:${fatura.id}`, type: 'fatura_aprovada' }
		});
		const conta = await tx.teacher.findUniqueOrThrow({
			where: { id: linha.teacherId },
			select: { plan: true, currentPeriodEnd: true, subscriptionStatus: true }
		});
		// A primeira fatura chega junto da autorização, que já ativou o período até
		// a próxima cobrança: estender de novo aqui seria dar um mês de graça.
		const jaCoberto =
			conta.subscriptionStatus === 'active' &&
			conta.plan === plano &&
			!!conta.currentPeriodEnd &&
			ate.getTime() <= conta.currentPeriodEnd.getTime() + FOLGA_MS;
		if (jaCoberto) return 'sem-mudanca' as const;
		await ativarPlano(linha.teacherId, { plano, ciclo, ate }, 'provedor', { db: tx, agora });
		return 'estendida' as const;
	});
}

/**
 * O job do webhook: busca o recurso e aplica. 404 do provedor é notificação de
 * algo que não existe para o nosso token (o "testar notificação" do painel, outro
 * app) — termina sem erro, em vez de ir cinco vezes para a fila e cair no painel
 * de falhas.
 */
export async function processarNotificacao(
	notificacao: { topico: TopicoDeAssinatura; id: string },
	cliente: ClienteMercadoPago = clienteMercadoPago(),
	agora: Date = new Date()
): Promise<Desfecho> {
	try {
		if (notificacao.topico === 'subscription_preapproval') {
			return await aplicarAssinatura(
				await cliente.buscarAssinatura(notificacao.id),
				cliente,
				agora
			);
		}
		const fatura = await cliente.buscarFatura(notificacao.id);
		const desfecho = await aplicarFatura(fatura, agora);
		// A fatura também diz que a assinatura existe e mexeu: relê o estado dela.
		await aplicarAssinatura(await cliente.buscarAssinatura(fatura.preapproval_id), cliente, agora);
		return desfecho;
	} catch (err) {
		if (err instanceof ErroDoMercadoPago && err.status === 404) return 'ignorada';
		throw err;
	}
}

/**
 * A volta do checkout (\`back_url\`): o redirect NÃO é a verdade (billing.md),
 * mas é a hora em que o professor está olhando — então relê no provedor as
 * assinaturas pendentes recentes dele, e a tela mostra o que o Mercado Pago diz.
 * Se o webhook chegou antes, isto não muda nada; se não chegou, adianta.
 */
export async function sincronizarPendentes(
	teacherId: string,
	cliente: ClienteMercadoPago = clienteMercadoPago(),
	agora: Date = new Date()
): Promise<{ status: string; plano: string; desde: Date } | null> {
	const recentes = await prisma.providerSubscription.findMany({
		where: {
			teacherId,
			provider: PROVEDOR,
			status: 'pending',
			createdAt: { gte: new Date(agora.getTime() - 2 * 24 * 60 * 60 * 1000) }
		},
		orderBy: { createdAt: 'desc' },
		take: 3
	});
	for (const linha of recentes) {
		try {
			await aplicarAssinatura(await cliente.buscarAssinatura(linha.id), cliente, agora);
		} catch (err) {
			console.warn('[mercadopago] não deu para reler', linha.id, err);
		}
	}
	const ultima = await prisma.providerSubscription.findFirst({
		where: { teacherId, provider: PROVEDOR },
		orderBy: { createdAt: 'desc' }
	});
	return ultima ? { status: ultima.status, plano: ultima.plano, desde: ultima.createdAt } : null;
}
