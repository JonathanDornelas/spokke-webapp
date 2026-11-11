import type { EmailParaEnviar } from './index';
import {
	COR,
	DISPLAY,
	MONO,
	SANS,
	apoio,
	botao,
	escaparHtml,
	iniciais,
	linkReserva,
	moldura,
	nota,
	paragrafo,
	primeiroNome,
	rotulo,
	secao,
	titulo
} from './base';

/**
 * O e-mail de convite: a atividade que o professor mandou para um aluno da chamada.
 *
 * Regras que valem como conteúdo, não como estilo (paginas.md "Turmas"):
 * - o link cru aparece SEMPRE em texto, não só atrás do botão, porque cliente de e-mail
 *   engole botão;
 * - o código de acesso vem depois dele, como terceira alternativa;
 * - sem pixel de rastreio e sem imagem remota (o logo vai embutido — base.ts). A abertura só
 *   é registrada quando o aluno clica no link.
 *
 * O professor aparece pelo NOME, nunca por "sua professora": quem manda pode ser professor ou
 * professora, e o e-mail não sabe.
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

// Um número da atividade (questões, minutos, tentativa), numa célula com fundo.
function ficha(valor: string, legenda: string): string {
	return `<td width="33%" valign="top" style="padding:0 4px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td align="center" bgcolor="${COR.fundo}" style="background:${COR.fundo};border-radius:10px;padding:12px 6px;">
      <p style="font-family:${DISPLAY};font-size:22px;line-height:1.1;font-weight:700;color:${COR.texto};margin:0;">${valor}</p>
      <p style="font-family:${SANS};font-size:12px;line-height:1.4;color:${COR.suave};margin:3px 0 0;">${legenda}</p>
    </td>
  </tr></table>
</td>`;
}

export function montarConviteAluno(dados: ConviteAluno): EmailParaEnviar {
	const nome = primeiroNome(dados.studentName);
	const professor = primeiroNome(dados.teacherName);
	const idioma = dados.languageLabel.toLowerCase();
	// Tudo que veio de uma pessoa é escapado antes de entrar no HTML (base.ts). O texto puro,
	// mais abaixo, usa os valores crus — lá não há marcação.
	const h = {
		nome: escaparHtml(nome),
		professor: escaparHtml(professor),
		teacherName: escaparHtml(dados.teacherName),
		activityTitle: escaparHtml(dados.activityTitle),
		classroomName: escaparHtml(dados.classroomName),
		codeUrl: escaparHtml(dados.codeUrl),
		code: dados.code ? escaparHtml(dados.code) : null,
		iniciais: escaparHtml(iniciais(dados.teacherName))
	};
	const preheader = `${dados.itemCount} questões de ${idioma}, uns ${dados.minutes} minutos, sem criar conta.`;

	// O cartão da atividade: quem mandou, para qual turma, o título e os três números.
	const cartao = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${COR.linha};border-radius:14px;">
<tr><td style="padding:18px 18px 4px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
    <td width="40" height="40" align="center" valign="middle" bgcolor="${COR.chip}" style="width:40px;height:40px;background:${COR.chip};border-radius:20px;font-family:${SANS};font-size:14px;font-weight:700;color:${COR.marca};">${h.iniciais}</td>
    <td valign="middle" style="padding:0 0 0 12px;">
      <p style="font-family:${SANS};font-size:14px;line-height:1.4;font-weight:700;color:${COR.texto};margin:0;">${h.teacherName}</p>
      <p style="font-family:${SANS};font-size:12.5px;line-height:1.4;color:${COR.suave};margin:2px 0 0;">turma ${h.classroomName}</p>
    </td>
  </tr></table>
</td></tr>
<tr><td style="padding:14px 18px 16px;">
  <p style="font-family:${SANS};font-size:17px;line-height:1.4;font-weight:700;color:${COR.texto};margin:0;">${h.activityTitle}</p>
</td></tr>
<tr><td style="padding:0 14px 18px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    ${ficha(String(dados.itemCount), 'questões')}
    ${ficha(`~${dados.minutes}`, 'minutos')}
    ${ficha('1×', 'tentativa')}
  </tr></table>
</td></tr>
</table>`;

	const codigo = h.code
		? `<p style="font-family:${SANS};font-size:13px;line-height:1.5;color:${COR.suave};margin:14px 0 6px;word-break:normal;">Ou entre em ${h.codeUrl} e digite o código:</p>
<p style="font-family:${MONO};font-size:22px;line-height:1.2;font-weight:700;letter-spacing:0.28em;color:${COR.marca};margin:0;word-break:normal;">${h.code}</p>`
		: '';

	const corpo = [
		secao(
			rotulo(`Atividade de ${idioma}`) +
				titulo(`Oi, ${h.nome}.`) +
				paragrafo(
					`${h.professor} mandou uma atividade para você fazer. Dá para responder pelo celular, sem instalar nada.`,
					'margin-bottom:22px;'
				),
			{ topo: 36 }
		),
		secao(cartao, { base: 24 }),
		secao(
			botao('Começar a atividade', dados.link) +
				apoio('Sem conta, sem senha, sem instalar aplicativo.'),
			{
				base: 24
			}
		),
		secao(linkReserva(dados.link, codigo), { base: 24 }),
		secao(
			nota(
				`<strong style="color:${COR.texto};">Este link é só seu.</strong> É ele que faz o seu nome aparecer certo na lista de ${h.professor}. Quem receber o link responde no seu lugar, então não repasse.`
			),
			{ base: 16 }
		),
		secao(
			paragrafo(
				`Se você tiver uma conta no Spokke, entre nela antes de clicar: assim esta turma passa a aparecer no seu histórico. A conta é opcional — sem ela o link funciona igual.`,
				`font-size:14px;color:${COR.suave};margin:0;`
			)
		)
	].join('\n');

	const html = moldura({
		titulo: dados.activityTitle,
		preheader,
		corpo,
		rodape: `Você recebeu este e-mail porque ${h.teacherName} cadastrou seu nome na turma ${h.classroomName}. O Spokke não pede senha, telefone, documento nem foto — só o nome e o e-mail que ${h.professor} cadastrou.`
	});

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
		subject: `${dados.teacherName} mandou uma atividade de ${idioma} para você`,
		preheader,
		html,
		text
	};
}
