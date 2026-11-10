<script lang="ts">
	// A paginação do índice do blog. Links DE VERDADE (`/blog/pagina/2`), não um
	// "carregar mais": o robô de busca segue link, não clique. Não é a
	// `Pagination.svelte` do Studio, que pagina na tela uma lista que já veio
	// inteira. As pontas e os vizinhos da atual sempre aparecem; o resto vira "…".
	import { resolve } from '$app/paths';

	let { atual, total }: { atual: number; total: number } = $props();

	function href(n: number): string {
		return n === 1 ? resolve('/(site)/blog') : resolve('/(site)/blog/pagina/[n]', { n: String(n) });
	}

	type Casa =
		{ tipo: 'link'; n: number } | { tipo: 'atual'; n: number } | { tipo: 'salto'; chave: string };

	const casas = $derived.by(() => {
		const mostrar = [...new Set([1, 2, atual - 1, atual, atual + 1, total - 1, total])]
			.filter((n) => n >= 1 && n <= total)
			.sort((a, b) => a - b);
		const lista: Casa[] = [];
		let anterior = 0;
		for (const n of mostrar) {
			if (n - anterior > 1) lista.push({ tipo: 'salto', chave: `salto-${n}` });
			lista.push(n === atual ? { tipo: 'atual', n } : { tipo: 'link', n });
			anterior = n;
		}
		return lista;
	});

	const caixa =
		'flex h-11 min-w-11 items-center justify-center rounded-field px-2.5 text-[15px] no-underline';
</script>

{#if total > 1}
	<nav aria-label="Paginação" class="flex justify-center pt-12 pb-[72px]">
		<ol class="flex list-none flex-wrap items-center justify-center gap-1.5 p-0">
			<li>
				{#if atual > 1}
					<!-- eslint-disable svelte/no-navigation-without-resolve -- `href()` sai de resolve(). -->
					<a
						href={href(atual - 1)}
						aria-label="Página anterior"
						class="{caixa} motion-tap border border-line bg-base-100 font-semibold text-base-content hover:border-primary hover:text-primary"
						>‹</a
					>
				{:else}
					<span aria-hidden="true" class="{caixa} text-base-content/40">‹</span>
				{/if}
			</li>
			{#each casas as casa (casa.tipo === 'salto' ? casa.chave : casa.n)}
				<li>
					{#if casa.tipo === 'atual'}
						<span aria-current="page" class="{caixa} bg-primary font-bold text-primary-content"
							>{casa.n}</span
						>
					{:else if casa.tipo === 'link'}
						<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- `href()` sai de resolve(). -->
						<a
							href={href(casa.n)}
							aria-label="Página {casa.n}"
							class="{caixa} motion-tap border border-line bg-base-100 font-semibold text-base-content hover:border-primary hover:text-primary"
							>{casa.n}</a
						>
					{:else}
						<span aria-hidden="true" class="{caixa} text-base-content/40">…</span>
					{/if}
				</li>
			{/each}
			<li>
				{#if atual < total}
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- `href()` sai de resolve(). -->
					<a
						href={href(atual + 1)}
						aria-label="Próxima página"
						class="{caixa} motion-tap border border-line bg-base-100 font-semibold text-base-content hover:border-primary hover:text-primary"
						>›</a
					>
				{:else}
					<span aria-hidden="true" class="{caixa} text-base-content/40">›</span>
				{/if}
			</li>
		</ol>
	</nav>
{/if}

<!-- eslint-enable svelte/no-navigation-without-resolve -->
