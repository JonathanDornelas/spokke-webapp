import { describe, expect, it } from 'vitest';
import { montarRedefinirSenha } from './redefinir-senha';

const LINK = 'http://localhost:5173/api/auth/reset-password/abc123?callbackURL=%2Fredefinir-senha';

describe('o e-mail de redefinir senha', () => {
	it('leva o link no botão E em texto — cliente de e-mail engole botão', () => {
		const email = montarRedefinirSenha({
			to: 'ana@exemplo.invalid',
			nome: 'Ana Ribeiro',
			link: LINK,
			conta: 'professor',
			expiraEm: new Date().toISOString()
		});
		expect(email.text).toContain(LINK);
		expect(email.html).toContain(LINK.replace(/&/g, '&amp;'));
		expect(email.subject).toBe('Criar uma senha nova no Spokke');
		expect(email.text).toContain('Olá, Ana.');
		expect(email.text).toContain('vale por 1 hora');
	});

	it('diz de qual conta é o pedido', () => {
		const dados = { to: 'x@exemplo.invalid', nome: 'Lia', link: LINK, expiraEm: '' };
		expect(montarRedefinirSenha({ ...dados, conta: 'aluno' }).text).toContain('conta de aluno');
		expect(montarRedefinirSenha({ ...dados, conta: 'professor' }).text).not.toContain('aluno');
	});

	it('o nome vem da pessoa e é escapado no HTML', () => {
		const email = montarRedefinirSenha({
			to: 'x@exemplo.invalid',
			nome: '<b>Hacker</b> da Silva',
			link: LINK,
			conta: 'professor',
			expiraEm: ''
		});
		expect(email.html).not.toContain('<b>Hacker</b>');
		expect(email.html).toContain('&lt;b&gt;Hacker&lt;/b&gt;');
	});
});
