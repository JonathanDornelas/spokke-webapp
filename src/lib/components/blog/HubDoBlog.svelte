<script lang="ts">
	// O hub (o "Blog Tema" do Claude Design): o de um tema (`/blog/tema/[tema]`)
	// e o das escolas (`/blog/para-escolas`). Abertura própria, o guia principal
	// em destaque, todos os artigos e os outros temas. Com menos de três artigos
	// ele sai da busca (`noindex`): página fina não ranqueia e só dilui o site.
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { colecaoEstruturada, trilhaEstruturada } from '$lib/blog/dados-estruturados';
	import type { Publico, ResumoDoArtigo } from '$lib/blog/tipos';
	import Metadados from '$lib/components/Metadados.svelte';
	import CartaoDoArtigo from './CartaoDoArtigo.svelte';
	import ChipsDeTemas from './ChipsDeTemas.svelte';
	import ConversaoDoBlog from './ConversaoDoBlog.svelte';
	import DadosEstruturados from './DadosEstruturados.svelte';
	import Migalhas from './Migalhas.svelte';

	let {
		hub,
		guia,
		artigos,
		outrosTemas,
		indexar,
		paraEscolas = false,
		linkDasEscolas = false,
		rotuloDoGuia
	}: {
		hub: {
			nome: string;
			titulo: string;
			tituloSeo: string;
			descricao: string;
			abertura: string[];
			publico: Publico;
		};
		guia: ResumoDoArtigo | null;
		artigos: ResumoDoArtigo[];
		outrosTemas: { slug: string; nome: string }[];
		indexar: boolean;
		/** Este é o hub das escolas (muda o título da lista). */
		paraEscolas?: boolean;
		/** O hub das escolas existe e não é este: entra nos "Outros temas". */
		linkDasEscolas?: boolean;
		rotuloDoGuia: string;
	} = $props();

	const url = $derived(page.url.origin + page.url.pathname);
	const todos = $derived([...(guia ? [guia] : []), ...artigos]);
	const contagem = $derived(todos.length === 1 ? '1 artigo' : `${todos.length} artigos`);
	const estruturados = $derived([
		colecaoEstruturada({
			nome: hub.titulo,
			descricao: hub.descricao,
			url,
			origem: page.url.origin,
			artigos: todos
		}),
		trilhaEstruturada([
			{ nome: 'Início', url: `${page.url.origin}/` },
			{ nome: 'Blog', url: `${page.url.origin}/blog` },
			{ nome: hub.nome, url }
		])
	]);
</script>

<Metadados
	titulo={hub.titulo}
	descricao={hub.descricao}
	tituloDaAba="{hub.tituloSeo} · Blog · Spokke"
	{indexar}
/>
<DadosEstruturados dados={estruturados} />

<main class="mx-auto max-w-[1200px] px-[clamp(18px,2.4vw,28px)]">
	<header class="max-w-[820px] animate-entrada pt-[clamp(28px,4vw,56px)] pb-[clamp(24px,3vw,40px)]">
		<Migalhas
			itens={[
				{ rotulo: 'Início', href: resolve('/') },
				{ rotulo: 'Blog', href: resolve('/(site)/blog') },
				{ rotulo: hub.nome }
			]}
		/>
		<h1
			class="mb-5 font-display text-[clamp(32px,1.8vw+24px,52px)] leading-[1.05] font-semibold tracking-[-0.025em] text-balance"
		>
			{hub.titulo}
		</h1>
		<div
			class="grid max-w-[68ch] gap-4 text-[clamp(17px,0.3vw+16px,18px)] leading-[1.7] text-pretty"
		>
			{#each hub.abertura as paragrafo (paragrafo)}
				<p>{paragrafo}</p>
			{/each}
		</div>
	</header>

	{#if guia}
		<section aria-label={rotuloDoGuia}>
			<CartaoDoArtigo artigo={guia} variante="destaque" selo={rotuloDoGuia} />
		</section>
	{/if}

	{#if artigos.length > 0}
		<section aria-labelledby="todos-os-artigos" class="mt-14">
			<div class="mb-5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
				<h2
					id="todos-os-artigos"
					class="font-display text-[24px] font-semibold tracking-[-0.015em] md:text-[28px]"
				>
					{paraEscolas ? 'Todos os artigos para escolas' : 'Todos os artigos do tema'}
				</h2>
				<p class="text-sm text-base-content/65">{contagem}</p>
			</div>
			<ul
				class="grid list-none grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))] gap-[22px] p-0"
			>
				{#each artigos as artigo (artigo.slug)}
					<li><CartaoDoArtigo {artigo} /></li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if outrosTemas.length > 0 || linkDasEscolas}
		<section aria-labelledby="outros-temas" class="mt-14 pb-[72px]">
			<h2 id="outros-temas" class="mb-4 font-display text-[22px] font-semibold tracking-[-0.01em]">
				Outros temas
			</h2>
			<ChipsDeTemas temas={outrosTemas} escolas={linkDasEscolas} rotulo="Outros temas" />
		</section>
	{:else}
		<div class="pb-[72px]"></div>
	{/if}
</main>

<ConversaoDoBlog publico={hub.publico} />
