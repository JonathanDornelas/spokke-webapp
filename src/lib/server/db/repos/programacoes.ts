import { prisma } from '$lib/server/db/client';
import { corOuPadrao } from '$lib/etiquetas';
import { lerProgramacao } from '$lib/modulos/programacao';

type TeacherScope = { id: string };

/** Os estados de um envio programado (`ModuleSend.status`). */
export type EstadoDoEnvio = 'programada' | 'enviada' | 'nao_saiu' | 'pulada';
export type MotivoGravado = 'rascunho' | 'arquivada' | 'audio';

function estadoOuProgramada(s: string): EstadoDoEnvio {
	return s === 'enviada' || s === 'nao_saiu' || s === 'pulada' ? s : 'programada';
}
function motivoOuNulo(s: string | null): MotivoGravado | null {
	return s === 'rascunho' || s === 'arquivada' || s === 'audio' ? s : null;
}

const TURMA = {
	select: {
		id: true,
		name: true,
		color: true,
		_count: { select: { students: true } },
		students: { where: { email: { not: null } }, select: { id: true } }
	}
} as const;

/**
 * As TURMAS ALOCADAS aos módulos e a programação de envio de cada uma
 * (docs/telas-modulos-professor.md 2.3 e 2.4). Escopado pelo DONO DO MÓDULO:
 * `ModuleClassroom` não tem `teacherId`, então todo `where` passa por
 * `module: { teacherId }` (auth.md "Isolamento entre professores").
 *
 * **Alocar confere as DUAS pontas** (db.md "Repositórios"): o módulo e a turma
 * têm de ser do professor. Conferir só o módulo deixaria um POST direto pôr a
 * turma de outra pessoa na própria programação — e mandar e-mail aos alunos
 * dela.
 */
export function programacoes(teacher: TeacherScope) {
	const doProfessor = { module: { teacherId: teacher.id } };

	const dto = <
		T extends {
			id: string;
			schedule: unknown;
			pausedAt: Date | null;
			createdAt: Date;
			classroom: {
				id: string;
				name: string;
				color: string;
				_count: { students: number };
				students: { id: string }[];
			};
			sends: {
				activityId: string;
				status: string;
				dueAt: Date;
				reason: string | null;
				sentAt: Date | null;
				emails: number | null;
				updatedAt: Date;
			}[];
		}
	>(
		a: T
	) => ({
		id: a.id,
		programacao: lerProgramacao(a.schedule),
		pausedAt: a.pausedAt,
		createdAt: a.createdAt,
		turma: {
			id: a.classroom.id,
			name: a.classroom.name,
			color: corOuPadrao(a.classroom.color),
			alunos: a.classroom._count.students,
			comEmail: a.classroom.students.length
		},
		envios: a.sends.map((s) => ({
			activityId: s.activityId,
			status: estadoOuProgramada(s.status),
			dueAt: s.dueAt,
			reason: motivoOuNulo(s.reason),
			sentAt: s.sentAt,
			emails: s.emails,
			updatedAt: s.updatedAt
		}))
	});

	const SENDS = {
		orderBy: { dueAt: 'asc' as const },
		select: {
			activityId: true,
			status: true,
			dueAt: true,
			reason: true,
			sentAt: true,
			emails: true,
			updatedAt: true
		}
	};

	return {
		/** As turmas de UM módulo, cada uma com a programação e os envios. */
		async doModulo(moduleId: string) {
			const linhas = await prisma.moduleClassroom.findMany({
				where: { moduleId, ...doProfessor },
				orderBy: { createdAt: 'asc' },
				include: { classroom: TURMA, sends: SENDS }
			});
			return linhas.map(dto);
		},

		/** Os módulos de UMA turma — o bloco "Módulos desta turma". */
		async daTurma(classroomId: string) {
			const linhas = await prisma.moduleClassroom.findMany({
				where: { classroomId, ...doProfessor },
				orderBy: { createdAt: 'asc' },
				include: {
					classroom: TURMA,
					sends: SENDS,
					module: {
						select: {
							id: true,
							name: true,
							color: true,
							activities: {
								orderBy: { position: 'asc' },
								select: { activity: { select: { id: true, title: true } } }
							}
						}
					}
				}
			});
			return linhas.map((l) => ({
				...dto(l),
				modulo: {
					id: l.module.id,
					name: l.module.name,
					color: corOuPadrao(l.module.color),
					atividades: l.module.activities.map((x) => x.activity)
				}
			}));
		},

		/** Todas as alocações do professor — a listagem de módulos e o selo da barra lateral. */
		async todas() {
			const linhas = await prisma.moduleClassroom.findMany({
				where: doProfessor,
				orderBy: { createdAt: 'asc' },
				include: { classroom: TURMA, sends: SENDS }
			});
			return linhas.map((l) => ({ ...dto(l), moduleId: l.moduleId }));
		},

		/** Quantas alocações têm um envio que não saiu — o número em vermelho do menu. */
		comFalha() {
			return prisma.moduleClassroom.count({
				where: { ...doProfessor, sends: { some: { status: 'nao_saiu' } } }
			});
		},

		/** As turmas do professor que ainda não estão neste módulo. */
		async livres(moduleId: string) {
			const linhas = await prisma.classroom.findMany({
				where: { teacherId: teacher.id, modulos: { none: { moduleId } } },
				orderBy: { name: 'asc' },
				select: {
					id: true,
					name: true,
					color: true,
					languageTag: true,
					_count: { select: { students: true } }
				}
			});
			// O tamanho e o idioma de cada turma: é o que o professor confere antes
			// de pôr o módulo nela (a bandeja "Adicionar turmas").
			return linhas.map(({ _count, languageTag, ...t }) => ({
				...t,
				color: corOuPadrao(t.color),
				idioma: languageTag,
				alunos: _count.students
			}));
		},

		/** Aloca turmas ao módulo. Devolve quantas entraram, ou `null` se o módulo não é do professor. */
		async alocar(moduleId: string, classroomIds: string[]): Promise<number | null> {
			const modulo = await prisma.module.findFirst({
				where: { id: moduleId, teacherId: teacher.id },
				select: { id: true }
			});
			if (!modulo) return null;
			const minhas = await prisma.classroom.findMany({
				where: { id: { in: classroomIds }, teacherId: teacher.id },
				select: { id: true }
			});
			if (minhas.length === 0) return 0;
			const { count } = await prisma.moduleClassroom.createMany({
				data: minhas.map((t) => ({ moduleId, classroomId: t.id })),
				skipDuplicates: true
			});
			return count;
		},

		/**
		 * Tira a turma do módulo. Os envios FUTUROS somem com a linha (Cascade em
		 * `ModuleSend`); o que já saiu continua valendo, porque o link é da
		 * atividade (`Delivery` não depende da alocação).
		 */
		async desalocar(allocationId: string): Promise<boolean> {
			const { count } = await prisma.moduleClassroom.deleteMany({
				where: { id: allocationId, ...doProfessor }
			});
			return count > 0;
		},

		/** Uma alocação do professor, ou `null`. */
		existe(allocationId: string) {
			return prisma.moduleClassroom.findFirst({
				where: { id: allocationId, ...doProfessor },
				select: { id: true, moduleId: true, classroomId: true, schedule: true, pausedAt: true }
			});
		},

		/**
		 * Os envios que JÁ SAÍRAM do módulo, uma linha por atividade por turma, com
		 * e-mails, quem abriu e quem terminou — o bloco "Envios" do detalhe.
		 * "Terminou" é tentativa terminada do aluno CONVIDADO naquela publicação.
		 */
		async historico(moduleId: string, limite = 20) {
			const entregas = await prisma.delivery.findMany({
				where: { moduleId, module: { teacherId: teacher.id } },
				orderBy: { createdAt: 'desc' },
				take: limite,
				select: {
					id: true,
					createdAt: true,
					porEmail: true,
					publicationId: true,
					classroom: { select: { id: true, name: true, color: true } },
					publication: {
						select: {
							activityVersion: { select: { activity: { select: { id: true, title: true } } } }
						}
					},
					invites: {
						select: { openedAt: true, studentId: true, student: { select: { email: true } } }
					}
				}
			});
			const terminadas = await prisma.attempt.findMany({
				where: {
					finishedAt: { not: null },
					publicationId: { in: entregas.map((e) => e.publicationId) },
					studentId: { in: entregas.flatMap((e) => e.invites.map((i) => i.studentId)) }
				},
				select: { publicationId: true, studentId: true }
			});
			const terminou = new Set(terminadas.map((t) => `${t.publicationId}:${t.studentId}`));
			return entregas.map((e) => ({
				id: e.id,
				quando: e.createdAt,
				turma: { ...e.classroom, color: corOuPadrao(e.classroom.color) },
				atividade: e.publication.activityVersion.activity,
				// Sem e-mail ("só disponibilizar"), nenhum saiu — contar os endereços mentiria.
				porEmail: e.porEmail,
				emails: e.porEmail ? e.invites.filter((i) => i.student.email).length : 0,
				convites: e.invites.length,
				abriram: e.invites.filter((i) => i.openedAt).length,
				terminaram: e.invites.filter((i) => terminou.has(`${e.publicationId}:${i.studentId}`))
					.length
			}));
		},

		/**
		 * Todos os envios de módulo do professor (menos os pulados), do mais cedo ao
		 * mais tarde — a matéria da AGENDA: calendário e "próximos 7 dias"
		 * (`$lib/server/modulos/agenda.ts`). `moduleId` restringe a um módulo.
		 * Dentro do mesmo instante, a ordem é a do módulo, que é a do e-mail.
		 */
		async agenda(filtro: { moduleId?: string } = {}) {
			const escopo = { ...doProfessor, ...(filtro.moduleId ? { moduleId: filtro.moduleId } : {}) };
			const [linhas, posicoes] = await Promise.all([
				prisma.moduleSend.findMany({
					where: { status: { not: 'pulada' }, allocation: escopo },
					orderBy: { dueAt: 'asc' },
					select: {
						allocationId: true,
						status: true,
						dueAt: true,
						sentAt: true,
						reason: true,
						emails: true,
						allocation: {
							select: {
								moduleId: true,
								pausedAt: true,
								schedule: true,
								module: { select: { id: true, name: true, color: true } },
								classroom: TURMA
							}
						},
						activity: {
							select: {
								id: true,
								title: true,
								archivedAt: true,
								versions: { select: { publications: { select: { id: true }, take: 1 } } }
							}
						}
					}
				}),
				prisma.moduleActivity.findMany({
					where: { module: { teacherId: teacher.id } },
					select: { moduleId: true, activityId: true, position: true }
				})
			]);
			const posicao = new Map(posicoes.map((p) => [`${p.moduleId}:${p.activityId}`, p.position]));
			const ordem = (l: (typeof linhas)[number]) =>
				posicao.get(`${l.allocation.moduleId}:${l.activity.id}`) ?? Number.MAX_SAFE_INTEGER;
			return linhas
				.map((l) => ({
					allocationId: l.allocationId,
					status: estadoOuProgramada(l.status),
					dueAt: l.dueAt,
					sentAt: l.sentAt,
					reason: motivoOuNulo(l.reason),
					emails: l.emails,
					pausada: l.allocation.pausedAt !== null,
					porEmail: (lerProgramacao(l.allocation.schedule)?.canal ?? 'email') === 'email',
					modulo: {
						id: l.allocation.module.id,
						name: l.allocation.module.name,
						color: corOuPadrao(l.allocation.module.color)
					},
					turma: {
						id: l.allocation.classroom.id,
						name: l.allocation.classroom.name,
						color: corOuPadrao(l.allocation.classroom.color),
						comEmail: l.allocation.classroom.students.length
					},
					atividade: {
						id: l.activity.id,
						title: l.activity.title,
						noAr:
							!l.activity.archivedAt && l.activity.versions.some((v) => v.publications.length > 0),
						arquivada: l.activity.archivedAt !== null
					},
					posicao: ordem(l)
				}))
				.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime() || a.posicao - b.posicao);
		},

		/** As programações PAUSADAS — o "fora do calendário". */
		async pausadas() {
			const linhas = await prisma.moduleClassroom.findMany({
				where: { ...doProfessor, pausedAt: { not: null } },
				orderBy: { pausedAt: 'asc' },
				select: {
					id: true,
					pausedAt: true,
					module: { select: { id: true, name: true } },
					classroom: { select: { id: true, name: true } }
				}
			});
			return linhas.map((l) => ({
				alocacaoId: l.id,
				desde: l.pausedAt as Date,
				modulo: l.module,
				turma: l.classroom
			}));
		},

		/**
		 * Para cada (módulo, turma), o ÚLTIMO envio do módulo que saiu e quantos dos
		 * convidados terminaram — o "68% na última" da lista de módulos. "Terminou"
		 * é tentativa terminada do aluno convidado naquela publicação.
		 */
		async ultimoEnvioPorTurma(): Promise<Record<string, { convites: number; terminaram: number }>> {
			const entregas = await prisma.delivery.findMany({
				where: { moduleId: { not: null }, module: { teacherId: teacher.id } },
				orderBy: { createdAt: 'desc' },
				distinct: ['moduleId', 'classroomId'],
				select: {
					moduleId: true,
					classroomId: true,
					publicationId: true,
					invites: { select: { studentId: true } }
				}
			});
			if (entregas.length === 0) return {};
			const terminadas = await prisma.attempt.findMany({
				where: {
					finishedAt: { not: null },
					publicationId: { in: entregas.map((e) => e.publicationId) },
					studentId: { in: entregas.flatMap((e) => e.invites.map((i) => i.studentId)) }
				},
				select: { publicationId: true, studentId: true }
			});
			const terminou = new Set(terminadas.map((t) => `${t.publicationId}:${t.studentId}`));
			const resultado: Record<string, { convites: number; terminaram: number }> = {};
			for (const e of entregas) {
				resultado[`${e.moduleId}:${e.classroomId}`] = {
					convites: e.invites.length,
					terminaram: e.invites.filter((i) => terminou.has(`${e.publicationId}:${i.studentId}`))
						.length
				};
			}
			return resultado;
		},

		/**
		 * Os e-mails PROGRAMADOS por dia, por alocação — a prévia soma os das outras
		 * programações para avisar quando um dia passa do teto de 100 do Resend.
		 * O dia é o de Brasília, a mesma régua da agenda.
		 */
		async cargaPorDia(): Promise<Record<string, Record<string, number>>> {
			const linhas = await prisma.moduleSend.findMany({
				where: { status: 'programada', allocation: { ...doProfessor, pausedAt: null } },
				select: {
					allocationId: true,
					dueAt: true,
					allocation: {
						select: {
							schedule: true,
							classroom: {
								select: { students: { where: { email: { not: null } }, select: { id: true } } }
							}
						}
					}
				}
			});
			const dia = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' });
			const carga: Record<string, Record<string, number>> = {};
			const vistos = new Set<string>();
			for (const l of linhas) {
				// "Só disponibilizar" não manda e-mail: não pesa no teto do dia.
				if (lerProgramacao(l.allocation.schedule)?.canal === 'mapa') continue;
				const d = dia.format(l.dueAt);
				// Um e-mail por aluno POR DATA: duas atividades no mesmo dia são um e-mail só.
				const chave = `${l.allocationId}:${d}`;
				if (vistos.has(chave)) continue;
				vistos.add(chave);
				carga[l.allocationId] ??= {};
				carga[l.allocationId][d] = l.allocation.classroom.students.length;
			}
			return carga;
		}
	};
}
