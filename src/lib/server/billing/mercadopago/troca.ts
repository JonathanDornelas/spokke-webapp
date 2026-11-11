import { prisma } from '$lib/server/db/client';
import {
	enqueueAvisoEquipe,
	enqueueTrocaMercadoPago,
	trocaMercadoPagoJobSchema
} from '$lib/server/queue';
import { NOME_DO_PLANO, ehCiclo, ehPlanoPago, type CicloDeCobranca } from '$lib/billing/catalogo';
import { reais } from '$lib/billing/precos';
import type { PlanoEmVigor } from '$lib/billing/troca';
import { fimDoPeriodo, registrar } from '../assinaturas';
import type { ProviderSubscription as Assinatura } from '../../../../../generated/prisma/client.ts';
import {
	ErroDoMercadoPago,
	clienteMercadoPago,
	type ClienteMercadoPago,
	type FaturaMp
} from './cliente';
import { PROVEDOR, chaveDaTroca, normalizarStatus } from './sincronizar';

/**
 * A TROCA de plano no Mercado Pago (billing.md "Troca de plano"; decisão do dono
 * em 2026-11-11: ciclo novo + devolução). O Mercado Pago não troca o plano de
 * uma assinatura nem cobra proporcional, então trocar é assinar de novo: o
 * professor paga o plano novo por inteiro, num checkout, e o ciclo recomeça.
 * Quando a assinatura nova é autorizada (`aplicarAssinatura`), este job:
 *
 * 1. **cancela lá as assinaturas que ela substituiu** — sem esperar nada: duas
 *    assinaturas ativas são duas cobranças no cartão;
 * 2. **devolve a parte não usada do último pagamento de cada uma**, contada a
 *    partir do instante em que o ciclo novo começou — mas só depois de o
 *    PRIMEIRO pagamento da nova ser aprovado. A autorização chega antes da
 *    cobrança, e devolver em cima de um cartão que depois recusa seria dar o
 *    plano novo e o dinheiro do antigo;
 * 3. **o que o Mercado Pago não devolve sai POR FORA** — pagamento antigo demais
 *    (o anual trocado depois do prazo de devolução dele) ou devolução parcial
 *    que o meio não aceita: a equipe recebe um e-mail com o valor já calculado
 *    e devolve por Pix ou transferência (decisão do dono, 2026-11-11).
 *
 * Tudo idempotente: cancelar o que já está cancelado não acontece, e cada
 * pagamento devolve UMA vez (`ProviderEvent` `mercadopago:devolucao:<id>`, mais
 * a chave de idempotência do Mercado Pago, mais a conferência do que já voltou
 * no próprio pagamento antes de pedir).
 */

/** Abaixo disto não se devolve: no último dia do ciclo, a parte não usada é de centavos. */
export const DEVOLUCAO_MINIMA_CENTAVOS = 100;

/** Entre uma conferência e outra do primeiro pagamento da assinatura nova. */
const ESPERA_PELO_PAGAMENTO_MS = 30 * 60 * 1000;
/** Quantas conferências antes de chamar a equipe: 48 de meia hora são um dia. */
export const ESPERAS_PELO_PAGAMENTO = 48;
/** Assinatura cancelada há mais que isto não tem pagamento ainda em uso (o anual dura um ano). */
const JANELA_DAS_CANCELADAS_MS = 400 * 24 * 60 * 60 * 1000;

export function chaveDaDevolucao(pagamentoId: string): string {
	return `${PROVEDOR}:devolucao:${pagamentoId}`;
}

/**
 * A parte de um pagamento que o ciclo novo cobre, em centavos — a que volta para
 * o cartão. O pagamento vale de `debitadoEm` até um ciclo depois; a troca em
 * `troca` corta esse período. Cobrado DEPOIS da troca (a cobrança da antiga que
 * escapou antes do cancelamento), nada dele foi usado: volta inteiro.
 * Arredonda para baixo — nunca devolve um centavo a mais do que sobrou.
 */
export function valorNaoUsado(
	pagamento: { centavos: number; debitadoEm: Date; ciclo: CicloDeCobranca },
	troca: Date
): number {
	const inicio = pagamento.debitadoEm.getTime();
	if (!(pagamento.centavos > 0) || Number.isNaN(inicio)) return 0;
	const fim = fimDoPeriodo(pagamento.debitadoEm, pagamento.ciclo).getTime();
	const corte = troca.getTime();
	if (corte <= inicio) return pagamento.centavos;
	if (corte >= fim) return 0;
	return Math.floor((pagamento.centavos * (fim - corte)) / (fim - inicio));
}

/** O último pagamento aprovado entre as faturas de uma assinatura. */
export function ultimoPagamentoAprovado(
	faturas: FaturaMp[]
): { pagamentoId: string; centavos: number; debitadoEm: Date } | null {
	let ultimo: { pagamentoId: string; centavos: number; debitadoEm: Date } | null = null;
	for (const fatura of faturas) {
		if (fatura.payment?.status !== 'approved' || fatura.payment.id == null) continue;
		const debitadoEm = new Date(fatura.debit_date ?? fatura.date_created ?? '');
		if (Number.isNaN(debitadoEm.getTime())) continue;
		if (ultimo && debitadoEm <= ultimo.debitadoEm) continue;
		ultimo = {
			pagamentoId: String(fatura.payment.id),
			centavos: Math.round((fatura.transaction_amount ?? 0) * 100),
			debitadoEm
		};
	}
	return ultimo;
}

/**
 * As assinaturas que `nova` substitui: as outras do professor que ainda cobram
 * (autorizadas ou pausadas) e as canceladas recentes, cujo último pagamento pode
 * cobrir dias que o ciclo novo também cobre. Fica de fora a ativada DEPOIS da
 * nova: é ela quem vale agora, e o job dela substitui esta, não o contrário.
 */
async function substituidasPor(nova: Assinatura, em: Date): Promise<Assinatura[]> {
	const candidatas = await prisma.providerSubscription.findMany({
		where: {
			teacherId: nova.teacherId,
			provider: PROVEDOR,
			id: { not: nova.id },
			OR: [
				{ status: { in: ['authorized', 'paused'] } },
				{
					status: 'cancelled',
					updatedAt: { gte: new Date(em.getTime() - JANELA_DAS_CANCELADAS_MS) }
				}
			]
		}
	});
	if (candidatas.length === 0) return [];
	const marcas = await prisma.providerEvent.findMany({
		where: { id: { in: [nova.id, ...candidatas.map((c) => c.id)].map(chaveDaTroca) } }
	});
	const ativadaEm = new Map(marcas.map((m) => [m.id, m.createdAt.getTime()]));
	const minha = ativadaEm.get(chaveDaTroca(nova.id)) ?? em.getTime();
	return candidatas.filter((c) => (ativadaEm.get(chaveDaTroca(c.id)) ?? 0) <= minha);
}

export type DesfechoDaTroca = {
	canceladas: number;
	devolvidas: number;
	/** Recusadas pelo Mercado Pago e entregues à equipe, para devolver por Pix ou transferência. */
	porFora: number;
	/** Ficou para depois: o primeiro pagamento da nova ainda não foi aprovado. */
	aguardando: boolean;
};

/**
 * O Mercado Pago RECUSOU esta devolução (400 ou 422): pagamento antigo demais
 * para devolver, ou devolução parcial que o meio de pagamento não aceita. Pedir
 * de novo não muda a resposta. Token errado (401/403), limite (429) e o
 * provedor fora (5xx) continuam erro: a fila tenta de novo e, esgotada, avisa a
 * equipe.
 */
function ehRecusaDaDevolucao(err: unknown): err is ErroDoMercadoPago {
	return err instanceof ErroDoMercadoPago && (err.status === 400 || err.status === 422);
}

/**
 * A devolução que o Mercado Pago não faz sai POR FORA (decisão do dono,
 * 2026-11-11): a equipe recebe o valor já calculado e devolve por Pix ou
 * transferência, combinando com o professor pela resposta do e-mail. A marca
 * entra na mesma transação — o job não pede de novo nem manda outro e-mail — e
 * o histórico do professor diz que a devolução está com a equipe.
 */
async function devolverPorFora(
	d: { antiga: Assinatura; pagamentoId: string; centavos: number; marca: string },
	recusa: string
): Promise<void> {
	const professor = await prisma.teacher.findUnique({
		where: { id: d.antiga.teacherId },
		select: { name: true, email: true }
	});
	const nome = professor?.name ?? d.antiga.teacherId;
	const plano = ehPlanoPago(d.antiga.plano) ? NOME_DO_PLANO[d.antiga.plano] : d.antiga.plano;
	await prisma.$transaction(async (tx) => {
		await tx.providerEvent.create({ data: { id: d.marca, type: 'devolucao_por_fora' } });
		await registrar(tx, {
			teacherId: d.antiga.teacherId,
			actor: 'provedor',
			type: 'devolucao_por_fora',
			data: {
				plano: d.antiga.plano,
				ciclo: d.antiga.ciclo,
				valor: d.centavos,
				pagamento: d.pagamentoId,
				assinatura: d.antiga.id
			}
		});
		await enqueueAvisoEquipe(
			{
				assunto: `Devolução por fora: ${reais(d.centavos)} para ${nome}`.slice(0, 200),
				texto: [
					`O Mercado Pago não deixou devolver a parte não usada da assinatura antiga de ${nome}${professor ? ` <${professor.email}>` : ''}, depois de uma troca de plano.`,
					`Resposta do Mercado Pago: ${recusa.slice(0, 500)}`,
					'',
					`Valor a devolver: ${reais(d.centavos)}, a parte não usada do plano ${plano} (${d.antiga.ciclo}).`,
					`Pagamento no Mercado Pago: ${d.pagamentoId}. Assinatura antiga: ${d.antiga.id}, já cancelada.`,
					'',
					'Devolva por Pix ou transferência. Responder este e-mail fala direto com o professor.'
				]
					.join('\n')
					.slice(0, 10_000),
				...(professor ? { replyTo: professor.email } : {})
			},
			tx
		);
	});
}

/** O job `mercadopago-troca`. */
export async function processarTroca(
	payload: unknown,
	cliente: ClienteMercadoPago = clienteMercadoPago(),
	agora: Date = new Date()
): Promise<DesfechoDaTroca> {
	const job = trocaMercadoPagoJobSchema.parse(payload);
	const em = new Date(job.em);
	const desfecho: DesfechoDaTroca = {
		canceladas: 0,
		devolvidas: 0,
		porFora: 0,
		aguardando: false
	};
	const nova = await prisma.providerSubscription.findUnique({ where: { id: job.nova } });
	if (!nova || nova.provider !== PROVEDOR) return desfecho;

	const substituidas = await substituidasPor(nova, em);

	// 1. Parar de cobrar.
	for (const antiga of substituidas) {
		if (antiga.status !== 'authorized' && antiga.status !== 'paused') continue;
		const cancelada = await cliente.cancelarAssinatura(antiga.id);
		antiga.status = normalizarStatus(cancelada.status);
		await prisma.providerSubscription.update({
			where: { id: antiga.id },
			data: { status: antiga.status }
		});
		desfecho.canceladas += 1;
	}

	// 2. O que devolver.
	const devolucoes: {
		antiga: Assinatura;
		pagamentoId: string;
		centavos: number;
		marca: string;
	}[] = [];
	for (const antiga of substituidas) {
		if (!ehCiclo(antiga.ciclo)) continue;
		const ultimo = ultimoPagamentoAprovado(await cliente.buscarFaturasDaAssinatura(antiga.id));
		if (!ultimo) continue;
		const marca = chaveDaDevolucao(ultimo.pagamentoId);
		if (await prisma.providerEvent.findUnique({ where: { id: marca } })) continue;
		const centavos = valorNaoUsado({ ...ultimo, ciclo: antiga.ciclo }, em);
		if (centavos < DEVOLUCAO_MINIMA_CENTAVOS) continue;
		devolucoes.push({ antiga, pagamentoId: ultimo.pagamentoId, centavos, marca });
	}
	if (devolucoes.length === 0) return desfecho;

	// 3. Nada volta antes de o plano novo estar pago.
	if (!ultimoPagamentoAprovado(await cliente.buscarFaturasDaAssinatura(nova.id))) {
		if (job.tentativa >= ESPERAS_PELO_PAGAMENTO) {
			await avisarEquipeDaTroca(
				nova.teacherId,
				nova.id,
				'o primeiro pagamento da assinatura nova não foi aprovado em um dia, e a devolução da antiga ficou parada'
			);
			return desfecho;
		}
		await enqueueTrocaMercadoPago(
			{ nova: nova.id, em: job.em, tentativa: job.tentativa + 1 },
			prisma,
			new Date(agora.getTime() + ESPERA_PELO_PAGAMENTO_MS)
		);
		return { ...desfecho, aguardando: true };
	}

	// 4. Devolver.
	for (const d of devolucoes) {
		// Devolução que já saiu por fora — pelo painel do Mercado Pago, ou por uma
		// retentativa depois de a chave de idempotência vencer: não sai outra.
		const pagamento = await cliente.buscarPagamento(d.pagamentoId);
		if ((pagamento.transaction_amount_refunded ?? 0) > 0) {
			console.info(`[mercadopago] pagamento ${d.pagamentoId} já tinha devolução; nada a devolver`);
			await prisma.providerEvent.create({ data: { id: d.marca, type: 'devolucao_externa' } });
			continue;
		}
		try {
			await cliente.devolver(d.pagamentoId, d.centavos / 100, `spokke-devolucao-${d.pagamentoId}`);
		} catch (err) {
			if (!ehRecusaDaDevolucao(err)) throw err;
			await devolverPorFora(d, err.message);
			desfecho.porFora += 1;
			continue;
		}
		await prisma.$transaction(async (tx) => {
			await tx.providerEvent.create({ data: { id: d.marca, type: 'devolucao' } });
			await registrar(tx, {
				teacherId: d.antiga.teacherId,
				actor: 'provedor',
				type: 'devolucao',
				data: {
					plano: d.antiga.plano,
					ciclo: d.antiga.ciclo,
					valor: d.centavos,
					pagamento: d.pagamentoId,
					assinatura: d.antiga.id
				}
			});
		});
		desfecho.devolvidas += 1;
	}
	return desfecho;
}

/**
 * A troca que não terminou sozinha vai para a EQUIPE por e-mail: é dinheiro do
 * professor parado, e um job falhado no painel interno sozinho pode passar dias
 * sem ninguém ver.
 */
export async function avisarEquipeDaTroca(
	teacherId: string,
	assinaturaNova: string,
	motivo: string
): Promise<void> {
	const professor = await prisma.teacher.findUnique({
		where: { id: teacherId },
		select: { name: true, email: true }
	});
	const nome = professor?.name ?? teacherId;
	await enqueueAvisoEquipe({
		assunto: `Troca de plano parada no Mercado Pago: ${nome}`.slice(0, 200),
		texto: [
			`A troca de plano de ${nome}${professor ? ` <${professor.email}>` : ''} não terminou sozinha: ${motivo}.`,
			'',
			`Assinatura nova no Mercado Pago: ${assinaturaNova}.`,
			'Confira no painel do Mercado Pago se as assinaturas antigas desse professor foram canceladas e devolva à mão a parte não usada do último pagamento delas. O job está no painel interno, com "Tentar de novo".'
		]
			.join('\n')
			.slice(0, 10_000),
		...(professor ? { replyTo: professor.email } : {})
	});
}

/** O job que esgotou as tentativas: a equipe fica sabendo, com o erro do provedor. */
export async function avisarTrocaQueFalhou(payload: unknown, erro: string): Promise<void> {
	const job = trocaMercadoPagoJobSchema.safeParse(payload);
	if (!job.success) return;
	const nova = await prisma.providerSubscription.findUnique({ where: { id: job.data.nova } });
	if (!nova) return;
	await avisarEquipeDaTroca(
		nova.teacherId,
		nova.id,
		`o Mercado Pago recusou (${erro.slice(0, 500)})`
	);
}

/**
 * O plano em vigor quando quem paga por ele é o Mercado Pago — o que a tela de
 * planos e `solicitarPlano` precisam para decidir o botão de cada cartão
 * (`$lib/billing/troca.ts`). Nulo quando não há assinatura paga no gateway por
 * trás do plano: trial, escola, equipe, plano dado pela equipe ou sem
 * vencimento — aí escolher um plano é a assinatura de sempre.
 */
export async function planoEmVigor(
	teacherId: string,
	origem: string,
	agora: Date = new Date()
): Promise<PlanoEmVigor | null> {
	if (origem !== 'assinatura') return null;
	const [conta, vigente, ultima] = await Promise.all([
		prisma.teacher.findUniqueOrThrow({
			where: { id: teacherId },
			select: { currentPeriodEnd: true, cancelAtPeriodEnd: true }
		}),
		prisma.providerSubscription.findFirst({
			where: { teacherId, provider: PROVEDOR, status: 'authorized' },
			orderBy: { createdAt: 'desc' }
		}),
		prisma.providerSubscription.findFirst({
			where: { teacherId, provider: PROVEDOR, status: { not: 'pending' } },
			orderBy: { updatedAt: 'desc' }
		})
	]);
	if (vigente) {
		if (!ehPlanoPago(vigente.plano) || !ehCiclo(vigente.ciclo)) return null;
		return { plano: vigente.plano, ciclo: vigente.ciclo, renovaSozinha: !conta.cancelAtPeriodEnd };
	}
	// Renovação cancelada pelo professor: o plano segue até o fim do período, pago
	// pela última assinatura — escolher o mesmo é assinar de novo.
	if (
		conta.cancelAtPeriodEnd &&
		ultima &&
		conta.currentPeriodEnd &&
		conta.currentPeriodEnd > agora &&
		ehPlanoPago(ultima.plano) &&
		ehCiclo(ultima.ciclo)
	) {
		return { plano: ultima.plano, ciclo: ultima.ciclo, renovaSozinha: false };
	}
	return null;
}
