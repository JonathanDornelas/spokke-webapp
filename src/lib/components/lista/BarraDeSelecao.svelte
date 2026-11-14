<script lang="ts">
	// O que fazer com os itens MARCADOS — arquivar, apagar. Aparece quando há pelo
	// menos um marcado, entre os chips e a tabela, e fica grudada no topo enquanto
	// a lista rola: marcar dez linhas e voltar lá em cima para agir era o jeito
	// de perder a seleção.
	import type { Snippet } from 'svelte';

	let {
		quantos,
		singular,
		plural,
		onlimpar,
		children
	}: {
		quantos: number;
		/** "atividade marcada" */
		singular: string;
		/** "atividades marcadas" */
		plural: string;
		onlimpar: () => void;
		/** Os botões das ações. */
		children: Snippet;
	} = $props();
</script>

<div
	class="sticky top-2 z-20 mb-3 flex animate-entrada-curta flex-wrap items-center gap-x-3 gap-y-2 rounded-[14px] border border-primary/45 bg-base-100 px-3.5 py-2.5 shadow-[0_14px_32px_-22px_rgb(var(--shadow)/0.5)]"
	role="region"
	aria-label="Ações com os itens marcados"
>
	<span class="text-[13.5px] font-bold" aria-live="polite">
		<span class="font-mono">{quantos}</span>
		{quantos === 1 ? singular : plural}
	</span>
	<button
		type="button"
		onclick={onlimpar}
		class="text-[13px] font-semibold text-base-content/65 underline-offset-2 hover:text-base-content hover:underline"
	>
		Desmarcar
	</button>
	<span class="min-w-2 flex-1"></span>
	<div class="flex flex-wrap gap-2">
		{@render children()}
	</div>
</div>
