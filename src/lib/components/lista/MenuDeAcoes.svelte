<script lang="ts">
	// O "⋯" de uma linha da lista: as ações de UM item (arquivar, apagar), no
	// molde do menu do cartão de módulo. Um menu de verdade: abre e foca o
	// primeiro item, as setas andam, Esc e o clique fora fecham (e o foco volta ao
	// botão). A ação de perigo vem em vermelho e por último.
	import Loading from '$lib/components/Loading.svelte';

	interface Acao {
		rotulo: string;
		/** O traço do ícone (24 × 24, como os outros da tela). */
		icone: string;
		perigo?: boolean;
		onclick: () => void;
	}

	let {
		rotulo,
		acoes,
		ocupado = false
	}: {
		/** "Mais ações de Present perfect" */
		rotulo: string;
		acoes: Acao[];
		/** A ação deste item está rodando: o botão mostra a espera. */
		ocupado?: boolean;
	} = $props();

	const id = $props.id();
	let aberto = $state(false);
	let botao = $state<HTMLButtonElement>();
	let caixa = $state<HTMLDivElement>();

	function fechar(devolverFoco = false) {
		aberto = false;
		if (devolverFoco) botao?.focus();
	}
	function aoClicarFora(e: MouseEvent) {
		if (aberto && caixa && !(e.target instanceof Node && caixa.contains(e.target))) fechar();
	}
	function aoTeclar(e: KeyboardEvent) {
		if (aberto && e.key === 'Escape') fechar(true);
	}
	function navegar(e: KeyboardEvent) {
		if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
		e.preventDefault();
		const itens = [
			...(e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[role="menuitem"]')
		];
		const i = itens.indexOf(document.activeElement as HTMLElement);
		const j = (i + (e.key === 'ArrowDown' ? 1 : -1) + itens.length) % itens.length;
		itens[j]?.focus();
	}
	function focarPrimeiro(no: HTMLElement) {
		no.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
	}
</script>

<svelte:window onclick={aoClicarFora} onkeydown={aoTeclar} />

<!-- Por cima do link que cobre a linha (`z-2`), e acima das linhas de baixo
     enquanto aberto (`z-30`): a caixa de marcar e o "⋯" da linha seguinte
     também ficam por cima do link dela, e cobririam o menu. -->
<div class="relative {aberto ? 'z-30' : 'z-2'}" bind:this={caixa}>
	<button
		bind:this={botao}
		type="button"
		onclick={() => (aberto = !aberto)}
		disabled={ocupado}
		aria-haspopup="menu"
		aria-expanded={aberto}
		aria-controls="{id}-menu"
		aria-label={rotulo}
		title={rotulo}
		class="grid size-9 place-items-center rounded-field text-base-content/65 transition-colors hover:bg-base-300 hover:text-base-content disabled:cursor-wait"
	>
		{#if ocupado}
			<!-- A espera entra NO LUGAR do ícone (components.md "Espera"). -->
			<Loading variant="fila" size={9} label="Aguarde" />
		{:else}
			<svg class="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true"
				><circle cx="5.5" cy="12" r="1.6" fill="currentColor" /><circle
					cx="12"
					cy="12"
					r="1.6"
					fill="currentColor"
				/><circle cx="18.5" cy="12" r="1.6" fill="currentColor" /></svg
			>
		{/if}
	</button>
	{#if aberto}
		<div
			id="{id}-menu"
			role="menu"
			tabindex="-1"
			aria-label={rotulo}
			use:focarPrimeiro
			onkeydown={navegar}
			class="absolute end-0 top-full z-30 mt-1 grid min-w-[200px] animate-entrada-curta gap-0.5 rounded-[12px] border border-line bg-base-100 p-1.5 shadow-[0_18px_40px_-20px_rgba(15,20,32,0.45)]"
		>
			{#each acoes as acao (acao.rotulo)}
				<button
					type="button"
					role="menuitem"
					onclick={() => {
						fechar();
						acao.onclick();
					}}
					class="flex min-h-10 items-center gap-2.5 rounded-[8px] px-2.5 text-start text-[13.5px] font-semibold
					       {acao.perigo
						? 'text-error hover:bg-error/10 focus-visible:bg-error/10'
						: 'hover:bg-base-200 focus-visible:bg-base-200'}"
				>
					<svg class="size-4 shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
						<path
							d={acao.icone}
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
					{acao.rotulo}
				</button>
			{/each}
		</div>
	{/if}
</div>
