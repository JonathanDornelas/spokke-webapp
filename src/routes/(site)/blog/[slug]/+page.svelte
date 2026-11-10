<script lang="ts">
	// O artigo (o "Blog Artigo" do Claude Design), SEM AUTOR: o topo diz quando
	// o texto saiu, quando mudou e quanto leva para ler, e nada de quem assina
	// (decisão do dono em 2026-11-10). Os dados estruturados levam a marca como
	// autora.
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { artigoEstruturado, trilhaEstruturada } from '$lib/blog/dados-estruturados';
	import { dataDoArtigo, minutosDeLeitura } from '$lib/blog/formato';
	import Metadados from '$lib/components/Metadados.svelte';
	import CartaoDoArtigo from '$lib/components/blog/CartaoDoArtigo.svelte';
	import CompartilharArtigo from '$lib/components/blog/CompartilharArtigo.svelte';
	import ConversaoDoBlog from '$lib/components/blog/ConversaoDoBlog.svelte';
	import DadosEstruturados from '$lib/components/blog/DadosEstruturados.svelte';
	import ExemploPronto from '$lib/components/blog/ExemploPronto.svelte';
	import Migalhas from '$lib/components/blog/Migalhas.svelte';
	import NoSpokke from '$lib/components/blog/NoSpokke.svelte';
	import PerguntasFrequentes from '$lib/components/blog/PerguntasFrequentes.svelte';
	import SumarioDoArtigo from '$lib/components/blog/SumarioDoArtigo.svelte';
	import type { QuestaoNaTela } from '../../../exemplo/resposta.svelte';
	import QuestaoDoArtigo from './QuestaoDoArtigo.svelte';
	import type { PageData } from './$types';

	let { data }: { data: Omit<PageData, 'questoes'> & { questoes: QuestaoNaTela[] } } = $props();

	const a = $derived(data.artigo);
	const url = $derived(page.url.origin + page.url.pathname);
	const hrefDoTema = $derived(resolve('/(site)/blog/tema/[tema]', { tema: a.tema.slug }));
	const paraEscola = $derived(a.publico === 'escola' || a.publico === 'ambos');
	/** O sumário entra a partir de quatro seções: com menos, ele é maior que o que resume. */
	const comSumario = $derived(a.sumario.length >= 4);
	const imagem = $derived(page.url.origin + (a.capa?.src ?? '/og/spokke.png'));
	const estruturados = $derived([
		artigoEstruturado(a, { origem: page.url.origin, url, imagem }),
		trilhaEstruturada([
			{ nome: 'Início', url: `${page.url.origin}/` },
			{ nome: 'Blog', url: `${page.url.origin}/blog` },
			{ nome: a.tema.nome, url: page.url.origin + hrefDoTema },
			{ nome: a.titulo, url }
		])
	]);

	function questao(itemId: string): QuestaoNaTela | undefined {
		return data.questoes.find((q) => q.id === itemId);
	}
</script>

<Metadados
	titulo={a.titulo}
	descricao={a.descricao}
	tituloDaAba="{a.tituloSeo} · Spokke"
	tipo="article"
	publicadoEm={a.publicadoEm}
	atualizadoEm={a.atualizadoEm}
	secao={a.tema.nome}
	imagem={a.capa?.src}
	imagemAlt={a.capa?.alt}
/>
<DadosEstruturados dados={estruturados} />

<main class="mx-auto max-w-[1120px] px-[clamp(18px,2.6vw,36px)] pt-[clamp(24px,3.6vw,52px)]">
	<header class="max-w-[820px] animate-entrada">
		<Migalhas
			itens={[
				{ rotulo: 'Início', href: resolve('/') },
				{ rotulo: 'Blog', href: resolve('/(site)/blog') },
				{ rotulo: a.tema.nome, href: hrefDoTema }
			]}
		/>

		<div class="mb-4 flex flex-wrap items-center gap-2">
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- `hrefDoTema` sai de resolve(). -->
			<a
				href={hrefDoTema}
				class="inline-flex min-h-[30px] items-center rounded-full bg-base-300 px-3 text-[13px] font-bold text-primary no-underline transition-colors hover:bg-primary/18"
				>{a.tema.nome}</a
			>
			{#if paraEscola}
				<a
					href={resolve('/(site)/blog/para-escolas')}
					class="inline-flex min-h-[30px] items-center rounded-full bg-panel px-3 text-[13px] font-semibold text-panel-content no-underline"
					>Para escolas</a
				>
			{/if}
			{#if a.rascunho}
				<span
					class="inline-flex min-h-[30px] items-center rounded-full border border-dashed border-base-content/40 px-3 text-[13px] font-semibold text-base-content/70"
					>Rascunho: só aparece em desenvolvimento</span
				>
			{/if}
		</div>

		<h1
			class="mb-4 font-display text-[clamp(32px,1.7vw+24px,50px)] leading-[1.05] font-semibold tracking-[-0.025em] text-balance"
		>
			{a.titulo}
		</h1>
		<p
			class="max-w-[62ch] text-[clamp(18px,0.4vw+16px,20px)] leading-[1.55] text-pretty text-base-content/65"
		>
			{a.linhaFina}
		</p>

		<p class="mt-[22px] flex flex-wrap gap-x-2 text-[13.5px] text-base-content/65">
			<span>Publicado em <time datetime={a.publicadoEm}>{dataDoArtigo(a.publicadoEm)}</time></span>
			{#if a.atualizadoEm}
				<span
					><span aria-hidden="true">· </span>Atualizado em
					<time datetime={a.atualizadoEm}>{dataDoArtigo(a.atualizadoEm)}</time></span
				>
			{/if}
			<span><span aria-hidden="true">· </span>{minutosDeLeitura(a.minutos)}</span>
		</p>
	</header>

	{#if comSumario}
		<div class="lg:hidden"><SumarioDoArtigo itens={a.sumario} formato="celular" /></div>
	{/if}

	<div class="mt-[clamp(28px,3vw,40px)] flex items-start gap-[72px]">
		<article class="max-w-[720px] min-w-0 flex-1">
			{#if a.capa}
				<img
					src={a.capa.src}
					alt={a.capa.alt}
					width="1200"
					height="630"
					fetchpriority="high"
					class="mb-9 aspect-[1200/630] w-full rounded-[16px] object-cover"
				/>
			{/if}

			{#each a.blocos as bloco, i (i)}
				{#if bloco.tipo === 'html'}
					<!-- eslint-disable-next-line svelte/no-at-html-tags -- Markdown do próprio repositório, convertido no servidor (`$lib/server/blog/markdown.ts`). -->
					<div class="prosa-do-blog">{@html bloco.html}</div>
				{:else if bloco.tipo === 'exemplo'}
					<ExemploPronto {...bloco} />
				{:else if bloco.tipo === 'no-spokke'}
					<NoSpokke
						id={bloco.id}
						titulo={bloco.titulo}
						html={bloco.html}
						publico={a.publico}
						slug={a.slug}
					/>
				{:else if bloco.tipo === 'questao'}
					{@const q = questao(bloco.itemId)}
					{#if q}<QuestaoDoArtigo questao={q} texto={bloco.texto} />{/if}
				{:else if bloco.tipo === 'perguntas'}
					<PerguntasFrequentes id={bloco.id} titulo={bloco.titulo} perguntas={bloco.perguntas} />
				{/if}
			{/each}

			<CompartilharArtigo titulo={a.titulo} {url} />

			{#if a.publico === 'professor' && data.temHubDasEscolas}
				<!-- A ponte para a escola: não conta como chamada (docs/blog.md "Conversão"). -->
				<p class="mt-7 border-t border-line pt-5 text-[15px] leading-normal text-base-content/75">
					Dá aula numa escola?
					<a
						href={resolve('/(site)/blog/para-escolas')}
						class="font-semibold text-primary underline underline-offset-[3px]"
						>Mostre à coordenação como funciona o plano da escola</a
					>.
				</p>
			{/if}
		</article>

		{#if comSumario}
			<aside class="sticky top-24 hidden w-[260px] flex-none lg:block">
				<SumarioDoArtigo itens={a.sumario} formato="lateral" />
			</aside>
		{/if}
	</div>

	{#if data.relacionados.length > 0}
		<section aria-labelledby="leia-tambem" class="mt-[72px] pb-[72px]">
			<h2
				id="leia-tambem"
				class="mb-5 font-display text-[24px] font-semibold tracking-[-0.015em] md:text-[28px]"
			>
				Leia também
			</h2>
			<ul
				class="grid list-none grid-cols-[repeat(auto-fill,minmax(min(100%,280px),1fr))] gap-[18px] p-0"
			>
				{#each data.relacionados as artigo (artigo.slug)}
					<li><CartaoDoArtigo {artigo} variante="compacto" /></li>
				{/each}
			</ul>
		</section>
	{:else}
		<div class="pb-[72px]"></div>
	{/if}
</main>

<ConversaoDoBlog publico={a.publico} slug={a.slug} />
