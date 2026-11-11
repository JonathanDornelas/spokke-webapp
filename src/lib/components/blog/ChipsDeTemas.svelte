<script lang="ts">
	// Os temas como LINKS de verdade para cada hub (não um filtro em JavaScript:
	// o robô de busca precisa chegar a cada página de tema por um link).
	import { resolve } from '$app/paths';

	let {
		temas,
		escolas = false,
		rotulo = 'Temas'
	}: {
		temas: { slug: string; nome: string }[];
		/** Acrescenta o hub das escolas, quando ele existe. */
		escolas?: boolean;
		rotulo?: string;
	} = $props();

	const chip =
		'inline-flex min-h-10 items-center rounded-full border px-[15px] text-sm font-semibold no-underline motion-tap hover:-translate-y-0.5 hover:border-primary hover:text-primary';
</script>

<nav aria-label={rotulo}>
	<ul class="flex list-none flex-wrap gap-2 p-0">
		{#each temas as tema (tema.slug)}
			<li>
				<a
					href={resolve('/(site)/blog/tema/[tema]', { tema: tema.slug })}
					class="{chip} border-line bg-base-100 text-base-content">{tema.nome}</a
				>
			</li>
		{/each}
		{#if escolas}
			<li>
				<a
					href={resolve('/(site)/blog/para-escolas')}
					class="{chip} border-panel bg-panel text-panel-content hover:text-panel-content"
					>Para escolas</a
				>
			</li>
		{/if}
	</ul>
</nav>
