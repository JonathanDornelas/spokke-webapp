import { z } from 'zod';
import { command, getRequestEvent } from '$app/server';
import { requireAluno } from '$lib/server/auth/guard';
import {
	adotarTentativasAnonimas,
	gravarAvatarDoAluno
} from '$lib/server/db/repos/student-accounts';
import { codigoDeAvatarSchema } from '$lib/avatar/schema';
import { ligarContaPeloConvite } from '$lib/server/db/repos/convites-de-conta';

/**
 * Ao ENTRAR, o que este aparelho já respondeu sem conta passa a ser da conta.
 *
 * É a mesma promessa que o link pessoal já cumpre (`claimAttempts`), agora
 * para quem chega pelo login: responder antes de ter conta não pode custar o
 * histórico. Sem isto, criar a conta logo depois de responder parecia apagar
 * o que a pessoa acabou de fazer.
 *
 * **Toda remote function é um endpoint HTTP público** (regra inviolável nº 3):
 * abre pelo guard, e o guard aqui é o do ALUNO — `requireTeacher` daria acesso
 * de professor a quem não é.
 *
 * A prova é ter respondido NESTE aparelho: o `anonId` do cookie é o escopo, e
 * ele é `httpOnly`. Nada aqui aceita id vindo do cliente.
 */
export const adotarMinhasTentativas = command(async () => {
	const { locals, cookies } = getRequestEvent();
	const conta = requireAluno(locals);

	const anonId = cookies.get('spokke_anon');
	if (!anonId) return { adotadas: 0 };

	return { adotadas: await adotarTentativasAnonimas(conta.id, anonId) };
});

/**
 * Grava o avatar do aluno — a escolha dele, e a única coisa da conta que ele
 * muda por gosto.
 *
 * Mesmas duas disciplinas da adoção acima: o guard é o do ALUNO (`requireAluno`,
 * não `requireTeacher`), e o id vem da SESSÃO. Sem isso, um `accountId` no corpo
 * do pedido deixaria qualquer pessoa trocar o avatar de qualquer aluno — que a
 * turma dele vê ao lado do nome.
 */
export const gravarMeuAvatar = command(codigoDeAvatarSchema, async (avatar) => {
	const conta = requireAluno(getRequestEvent().locals);
	await gravarAvatarDoAluno(conta.id, avatar);
	return { avatar };
});

/**
 * Aceitar o CONVITE DE CONTA: liga a conta logada à ficha da chamada que o
 * token aponta (auth.md "A conta do aluno"). O id da conta vem da SESSÃO; o
 * token, do link que o professor mandou — é ele que diz QUAL ficha, e só quem
 * o recebeu o tem. Ficha já ligada a outra conta não muda de dono.
 */
export const entrarNaTurmaPeloConvite = command(
	z.object({ token: z.string().min(1).max(64) }),
	async ({ token }) => {
		const conta = requireAluno(getRequestEvent().locals);
		return { desfecho: await ligarContaPeloConvite(token, conta.id) };
	}
);
