import { prisma } from '$lib/server/db/client';
import { enqueueTrocaMercadoPago } from '$lib/server/queue';
import { NOME_DO_PLANO, ehCiclo, ehPlanoPago } from '$lib/billing/catalogo';
import { ativarPlano, avisarPlano, cancelar, fimDoPeriodo } from '../assinaturas';
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
export function normalizarStatus(status: string): string {
	return status === 'canceled' ? 'cancelled' : status;
}

/**
 * A marca de que uma assinatura já foi ATIVADA aqui e a troca dela começou
 * (billing.md "Troca de plano"). O `createdAt` dela é a ordem das ativações:
 * entre duas assinaturas autorizadas do mesmo professor, vale a ativada por
 * último.
 */
export function chaveDaTroca(assinaturaId: string): string {
	return `${PROVEDOR}:troca:${assinaturaId}`;
}

/** O banco recusou a marca porque a outra porta (webhook ou volta do checkout) gravou antes. */
function ehRepetido(err: unknown): boolean {
	return typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2002';
}

/**
 * Outra assinatura autorizada do professor, ativada DEPOIS desta: é ela quem
 * vale, e esta está sendo substituída. Assinatura sem marca conta como ativada
 * no começo dos tempos.
 */
async function substitutaDe(linha: {
	id: string;
	teacherId: string;
}): Promise<{ id: string; ativadaEm: Date } | null> {
	const outras = await prisma.providerSubscription.findMany({
		where: {
			teacherId: linha.teacherId,
			provider: PROVEDOR,
			status: 'authorized',
			id: { not: linha.id }
		},
		select: { id: true }
	});
	if (outras.length === 0) return null;
	const marcas = await prisma.providerEvent.findMany({
		where: { id: { in: [linha.id, ...outras.map((o) => o.id)].map(chaveDaTroca) } }
	});
	const ativadaEm = new Map(marcas.map((m) => [m.id, m.createdAt]));
	const minha = ativadaEm.get(chaveDaTroca(linha.id))?.getTime() ?? 0;
	let substituta: { id: string; ativadaEm: Date } | null = null;
	for (const outra of outras) {
		const quando = ativadaEm.get(chaveDaTroca(outra.id));
		if (quando && quando.getTime() > minha && (!substituta || quando > substituta.ativadaEm)) {
			substituta = { id: outra.id, ativadaEm: quando };
		}
	}
	return substituta;
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
 *
 * Não chama o Mercado Pago: o que a troca de plano faz lá (cancelar a antiga,
 * devolver o que sobrou) é do job `mercadopago-troca` (`troca.ts`), com as
 * retentativas da fila — uma recusa do provedor ali não pode impedir de ativar
 * o plano que o professor acabou de pagar.
 */
export async function aplicarAssinatura(
	mp: AssinaturaMp,
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
		// A TROCA (billing.md "Troca de plano"): na primeira vez que esta assinatura
		// aparece autorizada, ela vira a que vale — o período passa a ser o dela, e um
		// job cancela lá as que ela substituiu e devolve a parte não usada delas (sem
		// isso o professor pagaria duas assinaturas todo mês). A marca é gravada na
		// MESMA transação da ativação: uma vez só por assinatura, venha a
		// notificação quantas vezes vier.
		const marca = chaveDaTroca(linha.id);
		const trocaIniciada = await prisma.providerEvent.findUnique({ where: { id: marca } });
		// `linha` foi lida antes da atualização acima: autorizada ali e sem marca é
		// assinatura ativada antes de a troca existir — conta como a mais antiga.
		const jaEraAutorizada = linha.status === 'authorized';
		const primeiraAutorizacao = !trocaIniciada && !jaEraAutorizada;

		// Já substituída por uma ativada depois: notificação atrasada da antiga não
		// devolve o professor ao plano de antes. O job da substituta cuida dela.
		if (!primeiraAutorizacao && (await substitutaDe(linha))) return 'sem-mudanca';

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
		if (jaVale && !primeiraAutorizacao) return 'sem-mudanca';

		const ate = dataNoFuturo(mp.next_payment_date, agora) ?? fimDoPeriodo(agora, ciclo);
		try {
			await prisma.$transaction(async (tx) => {
				await ativarPlano(linha.teacherId, { plano, ciclo, ate }, 'provedor', { db: tx, agora });
				if (primeiraAutorizacao) {
					await tx.providerEvent.create({ data: { id: marca, type: 'troca' } });
					await enqueueTrocaMercadoPago({ nova: linha.id, em: agora.toISOString() }, tx);
				}
			});
		} catch (err) {
			// O webhook e a volta do checkout chegaram juntos: a outra porta gravou a
			// marca primeiro, e esta transação inteira voltou atrás.
			if (ehRepetido(err)) return 'sem-mudanca';
			throw err;
		}
		// Depois do commit: um aviso de plano ativo para uma ativação desfeita mentiria.
		await avisarPlano(linha.teacherId, { evento: 'ativado', plano: NOME_DO_PLANO[plano], ate });
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

	// Fatura de uma assinatura que outra, ativada depois, substituiu (billing.md
	// "Troca de plano"): a cobrança que escapou antes do cancelamento não devolve o
	// professor ao plano antigo nem estende o período dele. O dinheiro dela é do
	// job da troca, chamado de novo — a devolução olha o ÚLTIMO pagamento de cada
	// assinatura substituída, e este passou a ser o último.
	const substituta = await substitutaDe(linha);
	if (substituta) {
		if (fatura.payment?.status === 'approved') {
			await enqueueTrocaMercadoPago({
				nova: substituta.id,
				em: substituta.ativadaEm.toISOString()
			});
		}
		return 'ignorada';
	}

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
			return await aplicarAssinatura(await cliente.buscarAssinatura(notificacao.id), agora);
		}
		const fatura = await cliente.buscarFatura(notificacao.id);
		const desfecho = await aplicarFatura(fatura, agora);
		// A fatura também diz que a assinatura existe e mexeu: relê o estado dela.
		await aplicarAssinatura(await cliente.buscarAssinatura(fatura.preapproval_id), agora);
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
			await aplicarAssinatura(await cliente.buscarAssinatura(linha.id), agora);
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
