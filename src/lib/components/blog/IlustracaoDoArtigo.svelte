<script lang="ts">
	// A imagem do cartão. Com capa, a capa (decorativa aqui: o título ao lado já
	// diz do que se trata, e o `alt` repetiria o link). Sem capa, só o cartão de
	// destaque mostra esta composição de formas da marca, para a metade da
	// imagem não ficar vazia; o cartão comum, sem capa, simplesmente não tem
	// imagem. A composição varia com o slug, então dois destaques seguidos não
	// saem iguais, e é sempre a mesma para o mesmo artigo.
	import type { ResumoDoArtigo } from '$lib/blog/tipos';

	let { artigo, grande = false }: { artigo: ResumoDoArtigo; grande?: boolean } = $props();

	const variante = $derived(
		[...artigo.slug].reduce((soma, letra) => soma + letra.charCodeAt(0), 0) % 3
	);
</script>

{#if artigo.capa}
	<img
		src={artigo.capa.src}
		alt=""
		width="1200"
		height="630"
		loading={grande ? 'eager' : 'lazy'}
		class="absolute inset-0 size-full object-cover"
	/>
{:else}
	<div aria-hidden="true" class="pointer-events-none absolute inset-0 overflow-hidden">
		{#if variante === 0}
			<div
				class="absolute end-[14%] top-[16%] aspect-square w-[30%] animate-[en-float-a_17s_ease-in-out_infinite] rounded-full bg-primary/30"
			></div>
			<div
				class="absolute start-[12%] top-[22%] aspect-square w-[22%] animate-[en-drift-spin_24s_ease-in-out_infinite] bg-accent/30 [clip-path:polygon(25%_3%,75%_3%,100%_50%,75%_97%,25%_97%,0%_50%)]"
			></div>
			<div
				class="absolute start-[34%] -bottom-[12%] aspect-square w-[26%] animate-[en-spin_22s_linear_infinite] rounded-full border-2 border-dashed border-primary/40"
			></div>
		{:else if variante === 1}
			<div
				class="absolute start-[10%] top-[14%] aspect-square w-[34%] animate-[en-float-b_19s_ease-in-out_infinite] rounded-full bg-accent/25"
			></div>
			<div
				class="absolute end-[12%] top-[20%] aspect-[110/96] w-[26%] animate-[en-float-c_21s_ease-in-out_infinite] bg-primary/30 [clip-path:polygon(50%_0,100%_100%,0_100%)]"
			></div>
			<div
				class="absolute end-[30%] bottom-[12%] h-[14%] w-[30%] animate-[en-float-a_16s_ease-in-out_infinite] rounded-full bg-primary/20"
			></div>
		{:else}
			<div
				class="absolute end-[10%] -bottom-[10%] aspect-square w-[38%] animate-[en-spin_24s_linear_infinite] rounded-full border-2 border-dashed border-accent/45"
			></div>
			<div
				class="absolute start-[14%] top-[18%] aspect-square w-[26%] animate-[en-drift-spin_26s_ease-in-out_infinite] bg-primary/25 [clip-path:polygon(25%_3%,75%_3%,100%_50%,75%_97%,25%_97%,0%_50%)]"
			></div>
			<div
				class="absolute end-[22%] top-[14%] aspect-square w-[18%] animate-[en-float-b_15s_ease-in-out_infinite] rounded-full bg-accent/30"
			></div>
		{/if}
	</div>
{/if}
