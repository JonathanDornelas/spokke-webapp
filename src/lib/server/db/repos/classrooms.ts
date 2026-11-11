import { prisma } from '$lib/server/db/client';

/** Só o id importa para escopar — ver a nota em `activities.ts`. */
type TeacherScope = { id: string };

export interface AlunoEntrada {
	name: string;
	email: string | null;
}

/**
 * Turmas e alunos, escopados por `teacherId` como todo repositório
 * (auth.md "Isolamento entre professores").
 *
 * **Aluno é cadastro, não conta.** Ele não tem senha e nunca faz login: a
 * identidade dele no Player é o token do convite. O mesmo e-mail pode aparecer
 * em duas turmas — são dois cadastros, e é o certo: um aluno que faz dois
 * cursos com o mesmo professor está em duas listas de chamada.
 */
export function turmas(teacher: TeacherScope) {
	return {
		/** A lista, com o que a tela mostra: alunos, quantos com e-mail, envios. */
		async list() {
			const linhas = await prisma.classroom.findMany({
				where: { teacherId: teacher.id },
				orderBy: { createdAt: 'desc' },
				include: {
					students: {
						select: {
							id: true,
							name: true,
							email: true,
							accountId: true,
							// O ÚLTIMO convite diz se o e-mail voltou — a mesma régua da chamada.
							invites: { orderBy: { createdAt: 'desc' }, take: 1, select: { bouncedAt: true } }
						},
						orderBy: { name: 'asc' }
					},
					deliveries: { select: { id: true, createdAt: true }, orderBy: { createdAt: 'desc' } }
				}
			});

			return linhas.map((turma) => ({
				id: turma.id,
				name: turma.name,
				languageTag: turma.languageTag,
				color: turma.color,
				createdAt: turma.createdAt,
				students: turma.students.length,
				// É este o número que recebe convite — e por isso ele aparece
				// antes de qualquer botão de enviar.
				withEmail: turma.students.filter((a) => a.email).length,
				/** Quem já ligou a ficha a uma conta de aluno (vê o mapa dos módulos). */
				withAccount: turma.students.filter((a) => a.accountId).length,
				/** Alunos cujo último convite voltou — o único estado que pede ação. */
				bounced: turma.students.filter((a) => a.invites[0]?.bouncedAt).length,
				/** Os nomes, para a busca da lista achar "em que turma está a Juliana". */
				studentNames: turma.students.map((a) => a.name),
				deliveries: turma.deliveries.length,
				lastDeliveryAt: turma.deliveries[0]?.createdAt ?? null
			}));
		},

		byId(id: string) {
			return prisma.classroom.findFirst({ where: { id, teacherId: teacher.id } });
		},

		/**
		 * A turma inteira para a tela de detalhe: alunos, o último envio de cada
		 * um e o histórico. `null` tanto quando não existe quanto quando é de
		 * outro professor — não distinga (auth.md).
		 */
		async detail(id: string) {
			const turma = await prisma.classroom.findFirst({
				where: { id, teacherId: teacher.id },
				include: {
					students: {
						orderBy: { createdAt: 'asc' },
						include: {
							invites: {
								orderBy: { createdAt: 'desc' },
								take: 1,
								include: {
									delivery: {
										include: {
											publication: {
												include: {
													activityVersion: { include: { activity: { select: { title: true } } } }
												}
											}
										}
									}
								}
							},
							attempts: { select: { id: true, finishedAt: true, publicationId: true } },
							account: { select: { id: true, name: true, avatar: true } }
						}
					},
					deliveries: {
						orderBy: { createdAt: 'desc' },
						include: {
							invites: { select: { id: true, openedAt: true, studentId: true } },
							// Envio de módulo: o histórico diz de que módulo a atividade veio.
							module: { select: { name: true } },
							publication: {
								include: {
									activityVersion: { include: { activity: { select: { id: true, title: true } } } },
									attempts: { select: { studentId: true, finishedAt: true } }
								}
							}
						}
					}
				}
			});
			return turma;
		},

		async create(name: string, languageTag: string | null, color: string, alunos: AlunoEntrada[]) {
			return prisma.classroom.create({
				data: {
					name,
					languageTag,
					color,
					teacherId: teacher.id,
					students: {
						create: alunos.map((aluno) => ({
							name: aluno.name,
							email: aluno.email,
							teacherId: teacher.id
						}))
					}
				},
				include: { students: true }
			});
		},

		async update(id: string, dados: { name: string; languageTag: string | null; color: string }) {
			const { count } = await prisma.classroom.updateMany({
				where: { id, teacherId: teacher.id },
				data: dados
			});
			return count > 0;
		},

		/**
		 * Apagar a turma leva junto os cadastros e as respostas DELES — a tela
		 * diz isso em texto antes. A cascata é do banco: `Student` cai com a
		 * turma, e `Attempt.studentId` é `SetNull`, então a tentativa feita pelo
		 * link ABERTO por outra pessoa continua intacta.
		 */
		async remove(id: string): Promise<boolean> {
			const turma = await this.byId(id);
			if (!turma) return false;

			await prisma.$transaction(async (tx) => {
				const alunos = await tx.student.findMany({
					where: { classroomId: id },
					select: { id: true }
				});
				const ids = alunos.map((a) => a.id);
				if (ids.length > 0) {
					// As respostas do aluno cadastrado somem com ele; as anônimas
					// não têm `studentId` e nem são tocadas.
					await tx.attempt.deleteMany({ where: { studentId: { in: ids } } });
				}
				await tx.classroom.delete({ where: { id } });
			});
			return true;
		}
	};
}

/** Alunos de uma turma. Escopado pelo professor em toda operação. */
export function alunos(teacher: TeacherScope) {
	return {
		async add(classroomId: string, entrada: AlunoEntrada) {
			const turma = await prisma.classroom.findFirst({
				where: { id: classroomId, teacherId: teacher.id },
				select: { id: true }
			});
			if (!turma) return null;
			return prisma.student.create({
				data: {
					name: entrada.name,
					email: entrada.email,
					classroomId,
					teacherId: teacher.id
				}
			});
		},

		async addMany(classroomId: string, entradas: AlunoEntrada[]) {
			const turma = await prisma.classroom.findFirst({
				where: { id: classroomId, teacherId: teacher.id },
				select: { id: true }
			});
			if (!turma) return 0;
			const { count } = await prisma.student.createMany({
				data: entradas.map((entrada) => ({
					name: entrada.name,
					email: entrada.email,
					classroomId,
					teacherId: teacher.id
				}))
			});
			return count;
		},

		/**
		 * Trocar o e-mail de quem já recebeu o convite de CONTA por e-mail invalida
		 * aquele link: se o endereço estava errado, o convite foi parar na caixa de
		 * outra pessoa, e o token é o que liga uma conta à ficha (auth.md). Link
		 * que o professor copiou e nunca saiu por e-mail continua valendo.
		 */
		async update(id: string, entrada: AlunoEntrada): Promise<boolean> {
			const atual = await prisma.student.findFirst({
				where: { id, teacherId: teacher.id },
				select: { email: true, accountId: true, accountInviteSentAt: true }
			});
			if (!atual) return false;
			const conviteFoiParaOutroEndereco =
				!atual.accountId && !!atual.accountInviteSentAt && atual.email !== entrada.email;
			const { count } = await prisma.student.updateMany({
				where: { id, teacherId: teacher.id },
				data: {
					name: entrada.name,
					email: entrada.email,
					...(conviteFoiParaOutroEndereco
						? { accountInviteToken: null, accountInviteSentAt: null }
						: {})
				}
			});
			return count > 0;
		},

		/**
		 * O aluno com o histórico dele: toda tentativa que está LIGADA a este
		 * cadastro, com a atividade e as respostas item a item.
		 *
		 * Só as ligadas. As que ele fez pelo link aberto sem nunca abrir o link
		 * pessoal têm `studentId` nulo e não têm como ser atribuídas — a tela
		 * diz isso em vez de fingir um histórico completo.
		 */
		async historico(id: string) {
			return prisma.student.findFirst({
				where: { id, teacherId: teacher.id },
				include: {
					classroom: { select: { id: true, name: true, color: true } },
					account: { select: { name: true, email: true, avatar: true } },
					// O convite mais recente: é o que "Reenviar convite" renova, e o que
					// diz se o último e-mail voltou.
					invites: {
						orderBy: { createdAt: 'desc' },
						take: 1,
						select: { id: true, bouncedAt: true, openedAt: true }
					},
					attempts: {
						orderBy: { startedAt: 'desc' },
						include: {
							items: { select: { score: true } },
							publication: {
								select: {
									activityVersion: {
										select: {
											_count: { select: { items: true } },
											activity: { select: { id: true, title: true, targetLang: true } }
										}
									}
								}
							}
						}
					}
				}
			});
		},

		/** Apaga o cadastro e as respostas dele — direito de exclusão do aluno. */
		async remove(id: string): Promise<boolean> {
			const aluno = await prisma.student.findFirst({
				where: { id, teacherId: teacher.id },
				select: { id: true }
			});
			if (!aluno) return false;
			await prisma.$transaction([
				prisma.attempt.deleteMany({ where: { studentId: id } }),
				prisma.student.delete({ where: { id } })
			]);
			return true;
		}
	};
}
