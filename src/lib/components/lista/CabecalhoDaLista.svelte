<script lang="ts">
	// O topo de toda lista do Studio (components.md "Listas do Studio"): o
	// título, uma linha com os números da lista e, na ponta, a ação de criar. Era
	// um tamanho de título por tela, e a lista de atividades nem tinha o botão.
	import type { Snippet } from 'svelte';

	let {
		titulo,
		children,
		acao
	}: {
		titulo: string;
		/** A linha de números sob o título ("12 atividades · 8 no ar"). */
		children?: Snippet;
		/** O botão de criar (`BOTAO_NOVO`, de `lista.ts`). */
		acao?: Snippet;
	} = $props();
</script>

<div class="mb-[18px] flex flex-wrap items-end gap-x-4 gap-y-3">
	<div class="min-w-[180px] flex-1">
		<h1 class="mb-1 font-display text-[26px] font-semibold tracking-[-0.022em] lg:text-[28px]">
			{titulo}
		</h1>
		{#if children}
			<p class="text-[13.5px] text-base-content/65">{@render children()}</p>
		{/if}
	</div>
	{#if acao}
		{@render acao()}
	{/if}
</div>
