/**
 * A medição de audiência do site público (docs/operacao.md "Analytics e
 * Search Console"). Google Analytics 4, em CONSENTIMENTO BÁSICO: nenhum script
 * de terceiro carrega antes de a pessoa aceitar o aviso, e sem `PUBLIC_GA_ID`
 * nada disto roda. A decisão de onde medir é de `rotaMedida`: só as páginas
 * públicas, nunca o painel do professor nem as atividades dos alunos (são
 * dados de turma, muitas vezes de menores de idade, e o Player tem orçamento
 * de peso).
 *
 * A escolha fica no aparelho (`spokke-medicao`, listada na página de Cookies)
 * e se desfaz pelo "Preferências de cookies" do rodapé, que dispara
 * `EVENTO_DE_PREFERENCIAS`.
 */

const CHAVE = 'spokke-medicao';

/** O rodapé dispara este evento para o aviso aparecer de novo. */
export const EVENTO_DE_PREFERENCIAS = 'spokke:preferencias-de-medicao';

export type Escolha = 'aceito' | 'recusado';

type Gtag = (...args: unknown[]) => void;

declare global {
	interface Window {
		dataLayer?: unknown[];
		gtag?: Gtag;
		/** O interruptor oficial do Google para um ID de medição — ver `ligarEnvio`. */
		[interruptor: `ga-disable-${string}`]: boolean | undefined;
	}
}

/** As páginas medidas: a home, o grupo (site) com o blog, o cadastro e a atividade de exemplo. */
export function rotaMedida(routeId: string | null | undefined): boolean {
	if (!routeId) return false;
	return (
		routeId === '/' ||
		routeId.startsWith('/(site)/') ||
		routeId === '/(auth)/cadastro' ||
		routeId === '/exemplo'
	);
}

/** O ID de medição só vale no formato do GA4 ("G-" e letras e números). */
export function idValido(id: string | undefined): id is string {
	return typeof id === 'string' && /^G-[A-Z0-9]{4,16}$/.test(id.trim());
}

export function lerEscolha(): Escolha | null {
	try {
		const valor = localStorage.getItem(CHAVE);
		return valor === 'aceito' || valor === 'recusado' ? valor : null;
	} catch {
		return null;
	}
}

export function gravarEscolha(escolha: Escolha | null): void {
	try {
		if (escolha) localStorage.setItem(CHAVE, escolha);
		else localStorage.removeItem(CHAVE);
	} catch {
		// armazenamento bloqueado: o aviso volta na próxima visita, e tudo bem
	}
}

let carregado = false;
/** O ID com que o gtag.js foi carregado, para a revogação desligar o envio dele. */
let idCarregado: string | null = null;
/** Medindo agora: depois do aceite e até uma revogação. */
let ativo = false;

/**
 * Liga ou desliga o ENVIO conforme a página em que a pessoa está.
 *
 * O gtag.js, depois de carregado, fica na página até ela recarregar — e a troca de tela do
 * SvelteKit não recarrega. Quem aceitava o aviso na home e entrava no Studio pelo link levava
 * junto a medição AUTOMÁTICA do Google (tempo na página, rolagem, cliques, formulários, a
 * visualização por troca de histórico), que não passa por `rotaMedida` nem por `ativo`.
 *
 * `ga-disable-<ID>` é o interruptor oficial do Google, e foi medido com o gtag.js de produção
 * (2026-11-11): ele é lido a cada evento, vale na hora, desliga também o automático, e o que
 * já estava na fila ainda sai — é o que deixa o `sign_up` do cadastro chegar mesmo com a
 * navegação seguindo direto para o Studio.
 */
export function ligarEnvio(id: string, ligado: boolean): void {
	if (!idValido(id)) return;
	window[`ga-disable-${id.trim()}`] = !ligado;
}

/** Carrega o gtag.js uma vez. Só é chamado depois do "Aceitar". */
export function carregarGa(id: string): void {
	if (!idValido(id)) return;
	ativo = true;
	if (carregado) {
		// Aceitou de novo depois de revogar: o script já está na página.
		window.gtag?.('consent', 'update', { analytics_storage: 'granted' });
		return;
	}
	carregado = true;
	idCarregado = id.trim();
	window.dataLayer = window.dataLayer ?? [];
	// O gtag.js lê objetos `arguments` da fila, não arrays: é o snippet oficial.
	window.gtag = function gtag() {
		// eslint-disable-next-line prefer-rest-params -- o gtag.js exige o objeto `arguments`, não um array.
		window.dataLayer!.push(arguments);
	};
	window.gtag('consent', 'default', {
		ad_storage: 'denied',
		ad_user_data: 'denied',
		ad_personalization: 'denied',
		analytics_storage: 'granted'
	});
	window.gtag('js', new Date());
	// A troca de página do SvelteKit não recarrega o documento: quem manda o
	// page_view é `registrarPagina`, a cada navegação.
	window.gtag('config', id.trim(), { send_page_view: false });
	const script = document.createElement('script');
	script.async = true;
	script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id.trim())}`;
	document.head.appendChild(script);
}

export function registrarPagina(): void {
	if (!ativo) return;
	window.gtag?.('event', 'page_view', {
		page_location: location.href,
		page_path: location.pathname,
		page_title: document.title
	});
}

/** Um evento de conversão ou de uso. Sem o aceite, não faz nada. */
export function registrarEvento(nome: string, parametros: Record<string, string> = {}): void {
	if (!ativo) return;
	window.gtag?.('event', nome, parametros);
}

/** Desfaz o aceite: para de medir e apaga os cookies do Google Analytics deste site. */
export function revogar(): void {
	ativo = false;
	if (carregado) window.gtag?.('consent', 'update', { analytics_storage: 'denied' });
	// Com o script já na página, só negar o consentimento ainda deixaria o Google mandar avisos
	// sem cookie (é o modo avançado do consentimento). Revogar é parar de enviar.
	if (idCarregado) ligarEnvio(idCarregado, false);
	const dominios = ['', location.hostname, `.${location.hostname.replace(/^www\./, '')}`];
	for (const par of document.cookie.split(';')) {
		const nome = par.split('=')[0]?.trim();
		if (!nome || !nome.startsWith('_ga')) continue;
		for (const dominio of dominios) {
			document.cookie = `${nome}=; Max-Age=0; path=/${dominio ? `; domain=${dominio}` : ''}`;
		}
	}
}
