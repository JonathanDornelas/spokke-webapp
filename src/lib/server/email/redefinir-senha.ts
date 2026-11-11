import type { EmailParaEnviar } from './index';
import { COR, DISPLAY, SANS, botaoComLink, escaparHtml, moldura, primeiroNome } from './base';
import type { RedefinirSenhaJob } from '$lib/server/queue';

/**
 * O link para criar uma senha nova — do professor ou do aluno. Curto de
 * propósito: quem pediu está com a tela de "verifique seu e-mail" aberta e quer
 * só o botão. A frase do fim é a que protege quem NÃO pediu: ignorar não muda
 * nada, a senha atual continua valendo.
 */
export function montarRedefinirSenha(dados: RedefinirSenhaJob): EmailParaEnviar {
	const nome = primeiroNome(dados.nome);
	const preheader = 'O link vale por 1 hora. Se não foi você, é só ignorar.';
	const onde =
		dados.conta === 'aluno' ? 'na sua conta de aluno do Spokke' : 'na sua conta do Spokke';

	const html = moldura({
		titulo: 'Criar uma senha nova',
		preheader,
		etiqueta: 'Senha',
		corpo: `<tr><td style="padding:24px 26px 8px;">
  <p style="font-family:${DISPLAY};font-size:24px;font-weight:600;letter-spacing:-0.02em;color:${COR.texto};margin:0 0 12px;">Olá, ${escaparHtml(nome)}</p>
  <p style="font-family:${SANS};font-size:15px;line-height:1.6;color:${COR.suave};margin:0 0 18px;">
    Recebemos um pedido para criar uma senha nova ${onde}. Toque no botão para escolher a nova senha.
  </p>
</td></tr>
<tr><td style="padding:0 26px 8px;">${botaoComLink('Criar senha nova', dados.link)}</td></tr>
<tr><td style="padding:14px 26px 24px;">
  <p style="font-family:${SANS};font-size:12.5px;line-height:1.6;color:${COR.suave};margin:0;">
    O link vale por 1 hora e só funciona uma vez. Se você não pediu, ignore este e-mail: a sua senha atual continua valendo.
  </p>
</td></tr>`
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
