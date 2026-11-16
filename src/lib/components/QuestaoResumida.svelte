<script lang="ts">
	// A QUESTÃO RESUMIDA — o cartão do Claude Design que mostra uma questão do
	// jeito que o aluno a vê, em miniatura: o rótulo da habilidade, o miolo e uma
	// legenda do que ele faz. Serve o bloco "O que sai daqui" da etapa 1
	// (`tamanho="normal"`, inclinado como no desenho) e a prévia de cada material
	// na etapa 2 (`tamanho="pequena"`, numa faixa que rola de lado).
	//
	// O miolo é DADO (`$lib/atividades/questao-resumida.ts`): cada forma de questão
	// tem o seu desenho, todos no mesmo vocabulário — o círculo de tocar e a onda
	// na cor do áudio, a alternativa escolhida com a borda da marca, a lacuna
	// sublinhada. A onda sobe e desce e o cursor pisca, como no desenho — sem
	// função nenhuma: é ilustração (a exceção a "repetição infinita só em gravação
	// e carregamento", pedida pelo dono do repositório; design-system.md
	// "Movimento"). Com `prefers-reduced-motion` tudo para, pela regra do app.css.
	import type { QuestaoResumida } from '$lib/atividades/questao-resumida';
	import { ROTULO_DA_HABILIDADE } from '$lib/atividades/questao-resumida';
	import BocaDaPronuncia from './pronuncia/BocaDaPronuncia.svelte';

	let {
		questao: q,
		dir = 'ltr',
		lang,
		tamanho = 'normal',
		inclinacao = 0
	}: {
		questao: QuestaoResumida;
		/** A direção do CONTEÚDO (o idioma alvo); a interface segue a dela. */
		dir?: 'ltr' | 'rtl';
		lang?: string;
		tamanho?: 'normal' | 'pequena';
		/** Graus — o bloco da etapa 1 entorta cada cartão um pouco. */
		inclinacao?: number;
	} = $props();

	const pequena = $derived(tamanho === 'pequena');
	/** As barras da onda: altura, duração e atraso de cada uma — as do desenho. */
	const ONDA = [
		[40, 420, 0],
		[78, 380, 90],
		[55, 460, 40],
		[100, 340, 150],
		[45, 500, 60],
		[70, 400, 200],
		[32, 360, 110],
		[62, 480, 30]
	] as const;

	const ICONE: Record<QuestaoResumida['habilidade'], string> = {
		escuta:
			'M4 12.5V11a8 8 0 1116 0v1.5M2.5 12.5h4.5v7H4.5a2 2 0 01-2-2zM21.5 12.5H17v7h2.5a2 2 0 002-2z',
		fala: 'M12 2.5a3 3 0 00-3 3v5a3 3 0 006 0v-5a3 3 0 00-3-3zM5.5 11.5a6.5 6.5 0 0013 0M12 18v3.5',
		leitura:
			'M3 5.5h6a3 3 0 013 3v10a2.5 2.5 0 00-2.5-2.5H3zM21 5.5h-6a3 3 0 00-3 3v10a2.5 2.5 0 012.5-2.5H21z',
		escrita: 'M4 20h4l11-11a2.83 2.83 0 10-4-4L4 16z'
	};

	/** Para o leitor de tela: o cartão é uma figura, e isto é o que ela mostra. */
	const descricao = $derived(
		`Questão de ${ROTULO_DA_HABILIDADE[q.habilidade].toLocaleLowerCase('pt-BR')}: ${q.legenda.toLocaleLowerCase('pt-BR')}${q.entra ? '' : '. Tipo desligado neste material'}`
	);

	const escolhida = 'border-[1.5px] border-primary bg-base-300 font-semibold text-primary';
	const opcao = 'border border-line bg-base-100 text-base-content';
</script>

{#snippet audio()}
	<div class="flex items-center {pequena ? 'gap-[9px]' : 'gap-2.5'}">
		<span
			class="grid shrink-0 place-items-center rounded-full bg-accent text-accent-content {pequena
				? 'size-[30px]'
				: 'size-[34px]'}"
		>
			<svg
				class={pequena ? 'size-3' : 'size-3.5'}
				viewBox="0 0 24 24"
				fill="currentColor"
				aria-hidden="true"><path d="M8 5.5l10 6.5-10 6.5z" /></svg
			>
		</span>
		<span class="flex min-w-0 flex-1 items-end gap-[3px] {pequena ? 'h-[22px]' : 'h-[26px]'}">
			{#each ONDA as [altura, duracao, atraso], i (i)}
				<span
					class="flex-1 origin-bottom rounded-[2px] bg-accent opacity-60"
					style="height: {altura}%; animation: en-wave {duracao}ms ease-in-out {atraso}ms infinite alternate"
				></span>
			{/each}
		</span>
	</div>
{/snippet}

{#snippet chip(texto: string, certa: boolean)}
	<span
		class="block truncate rounded-lg px-[9px] py-[5px] font-content text-[11.5px] {certa
			? escolhida
			: opcao}">{texto}</span
	>
{/snippet}

{#snippet cursor()}
	<span
		class="ms-0.5 inline-block h-3.5 w-[1.5px] caret-blink bg-primary align-[-2px]"
		aria-hidden="true"
	></span>
{/snippet}

<div
	role="img"
	aria-label={descricao}
	class="flex h-full min-w-0 flex-col border border-line bg-base-100 transition-[opacity,filter] duration-200
	       {pequena
		? 'gap-[9px] rounded-[13px] p-3'
		: 'gap-2.5 rounded-2xl p-3.5 shadow-[0_16px_28px_-24px_rgba(26,23,48,0.5)]'}
	       {q.entra ? '' : 'opacity-40 grayscale'}"
	style={inclinacao ? `transform: rotate(${inclinacao}deg)` : undefined}
>
	<p
		class="flex items-center gap-[7px] text-[11px] font-bold tracking-[0.08em] text-primary uppercase"
	>
		<svg
			class="shrink-0 {pequena ? 'size-3.5' : 'size-[15px]'}"
			viewBox="0 0 24 24"
			fill="none"
			aria-hidden="true"
		>
			<path
				d={ICONE[q.habilidade]}
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		</svg>
		{ROTULO_DA_HABILIDADE[q.habilidade]}
	</p>

	<!-- `min-h-0` + `overflow-hidden`: num cartão de altura fixa (a etapa 1) o miolo
	     corta em vez de empurrar a legenda para fora. -->
	<div
		class="flex min-h-0 min-w-0 flex-col gap-2.5 overflow-hidden"
		{dir}
		{lang}
		data-content-lang={lang}
	>
		{#if q.corpo.forma === 'ouvir-escolher'}
			{@render audio()}
			<div class="grid gap-[5px]">
				{@render chip(q.corpo.certa, true)}
				{#if q.corpo.outra}{@render chip(q.corpo.outra, false)}{/if}
			</div>
		{:else if q.corpo.forma === 'ouvir-montar'}
			{@render audio()}
			<div class="flex flex-wrap gap-1">
				{#each q.corpo.pecas.slice(0, 6) as peca, i (i)}
					<span
						class="rounded-md border border-line bg-base-100 px-1.5 py-0.5 font-content text-[11.5px]"
						>{peca}</span
					>
				{/each}
			</div>
		{:else if q.corpo.forma === 'ouvir-digitar'}
			{@render audio()}
			<span
				class="block truncate rounded-lg border-[1.5px] border-primary bg-base-100 px-[9px] py-[5px] font-content text-[11.5px]"
				>{q.corpo.resposta}{@render cursor()}</span
			>
		{:else if q.corpo.forma === 'falar'}
			<p class="line-clamp-3 font-content text-[13px] leading-[1.45]">{q.corpo.frase}</p>
			<div class="flex items-center gap-[11px]">
				<span
					class="grid shrink-0 place-items-center rounded-full bg-primary text-primary-content ring-4 ring-base-300 {pequena
						? 'size-[30px]'
						: 'size-[34px]'}"
				>
					<svg class="size-[15px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
						<rect
							x="9"
							y="2.5"
							width="6"
							height="11"
							rx="3"
							stroke="currentColor"
							stroke-width="2"
						/>
						<path
							d="M5.5 11.5a6.5 6.5 0 0013 0M12 18v3.5"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
						/>
					</svg>
				</span>
				<span class="font-mono text-[11.5px] text-base-content/65" dir="ltr">0:03</span>
			</div>
		{:else if q.corpo.forma === 'ler-escolher'}
			{#if q.corpo.texto}
				<p class="line-clamp-3 font-content text-[12px] leading-normal">{q.corpo.texto}</p>
			{/if}
			<div class="flex flex-wrap items-center gap-[5px]">
				{#if q.corpo.pergunta}
					<span class="basis-full font-sans text-[11.5px] font-semibold" dir="auto"
						>{q.corpo.pergunta}</span
					>
				{/if}
				<span
					class="max-w-full truncate rounded-lg px-[9px] py-1 text-[11.5px] {escolhida}"
					dir="auto">{q.corpo.certa}</span
				>
				{#if q.corpo.outra}
					<span
						class="max-w-full truncate rounded-lg px-[9px] py-1 text-[11.5px] {opcao}"
						dir="auto">{q.corpo.outra}</span
					>
				{/if}
			</div>
		{:else if q.corpo.forma === 'lacuna'}
			<p class="line-clamp-3 font-content text-[13px] leading-[1.7]">
				<!-- Sem espaço no markup: quem traz o espaço é o dado. Japonês e chinês
				     não separam palavras por espaço, e um espaço aqui mentiria a frase. -->
				{q.corpo.antes}<span
					class="inline-block border-b-2 border-primary px-0.5 leading-[1.3] font-semibold text-primary"
					>{q.corpo.resposta}{@render cursor()}</span
				>{q.corpo.depois}
			</p>
			{#if q.corpo.apoio}
				<p
					class="line-clamp-2 font-sans text-[11.5px] leading-[1.45] text-base-content/65"
					dir="auto"
				>
					{q.corpo.apoio}
				</p>
			{/if}
		{:else if q.corpo.forma === 'montar'}
			<p class="line-clamp-2 font-sans text-[12px] leading-normal" dir="auto">{q.corpo.apoio}</p>
			<div class="flex flex-wrap gap-1">
				{#each q.corpo.pecas.slice(0, 6) as peca, i (i)}
					<span
						class="rounded-md px-1.5 py-0.5 font-content text-[11.5px] {i < 2 ? escolhida : opcao}"
						>{peca}</span
					>
				{/each}
			</div>
		{:else if q.corpo.forma === 'digitar'}
			<p class="line-clamp-2 font-content text-[13px] leading-[1.45]">{q.corpo.texto}</p>
			<span
				class="block truncate rounded-lg border-[1.5px] border-primary bg-base-100 px-[9px] py-[5px] text-[11.5px]"
				dir="auto">{q.corpo.resposta}{@render cursor()}</span
			>
		{:else if q.corpo.forma === 'ordenar'}
			<ol class="grid list-none gap-1 p-0">
				{#each q.corpo.falas.slice(0, 3) as fala, i (i)}
					<li
						class="flex min-w-0 items-center gap-1.5 rounded-lg px-2 py-1 text-[11.5px] {i === 0
							? escolhida
							: opcao}"
					>
						<span class="shrink-0 font-mono text-[10.5px] opacity-70" dir="ltr">{i + 1}</span>
						<span class="min-w-0 truncate font-content">{fala}</span>
					</li>
				{/each}
			</ol>
		{:else if q.corpo.forma === 'associar'}
			<div class="grid grid-cols-2 gap-1">
				{#each q.corpo.pares.slice(0, 3) as par, i (i)}
					<span
						class="truncate rounded-lg px-2 py-1 font-content text-[11.5px] {i === 0
							? escolhida
							: opcao}">{par.esquerda}</span
					>
					<span
						class="truncate rounded-lg px-2 py-1 font-sans text-[11.5px] {i === 0
							? escolhida
							: opcao}"
						dir="auto">{par.direita}</span
					>
				{/each}
			</div>
		{:else if q.corpo.forma === 'tocar'}
			<p class="font-content text-[13px] leading-[1.7]">
				{q.corpo.antes}<span class="rounded-md px-1 py-0.5 {escolhida}">{q.corpo.palavra}</span>{q
					.corpo.depois}
			</p>
		{:else if q.corpo.forma === 'conversa'}
			<!-- O diálogo: as últimas falas em balões, um lado por pessoa; na próxima
			     fala, o balão tracejado de quem tem a vez, com a resposta (tela do
			     professor); na compreensão, a pergunta e a resposta certa. -->
			{#if q.corpo.ouve}{@render audio()}{/if}
			<div class="grid gap-1">
				{#each q.corpo.falas as fala, i (i)}
					<span
						class="max-w-[88%] truncate rounded-[10px] border border-line px-2 py-1 font-content text-[11.5px]
						       {fala.lado === 'fim' ? 'justify-self-end bg-base-300' : 'justify-self-start bg-base-200'}"
						>{fala.texto}</span
					>
				{/each}
				{#if q.corpo.vez}
					<span
						class="max-w-[88%] truncate rounded-[10px] border-[1.5px] border-dashed border-primary px-2 py-1 font-content text-[11.5px] font-semibold text-primary
						       {q.corpo.vez.lado === 'fim' ? 'justify-self-end' : 'justify-self-start'}"
						>{q.corpo.vez.resposta}</span
					>
				{/if}
			</div>
			{#if q.corpo.pergunta}
				<div class="flex flex-wrap items-center gap-[5px]">
					<span class="basis-full font-sans text-[11.5px] font-semibold" dir="auto"
						>{q.corpo.pergunta}</span
					>
					{#if q.corpo.certa}
						<span
							class="max-w-full truncate rounded-lg px-[9px] py-1 text-[11.5px] {escolhida}"
							dir="auto">{q.corpo.certa}</span
						>
					{/if}
				</div>
			{/if}
		{:else if q.corpo.forma === 'pronuncia'}
			<div class="flex items-center gap-2.5">
				<BocaDaPronuncia visema="a" tamanho={pequena ? 52 : 60} decorativa />
				<div class="min-w-0">
					<p class="truncate font-content text-[15px] font-semibold">{q.corpo.palavra}</p>
					<p class="font-mono text-[11px] text-base-content/65" dir="ltr">
						{#each q.corpo.silabas as silaba, i (i)}{i > 0 ? ' · ' : ''}<span
								class={silaba.tonica ? 'font-bold text-primary' : ''}
								>{silaba.tonica ? silaba.leitura.toUpperCase() : silaba.leitura}</span
							>{/each}
					</p>
				</div>
			</div>
		{/if}
	</div>

	<p class="mt-auto text-[11.5px] leading-[1.4] text-base-content/65">{q.legenda}</p>
</div>
