<script lang="ts">
	import type { Snippet } from 'svelte';
	import { resolve } from '$app/paths';
	import Stepper from './Stepper.svelte';
	import AmbientShapes from './AmbientShapes.svelte';
	import { DURACAO } from '$lib/movimento';

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
		larguraAside = 'estreita',
		asideSoNoDesktop = false,
		cancelarNoCelular = true,
		rolagem = 'pagina',
		confirmarSaida,
		concluido = false
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
		 * `larga`: o painel ocupa 42% da largura (a proporção do desenho da etapa 1,
		 * 540 de 1280) e centraliza o conteúdo na vertical. `estreita`: 340px.
		 */
		larguraAside?: 'estreita' | 'larga';
		/**
		 * O painel de apoio some no celular (pedido do dono do repositório para a
		 * etapa 1): ali ele é ilustração — "O que sai daqui" —, e empilhado sob o
		 * formulário só alongava a tela e passava por cima do botão de continuar.
		 * Painel com informação que o professor precisa (o QR da etapa 4) NÃO usa
		 * isto: ele continua descendo para o fim do conteúdo.
		 */
		asideSoNoDesktop?: boolean;
		/**
		 * `false` tira o "Cancelar" do rodapé NO CELULAR (no desktop ele fica sempre).
		 * É da etapa 2 com o formulário aberto: ali o rodapé fica logo abaixo do botão
		 * de adicionar, e num celular estreito (320px) três ações não cabem numa linha —
		 * o "Cancelar" descia sozinho para uma segunda linha quase vazia, e a tela, que
		 * já tem duas barras embaixo, ficava espremida. Sair continua a um toque: a
		 * lista ("Ver os materiais") tem o "Cancelar".
		 */
		cancelarNoCelular?: boolean;
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
		/**
		 * Com isto, "Cancelar" pergunta antes de sair (a etapa de publicar, quando
		 * há o que publicar — o desenho "Studio Publicar A"). Sem, ele só sai.
		 */
		confirmarSaida?: { titulo: string; texto: string; ficar: string; sair: string };
		/**
		 * O wizard ACABOU (no ar, nada por publicar): a saída vira "Fechar". Ao lado
		 * de "Está no ar", "Cancelar" lia como desfazer a publicação.
		 */
		concluido?: boolean;
	} = $props();
	const colunas = $derived(rolagem === 'colunas');

	const rotulos = ['Detalhes', 'Materiais', 'Revisar', 'Publicar'];

	// "Cancelar" mora AQUI, não em cada etapa: sair do fluxo é a mesma saída nas
	// quatro, e quando ela existia só na primeira o professor que mudava de
	// ideia na etapa 3 só tinha o "voltar" — um passo por vez até o começo.
	// Não apaga nada: o rascunho continua salvo e a atividade aparece na lista
	// como rascunho. É por isso que o rótulo é "Cancelar" e não "Descartar".
	const sair = resolve('/(studio)/atividades');

	// A confirmação é um `<dialog>` de verdade (foco preso, Esc e véu vêm do
	// elemento), no molde do `PlanosModal`: a saída anima com ele ainda aberto e o
	// `close()` vem no fim dela.
	let dialogo = $state<HTMLDialogElement>();
	let confirmando = $state(false);
	let fechando = $state(false);
	$effect(() => {
		if (!dialogo) return;
		if (confirmando && !dialogo.open) {
			fechando = false;
			dialogo.showModal();
		} else if (!confirmando && dialogo.open && !fechando) {
			fechando = true;
			const el = dialogo;
			const terminar = () => {
				if (!fechando) return;
				fechando = false;
				if (!confirmando && el.open) el.close();
			};
			el.addEventListener('animationend', terminar, { once: true });
			setTimeout(terminar, DURACAO.curta + 60);
		}
	});
	function aoCancelar(evento: MouseEvent) {
		if (!confirmarSaida) return;
		evento.preventDefault();
		confirmando = true;
	}
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
				class="relative overflow-hidden border-t border-line bg-base-200 lg:shrink-0 lg:border-s lg:border-t-0
				       {larguraAside === 'larga'
					? `flex-col lg:w-[42%] ${asideSoNoDesktop ? 'hidden lg:flex' : 'flex'}`
					: `lg:w-[340px] ${asideSoNoDesktop ? 'hidden lg:block' : ''}`}"
			>
				{@render aside()}
			</aside>
		{/if}
	</div>

	<!-- `z-10`: o rodapé é a ação principal e fica POR CIMA do conteúdo que rola
	     sob ele. Sem z-index, um bloco posicionado do conteúdo (os cartões
	     inclinados de "O que sai daqui", com `z-1`) pintava por cima do botão de
	     continuar no celular. -->
	<footer
		class="sticky bottom-0 z-10 flex flex-wrap items-center gap-3 border-t border-line bg-base-100 px-4 py-3.5 lg:px-7"
	>
		<a
			href={sair}
			onclick={aoCancelar}
			class="order-last shrink-0 rounded-field px-3 py-2.5 text-[13.5px] font-semibold text-base-content/65 no-underline transition-colors hover:bg-base-200 hover:text-base-content lg:order-first
			       {cancelarNoCelular ? '' : 'hidden lg:block'}"
			title={concluido
				? 'Volta para a lista de atividades.'
				: 'Sai da criação. O rascunho continua salvo na lista de atividades.'}
		>
			{concluido ? 'Fechar' : 'Cancelar'}
		</a>
		{#if hint}
			<span class="hidden text-[12.5px] text-base-content/65 lg:inline">{hint}</span>
		{/if}
		<div class="hidden flex-1 lg:block"></div>
		{@render actions()}
	</footer>
</div>

{#if confirmarSaida}
	<dialog
		bind:this={dialogo}
		onclose={() => (confirmando = false)}
		oncancel={(e) => {
			e.preventDefault();
			confirmando = false;
		}}
		onclick={(e) => {
			if (e.target === dialogo) confirmando = false;
		}}
		aria-labelledby="sair-titulo"
		aria-describedby="sair-texto"
		class="m-auto w-[calc(100vw-2rem)] max-w-[420px] rounded-box border border-line bg-base-100 p-6 text-base-content shadow-[0_30px_60px_-30px_rgba(15,20,32,0.5)] backdrop:bg-overlay backdrop:backdrop-blur-[3px]
		       {fechando
			? 'animate-modal-saida backdrop:animate-veu-saida'
			: 'backdrop:animate-veu open:animate-entrada-curta'}"
	>
		<p id="sair-titulo" class="mb-2 font-display text-[20px] font-semibold tracking-[-0.02em]">
			{confirmarSaida.titulo}
		</p>
		<p id="sair-texto" class="mb-5 text-[13.5px] leading-relaxed text-pretty text-base-content/65">
			{confirmarSaida.texto}
		</p>
		<div class="flex flex-wrap gap-2.5">
			<button
				type="button"
				onclick={() => (confirmando = false)}
				class="btn min-h-[46px] min-w-[8rem] flex-1 motion-tap btn-plain font-semibold"
			>
				{confirmarSaida.ficar}
			</button>
			<a
				href={sair}
				class="btn min-h-[46px] min-w-[8rem] flex-1 motion-tap btn-primary font-bold no-underline"
			>
				{confirmarSaida.sair}
			</a>
		</div>
	</dialog>
{/if}
