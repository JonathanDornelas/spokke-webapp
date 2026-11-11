import type { EmailParaEnviar } from './index';
import {
	COR,
	apoio,
	botao,
	escaparHtml,
	linkReserva,
	moldura,
	nota,
	paragrafo,
	primeiroNome,
	rotulo,
	secao,
	titulo
} from './base';
import type { RedefinirSenhaJob } from '$lib/server/queue';

/**
 * O link para criar uma senha nova — do professor ou do aluno. Curto de propósito: quem pediu
 * está com a tela de "verifique seu e-mail" aberta e quer só o botão. A nota do fim é a que
 * protege quem NÃO pediu: ignorar não muda nada, a senha atual continua valendo.
 */
export function montarRedefinirSenha(dados: RedefinirSenhaJob): EmailParaEnviar {
	const nome = primeiroNome(dados.nome);
	const preheader = 'O link vale por 1 hora. Se não foi você, é só ignorar.';
	const onde =
		dados.conta === 'aluno' ? 'na sua conta de aluno do Spokke' : 'na sua conta do Spokke';

	const corpo = [
		secao(
			rotulo('Senha') +
				titulo(`Olá, ${escaparHtml(nome)}`) +
				paragrafo(
					`Recebemos um pedido para criar uma senha nova ${onde}. Toque no botão para escolher a nova senha.`,
					'margin-bottom:24px;'
				),
			{ topo: 36 }
		),
		secao(
			botao('Criar senha nova', dados.link) +
				apoio('O link vale por 1 hora e só funciona uma vez.'),
			{ base: 24 }
		),
		secao(linkReserva(dados.link), { base: 24 }),
		secao(
			nota(
				`<strong style="color:${COR.texto};">Não foi você?</strong> Ignore este e-mail: a sua senha atual continua valendo.`
			)
		)
	].join('\n');

	const html = moldura({
		titulo: 'Criar uma senha nova',
		preheader,
		corpo,
		rodape: `Você recebeu este e-mail porque alguém pediu uma senha nova ${onde} com este endereço.`
	});

	const text = [
		`Olá, ${nome}.`,
		'',
		`Recebemos um pedido para criar uma senha nova ${onde}. Abra o link para escolher a nova senha:`,
		'',
		dados.link,
		'',
		'O link vale por 1 hora e só funciona uma vez. Se você não pediu, ignore este e-mail: a sua senha atual continua valendo.'
	].join('\n');

	return { to: '', subject: 'Criar uma senha nova no Spokke', preheader, html, text };
}
