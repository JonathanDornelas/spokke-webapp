/**
 * O que todo e-mail do produto compartilha: cores literais, fontes, a moldura
 * de 600px e — o mais importante — `escaparHtml`.
 *
 * **Tabela de 600px, cor literal, sem `var()`, sem flexbox** (server.md
 * "E-mail"): cliente de e-mail não é browser moderno.
 *
 * **Todo texto que veio de uma pessoa passa por `escaparHtml`** antes de entrar
 * no HTML: nome de professor, título de atividade, nome de turma, de módulo, de
 * escola, a mensagem do formulário de contato. Sem isso, um título como
 * `<a href="...">clique</a>` virava um link de verdade no e-mail de uma turma
 * inteira.
 */

export const COR = {
	marca: '#3659CB',
	marcaClara: '#CCDBFF',
	texto: '#111A31',
	suave: '#5B6B93',
	linha: '#D9E1F4',
	fundo: '#F2F5FC',
	chip: '#DEE6F9',
	branco: '#FFFFFF'
} as const;

export const SANS = "'Plus Jakarta Sans', 'Segoe UI', Arial, sans-serif";
export const DISPLAY = "'Bricolage Grotesque', 'Segoe UI', Arial, sans-serif";
export const MONO = "'JetBrains Mono', 'Courier New', monospace";

const ENTIDADES: Record<string, string> = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
	"'": '&#39;'
};

/** Escapa texto para entrar no corpo OU num atributo HTML entre aspas. */
export function escaparHtml(texto: string): string {
	return texto.replace(/[&<>"']/g, (c) => ENTIDADES[c]);
}

export function iniciais(nome: string): string {
	return (
		nome
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((parte) => parte[0]?.toUpperCase())
			.join('') || '?'
	);
}

/** Só o primeiro nome: "Oi, Juliana." lê melhor que o nome completo. */
export function primeiroNome(nome: string): string {
	return nome.split(/\s+/)[0] || nome;
}

/**
 * A moldura: cabeçalho azul com a marca, o corpo (HTML já montado e já
 * escapado por quem chama) e o fundo. `titulo` e `preheader` são texto puro —
 * escapados aqui.
 */
export function moldura(opcoes: {
	titulo: string;
	preheader: string;
	etiqueta?: string;
	corpo: string;
}): string {
	const etiqueta = opcoes.etiqueta
		? `<td align="right" valign="middle"><span style="font-family:${SANS};font-size:12px;font-weight:600;color:${COR.marcaClara};">${escaparHtml(opcoes.etiqueta)}</span></td>`
		: '';
	return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escaparHtml(opcoes.titulo)}</title></head>
<body style="margin:0;padding:0;background:${COR.fundo};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escaparHtml(opcoes.preheader)}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${COR.fundo};padding:24px 12px;">
<tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;margin:0 auto;border-collapse:collapse;background:${COR.branco};border:1px solid ${COR.linha};border-radius:14px;">
  <tr><td style="padding:17px 26px;background:${COR.marca};border-radius:13px 13px 0 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
      <td valign="middle"><span style="font-family:${DISPLAY};font-size:19px;font-weight:800;letter-spacing:-0.02em;color:${COR.branco};">Spokke</span></td>
      ${etiqueta}
    </tr></table>
  </td></tr>
${opcoes.corpo}
</table>
</td></tr></table>
</body></html>`;
}

/** Um parágrafo de corpo. `html` já precisa estar escapado. */
export function paragrafo(html: string, estilo = ''): string {
	return `<p style="font-family:${SANS};font-size:15px;line-height:1.6;color:${COR.suave};margin:0 0 14px;${estilo}">${html}</p>`;
}

/** O botão principal, com o link cru logo abaixo — cliente de e-mail engole botão. */
export function botaoComLink(rotulo: string, link: string): string {
	const href = escaparHtml(link);
	return `<a href="${href}" style="display:block;background:${COR.marca};color:${COR.branco};font-family:${SANS};font-size:17px;font-weight:700;text-decoration:none;padding:16px 24px;border-radius:12px;text-align:center;">${escaparHtml(rotulo)}</a>
<p style="font-family:${SANS};font-size:13px;color:${COR.suave};margin:12px 0 4px;">O botão não abriu? Copie e cole este endereço:</p>
<p style="font-family:${MONO};font-size:13px;color:${COR.marca};margin:0;word-break:break-all;">${href}</p>`;
}
