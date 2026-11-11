import type { EmailParaEnviar } from './index';
import {
	COR,
	botao,
	escaparHtml,
	linkReserva,
	lista,
	moldura,
	paragrafo,
	primeiroNome,
	rotulo,
	secao,
	titulo
} from './base';

/**
 * O CONVITE DE CONTA: o professor chama o aluno da chamada para criar a conta dele (ou entrar
 * na que já tem) e ligá-la à turma — auth.md "A conta do aluno".
 *
 * Diz para que a conta serve e o que NÃO muda: responder continua sem conta. Exigir conta
 * seria mudar o produto, e é exatamente a promessa que este e-mail não pode quebrar.
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

	const corpo = [
		secao(
			rotulo('Convite de turma') +
				titulo(`Oi, ${escaparHtml(nome)}.`) +
				paragrafo(
					`${escaparHtml(dados.teacherName)} chamou você para a turma <strong style="color:${COR.texto};">${escaparHtml(dados.classroomName)}</strong> no Spokke. Com uma conta, você:`
				) +
				lista([
					'vê as atividades da turma num mapa, conforme forem liberadas;',
					'guarda o que já respondeu e reencontra tudo em outro aparelho.'
				]) +
				paragrafo(
					'Já tem conta de aluno? É só entrar com ela pelo mesmo botão.',
					'margin-bottom:24px;'
				),
			{ topo: 36 }
		),
		secao(botao('Entrar na turma', dados.link), { base: 24 }),
		secao(linkReserva(dados.link))
	].join('\n');

	const html = moldura({
		titulo: `Convite — ${dados.classroomName}`,
		preheader,
		corpo,
		rodape:
			'A conta é opcional: as atividades que chegarem por link continuam abrindo sem ela. Se você não esperava por este convite, é só ignorar.'
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
