<script lang="ts">
	import { tick } from 'svelte';
	import { som } from '$lib/client/sons.svelte';

	// Sem autoplay, nunca. Reprodução visível e velocidade alternável.
	//
	// **Duas fontes, três velocidades.** O TTS sintetiza dois arquivos
	// (`LanguageProfile.tts.speeds`: normal e 0,75×), porque voz gerada devagar
	// sai melhor do que voz normal desacelerada no browser. O 0,5× sai do
	// `playbackRate` sobre o arquivo LENTO — sintetizar um terceiro arquivo por
	// frase aumentaria a fila de TTS e o bucket em 50% para ganhar um degrau.
	let {
		src,
		srcSlow,
		onplay,
		playing = $bindable(false),
		duration,
		plays
	}: {
		src: string;
		srcSlow?: string;
		onplay?: () => void;
		playing?: boolean;
		duration?: string;
		plays?: number;
	} = $props();

	let audio: HTMLAudioElement;
	let rate = $state(1);

	// **O regulador do Player rege ESTE áudio também.** Antes ele valia só para
	// os sons de acerto e erro, e o áudio da questão seguia o volume do
	// aparelho: o aluno que baixava o som numa sala cheia continuava com a frase
	// em inglês no talo, e tinha de mexer em dois controles para uma coisa só.
	//
	// O `<audio>` é atualizado por efeito, não só na montagem — mexer no
	// regulador com a questão aberta muda na hora.
	$effect(() => {
		if (audio) audio.volume = som.volume;
	});

	// **Um botão só, que cicla.** Quatro pílulas ocupavam a largura de um
	// telefone e obrigavam a mirar num alvo de 42px entre outros três iguais —
	// e "1.25×" nunca é o que se quer numa questão de escuta: quem aperta a
	// velocidade está com dificuldade de entender, não com pressa. O ciclo é
	// 1 → 0.75 → 0.5 → 1, e 1 é o padrão.
	const CICLO = [1, 0.75, 0.5];

	/** A velocidade do arquivo lento — a segunda de `LanguageProfile.tts.speeds`. */
	const VELOCIDADE_DO_LENTO = 0.75;

	/**
	 * De qual arquivo sai esta velocidade, e quanto o browser ainda precisa
	 * desacelerar por cima. Abaixo de 1 o arquivo lento é o mais próximo — 0,5×
	 * a partir dele é uma correção de 0,67, contra 0,5 a partir do normal.
	 */
	function fonteDe(valor: number): { url: string; playbackRate: number } {
		const lento = srcSlow !== undefined && valor < 1;
		const base = lento ? VELOCIDADE_DO_LENTO : 1;
		return { url: lento ? srcSlow! : src, playbackRate: valor / base };
	}

	// **O `src` do elemento segue o ARQUIVO, não a velocidade.** Trocar o `src`
	// reinicia o elemento e descarta a posição; com ele preso à velocidade, ir de
	// 0,5× para 0,75× (mesmo arquivo) recarregava à toa. Agora só muda quando
	// realmente muda de arquivo.
	const fonte = $derived(fonteDe(rate).url);

	function tocar() {
		// O volume pode ter mudado com o elemento parado; aplicar aqui evita
		// depender da ordem em que o efeito acima roda.
		audio.volume = som.volume;
		// `play()` devolve uma promessa que REJEITA quando o elemento recarrega no
		// meio (troca de fonte) ou quando o browser recusa sem gesto do usuário.
		// Sem este `catch` a rejeição sobe como erro não tratado — foi assim que o
		// player "travava" e só voltava recarregando a página.
		void audio.play().catch(() => {});
	}

	function alternar() {
		if (playing) {
			audio.pause();
		} else {
			tocar();
			onplay?.();
		}
	}

	function proximaVelocidade() {
		const i = CICLO.indexOf(rate);
		return CICLO[(i + 1) % CICLO.length]!;
	}

	async function definirVelocidade(valor: number) {
		const antes = fonteDe(rate);
		const depois = fonteDe(valor);
		rate = valor;

		// Mesmo arquivo: é só o `playbackRate`. Nada recarrega, nada perde a
		// posição, e o áudio continua tocando sem engasgo.
		if (depois.url === antes.url) {
			audio.playbackRate = depois.playbackRate;
			return;
		}

		// Arquivo diferente. Ele vai recarregar e voltar para o começo, então
		// guardamos a POSIÇÃO RELATIVA: os dois arquivos têm durações diferentes
		// (o lento é mais longo), e restaurar o segundo exato cairia noutro ponto
		// da frase.
		const fracao =
			Number.isFinite(audio.duration) && audio.duration > 0
				? audio.currentTime / audio.duration
				: 0;
		const estavaTocando = playing;

		// Espera o Svelte aplicar o `src` novo. Sem isto, o `play()` abaixo pegava
		// o elemento antigo e era abortado pelo carregamento — o bug original.
		await tick();

		audio.addEventListener(
			'loadedmetadata',
			() => {
				if (Number.isFinite(audio.duration)) audio.currentTime = fracao * audio.duration;
				audio.playbackRate = depois.playbackRate;
				if (estavaTocando) tocar();
			},
			{ once: true }
		);
	}

	/**
	 * O arquivo lento não carregou (a síntese ainda na fila, um job que falhou) ou
	 * nunca existiu: cai para o normal desacelerado no browser, em vez de deixar
	 * o aluno com um player mudo. É a mesma reserva que já valia quando o
	 * profile não gerava a segunda velocidade.
	 */
	let fonteQuebrada = $state(false);
	function aoFalhar() {
		if (fonte === src || fonteQuebrada) return;
		fonteQuebrada = true;
		rate = 1;
		audio.playbackRate = 1;
	}

	const ouvido = $derived(
		!plays ? 'toque para ouvir' : `ouvido ${plays} ${plays === 1 ? 'vez' : 'vezes'}`
	);
	const alturas = [40, 78, 55, 100, 45, 70, 32, 62, 50, 84];
</script>

<audio
	bind:this={audio}
	src={fonteQuebrada ? src : fonte}
	onplay={() => (playing = true)}
	onpause={() => (playing = false)}
	onended={() => (playing = false)}
	onerror={aoFalhar}
></audio>

<div class="flex flex-wrap items-center gap-4 rounded-box border border-line bg-base-200 p-4">
	<button
		type="button"
		class="btn btn-circle size-[62px] min-h-[62px] shrink-0 btn-accent"
		class:animate-[en-pulse-ring_2.6s_ease-out_infinite]={playing}
		onclick={alternar}
		aria-label={playing ? 'Pausar áudio' : 'Tocar áudio'}
	>
		{#if playing}
			<svg class="size-6" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
				<rect x="6" y="5" width="4" height="14" rx="1" />
				<rect x="14" y="5" width="4" height="14" rx="1" />
			</svg>
		{:else}
			<svg class="size-6" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
				<path d="M8 5.5l10 6.5-10 6.5z" />
			</svg>
		{/if}
	</button>

	<div class="min-w-0 flex-1">
		<div class="mb-[9px] flex h-[30px] items-end gap-1" aria-hidden="true">
			{#each alturas as h, i (i)}
				<div
					class="flex-1 origin-bottom rounded-sm bg-accent/55"
					style="height: {h}%; animation: {playing
						? `en-wave ${340 + i * 20}ms ease-in-out infinite alternate ${i * 30}ms`
						: 'none'}"
				></div>
			{/each}
		</div>
		{#if duration !== undefined}
			<p class="flex items-center gap-[11px] text-[12.5px] whitespace-nowrap text-base-content/65">
				<span class="font-mono">{duration}</span>
				<span>{ouvido}</span>
			</p>
		{/if}
	</div>

	<!-- No celular o controle desce para uma linha própria com rótulo: em largura
	     de telefone ele espremia a onda contra o botão de tocar. -->
	<div class="w-full border-t border-line pt-3.5 lg:w-auto lg:border-0 lg:pt-0">
		<div class="flex items-center gap-2">
			<span class="flex-1 text-[12.5px] text-base-content/65 lg:hidden">Velocidade</span>
			<button
				type="button"
				onclick={() => definirVelocidade(proximaVelocidade())}
				class="grid min-h-[46px] min-w-[62px] place-items-center rounded-full px-3 font-mono text-[13px] font-semibold
				       transition-transform duration-150 hover:-translate-y-0.5
				       {rate === 1
					? 'border border-line bg-base-100 text-base-content'
					: 'border-[1.5px] border-primary bg-base-300 text-primary'}"
				aria-label="Velocidade {rate} vezes. Toque para mudar para {proximaVelocidade()} vezes."
			>
				{rate}×
			</button>
		</div>
	</div>
</div>
