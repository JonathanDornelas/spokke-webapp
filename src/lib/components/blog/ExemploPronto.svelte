<script lang="ts">
	// O material pronto do artigo (o "Blog Exemplo" do Claude Design): as frases
	// no idioma alvo, a tradução embaixo e "Copiar a lista". Copia só as frases,
	// uma por linha: é o formato que a lista colada do Spokke aceita, e a
	// tradução sai sozinha do outro lado.
	//
	// O idioma, a direção e o rótulo vêm do LanguageProfile, resolvidos no
	// servidor: o componente não conhece idioma nenhum.
	import type { LinhaDoExemplo } from '$lib/blog/tipos';
	import { registrarEvento } from '$lib/client/medicao';

	let {
		titulo,
		idioma,
		rotuloDoIdioma,
		codigoDoIdioma,
		direcao,
		idiomaDaTraducao = 'pt-BR',
		direcaoDaTraducao = 'ltr',
		linhas
	}: {
		titulo: string;
		idioma: string;
		rotuloDoIdioma: string;
		codigoDoIdioma: string;
		direcao: 'ltr' | 'rtl';
		idiomaDaTraducao?: string;
		direcaoDaTraducao?: 'ltr' | 'rtl';
		linhas: LinhaDoExemplo[];
	} = $props();

	let copiado = $state(false);
	let falhou = $state(false);
	let espera: ReturnType<typeof setTimeout> | undefined;

	async function copiar() {
		clearTimeout(espera);
		try {
			await navigator.clipboard.writeText(linhas.map((l) => l.texto).join('\n'));
			copiado = true;
			falhou = false;
			registrarEvento('copiar_lista', { idioma });
		} catch {
			// Sem permissão de área de transferência (iframe, HTTP): o texto está
			// na tela para selecionar à mão, e o botão diz isso.
			falhou = true;
		}
		espera = setTimeout(() => {
			copiado = false;
			falhou = false;
		}, 2000);
	}

	$effect(() => () => clearTimeout(espera));
</script>

<section aria-label={titulo} class="my-9 overflow-hidden rounded-[16px] border border-line bg-card">
	<div
		class="flex flex-wrap items-center gap-x-3.5 gap-y-2.5 border-b border-line bg-base-200 px-5 py-3.5"
	>
		<p class="flex-[1_1_200px] font-display text-[20px] font-semibold tracking-[-0.01em]">
			{titulo}
		</p>
		<p class="inline-flex items-center gap-2 text-[13.5px] font-semibold">
			<span
				class="inline-grid h-6 min-w-7 place-items-center rounded-[6px] border border-line bg-card px-[5px] font-mono text-[11.5px] font-semibold"
				aria-hidden="true">{codigoDoIdioma}</span
			>
			{rotuloDoIdioma}
		</p>
	</div>
	<ol class="grid list-none px-5 py-1">
		{#each linhas as linha (linha.texto)}
			<li class="grid gap-1 border-b border-line py-3.5">
				<span
					lang={idioma}
					dir={direcao}
					data-content-lang={idioma}
					class="block text-[19px] leading-[1.55] font-medium">{linha.texto}</span
				>
				{#if linha.traducao}
					<span
						lang={idiomaDaTraducao}
						dir={direcaoDaTraducao}
						class="text-[14.5px] leading-normal text-base-content/65">{linha.traducao}</span
					>
				{/if}
			</li>
		{/each}
	</ol>
	<div class="-mt-px flex flex-wrap items-center gap-x-4 gap-y-3 bg-card px-5 pt-3.5 pb-[18px]">
		<button
			type="button"
			onclick={copiar}
			class="btn min-h-11 motion-tap gap-2 btn-outline bg-base-100"
		>
			{#if copiado}
				<svg class="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<path
						d="M4 12.5l5 5L20 6.5"
						stroke="currentColor"
						stroke-width="2.4"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
			{:else}
				<svg class="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<rect
						x="8.5"
						y="8.5"
						width="12"
						height="12"
						rx="2.5"
						stroke="currentColor"
						stroke-width="2"
					/>
					<path
						d="M15.5 8.5V6a2.5 2.5 0 00-2.5-2.5H6A2.5 2.5 0 003.5 6v7A2.5 2.5 0 006 15.5h2.5"
						stroke="currentColor"
						stroke-width="2"
					/>
				</svg>
			{/if}
			<span aria-live="polite"
				>{copiado ? 'Copiado' : falhou ? 'Selecione e copie à mão' : 'Copiar a lista'}</span
			>
		</button>
		<span class="flex-[1_1_220px] text-sm leading-normal text-base-content/65">
			Cole no Spokke e as questões saem dessas frases.
		</span>
	</div>
</section>
