import { LOGO } from './logo';

/**
 * O que todo e-mail do produto compartilha: a paleta, as fontes, a moldura e — o mais
 * importante — `escaparHtml`.
 *
 * **O desenho.** Uma faixa azul da marca de ponta a ponta com o logo em branco, o conteúdo
 * em fundo branco (rótulo pequeno, título grande, texto, uma ação) e um rodapé claro com o
 * porquê do e-mail. Era um cartão branco centralizado sobre cinza, com "Spokke" escrito em
 * texto — o desenho que mais lê como gerado (diretrizes da skill de templates de e-mail).
 *
 * **A largura.** A tabela do conteúdo é `width="100%"` com `max-width:600px`, e o Outlook
 * (que ignora `max-width`) ganha uma tabela fixa de 600px em comentário condicional. Antes era
 * `width:600px; max-width:100%`, que o Gmail do celular não encolhe: o e-mail estourava a
 * tela. O link cru vai numa caixa `table-layout:fixed` — é ela que obriga o endereço longo a
 * quebrar mesmo onde o cliente ignora `word-break`.
 *
 * **Tabela, cor literal, sem `var()`, sem flexbox** (server.md "E-mail"): cliente de e-mail
 * não é browser moderno. **Sem imagem remota**: o logo vai EMBUTIDO (`anexosDoEmail`), e
 * nada é buscado no servidor quando a mensagem abre.
 *
 * **Todo texto que veio de uma pessoa passa por `escaparHtml`** antes de entrar no HTML: nome
 * de professor, título de atividade, nome de turma, de módulo, de escola, a mensagem do
 * formulário de contato. Sem isso, um título como `<a href="...">clique</a>` virava um link de
 * verdade no e-mail de uma turma inteira. Os ajudantes abaixo recebem HTML JÁ escapado, menos
 * os que dizem receber texto.
 */

// A paleta, literal (e-mail não tem variável de CSS). Os mesmos valores do tema claro do site.
export const COR = {
	marca: '#3659CB',
	marcaClara: '#CCDBFF',
	texto: '#111A31', // título
	corpo: '#3A4766', // parágrafo (9:1 sobre branco)
	suave: '#5B6B93', // nota, rodapé (5,3:1 sobre branco)
	linha: '#D9E1F4',
	fundo: '#F2F5FC', // rodapé, caixas
	chip: '#DEE6F9',
	branco: '#FFFFFF'
} as const;

// Sem fonte remota (o Google Fonts também é busca externa): a primeira de cada pilha é a do
// site, para quem a tiver instalada; o resto é o que todo cliente tem.
export const SANS = "'Plus Jakarta Sans', 'Segoe UI', Helvetica, Arial, sans-serif";
export const DISPLAY = "'Bricolage Grotesque', 'Segoe UI', Helvetica, Arial, sans-serif";
export const MONO = "'JetBrains Mono', Consolas, 'Courier New', monospace";

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

/** O endereço de suporte que o rodapé oferece (o mesmo das páginas legais). */
export const SUPORTE = 'suporte@spokke.com.br';

/**
 * O logo, como anexo INLINE, para o provedor de envio juntar ao e-mail que o usa. Só quando o
 * HTML aponta para ele: o aviso no log, ou um e-mail sem moldura, não carrega 4 KB à toa.
 */
export function anexosDoEmail(html: string): {
	filename: string;
	content: Buffer;
	cid: string;
	contentType: string;
	contentDisposition: 'inline';
}[] {
	if (!html.includes(`cid:${LOGO.cid}`)) return [];
	return [
		{
			filename: 'spokke.png',
			content: Buffer.from(LOGO.png, 'base64'),
			cid: LOGO.cid,
			contentType: 'image/png',
			contentDisposition: 'inline'
		}
	];
}

// Uma linha da tabela de 600px, com o respiro lateral que encolhe no celular (`sp-px`).
function faixa600(conteudo: string, fundo: string): string {
	return `<tr><td align="center" bgcolor="${fundo}" style="background:${fundo};">
<!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;margin:0 auto;">
${conteudo}
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>`;
}

/**
 * A moldura: a faixa azul com o logo, o corpo (linhas de `secao`, HTML já escapado) e o rodapé.
 * `titulo` e `preheader` são texto puro — escapados aqui. `rodape` é HTML já escapado: o porquê
 * de a pessoa receber este e-mail. `interno` (o aviso para a equipe) tira a linha do suporte.
 */
export function moldura(opcoes: {
	titulo: string;
	preheader: string;
	corpo: string;
	rodape?: string;
	interno?: boolean;
}): string {
	// O preenchimento invisível depois do preheader impede o cliente de completar a prévia da
	// caixa de entrada com o começo do corpo.
	const enchimento = '&#847;&zwnj;&nbsp;'.repeat(60);
	const logo = `<img src="cid:${LOGO.cid}" width="${LOGO.largura}" height="${LOGO.altura}" alt="Spokke" style="display:block;border:0;outline:none;width:${LOGO.largura}px;height:${LOGO.altura}px;font-family:${DISPLAY};font-size:20px;font-weight:800;line-height:${LOGO.altura}px;color:${COR.branco};" />`;
	const suporte = opcoes.interno
		? ''
		: `<p style="font-family:${SANS};font-size:12.5px;line-height:1.6;color:${COR.suave};margin:0 0 10px;">Dúvidas? Escreva para <a href="mailto:${SUPORTE}" style="color:${COR.marca};text-decoration:underline;">${SUPORTE}</a>.</p>`;
	const motivo = opcoes.rodape
		? `<p style="font-family:${SANS};font-size:12.5px;line-height:1.6;color:${COR.suave};margin:0 0 10px;">${opcoes.rodape}</p>`
		: '';

	return `<!doctype html>
<html lang="pt-BR" xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>${escaparHtml(opcoes.titulo)}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>
  body { margin:0; padding:0; width:100% !important; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
  table { border-collapse:collapse; }
  @media (max-width:620px) {
    .sp-px { padding-left:20px !important; padding-right:20px !important; }
    .sp-titulo { font-size:24px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${COR.fundo};">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${COR.fundo};">${escaparHtml(opcoes.preheader)}${enchimento}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COR.fundo}" style="background:${COR.fundo};">
${faixa600(`<tr><td class="sp-px" style="padding:24px 32px;">${logo}</td></tr>`, COR.marca)}
${faixa600(`${opcoes.corpo}\n<tr><td style="padding:0 0 36px;font-size:0;line-height:0;">&nbsp;</td></tr>`, COR.branco)}
${faixa600(
	`<tr><td class="sp-px" style="padding:26px 32px 34px;">
${motivo}
${suporte}
<p style="font-family:${SANS};font-size:12.5px;line-height:1.6;color:${COR.suave};margin:0;"><strong style="color:${COR.texto};">Spokke</strong> · exercícios de idiomas com o material da sua aula · <a href="https://spokke.com.br" style="color:${COR.marca};text-decoration:none;">spokke.com.br</a></p>
</td></tr>`,
	COR.fundo
)}
</table>
</body></html>`;
}

/** Uma linha do corpo, com o respiro lateral. `html` já escapado. */
export function secao(html: string, espaco: { topo?: number; base?: number } = {}): string {
	const { topo = 0, base = 0 } = espaco;
	return `<tr><td class="sp-px" style="padding:${topo}px 32px ${base}px;">${html}</td></tr>`;
}

/** O rótulo pequeno acima do título ("CONVITE DE TURMA"). Recebe TEXTO. */
export function rotulo(texto: string): string {
	return `<p style="font-family:${SANS};font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${COR.marca};margin:0 0 10px;">${escaparHtml(texto)}</p>`;
}

/** O título da mensagem. `html` já escapado. */
export function titulo(html: string): string {
	return `<h1 class="sp-titulo" style="font-family:${DISPLAY};font-size:28px;line-height:1.2;font-weight:700;letter-spacing:-0.02em;color:${COR.texto};margin:0 0 16px;">${html}</h1>`;
}

/** Um parágrafo de corpo. `html` já escapado. */
export function paragrafo(html: string, estilo = ''): string {
	return `<p style="font-family:${SANS};font-size:16px;line-height:1.6;color:${COR.corpo};margin:0 0 16px;${estilo}">${html}</p>`;
}

/** Uma lista curta. Cada item já escapado. */
export function lista(itens: string[]): string {
	return `<ul style="font-family:${SANS};font-size:15px;line-height:1.65;color:${COR.corpo};margin:0 0 18px;padding:0 0 0 20px;">
${itens.map((item) => `<li style="margin:0 0 6px;">${item}</li>`).join('\n')}
</ul>`;
}

/**
 * O botão principal, à prova de Outlook: a cor está na CÉLULA (`bgcolor`), o respiro do
 * Outlook em `mso-padding-alt` e o dos outros no próprio link — o Outlook ignora `padding` em
 * `<a>`. Chapado, como o botão do site: uma borda de baixo mais escura (o "relevo" sem sombra)
 * saía como um traço reto passando das quinas arredondadas.
 */
export function botao(rotuloDoBotao: string, link: string): string {
	return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td align="center" bgcolor="${COR.marca}" style="background:${COR.marca};border-radius:12px;mso-padding-alt:16px 24px;">
<a href="${escaparHtml(link)}" target="_blank" style="display:block;padding:16px 24px;font-family:${SANS};font-size:17px;font-weight:700;line-height:1.2;color:${COR.branco};text-decoration:none;border-radius:12px;">${escaparHtml(rotuloDoBotao)}</a>
</td></tr>
</table>`;
}

/**
 * O link cru numa caixa, para quando o botão não abre — cliente de e-mail engole botão.
 * `table-layout:fixed` é o que obriga o endereço longo a quebrar dentro da largura.
 * `extra` é HTML já escapado que vai junto na caixa (o código de acesso do convite).
 */
export function linkReserva(link: string, extra = ''): string {
	const href = escaparHtml(link);
	return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="table-layout:fixed;background:${COR.fundo};border-radius:12px;">
<tr><td bgcolor="${COR.fundo}" style="padding:16px 18px;border-radius:12px;word-break:break-all;overflow-wrap:anywhere;">
<p style="font-family:${SANS};font-size:13px;line-height:1.5;font-weight:700;color:${COR.texto};margin:0 0 4px;word-break:normal;">O botão não abriu?</p>
<p style="font-family:${SANS};font-size:13px;line-height:1.5;color:${COR.suave};margin:0 0 8px;word-break:normal;">Copie e cole este endereço na barra do navegador:</p>
<a href="${href}" target="_blank" style="font-family:${MONO};font-size:13px;line-height:1.5;color:${COR.marca};text-decoration:none;word-break:break-all;">${href}</a>
${extra}
</td></tr>
</table>`;
}

/** Uma nota em destaque, com o filete da marca à esquerda. `html` já escapado. */
export function nota(html: string): string {
	return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td style="padding:2px 0 2px 16px;border-left:3px solid ${COR.marca};">
<p style="font-family:${SANS};font-size:14px;line-height:1.6;color:${COR.corpo};margin:0;">${html}</p>
</td></tr>
</table>`;
}

/** Texto pequeno de apoio, logo abaixo de um botão ou de uma caixa. `html` já escapado. */
export function apoio(html: string): string {
	return `<p style="font-family:${SANS};font-size:13px;line-height:1.5;color:${COR.suave};margin:12px 0 0;text-align:center;">${html}</p>`;
}
