<script lang="ts">
	import type { Snippet } from 'svelte';
	import { resolve } from '$app/paths';
	import Stepper from './Stepper.svelte';
	import AmbientShapes from './AmbientShapes.svelte';

	/**
	 * Casca das quatro etapas de criação. O wizard NÃO usa a barra lateral do
	 * Studio — durante a criação o professor tem uma tarefa só, e o Stepper
	 * substitui a navegação (paginas.md "Studio").
	 *
	 * Duas cascas, uma por tamanho: no desktop o cabeçalho traz o Stepper
	 * inteiro; no celular, onde quatro rótulos não cabem, ele vira
	 * "Etapa · N de 4" mais pontos. O rodapé é uma barra fixa com a ação
	 * principal — igual nos dois.
	 */
	let {
		step,
		backHref,
		backLabel,
		status,
		hint,
		children,
		actions,
		aside,
		rolagem = 'pagina'
	}: {
		step: number;
		backHref: string;
		/** Para onde o "voltar" leva: etapa anterior ou a lista. */
		backLabel: string;
		/** Canto direito do cabeçalho: "Rascunho salvo", "4 materiais", ... */
		status?: string;
		/** Linha de apoio no rodapé, à esquerda das ações. */
		hint?: string;
		children: Snippet;
		actions: Snippet;
		aside?: Snippet;
		/**
		 * `pagina` (padrão): a página rola, com o rodapé grudado embaixo.
		 * `colunas`: a casca ocupa a altura da tela e quem rola é cada coluna, por
		 * dentro — a etapa 2, onde o formulário fica fixo ao lado da lista. Ali o
		 * corpo do formulário é o pedaço que rola (como na bandeja da biblioteca),
		 * e numa coluna sem altura definida ele crescia até o fim do conteúdo:
		 * o botão de adicionar ia para baixo da dobra e a rodinha sobre a coluna
		 * não rolava nada, porque o `overscroll-contain` dele segurava o gesto.
		 * Nesse modo a faixa de formas não é desenhada aqui: a tela a põe no fim da
		 * coluna que rola, para o texto nunca passar por cima dela.
		 */
		rolagem?: 'pagina' | 'colunas';
	} = $props();
	const colunas = $derived(rolagem === 'colunas');

	const rotulos = ['Detalhes', 'Materiais', 'Revisar', 'Publicar'];

	// "Cancelar" mora AQUI, não em cada etapa: sair do fluxo é a mesma saída nas
	// quatro, e quando ela existia só na primeira o professor que mudava de
	// ideia na etapa 3 só tinha o "voltar" — um passo por vez até o começo.
	// Não apaga nada: o rascunho continua salvo e a atividade aparece na lista
	// como rascunho. É por isso que o rótulo é "Cancelar" e não "Descartar".
	const sair = resolve('/(studio)/atividades');
</script>

<div class="flex flex-col bg-base-100" class:min-h-screen={!colunas} class:h-dvh={colunas}>
	<header class="flex items-center gap-[22px] border-b border-line bg-base-200 px-4 py-3 lg:px-7">
		<!-- eslint-disable svelte/no-navigation-without-resolve -- `backHref` é prop: quem chama já passou por resolve(), que exige literal no call site (mesma regra do href de Button.svelte). -->
		<a
			href={backHref}
			class="flex shrink-0 items-center gap-2 py-1 text-[13.5px] font-semibold text-base-content no-underline transition-transform hover:-translate-x-0.5"
		>
			<svg class="size-4 shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
				<path
					d="M15 5l-7 7 7 7"
					stroke="currentColor"
					stroke-width="2.2"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			</svg>
			<!-- No celular o texto do voltar dá lugar ao título da etapa. -->
			<span class="hidden lg:inline">{backLabel}</span>
		</a>
		<!-- eslint-enable svelte/no-navigation-without-resolve -->

		<div class="min-w-0 flex-1 lg:hidden">
			<p class="truncate text-[15px] font-semibold">{rotulos[step - 1]} · {step} de 4</p>
			{#if status}<p class="truncate text-[12.5px] text-base-content/65">{status}</p>{/if}
		</div>

		<div class="hidden flex-1 lg:block"><Stepper current={step} /></div>

		<!-- Celular: pontos no lugar dos quatro rótulos. -->
		<div class="flex shrink-0 items-center gap-1.5 lg:hidden" aria-hidden="true">
			{#each rotulos as rotulo, i (rotulo)}
				<span
					class="size-1.5 rounded-full {i + 1 === step
						? 'bg-primary'
						: i + 1 < step
							? 'bg-primary/40'
							: 'bg-base-300'}"
				></span>
			{/each}
		</div>

		{#if status}
			<span class="hidden shrink-0 text-[12.5px] text-base-content/65 lg:inline">{status}</span>
		{/if}
	</header>

	<div class="relative flex min-h-0 flex-1 flex-col lg:flex-row" class:overflow-hidden={colunas}>
		<!-- A faixa decorativa das quatro etapas vive AQUI, uma vez, e não em cada
		     tela: no wizard o conteúdo começa colado no topo, então ela ocupa o
		     vazio de baixo — nunca o topo, onde cairia atrás do formulário. É a
		     mesma composição do protótipo (190px no desktop, 150px no celular).
		     Ela vem ANTES do conteúdo no DOM e o conteúdo é `relative`: entre
		     irmãos posicionados sem z-index, quem vem depois pinta por cima — sem
		     precisar de `z-1` em cada bloco das telas filhas. -->
		{#if !colunas}
			<div class="pointer-events-none absolute inset-x-0 bottom-0 h-[150px] lg:h-[190px]">
				<AmbientShapes height="100%" edges="bottom" />
			</div>
		{/if}

		<div class="relative flex min-h-0 min-w-0 flex-1 flex-col">{@render children()}</div>
		{#if aside}
			<!-- O painel de apoio fica à direita no desktop e vira um bloco no fim
			     do conteúdo no celular. -->
			<aside
				class="relative overflow-hidden border-t border-line bg-base-200 lg:w-[340px] lg:shrink-0 lg:border-s lg:border-t-0"
			>
				{@render aside()}
			</aside>
		{/if}
	</div>

	<footer
		class="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-line bg-base-100 px-4 py-3.5 lg:px-7"
	>
		<a
			href={sair}
			class="order-last shrink-0 rounded-field px-3 py-2.5 text-[13.5px] font-semibold text-base-content/65 no-underline transition-colors hover:bg-base-200 hover:text-base-content lg:order-first"
			title="Sai da criação. O rascunho continua salvo na lista de atividades."
		>
			Cancelar
		</a>
		{#if hint}
			<span class="hidden text-[12.5px] text-base-content/65 lg:inline">{hint}</span>
		{/if}
		<div class="hidden flex-1 lg:block"></div>
		{@render actions()}
	</footer>
</div>
