<script lang="ts">
	// O índice do blog (o "Blog Indice" do Claude Design), igual em `/blog` e em
	// `/blog/pagina/[n]`. A primeira página abre com o hero, o guia em destaque e
	// a faixa das escolas; as seguintes vão direto aos cartões.
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { TRIAL } from '$lib/billing/catalogo';
	import { blogEstruturado } from '$lib/blog/dados-estruturados';
	import { linkDeCadastro } from '$lib/blog/links';
	import type { ResumoDoArtigo } from '$lib/blog/tipos';
	import Metadados from '$lib/components/Metadados.svelte';
	import CartaoDoArtigo from './CartaoDoArtigo.svelte';
	import ChipsDeTemas from './ChipsDeTemas.svelte';
	import ConversaoDoBlog from './ConversaoDoBlog.svelte';
	import DadosEstruturados from './DadosEstruturados.svelte';
	import PaginacaoDoBlog from './PaginacaoDoBlog.svelte';

	let {
		dados
	}: {
		dados: {
			destaque: ResumoDoArtigo | null;
			artigos: ResumoDoArtigo[];
			pagina: number;
			total: number;
			temas: { slug: string; nome: string }[];
			artigosParaEscolas: number;
		};
	} = $props();

	const DESCRICAO =
		'Ideias e material pronto para a próxima aula de idiomas, e roteiros para quem coordena uma escola de idiomas. O blog do Spokke.';

	const primeira = $derived(dados.pagina === 1);
	/** A chamada do meio entra depois do sexto cartão; com menos, depois da grade. */
	const antes = $derived(dados.artigos.slice(0, 6));
	const depois = $derived(dados.artigos.slice(6));
	const url = $derived(page.url.origin + page.url.pathname);
	const estruturados = $derived([
		blogEstruturado({
			url,
			origem: page.url.origin,
			descricao: DESCRICAO,
			artigos: [...(dados.destaque ? [dados.destaque] : []), ...dados.artigos]
		})
	]);
	const grade = 'grid grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))] gap-[22px]';
</script>

<Metadados
	titulo="Blog do Spokke"
	descricao={DESCRICAO}
	tituloDaAba={primeira ? 'Blog · Spokke' : `Página ${dados.pagina} · Blog · Spokke`}
/>
<DadosEstruturados dados={estruturados} />

<main class="mx-auto max-w-[1200px] px-[clamp(18px,2.4vw,28px)]">
	{#if primeira}
		<div
			class="relative flex items-center gap-10 pt-[clamp(36px,5vw,72px)] pb-[clamp(28px,3.4vw,44px)]"
		>
			<div class="relative z-1 max-w-[700px] min-w-0 flex-1 animate-entrada">
				<h1
					class="mb-4 font-display text-[clamp(34px,2.4vw+22px,56px)] leading-[1.04] font-semibold tracking-[-0.03em] text-balance"
				>
					Ideias para a próxima aula
				</h1>
				<p
					class="mb-[26px] max-w-[56ch] text-[clamp(17px,0.5vw+15px,20px)] leading-[1.55] text-pretty text-base-content/65"
				>
					Métodos e material pronto para quem ensina idiomas, e roteiros para quem coordena uma
					escola.
				</p>
				<ChipsDeTemas temas={dados.temas} escolas={dados.artigosParaEscolas > 0} />
			</div>
			<!-- Cinco formas, cinco tipos (design-system.md "Formas de ambiente"),
			     numa região sem texto e com a borda em degradê. Só no desktop. Cada
			     uma flutua no seu ritmo, com os mesmos keyframes da home (app.css);
			     com prefers-reduced-motion, ficam paradas. -->
			<div
				aria-hidden="true"
				class="pointer-events-none relative hidden h-[300px] flex-[0_0_360px] [mask-image:radial-gradient(ellipse_70%_70%_at_60%_50%,#000_45%,transparent_100%)] lg:block"
			>
				<div
					class="absolute start-10 top-[30px] size-[130px] animate-[en-float-a_17s_ease-in-out_infinite] rounded-full bg-primary/30"
				></div>
				<div
					class="absolute end-[30px] top-5 h-24 w-[110px] animate-[en-float-c_21s_ease-in-out_infinite] bg-accent/30 [clip-path:polygon(50%_0,100%_100%,0_100%)]"
				></div>
				<div
					class="absolute end-[60px] bottom-[30px] size-[120px] animate-[en-drift-spin_26s_ease-in-out_infinite] bg-primary/25 [clip-path:polygon(25%_3%,75%_3%,100%_50%,75%_97%,25%_97%,0%_50%)]"
				></div>
				<div
					class="absolute start-[120px] bottom-10 size-[92px] animate-[en-spin_20s_linear_infinite] rounded-full border-2 border-dashed border-accent/45"
				></div>
				<div
					class="absolute start-2.5 bottom-[90px] h-10 w-[110px] animate-[en-float-b_15s_ease-in-out_infinite] rounded-full bg-accent/28"
				></div>
			</div>
		</div>
	{:else}
		<div class="pt-[clamp(28px,4vw,52px)] pb-8">
			<p class="mb-2 text-sm font-semibold text-base-content/65">
				<a
					href={resolve('/(site)/blog')}
					class="text-inherit underline decoration-line underline-offset-[3px] hover:text-primary"
					>Blog</a
				>
			</p>
			<h1
				class="font-display text-[clamp(30px,1.6vw+22px,44px)] leading-[1.08] font-semibold tracking-[-0.025em]"
			>
				Página {dados.pagina} de {dados.total}
			</h1>
		</div>
	{/if}

	<h2 class="sr-only">Artigos</h2>

	{#if dados.destaque}
		<CartaoDoArtigo
			artigo={dados.destaque}
			variante="destaque"
			selo={dados.destaque.guiaDoTema ? 'Guia principal' : undefined}
		/>
	{/if}

	{#if primeira && dados.artigosParaEscolas > 0}
		<!-- A faixa das escolas: distinta dos cartões, para a coordenação ver em
		     segundos que o blog também é para ela (estrutura de SEO, "Índice"). -->
		<a
			href={resolve('/(site)/blog/para-escolas')}
			class="group mt-6 flex motion-tap flex-wrap items-center gap-x-6 gap-y-2 rounded-[16px] bg-panel px-[clamp(20px,2.4vw,30px)] py-5 text-panel-content no-underline hover:-translate-y-0.5"
		>
			<span class="min-w-0 flex-[1_1_320px]">
				<span class="block font-display text-[21px] font-semibold tracking-[-0.01em]"
					>Dirige uma escola de idiomas?</span
				>
				<span class="mt-1 block text-[15px] leading-normal text-panel-dim">
					Artigos para a coordenação: padronizar as atividades, acompanhar as turmas pelos números e
					cuidar dos dados dos alunos.
				</span>
			</span>
			<span class="inline-flex items-center gap-2 text-[15px] font-bold">
				Ver os artigos para escolas
				<svg
					class="size-4 transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100"
					viewBox="0 0 24 24"
					fill="none"
					aria-hidden="true"
				>
					<path
						d="M5 12h13M13 6l6 6-6 6"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
			</span>
		</a>
	{/if}

	{#if antes.length > 0}
		<ul class="{grade} mt-8 list-none p-0">
			{#each antes as artigo (artigo.slug)}
				<li><CartaoDoArtigo {artigo} /></li>
			{/each}
		</ul>
	{/if}

	<div
		class="my-8 flex flex-wrap items-center gap-x-8 gap-y-[18px] rounded-[16px] border border-line bg-base-200 p-[clamp(22px,2.6vw,32px)]"
	>
		<div class="min-w-0 flex-[1_1_340px]">
			<p
				class="mb-2 font-display text-[clamp(22px,1vw+16px,26px)] leading-[1.15] font-semibold tracking-[-0.015em] text-balance"
			>
				Cole as frases da sua aula e veja as questões prontas.
			</p>
			<p class="text-[15px] leading-normal text-base-content/65">
				{TRIAL.dias} dias grátis. Seus alunos não criam conta.
			</p>
		</div>
		<!-- eslint-disable svelte/no-navigation-without-resolve -- o destino já sai de resolve() em `$lib/blog/links`. -->
		<a
			href={linkDeCadastro()}
			data-evento="cta_blog"
			data-rotulo="Criar a conta grátis"
			data-artigo="indice"
			class="btn btn-lg motion-tap btn-primary no-underline">Criar a conta grátis</a
		>
		<!-- eslint-enable svelte/no-navigation-without-resolve -->
	</div>

	{#if depois.length > 0}
		<ul class="{grade} list-none p-0">
			{#each depois as artigo (artigo.slug)}
				<li><CartaoDoArtigo {artigo} /></li>
			{/each}
		</ul>
	{/if}

	<PaginacaoDoBlog atual={dados.pagina} total={dados.total} />
	{#if dados.total <= 1}<div class="pb-[72px]"></div>{/if}
</main>

<ConversaoDoBlog publico="professor" variante="clara" />
