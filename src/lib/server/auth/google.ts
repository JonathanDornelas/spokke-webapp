import { env } from '$env/dynamic/private';

/**
 * Entrar e criar conta com o Google — nas DUAS instâncias (professor e aluno),
 * cada uma com a sua URL de retorno (`/api/auth/callback/google` e
 * `/api/auth-aluno/callback/google`, docs/operacao.md "Login com Google").
 *
 * **Pronto e desligado**, como o gateway de pagamento: sem `GOOGLE_CLIENT_ID` e
 * `GOOGLE_CLIENT_SECRET` o provedor nem é registrado e as telas não mostram o
 * botão. Nada aqui depende de o Google estar ligado.
 *
 * **O Google serve para dizer QUEM é a pessoa, e só.** Pedimos os escopos de
 * sempre (`openid email profile`) e:
 * - a foto do perfil não é guardada — o avatar do Spokke são dezoito números
 *   (`$lib/avatar/montar.ts`), e uma URL de foto seria dado a mais;
 * - nenhum token do Google fica no banco (`semTokensDoGoogle`): o produto não
 *   chama API nenhuma do Google em nome da pessoa, então guardar acesso à conta
 *   dela seria risco sem uso.
 *
 * **Conta com senha não é ligada sozinha.** O cadastro por senha não verifica o
 * e-mail, então quem cadastrasse o endereço de outra pessoa ficaria com uma
 * porta (a senha) na conta que ela abrisse depois pelo Google. O Better Auth já
 * recusa isso por padrão (`requireLocalEmailVerified`): a volta traz
 * `?error=account_not_linked`, a tela explica, e ligar é um botão na Conta, com
 * a sessão aberta — prova das duas pontas.
 */
export function googleLigado(): boolean {
	return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

/** Os provedores sociais de uma instância — vazio sem as chaves. */
export function provedoresSociais() {
	if (!googleLigado()) return {};
	return {
		google: {
			clientId: env.GOOGLE_CLIENT_ID!,
			clientSecret: env.GOOGLE_CLIENT_SECRET!,
			// Mostra a escolha de conta mesmo com uma sessão do Google aberta: no
			// computador da escola, entrar sozinho na conta de outro professor é
			// o erro mais fácil de cometer.
			prompt: 'select_account' as const,
			// Nome e e-mail, sem a foto (ver acima).
			mapProfileToUser: () => ({ image: undefined })
		}
	};
}

/** Os campos de token que o Better Auth gravaria na linha da conta OAuth. */
const CAMPOS_DE_TOKEN = [
	'accessToken',
	'refreshToken',
	'idToken',
	'accessTokenExpiresAt',
	'refreshTokenExpiresAt'
] as const;

/**
 * Tira os tokens do que vai ser gravado. Na CRIAÇÃO só mexe na linha do Google
 * (a de senha não tem token); na ATUALIZAÇÃO o pedido não diz o provedor, então
 * zera o que vier — só login social atualiza esses campos.
 */
export function semTokens<T extends Record<string, unknown>>(dados: T): T {
	const limpo: Record<string, unknown> = { ...dados };
	for (const campo of CAMPOS_DE_TOKEN) if (campo in limpo) limpo[campo] = null;
	return limpo as T;
}

/** Os `databaseHooks.account` das duas instâncias. */
export const semTokensDoGoogle = {
	create: {
		before: async <T extends Record<string, unknown> & { providerId?: string }>(conta: T) => ({
			data: conta.providerId === 'credential' ? conta : semTokens(conta)
		})
	},
	update: {
		before: async <T extends Record<string, unknown>>(conta: T) => ({ data: semTokens(conta) })
	}
};
