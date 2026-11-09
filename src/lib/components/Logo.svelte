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
		<path fill="currentColor" d={desenho.d} />
	</svg>
	{#if sub}
		<span class="border-s border-line ps-3 text-sm text-base-content/65">{sub}</span>
	{/if}
</a>
