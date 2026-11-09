<script lang="ts">
	import Logo from '$lib/components/Logo.svelte';
	import AmbientShapes from '$lib/components/AmbientShapes.svelte';
	import { page } from '$app/state';

	let { children } = $props();
</script>

<!-- Entrar e recuperar a senha ficam fora da busca; o cadastro é a porta de entrada e fica. -->
<svelte:head>
	{#if page.route.id !== '/(auth)/cadastro'}
		<meta name="robots" content="noindex" />
	{/if}
</svelte:head>

<!-- As formas cobrem a página inteira (`layout="tela"`): o cartão fica no meio
     de um fundo vazio, e com as duas faixas o meio da tela ficava chapado. -->
<div class="relative flex min-h-screen flex-col bg-base-200">
	<AmbientShapes layout="tela" />
	<header class="relative z-1 px-8 py-5"><Logo /></header>
	<main class="relative z-1 flex flex-1 items-center justify-center px-6 pb-16">
		{@render children()}
	</main>
</div>
