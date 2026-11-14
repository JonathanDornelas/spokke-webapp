<script lang="ts" generics="T extends string">
	// A SITUAÇÃO dos itens da lista, em chips com a contagem: "Todas 12",
	// "Publicadas 8", "Arquivadas 2". A mesma fileira nas três listas, logo
	// abaixo da busca. Chip de zero não aparece (a primeira opção, "todas",
	// sempre), e com uma opção só a fileira inteira some: um filtro que não
	// filtra nada é ruído. No celular a fileira rola de lado.
	let {
		opcoes,
		valor = $bindable(),
		rotulo,
		onmudou
	}: {
		opcoes: { id: T; label: string; n: number }[];
		valor: T;
		/** O nome do grupo para o leitor de tela ("Filtrar atividades"). */
		rotulo: string;
		onmudou?: (valor: T) => void;
	} = $props();

	const visiveis = $derived(opcoes.filter((o, i) => i === 0 || o.n > 0 || o.id === valor));
</script>

{#if visiveis.length > 1}
	<div
		class="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-wrap lg:px-0"
		role="group"
		aria-label={rotulo}
	>
		{#each visiveis as o (o.id)}
			<button
				type="button"
				aria-pressed={valor === o.id}
				onclick={() => {
					valor = o.id;
					onmudou?.(o.id);
				}}
				class="inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors
				       {valor === o.id
					? 'border-primary bg-primary text-primary-content'
					: 'border-line bg-base-100 text-base-content/70 hover:border-primary'}"
			>
				{o.label}
				<span class="font-mono text-[12px] opacity-80">{o.n}</span>
			</button>
		{/each}
	</div>
{/if}
