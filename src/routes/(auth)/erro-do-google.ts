/**
 * O que dizer quando a volta do Google traz `?error=…` (o código é do Better
 * Auth). Cada caso diz o que fazer em seguida; nenhum revela mais do que a
 * pessoa já sabe — quem vê "já tem conta com senha" acabou de provar, pelo
 * Google, que é dona daquele e-mail.
 */
export function mensagemDoGoogle(
	codigo: string | null,
	como: 'professor' | 'aluno'
): string | null {
	if (!codigo) return null;
	switch (codigo) {
		case 'account_not_linked':
			return como === 'professor'
				? 'Este e-mail já tem conta no Spokke, criada com senha. Entre com a senha: depois, em Conta, você liga o Google e passa a entrar pelos dois.'
				: 'Este e-mail já tem conta de aluno, criada com senha. Entre com a senha: depois, na sua área, você liga o Google.';
		case 'access_denied':
			return 'A entrada pelo Google foi cancelada. Tente de novo ou use o seu e-mail.';
		case 'email_not_found':
		case 'email_not_verified':
			return 'O Google não confirmou o e-mail desta conta. Use outra conta Google ou o seu e-mail.';
		default:
			return 'Não deu para entrar com o Google agora. Tente de novo ou use o seu e-mail e senha.';
	}
}
