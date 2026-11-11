<script lang="ts">
	import '../app.css';
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
	     fallback de quem não lê SVG. Todos saem do traço de `$lib/marca`.
	     O SVG é ARQUIVO (`static/`), não import: importado, o Vite o embutia na
	     página como `data:`, e o Google não busca ícone embutido. O PNG de 192 px
	     é para a busca, que pede ícone com lado múltiplo de 48 — o .ico (32) e o
	     do iPhone (180) não servem (scripts/gerar-favicon-png.mjs). -->
	<link rel="icon" href="/favicon.ico" sizes="32x32" />
	<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
	<link rel="icon" href="/favicon-192.png" sizes="192x192" type="image/png" />
	<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
	{#if verificacaoGoogle}<meta name="google-site-verification" content={verificacaoGoogle} />{/if}
	{#if verificacaoBing}<meta name="msvalidate.01" content={verificacaoBing} />{/if}
</svelte:head>
<!-- Uma vez só, no layout raiz: toda troca de tela do produto passa por aqui,
     inclusive as do Player, que resetam o layout com `+page@.svelte`. -->
<NavigationProgress />
{@render children()}
<MedicaoDoSite />
