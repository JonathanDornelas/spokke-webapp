<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import NavigationProgress from '$lib/components/NavigationProgress.svelte';
	import MedicaoDoSite from '$lib/components/MedicaoDoSite.svelte';
	import { env } from '$env/dynamic/public';

	// A verificação de propriedade nas ferramentas de busca (Search Console e
	// Bing): só o `content` da meta tag, por variável de ambiente. Vazio, nada
	// sai no HTML (docs/operacao.md "Analytics e Search Console").
	const verificacaoGoogle = env.PUBLIC_GOOGLE_SITE_VERIFICATION?.trim() ?? '';
	const verificacaoBing = env.PUBLIC_BING_SITE_VERIFICATION?.trim() ?? '';

	let { children } = $props();
</script>

<svelte:head>
	<!-- O .ico vem antes e com `sizes`: sem isso o Chrome fica com ele em vez do
	     SVG. O SVG troca de azul no tema escuro; o .ico e o ícone do iPhone são o
	     fallback de quem não lê SVG. Os três saem do traço de `$lib/marca`. -->
	<link rel="icon" href="/favicon.ico" sizes="32x32" />
	<link rel="icon" href={favicon} type="image/svg+xml" />
	<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
	{#if verificacaoGoogle}<meta name="google-site-verification" content={verificacaoGoogle} />{/if}
	{#if verificacaoBing}<meta name="msvalidate.01" content={verificacaoBing} />{/if}
</svelte:head>
<!-- Uma vez só, no layout raiz: toda troca de tela do produto passa por aqui,
     inclusive as do Player, que resetam o layout com `+page@.svelte`. -->
<NavigationProgress />
{@render children()}
<MedicaoDoSite />
