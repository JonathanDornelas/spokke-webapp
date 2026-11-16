<script lang="ts">
	// A boca de FRENTE num visema (`formas.ts`): o rosto da metade de baixo, o
	// nariz, os lábios e, com a boca aberta, os dentes e a língua. Desenhado por
	// dado, não por imagem: pesa nada no Player. As cores são da ILUSTRAÇÃO
	// (`--color-boca-*` no app.css), iguais nos dois temas, como a pele do avatar.
	import type { Visema } from '$lib/kernel/language/pronuncia';
	import { CX, FORMAS, NOME_DA_BOCA, desenharBoca } from './formas';

	let {
		visema = 'repouso',
		tamanho = 120,
		decorativa = false
	}: {
		visema?: Visema;
		tamanho?: number;
		/** Animando, o nome muda a cada som: aí o desenho sai da árvore de acessibilidade. */
		decorativa?: boolean;
	} = $props();

	const id = $props.id();
	const forma = $derived(FORMAS[visema]);
	const d = $derived(desenharBoca(forma));
</script>

<svg
	viewBox="0 0 120 120"
	width={tamanho}
	height={tamanho}
	class="block shrink-0 overflow-hidden rounded-[18px]"
	role={decorativa ? undefined : 'img'}
	aria-hidden={decorativa ? true : undefined}
	aria-label={decorativa ? undefined : NOME_DA_BOCA[visema]}
>
	<rect width="120" height="120" class="fill-boca-quadro" />
	<!-- O rosto, da altura do nariz até o queixo. -->
	<path
		d="M0 0H120V66C106 88 86 108 60 110C34 108 14 88 0 66Z"
		class="fill-boca-rosto stroke-boca-traco"
		stroke-width="1.6"
	/>
	<path
		d="M45 12C50 19 55 21 60 21S70 19 75 12"
		fill="none"
		class="stroke-boca-traco"
		stroke-width="1.6"
		stroke-linecap="round"
	/>
	<path
		d="M51 97Q60 102 69 97"
		fill="none"
		class="stroke-boca-traco"
		stroke-opacity="0.45"
		stroke-width="1.6"
		stroke-linecap="round"
	/>

	{#if d.abertura}
		<clipPath id="{id}-boca"><path d={d.abertura} /></clipPath>
		<path d={d.abertura} class="fill-boca" />
		<g clip-path="url(#{id}-boca)">
			<!-- A língua de t, d, n e l vem ANTES dos dentes: eles cobrem a ponta dela. -->
			{#if d.lingua?.recortada && d.lingua.atras}
				<ellipse
					cx={d.lingua.cx}
					cy={d.lingua.cy}
					rx={d.lingua.rx}
					ry={d.lingua.ry}
					class="fill-lingua"
				/>
			{/if}
			{#if d.dentesCima}
				<rect
					x={CX - 40}
					y={d.dentesCima.y}
					width="80"
					height={d.dentesCima.altura}
					class="fill-dente"
				/>
			{/if}
			{#if d.dentesBaixo}
				<rect
					x={CX - 40}
					y={d.dentesBaixo.y}
					width="80"
					height={d.dentesBaixo.altura}
					class="fill-dente"
				/>
			{/if}
			{#if d.lingua?.recortada && !d.lingua.atras}
				<ellipse
					cx={d.lingua.cx}
					cy={d.lingua.cy}
					rx={d.lingua.rx}
					ry={d.lingua.ry}
					class="fill-lingua"
				/>
			{/if}
			<!-- f e v: o lábio de baixo sobe e encosta nos dentes de cima. No azul do
			     quadro, não na cor do rosto: ao lado do branco dos dentes, os dois
			     viravam uma faixa clara só. -->
			{#if d.labioNoDente}
				<path d={d.labioNoDente} class="fill-boca-quadro stroke-boca-traco" stroke-width="1.6" />
			{/if}
		</g>
		{#if d.lingua && !d.lingua.recortada}
			<ellipse
				cx={d.lingua.cx}
				cy={d.lingua.cy}
				rx={d.lingua.rx}
				ry={d.lingua.ry}
				class="fill-lingua"
			/>
		{/if}
		<path d={d.abertura} fill="none" class="stroke-boca" stroke-width="2" stroke-linejoin="round" />
	{:else if d.linhaDosLabios}
		<path
			d={d.linhaDosLabios}
			fill="none"
			class="stroke-boca"
			stroke-width={forma.apertada ? 2.8 : 2.1}
			stroke-linecap="round"
		/>
	{/if}

	<path
		d={d.labioCima}
		fill="none"
		class="stroke-boca-traco"
		stroke-width="1.6"
		stroke-linecap="round"
		stroke-linejoin="round"
	/>
	<path
		d={d.labioBaixo}
		fill="none"
		class="stroke-boca-traco"
		stroke-width="1.6"
		stroke-linecap="round"
	/>
</svg>
