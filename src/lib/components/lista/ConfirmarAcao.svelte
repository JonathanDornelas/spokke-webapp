<script lang="ts">
	// A confirmação de uma ação da lista — arquivar ou apagar, um item ou vários.
	// Um `<dialog>` de verdade (foco preso, Esc e véu vêm do elemento), no molde
	// do `PlanosModal`: a saída anima com ele aberto e o `close()` vem no fim.
	//
	// A consequência vai ESCRITA antes do botão (o corpo, `children`), e o que não
	// tem volta pede uma palavra digitada (`digitar`), conferida de novo no
	// servidor. A recusa do servidor aparece aqui dentro, com ícone e texto.
	import type { Snippet } from 'svelte';
	import Loading from '$lib/components/Loading.svelte';
	import { DURACAO } from '$lib/movimento';

	let {
		aberto = $bindable(false),
		titulo,
		rotuloDoBotao,
		perigo = false,
		digitar,
		ocupado = false,
		erro = null,
		onconfirmar,
		children
	}: {
		aberto?: boolean;
		titulo: string;
		rotuloDoBotao: string;
		/** A ação apaga: o botão é vermelho. */
		perigo?: boolean;
		/** A palavra que o professor digita para liberar o botão. */
		digitar?: string;
		ocupado?: boolean;
		erro?: string | null;
		onconfirmar: () => void;
		/** A consequência, em texto (e a lista do que muda). */
		children: Snippet;
	} = $props();

	const id = $props.id();
	let dialogo = $state<HTMLDialogElement>();
	let fechando = $state(false);
	let digitado = $state('');

	$effect(() => {
		if (!dialogo) return;
		if (aberto && !dialogo.open) {
			fechando = false;
			digitado = '';
			dialogo.showModal();
		} else if (!aberto && dialogo.open && !fechando) {
			fechando = true;
			const el = dialogo;
			const terminar = () => {
				if (!fechando) return;
				fechando = false;
				if (!aberto && el.open) el.close();
			};
			el.addEventListener('animationend', terminar, { once: true });
			setTimeout(terminar, DURACAO.curta + 60);
		}
	});

	const liberado = $derived(
		!digitar || digitado.trim().toLocaleLowerCase('pt-BR') === digitar.toLocaleLowerCase('pt-BR')
	);

	function cancelar() {
		if (!ocupado) aberto = false;
	}
</script>

<dialog
	bind:this={dialogo}
	onclose={() => (aberto = false)}
	oncancel={(e) => {
		e.preventDefault();
		cancelar();
	}}
	onclick={(e) => {
		if (e.target === dialogo) cancelar();
	}}
	aria-labelledby="{id}-titulo"
	class="m-auto w-[calc(100vw-2rem)] max-w-[460px] rounded-box border border-line bg-base-100 p-6 text-base-content shadow-[0_30px_60px_-30px_rgba(15,20,32,0.5)] backdrop:bg-overlay backdrop:backdrop-blur-[3px]
	       {fechando
		? 'animate-modal-saida backdrop:animate-veu-saida'
		: 'backdrop:animate-veu open:animate-entrada-curta'}"
>
	<p id="{id}-titulo" class="mb-2 font-display text-[20px] font-semibold tracking-[-0.02em]">
		{titulo}
	</p>
	<div class="mb-5 text-[13.5px] leading-relaxed text-pretty text-base-content/70">
		{@render children()}
	</div>

	{#if digitar}
		<label class="mb-5 block">
			<span class="mb-1.5 block text-[12.5px] font-semibold">
				Para confirmar, digite <span class="font-mono">{digitar}</span>
			</span>
			<input bind:value={digitado} class="input w-full" autocomplete="off" spellcheck="false" />
		</label>
	{/if}

	{#if erro}
		<p
			class="mb-4 flex items-start gap-2 text-[13px] leading-snug font-semibold text-error"
			role="alert"
		>
			<svg class="mt-px size-[15px] shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
				<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" />
				<path
					d="M12 7.5v6M12 16.5h.01"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
				/>
			</svg>
			{erro}
		</p>
	{/if}

	<div class="flex flex-wrap gap-2.5">
		<button
			type="button"
			onclick={cancelar}
			disabled={ocupado}
			class="btn min-h-[46px] min-w-[8rem] flex-1 motion-tap btn-plain font-semibold"
		>
			Cancelar
		</button>
		<button
			type="button"
			onclick={onconfirmar}
			disabled={ocupado || !liberado}
			class="btn min-h-[46px] min-w-[8rem] flex-1 motion-tap gap-2 font-bold {perigo
				? 'btn-error'
				: 'btn-primary'}"
		>
			{#if ocupado}
				<Loading variant="fila" size={11} tone="current" label="Aguarde" />
			{/if}
			{rotuloDoBotao}
		</button>
	</div>
</dialog>
