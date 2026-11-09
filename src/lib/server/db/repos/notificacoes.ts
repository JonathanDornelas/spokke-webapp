import { prisma } from '$lib/server/db/client';
import {
	DADOS,
	ehTipo,
	textoDaNotificacao,
	type NotificacaoNaTela,
	type TipoDeNotificacao
} from '$lib/notificacoes';

type TeacherScope = { id: string };

/** Quantas o sino mostra de uma vez — é um resumo, não um arquivo. */
const NA_LISTA = 20;

/**
 * As notificações do professor da SESSÃO (regra nº 4: todo `where` leva o
 * `teacherId`). Devolve o texto pronto (`textoDaNotificacao`), nunca a linha do
 * banco; uma linha cujo `data` não valida mais é pulada em vez de quebrar o sino.
 */
export function notificacoes(teacher: TeacherScope) {
	return {
		async doSino(agora: Date = new Date()): Promise<{
			naoLidas: number;
			itens: NotificacaoNaTela[];
		}> {
			const [naoLidas, linhas] = await Promise.all([
				prisma.notification.count({ where: { teacherId: teacher.id, readAt: null } }),
				prisma.notification.findMany({
					where: { teacherId: teacher.id },
					// Não lidas primeiro; dentro de cada grupo, a mais recente.
					orderBy: [{ readAt: { sort: 'desc', nulls: 'first' } }, { updatedAt: 'desc' }],
					take: NA_LISTA
				})
			]);
			const itens: NotificacaoNaTela[] = [];
			for (const linha of linhas) {
				if (!ehTipo(linha.kind)) continue;
				const kind: TipoDeNotificacao = linha.kind;
				const data = DADOS[kind].safeParse(linha.data);
				if (!data.success) continue;
				const texto = textoDaNotificacao(
					{ kind, data: data.data, count: linha.count } as Parameters<typeof textoDaNotificacao>[0],
					agora
				);
				itens.push({
					id: linha.id,
					...texto,
					lida: linha.readAt !== null,
					quando: linha.updatedAt.toISOString()
				});
			}
			return { naoLidas, itens };
		},

		/** Marcar uma como lida. `false` quando não existe ou é de outro professor — sem distinguir. */
		async marcarLida(id: string): Promise<boolean> {
			const { count } = await prisma.notification.updateMany({
				where: { id, teacherId: teacher.id, readAt: null },
				data: { readAt: new Date() }
			});
			if (count > 0) return true;
			return (await prisma.notification.count({ where: { id, teacherId: teacher.id } })) > 0;
		},

		async marcarTodas(): Promise<number> {
			const { count } = await prisma.notification.updateMany({
				where: { teacherId: teacher.id, readAt: null },
				data: { readAt: new Date() }
			});
			return count;
		}
	};
}
