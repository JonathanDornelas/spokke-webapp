import { z } from 'zod';
import { command, getRequestEvent } from '$app/server';
import { error } from '@sveltejs/kit';
import { requireTeacher } from '$lib/server/auth/guard';
import { atualizarCorrecao } from '$lib/server/notificacoes';
import { prisma } from '$lib/server/db/client';

/**
 * O retorno do professor sobre uma resposta.
 *
 * Não existe mais fila de correção à parte: comentar e corrigir acontecem em
 * cima da própria resposta, na tela de resultados (paginas.md "Resultados").
 * Uma fila separada obrigava o professor a decidir sem ver o resto da
 * tentativa — e as respostas que não eram por rubrica não tinham onde receber
 * um comentário.
 *
 * **Toda remote function é um endpoint HTTP público** (regra nº 3): começa
 * pelo guard, e o `teacherId` entra no `where` do próprio UPDATE — sem isso,
 * um `answerId` de outro professor seria aceito.
 */

const NOTAS = { fail: 0, partial: 0.5, pass: 1 } as const;

export const comentarResposta = command(
	z.object({
		answerId: z.string(),
		/** Vazio apaga o comentário — o professor pode se arrepender. */
		comment: z.string().max(2000).default(''),
		/**
		 * A nota da rubrica, quando ele dá uma. `null` explícito devolve a
		 * resposta à correção automática; ausente mantém a que já estava.
		 */
		grade: z.enum(['fail', 'partial', 'pass']).nullish()
	}),
	async ({ answerId, comment, grade }) => {
		const teacher = requireTeacher(getRequestEvent().locals);

		// `updateMany` com o escopo no `where` em vez de `update` por id: é o
		// filtro que impede um POST direto de comentar a resposta de outro
		// professor. Um `findFirst` antes seria uma checagem que a corrida entre
		// as duas consultas poderia furar.
		const { count } = await prisma.attemptItem.updateMany({
			where: {
				id: answerId,
				attempt: { publication: { activityVersion: { activity: { teacherId: teacher.id } } } }
			},
			data: {
				comment: comment.trim() || null,
				...(grade === undefined
					? {}
					: grade === null
						? { reviewedScore: null, reviewedAt: null }
						: { reviewedScore: NOTAS[grade], reviewedAt: new Date() })
			}
		});
		if (count === 0) error(404, 'Resposta não encontrada');

		if (grade !== undefined) {
			const resposta = await prisma.attemptItem.findFirst({
				where: {
					id: answerId,
					attempt: { publication: { activityVersion: { activity: { teacherId: teacher.id } } } }
				},
				select: {
					item: {
						select: {
							activityVersion: { select: { activity: { select: { id: true, title: true } } } }
						}
					}
				}
			});
			if (resposta) {
				await atualizarCorrecao(teacher.id, resposta.item.activityVersion.activity, {
					criar: false
				});
			}
		}

		return { ok: true };
	}
);

/**
 * Apagar uma tentativa. É como o direito de exclusão do aluno se exerce: o
 * pedido é dele, a ação é do professor (auth.md "Dados do aluno e LGPD").
 */
export const apagarTentativa = command(
	z.object({ attemptId: z.string() }),
	async ({ attemptId }) => {
		const teacher = requireTeacher(getRequestEvent().locals);
		const { count } = await prisma.attempt.deleteMany({
			where: {
				id: attemptId,
				publication: { activityVersion: { activity: { teacherId: teacher.id } } }
			}
		});
		if (count === 0) error(404, 'Tentativa não encontrada');
		return { ok: true };
	}
);
