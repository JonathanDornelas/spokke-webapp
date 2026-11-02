import type { TransitionConfig } from 'svelte/transition';
import { CURVA, DURACAO, bezier } from '$lib/movimento';

/**
 * As transições de abrir e fechar de modal, painel lateral e gaveta — UM jeito
 * de entrar e sair para todos (design-system.md "Movimento"). Só `transform` e
 * `opacity`.
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
