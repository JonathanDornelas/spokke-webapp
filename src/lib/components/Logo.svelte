<script lang="ts">
	// A marca, link para a home. Os traços vêm de `$lib/marca` (vetorizados da
	// arte original) e são preenchidos com `currentColor` em `text-primary`: o
	// logo troca de azul junto com o tema, em vez de ser uma imagem fixa.
	//
	// `size` é a ALTURA em px — da marca inteira, ou do ícone sozinho. Com a
	// marca, a largura sai da proporção dela (~4,2×).
	import { resolve } from '$app/paths';
	import { ICONE, MARCA } from '$lib/marca';

	let {
		size = 24,
		showWordmark = true,
		sub
	}: { size?: number; showWordmark?: boolean; sub?: string } = $props();

	const desenho = $derived(showWordmark ? MARCA : ICONE);
</script>

<a href={resolve('/')} class="flex items-center gap-2.5 text-base-content no-underline">
	<svg
		height={size}
		width={Math.round((size * desenho.largura) / desenho.altura)}
		viewBox={desenho.viewBox}
		class="shrink-0 text-primary"
		role="img"
		aria-label="Spokke"
	>
		<!-- `evenodd` é o que abre os buracos: no traço do potrace os contornos de
		     dentro (o miolo do "p", do "o" e do "e", os pontinhos do balão) giram
		     no MESMO sentido dos de fora, e com a regra padrão (`nonzero`) eles
		     eram pintados por cima. `marca.test.ts` confere. -->
		<path fill="currentColor" fill-rule="evenodd" d={desenho.d} />
	</svg>
	{#if sub}
		<span class="border-s border-line ps-3 text-sm text-base-content/65">{sub}</span>
	{/if}
</a>
