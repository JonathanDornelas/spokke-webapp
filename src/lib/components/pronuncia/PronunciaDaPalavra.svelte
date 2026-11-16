<script lang="ts">
	// A PRONÚNCIA de uma palavra, na questão de Pronúncia: a boca, a palavra, as
	// sílabas como se leem ("prai · aw · ruh · tee", a tônica em destaque) e o
	// áudio normal e devagar. A boca anda junto do som: cada passo (`passosDaBoca`,
	// do kernel) tem um peso, e a fração do tempo do áudio diz em que passo ele
	// está. Sem áudio ainda (a síntese na fila), ela anda pelo peso, num ritmo
	// fixo, para o professor ver na prévia.
	//
	// Tocar numa sílaba mostra a boca daquela sílaba, parada — é o treino de uma
	// sílaba que saiu diferente. Sem autoplay: tudo começa num toque.
	import type { PassoDaBoca, Visema } from '$lib/kernel/language/pronuncia';
	import BocaDaPronuncia from './BocaDaPronuncia.svelte';
	import { NOME_DA_BOCA } from './formas';

	let {
		palavra,
		silabas,
		passos,
		audio,
		audioSlow,
		dir = 'ltr',
		compacta = false
	}: {
		palavra: string;
		silabas: { leitura: string; tonica: boolean }[];
		passos: PassoDaBoca[];
		audio?: string;
		audioSlow?: string;
		dir?: 'ltr' | 'rtl';
		/** Dentro da moldura de celular do Studio: a boca menor. */
		compacta?: boolean;
	} = $props();

	let visema = $state<Visema>('repouso');
	let silabaAtiva = $state<number | null>(null);
	let tocando = $state<'normal' | 'lento' | null>(null);
	let descricao = $state('');
	let elemento = $state<HTMLAudioElement>();
	let quadro = 0;

	const pesoTotal = $derived(passos.reduce((soma, p) => soma + p.peso, 0));
	/** O passo numa fração (0 a 1) da palavra. */
	function passoEm(fracao: number): PassoDaBoca | undefined {
		let acumulado = 0;
		const alvo = fracao * pesoTotal;
		for (const passo of passos) {
			acumulado += passo.peso;
			if (alvo < acumulado) return passo;
		}
		return passos.at(-1);
	}

	function parar() {
		cancelAnimationFrame(quadro);
		elemento?.pause();
		tocando = null;
		visema = 'repouso';
		silabaAtiva = null;
	}

	function mostrar(fracao: number) {
		const passo = passoEm(fracao);
		if (!passo) return;
		visema = passo.visema;
		silabaAtiva = passo.silaba;
	}

	function tocar(modo: 'normal' | 'lento') {
		parar();
		descricao = '';
		tocando = modo;
		const src = modo === 'lento' ? (audioSlow ?? audio) : audio;
		if (src && elemento) {
			elemento.src = src;
			elemento.currentTime = 0;
			void elemento.play().catch(() => (tocando = null));
			const seguir = () => {
				if (!elemento || tocando !== modo) return;
				if (elemento.duration > 0) mostrar(Math.min(1, elemento.currentTime / elemento.duration));
				if (elemento.ended) return parar();
				quadro = requestAnimationFrame(seguir);
			};
			quadro = requestAnimationFrame(seguir);
			return;
		}
		// Sem o arquivo: a boca anda sozinha, pelo peso dos sons.
		const duracao = pesoTotal * (modo === 'lento' ? 230 : 150);
		const inicio = performance.now();
		const seguir = (agora: number) => {
			if (tocando !== modo) return;
			const fracao = (agora - inicio) / duracao;
			if (fracao >= 1) return parar();
			mostrar(fracao);
			quadro = requestAnimationFrame(seguir);
		};
		quadro = requestAnimationFrame(seguir);
	}

	/** A boca de uma sílaba, parada: a da vogal dela (o som que mais se vê). */
	function verSilaba(i: number) {
		parar();
		const daSilaba = passos.filter((p) => p.silaba === i);
		const vogal = [...daSilaba].sort((a, b) => b.peso - a.peso)[0];
		if (!vogal) return;
		visema = vogal.visema;
		silabaAtiva = i;
		descricao = `Sílaba ${silabas[i]?.leitura}: ${NOME_DA_BOCA[vogal.visema]}.`;
	}

	// Um efeito, e não `onDestroy`: este roda também na renderização do servidor,
	// onde `cancelAnimationFrame` não existe (era um 500 na página).
	$effect(() => () => cancelAnimationFrame(quadro));
</script>

<audio bind:this={elemento} preload="none" onended={parar}></audio>

<!-- Na tela baixa a boca desce de 124 para 96px (o CSS vence o `width` do SVG):
     com o microfone embaixo, era o que passava da altura do celular. -->
<div class="flex items-center gap-4 {compacta ? 'gap-3' : 'lg:gap-5 baixa:[&>svg]:size-24'}">
	<BocaDaPronuncia {visema} tamanho={compacta ? 92 : 124} decorativa />
	<div class="min-w-0 flex-1">
		<p
			{dir}
			class="font-content leading-tight font-semibold {compacta
				? 'text-[24px]'
				: 'text-[30px] baixa:text-[26px]'}"
		>
			{palavra}
		</p>
		<!-- As sílabas, cada uma um botão: tocar mostra a boca dela. A tônica vai
		     em caixa alta e na cor da marca, como nas pronúncias escritas. -->
		<p class="mt-1.5 flex flex-wrap items-center gap-x-1 gap-y-1 font-mono text-[15px]">
			{#each silabas as silaba, i (i)}
				{#if i > 0}<span class="text-base-content/40" aria-hidden="true">·</span>{/if}
				<button
					type="button"
					onclick={() => verSilaba(i)}
					aria-label="Ver a boca na sílaba {silaba.leitura}{silaba.tonica ? ', a tônica' : ''}"
					class="rounded-md px-1.5 py-0.5 transition-colors duration-150
					       {silabaAtiva === i ? 'bg-primary text-primary-content' : 'hover:bg-base-300'}
					       {silaba.tonica && silabaAtiva !== i ? 'font-bold text-primary' : ''}"
				>
					{silaba.tonica ? silaba.leitura.toUpperCase() : silaba.leitura}
				</button>
			{/each}
		</p>
		<div class="mt-3 flex flex-wrap gap-2 baixa:mt-2">
			<button
				type="button"
				onclick={() => (tocando === 'normal' ? parar() : tocar('normal'))}
				class="btn btn-sm motion-tap gap-2 btn-plain"
				aria-pressed={tocando === 'normal'}
			>
				<svg class="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
					{#if tocando === 'normal'}
						<path
							d="M8 6v12M16 6v12"
							stroke="currentColor"
							stroke-width="2.2"
							stroke-linecap="round"
						/>
					{:else}
						<path
							d="M8 5.5l10 6.5-10 6.5z"
							stroke="currentColor"
							stroke-width="2"
							stroke-linejoin="round"
						/>
					{/if}
				</svg>
				Ouvir
			</button>
			<button
				type="button"
				onclick={() => (tocando === 'lento' ? parar() : tocar('lento'))}
				class="btn btn-sm motion-tap gap-2 btn-plain"
				aria-pressed={tocando === 'lento'}
			>
				<svg class="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<path
						d="M12 7v5l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
				Devagar
			</button>
		</div>
		<p class="sr-only" aria-live="polite">{descricao}</p>
	</div>
</div>
