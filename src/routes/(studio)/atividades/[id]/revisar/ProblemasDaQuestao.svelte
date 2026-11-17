<script lang="ts">
	// O que a CONFERÊNCIA achou de uma questão (kernel.md "Conferência de
	// qualidade"): as regras do kernel. A revisão o mostra sob a linha escolhida, e
	// o editor, sob a resposta certa.
	//
	// O desenho é o do `Alert` (filete de 3px e ícone na cor, texto em
	// `base-content`), em corpo menor: é um aviso ao lado do trabalho, não uma
	// faixa no topo da tela. Vermelho no que corrige errado, âmbar no que vale
	// olhar, e nunca só a cor: cada linha tem ícone e diz o que é.
	import type { Problema } from '$lib/kernel/qualidade';
	import { textoDoProblema } from '$lib/atividades/qualidade';

	let {
		problemas,
		onsugerir,
		sugerindo = false,
		notaDaSugestao = null
	}: {
		problemas: Problema[];
		/**
		 * Só no editor, e só com tradutor: no aviso de "só uma tradução é aceita", pede
		 * ao tradutor as outras traduções certas e as põe em "Também aceitas". Sem
		 * isto, a lista só informa.
		 */
		onsugerir?: () => void;
		sugerindo?: boolean;
		/** O que dizer quando o pedido não trouxe nada. */
		notaDaSugestao?: string | null;
	} = $props();
</script>

<ul class="grid list-none gap-1.5 p-0" aria-label="O que a conferência achou nesta questão">
	{#each problemas as problema, i (`${problema.codigo}:${problema.trecho ?? ''}:${i}`)}
		{@const texto = textoDoProblema(problema)}
		{@const erro = problema.gravidade === 'erro'}
		<li
			class="flex gap-2.5 rounded-field border border-s-[3px] border-line bg-base-200 px-3 py-2.5
			       {erro ? 'border-s-error' : 'border-s-warning'}"
		>
			<span class="mt-px shrink-0 {erro ? 'text-error' : 'text-warning'}">
				<svg class="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
					{#if erro}
						<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" />
						<path
							d="M8.5 8.5l7 7M15.5 8.5l-7 7"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
						/>
					{:else}
						<path
							d="M12 3.5l9.5 16.5H2.5z"
							stroke="currentColor"
							stroke-width="2"
							stroke-linejoin="round"
						/>
						<path
							d="M12 9.5v4.5M12 17h.01"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
						/>
					{/if}
				</svg>
			</span>
			<div class="min-w-0 flex-1 text-[12.5px] leading-snug">
				<p class="font-semibold">
					<span class="sr-only">{erro ? 'Problema:' : 'Para conferir:'}</span>
					{texto.titulo}
				</p>
				{#if texto.detalhe}
					<!-- O trecho citado pode estar em qualquer um dos dois idiomas. -->
					<p class="mt-0.5 font-content text-base-content/65" dir="auto">{texto.detalhe}</p>
				{/if}
				{#if onsugerir && problema.codigo === 'resposta-unica-na-traducao'}
					<button
						type="button"
						onclick={onsugerir}
						disabled={sugerindo}
						class="mt-1.5 inline-flex min-h-8 items-center gap-1.5 text-[12.5px] font-bold text-primary disabled:opacity-60"
					>
						<svg class="size-[14px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<path
								d="M12 5v14M5 12h14"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
							/>
						</svg>
						{sugerindo ? 'Procurando outras traduções' : 'Sugerir outras traduções'}
					</button>
					<p class="mt-1 text-base-content/65" aria-live="polite">{notaDaSugestao ?? ''}</p>
				{/if}
			</div>
		</li>
	{/each}
</ul>
