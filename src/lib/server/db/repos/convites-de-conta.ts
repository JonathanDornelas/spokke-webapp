import { randomBytes } from 'node:crypto';
import { prisma } from '$lib/server/db/client';
import { vincularFichaAConta } from './student-accounts';

/**
 * O CONVITE DE CONTA do aluno da chamada: o link para ele criar a conta (ou
 * entrar na que já tem) e ligá-la à ficha — é o que faz o mapa dos módulos
 * aparecer para ele, já que módulo libera no mapa e não manda e-mail.
 *
 * **O token é a prova**, como no link pessoal da atividade (auth.md "A conta do
 * aluno"): 192 bits imprevisíveis, que só chegam a quem o professor mandou —
 * por e-mail, pela fila, ou copiado por ele. Casar o e-mail do cadastro com o da
 * conta seria mais cômodo e é exatamente o que não dá para fazer: ninguém
 * verifica e-mail no cadastro, e um colega que soubesse o endereço herdaria a
 * chamada do outro.
 */
function novoToken(): string {
	return randomBytes(24).toString('base64url');
}

const FICHA = {
	id: true,
	name: true,
	email: true,
	accountId: true,
	accountInviteToken: true,
	accountInviteSentAt: true,
	classroom: { select: { name: true } }
} as const;

export function convitesDeConta(teacher: { id: string }) {
	/**
	 * O aluno com o token do convite — criado na primeira vez que alguém pede, e
	 * TROCADO com `renovar` (o link antigo para de valer). `null` quando o aluno
	 * não existe ou é de outro professor, sem distinguir os dois (auth.md).
	 */
	async function garantir(studentId: string, renovar = false) {
		const aluno = await prisma.student.findFirst({
			where: { id: studentId, teacherId: teacher.id },
			select: FICHA
		});
		if (!aluno) return null;
		if (aluno.accountInviteToken && !renovar) {
			return { ...aluno, accountInviteToken: aluno.accountInviteToken };
		}
		const token = novoToken();
		await prisma.student.updateMany({
			where: { id: aluno.id, teacherId: teacher.id },
			data: { accountInviteToken: token, accountInviteSentAt: null }
		});
		return { ...aluno, accountInviteToken: token, accountInviteSentAt: null };
	}

	return {
		garantir,

		/**
		 * Os alunos de UMA turma que podem receber o convite por e-mail: têm
		 * e-mail e ainda não têm conta. Cada um sai com o token garantido. Turma de
		 * outro professor devolve lista vazia, sem dizer por quê.
		 */
		async daTurmaParaEnviar(classroomId: string) {
			const fichas = await prisma.student.findMany({
				where: {
					classroomId,
					teacherId: teacher.id,
					accountId: null,
					email: { not: null }
				},
				select: { id: true }
			});
			const prontas = [];
			for (const ficha of fichas) {
				const pronta = await garantir(ficha.id);
				if (pronta?.email) prontas.push({ ...pronta, email: pronta.email });
			}
			return prontas;
		}
	};
}

/**
 * A porta PÚBLICA: o convite pelo token, só com o que a página do convite
 * mostra — o nome da ficha, a turma e o professor. Nada de e-mail, nada de
 * outro aluno.
 */
export function conviteDeContaPorToken(token: string) {
	return prisma.student.findUnique({
		where: { accountInviteToken: token },
		select: {
			id: true,
			name: true,
			accountId: true,
			classroom: { select: { name: true } },
			teacher: { select: { name: true } }
		}
	});
}

export type DesfechoDoConvite = 'ligada' | 'ja-era-sua' | 'outra-conta' | 'invalido';

/**
 * Liga a conta LOGADA à ficha do convite. Quem chama já conferiu a sessão do
 * aluno (`requireAluno`); o token é o que diz QUAL ficha.
 *
 * Nunca rouba: ficha já ligada a outra conta fica como está, e a resposta não
 * diz qual é a outra — só que o convite já foi usado.
 */
export async function ligarContaPeloConvite(
	token: string,
	accountId: string
): Promise<DesfechoDoConvite> {
	const ficha = await prisma.student.findUnique({
		where: { accountInviteToken: token },
		select: { id: true, accountId: true }
	});
	if (!ficha) return 'invalido';
	if (ficha.accountId === accountId) return 'ja-era-sua';
	if (ficha.accountId) return 'outra-conta';
	return (await vincularFichaAConta(ficha.id, accountId)) ? 'ligada' : 'outra-conta';
}

/** O que o worker precisa para mandar o e-mail — e para NÃO mandar o que já não vale. */
export function conviteDeContaParaEnviar(studentId: string) {
	return prisma.student.findUnique({
		where: { id: studentId },
		select: {
			...FICHA,
			teacher: { select: { name: true } }
		}
	});
}

/**
 * O pedido ainda vale? Pura, para o worker e para o teste. Não manda quando:
 * a ficha sumiu ou já tem conta; o token mudou (há um link mais novo, e o
 * velho não abre); não há mais e-mail; ou ESTE pedido já saiu.
 */
export function conviteAindaVale(
	ficha: {
		accountId: string | null;
		accountInviteToken: string | null;
		accountInviteSentAt: Date | null;
		email: string | null;
	} | null,
	pedido: { token: string; pedidoEm: string }
): ficha is {
	accountId: null;
	accountInviteToken: string;
	accountInviteSentAt: Date | null;
	email: string;
} {
	if (!ficha || ficha.accountId || !ficha.email) return false;
	if (ficha.accountInviteToken !== pedido.token) return false;
	if (ficha.accountInviteSentAt && ficha.accountInviteSentAt >= new Date(pedido.pedidoEm)) {
		return false;
	}
	return true;
}

export function marcarConviteDeContaEnviado(studentId: string, token: string) {
	return prisma.student.updateMany({
		where: { id: studentId, accountInviteToken: token },
		data: { accountInviteSentAt: new Date() }
	});
}
