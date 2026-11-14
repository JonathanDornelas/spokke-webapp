import { prisma, type Db } from '$lib/server/db/client';
import type { Uso } from '$lib/server/billing/entitlements';

type TeacherScope = { id: string };

/**
 * Quanto do estoque do plano o professor ocupa AGORA — os limites são de
 * estoque (docs/adr-002-billing.md). Escopado por `teacherId`, como todo
 * repositório (auth.md "Isolamento entre professores").
 *
 * Aceita a transação (`db`) porque é lido DENTRO da trava de cota
 * (`$lib/server/billing/cota.ts`): contar fora dela deixaria duas criações
 * simultâneas verem a mesma vaga livre.
 */
export function uso(teacher: TeacherScope, db: Db = prisma) {
	return {
		async contar(): Promise<Uso> {
			const [atividades, materiais] = await Promise.all([
				// Arquivada não ocupa vaga — arquivar é justamente como o professor
				// libera espaço sem perder os resultados.
				db.activity.count({ where: { teacherId: teacher.id, archivedAt: null } }),
				// O material arquivado também não ocupa vaga: a mesma regra da atividade.
				db.contentUnit.count({ where: { teacherId: teacher.id, archivedAt: null } })
			]);
			return { atividades, materiais };
		}
	};
}
