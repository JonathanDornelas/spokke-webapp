import type { Prisma } from '../../../../../generated/prisma/client.ts';
import { prisma } from '../client';

/**
 * Os relatos de problema (`ProblemReport`). Como o resto do Player, sem
 * professor e com superfície mínima: quem ESCREVE é o relato do aluno (a
 * tentativa é a prova de onde ele veio) e o worker, a pedido da intranet. Quem
 * LÊ é a intranet, pelo papel de leitura dela — nenhuma tela do Spokke mostra
 * relato, nem ao professor.
 */
export const relatosRepo = {
	criar(dados: Prisma.ProblemReportUncheckedCreateInput) {
		return prisma.problemReport.create({ data: dados, select: { id: true } });
	},

	/** Quantos relatos esta tentativa já mandou — o teto por tentativa. */
	contarDaTentativa(attemptId: string) {
		return prisma.problemReport.count({ where: { attemptId } });
	},

	/** Quando saiu o último relato desta questão nesta tentativa (o clique duplo). */
	async ultimoDaQuestao(attemptId: string, itemId: string): Promise<Date | null> {
		const ultimo = await prisma.problemReport.findFirst({
			where: { attemptId, itemId },
			orderBy: { createdAt: 'desc' },
			select: { createdAt: true }
		});
		return ultimo?.createdAt ?? null;
	},

	/**
	 * Muda o estado de um relato. É a ação da intranet, aplicada pelo worker (job
	 * `intranet`, `marcar-relato`): a intranet não escreve no banco do Spokke.
	 * Devolve se achou o relato.
	 */
	async marcar(
		id: string,
		status: 'aberto' | 'resolvido' | 'descartado',
		por: string,
		agora: Date = new Date()
	): Promise<boolean> {
		const { count } = await prisma.problemReport.updateMany({
			where: { id },
			data:
				status === 'aberto'
					? { status, resolvedAt: null, resolvedBy: null }
					: { status, resolvedAt: agora, resolvedBy: por }
		});
		return count > 0;
	},

	/** Apaga os relatos de antes de `antesDe` — a retenção (`server/relatos/retencao.ts`). */
	async purgarAntigos(antesDe: Date): Promise<number> {
		const { count } = await prisma.problemReport.deleteMany({
			where: { createdAt: { lt: antesDe } }
		});
		return count;
	}
};
