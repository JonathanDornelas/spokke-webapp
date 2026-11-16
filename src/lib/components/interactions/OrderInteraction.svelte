<script lang="ts">
	import { dndzone, type DndEvent } from 'svelte-dnd-action';
	import type { ClozeFeedback, OrderRuntimeItem } from './types';

	// Ordenar falas. Duas formas equivalentes, e isso não é redundância:
	// arrastar é o gesto natural de reordenar, e as setas são o caminho que
	// funciona no teclado, no leitor de tela e para quem tem dificuldade motora
	// (design-system.md "Acessibilidade" — toda interação funciona pelo
	// teclado). `svelte-dnd-action` tem suporte a teclado nativo, mas as setas
	// continuam porque elas dizem o que fazem; um alvo arrastável não.
	// Correção por sequência.
	let {
		item,
		order = $bindable([]),
		feedback = null
	}: {
		item: OrderRuntimeItem;
		order?: string[];
		/**
		 * O veredito, quando já respondeu. Como no `match`, a correção aparece
		 * AQUI: cada fala diz se está no lugar e, se não está, qual é o lugar
		 * dela. Antes o veredito embaixo repetia as falas DUAS vezes (a ordem
		 * dele e a certa), e seis falas viravam dezoito linhas na tela.
		 */
		feedback?: ClozeFeedback | null;
	} = $props();

	/** As falas na ordem atual — é isso que a zona de arrastar consome. */
	const linhas = $derived(
		order
			.map((id) => item.lines.find((l) => l.id === id))
			.filter((l): l is { id: string; text: string } => !!l)
	);

	const respondida = $derived(feedback !== null);

	/**
	 * A marca de cada fala, na ordem em que o aluno as deixou. As marcas do
	 * servidor vêm nessa mesma ordem; a posição certa de uma fala fora do lugar
	 * sai da resposta certa (`expected`), procurando o texto dela. Fala repetida
	 * fica com a primeira posição livre. Sem marcas (resultado desligado, ou a
	 * questão revisitada), nada se marca.
	 */
	const marcas = $derived.by(() => {
		const recebidas = feedback?.marks;
		if (!recebidas || recebidas.length !== linhas.length) return null;
		const esperado = feedback?.expected ?? [];
		const usada = esperado.map((_, k) => recebidas[k]?.ok === true);
		return linhas.map((linha, i) => {
			if (recebidas[i]?.ok) return { ok: true, lugar: i + 1 };
			const k = esperado.findIndex((texto, j) => !usada[j] && texto === linha.text);
			if (k >= 0) usada[k] = true;
			return { ok: false, lugar: k >= 0 ? k + 1 : null };
		});
	});

	function handleDnd(e: CustomEvent<DndEvent<{ id: string; text: string }>>) {
		order = e.detail.items.map((l) => l.id);
	}

	function move(i: number, delta: number) {
		const next = [...order];
		const j = i + delta;
		if (j < 0 || j >= next.length) return;
		[next[i], next[j]] = [next[j], next[i]];
		order = next;
	}

	const arrow = 'grid h-5 w-[26px] place-items-center rounded-md transition-colors';
</script>

<!-- Uma linha só de instrução: o título da questão já diz "coloque na ordem", e
     o rótulo que repetia isso ocupava a altura de uma fala. -->
<p class="mb-3 text-[12.5px] font-semibold text-base-content/65 baixa:mb-2">
	{respondida ? 'A ordem que você deixou' : 'Arraste as falas ou use as setas'}
</p>

<ul
	use:dndzone={{ items: linhas, flipDurationMs: 220, dragDisabled: respondida }}
	onconsider={handleDnd}
	onfinalize={handleDnd}
	class="grid list-none gap-2 p-0 muito-baixa:gap-1.5"
	aria-label="Falas na ordem"
>
	{#each linhas as line, i (line.id)}
		{@const marca = marcas?.[i]}
		<li
			dir={item.dir}
			class="flex items-center gap-2.5 rounded-box border-[1.5px] border-b-[3px] bg-base-100 px-3
			       transition-[transform,border-color] duration-150
			       {marca && !marca.ok ? 'border-error' : 'border-line'}
			       {respondida
				? 'min-h-10 py-0.5'
				: 'min-h-12 cursor-grab py-1.5 hover:border-primary active:cursor-grabbing'}"
		>
			<!-- A alça é DECORATIVA: quem arrasta é a linha inteira, e o ícone só
			     diz que dá para arrastar. Fosse ela o único alvo, o gesto ficaria
			     num quadrado de 20px no celular. No celular ela sai: ali cada
			     pixel de largura é uma linha de texto a menos. -->
			{#if !respondida}
				<span class="hidden shrink-0 text-base-content/40 sm:block" aria-hidden="true">
					<svg class="size-4" viewBox="0 0 24 24" fill="none">
						<path
							d="M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01"
							stroke="currentColor"
							stroke-width="2.6"
							stroke-linecap="round"
						/>
					</svg>
				</span>
			{/if}
			<span
				class="grid size-6 shrink-0 place-items-center rounded-full bg-base-300 font-mono text-xs text-base-content/65"
			>
				{i + 1}
			</span>
			<span class="flex-1 py-1 font-content text-[15px] leading-snug">{line.text}</span>
			{#if marca}
				<!-- Ícone e texto, nunca só a cor (design-system.md "Estado de
				     correção"): a fala fora do lugar diz qual é o lugar dela. -->
				{#if marca.ok}
					<span class="grid size-7 shrink-0 place-items-center text-success">
						<svg class="size-[18px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<path
								d="M4 12.5l5 5L20 6.5"
								stroke="currentColor"
								stroke-width="2.4"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						</svg>
						<span class="sr-only">No lugar certo.</span>
					</span>
				{:else}
					<span
						class="flex shrink-0 items-center gap-1 text-[12.5px] font-bold whitespace-nowrap text-error"
					>
						<svg class="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<path
								d="M7 7l10 10M17 7L7 17"
								stroke="currentColor"
								stroke-width="2.4"
								stroke-linecap="round"
							/>
						</svg>
						{#if marca.lugar}
							<span aria-hidden="true">é a {marca.lugar}ª</span>
							<span class="sr-only">Fora do lugar: esta fala é a {marca.lugar}ª.</span>
						{:else}
							<span>fora do lugar</span>
						{/if}
					</span>
				{/if}
			{:else if !respondida}
				<span class="grid gap-0.5">
					<button
						type="button"
						onclick={() => move(i, -1)}
						disabled={i === 0}
						class="{arrow} bg-base-200 text-base-content hover:bg-base-300 disabled:opacity-40"
						aria-label="Mover “{line.text}” para cima"
					>
						<svg class="size-3" viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<path
								d="M6 15l6-6 6 6"
								stroke="currentColor"
								stroke-width="2.6"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						</svg>
					</button>
					<button
						type="button"
						onclick={() => move(i, 1)}
						disabled={i === order.length - 1}
						class="{arrow} bg-base-200 text-base-content hover:bg-base-300 disabled:opacity-40"
						aria-label="Mover “{line.text}” para baixo"
					>
						<svg class="size-3" viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<path
								d="M6 9l6 6 6-6"
								stroke="currentColor"
								stroke-width="2.6"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						</svg>
					</button>
				</span>
			{/if}
		</li>
	{/each}
</ul>
