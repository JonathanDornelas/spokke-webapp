<script lang="ts">
	// "Neste artigo": a lista das seções (H2) com âncora. Dois desenhos do mesmo
	// dado. No celular, um `<details>` fechado acima do texto (nativo: abre pelo
	// teclado e se anuncia sem script). No desktop, uma coluna fixa ao lado do
	// texto que marca a seção em que o leitor está, a última cujo título já
	// passou de 160px do topo, como no protótipo.
	import type { ItemDoSumario } from '$lib/blog/tipos';

	let { itens, formato }: { itens: ItemDoSumario[]; formato: 'celular' | 'lateral' } = $props();

	let atual = $state<string | null>(null);
	let aberto = $state(false);

	$effect(() => {
		if (formato !== 'lateral') return;
		let quadro = 0;
		const medir = () => {
			quadro = 0;
			let ultimo: string | null = itens[0]?.id ?? null;
			for (const item of itens) {
				const el = document.getElementById(item.id);
				if (el && el.getBoundingClientRect().top < 160) ultimo = item.id;
			}
			atual = ultimo;
		};
		const pedir = () => {
			if (!quadro) quadro = requestAnimationFrame(medir);
		};
		medir();
		addEventListener('scroll', pedir, { passive: true });
		addEventListener('resize', pedir, { passive: true });
		return () => {
			cancelAnimationFrame(quadro);
			removeEventListener('scroll', pedir);
			removeEventListener('resize', pedir);
		};
	});
</script>

{#if formato === 'celular'}
	<details bind:open={aberto} class="group mt-[22px] rounded-[12px] border border-line bg-base-200">
		<summary
			class="flex min-h-[50px] cursor-pointer list-none items-center justify-between gap-3 px-4 text-[15px] font-bold [&::-webkit-details-marker]:hidden"
		>
			Neste artigo
			<svg
				class="size-[18px] transition-transform group-open:rotate-180"
				viewBox="0 0 24 24"
				fill="none"
				aria-hidden="true"
			>
				<path
					d="M6 9l6 6 6-6"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			</svg>
		</summary>
		<nav aria-label="Neste artigo">
			<ol class="grid list-none px-4 pb-2.5">
				{#each itens as item (item.id)}
					<li>
						<a
							href="#{item.id}"
							onclick={() => (aberto = false)}
							class="flex min-h-11 items-center border-t border-line text-[15px] text-base-content no-underline"
							>{item.titulo}</a
						>
					</li>
				{/each}
			</ol>
		</nav>
	</details>
{:else}
	<nav aria-label="Neste artigo">
		<p class="mb-3 text-[13px] font-bold">Neste artigo</p>
		<ol class="grid list-none border-s-2 border-line p-0">
			{#each itens as item (item.id)}
				<li>
					<a
						href="#{item.id}"
						aria-current={atual === item.id ? 'location' : undefined}
						class="-ms-0.5 block border-s-2 border-transparent py-[7px] ps-3.5 text-sm leading-[1.4] text-base-content/65 no-underline transition-colors hover:text-primary aria-[current=location]:border-primary aria-[current=location]:font-bold aria-[current=location]:text-primary"
						>{item.titulo}</a
					>
				</li>
			{/each}
		</ol>
	</nav>
{/if}
