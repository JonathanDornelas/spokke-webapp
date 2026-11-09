import type { EmailParaEnviar } from './index';
import { COR, DISPLAY, SANS, botaoComLink, escaparHtml, moldura } from './base';
import type { ConviteEscolaJob } from '$lib/server/queue';

/**
 * O convite para um PROFESSOR entrar numa escola. Diz com todas as letras o que
 * muda ao aceitar — o plano passa a ser o da escola, e a coordenação passa a ver
 * os NÚMEROS das turmas dele, nunca nome de aluno nem resposta — porque aceitar
 * é dar a terceiros uma visão sobre o trabalho dele (docs/adr-005-escola.md).
 */
export function montarConviteEscola(dados: ConviteEscolaJob): EmailParaEnviar {
	const papel = dados.role === 'coordenacao' ? 'na coordenação' : 'como professor';
	const ate = new Date(dados.expiresAt).toLocaleDateString('pt-BR', {
		day: 'numeric',
		month: 'long'
	});
	const preheader = `Convite para entrar ${papel} em ${dados.schoolName}. Vale até ${ate}.`;

	const html = moldura({
		titulo: `Convite — ${dados.schoolName}`,
		preheader,
		etiqueta: 'Convite de escola',
		corpo: `<tr><td style="padding:24px 26px 8px;">
  <p style="font-family:${DISPLAY};font-size:24px;font-weight:600;letter-spacing:-0.02em;color:${COR.texto};margin:0 0 12px;">${escaparHtml(dados.schoolName)} convidou você</p>
  <p style="font-family:${SANS};font-size:15px;line-height:1.6;color:${COR.suave};margin:0 0 14px;">
    ${escaparHtml(dados.quemConvidou)} convidou você para entrar ${papel} no Spokke da escola. Ao aceitar:
  </p>
  <ul style="font-family:${SANS};font-size:14px;line-height:1.7;color:${COR.texto};margin:0 0 18px;padding-left:20px;">
    <li>seu plano passa a ser o da escola, com os limites do contrato;</li>
    <li>a coordenação vê os <strong>números</strong> das suas turmas — nunca o nome de um aluno nem uma resposta;</li>
    <li>suas atividades, materiais e resultados continuam seus, inclusive se você sair.</li>
  </ul>
</td></tr>
<tr><td style="padding:0 26px 8px;">${botaoComLink('Ver o convite', dados.link)}</td></tr>
<tr><td style="padding:14px 26px 24px;">
  <p style="font-family:${SANS};font-size:12.5px;line-height:1.6;color:${COR.suave};margin:0;">
    O convite vale até ${escaparHtml(ate)} e só pode ser aceito uma vez. Se você não esperava por ele, é só ignorar.
  </p>
</td></tr>`
	});

	const text = [
		`${dados.schoolName} convidou você para entrar ${papel} no Spokke.`,
		'',
		'Ao aceitar: seu plano passa a ser o da escola; a coordenação vê os números das suas turmas (nunca nomes de alunos nem respostas); seu conteúdo continua seu.',
		'',
		dados.link,
		'',
		`Vale até ${ate}, uma vez só.`
	].join('\n');

	return {
		to: '',
		subject: `Convite: entrar em ${dados.schoolName} no Spokke`,
		preheader,
		html,
		text
	};
}
