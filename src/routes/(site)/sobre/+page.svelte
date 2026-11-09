<script lang="ts">
	import Metadados from '$lib/components/Metadados.svelte';
	// Sobre: texto corrido, sem números de tração. Os princípios explicam
	// decisões visíveis no produto (paginas.md "Grupo (site)").
	import { resolve } from '$app/paths';
	import SiteHero from '$lib/components/SiteHero.svelte';
	import { aboutParas, principles } from '$lib/content/institucional';
</script>

<Metadados
	titulo="Sobre o Spokke"
	descricao="Você cola o material da aula e ele vira questões de escuta, fala, leitura e escrita, com correção na hora. Toda atividade passa pela sua revisão antes de chegar à turma."
	tituloDaAba="Sobre · Spokke"
/>

<SiteHero
	eyebrow="Sobre"
	title="O material é seu. O trabalho mecânico fica com a gente."
	lede="Preparar exercício leva mais tempo do que aplicar. O Spokke assume essa parte e deixa a aula com você."
/>

<div class="mx-auto w-full max-w-[1100px] px-7 py-8 lg:px-10 lg:py-10">
	<div class="mb-[34px] max-w-[64ch]">
		{#each aboutParas as par (par)}
			<p class="mb-4 text-[14.5px] leading-[1.75] text-pretty text-base-content/65 lg:text-[15px]">
				{par}
			</p>
		{/each}
	</div>

	<p class="mb-3.5 text-[11px] font-bold tracking-[0.09em] text-base-content/65 uppercase">
		Como decidimos
	</p>
	<div class="mb-[34px] grid gap-3 lg:grid-cols-3">
		{#each principles as p (p.t)}
			<div class="min-w-0 cartao-interativo rounded-box border border-line bg-base-200 p-5">
				<span
					class="mb-3.5 grid size-[34px] place-items-center rounded-[10px] bg-base-300 text-primary"
				>
					<svg class="size-[17px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
						<path
							d={p.icon}
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
				</span>
				<h3 class="mb-2 font-display text-[17px] font-semibold">{p.t}</h3>
				<p class="text-[13.5px] leading-relaxed text-pretty text-base-content/65">{p.d}</p>
			</div>
		{/each}
	</div>

	<div
		class="mb-[34px] flex flex-wrap items-center gap-4 rounded-box bg-base-300 p-5 lg:px-[26px] lg:py-6"
	>
		<div class="min-w-[220px] flex-1">
			<h3 class="mb-1.5 font-display text-[19px] font-semibold">
				Vários professores na mesma escola?
			</h3>
			<p class="text-[13.5px] leading-relaxed text-base-content/65">
				O plano Scholar tem limites combinados por professor e uma visão da coordenação que mostra
				só números.
			</p>
		</div>
		<a
			href={resolve('/(site)/contato')}
			class="btn min-h-[46px] motion-tap btn-primary font-bold no-underline"
		>
			Falar com a gente
		</a>
	</div>
</div>
