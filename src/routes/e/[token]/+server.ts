import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { convitePorToken } from '$lib/server/db/repos/deliveries';
import {
	adotarTentativasAnonimas,
	vincularFichaAConta
} from '$lib/server/db/repos/student-accounts';

/**
 * O link PESSOAL do aluno. Não é uma tela: é a porta que identifica quem
 * está entrando e devolve ele para o Player normal.
 *
 * **O token é a identidade do aluno.** Ele não cria conta e não tem senha —
 * ver paginas.md "Turmas e alunos". Por isso o cookie é `httpOnly` e escopado à
 * publicação: o link é "só seu", e quem recebe o link responde no seu lugar.
 *
 * O que o aluno já respondeu ANTES neste aparelho é vinculado agora
 * (`claimAttempts`): responder sem conta e aparecer com o nome certo na lista
 * do professor são as duas coisas ao mesmo tempo, não uma ou outra.
 */
export const GET: RequestHandler = async ({ params, cookies, locals }) => {
	const convite = await convitePorToken.resolve(params.token);
	if (!convite) error(404, { message: 'Link não encontrado', reason: 'notFound' });

	const { publication } = convite.delivery;

	// Atividade ARQUIVADA (docs/adr-002-billing.md): não marca o convite como
	// aberto nem identifica o aluno — só devolve para a entrada, que decide
	// entre "encerrada" e "continuar de onde parei" (quem já começou termina).
	if (publication.activityVersion.activity.archivedAt) {
		redirect(303, `/a/${publication.slug}`);
	}

	await convitePorToken.markOpened(convite.id);

	// Este cookie diz "sou o aluno tal nesta atividade". Ele NÃO é uma sessão
	// do produto: não dá acesso a nada do professor nem a outra publicação.
	cookies.set(`spokke_aluno_${publication.slug}`, convite.student.id, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		maxAge: 60 * 60 * 24 * 30
	});

	// Se o aluno já tinha respondido pelo link aberto neste aparelho, aquelas
	// respostas passam a ser dele. Elas já contavam para o professor antes —
	// o que muda é o nome na lista.
	const anonId = cookies.get('spokke_anon');
	if (anonId) {
		await convitePorToken.claimAttempts(
			convite.student.id,
			convite.student.name,
			publication.id,
			anonId
		);
	}

	/**
	 * **Aqui é onde a ficha de chamada encontra a conta.** Se ele já está
	 * logado, abrir o próprio convite liga as duas coisas — e a partir daí o
	 * histórico dele tem esta turma, em qualquer aparelho.
	 *
	 * O TOKEN é o que autoriza. Ele foi enviado para aquele endereço e é
	 * imprevisível, então prova controle do e-mail — coisa que casar o e-mail
	 * digitado pelo professor com o do cadastro NÃO prova (ninguém verifica
	 * e-mail no cadastro ainda, e um colega que soubesse o endereço herdaria a
	 * chamada do outro).
	 *
	 * Quem não tem conta não perde nada: o cookie acima já o identifica nesta
	 * atividade, que é o caminho normal do produto.
	 */
	if (locals.aluno) {
		await vincularFichaAConta(convite.student.id, locals.aluno.id);
		if (anonId) await adotarTentativasAnonimas(locals.aluno.id, anonId);
	}

	redirect(303, `/a/${publication.slug}`);
};
