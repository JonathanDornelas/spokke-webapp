import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { getRequestEvent } from '$app/server';
import { env } from '$env/dynamic/private';
import { baseURL, trustedOrigins } from './base-url';
import { prisma } from '$lib/server/db/client';
import { camposDoTrial, registrar } from '$lib/server/billing/assinaturas';
import { sortearCodigo } from '$lib/avatar/montar';
import { VALIDADE_DO_LINK_S, pedirRedefinicaoDeSenha } from './senha';
import { provedoresSociais, semTokensDoGoogle } from './google';

// `user` é renomeado para `teacher` porque é o modelo de conta do produto — ver
// prisma/schema.prisma e .claude/rules/auth.md. Os campos extras são o estado de
// acesso do professor, escrito só por `$lib/server/billing/assinaturas.ts`
// (.claude/rules/billing.md).
export const auth = betterAuth({
	secret: env.BETTER_AUTH_SECRET,
	baseURL,
	trustedOrigins,
	database: prismaAdapter(prisma, { provider: 'postgresql' }),
	user: {
		modelName: 'teacher',
		// **`input: false` em TODOS estes campos — é regra de segurança, não de
		// estilo.** Sem ele o Better Auth aceita o campo vindo do corpo do
		// cadastro e de `POST /api/auth/update-user`, e qualquer pessoa se dava
		// `plan: "super"` / `subscriptionStatus: "active"` com um POST. O único
		// escritor da cobrança é `$lib/server/billing/assinaturas.ts`; o do
		// avatar, `gravarMeuAvatar`.
		//
		// Professor recém-cadastrado entra em trial (os limites do básico, por
		// `TRIAL.dias`) — quem carimba é o hook `databaseHooks.user.create`
		// abaixo, não um `defaultValue`: com `input: false`, um default em função
		// é copiado sem ser chamado quando o corpo traz a chave (docs/adr-002-billing.md).
		additionalFields: {
			plan: { type: 'string', required: false, input: false },
			subscriptionStatus: { type: 'string', required: false, input: false },
			currentPeriodEnd: { type: 'date', required: false, input: false },
			gracePeriodEnd: { type: 'date', required: false, input: false },
			trialEndsAt: { type: 'date', required: false, input: false },
			// Identificador do cliente no gateway: nunca atravessa para o browser
			// (auth.md "Serialização") — `returned: false` o tira da sessão.
			// O avatar entra aqui para viajar na SESSÃO: o cabeçalho do Studio o
			// desenha em toda tela, e sem isto cada `load` precisaria de uma
			// consulta só para buscar dezoito números que a sessão já poderia
			// carregar.
			avatar: { type: 'string', required: false, input: false }
		}
	},
	databaseHooks: {
		user: {
			create: {
				// Os campos de cobrança do cadastro saem DAQUI, nunca do corpo do
				// pedido — `{ ...user }` primeiro, o trial por cima. E a conta nasce
				// com um avatar sorteado: a pessoa aparece como um rosto desde o
				// primeiro minuto, nunca como iniciais (`$lib/avatar/montar.ts`).
				before: async (user) => ({
					data: { ...user, ...camposDoTrial(), avatar: sortearCodigo() }
				}),
				after: async (user) => {
					await registrar(prisma, {
						teacherId: user.id,
						actor: 'sistema',
						type: 'trial_iniciado',
						data: {}
					});
				}
			}
		},
		// Entrar com o Google não deixa token do Google no banco (`./google.ts`).
		account: semTokensDoGoogle
	},
	// Login com o Google — só existe com as duas chaves no ambiente (`./google.ts`).
	// O cadastro por ele passa pelos MESMOS hooks acima: nasce em trial e com
	// avatar sorteado, e os campos de cobrança continuam `input: false`.
	socialProviders: provedoresSociais(),
	account: {
		// Cada nova entrada pelo Google não regrava nada na linha da conta: não há
		// token a renovar (ver `semTokensDoGoogle`).
		updateAccountOnSignIn: false
	},
	emailAndPassword: {
		enabled: true,
		// O link vai por e-mail, pela fila (`./senha.ts`); a validade é a mesma
		// que o e-mail promete.
		resetPasswordTokenExpiresIn: VALIDADE_DO_LINK_S,
		sendResetPassword: ({ user, url }) => pedirRedefinicaoDeSenha('professor', user, url)
	},
	// Precisa ser o último plugin da lista — ver docs do better-auth/svelte-kit.
	plugins: [sveltekitCookies(getRequestEvent)]
});
