<script lang="ts">
	// A barra de busca e filtros de toda lista do Studio, sempre logo abaixo do
	// cabeçalho: o campo de busca ocupa o que sobra da linha e os selects de
	// filtro e de ordem vêm depois (`SELECT_DA_LISTA`), na mesma altura. A busca é
	// de TELA: a lista inteira já veio no loader.
	import type { Snippet } from 'svelte';

	let {
		busca = $bindable(''),
		rotulo,
		children
	}: {
		busca?: string;
		/** O que se busca ("Buscar atividade") — vira o placeholder e o nome do campo. */
		rotulo: string;
		/** Os selects de filtro e de ordem. */
		children?: Snippet;
	} = $props();
</script>

<div class="mb-3 flex flex-wrap items-center gap-2">
	<label class="relative min-w-[220px] flex-[1_1_280px]">
		<span class="sr-only">{rotulo}</span>
		<svg
			class="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-base-content/65"
			viewBox="0 0 24 24"
			fill="none"
			aria-hidden="true"
		>
			<path
				d="M11 18.5a7.5 7.5 0 100-15 7.5 7.5 0 000 15zM20.5 20.5l-4.2-4.2"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
			/>
		</svg>
		<input
			type="search"
			bind:value={busca}
			placeholder={rotulo}
			class="input h-10 min-h-10 w-full ps-9 text-[13.5px]"
		/>
	</label>
	{@render children?.()}
</div>
