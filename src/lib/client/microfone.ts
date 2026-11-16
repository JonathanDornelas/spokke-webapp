/**
 * Por que o microfone não grava, e o que o aluno faz para resolver.
 *
 * O `getUserMedia` recusa por motivos diferentes, e cada um pede outra coisa do
 * aluno: liberar o site no navegador, liberar o navegador no aparelho, conectar
 * um microfone, fechar o app que o prendeu. Antes todos viravam "não
 * conseguimos usar o microfone", e quem tinha o microfone preso numa chamada ia
 * procurar uma permissão que já estava dada.
 *
 * O caminho da permissão muda com o aparelho e o navegador (o "aA" do Safari no
 * iPhone, o ícone à esquerda do endereço no Chrome), então a instrução sai do
 * `userAgent`. Ela só aparece DEPOIS de algo falhar — nada aqui decide se a
 * questão abre.
 *
 * Puro: quem lê o `navigator` é `lerAmbiente()`, e os testes passam o ambiente.
 */

export type ImpedimentoDoMicrofone =
	/** O aluno, ou o navegador, recusou o microfone para este site. */
	| 'negado'
	/** O aluno fechou o pedido de permissão sem escolher (o Chrome conta isso como recusa). */
	| 'dispensado'
	/** O sistema (Windows, macOS, Android) não deixa o navegador usar o microfone. */
	| 'negado-sistema'
	/** O aparelho não tem microfone, ou nenhum está conectado. */
	| 'sem-microfone'
	/** Outro app (uma chamada, um gravador) está usando o microfone. */
	| 'ocupado'
	/** A página não está em https: o navegador nem oferece o microfone. */
	| 'inseguro'
	/** O navegador não grava áudio. */
	| 'indisponivel';

export const IMPEDIMENTOS: readonly ImpedimentoDoMicrofone[] = [
	'negado',
	'dispensado',
	'negado-sistema',
	'sem-microfone',
	'ocupado',
	'inseguro',
	'indisponivel'
];

/** Para o diário que acompanha o relato de problema. */
export const DESCRICAO_DO_IMPEDIMENTO: Record<ImpedimentoDoMicrofone, string> = {
	negado: 'o navegador recusou o microfone',
	dispensado: 'o pedido de permissão foi fechado sem resposta',
	'negado-sistema': 'o sistema não deixa o navegador usar o microfone',
	'sem-microfone': 'nenhum microfone encontrado',
	ocupado: 'o microfone está preso em outro app',
	inseguro: 'a página não está em https',
	indisponivel: 'este navegador não grava áudio'
};

function nomeEMensagem(erro: unknown): { nome: string; mensagem: string } {
	if (typeof erro !== 'object' || erro === null) return { nome: '', mensagem: '' };
	const { name, message } = erro as { name?: unknown; message?: unknown };
	return {
		nome: typeof name === 'string' ? name : '',
		mensagem: typeof message === 'string' ? message : ''
	};
}

/**
 * O impedimento a partir da recusa do `getUserMedia`. Os nomes antigos
 * (`PermissionDeniedError`, `DevicesNotFoundError`, `TrackStartError`) são do
 * Chrome de antes da especificação, e ainda aparecem em WebView velho.
 */
export function impedimentoDoErro(erro: unknown): ImpedimentoDoMicrofone {
	const { nome, mensagem } = nomeEMensagem(erro);
	switch (nome) {
		case 'NotAllowedError':
		case 'PermissionDeniedError':
			// O Chrome diz "Permission denied by system" quando quem bloqueia é o
			// Windows, o macOS ou o Android, e não o site; e "Permission dismissed"
			// quando o aluno fechou o pedido — aí basta tocar de novo.
			if (/system/i.test(mensagem)) return 'negado-sistema';
			return /dismiss/i.test(mensagem) ? 'dispensado' : 'negado';
		case 'NotFoundError':
		case 'DevicesNotFoundError':
		case 'OverconstrainedError':
			return 'sem-microfone';
		case 'NotReadableError':
		case 'TrackStartError':
		case 'AbortError':
			return 'ocupado';
		default:
			// `SecurityError` (uma política da página) e o que não se conhece: o
			// caminho que mais resolve é o da permissão.
			return 'negado';
	}
}

/** Nome do erro, para o diário: "NotAllowedError", sem a mensagem do navegador. */
export function nomeDoErro(erro: unknown): string {
	return nomeEMensagem(erro).nome.slice(0, 40) || 'erro sem nome';
}

export type Sistema = 'ios' | 'android' | 'windows' | 'mac' | 'outro';
export type Navegador = 'safari' | 'chrome' | 'edge' | 'firefox' | 'samsung' | 'outro';

export interface Ambiente {
	sistema: Sistema;
	navegador: Navegador;
	/** O navegador embutido de um app (Instagram, Facebook, TikTok…), não o do aparelho. */
	dentroDeApp: boolean;
}

const APPS =
	/FBAN|FBAV|FB_IAB|FBIOS|Instagram|Line\/|TikTok|musical_ly|BytedanceWebview|LinkedInApp|Snapchat|Pinterest|Twitter/i;

/**
 * O aparelho e o navegador, pelo `userAgent`. O iPad se apresenta como Mac
 * desde o iPadOS 13; o que o denuncia é a tela de toque.
 */
export function ambienteDe(ua: string, pontosDeToque = 0): Ambiente {
	const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && pontosDeToque > 1);
	const sistema: Sistema = ios
		? 'ios'
		: /Android/.test(ua)
			? 'android'
			: /Windows/.test(ua)
				? 'windows'
				: /Macintosh|Mac OS X/.test(ua)
					? 'mac'
					: 'outro';
	const navegador: Navegador = /SamsungBrowser/.test(ua)
		? 'samsung'
		: /Edg(e|A|iOS)?\//.test(ua)
			? 'edge'
			: /Firefox|FxiOS/.test(ua)
				? 'firefox'
				: /Chrome|CriOS|Chromium/.test(ua)
					? 'chrome'
					: /Safari\//.test(ua)
						? 'safari'
						: 'outro';
	// No iPhone o navegador de um app é um WKWebView, que não diz "Safari/"; no
	// Android é o WebView do sistema, que diz "; wv)".
	const dentroDeApp =
		APPS.test(ua) || /; wv\)/.test(ua) || (ios && !/Safari\//.test(ua) && navegador === 'outro');
	return { sistema, navegador, dentroDeApp };
}

export function lerAmbiente(): Ambiente {
	if (typeof navigator === 'undefined')
		return { sistema: 'outro', navegador: 'outro', dentroDeApp: false };
	return ambienteDe(navigator.userAgent, navigator.maxTouchPoints ?? 0);
}

/** O que a tela diz: o que aconteceu (com a saída de pular) e, quando há, o caminho. */
export interface AjudaDoMicrofone {
	titulo: string;
	passo: string | null;
}

const NOME_DO_NAVEGADOR: Record<Navegador, string> = {
	safari: 'Safari',
	chrome: 'Chrome',
	edge: 'Edge',
	firefox: 'Firefox',
	samsung: 'Samsung Internet',
	outro: 'navegador'
};

const celular = (a: Ambiente) => a.sistema === 'ios' || a.sistema === 'android';

const ABRIR_FORA_DO_APP = 'No menu do app (⋯ ou ⋮), escolha “Abrir no navegador”.';

/** Onde se libera o microfone para ESTE site, em cada navegador. */
function passoDoSite(a: Ambiente): string {
	if (a.sistema === 'ios') {
		return a.navegador === 'safari' || a.navegador === 'outro'
			? 'Toque em aA, ao lado do endereço › Ajustes do Site › Microfone › Permitir.'
			: `Recarregue a página e escolha Permitir. Se ele não perguntar, ligue o Microfone em Ajustes › ${NOME_DO_NAVEGADOR[a.navegador]}.`;
	}
	if (a.navegador === 'firefox') {
		return a.sistema === 'android'
			? 'Toque no cadeado ao lado do endereço e libere o Microfone.'
			: 'Clique no microfone riscado na barra de endereço e tire o bloqueio.';
	}
	if (a.sistema === 'android') {
		return 'Toque no ícone à esquerda do endereço › Permissões › Microfone › Permitir.';
	}
	if (a.navegador === 'safari') {
		return 'No menu Safari › Ajustes para Este Site, deixe o Microfone em Permitir.';
	}
	return 'Clique no ícone à esquerda do endereço, ligue o Microfone e recarregue a página.';
}

/** Onde se libera o microfone para o NAVEGADOR, no sistema. */
function passoDoSistema(a: Ambiente): string {
	const nome = NOME_DO_NAVEGADOR[a.navegador];
	switch (a.sistema) {
		case 'windows':
			return 'Em Configurações › Privacidade e segurança › Microfone, ligue o acesso dos apps.';
		case 'mac':
			return `Em Ajustes do Sistema › Privacidade e Segurança › Microfone, ligue o ${nome} e abra-o de novo.`;
		case 'android':
			return `Em Configurações › Apps › ${nome} › Permissões, deixe o Microfone em Permitir.`;
		case 'ios':
			return `Em Ajustes › ${nome}, ligue o Microfone.`;
		default:
			return 'Nas configurações de privacidade do aparelho, libere o microfone para o navegador.';
	}
}

/**
 * O texto para cada impedimento, e para a gravação que terminou sem som
 * (`'sem-som'`: o microfone abriu, mas não chegou som nenhum dele).
 *
 * Curto de propósito: ele aparece sob o microfone, numa tela que não rola
 * (design-system.md "Player numa tela só"), no lugar do quadro "Entendemos" —
 * cabe no espaço dele.
 */
export function ajudaDoMicrofone(
	situacao: ImpedimentoDoMicrofone | 'sem-som',
	a: Ambiente
): AjudaDoMicrofone {
	switch (situacao) {
		case 'negado':
			// O navegador de dentro de um app quase nunca deixa liberar: o caminho
			// é sair dele.
			if (a.dentroDeApp) {
				return {
					titulo:
						'O navegador deste app não libera o microfone. Abra o link no navegador do celular, ou pule esta questão.',
					passo: ABRIR_FORA_DO_APP
				};
			}
			return {
				titulo:
					'O microfone está bloqueado para este site. Libere para gravar, ou pule esta questão.',
				passo: `${passoDoSite(a)} Depois, toque no microfone.`
			};
		case 'dispensado':
			return {
				titulo:
					'O pedido do microfone foi fechado. Toque no microfone e escolha Permitir, ou pule esta questão.',
				passo: null
			};
		case 'negado-sistema':
			return {
				titulo:
					'O aparelho não deixa o navegador usar o microfone. Libere para gravar, ou pule esta questão.',
				passo: passoDoSistema(a)
			};
		case 'sem-microfone':
			return {
				titulo: 'Não encontramos um microfone. Conecte um e toque de novo, ou pule esta questão.',
				passo: celular(a) ? null : 'No computador, um fone com microfone resolve.'
			};
		case 'ocupado':
			return {
				titulo: 'Outro app está usando o microfone. Feche-o e toque de novo, ou pule esta questão.',
				passo: 'Uma chamada, uma reunião ou um gravador aberto prendem o microfone.'
			};
		case 'inseguro':
			return {
				titulo:
					'O microfone só funciona no endereço seguro (https). Abra o link completo, ou pule esta questão.',
				passo: null
			};
		case 'indisponivel':
			if (a.dentroDeApp) {
				return {
					titulo:
						'O navegador deste app não grava áudio. Abra o link no navegador do celular, ou pule esta questão.',
					passo: ABRIR_FORA_DO_APP
				};
			}
			return {
				titulo:
					'Este navegador não grava áudio. Abra o link no Chrome, no Safari ou no Firefox, ou pule esta questão.',
				passo: null
			};
		case 'sem-som':
			return {
				titulo:
					'Não chegou som do microfone. Confira se ele não está mudo ou coberto e grave de novo.',
				passo: celular(a)
					? 'Se outro app estiver usando o microfone, feche-o.'
					: 'No computador, confira qual microfone está escolhido nas configurações de som.'
			};
	}
}

/** O estado da gravação é um impedimento (a tela mostra a ajuda dele)? */
export function ehImpedimento(estado: string): estado is ImpedimentoDoMicrofone {
	return (IMPEDIMENTOS as readonly string[]).includes(estado);
}
