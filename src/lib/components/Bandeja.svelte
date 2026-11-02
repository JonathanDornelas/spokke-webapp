<script lang="ts">
	// A BANDEJA: todo formulário de criar e editar do Studio que não é atividade
	// abre aqui, pela direita, sobre a tela de onde veio — turma, aluno, módulo,
	// material, programação, convite da escola (components.md "Bandeja"). Cada
	// tela tinha o seu jeito: painel de 520px, formulário que abria no meio da
	// página empurrando a lista, página inteira para criar uma turma. Agora é
	// UM desenho, com a mesma anatomia em todas:
	//
	//   cabeçalho  a marca (a etiqueta do que se está criando, quando existe),
	//              o título, uma frase sobre a consequência e o X;
	//   corpo      os campos, o único pedaço que rola;
	//   rodapé     o resumo do que vai acontecer, o erro do servidor (escrito,
	//              nunca só um botão que volta ao normal) e as ações.
	//
	// **A largura é ~40% da tela** (`--largura-bandeja`, no `app.css`), com piso
	// e teto; no celular, a tela inteira.
	//
	// **O rodapé fica FORA do `<form>`** — o corpo rola e o rodapé não. Quem
	// envia é um `<button type="submit" form={id}>`: o atributo `form` liga o
	// botão ao formulário por id, e o Enter dentro de um campo continua
	// enviando (o botão associado conta como o botão padrão do formulário).
	//
	// Dois modos de montagem:
	// - padrão: o conteúdo só existe aberto (`{#if}`), e entra e sai pelas
	//   transições de `transicoes.ts`. Fechar desmonta — reabrir uma edição
	//   começa dos valores gravados, não do que ficou digitado e cancelado.
	//   As transições são LOCAIS de propósito: a bandeja some com a página numa
	//   navegação, sem segurar a página velha na tela pelo tempo da saída;
	// - `manterMontada`: o conteúdo existe fechado (a biblioteca de materiais
	//   chama métodos do formulário por `bind:this` antes do primeiro clique).
	//   Entra e sai por CSS; fechada é `invisible` + `inert`.
	//
	// Foco: abre no `[data-autofoco]` (ou no próprio painel, que se anuncia pelo
	// título), fica preso dentro enquanto aberta, e volta para quem a abriu.
	// Esc e o clique no véu fecham.
	import type { Snippet } from 'svelte';
	import { tick } from 'svelte';
	import { painelLateral, veu } from '$lib/client/transicoes';

	let {
		aberta,
		onfechar,
		titulo = '',
		descricao = '',
		rotulo,
		marca,
		children,
		resumo = '',
		erro = null,
		rodape,
		moldura = true,
		manterMontada = false
	}: {
		aberta: boolean;
		onfechar: () => void;
		titulo?: string;
		/** Uma frase: o que este formulário muda e o que ele NÃO muda. */
		descricao?: string;
		/** O nome para o leitor de tela quando não há título (`moldura={false}`). */
		rotulo?: string;
		/** A etiqueta à esquerda do título — a turma, o módulo, como vão aparecer na lista. */
		marca?: Snippet;
		children: Snippet;
		/** A consequência, à esquerda das ações: "3 alunos · 2 recebem convite". */
		resumo?: string;
		/** A recusa do servidor, escrita no rodapé, junto do botão que a causou. */
		erro?: string | null;
		/** As ações, da menos para a mais importante: a principal fica na ponta. */
		rodape?: Snippet;
		/** `false`: o conteúdo desenha cabeçalho, corpo e rodapé (o `MaterialForm`). */
		moldura?: boolean;
		manterMontada?: boolean;
	} = $props();

	const id = $props.id();
	let painel = $state<HTMLElement | null>(null);

	// Quem abriu a bandeja recebe o foco de volta ao fechar — senão ele cai no
	// `<body>` e o teclado recomeça do topo da página.
	$effect(() => {
		if (!aberta) return;
		const voltarPara =
			document.activeElement instanceof HTMLElement ? document.activeElement : null;
		void tick().then(focarAoAbrir);
		return () => {
			if (voltarPara && document.contains(voltarPara)) voltarPara.focus({ preventScroll: true });
		};
	});

	function focarAoAbrir() {
		if (!painel) return;
		// Quem abriu pode já ter posto o foco num campo (o `novo()` do material).
		if (painel.contains(document.activeElement)) return;
		const alvo = painel.querySelector<HTMLElement>('[data-autofoco]') ?? painel;
		alvo.focus({ preventScroll: true });
	}

	const FOCAVEIS =
		'a[href],button:not(:disabled),input:not(:disabled):not([type="hidden"]),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])';

	/** O Tab dá a volta dentro da bandeja: o que está atrás do véu não recebe foco. */
	function prenderFoco(e: KeyboardEvent) {
		if (e.key !== 'Tab' || !painel) return;
		const focaveis = [...painel.querySelectorAll<HTMLElement>(FOCAVEIS)].filter(
			(el) => el.getClientRects().length > 0
		);
		if (focaveis.length === 0) return;
		const primeiro = focaveis[0];
		const ultimo = focaveis[focaveis.length - 1];
		const atual = document.activeElement;
		if (e.shiftKey && (atual === primeiro || atual === painel)) {
			e.preventDefault();
			ultimo.focus();
		} else if (!e.shiftKey && atual === ultimo) {
			e.preventDefault();
			primeiro.focus();
		}
	}

	function aoTeclar(e: KeyboardEvent) {
		if (aberta && e.key === 'Escape' && !e.defaultPrevented) onfechar();
	}

	const classePainel =
		'relative flex h-dvh w-full flex-col border-s border-line bg-base-100 shadow-[-24px_0_60px_-30px_rgba(0,0,0,0.35)] outline-none sm:w-(--largura-bandeja)';
</script>

<svelte:window onkeydown={aoTeclar} />

{#snippet interior()}
	{#if moldura}
		<header
			class="flex flex-none items-start gap-3.5 border-b border-line px-5 py-4 lg:px-6 lg:py-5"
		>
			{#if marca}{@render marca()}{/if}
			<div class="min-w-0 flex-1">
				<h2
					id="{id}-titulo"
					class="font-display text-[20px] leading-tight font-semibold tracking-[-0.02em] text-pretty lg:text-[22px]"
				>
					{titulo}
				</h2>
				{#if descricao}
					<p class="mt-1 text-[13px] leading-normal text-pretty text-base-content/65">
						{descricao}
					</p>
				{/if}
			</div>
			<button
				type="button"
				onclick={onfechar}
				class="btn size-10 min-h-10 flex-none motion-tap btn-neutral p-0"
				aria-label="Fechar"
			>
				<svg class="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true"
					><path
						d="M6 6l12 12M18 6L6 18"
						stroke="currentColor"
						stroke-width="2.2"
						stroke-linecap="round"
					/></svg
				>
			</button>
		</header>

		<div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 lg:px-6 lg:py-6">
			{@render children()}
		</div>

		{#if rodape || erro}
			<footer
				class="flex flex-none flex-wrap items-center gap-x-2.5 gap-y-2.5 border-t border-line bg-base-200 px-5 py-3.5 lg:px-6"
			>
				{#if erro}
					<p
						class="flex w-full items-start gap-2 text-[13px] leading-snug font-semibold text-error"
						role="alert"
					>
						<svg class="mt-px size-4 flex-none" viewBox="0 0 24 24" fill="none" aria-hidden="true"
							><path
								d="M12 7.5v6M12 16.5h.01M12 3l9.5 17H2.5z"
								stroke="currentColor"
								stroke-width="2.2"
								stroke-linecap="round"
								stroke-linejoin="round"
							/></svg
						>
						{erro}
					</p>
				{/if}
				{#if resumo}
					<p
						class="min-w-0 flex-[1_1_12rem] text-[12.5px] leading-snug text-pretty text-base-content/65"
					>
						{resumo}
					</p>
				{/if}
				{#if rodape}
					<!-- No celular as ações dividem a largura; no resto, encostam no fim. -->
					<div class="ms-auto flex flex-wrap justify-end gap-2.5 max-sm:w-full max-sm:*:flex-1">
						{@render rodape()}
					</div>
				{/if}
			</footer>
		{/if}
	{:else}
		{@render children()}
	{/if}
{/snippet}

{#if manterMontada}
	<div
		class="fixed inset-0 z-60 flex justify-end transition-[visibility] {aberta
			? 'visible duration-(--duration-media)'
			: 'invisible duration-(--duration-curta)'}"
		inert={!aberta}
	>
		<button
			type="button"
			tabindex="-1"
			onclick={onfechar}
			class="absolute inset-0 bg-overlay transition-opacity {aberta
				? 'opacity-100 duration-(--duration-media) ease-out-soft'
				: 'opacity-0 duration-(--duration-curta) ease-in-soft'}"
			aria-label="Fechar"
		></button>
		<div
			bind:this={painel}
			role="dialog"
			aria-modal="true"
			aria-labelledby={moldura ? `${id}-titulo` : undefined}
			aria-label={moldura ? undefined : rotulo}
			tabindex="-1"
			onkeydown={prenderFoco}
			class="{classePainel} transition-transform {aberta
				? 'translate-x-0 duration-(--duration-media) ease-out-soft'
				: 'translate-x-full duration-(--duration-curta) ease-in-soft rtl:-translate-x-full'}"
		>
			{@render interior()}
		</div>
	</div>
{:else if aberta}
	<div class="fixed inset-0 z-60 flex justify-end">
		<button
			type="button"
			tabindex="-1"
			onclick={onfechar}
			class="absolute inset-0 bg-overlay"
			aria-label="Fechar"
			in:veu
			out:veu
		></button>
		<div
			bind:this={painel}
			role="dialog"
			aria-modal="true"
			aria-labelledby={moldura ? `${id}-titulo` : undefined}
			aria-label={moldura ? undefined : rotulo}
			tabindex="-1"
			onkeydown={prenderFoco}
			class={classePainel}
			in:painelLateral
			out:painelLateral
		>
			{@render interior()}
		</div>
	</div>
{/if}
