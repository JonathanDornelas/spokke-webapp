import { randomBytes } from 'node:crypto';
import { prisma } from '$lib/server/db/client';
import { notificar } from '$lib/server/notificacoes';
import { registrar, type Ator } from '$lib/server/billing/assinaturas';
import { enqueueConviteEscola } from '$lib/server/queue';

/**
 * O ambiente escolar (plano Scholar) — docs/adr-005-escola.md. Este arquivo é o
 * ÚNICO escritor de escolas, filiações e convites de escola, como
 * `assinaturas.ts` é da cobrança.
 */

export const PAPEIS = ['coordenacao', 'professor'] as const;
export type Papel = (typeof PAPEIS)[number];

export const STATUS_DA_ESCOLA = ['ativa', 'suspensa', 'encerrada'] as const;
export type StatusDaEscola = (typeof STATUS_DA_ESCOLA)[number];

/** Validade do convite. Passou disso, a coordenação manda outro. */
const VALIDADE_DO_CONVITE_DIAS = 7;

export interface DadosDaEscola {
	name: string;
	seats: number;
	atividadesPorProfessor: number;
	materiaisPorProfessor: number;
	creditosPorProfessor: number;
	contractEndsAt: Date | null;
	status: StatusDaEscola;
}

/**
 * Token de convite: 24 bytes aleatórios (192 bits) em base64url. É a PROVA de
 * que a pessoa controla o e-mail para onde ele foi — o cadastro não verifica
 * e-mail, então casar endereços não provaria nada (auth.md).
 */
function novoToken(): string {
	return randomBytes(24).toString('base64url');
}

export async function criarEscola(dados: DadosDaEscola, ator: Ator) {
	return prisma.$transaction(async (tx) => {
		const escola = await tx.school.create({ data: dados });
		await tx.auditEvent.create({
			data: {
				actor: ator,
				type: 'escola_criada',
				data: {
					schoolId: escola.id,
					...dados,
					contractEndsAt: dados.contractEndsAt?.toISOString() ?? null
				}
			}
		});
		return escola;
	});
}

export async function editarEscola(schoolId: string, dados: DadosDaEscola, ator: Ator) {
	return prisma.$transaction(async (tx) => {
		const { count } = await tx.school.updateMany({ where: { id: schoolId }, data: dados });
		if (count === 0) throw new Error('Escola não encontrada.');
		await tx.auditEvent.create({
			data: {
				actor: ator,
				type: 'escola_editada',
				data: { schoolId, ...dados, contractEndsAt: dados.contractEndsAt?.toISOString() ?? null }
			}
		});
	});
}

/** Exceção de limite para UM professor (admin). Nulo = vale o padrão da escola. */
export async function definirExcecao(
	membershipId: string,
	limites: {
		atividadesMax: number | null;
		materiaisMax: number | null;
		creditosMax: number | null;
	},
	ator: Ator
) {
	return prisma.$transaction(async (tx) => {
		const membro = await tx.schoolMembership.update({ where: { id: membershipId }, data: limites });
		await registrar(tx, {
			teacherId: membro.teacherId,
			actor: ator,
			type: 'escola_excecao',
			data: { ...limites }
		});
	});
}

/**
 * Convida um e-mail para a escola. Devolve o convite com o token — quem chama
 * enfileira o e-mail (o convite não sai na requisição). Recusa quando os
 * assentos já estão todos ocupados por membros: convidar para uma vaga que não
 * existe faria a pessoa bater numa porta fechada ao aceitar.
 */
export async function convidarParaEscola(schoolId: string, email: string, role: Papel) {
	const endereco = email.trim().toLowerCase();
	return prisma.$transaction(async (tx) => {
		const escola = await tx.school.findUniqueOrThrow({
			where: { id: schoolId },
			include: { _count: { select: { members: true } } }
		});
		if (escola._count.members >= escola.seats) {
			return { ok: false as const, error: 'Todos os assentos da escola estão ocupados.' };
		}
		const convite = await tx.schoolInvite.create({
			data: {
				schoolId,
				email: endereco,
				role,
				token: novoToken(),
				expiresAt: new Date(Date.now() + VALIDADE_DO_CONVITE_DIAS * 24 * 3600 * 1000)
			}
		});
		return { ok: true as const, convite, escola: { id: escola.id, name: escola.name } };
	});
}

/**
 * Convida e enfileira o e-mail — o caminho do painel interno (o primeiro
 * coordenador) e da coordenação (os professores). O link leva ao aceite,
 * `/escola/convite/<token>`.
 */
export async function convidarEEnviar(
	schoolId: string,
	email: string,
	role: Papel,
	quemConvidou: string,
	origem: string
): Promise<{ ok: true } | { ok: false; error: string }> {
	const r = await convidarParaEscola(schoolId, email, role);
	if (!r.ok) return r;
	await enqueueConviteEscola({
		inviteId: r.convite.id,
		to: r.convite.email,
		schoolName: r.escola.name,
		quemConvidou,
		role,
		link: `${origem}/escola/convite/${r.convite.token}`,
		expiresAt: r.convite.expiresAt.toISOString()
	});
	return { ok: true };
}

export type ResultadoDoAceite =
	| { ok: true; escola: string; jaEraMembro: boolean }
	| {
			ok: false;
			motivo: 'invalido' | 'expirado' | 'usado' | 'sem-assento' | 'outra-escola' | 'inativa';
	  };

/**
 * Aceita o convite. Numa transação, com a trava da ESCOLA e depois a do
 * professor (sempre nessa ordem — adr-005): é o que impede dois aceites
 * simultâneos de ocuparem o mesmo último assento.
 *
 * O convite é de uso único e tem validade. Quem já está em OUTRA escola precisa
 * sair dela antes — um professor, uma escola, um contrato valendo.
 */
export async function aceitarConviteDaEscola(
	token: string,
	teacherId: string
): Promise<ResultadoDoAceite> {
	const resultado = await prisma.$transaction(async (tx): Promise<ResultadoDoAceite> => {
		const convite = await tx.schoolInvite.findUnique({ where: { token } });
		if (!convite) return { ok: false, motivo: 'invalido' };

		await tx.$executeRaw`SELECT 1 FROM "School" WHERE id = ${convite.schoolId} FOR UPDATE`;
		await tx.$executeRaw`SELECT 1 FROM "Teacher" WHERE id = ${teacherId} FOR NO KEY UPDATE`;

		// Relido DEPOIS da trava: outro aceite pode ter passado na frente.
		const atual = await tx.schoolInvite.findUniqueOrThrow({ where: { id: convite.id } });
		const escola = await tx.school.findUniqueOrThrow({
			where: { id: convite.schoolId },
			include: { _count: { select: { members: true } } }
		});
		const jaMembro = await tx.schoolMembership.findUnique({ where: { teacherId } });

		if (jaMembro && jaMembro.schoolId === escola.id) {
			return { ok: true, escola: escola.name, jaEraMembro: true };
		}
		if (atual.acceptedAt) return { ok: false, motivo: 'usado' };
		if (atual.expiresAt <= new Date()) return { ok: false, motivo: 'expirado' };
		if (escola.status !== 'ativa') return { ok: false, motivo: 'inativa' };
		if (jaMembro) return { ok: false, motivo: 'outra-escola' };
		if (escola._count.members >= escola.seats) return { ok: false, motivo: 'sem-assento' };

		await tx.schoolMembership.create({
			data: { schoolId: escola.id, teacherId, role: atual.role }
		});
		await tx.schoolInvite.update({ where: { id: atual.id }, data: { acceptedAt: new Date() } });
		await registrar(tx, {
			teacherId,
			actor: 'professor',
			type: 'escola_entrou',
			data: { schoolId: escola.id, role: atual.role }
		});
		return { ok: true, escola: escola.name, jaEraMembro: false };
	});
	if (resultado.ok && !resultado.jaEraMembro) await avisarCoordenacao(token, teacherId);
	return resultado;
}

/**
 * "Ana entrou na escola", para a coordenação — o nome do PROFESSOR, que é o que
 * ela já vê no painel; nenhum dado de aluno (auth.md "Coordenação"). Depois do
 * commit: o aviso de uma entrada desfeita mentiria.
 */
async function avisarCoordenacao(token: string, teacherId: string): Promise<void> {
	const convite = await prisma.schoolInvite.findUnique({
		where: { token },
		select: { school: { select: { id: true, name: true } } }
	});
	const professor = await prisma.teacher.findUnique({
		where: { id: teacherId },
		select: { name: true }
	});
	if (!convite || !professor) return;
	const coordenacao = await prisma.schoolMembership.findMany({
		where: { schoolId: convite.school.id, role: 'coordenacao', teacherId: { not: teacherId } },
		select: { teacherId: true }
	});
	for (const membro of coordenacao) {
		await notificar(membro.teacherId, {
			kind: 'escola',
			key: `escola-entrou:${convite.school.id}`,
			data: { escola: convite.school.name, nomes: [professor.name] }
		});
	}
}

/**
 * Tira um professor da escola. Nunca o ÚLTIMO da coordenação — uma escola sem
 * coordenação não teria quem convidasse ninguém. O conteúdo do professor fica
 * com ele; só o contrato deixa de valer.
 */
export async function removerDaEscola(
	schoolId: string,
	teacherId: string,
	ator: Ator
): Promise<{ ok: true } | { ok: false; error: string }> {
	return prisma.$transaction(async (tx) => {
		await tx.$executeRaw`SELECT 1 FROM "School" WHERE id = ${schoolId} FOR UPDATE`;
		const membro = await tx.schoolMembership.findFirst({ where: { schoolId, teacherId } });
		if (!membro) return { ok: false, error: 'Este professor não está na escola.' };
		if (membro.role === 'coordenacao') {
			const coordenadores = await tx.schoolMembership.count({
				where: { schoolId, role: 'coordenacao' }
			});
			if (coordenadores <= 1) {
				return { ok: false, error: 'A escola precisa de pelo menos uma pessoa na coordenação.' };
			}
		}
		await tx.schoolMembership.delete({ where: { id: membro.id } });
		await registrar(tx, {
			teacherId,
			actor: ator,
			type: 'escola_saiu',
			data: { schoolId }
		});
		return { ok: true };
	});
}
