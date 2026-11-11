import { prisma, type Db } from '$lib/server/db/client';
import { uso } from '$lib/server/db/repos/uso';
import { creditos } from '$lib/server/db/repos/creditos';
import { escolaEmVigor } from '$lib/server/db/repos/escola-vigente';
import { rotuloDoPlano, type ResumoDoAcesso } from '$lib/billing/resumo';
import { inicioDoCiclo, proximoCiclo } from '$lib/billing/ciclo';
import { ehAdminDaPlataforma } from '$lib/server/auth/guard';
import {
	can,
	estadoDaEquipe,
	montarEstado,
	motivoDoBloqueio,
	type EstadoDeAcesso
} from './entitlements';

type TeacherScope = { id: string };

const DIA_MS = 24 * 60 * 60 * 1000;

/** O estado como a tela o recebe: DTO serializável, com as decisões já tomadas por `can()`. */
export function resumoDoAcesso(estado: EstadoDeAcesso, agora: Date = new Date()): ResumoDoAcesso {
	const diasDeTrial =
		estado.origem === 'trial' && estado.trialEndsAt
			? Math.max(0, Math.ceil((estado.trialEndsAt.getTime() - agora.getTime()) / DIA_MS))
			: null;
	return {
		plano: estado.plano,
		rotulo: rotuloDoPlano(estado.plano, estado.origem, estado.situacao),
		origem: estado.origem,
		situacao: estado.situacao,
		limites: estado.limites,
		uso: estado.uso,
		creditos: estado.creditos,
		trialEndsAt: estado.trialEndsAt,
		diasDeTrial,
		currentPeriodEnd: estado.currentPeriodEnd,
		cancelAtPeriodEnd: estado.cancelAtPeriodEnd,
		escola: estado.escola,
		pode: {
			publicar: can(estado, 'publicar_atividade'),
			criarAtividade: can(estado, 'criar_atividade'),
			criarMaterial: can(estado, 'criar_material'),
			usarIa: can(estado, 'usar_ia')
		},
		motivo: {
			publicar: motivoDoBloqueio(estado, 'publicar_atividade'),
			criarAtividade: motivoDoBloqueio(estado, 'criar_atividade'),
			criarMaterial: motivoDoBloqueio(estado, 'criar_material'),
			usarIa: motivoDoBloqueio(estado, 'usar_ia')
		}
	};
}

/** O estado mais o início do ciclo de créditos — o que o débito precisa gravar no lançamento. */
export interface AcessoComCiclo {
	estado: EstadoDeAcesso;
	cicloInicio: Date;
}

/**
 * Monta o `EstadoDeAcesso` do professor a partir do banco: a linha de cobrança,
 * o quanto do estoque ele ocupa, o saldo de créditos e a escola em vigor. Quem
 * DECIDE com ele é `entitlements.ts` — aqui só se busca.
 *
 * Lê a linha do banco e não a da sessão: dentro da trava de cota
 * (`./cota.ts`) a leitura precisa ser da mesma transação, e fora dela uma
 * mudança feita pelo painel tem de valer no request seguinte.
 */
export async function acessoComCiclo(
	teacher: TeacherScope,
	db: Db = prisma,
	agora: Date = new Date()
): Promise<AcessoComCiclo> {
	const [linha, ocupado, escola] = await Promise.all([
		db.teacher.findUniqueOrThrow({
			where: { id: teacher.id },
			select: {
				plan: true,
				subscriptionStatus: true,
				trialEndsAt: true,
				currentPeriodEnd: true,
				gracePeriodEnd: true,
				cancelAtPeriodEnd: true,
				cycleAnchor: true,
				createdAt: true
			}
		}),
		uso(teacher, db).contar(),
		escolaEmVigor(teacher, db, agora)
	]);

	// A âncora do ciclo mensal de créditos: o dia em que o plano foi ativado —
	// ou em que o professor entrou na escola, quando é ela que vale.
	const ancora = escola?.desde ?? linha.cycleAnchor ?? linha.createdAt;
	const cicloInicio = inicioDoCiclo(ancora, agora);
	const lancado = await creditos(teacher, db).somaDoCiclo(cicloInicio);

	const montado = montarEstado(
		linha,
		{ uso: ocupado, creditos: { saldo: 0, renovamEm: null }, escola },
		agora
	);
	// Quem opera a plataforma tem o produto inteiro liberado (`estadoDaEquipe`).
	const esboco = ehAdminDaPlataforma(teacher.id) ? estadoDaEquipe(montado) : montado;
	const estado: EstadoDeAcesso = {
		...esboco,
		creditos: esboco.limites.ia
			? {
					saldo: Math.max(0, esboco.limites.creditosPorCiclo + lancado),
					renovamEm: proximoCiclo(ancora, agora)
				}
			: { saldo: 0, renovamEm: null }
	};
	return { estado, cicloInicio };
}

export async function acessoDoProfessor(
	teacher: TeacherScope,
	db: Db = prisma,
	agora: Date = new Date()
): Promise<EstadoDeAcesso> {
	return (await acessoComCiclo(teacher, db, agora)).estado;
}
