<script lang="ts">
	// As migalhas do blog: Início › Blog › Tema. A página atual não vira link
	// (no artigo ela nem aparece: o H1 logo abaixo já diz onde se está). O
	// último link encolhe com reticências no celular em vez de quebrar a linha.
	let { itens }: { itens: { rotulo: string; href?: string }[] } = $props();
</script>

<nav aria-label="Migalhas" class="mb-4">
	<ol class="flex min-w-0 list-none items-center gap-2 p-0 text-[13.5px] text-base-content/65">
		{#each itens as item, i (item.rotulo)}
			{#if i > 0}<li aria-hidden="true" class="flex-none">›</li>{/if}
			<li class={i === itens.length - 1 ? 'min-w-0 truncate' : 'flex-none'}>
				{#if item.href}
					<!-- eslint-disable svelte/no-navigation-without-resolve -- quem monta as migalhas passa a rota já resolvida. -->
					<a
						href={item.href}
						class="text-base-content/65 underline decoration-line underline-offset-[3px] transition-colors hover:text-primary"
					>
						{item.rotulo}
					</a>
					<!-- eslint-enable svelte/no-navigation-without-resolve -->
				{:else}
					<span aria-current="page" class="font-semibold text-base-content">{item.rotulo}</span>
				{/if}
			</li>
		{/each}
	</ol>
</nav>
