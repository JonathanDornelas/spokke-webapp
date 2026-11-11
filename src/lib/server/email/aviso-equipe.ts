import type { EmailParaEnviar } from './index';
import { COR, SANS, escaparHtml, moldura, rotulo, secao } from './base';

/**
 * O aviso para a EQUIPE: o formulário de contato e o pedido de plano. Vai para `CONTATO_PARA`,
 * nunca para um aluno, e por isso é simples — um assunto e um texto. O texto é escapado linha
 * a linha: ele carrega o que a pessoa digitou.
 */
export interface AvisoEquipe {
	assunto: string;
	texto: string;
}

export function montarAvisoEquipe(dados: AvisoEquipe): EmailParaEnviar {
	const linhas = dados.texto
		.split('\n')
		.map(
			(linha) =>
				`<p style="font-family:${SANS};font-size:15px;line-height:1.6;color:${COR.corpo};margin:0 0 6px;white-space:pre-wrap;word-break:break-word;">${escaparHtml(linha) || '&nbsp;'}</p>`
		)
		.join('\n');

	const html = moldura({
		titulo: dados.assunto,
		preheader: dados.texto.slice(0, 120),
		interno: true,
		corpo: secao(
			rotulo('Aviso para a equipe') +
				`<p style="font-family:${SANS};font-size:19px;line-height:1.35;font-weight:700;color:${COR.texto};margin:0 0 16px;">${escaparHtml(dados.assunto)}</p>` +
				linhas,
			{ topo: 32 }
		),
		rodape: 'Saiu do site do Spokke para a caixa da equipe.'
	});

	return {
		to: '',
		subject: dados.assunto,
		preheader: dados.texto.slice(0, 120),
		html,
		text: dados.texto
	};
}
