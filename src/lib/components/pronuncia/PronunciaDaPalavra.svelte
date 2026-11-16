<script lang="ts">
	// A PRONÚNCIA de uma palavra, na questão de Pronúncia: a boca, a palavra, as
	// sílabas como se leem ("prai · aw · ruh · tee", a tônica em destaque) e o
	// áudio normal e devagar.
	//
	// **A boca anda no TEMPO DE CADA SOM.** A linha do tempo do áudio (`linha`,
	// do serviço de áudio, que sabe quanto o modelo falou cada fonema) diz onde
	// cada fonema começa e termina, e a boca mostra o que está soando. Sem ela (o
	// áudio de antes dela, ou na fila), a boca anda pelo peso de cada som.
	//
	// **Tocar numa sílaba toca exatamente ela**: do começo do primeiro fonema dela
	// ao fim do último, pelo Web Audio, com início e fim na amostra certa e uma
	// rampa curta nas pontas (`audio-da-pronuncia.ts`). Do arquivo devagar quando
	// ele tem a linha, senão do normal. Sem linha, a sílaba mostra a boca dela,
	// parada. Sem autoplay: tudo começa num toque.
	import type { PassoDaBoca, Visema } from '$lib/kernel/language/pronuncia';
	import type { LinhaDaPalavra } from '$lib/kernel/language/sintese';
	import {
		AudioDaPronuncia,
		RESPIRO_DA_PRIMEIRA,
		passoNoTempo,
		trechoDaSilaba
	} from '$lib/client/audio-da-pronuncia';
	import BocaDaPronuncia from './BocaDaPronuncia.svelte';
	import { NOME_DA_BOCA } from './formas';

	let {
		palavra,
		silabas,
		passos,
		audio,
		audioSlow,
		linha,
		linhaLenta,
		dir = 'ltr',
		compacta = false
	}: {
		palavra: string;
		silabas: { leitura: string; tonica: boolean }[];
		passos: PassoDaBoca[];
		audio?: string;
		audioSlow?: string;
		/** Onde cada fonema está no arquivo normal e no devagar (`LinhaDaPalavra`). */
		linha?: LinhaDaPalavra;
		linhaLenta?: LinhaDaPalavra;
		dir?: 'ltr' | 'rtl';
		/** Dentro da moldura de celular do Studio: a boca menor. */
		compacta?: boolean;
	} = $props();

	interface Fonte {
		src: string;
		linha: LinhaDaPalavra | undefined;
	}

	const totalDeFonemas = $derived(passos.reduce((n, p) => Math.max(n, p.fonema + 1), 0));
	/** Linha que não tem um trecho por fonema não é desta palavra: fica de fora. */
	const valida = (l: LinhaDaPalavra | undefined) =>
		l && l.fones.length === totalDeFonemas ? l : undefined;
	const normal = $derived<Fonte | null>(audio ? { src: audio, linha: valida(linha) } : null);
	const lenta = $derived<Fonte | null>(
		audioSlow ? { src: audioSlow, linha: valida(linhaLenta) } : null
	);
	/**
	 * De onde tocar uma sílaba: do arquivo DEVAGAR quando ele tem a linha — a
	 * sílaba átona dura uns 100 ms no normal, e devagar ela se ouve —, senão do
	 * normal. Nenhum dos dois: a sílaba só mostra a boca.
	 */
	const fonteDasSilabas = $derived(lenta?.linha ? lenta : normal?.linha ? normal : null);

	let visema = $state<Visema>('repouso');
	let silabaAtiva = $state<number | null>(null);
	let tocando = $state<'normal' | 'lento' | 'silaba' | null>(null);
	let descricao = $state('');
	let elemento = $state<HTMLAudioElement>();
	let quadro = 0;
	/** Conta os toques: o que um toque antigo agendou não mexe no de agora. */
	let vez = 0;

	const motor = new AudioDaPronuncia();

	// Os dois arquivos já baixam ao abrir a questão (uma palavra são poucos kB):
	// o primeiro toque sai na hora, sem esperar a rede.
	$effect(() => {
		if (!motor.disponivel) return;
		if (normal) void motor.carregar(normal.src, normal.linha?.fala ?? null);
		if (lenta) void motor.carregar(lenta.src, lenta.linha?.fala ?? null);
	});
	// Um efeito, e não `onDestroy`: este roda também na renderização do servidor,
	// onde `cancelAnimationFrame` não existe (era um 500 na página).
	$effect(() => () => {
		cancelAnimationFrame(quadro);
		motor.fechar();
	});

	const pesoTotal = $derived(passos.reduce((soma, p) => soma + p.peso, 0));
	/** O passo numa fração (0 a 1) da palavra, pelo peso: quando não há linha. */
	function passoPeloPeso(fracao: number): PassoDaBoca | undefined {
		let acumulado = 0;
		const alvo = fracao * pesoTotal;
		for (const passo of passos) {
			acumulado += passo.peso;
			if (alvo < acumulado) return passo;
		}
		return passos.at(-1);
	}

	function mostrar(passo: PassoDaBoca | null | undefined, acenderSilaba = true) {
		visema = passo?.visema ?? 'repouso';
		if (acenderSilaba) silabaAtiva = passo?.silaba ?? null;
	}

	function parar() {
		vez += 1;
		cancelAnimationFrame(quadro);
		motor.parar();
		elemento?.pause();
		tocando = null;
		visema = 'repouso';
		silabaAtiva = null;
	}

	/** A boca seguindo o que se ouve, a cada quadro, enquanto o toque `minha` vale. */
	function seguir(minha: number, posicao: () => number | null, aoAndar: (t: number) => void) {
		const passo = () => {
			if (vez !== minha) return;
			const t = posicao();
			if (t !== null) aoAndar(t);
			quadro = requestAnimationFrame(passo);
		};
		quadro = requestAnimationFrame(passo);
	}

	/** A palavra inteira: no tempo de cada som, ou pelo peso sem a linha. */
	async function tocar(modo: 'normal' | 'lento') {
		parar();
		const minha = vez;
		descricao = '';
		tocando = modo;
		const fonte = modo === 'lento' ? (lenta ?? normal) : normal;
		if (!fonte) return andarPeloPeso(modo, minha);

		const naLinha = (t: number, duracao: number | null) => {
			if (fonte.linha) mostrar(passoNoTempo(passos, fonte.linha.fones, t));
			else if (duracao) mostrar(passoPeloPeso(Math.min(1, t / duracao)));
		};
		if (motor.disponivel) {
			motor.destravar();
			const ok = await motor.tocar(fonte.src, fonte.linha?.fala ?? null, 0, null, () => {
				if (vez === minha) parar();
			});
			if (vez !== minha) return;
			if (ok) {
				const duracao = await motor.duracao(fonte.src);
				return seguir(
					minha,
					() => motor.posicao(),
					(t) => naLinha(t, duracao)
				);
			}
		}
		// Reserva: o `<audio>` (sem CORS no bucket, o iPhone sem a Audio Session).
		const el = elemento;
		if (!el) return;
		el.src = fonte.src;
		el.currentTime = 0;
		void el.play().catch(() => {
			if (vez === minha) parar();
		});
		seguir(
			minha,
			() => el.currentTime,
			(t) => {
				if (el.ended) return parar();
				naLinha(t, el.duration > 0 ? el.duration : null);
			}
		);
	}

	/** Sem o arquivo (a síntese na fila): a boca anda sozinha, pelo peso dos sons. */
	function andarPeloPeso(modo: 'normal' | 'lento', minha: number) {
		const duracao = pesoTotal * (modo === 'lento' ? 230 : 150);
		const inicio = performance.now();
		seguir(
			minha,
			() => performance.now() - inicio,
			(t) => {
				if (t >= duracao) return parar();
				mostrar(passoPeloPeso(t / duracao));
			}
		);
	}

	/**
	 * Uma sílaba: exatamente o trecho dela no áudio, com a boca andando pelos sons
	 * dela, e no fim a boca da vogal, parada (o som que mais se vê). Sem a linha,
	 * só a boca da vogal.
	 */
	async function verSilaba(i: number) {
		parar();
		const minha = vez;
		const daSilaba = passos.filter((p) => p.silaba === i);
		const vogal = [...daSilaba].sort((a, b) => b.peso - a.peso)[0];
		if (!vogal) return;
		const pararNaVogal = () => {
			visema = vogal.visema;
			silabaAtiva = i;
		};
		pararNaVogal();
		descricao = `Sílaba ${silabas[i]?.leitura}: ${NOME_DA_BOCA[vogal.visema]}.`;

		const fonte = fonteDasSilabas;
		const trecho = fonte?.linha ? trechoDaSilaba(passos, fonte.linha.fones, i) : null;
		if (!fonte?.linha || !trecho) return;
		const fones = fonte.linha.fones;
		// A primeira sílaba começa um respiro antes (a margem antes da fala é
		// silêncio, e cortar rente come o começo do som); a última vai até o fim
		// do arquivo, com a cauda da vogal. As do meio, exatamente nos limites.
		const de = i === 0 ? Math.max(0, trecho[0] - RESPIRO_DA_PRIMEIRA) : trecho[0];
		const ate = i === silabas.length - 1 ? null : trecho[1];
		const naSilaba = (t: number) => {
			const passo = passoNoTempo(passos, fones, t);
			visema = passo && passo.silaba === i ? passo.visema : vogal.visema;
		};
		const terminou = () => {
			if (vez !== minha) return;
			// A vez acaba aqui: o laço da boca confere a vez a cada quadro, e sem
			// isto o da reserva (`<audio>`) seguia rodando depois do fim da sílaba.
			vez += 1;
			cancelAnimationFrame(quadro);
			tocando = null;
			pararNaVogal();
		};
		tocando = 'silaba';

		if (motor.disponivel) {
			motor.destravar();
			const ok = await motor.tocar(fonte.src, fonte.linha.fala, de, ate, terminou);
			if (vez !== minha) return;
			if (ok) return seguir(minha, () => motor.posicao(), naSilaba);
		}

		// Reserva: o `<audio>`, posicionado no começo da sílaba e parado no fim.
		const el = elemento;
		if (!el) return terminou();
		const fim = ate ?? Number.POSITIVE_INFINITY;
		const daqui = () => {
			if (vez !== minha) return;
			el.currentTime = de;
			void el.play().catch(terminou);
			seguir(
				minha,
				() => el.currentTime,
				(t) => {
					if (t >= fim || el.ended) {
						el.pause();
						return terminou();
					}
					naSilaba(t);
				}
			);
		};
		// O arquivo pode ainda não estar carregado (`preload="none"`): posicionar
		// antes dos metadados seria ignorado, e a sílaba sairia do começo.
		if (el.currentSrc !== new URL(fonte.src, location.href).href) el.src = fonte.src;
		if (el.readyState >= 1) daqui();
		else {
			el.addEventListener('loadedmetadata', daqui, { once: true });
			el.load();
		}
	}
</script>

<!-- A reserva do Web Audio (sem CORS no bucket, o iPhone sem a Audio Session). -->
<audio bind:this={elemento} preload="none"></audio>

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
		<!-- As sílabas, cada uma um botão: tocar toca a sílaba e mostra a boca dela.
		     A tônica vai em caixa alta e na cor da marca, como nas pronúncias
		     escritas. -->
		<p class="mt-1.5 flex flex-wrap items-center gap-x-1 gap-y-1 font-mono text-[15px]">
			{#each silabas as silaba, i (i)}
				{#if i > 0}<span class="text-base-content/40" aria-hidden="true">·</span>{/if}
				<button
					type="button"
					onclick={() => verSilaba(i)}
					aria-label="{fonteDasSilabas
						? 'Ouvir'
						: 'Ver a boca na'} sílaba {silaba.leitura}{silaba.tonica ? ', a tônica' : ''}"
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
