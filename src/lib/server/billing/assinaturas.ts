import { prisma, type Db } from '$lib/server/db/client';
import { notificar } from '$lib/server/notificacoes';
import {
	NOME_DO_PLANO,
	TRIAL,
	ehCiclo,
	ehPlanoPago,
	type CicloDeCobranca,
	type PlanoPago
} from '$lib/billing/catalogo';
import type { Prisma } from '../../../../generated/prisma/client.ts';

/**
 * A gestão de assinatura — o ÚNICO escritor dos campos de cobrança do
 * `Teacher` (`plan`, `subscriptionStatus`, `currentPeriodEnd`, ...). Ver
 * docs/adr-002-billing.md.
 *
 * Hoje quem chama é o painel interno (não existe gateway de pagamento). Quando
 * existir, o webhook do provedor chama ESTAS MESMAS funções — e é por isso que
 * elas recebem o `ator`: o histórico tem de dizer se foi a equipe, o sistema ou
 * o provedor que mudou o plano de alguém.
 *
 * Cada operação grava um `AuditEvent` na MESMA transação da mudança: mudança
 * sem registro, ou registro sem mudança, são as duas coisas que fariam o painel
 * mentir.
 */

export type Ator = 'sistema' | 'professor' | 'provedor' | `admin:${string}`;

/**
 * O sino só ouve o que OUTRA pessoa fez na assinatura dele — a equipe pelo
 * painel, o provedor pelo webhook. O que ele mesmo fez, ele acabou de ver.
 */
export function avisaProfessor(ator: Ator): boolean {
	return ator === 'provedor' || ator.startsWith('admin:');
}

export async function avisarPlano(
	teacherId: string,
	data: {
		evento: 'ativado' | 'trial' | 'cancelado' | 'creditos';
		plano?: string;
		ate?: Date;
		creditos?: number;
	}
): Promise<void> {
	await notificar(teacherId, {
		kind: 'plano',
		key: `plano:${data.evento}:${crypto.randomUUID()}`,
		data: {
			evento: data.evento,
			plano: data.plano ?? null,
			ate: data.ate?.toISOString() ?? null,
			creditos: data.creditos ?? null
		}
	});
}

const DIA_MS = 24 * 60 * 60 * 1000;

function somarMeses(data: Date, meses: number): Date {
	const nova = new Date(data);
	const dia = nova.getUTCDate();
	nova.setUTCDate(1);
	nova.setUTCMonth(nova.getUTCMonth() + meses);
	const ultimo = new Date(Date.UTC(nova.getUTCFullYear(), nova.getUTCMonth() + 1, 0)).getUTCDate();
	nova.setUTCDate(Math.min(dia, ultimo));
	return nova;
}

/** O fim padrão de um período que começa agora. */
export function fimDoPeriodo(inicio: Date, ciclo: CicloDeCobranca): Date {
	return somarMeses(inicio, ciclo === 'anual' ? 12 : 1);
}

export async function registrar(
	db: Db,
	evento: { teacherId: string; actor: Ator; type: string; data?: Record<string, unknown> }
): Promise<void> {
	await db.auditEvent.create({
		data: {
			teacherId: evento.teacherId,
			actor: evento.actor,
			type: evento.type,
			data: (evento.data ?? {}) as Prisma.InputJsonValue
		}
	});
}

/** Roda `fn` numa transação, ou na que já está aberta (quem chama já trava). */
async function emTransacao<T>(db: Db | undefined, fn: (tx: Db) => Promise<T>): Promise<T> {
	if (db && db !== prisma) return fn(db);
	return prisma.$transaction((tx) => fn(tx));
}

/**
 * Os campos com que um cadastro NOVO nasce. Chamado pelo hook de criação do
 * Better Auth (`$lib/server/auth`) — os campos de cobrança são `input: false`,
 * então o corpo do cadastro não escolhe nada disto.
 */
export function camposDoTrial(agora: Date = new Date()) {
	return {
		subscriptionStatus: 'trialing',
		trialEndsAt: new Date(agora.getTime() + TRIAL.dias * DIA_MS)
	};
}

/**
 * Ativa (ou renova) um plano pago. `ate` é o fim do período combinado com o
 * professor; sem ele, um ciclo a partir de agora. A âncora dos créditos muda só
 * quando o plano muda — renovar o mesmo plano não reinicia o ciclo de créditos.
 */
export async function ativarPlano(
	teacherId: string,
	pedido: { plano: PlanoPago; ciclo: CicloDeCobranca; ate?: Date },
	ator: Ator,
	opcoes: { db?: Db; agora?: Date } = {}
) {
	const agora = opcoes.agora ?? new Date();
	const ate = pedido.ate ?? fimDoPeriodo(agora, pedido.ciclo);
	if (ate <= agora) throw new Error('O fim do período precisa estar no futuro.');

	// Dentro da transação de outra função (`atenderPedido`), quem avisa é ela,
	// DEPOIS do commit: um aviso de plano ativo para uma ativação desfeita mentiria.
	const avisar = !opcoes.db && avisaProfessor(ator);
	const feito = await emTransacao(opcoes.db, async (tx) => {
		const antes = await tx.teacher.findUniqueOrThrow({
			where: { id: teacherId },
			select: { plan: true, cycleAnchor: true, subscriptionStatus: true }
		});
		const mudouDePlano = antes.plan !== pedido.plano || antes.subscriptionStatus !== 'active';
		await tx.teacher.update({
			where: { id: teacherId },
			data: {
				plan: pedido.plano,
				planCycle: pedido.ciclo,
				subscriptionStatus: 'active',
				currentPeriodEnd: ate,
				gracePeriodEnd: null,
				cancelAtPeriodEnd: false,
				cycleAnchor: mudouDePlano || !antes.cycleAnchor ? agora : antes.cycleAnchor
			}
		});
		await registrar(tx, {
			teacherId,
			actor: ator,
			type: 'plano_ativado',
			data: {
				de: antes.plan,
				para: pedido.plano,
				ciclo: pedido.ciclo,
				ate: ate.toISOString()
			}
		});
	});
	if (avisar)
		await avisarPlano(teacherId, { evento: 'ativado', plano: NOME_DO_PLANO[pedido.plano], ate });
	return feito;
}

/**
 * Estende o trial em `dias` a partir de hoje ou do fim atual, o que vier
 * depois. Dias negativos ENCERRAM antes (o painel usa para testar o bloqueio);
 * o fim nunca vai para antes de agora.
 */
export async function estenderTrial(
	teacherId: string,
	dias: number,
	ator: Ator,
	opcoes: { db?: Db; agora?: Date } = {}
) {
	const agora = opcoes.agora ?? new Date();
	let fimDoTeste: Date | null = null;
	const feito = await emTransacao(opcoes.db, async (tx) => {
		const antes = await tx.teacher.findUniqueOrThrow({
			where: { id: teacherId },
			select: { trialEndsAt: true, subscriptionStatus: true }
		});
		if ((antes.subscriptionStatus ?? 'trialing') !== 'trialing') {
			throw new Error('Esta conta não está em trial.');
		}
		const base =
			dias >= 0 && antes.trialEndsAt && antes.trialEndsAt > agora ? antes.trialEndsAt : agora;
		const fim = new Date(Math.max(agora.getTime(), base.getTime() + dias * DIA_MS));
		await tx.teacher.update({ where: { id: teacherId }, data: { trialEndsAt: fim } });
		await registrar(tx, {
			teacherId,
			actor: ator,
			type: dias >= 0 ? 'trial_estendido' : 'trial_encerrado',
			data: { de: antes.trialEndsAt?.toISOString() ?? null, para: fim.toISOString(), dias }
		});
		fimDoTeste = fim;
	});
	// Encerrar antes (dias negativos) é ferramenta de teste do painel: não avisa.
	if (fimDoTeste && dias > 0 && !opcoes.db && avisaProfessor(ator)) {
		await avisarPlano(teacherId, { evento: 'trial', ate: fimDoTeste });
	}
	return feito;
}

/**
 * Cancela. `noFimDoPeriodo`: continua valendo até `currentPeriodEnd` — quem
 * pagou o mês usa o mês. Sem isso, encerra agora. Nada é apagado e nenhum link
 * sai do ar (billing.md "Degradação, não desligamento").
 */
export async function cancelar(
	teacherId: string,
	opcoes: { noFimDoPeriodo: boolean },
	ator: Ator,
	extra: { db?: Db; agora?: Date } = {}
) {
	const agora = extra.agora ?? new Date();
	const feito = await emTransacao(extra.db, async (tx) => {
		if (opcoes.noFimDoPeriodo) {
			await tx.teacher.update({ where: { id: teacherId }, data: { cancelAtPeriodEnd: true } });
		} else {
			await tx.teacher.update({
				where: { id: teacherId },
				data: { subscriptionStatus: 'canceled', currentPeriodEnd: agora, cancelAtPeriodEnd: false }
			});
		}
		await registrar(tx, {
			teacherId,
			actor: ator,
			type: opcoes.noFimDoPeriodo ? 'cancelamento_agendado' : 'cancelado',
			data: {}
		});
	});
	// Só o cancelamento que vale AGORA: o agendado não muda nada até o fim do período.
	if (!opcoes.noFimDoPeriodo && !extra.db && avisaProfessor(ator)) {
		await avisarPlano(teacherId, { evento: 'cancelado' });
	}
	return feito;
}

/** Desfaz um cancelamento agendado. Plano já encerrado volta por `ativarPlano`. */
export async function reativar(teacherId: string, ator: Ator, extra: { db?: Db } = {}) {
	return emTransacao(extra.db, async (tx) => {
		await tx.teacher.update({ where: { id: teacherId }, data: { cancelAtPeriodEnd: false } });
		await registrar(tx, { teacherId, actor: ator, type: 'cancelamento_desfeito', data: {} });
	});
}

/**
 * Atende um pedido de plano: ativa o plano pedido e fecha o pedido, na mesma
 * transação. Pedido já atendido ou cancelado é recusado — o painel pode estar
 * desatualizado e dois cliques não podem ativar duas vezes.
 */
export async function atenderPedido(
	pedidoId: string,
	adminId: string,
	opcoes: { ate?: Date; agora?: Date } = {}
) {
	const agora = opcoes.agora ?? new Date();
	const ativado = await prisma.$transaction(async (tx) => {
		const { count } = await tx.planRequest.updateMany({
			where: { id: pedidoId, status: 'pendente' },
			data: { status: 'atendido', resolvedAt: agora, resolvedBy: adminId }
		});
		if (count === 0) throw new Error('Este pedido já foi resolvido.');
		const pedido = await tx.planRequest.findUniqueOrThrow({ where: { id: pedidoId } });
		// A linha é texto livre do banco: valida antes de virar plano de alguém.
		if (!ehPlanoPago(pedido.plano) || !ehCiclo(pedido.ciclo)) {
			throw new Error('O pedido tem um plano ou ciclo desconhecido.');
		}
		await ativarPlano(
			pedido.teacherId,
			{ plano: pedido.plano, ciclo: pedido.ciclo, ate: opcoes.ate },
			`admin:${adminId}`,
			{ db: tx, agora }
		);
		const depois = await tx.teacher.findUniqueOrThrow({
			where: { id: pedido.teacherId },
			select: { currentPeriodEnd: true }
		});
		return { teacherId: pedido.teacherId, plano: pedido.plano, ate: depois.currentPeriodEnd };
	});
	await avisarPlano(ativado.teacherId, {
		evento: 'ativado',
		plano: NOME_DO_PLANO[ativado.plano],
		ate: ativado.ate ?? undefined
	});
}
