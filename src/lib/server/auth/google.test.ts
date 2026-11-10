import { describe, expect, it } from 'vitest';
import { semTokens, semTokensDoGoogle } from './google';

/**
 * O login com o Google só serve para dizer QUEM é a pessoa: nenhum token do
 * Google pode chegar ao banco (`server/auth/google.ts`). O fluxo OAuth inteiro
 * precisa do Google de verdade e fica fora daqui; o que se prova é a trava que
 * os hooks das duas instâncias aplicam antes de gravar.
 */
describe('o login com o Google não guarda token', () => {
	const daVolta = {
		providerId: 'google',
		accountId: '1234567890',
		userId: 'u1',
		accessToken: 'ya29.token',
		refreshToken: '1//refresh',
		idToken: 'eyJ.id.token',
		accessTokenExpiresAt: new Date(),
		refreshTokenExpiresAt: new Date(),
		scope: 'openid email profile'
	};

	it('a conta do Google nasce sem token nenhum, só com o identificador', async () => {
		const { data } = await semTokensDoGoogle.create.before(daVolta);
		expect(data).toMatchObject({
			providerId: 'google',
			accountId: '1234567890',
			accessToken: null,
			refreshToken: null,
			idToken: null,
			accessTokenExpiresAt: null,
			refreshTokenExpiresAt: null
		});
	});

	it('a conta de senha passa intacta (o hash é dela)', async () => {
		const senha = { providerId: 'credential', accountId: 'u1', userId: 'u1', password: 'hash' };
		const { data } = await semTokensDoGoogle.create.before(senha);
		expect(data).toEqual(senha);
	});

	it('atualizar também não regrava token, e não inventa campo que não veio', async () => {
		const { data } = await semTokensDoGoogle.update.before({ accessToken: 'novo', scope: 'x' });
		expect(data).toEqual({ accessToken: null, scope: 'x' });
		expect(semTokens({ password: 'hash' })).toEqual({ password: 'hash' });
	});
});
