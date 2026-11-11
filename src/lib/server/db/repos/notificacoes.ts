import { prisma } from '$lib/server/db/client';
import { CHAVE } from '$lib/server/notificacoes';
import {
	DADOS,
	SECAO_DO_AVISO,
	ehTipo,
	textoDaNotificacao,
	type AlvoVisto,
	type NotificacaoNaTela,
	type SecaoDoStudio,
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
			/** O número de cada item da barra lateral: a soma das não lidas daquela seção. */
			porSecao: Record<SecaoDoStudio, number>;
			/** Quantos alunos terminaram cada atividade desde a última vez que ele viu — a lista de Resultados. */
			terminadasPorAtividade: Record<string, number>;
		}> {
			const [naoLidas, linhas, porTipo, terminadas] = await Promise.all([
				prisma.notification.count({ where: { teacherId: teacher.id, readAt: null } }),
				prisma.notification.findMany({
					where: { teacherId: teacher.id },
					// Não lidas primeiro; dentro de cada grupo, a mais recente.
					orderBy: [{ readAt: { sort: 'desc', nulls: 'first' } }, { updatedAt: 'desc' }],
					take: NA_LISTA
				}),
				prisma.notification.groupBy({
					by: ['kind'],
					where: { teacherId: teacher.id, readAt: null },
					_sum: { count: true }
				}),
				prisma.notification.findMany({
					where: { teacherId: teacher.id, kind: 'terminou', readAt: null },
					select: { data: true, count: true }
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

			const porSecao: Record<SecaoDoStudio, number> = {
				atividades: 0,
				turmas: 0,
				resultados: 0,
				escola: 0,
				assinatura: 0
			};
			for (const grupo of porTipo) {
				const secao = ehTipo(grupo.kind) ? SECAO_DO_AVISO[grupo.kind] : null;
				if (secao) porSecao[secao] += grupo._sum.count ?? 0;
			}

			const terminadasPorAtividade: Record<string, number> = {};
			for (const linha of terminadas) {
				const data = DADOS.terminou.safeParse(linha.data);
				if (!data.success) continue;
				const id = data.data.activityId;
				terminadasPorAtividade[id] = (terminadasPorAtividade[id] ?? 0) + linha.count;
			}
			return { naoLidas, itens, porSecao, terminadasPorAtividade };
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
		},

		/**
		 * Abrir a tela de destino conta como VER o aviso (`AlvoVisto`): quem abriu os
		 * resultados da atividade já viu quem terminou. Só as do professor da
		 * sessão; devolve quantas marcou, para a tela só atualizar o sino quando
		 * mudou alguma coisa.
		 */
		async marcarVistas(alvo: AlvoVisto): Promise<number> {
			const onde =
				alvo.secao === 'resultados'
					? { key: CHAVE.terminou(alvo.activityId) }
					: alvo.secao === 'atividades'
						? { key: CHAVE.audio(alvo.activityId) }
						: alvo.secao === 'turmas'
							? { key: CHAVE.alunoEntrou(alvo.classroomId) }
							: alvo.secao === 'escola'
								? { kind: 'escola' }
								: { kind: { in: ['plano', 'trial-acabando'] } };
			const { count } = await prisma.notification.updateMany({
				where: { teacherId: teacher.id, readAt: null, ...onde },
				data: { readAt: new Date() }
			});
			return count;
		}
	};
}
