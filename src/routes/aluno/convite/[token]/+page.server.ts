import type { PageServerLoad } from './$types';
import { conviteDeContaPorToken } from '$lib/server/db/repos/convites-de-conta';

/**
 * O CONVITE DE CONTA, aberto pelo aluno (auth.md "A conta do aluno"). Não exige
 * sessão: quem chega sem conta escolhe entre criar uma e entrar na que tem, nas
 * telas que já existem (`/cadastro` e `/entrar`, com `como=aluno` e `voltar`
 * apontando para cá), e volta para ligar.
 *
 * **Ligar é um BOTÃO, nunca efeito de abrir o link.** Ligar a conta à ficha dá
 * ao professor o que ela responder logada nas atividades dele, e o aparelho pode
 * estar com a conta de outra pessoa aberta (o irmão, o laboratório). A tela diz
 * com qual conta vai ligar antes de ligar.
 *
 * Leitura pelo token, sem escopo de professor: o token É a autorização para ver
 * este convite (como o `e/[token]`), e só sai daqui o nome da ficha, da turma e
 * do professor.
 */
export const load: PageServerLoad = async ({ params, locals }) => {
	const convite = await conviteDeContaPorToken(params.token);
	const conta = locals.aluno ? { nome: locals.aluno.name, email: locals.aluno.email } : null;
	if (!convite) {
		return { estado: 'invalido' as const, aluno: null, turma: null, professor: null, conta };
	}
	const estado = !convite.accountId
		? ('aberto' as const)
		: locals.aluno && convite.accountId === locals.aluno.id
			? ('ja-era-sua' as const)
			: ('usado' as const);
	return {
		estado,
		aluno: convite.name,
		turma: convite.classroom.name,
		professor: convite.teacher.name,
		conta
	};
};
