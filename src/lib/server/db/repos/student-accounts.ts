import { prisma } from '$lib/server/db/client';
import { notificar } from '$lib/server/notificacoes';

/** Só o id importa para escopar — mesma nota de `activities.ts`. */
type ContaAluno = { id: string };

/**
 * A conta do ALUNO. Escopo é sempre a própria conta: aqui não existe
 * "professor dono" — o dono é a pessoa logada, e nenhuma função deste
 * repositório aceita um id que não seja o dela.
 *
 * **A conta não muda o que o aluno pode fazer.** Ela guarda o histórico e o
 * reencontra em outro aparelho. Toda atividade continua respondível sem conta
 * nenhuma, e nenhuma função daqui é chamada no caminho de responder.
 */
export function contaAluno(conta: ContaAluno) {
	return {
		/**
		 * As fichas de chamada desta pessoa, com a turma e o professor. É o que
		 * responde "de quais turmas eu faço parte" na área do aluno.
		 */
		fichas() {
			return prisma.student.findMany({
				where: { accountId: conta.id },
				orderBy: { createdAt: 'desc' },
				include: {
					classroom: { select: { id: true, name: true, color: true } },
					teacher: { select: { name: true } }
				}
			});
		},

		/**
		 * O histórico dele. Junta os dois caminhos: o que ele respondeu LOGADO
		 * (`accountId`) e o que está ligado a uma ficha de chamada dele
		 * (`studentId`) — foi assim que ele respondeu antes de ter conta, pelo
		 * link pessoal. Sem o `OR`, criar a conta pareceria apagar o passado.
		 */
		historico() {
			return prisma.attempt.findMany({
				where: {
					OR: [{ accountId: conta.id }, { student: { accountId: conta.id } }]
				},
				orderBy: { startedAt: 'desc' },
				include: {
					// `ms` sustenta o tempo por atividade, e as três colunas JSON do
					// item sustentam o "por habilidade" (via `rotuloDoItem`).
					//
					// **`interaction` traz o payload de AUTORIA junto — o gabarito.**
					// Não tem como pedir só o `type`: é uma coluna `Json` só. Vir para
					// o servidor é permitido; o que a regra inviolável nº 1 proíbe é
					// ir para o browser, e quem garante isso é o `load`, que deriva o
					// RÓTULO e devolve uma string. Nada daqui vai inteiro para a tela.
					items: {
						select: {
							score: true,
							ms: true,
							item: { select: { prompt: true, interaction: true, grading: true } }
						}
					},
					publication: {
						select: {
							slug: true,
							settings: true,
							activityVersion: {
								select: {
									_count: { select: { items: true } },
									activity: {
										select: {
											id: true,
											title: true,
											targetLang: true,
											level: true,
											teacher: { select: { name: true } }
										}
									}
								}
							}
						}
					}
				}
			});
		}
	};
}

/**
 * Liga uma ficha de chamada a uma conta. **Só é chamado com o token do convite
 * na mão** — ele foi enviado para aquele endereço e é imprevisível, então é a
 * prova de que a pessoa controla o e-mail.
 *
 * Casar e-mail digitado pelo professor com e-mail de cadastro seria mais
 * cômodo e é justamente o que NÃO dá para fazer: ninguém verifica e-mail no
 * cadastro (não há provedor ainda), e um colega que soubesse o endereço
 * herdaria a chamada e o histórico do outro.
 *
 * Idempotente, e nunca rouba: ficha já ligada a OUTRA conta fica como está.
 */
export async function vincularFichaAConta(studentId: string, accountId: string): Promise<boolean> {
	// Primeiro só a ficha SEM conta: é o que distingue ligar agora de já estar
	// ligada — e só ligar agora vira aviso no sino do professor.
	const nova = await prisma.student.updateMany({
		where: { id: studentId, accountId: null },
		data: { accountId }
	});
	const ligada =
		nova.count > 0 || (await prisma.student.count({ where: { id: studentId, accountId } })) > 0;
	if (!ligada) return false;
	await adotarTentativasDaConta(studentId, accountId);
	if (nova.count > 0) await avisarAlunoEntrou(studentId);
	return true;
}

/** "Juliana entrou em 7º B" — agrupado por turma enquanto o professor não lê. */
async function avisarAlunoEntrou(studentId: string): Promise<void> {
	const ficha = await prisma.student.findUnique({
		where: { id: studentId },
		select: { name: true, teacherId: true, classroom: { select: { id: true, name: true } } }
	});
	if (!ficha) return;
	await notificar(ficha.teacherId, {
		kind: 'aluno-entrou',
		key: `aluno-entrou:${ficha.classroom.id}`,
		data: { classroomId: ficha.classroom.id, turma: ficha.classroom.name, nomes: [ficha.name] }
	});
}

/**
 * O que a conta já respondeu LOGADA, em atividades deste professor, passa a
 * ser da ficha — com o nome do cadastro, como `claimAttempts` faz.
 *
 * É a lacuna do outro aparelho: quem respondeu logado no celular, pelo link
 * aberto, tinha `accountId` e `studentId` nulo. O histórico DELE via a
 * tentativa (pela conta), mas o professor a via como anônima — e ela ficava
 * fora da ficha de chamada. Ligar a ficha à conta é o momento em que as duas
 * verdades se encontram; sem esta passada, só o futuro ficava ligado.
 *
 * Escopado ao professor da ficha: uma conta pode estar em turmas de vários
 * professores, e a tentativa de um não pode virar dado do outro.
 */
export async function adotarTentativasDaConta(
	studentId: string,
	accountId: string
): Promise<number> {
	const ficha = await prisma.student.findUnique({
		where: { id: studentId },
		select: { name: true, teacherId: true }
	});
	if (!ficha) return 0;
	const { count } = await prisma.attempt.updateMany({
		where: {
			accountId,
			studentId: null,
			publication: { activityVersion: { activity: { teacherId: ficha.teacherId } } }
		},
		data: { studentId, name: ficha.name }
	});
	return count;
}

/**
 * A ficha de chamada desta conta com um professor — a que identifica o aluno
 * quando ele entra LOGADO pelo link aberto, sem passar pelo link pessoal.
 *
 * Sem isto, o aluno com conta que abria a atividade pelo QR da sala (ou em
 * outro aparelho) aparecia para o professor como anônimo, com o nome da conta,
 * mesmo estando na chamada. Prefere a ficha da turma que RECEBEU esta
 * publicação; se nenhuma recebeu, qualquer ficha dele com este professor serve
 * — o nome certo na lista vale mais do que a turma exata.
 */
export async function fichaDaConta(accountId: string, teacherId: string, publicationId: string) {
	const fichas = await prisma.student.findMany({
		where: { accountId, teacherId },
		select: {
			id: true,
			name: true,
			classroom: { select: { deliveries: { where: { publicationId }, select: { id: true } } } }
		}
	});
	return fichas.find((ficha) => ficha.classroom.deliveries.length > 0) ?? fichas[0] ?? null;
}

/**
 * As tentativas que este aparelho fez sem conta passam a ser da conta.
 * Espelha o `claimAttempts` do convite, e pelo mesmo motivo: quem responde
 * antes de entrar não pode perder o que fez.
 *
 * Escopado pelo `anonId` do cookie — a prova é ter respondido NESTE aparelho.
 */
export async function adotarTentativasAnonimas(accountId: string, anonId: string): Promise<number> {
	const { count } = await prisma.attempt.updateMany({
		where: { anonId, accountId: null },
		data: { accountId }
	});
	// O que acabou de virar da conta pode ser de um professor em cuja chamada
	// ela já está: aí a tentativa ganha também a ficha, e o professor vê o nome
	// do cadastro em vez do apelido digitado. Uma passada por ficha — são
	// poucas, e cada uma é um `updateMany` escopado ao professor dela.
	if (count > 0) {
		const fichas = await prisma.student.findMany({ where: { accountId }, select: { id: true } });
		for (const ficha of fichas) await adotarTentativasDaConta(ficha.id, accountId);
	}
	return count;
}

/** Existe conta com este e-mail? Usado só para AVISAR o professor. */
export async function contaPorEmail(email: string) {
	return prisma.studentAccount.findUnique({
		where: { email: email.toLowerCase() },
		select: { id: true, name: true }
	});
}

/**
 * Quantas tentativas deste APARELHO ainda não são de conta nenhuma. É o que
 * decide se o convite de adotar aparece na área do aluno — sem nada solto, o
 * convite não existe, e é por isso que ele é uma contagem e não um botão fixo.
 *
 * O escopo é o `anonId` do cookie, que é `httpOnly`: a prova de que foi neste
 * aparelho. Nada aqui aceita id vindo do cliente.
 */
export async function tentativasSoltas(anonId: string): Promise<number> {
	return prisma.attempt.count({ where: { anonId, accountId: null, student: null } });
}

/**
 * Grava o avatar do aluno. Escopo é a própria conta — o id vem da sessão, nunca
 * do corpo do pedido.
 */
export async function gravarAvatarDoAluno(accountId: string, avatar: string): Promise<void> {
	await prisma.studentAccount.update({ where: { id: accountId }, data: { avatar } });
}
