import { browser } from '$app/environment';

/**
 * O DIÁRIO DA TELA do Player: as últimas coisas que aconteceram no navegador —
 * erro de JavaScript, promessa rejeitada, arquivo (áudio, imagem, script) que
 * não carregou, e os passos que a própria tela anota (abriu a questão,
 * verificou, o veredito). Fica só na memória da aba e só sai dela quando o
 * aluno manda um relato de problema: é o que deixa a equipe ver o erro que ele
 * não sabe descrever.
 *
 * Teto de 25 entradas (as mais novas ficam) e 500 caracteres cada: é um rastro
 * para reproduzir, não um log. Nada de texto digitado pelo aluno entra aqui —
 * quem anota passos anota o tipo, não o conteúdo.
 */

export interface EntradaDoDiario {
	/** Quando, em ms desde a época (`Date.now()`). */
	em: number;
	tipo: string;
	texto: string;
}

const MAXIMO = 25;
const TEXTO_MAXIMO = 500;
const entradas: EntradaDoDiario[] = [];
let instalado = false;

function cortar(texto: string): string {
	return texto.length > TEXTO_MAXIMO ? `${texto.slice(0, TEXTO_MAXIMO)}…` : texto;
}

export function anotar(tipo: string, texto: string): void {
	entradas.push({ em: Date.now(), tipo: tipo.slice(0, 40), texto: cortar(texto) });
	if (entradas.length > MAXIMO) entradas.splice(0, entradas.length - MAXIMO);
}

/** Uma cópia do que está anotado, da mais antiga para a mais nova. */
export function lerDiario(): EntradaDoDiario[] {
	return entradas.map((e) => ({ ...e }));
}

/**
 * Liga os ouvintes uma vez por aba. O de `error` é na fase de CAPTURA: o erro de
 * carregar um `<audio>` não sobe pela árvore, mas passa pela janela descendo.
 */
export function instalarDiario(): void {
	if (!browser || instalado) return;
	instalado = true;

	window.addEventListener(
		'error',
		(evento) => {
			const alvo = evento.target;
			if (alvo instanceof HTMLMediaElement) {
				const codigo = alvo.error?.code ?? '?';
				anotar(
					'recurso',
					`${alvo.tagName.toLowerCase()} não carregou (código ${codigo}): ${alvo.currentSrc || alvo.src}`
				);
				return;
			}
			if (alvo instanceof HTMLImageElement || alvo instanceof HTMLScriptElement) {
				anotar('recurso', `${alvo.tagName.toLowerCase()} não carregou: ${alvo.src}`);
				return;
			}
			if (alvo instanceof HTMLLinkElement) {
				anotar('recurso', `link não carregou: ${alvo.href}`);
				return;
			}
			if (evento instanceof ErrorEvent) {
				const pilha =
					evento.error instanceof Error && evento.error.stack ? `\n${evento.error.stack}` : '';
				anotar(
					'erro',
					`${evento.message} (${evento.filename}:${evento.lineno}:${evento.colno})${pilha}`
				);
			}
		},
		true
	);

	window.addEventListener('unhandledrejection', (evento) => {
		const motivo: unknown = evento.reason;
		anotar(
			'promessa',
			motivo instanceof Error
				? `${motivo.message}${motivo.stack ? `\n${motivo.stack}` : ''}`
				: String(motivo)
		);
	});

	window.addEventListener('offline', () => anotar('rede', 'ficou sem internet'));
	window.addEventListener('online', () => anotar('rede', 'a internet voltou'));
}

/** O que o navegador expõe além do padrão — cada campo pode faltar. */
interface NavegadorComExtras {
	userAgent: string;
	language: string;
	languages?: readonly string[];
	maxTouchPoints?: number;
	onLine: boolean;
	connection?: { effectiveType?: string; downlink?: number; saveData?: boolean };
	deviceMemory?: number;
	userAgentData?: { platform?: string; mobile?: boolean };
}

/**
 * O aparelho AGORA, para o relato de problema: navegador, tela, conexão, tema.
 * Nada que identifique o aluno — o mesmo que qualquer site vê de quem o abre.
 */
export function aparelhoAgora(extras: { versao: string; volume?: number }) {
	const nav = navigator as unknown as NavegadorComExtras;
	const conexao = nav.connection;
	return {
		navegador: nav.userAgent.slice(0, 400),
		idiomas: [...(nav.languages ?? [nav.language])].slice(0, 10).map((l) => l.slice(0, 40)),
		plataforma: nav.userAgentData?.platform?.slice(0, 80),
		celular: nav.userAgentData?.mobile,
		tela: { largura: screen.width, altura: screen.height, dpr: devicePixelRatio },
		janela: { largura: innerWidth, altura: innerHeight },
		orientacao: screen.orientation?.type?.slice(0, 40),
		toque: Math.min(32, Math.max(0, nav.maxTouchPoints ?? 0)),
		online: nav.onLine,
		conexao: conexao
			? {
					tipo: conexao.effectiveType?.slice(0, 20),
					mbps: conexao.downlink,
					economia: conexao.saveData
				}
			: undefined,
		memoriaGb: nav.deviceMemory,
		fuso: Intl.DateTimeFormat().resolvedOptions().timeZone.slice(0, 64),
		horaLocal: new Date().toString().slice(0, 80),
		tema: document.documentElement.dataset.theme?.slice(0, 20),
		menosMovimento: matchMedia('(prefers-reduced-motion: reduce)').matches,
		volume: extras.volume,
		versao: extras.versao.slice(0, 64),
		caminho: location.pathname.slice(0, 300)
	};
}
