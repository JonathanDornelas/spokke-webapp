import type { Action } from 'svelte/action';

/**
 * `reveal-row` (app.css) nasce rodando: se o observer nunca disparar, o bloco
 * aparece normalmente. Esta action só pausa a animação e a libera quando o
 * elemento entra na viewport — nunca prende conteúdo em opacity: 0.
 *
 * `ordem` é a posição do item numa grade que entra em sequência. A action não
 * escolhe milissegundos: ela passa o `--i`, e o `reveal-row` calcula o atraso
 * com o MESMO `--stagger` (e o mesmo teto) de toda lista do produto. Cada tela
 * escrevia o seu — 90 ms aqui, 110 ali.
 */
export const reveal: Action<HTMLElement, { ordem?: number } | undefined> = (
	node,
	{ ordem = 0 } = {}
) => {
	node.style.setProperty('--i', String(ordem));
	if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
	if (!('IntersectionObserver' in window)) return;

	node.style.animationPlayState = 'paused';

	const io = new IntersectionObserver(
		([entry]) => {
			if (!entry.isIntersecting) return;
			node.style.animationPlayState = 'running';
			io.disconnect();
		},
		{ threshold: 0.08, rootMargin: '0px 0px -8% 0px' }
	);
	io.observe(node);

	return { destroy: () => io.disconnect() };
};
