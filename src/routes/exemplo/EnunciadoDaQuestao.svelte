<script lang="ts">
	import AudioPlayer from '$lib/components/AudioPlayer.svelte';
	import type { RespostaDoExemplo } from './resposta.svelte';

	// O topo de uma questão do exemplo: habilidade, enunciado, regra, áudio e o
	// texto de apoio. É o mesmo desenho da `/q/[n]` do Player; `compacto` é o
	// tamanho do celular da home, onde o título de 32px não cabe.
	let { resposta, compacto = false }: { resposta: RespostaDoExemplo; compacto?: boolean } =
		$props();
	const q = $derived(resposta.questao);

	const ICONE: Record<string, string> = {
		listening:
			'M4 12.5V11a8 8 0 1116 0v1.5M2.5 14.5a2 2 0 012-2h2.5v7H4.5a2 2 0 01-2-2zM21.5 14.5a2 2 0 00-2-2H17v7h2.5a2 2 0 002-2z',
		speaking: 'M9 5.5a3 3 0 016 0v6a3 3 0 01-6 0zM5.5 11.5a6.5 6.5 0 0013 0M12 18v3.5',
		reading:
			'M3 5.5h6a3 3 0 013 3v10a2.5 2.5 0 00-2.5-2.5H3zM21 5.5h-6a3 3 0 00-3 3v10a2.5 2.5 0 012.5-2.5H21z',
		writing: 'M4 20h4l11-11a2.83 2.83 0 10-4-4L4 16z'
	};
	const audioOuFala = $derived(q.skill === 'listening' || q.skill === 'speaking');
</script>

<p
	class="mb-3 flex items-center gap-2 text-[11.5px] font-bold tracking-[0.08em] uppercase
	       {audioOuFala ? 'text-accent' : 'text-primary'} {compacto ? '' : 'lg:mb-[15px] lg:text-xs'}"
>
	<svg class="size-[15px] shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
		<path
			d={ICONE[q.skill] ?? ICONE.reading}
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
		/>
	</svg>
	{q.skillLabel}{q.gradingLabel ? ` · ${q.gradingLabel}` : ''}
</p>

<svelte:element
	this={compacto ? 'h3' : 'h1'}
	class="font-semibold tracking-[-0.02em] text-pretty
	       {compacto
		? 'mb-3.5 font-display text-[23px] leading-tight'
		: 'mb-3.5 font-display text-title'}"
>
	{q.prompt}
</svelte:element>

{#if q.hint && !compacto}
	<p class="mb-7 hidden text-[15px] leading-[1.6] text-base-content/65 lg:block">{q.hint}</p>
{/if}

{#if q.audio}
	<div class={compacto ? 'mb-4' : 'mb-[18px] lg:mt-7 lg:mb-0'}>
		<AudioPlayer
			src={q.audio}
			srcSlow={q.audioSlow}
			plays={resposta.plays}
			onplay={() => resposta.plays++}
		/>
	</div>
{/if}

{#if q.passage}
	<!-- Em "montar" e "falar" a frase de apoio é a da língua do ALUNO: é dela que
	     ele parte. -->
	<div class="rounded-box border border-line bg-base-200 {compacto ? 'mb-4 p-3' : 'mb-5 p-4'}">
		<p
			dir={q.interaction === 'assemble' || q.interaction === 'speak' ? q.sourceDir : q.dir}
			class="font-content leading-[1.6] {compacto ? 'text-[15px]' : 'text-[17px]'}"
		>
			{q.passage}
		</p>
	</div>
{/if}
