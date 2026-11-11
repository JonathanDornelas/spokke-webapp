<script lang="ts">
	import { dndzone, type DndEvent } from 'svelte-dnd-action';
	import type { AssembleRuntimeItem, RuntimeToken } from './types';

	// Montar frase. Arrastar (svelte-dnd-action, suporte a teclado nativo) com o
	// clique como caminho equivalente — design-system.md exige as duas formas.
	// A ordem inicial vem da seed da tentativa; não reembaralha a cada render.
	let {
		item,
		chosen = $bindable([]),
		dicaDeTeclado = true,
		corrigida = false
	}: {
		item: AssembleRuntimeItem;
		chosen?: string[];
		/** A linha "Tab seleciona, setas movem…". O celular da home a tira: ali não cabe. */
		dicaDeTeclado?: boolean;
		/**
		 * A resposta já foi corrigida: as peças que sobraram não servem mais para
		 * nada e saem, junto com a dica. Só o celular da home usa — ali a frase
		 * montada e o veredito precisam caber na tela do aparelho.
		 */
		corrigida?: boolean;
	} = $props();

	const pool = $derived(item.tokens.filter((t) => !chosen.includes(t.id)));
	const chosenTokens = $derived(
		chosen.map((id) => item.tokens.find((t) => t.id === id)).filter((t): t is RuntimeToken => !!t)
	);

	function handleDnd(e: CustomEvent<DndEvent<RuntimeToken>>) {
		chosen = e.detail.items.map((t) => t.id);
	}
	function removeToken(id: string) {
		chosen = chosen.filter((c) => c !== id);
	}
	function addToken(id: string) {
		// Duplo clique rápido chega aqui duas vezes antes do re-render tirar o
		// token do banco — e o mesmo id duas vezes rebenta o {#each} com chave.
		if (chosen.includes(id)) return;
		chosen = [...chosen, id];
	}

	const tokenClass =
		'rounded-field border border-line border-b-[3px] bg-base-100 px-3.5 py-2.5 font-content text-[17px] ' +
		'transition-[transform,border-color,box-shadow,translate,scale] duration-150 hover:-translate-y-[3px] hover:border-primary ' +
		'hover:shadow-[0_10px_18px_-12px_color-mix(in_oklab,var(--color-primary)_70%,transparent)] ' +
		'active:translate-y-0.5 active:border-b';
</script>

{#if item.translation}
	<p class="mb-4 text-[13.5px] leading-snug text-base-content/65">{item.translation}</p>
{/if}

<p class="mb-3.5 text-[12.5px] font-semibold text-base-content/65">Monte na ordem certa</p>

<ul
	use:dndzone={{ items: chosenTokens, flipDurationMs: 220 }}
	onconsider={handleDnd}
	onfinalize={handleDnd}
	dir={item.dir}
	class="mb-[18px] flex min-h-[108px] list-none flex-wrap content-start gap-2 rounded-box
	       border-[1.5px] border-dashed border-line bg-base-200 p-3"
	aria-label="Frase montada"
>
	{#each chosenTokens as t (t.id)}
		<li>
			<button type="button" onclick={() => removeToken(t.id)} class={tokenClass}>{t.text}</button>
		</li>
	{/each}
</ul>

{#if !corrigida}
	<p class="mb-2.5 text-[12.5px] font-semibold text-base-content/65">Palavras disponíveis</p>

	<div dir={item.dir} class="flex flex-wrap gap-2">
		{#each pool as t (t.id)}
			<button type="button" onclick={() => addToken(t.id)} class={tokenClass}>{t.text}</button>
		{/each}
	</div>
{/if}

{#if dicaDeTeclado && !corrigida}
	<p
		class="mt-[18px] flex items-center gap-2.5 rounded-field border border-line bg-base-200 px-3.5 py-3
	       text-[12.5px] leading-snug text-base-content/65"
	>
		<svg class="size-[17px] shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
			<rect x="2.5" y="5.5" width="19" height="13" rx="3" stroke="currentColor" stroke-width="2" />
			<path
				d="M8 14.5h8M7 10h.01M11 10h.01M15 10h.01"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
			/>
		</svg>
		Tab seleciona, setas movem, Enter confirma. Tocar também insere.
	</p>
{/if}
