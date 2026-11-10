<script lang="ts">
	// O cartão de artigo do blog (o "Blog Cartao" do Claude Design), em três
	// formatos: `padrao` (a grade do índice e do tema), `destaque` (o guia
	// principal, imagem ao lado do texto) e `compacto` (o "Leia também").
	//
	// O cartão INTEIRO é clicável, mas o link é só o título: o `::after` dele
	// cobre o cartão. Assim o leitor de tela lê um link com o nome do artigo, e
	// não um bloco de texto inteiro como rótulo.
	import { resolve } from '$app/paths';
	import { dataDoArtigo, minutosDeLeitura } from '$lib/blog/formato';
	import type { ResumoDoArtigo } from '$lib/blog/tipos';
	import IlustracaoDoArtigo from './IlustracaoDoArtigo.svelte';

	let {
		artigo,
		variante = 'padrao',
		selo
	}: {
		artigo: ResumoDoArtigo;
		variante?: 'padrao' | 'destaque' | 'compacto';
		/** A linha ao lado do tema no destaque ("Guia principal"). */
		selo?: string;
	} = $props();

	const href = $derived(resolve('/(site)/blog/[slug]', { slug: artigo.slug }));
	const paraEscola = $derived(artigo.publico === 'escola' || artigo.publico === 'ambos');
</script>

{#snippet chips()}
	<span class="rounded-full bg-base-300 px-[11px] py-1 text-[12.5px] font-bold text-primary"
		>{artigo.tema.nome}</span
	>
	{#if paraEscola}
		<span
			class="rounded-full border border-line bg-base-100 px-[11px] py-1 text-[12.5px] font-semibold text-base-content/75"
			>Para escolas</span
		>
	{/if}
	{#if artigo.rascunho}
		<!-- Só existe em `pnpm dev`: rascunho não chega à produção. -->
		<span
			class="rounded-full border border-dashed border-base-content/40 px-[11px] py-1 text-[12.5px] font-semibold text-base-content/70"
			>Rascunho</span
		>
	{/if}
{/snippet}

{#snippet meta()}
	<time datetime={artigo.publicadoEm}>{dataDoArtigo(artigo.publicadoEm)}</time>
	<span aria-hidden="true">·</span>
	{minutosDeLeitura(artigo.minutos)}
{/snippet}

{#if variante === 'destaque'}
	<article
		class="relative flex cartao-interativo flex-wrap overflow-hidden rounded-[18px] border border-line bg-card shadow-[0_22px_44px_-32px_rgb(var(--shadow)/0.45)]"
	>
		<div class="relative aspect-video min-w-0 flex-[1.2_1_380px] bg-base-300">
			<IlustracaoDoArtigo {artigo} grande />
		</div>
		<div
			class="flex min-w-0 flex-[1_1_320px] flex-col justify-center gap-3.5 p-[clamp(22px,3vw,40px)]"
		>
			<div class="flex flex-wrap items-center gap-x-3 gap-y-2">
				{@render chips()}
				{#if selo}<span class="text-[13px] font-semibold text-base-content/65">{selo}</span>{/if}
			</div>
			<h3
				class="font-display text-[clamp(24px,1.4vw+16px,32px)] leading-[1.12] font-semibold tracking-[-0.02em] text-pretty"
			>
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- `href` já sai de resolve() acima. -->
				<a
					{href}
					class="text-inherit no-underline after:absolute after:inset-0 after:rounded-[18px]"
					>{artigo.titulo}</a
				>
			</h3>
			<p class="text-base leading-relaxed text-pretty text-base-content/65">{artigo.descricao}</p>
			<p class="flex gap-1.5 text-[13px] text-base-content/65">{@render meta()}</p>
		</div>
	</article>
{:else if variante === 'compacto'}
	<article
		class="relative flex h-full cartao-interativo flex-col gap-2.5 rounded-[14px] border border-line bg-card px-5 py-[18px]"
	>
		<div class="flex flex-wrap gap-2">{@render chips()}</div>
		<h3 class="font-display text-[20px] leading-[1.22] font-semibold text-pretty">
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- `href` já sai de resolve() acima. -->
			<a {href} class="text-inherit no-underline after:absolute after:inset-0 after:rounded-[14px]"
				>{artigo.titulo}</a
			>
		</h3>
		<p class="mt-auto text-[13px] text-base-content/65">{minutosDeLeitura(artigo.minutos)}</p>
	</article>
{:else}
	<article
		class="relative flex h-full cartao-interativo flex-col overflow-hidden rounded-[16px] border border-line bg-card"
	>
		{#if artigo.capa}
			<div class="relative aspect-video bg-base-300">
				<IlustracaoDoArtigo {artigo} />
			</div>
		{/if}
		<div class="flex flex-1 flex-col gap-2.5 px-[22px] pt-5 pb-[22px]">
			<div class="flex flex-wrap gap-2">{@render chips()}</div>
			<h3
				class="font-display text-[21px] leading-[1.22] font-semibold tracking-[-0.01em] text-pretty"
			>
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- `href` já sai de resolve() acima. -->
				<a
					{href}
					class="text-inherit no-underline after:absolute after:inset-0 after:rounded-[16px]"
					>{artigo.titulo}</a
				>
			</h3>
			<p class="text-[15px] leading-[1.55] text-pretty text-base-content/65">{artigo.descricao}</p>
			<p class="mt-auto flex gap-1.5 pt-1.5 text-[13px] text-base-content/65">{@render meta()}</p>
		</div>
	</article>
{/if}
