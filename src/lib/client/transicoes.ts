import type { TransitionConfig } from 'svelte/transition';
import { CURVA, DURACAO, bezier } from '$lib/movimento';

/**
 * As transições de abrir e fechar de modal, painel lateral e gaveta — UM jeito
 * de entrar e sair para todos (design-system.md "Movimento"). Só `transform` e
 * `opacity`, menos a sanfona de `desdobrar` e `recolher` (o porquê está nela).
 *
 * **As curvas e as durações são as do `app.css`**, via `$lib/movimento.ts`: a
 * mesma entrada que um `animate-entrada` de CSS, e não uma parecida tirada de
 * `svelte/easing`. Entrar leva `media` (300 ms) desacelerando; sair, `curta`
 * (200 ms) acelerando — o que está indo embora some rápido e não arrasta o olho.
 *
 * Use em `in:` e `out:` separados — é a `direction` que escolhe a curva. Dentro
 * de um componente que o PAI monta com `{#if}`, acrescente `|global`: no Svelte 5
 * a transição é local por padrão e não rodaria quando o pai some com o bloco.
 *
 * `prefers-reduced-motion` zera a duração. A regra global do `app.css` não
 * alcança estas: o Svelte anima pela Web Animations API, não por CSS.
 */

type Direcao = { direction?: 'in' | 'out' | 'both' };

const ENTRADA = bezier(CURVA.entrada);
const SAIDA = bezier(CURVA.saida);

function semMovimento(): boolean {
	return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function tempo(direcao: Direcao['direction']) {
	if (semMovimento()) return { duration: 0 };
	return direcao === 'out'
		? { duration: DURACAO.curta, easing: SAIDA }
		: { duration: DURACAO.media, easing: ENTRADA };
}

/** O véu escuro atrás de tudo: só opacidade. */
export function veu(_node: Element, _params?: unknown, opcoes: Direcao = {}): TransitionConfig {
	return { ...tempo(opcoes.direction), css: (t) => `opacity: ${t}` };
}

/**
 * O painel que entra pela LATERAL. `lado: 'fim'` é o painel da direita
 * (biblioteca, programação); `'inicio'`, a gaveta do celular, à esquerda.
 */
export function painelLateral(
	_node: Element,
	{ lado = 'fim' }: { lado?: 'inicio' | 'fim' } = {},
	opcoes: Direcao = {}
): TransitionConfig {
	const sinal = lado === 'fim' ? 1 : -1;
	return {
		...tempo(opcoes.direction),
		css: (t) => `transform: translate3d(${(1 - t) * 100 * sinal}%, 0, 0)`
	};
}

/** O modal e a folha de baixo: sobem um pouco enquanto aparecem. */
export function modal(_node: Element, _params?: unknown, opcoes: Direcao = {}): TransitionConfig {
	return {
		...tempo(opcoes.direction),
		css: (t) =>
			`opacity: ${t}; transform: translate3d(0, ${(1 - t) * 18}px, 0) scale(${0.98 + t * 0.02})`
	};
}

const MOVIMENTO = bezier(CURVA.movimento);

/**
 * A sanfona: o bloco que abre e fecha NO LUGAR, sob uma linha — a prévia de um
 * material na etapa 2, as bandejas de turmas e de módulos e o código de acesso da
 * etapa 4. Ele cresce (ou recolhe) a altura junto com a opacidade e um
 * deslocamento de 8px, em `media` e suave nas duas pontas.
 *
 * É a exceção a "só transform e opacity" (design-system.md "Movimento"), e
 * valeu primeiro para FECHAR: só com opacidade o bloco sumia e, terminada a
 * saída, a lista abaixo dele pulava duzentos e tantos pixels de uma vez. Depois
 * para ABRIR: nascendo com a altura toda, a bandeja de turmas empurrava as opções
 * uns 300px num único quadro, e o dono do repositório leu isso como abrupto. Os
 * blocos são pequenos e estão no Studio; o recálculo de leiaute por quadro não
 * pesa. Fechar mede uma vez, o bloco ainda montado (o conteúdo não muda na saída);
 * abrir mede a cada quadro (`desdobrar`, abaixo).
 */
function sanfona(node: Element): TransitionConfig {
	if (semMovimento()) return { duration: 0 };
	const estilo = getComputedStyle(node);
	const altura = parseFloat(estilo.height);
	const cima = parseFloat(estilo.paddingTop);
	const baixo = parseFloat(estilo.paddingBottom);
	const borda = parseFloat(estilo.borderTopWidth);
	return {
		duration: DURACAO.media,
		easing: MOVIMENTO,
		css: (t) =>
			`overflow: hidden; opacity: ${t}; transform: translate3d(0, ${(t - 1) * 8}px, 0);` +
			` height: ${t * altura}px; padding-top: ${t * cima}px; padding-bottom: ${t * baixo}px;` +
			` border-top-width: ${t * borda}px`
	};
}

/** As propriedades que a abertura escreve no elemento — e apaga no fim. */
const DA_ABERTURA = [
	'overflow',
	'opacity',
	'transform',
	'height',
	'padding-top',
	'padding-bottom',
	'border-top-width'
];

/**
 * ABRIR a sanfona (`in:desdobrar`): cresce do zero até a altura dela.
 *
 * A abertura mede a altura a CADA QUADRO, pelo que está dentro agora, em vez de
 * uma vez no começo: o conteúdo pode mudar no meio dela. Na prévia de um material
 * o esqueleto vira os cartões, e o cartão de uma frase longa é mais alto que o
 * esqueleto: medida uma vez, a bandeja abria até a altura do esqueleto e saltava
 * o resto no fim. `scrollHeight` dá a altura do conteúdo mesmo com a do elemento
 * presa (ele inclui o padding que a própria abertura está pondo, e por isso o
 * padding de agora sai da conta antes de entrar o cheio). Por isso `tick`, e não
 * `css`: um quadro-chave calculado antes não acompanha o conteúdo.
 */
export function desdobrar(node: Element): TransitionConfig {
	if (semMovimento()) return { duration: 0 };
	const el = node as HTMLElement;
	const estilo = getComputedStyle(el);
	const cima = parseFloat(estilo.paddingTop);
	const baixo = parseFloat(estilo.paddingBottom);
	const borda = parseFloat(estilo.borderTopWidth);
	return {
		duration: DURACAO.media,
		easing: MOVIMENTO,
		tick: (t) => {
			if (t >= 1) {
				for (const propriedade of DA_ABERTURA) el.style.removeProperty(propriedade);
				return;
			}
			const paddingAgora =
				(el.style.paddingTop ? parseFloat(el.style.paddingTop) : cima) +
				(el.style.paddingBottom ? parseFloat(el.style.paddingBottom) : baixo);
			const conteudo = el.scrollHeight - paddingAgora;
			el.style.overflow = 'hidden';
			el.style.opacity = String(t);
			el.style.transform = `translate3d(0, ${(t - 1) * 8}px, 0)`;
			el.style.paddingTop = `${t * cima}px`;
			el.style.paddingBottom = `${t * baixo}px`;
			el.style.borderTopWidth = `${t * borda}px`;
			el.style.height = `${t * (conteudo + cima + baixo + borda)}px`;
		}
	};
}

/** FECHAR a sanfona (`out:recolher`): some, sobe e recolhe a altura junto. */
export function recolher(node: Element): TransitionConfig {
	return sanfona(node);
}
