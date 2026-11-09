import type { EmailParaEnviar } from './index';
import { COR, DISPLAY, MONO, SANS, escaparHtml, iniciais, primeiroNome } from './base';

/**
 * O e-mail de convite. **Tabela de 600px, cor literal, sem `var()`, sem
 * flexbox, sem grid** — cliente de e-mail não é browser moderno, e um leiaute
 * que depende de CSS atual chega quebrado no Outlook.
 *
 * Regras que valem como conteúdo, não como estilo (paginas.md "Turmas"):
 * - o link cru aparece SEMPRE em texto, não só atrás do botão, porque cliente
 *   de e-mail engole botão;
 * - o código de acesso vem depois dele, como terceira alternativa;
 * - sem pixel de rastreio e sem imagem remota. A abertura só é registrada
 *   quando o aluno clica no link.
 */

export interface ConviteAluno {
	studentName: string;
	teacherName: string;
	activityTitle: string;
	languageLabel: string;
	itemCount: number;
	minutes: number;
	classroomName: string;
	/** O link PESSOAL — `/e/<token>`, diferente do link aberto. */
	link: string;
	/** Código de acesso da publicação, quando existe. */
	code: string | null;
	/** Endereço de `/codigo`, para a terceira alternativa. */
	codeUrl: string;
}

function ficha(valor: string, rotulo: string): string {
	return `<td align="center" style="padding:0 6px;">
    <div style="background:${COR.fundo};border:1px solid ${COR.linha};border-radius:10px;padding:11px 8px;">
      <div style="font-family:${DISPLAY};font-size:20px;font-weight:700;color:${COR.texto};">${valor}</div>
      <div style="font-family:${SANS};font-size:11.5px;color:${COR.suave};padding-top:2px;">${rotulo}</div>
    </div>
  </td>`;
}

export function montarConviteAluno(dados: ConviteAluno): EmailParaEnviar {
	const nome = primeiroNome(dados.studentName);
	const professor = primeiroNome(dados.teacherName);
	// Tudo que veio de uma pessoa é escapado antes de entrar no HTML (base.ts).
	// O texto puro, mais abaixo, usa os valores crus — lá não há marcação.
	const h = {
		nome: escaparHtml(nome),
		professor: escaparHtml(professor),
		teacherName: escaparHtml(dados.teacherName),
		activityTitle: escaparHtml(dados.activityTitle),
		classroomName: escaparHtml(dados.classroomName),
		idioma: escaparHtml(dados.languageLabel.toLowerCase()),
		link: escaparHtml(dados.link),
		codeUrl: escaparHtml(dados.codeUrl),
		code: dados.code ? escaparHtml(dados.code) : null,
		iniciais: escaparHtml(iniciais(dados.teacherName))
	};
	const preheader = `${dados.itemCount} questões de ${dados.languageLabel.toLowerCase()}, uns ${dados.minutes} minutos, sem criar conta.`;

	const blocoCodigo = dados.code
		? `<p style="font-family:${SANS};font-size:13px;color:${COR.suave};margin:14px 0 6px;">Ou entre em ${h.codeUrl} e digite:</p>
       <p style="font-family:${MONO};font-size:20px;font-weight:700;letter-spacing:0.28em;color:${COR.marca};margin:0;">${h.code}</p>`
		: '';

	const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${h.activityTitle}</title></head>
<body style="margin:0;padding:0;background:${COR.fundo};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escaparHtml(preheader)}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${COR.fundo};padding:24px 12px;">
<tr><td align="center">

<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;margin:0 auto;border-collapse:collapse;background:${COR.branco};border:1px solid ${COR.linha};border-radius:14px;">

  <tr><td style="padding:17px 26px;background:${COR.marca};border-radius:13px 13px 0 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
      <td valign="middle"><span style="font-family:${DISPLAY};font-size:19px;font-weight:800;letter-spacing:-0.02em;color:${COR.branco};">Spokke</span></td>
      <td align="right" valign="middle"><span style="font-family:${SANS};font-size:12px;font-weight:600;color:${COR.marcaClara};">Atividade de ${h.idioma}</span></td>
    </tr></table>
  </td></tr>

  <tr><td style="padding:20px 26px;border-bottom:1px solid ${COR.linha};">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
      <td width="50" valign="middle" style="padding:0 13px 0 0;">
        <div style="width:42px;height:42px;line-height:42px;text-align:center;border-radius:21px;background:${COR.chip};color:${COR.marca};font-family:${SANS};font-size:14px;font-weight:700;">${h.iniciais}</div>
      </td>
      <td valign="middle">
        <p style="font-family:${SANS};font-size:15px;font-weight:700;color:${COR.texto};margin:0 0 3px;">${h.teacherName}</p>
        <p style="font-family:${SANS};font-size:12.5px;color:${COR.suave};margin:0;">sua professora de ${h.idioma} · turma ${h.classroomName}</p>
      </td>
    </tr></table>
  </td></tr>

  <tr><td style="padding:24px 26px 22px;">
    <p style="font-family:${DISPLAY};font-size:26px;font-weight:600;letter-spacing:-0.02em;color:${COR.texto};margin:0 0 14px;">Oi, ${h.nome}.</p>
    <p style="font-family:${SANS};font-size:15px;line-height:1.6;color:${COR.suave};margin:0 0 18px;">
      ${h.professor} mandou uma atividade para você fazer. Dá para responder pelo celular, sem instalar nada.
    </p>
    <p style="font-family:${SANS};font-size:16px;font-weight:700;color:${COR.texto};margin:0 0 14px;">${h.activityTitle}</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
      ${ficha(String(dados.itemCount), 'questões')}
      ${ficha(`~${dados.minutes}`, 'minutos')}
      ${ficha('1×', 'tentativa')}
    </tr></table>
  </td></tr>

  <tr><td align="center" style="padding:0 26px 8px;">
    <a href="${h.link}" style="display:block;background:${COR.marca};color:${COR.branco};font-family:${SANS};font-size:17px;font-weight:700;text-decoration:none;padding:16px 24px;border-radius:12px;">Começar a atividade</a>
    <p style="font-family:${SANS};font-size:12.5px;color:${COR.suave};margin:10px 0 0;">Sem conta, sem senha, sem instalar aplicativo.</p>
  </td></tr>

  <tr><td style="padding:22px 26px 0;">
    <div style="border-top:1px solid ${COR.linha};padding-top:18px;">
      <p style="font-family:${SANS};font-size:13px;font-weight:700;color:${COR.texto};margin:0 0 6px;">O botão não abriu?</p>
      <p style="font-family:${SANS};font-size:13px;color:${COR.suave};margin:0 0 6px;">Copie e cole este endereço na barra do navegador:</p>
      <p style="font-family:${MONO};font-size:13px;color:${COR.marca};margin:0;word-break:break-all;">${h.link}</p>
      ${blocoCodigo}
    </div>
  </td></tr>

  <tr><td style="padding:20px 26px 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${COR.fundo};border-radius:12px;">
      <tr><td style="padding:14px 16px;">
        <p style="font-family:${SANS};font-size:12.5px;line-height:1.6;color:${COR.suave};margin:0;">
          <strong style="color:${COR.texto};">Este link é só seu.</strong> É ele que faz o seu nome aparecer certo na lista da ${h.professor}. Quem receber o link responde no seu lugar, então não repasse.
        </p>
        <p style="font-family:${SANS};font-size:12.5px;line-height:1.6;color:${COR.suave};margin:8px 0 0;">
          Se você tiver uma conta no Spokke, entre nela antes de clicar — assim esta turma passa a aparecer no seu histórico. <strong style="color:${COR.texto};">Conta é opcional</strong>: sem ela o link funciona igual.
        </p>
      </td></tr>
    </table>
  </td></tr>

  <tr><td style="padding:18px 26px 24px;">
    <p style="font-family:${SANS};font-size:11.5px;line-height:1.6;color:${COR.suave};margin:0;">
      Você recebeu este e-mail porque ${h.teacherName} cadastrou seu nome na turma ${h.classroomName}. O Spokke não pede senha, telefone, documento nem foto — só o nome e o e-mail que sua professora cadastrou.
    </p>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;

	const text = [
		`Oi, ${nome}.`,
		'',
		`${professor} mandou uma atividade para você: ${dados.activityTitle}`,
		`${dados.itemCount} questões, uns ${dados.minutes} minutos. Sem conta, sem senha.`,
		'',
		dados.link,
		dados.code ? `\nOu entre em ${dados.codeUrl} e digite o código: ${dados.code}` : '',
		'',
		'Este link é só seu — é ele que faz o seu nome aparecer certo na lista.'
	]
		.filter((linha) => linha !== '')
		.join('\n');

	return {
		to: '',
		subject: `${dados.teacherName} mandou uma atividade de ${dados.languageLabel.toLowerCase()} para você`,
		preheader,
		html,
		text
	};
}
