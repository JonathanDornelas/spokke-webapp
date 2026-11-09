import type { EmailParaEnviar } from './index';
import { COR, DISPLAY, SANS, botaoComLink, escaparHtml, moldura, primeiroNome } from './base';

/**
 * O CONVITE DE CONTA: o professor chama o aluno da chamada para criar a conta
 * dele (ou entrar na que já tem) e ligá-la à turma — auth.md "A conta do aluno".
 *
 * Diz para que a conta serve e o que NÃO muda: responder continua sem conta.
 * Exigir conta seria mudar o produto, e é exatamente a promessa que este e-mail
 * não pode quebrar.
 */
export interface ConviteConta {
	studentName: string;
	teacherName: string;
	classroomName: string;
	/** `/aluno/convite/<token>` — o token é a prova de que o convite é dele. */
	link: string;
}

export function montarConviteConta(dados: ConviteConta): EmailParaEnviar {
	const nome = primeiroNome(dados.studentName);
	const professor = primeiroNome(dados.teacherName);
	const preheader = `${professor} chamou você para a turma ${dados.classroomName} no Spokke.`;

	const html = moldura({
		titulo: `Convite — ${dados.classroomName}`,
		preheader,
		etiqueta: 'Convite de turma',
		corpo: `<tr><td style="padding:24px 26px 8px;">
  <p style="font-family:${DISPLAY};font-size:26px;font-weight:600;letter-spacing:-0.02em;color:${COR.texto};margin:0 0 14px;">Oi, ${escaparHtml(nome)}.</p>
  <p style="font-family:${SANS};font-size:15px;line-height:1.6;color:${COR.suave};margin:0 0 14px;">
    ${escaparHtml(dados.teacherName)} chamou você para a turma <strong style="color:${COR.texto};">${escaparHtml(dados.classroomName)}</strong> no Spokke. Com uma conta, você:
  </p>
  <ul style="font-family:${SANS};font-size:14px;line-height:1.7;color:${COR.texto};margin:0 0 18px;padding-left:20px;">
    <li>vê as atividades da turma num mapa, conforme forem liberadas;</li>
    <li>guarda o que já respondeu e reencontra tudo em outro aparelho.</li>
  </ul>
  <p style="font-family:${SANS};font-size:14px;line-height:1.6;color:${COR.suave};margin:0 0 18px;">
    Já tem conta de aluno? É só entrar com ela pelo mesmo botão.
  </p>
</td></tr>
<tr><td style="padding:0 26px 8px;">${botaoComLink('Entrar na turma', dados.link)}</td></tr>
<tr><td style="padding:14px 26px 24px;">
  <p style="font-family:${SANS};font-size:12.5px;line-height:1.6;color:${COR.suave};margin:0;">
    A conta é opcional: as atividades que chegarem por link continuam abrindo sem ela. Se você não esperava por este convite, é só ignorar.
  </p>
</td></tr>`
	});

	const text = [
		`Oi, ${nome}.`,
		'',
		`${dados.teacherName} chamou você para a turma ${dados.classroomName} no Spokke.`,
		'Com uma conta, você vê as atividades da turma num mapa, conforme forem liberadas, e guarda o que já respondeu.',
		'Já tem conta de aluno? Entre com ela pelo mesmo link.',
		'',
		dados.link,
		'',
		'A conta é opcional: as atividades que chegarem por link continuam abrindo sem ela.'
	].join('\n');

	return {
		to: '',
		subject: `${professor} chamou você para a turma ${dados.classroomName}`,
		preheader,
		html,
		text
	};
}
