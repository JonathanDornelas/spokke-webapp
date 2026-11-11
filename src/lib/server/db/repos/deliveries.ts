import { prisma } from '$lib/server/db/client';

/** Só o id importa para escopar — ver a nota em `activities.ts`. */
type TeacherScope = { id: string };

/**
 * O token do link pessoal. É a IDENTIDADE do aluno no Player — não existe
 * senha, e o e-mail é o canal, não a credencial. Por isso ele precisa ser
 * imprevisível: `crypto.randomUUID()` sem os hífens, em três grupos, para
 * caber legível no corpo do e-mail (`spokke.com.br/e/8fk2-jp7q-...`).
 */
export function gerarTokenConvite(): string {
	const bruto = crypto.randomUUID().replace(/-/g, '');
	return `${bruto.slice(0, 4)}-${bruto.slice(4, 8)}-${bruto.slice(8, 20)}`;
}

/**
 * O que um convite RENOVADO precisa carregar para o e-mail sair de novo: o
 * aluno, a turma e a publicação com a atividade e a contagem de itens. É o
 * mesmo material de `enviarParaTurmas`, lido de volta pelo convite — renovar
 * o token sem mandar o e-mail deixava o link antigo morto e o novo em lugar
 * nenhum.
 */
const PARA_REENVIO = {
	student: true,
	delivery: {
		include: {
			classroom: { select: { name: true } },
			publication: {
				include: {
					activityVersion: {
						include: {
							activity: { select: { id: true, title: true, targetLang: true } },
							_count: { select: { items: true } }
						}
					}
				}
			}
		}
	}
} as const;

/**
 * Envios: mandar uma publicação para uma turma gera um convite por aluno COM
 * e-mail. Aluno sem e-mail continua na turma e simplesmente não recebe — ele
 * entra pelo link aberto como qualquer um.
 */
export function envios(teacher: TeacherScope) {
	return {
		/**
		 * Cria o envio e os convites. Devolve os convites com o aluno junto,
		 * porque quem chama precisa deles para enfileirar o e-mail.
		 */
		async create(
			publicationId: string,
			classroomId: string,
			/**
			 * Envio de MÓDULO: o mesmo `envioId` agrupa as atividades de um clique só.
			 * `porEmail: false` é o "só disponibilizar": ninguém é avisado, e por isso o
			 * convite vai para TODOS os alunos — é ele que abre a fase no mapa de quem
			 * tem conta, e aqui o e-mail não é o canal.
			 */
			modulo?: { envioId: string; moduleId: string; porEmail?: boolean }
		) {
			const porEmail = modulo?.porEmail ?? true;
			// A publicação também tem de ser DESTE professor — conferir só a turma
			// deixaria um POST direto mandar o link da atividade de outra pessoa
			// para a própria turma (auth.md "Isolamento entre professores").
			const publicacao = await prisma.publication.findFirst({
				where: { id: publicationId, activityVersion: { activity: { teacherId: teacher.id } } },
				select: { id: true }
			});
			if (!publicacao) return null;
			const turma = await prisma.classroom.findFirst({
				where: { id: classroomId, teacherId: teacher.id },
				include: {
					students: { where: porEmail ? { email: { not: null } } : {}, select: { id: true } }
				}
			});
			if (!turma) return null;
			if (turma.students.length === 0) return { delivery: null, invites: [] };

			const delivery = await prisma.delivery.create({
				data: {
					publicationId,
					classroomId,
					envioId: modulo?.envioId ?? null,
					moduleId: modulo?.moduleId ?? null,
					porEmail,
					invites: {
						create: turma.students.map((aluno) => ({
							studentId: aluno.id,
							token: gerarTokenConvite()
						}))
					}
				},
				include: { invites: { include: { student: true } } }
			});
			return { delivery, invites: delivery.invites };
		},

		/**
		 * A atividade por trás de um envio (ou de um convite) está arquivada?
		 * Reenviar convite de atividade arquivada seria mandar a turma para um
		 * link fechado — e renovar o token antes de saber disso invalidaria o
		 * convite antigo à toa. Nulo quando não existe ou não é deste professor.
		 */
		async arquivado(ref: { deliveryId: string } | { inviteId: string }): Promise<boolean | null> {
			const delivery = await prisma.delivery.findFirst({
				where:
					'deliveryId' in ref
						? { id: ref.deliveryId, classroom: { teacherId: teacher.id } }
						: { invites: { some: { id: ref.inviteId } }, classroom: { teacherId: teacher.id } },
				select: {
					publication: {
						select: { activityVersion: { select: { activity: { select: { archivedAt: true } } } } }
					}
				}
			});
			return delivery ? delivery.publication.activityVersion.activity.archivedAt !== null : null;
		},

		/**
		 * Reenvio: novos tokens para quem ainda não abriu. O token antigo para
		 * de valer — se o e-mail vazou por engano, reenviar também revoga.
		 */
		async renewUnopened(deliveryId: string) {
			const delivery = await prisma.delivery.findFirst({
				where: { id: deliveryId, classroom: { teacherId: teacher.id } },
				include: { invites: { where: { openedAt: null }, include: { student: true } } }
			});
			if (!delivery) return [];

			const renovados = [];
			for (const convite of delivery.invites) {
				const atualizado = await prisma.invite.update({
					where: { id: convite.id },
					data: { token: gerarTokenConvite(), sentAt: null, bouncedAt: null },
					include: PARA_REENVIO
				});
				renovados.push(atualizado);
			}
			return renovados;
		},

		/** Um convite específico, para o "corrigir e-mail e reenviar". */
		async renewOne(inviteId: string) {
			const convite = await prisma.invite.findFirst({
				where: { id: inviteId, student: { teacherId: teacher.id } },
				select: { id: true }
			});
			if (!convite) return null;
			return prisma.invite.update({
				where: { id: inviteId },
				data: { token: gerarTokenConvite(), sentAt: null, bouncedAt: null },
				include: PARA_REENVIO
			});
		},

		markSent(inviteIds: string[]) {
			return prisma.invite.updateMany({
				where: { id: { in: inviteIds } },
				data: { sentAt: new Date() }
			});
		},

		/**
		 * Para quais turmas ESTA atividade já foi. O escopo é duplo de propósito:
		 * a turma é do professor E a publicação é de uma versão desta atividade —
		 * a segunda condição é o filtro, a primeira é a regra nº 4.
		 *
		 * Traz os convites e as tentativas da publicação porque a tela conta
		 * quantos abriram e quantos terminaram; somar aqui, no banco, exigiria
		 * um `groupBy` por envio que não cabe numa consulta só.
		 */
		porAtividade(activityId: string) {
			return prisma.delivery.findMany({
				where: {
					classroom: { teacherId: teacher.id },
					publication: { activityVersion: { activityId } }
				},
				orderBy: { createdAt: 'desc' },
				include: {
					classroom: { select: { id: true, name: true, color: true } },
					invites: { select: { studentId: true, openedAt: true, bouncedAt: true } },
					publication: {
						select: { attempts: { select: { studentId: true, finishedAt: true } } }
					}
				}
			});
		}
	};
}

/**
 * Resolução do link pessoal — SEM professor, como todo o Player. Devolve só o
 * que a entrada precisa: quem é o aluno e para qual publicação.
 */
export const convitePorToken = {
	async resolve(token: string) {
		return prisma.invite.findUnique({
			where: { token },
			include: {
				student: { select: { id: true, name: true } },
				delivery: {
					include: {
						publication: {
							select: {
								id: true,
								slug: true,
								// Arquivada não marca abertura nem identifica ninguém — ver e/[token].
								activityVersion: { select: { activity: { select: { archivedAt: true } } } }
							}
						}
					}
				}
			}
		});
	},

	/** O aluno identificado pelo cookie do link pessoal — sem professor. */
	studentById(id: string) {
		return prisma.student.findUnique({ where: { id }, select: { id: true, name: true } });
	},

	markOpened(inviteId: string) {
		return prisma.invite.updateMany({
			where: { id: inviteId, openedAt: null },
			data: { openedAt: new Date() }
		});
	},

	/**
	 * Liga a tentativa ao aluno. É o que faz "responder sem conta" e "aparecer
	 * com o nome certo" conviverem: a tentativa já existe e continua valendo
	 * sozinha; identificar-se só acrescenta de quem ela é.
	 *
	 * **O nome do CADASTRO passa a valer.** Antes só o `studentId` era gravado,
	 * então a tentativa ficava ligada à Juliana e continuava listada como "ju"
	 * — que é exatamente o que o link pessoal existe para resolver. O que foi
	 * respondido não muda; muda de quem é e como aparece.
	 */
	async claimAttempts(studentId: string, name: string, publicationId: string, anonId: string) {
		const { count } = await prisma.attempt.updateMany({
			where: { publicationId, anonId, studentId: null },
			data: { studentId, name }
		});
		return count;
	}
};
