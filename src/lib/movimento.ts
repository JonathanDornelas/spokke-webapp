/**
 * Os tokens de MOVIMENTO do lado do TypeScript — o espelho dos de `app.css`
 * (`--duration-*`, `--ease-*`, `--stagger`). Isomórfico e minúsculo: o Player
 * importa daqui, então nada de dependência.
 *
 * Quem precisa de número em JS: as transições do Svelte (`$lib/client/transicoes.ts`,
 * que animam pela Web Animations API e não leem CSS) e as esperas que
 * acompanham uma animação de CSS (a troca de questão do Player espera a saída
 * terminar). Duas fontes de verdade divergiriam no primeiro ajuste — por isso
 * `movimento.test.ts` lê o `app.css` e falha se um número daqui não bater lá.
 *
 * As regras (design-system.md "Movimento"):
 * - **A duração vai pelo TAMANHO** do que se move: toque 120, micro 200,
 *   painel e modal 300, tela e cartão grande 500, gráfico que cresce 800.
 * - **A curva vai pelo PAPEL**: entra desacelerando, sai acelerando, move de
 *   A para B suave nas duas pontas, e o retorno com sobra fica no orçamento de
 *   feedback (~4%).
 * - **Sair leva ~2/3 de entrar** (`curta` para `media`): o que está indo
 *   embora não pode prender a atenção.
 */

export const DURACAO = {
	/** O botão afundando no toque. */
	tap: 120,
	/** Micro: cor, hover, e a SAÍDA de painel e modal. */
	curta: 200,
	/** A entrada de painel, modal e bloco que abre no lugar. */
	media: 300,
	/** A entrada de tela e de cartão grande. */
	longa: 500,
	/** Barra e anel crescendo até o valor. */
	grafico: 800
} as const;

/** O intervalo entre itens de uma lista que entra em sequência. */
export const STAGGER = 60;
/** A partir do 6º item o intervalo para de somar: a lista inteira não pode demorar. */
export const TETO_DO_STAGGER = 6;

/** Os quatro papéis de curva, como os pontos de controle do `cubic-bezier`. */
export const CURVA = {
	/** Entrada: dispara e desacelera longo (easeOutQuint). */
	entrada: [0.22, 1, 0.36, 1],
	/** Saída: acelera até sumir. */
	saida: [0.55, 0, 0.85, 0.5],
	/** De A para B na tela: suave nas duas pontas (easeInOutCubic). */
	movimento: [0.65, 0, 0.35, 1],
	/** O retorno com ~4% de sobra: soltar o botão. */
	retorno: [0.34, 1.35, 0.64, 1]
} as const satisfies Record<string, readonly [number, number, number, number]>;

/**
 * O `cubic-bezier` do CSS como função de 0..1 — para as transições do Svelte
 * usarem exatamente a mesma curva do `app.css`, e não uma parecida de
 * `svelte/easing`. Newton com recuo para bisseção, o algoritmo dos navegadores.
 */
export function bezier([x1, y1, x2, y2]: readonly [number, number, number, number]) {
	const cx = 3 * x1;
	const bx = 3 * (x2 - x1) - cx;
	const ax = 1 - cx - bx;
	const cy = 3 * y1;
	const by = 3 * (y2 - y1) - cy;
	const ay = 1 - cy - by;
	const x = (t: number) => ((ax * t + bx) * t + cx) * t;
	const y = (t: number) => ((ay * t + by) * t + cy) * t;
	const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;

	return (progresso: number): number => {
		if (progresso <= 0) return 0;
		if (progresso >= 1) return 1;
		let t = progresso;
		for (let i = 0; i < 8; i++) {
			const erro = x(t) - progresso;
			if (Math.abs(erro) < 1e-6) return y(t);
			const d = dx(t);
			if (Math.abs(d) < 1e-6) break;
			t -= erro / d;
		}
		let baixo = 0;
		let alto = 1;
		t = progresso;
		while (alto - baixo > 1e-6) {
			if (x(t) < progresso) baixo = t;
			else alto = t;
			t = (baixo + alto) / 2;
		}
		return y(t);
	};
}

/** Quanto falta para a lista: o atraso do item `i` numa entrada em sequência. */
export function atrasoDoItem(i: number): number {
	return Math.min(Math.max(0, i), TETO_DO_STAGGER) * STAGGER;
}
