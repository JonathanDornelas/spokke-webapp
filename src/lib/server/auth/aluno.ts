import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { getRequestEvent } from '$app/server';
import { env } from '$env/dynamic/private';
import { baseURL, trustedOrigins } from './base-url';
import { prisma } from '$lib/server/db/client';
import { sortearCodigo } from '$lib/avatar/montar';
import { VALIDADE_DO_LINK_S, pedirRedefinicaoDeSenha } from './senha';
import { provedoresSociais, semTokensDoGoogle } from './google';

/**
 * A conta do ALUNO. Segunda instância do Better Auth, com tabelas próprias e
 * base path próprio.
 *
 * **Por que não um campo `role` na conta do professor.** Professor tem
 * assinatura, atividades, turmas e alunos pendurados nele; misturar os dois na
 * mesma tabela faria toda query de professor precisar de um filtro a mais para
 * não devolver aluno — e o dia em que um esquecesse esse filtro seria um
 * incidente. Aqui as duas identidades não têm como se confundir: são cookies
 * diferentes, tabelas diferentes e guards diferentes. O hash de senha e a
 * sessão continuam sendo da biblioteca, nunca nossos (auth.md).
 *
 * **A conta é OPCIONAL e não destrava nada.** O produto continua sendo "abre o
 * link, digita o nome e responde" — a conta serve para o aluno guardar o
 * histórico dele e reencontrá-lo em outro aparelho. Nenhuma atividade exige
 * login, e nenhuma tela do aluno pede conta antes de deixar responder.
 *
 * **Dado coletado: nome, e-mail e senha. Nada além disso** (auth.md "Dados do
 * aluno e LGPD"). Boa parte do público é menor de idade, então qualquer campo
 * novo aqui é decisão do dono do repositório, não de quem estiver programando.
 */
export const authAluno = betterAuth({
	secret: env.BETTER_AUTH_SECRET,
	baseURL,
	trustedOrigins,
	basePath: '/api/auth-aluno',
	database: prismaAdapter(prisma, { provider: 'postgresql' }),
	// Cookie próprio: sem isto as duas instâncias brigariam pelo mesmo nome e
	// entrar como aluno derrubaria a sessão do professor no mesmo browser — que
	// é exatamente o caso do professor testando a própria atividade.
	advanced: { cookiePrefix: 'spokke-aluno' },
	user: {
		modelName: 'studentAccount',
		additionalFields: {
			/**
			 * O avatar, como dezoito números (`$lib/avatar/montar.ts`).
			 *
			 * **É campo novo na conta do aluno, e por isso passou pela decisão do
			 * dono do repositório** — a regra acima existe justamente para isto.
			 * O que o aprovou: não é dado COLETADO nem observado, é escolha de
			 * enfeite; não identifica ninguém (dezoito índices de peça de desenho,
			 * sem texto livre onde caiba um nome); e quem escolhe é a pessoa — a
			 * conta nasce com um sorteado (o hook abaixo), e trocar é opcional.
			 */
			// `input: false`: o único escritor é `gravarMeuAvatar` (aluno.remote.ts),
			// que valida pelo `codigoDeAvatarSchema`. Sem isto, `POST
			// /api/auth-aluno/update-user` gravava qualquer texto direto.
			avatar: { type: 'string', required: false, input: false }
		}
	},
	session: { modelName: 'studentSession' },
	// `updateAccountOnSignIn: false`: entrar de novo pelo Google não regrava a
	// linha — não há token a renovar (`./google.ts`).
	account: { modelName: 'studentCredential', updateAccountOnSignIn: false },
	verification: { modelName: 'studentVerification' },
	// A conta nasce com um avatar SORTEADO — enfeite gerado pelo sistema, não
	// dado coletado (a nota do campo acima vale igual): sem isto o aluno
	// aparecia como iniciais até abrir o editor.
	databaseHooks: {
		user: { create: { before: async (user) => ({ data: { ...user, avatar: sortearCodigo() } }) } },
		// Entrar com o Google não deixa token do Google no banco (`./google.ts`).
		account: semTokensDoGoogle
	},
	/**
	 * **Entrar com o Google também vale para o aluno — decisão do dono do
	 * repositório (2026-11-09).** O que chega do Google é o que esta conta já
	 * guardava: nome e e-mail, mais o identificador da conta Google, que é o
	 * que reconhece a pessoa na volta. Sem foto e sem token (`./google.ts`), e a
	 * senha deixa de ser obrigatória para quem entra assim. Ver auth.md.
	 */
	socialProviders: provedoresSociais(),
	emailAndPassword: {
		enabled: true,
		// O mesmo caminho do professor (`./senha.ts`): e-mail pela fila, link de 1 hora.
		resetPasswordTokenExpiresIn: VALIDADE_DO_LINK_S,
		sendResetPassword: ({ user, url }) => pedirRedefinicaoDeSenha('aluno', user, url)
	},
	plugins: [sveltekitCookies(getRequestEvent)]
});
