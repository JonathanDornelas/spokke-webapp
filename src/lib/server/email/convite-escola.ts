import type { EmailParaEnviar } from './index';
import {
	apoio,
	botao,
	escaparHtml,
	linkReserva,
	lista,
	moldura,
	paragrafo,
	rotulo,
	secao,
	titulo
} from './base';
import type { ConviteEscolaJob } from '$lib/server/queue';

/**
 * O convite para um PROFESSOR entrar numa escola. Diz com todas as letras o que muda ao
 * aceitar — o plano passa a ser o da escola, e a coordenação passa a ver os NÚMEROS das turmas
 * dele, nunca nome de aluno nem resposta — porque aceitar é dar a terceiros uma visão sobre o
 * trabalho dele (docs/adr-005-escola.md).
 */
export function montarConviteEscola(dados: ConviteEscolaJob): EmailParaEnviar {
	const papel = dados.role === 'coordenacao' ? 'na coordenação' : 'como professor';
	const ate = new Date(dados.expiresAt).toLocaleDateString('pt-BR', {
		day: 'numeric',
		month: 'long'
	});
	const preheader = `Convite para entrar ${papel} em ${dados.schoolName}. Vale até ${ate}.`;

	const corpo = [
		secao(
			rotulo('Convite de escola') +
				titulo(`${escaparHtml(dados.schoolName)} convidou você`) +
				paragrafo(
					`${escaparHtml(dados.quemConvidou)} convidou você para entrar ${papel} no Spokke da escola. Ao aceitar:`
				) +
				lista([
					'seu plano passa a ser o da escola, com os limites do contrato;',
					'a coordenação vê os <strong>números</strong> das suas turmas — nunca o nome de um aluno nem uma resposta;',
					'suas atividades, materiais e resultados continuam seus, inclusive se você sair.'
				]),
			{ topo: 36, base: 8 }
		),
		secao(
			botao('Ver o convite', dados.link) +
				apoio(`O convite vale até ${escaparHtml(ate)} e só pode ser aceito uma vez.`),
			{ base: 24 }
		),
		secao(linkReserva(dados.link))
	].join('\n');

	const html = moldura({
		titulo: `Convite — ${dados.schoolName}`,
		preheader,
		corpo,
		rodape: 'Se você não esperava por este convite, é só ignorar: nada muda na sua conta.'
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
