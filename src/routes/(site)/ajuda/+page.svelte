<script lang="ts">
	import Metadados from '$lib/components/Metadados.svelte';
	// Ajuda: perguntas agrupadas pelo momento em que aparecem, uma aberta por vez.
	import SiteHero from '$lib/components/SiteHero.svelte';
	import { faqGrupos } from '$lib/content/institucional';

	let aberta = $state('0-0');
	function alterna(id: string) {
		aberta = aberta === id ? '' : id;
	}
</script>

<Metadados
	titulo="Perguntas frequentes sobre o Spokke"
	descricao="Como montar a primeira atividade, como o aluno recebe o link, para quais idiomas funciona e como funcionam planos, módulos e escolas."
	tituloDaAba="Ajuda · Spokke"
/>

<SiteHero
	eyebrow="Central de ajuda"
	title="Perguntas frequentes"
	lede="Se a sua pergunta não estiver aqui, escreva para suporte@spokke.com.br."
/>

<div class="mx-auto w-full max-w-[1100px] px-7 py-8 lg:px-10 lg:py-10">
	{#each faqGrupos as g, gi (g.t)}
		<div class="mb-[30px]">
			<div class="mb-3.5 flex items-center gap-3">
				<h2 class="shrink-0 font-display text-[19px] font-semibold">{g.t}</h2>
				<span class="h-px flex-1 bg-line"></span>
			</div>

			<div class="grid gap-2">
				{#each g.items as q, qi (q[0])}
					{@const id = `${gi}-${qi}`}
					{@const open = aberta === id}
					<div
						class="rounded-box border px-[18px] py-4 transition-colors
						       {open ? 'border-primary bg-base-200' : 'border-line bg-base-100 hover:border-primary'}"
					>
						<button
							type="button"
							onclick={() => alterna(id)}
							aria-expanded={open}
							class="flex w-full cursor-pointer items-center gap-3.5 border-0 bg-transparent p-0 text-start text-[15px] font-semibold"
						>
							<span class="min-w-0 flex-1 text-pretty">{q[0]}</span>
							<span
								class="grid size-[26px] shrink-0 place-items-center rounded-full bg-base-300 text-primary
								       transition-transform {open ? 'rotate-180' : ''}"
							>
								<svg class="size-3.5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
									<path
										d="M6 9l6 6 6-6"
										stroke="currentColor"
										stroke-width="2.4"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
								</svg>
							</span>
						</button>
						{#if open}
							<p class="mt-3 max-w-[74ch] text-sm leading-[1.7] text-pretty text-base-content/65">
								{q[1]}
							</p>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	{/each}
</div>
