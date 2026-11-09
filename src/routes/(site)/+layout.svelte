<script lang="ts">
	// Grupo (site): páginas públicas institucionais, fora do Studio e do Player.
	import { resolve } from '$app/paths';
	import SiteHeader from '$lib/components/SiteHeader.svelte';
	import SiteFooter from '$lib/components/SiteFooter.svelte';

	const nav = [
		{ href: resolve('/(site)/planos'), label: 'Planos' },
		{ href: resolve('/(site)/sobre'), label: 'Sobre' },
		{ href: resolve('/(site)/ajuda'), label: 'Ajuda' },
		{ href: resolve('/(site)/contato'), label: 'Contato' }
	];

	let { children }: { children: import('svelte').Snippet } = $props();
</script>

<div class="min-h-screen bg-base-100">
	<SiteHeader {nav} />
	{@render children()}
	<SiteFooter />
</div>
