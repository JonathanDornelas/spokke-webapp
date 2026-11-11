import { describe, expect, it } from 'vitest';
import { anexosDoEmail, escaparHtml } from './base';
import { LOGO } from './logo';
import { montarConviteAluno } from './convite-aluno';
import { montarAvisoEquipe } from './aviso-equipe';
import { montarConviteConta } from './convite-conta';
import { montarConviteEscola } from './convite-escola';
import { montarRedefinirSenha } from './redefinir-senha';

// Um de cada, com dados comuns — para as regras que valem para TODO e-mail.
function todosOsEmails() {
	return [
		montarConviteAluno({
			studentName: 'Ana Souza',
			teacherName: 'Carla Lima',
			activityTitle: 'Present perfect',
			languageLabel: 'Inglês',
			itemCount: 10,
			minutes: 8,
			classroomName: '8º B',
			link: 'https://spokke.com.br/e/um-token-bem-comprido-que-nao-tem-espaco-nenhum-para-quebrar-a-linha',
			code: 'K7P2',
			codeUrl: 'https://spokke.com.br/codigo'
		}),
		montarConviteConta({
			studentName: 'Ana',
			teacherName: 'Carla',
			classroomName: '8º B',
			link: 'https://spokke.com.br/aluno/convite/abc'
		}),
		montarConviteEscola({
			inviteId: 'i1',
			to: 'x@exemplo.invalid',
			schoolName: 'Escola Aurora',
			quemConvidou: 'Bia',
			role: 'professor',
			link: 'https://spokke.com.br/escola/convite/abc',
			expiresAt: new Date().toISOString()
		}),
		montarRedefinirSenha({
			to: 'x@exemplo.invalid',
			nome: 'Lia',
			link: 'https://spokke.com.br/redefinir/abc',
			conta: 'professor',
			expiraEm: ''
		}),
		montarAvisoEquipe({ assunto: 'Contato', texto: 'Oi' })
	];
}

describe('a moldura de todo e-mail', () => {
	it('nenhuma imagem remota: toda <img> aponta para um anexo embutido (cid:)', () => {
		for (const email of todosOsEmails()) {
			const fontes = [...email.html.matchAll(/<img\b[^>]*\bsrc="([^"]*)"/g)].map((m) => m[1]);
			expect(fontes.length).toBeGreaterThan(0);
			for (const src of fontes) expect(src.startsWith('cid:')).toBe(true);
		}
	});

	it('o logo vai como anexo inline quando o HTML aponta para ele, e só então', () => {
		const [convite] = todosOsEmails();
		const anexos = anexosDoEmail(convite.html);
		expect(anexos).toHaveLength(1);
		expect(anexos[0]).toMatchObject({ cid: LOGO.cid, contentDisposition: 'inline' });
		// PNG de verdade: a assinatura do formato nos primeiros bytes.
		expect(anexos[0].content.subarray(1, 4).toString()).toBe('PNG');
		expect(anexosDoEmail('<p>sem logo</p>')).toEqual([]);
	});

	it('cabe na tela do celular: largura fluida com teto, e o link longo numa caixa que quebra', () => {
		for (const email of todosOsEmails()) {
			expect(email.html).toContain('max-width:600px');
			// a largura fixa que estourava no Gmail do celular não volta
			expect(email.html).not.toMatch(/style="width:600px/);
		}
		const [convite] = todosOsEmails();
		expect(convite.html).toContain('table-layout:fixed');
	});
});

describe('escaparHtml', () => {
	it('escapa os cinco caracteres que abrem marcação ou atributo', () => {
		expect(escaparHtml(`<a href="x" onclick='y'>&</a>`)).toBe(
			'&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;'
		);
	});
});

describe('e-mails não injetam marcação vinda de pessoas', () => {
	const ataque = '<img src=x onerror=alert(1)>';

	it('convite do aluno', () => {
		const email = montarConviteAluno({
			studentName: ataque,
			teacherName: ataque,
			activityTitle: ataque,
			languageLabel: 'Inglês',
			itemCount: 10,
			minutes: 8,
			classroomName: ataque,
			link: 'https://exemplo.dev/e/abc',
			code: null,
			codeUrl: 'https://exemplo.dev/codigo'
		});
		expect(email.html).not.toContain('<img src=x');
		expect(email.html).toContain('&lt;img');
		// O texto puro não tem marcação: lá o valor vai como foi digitado.
		expect(email.text).toContain(ataque);
	});

	it('convite para a conta do aluno', () => {
		const email = montarConviteConta({
			studentName: ataque,
			teacherName: ataque,
			classroomName: ataque,
			link: 'https://exemplo.dev/aluno/convite/abc'
		});
		expect(email.html).not.toContain('<img src=x');
		expect(email.html).toContain('&lt;img');
		// O link vai no botão E em texto: cliente de e-mail engole botão.
		expect(email.html.split('https://exemplo.dev/aluno/convite/abc').length).toBeGreaterThan(2);
		expect(email.text).toContain('https://exemplo.dev/aluno/convite/abc');
		// E diz que a conta é opcional: responder continua sem ela.
		expect(email.text).toContain('opcional');
	});

	it('aviso para a equipe', () => {
		const email = montarAvisoEquipe({ assunto: ataque, texto: `linha 1\n${ataque}` });
		expect(email.html).not.toContain('<img src=x');
	});
});
