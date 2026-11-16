<script lang="ts">
	// O que vem ANTES da pergunta num `composite` (kernel.md, `Prompt.contexto`):
	// o trecho de um texto, ou um diálogo em balões. O servidor já cortou o que o
	// aluno não pode ver (`contextoNoRuntime`): as falas depois da parada, o texto
	// quando ele só ouve, e o texto da fala que é a vez dele.
	//
	// O diálogo toca INTEIRO num toque ("Ouvir o diálogo"), uma fala depois da
	// outra, com o balão de quem fala aceso; cada balão também repete a sua. Sem
	// autoplay. A velocidade lenta usa os arquivos lentos (server.md "TTS").
	import type { ContextoNoRuntime } from '$lib/components/interactions/types';

	let {
		contexto,
		dir = 'ltr',
		lang,
		compacta = false,
		ajustavel = false
	}: {
		contexto: ContextoNoRuntime;
		dir?: 'ltr' | 'rtl';
		lang?: string;
		/** Dentro da moldura de celular do Studio: letra e balões menores. */
		compacta?: boolean;
		/**
		 * Na tela do Player (a `/q/[n]` e a prévia do aluno): os balões, ou o texto,
		 * ficam com a altura que SOBRA na coluna e rolam por dentro — a questão
		 * cabe numa tela só, e o que rola é este bloco, não a página
		 * (design-system.md "Player numa tela só"). Só ali a coluna em volta é
		 * flex com a altura presa; fora dela o bloco tem a altura do conteúdo.
		 */
		ajustavel?: boolean;
	} = $props();

	let elemento = $state<HTMLAudioElement>();
	let tocandoFala = $state<number | null>(null);
	let emSequencia = $state(false);
	let lento = $state(false);
	/** A área que rola, no modo `ajustavel`. */
	let rolagem = $state<HTMLElement>();

	/**
	 * Na questão da próxima fala a área abre no FIM: o que o aluno precisa ver
	 * primeiro é o "Sua vez" e a fala logo antes dele. Na pergunta sobre o
	 * diálogo inteiro ela abre no começo, que é por onde se lê.
	 *
	 * E FICA no fim enquanto a área muda de tamanho (a fonte que chega, o
	 * veredito que entra e encolhe o bloco, a tela que gira): posta uma vez só,
	 * na montagem, a altura final ainda não existia e o "Sua vez" ficava fora da
	 * vista. Quem rola por conta própria assume dali em diante.
	 */
	$effect(() => {
		if (!ajustavel || !rolagem || contexto.tipo !== 'dialogo' || !contexto.vez) return;
		const area = rolagem;
		let mexeu = false;
		const assumir = () => (mexeu = true);
		const aoFim = () => {
			if (!mexeu) area.scrollTop = area.scrollHeight;
		};
		aoFim();
		const observador = new ResizeObserver(aoFim);
		observador.observe(area);
		if (area.firstElementChild) observador.observe(area.firstElementChild);
		const gestos = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const;
		for (const gesto of gestos) area.addEventListener(gesto, assumir, { passive: true });
		return () => {
			observador.disconnect();
			for (const gesto of gestos) area.removeEventListener(gesto, assumir);
		};
	});

	/** Traz para a vista o balão de quem está falando, quando a área rola. */
	function mostrarFala(i: number) {
		if (!ajustavel || !rolagem) return;
		const balao = rolagem.querySelectorAll<HTMLElement>('ol > li')[i];
		if (!balao) return;
		const topo = balao.offsetTop;
		const base = topo + balao.offsetHeight;
		const vista = rolagem.scrollTop;
		const alvo =
			topo < vista
				? topo - 8
				: base > vista + rolagem.clientHeight
					? base - rolagem.clientHeight + 8
					: null;
		if (alvo === null) return;
		const quieto = matchMedia('(prefers-reduced-motion: reduce)').matches;
		rolagem.scrollTo({ top: alvo, behavior: quieto ? 'auto' : 'smooth' });
	}

	const falas = $derived(contexto.tipo === 'dialogo' ? contexto.falas : []);
	/** A vez do aluno, na questão da próxima fala. */
	const vez = $derived(contexto.tipo === 'dialogo' ? contexto.vez : undefined);
	const temAudio = $derived(falas.some((f) => f.audio));
	const faltaAudio = $derived(
		contexto.tipo === 'dialogo' && contexto.mostra !== 'texto' && falas.some((f) => !f.audio)
	);

	function parar() {
		elemento?.pause();
		tocandoFala = null;
		emSequencia = false;
	}

	function tocar(i: number, seguir: boolean) {
		const fala = falas[i];
		const src = fala ? (lento ? (fala.audioSlow ?? fala.audio) : fala.audio) : undefined;
		if (!fala || !src || !elemento) return parar();
		tocandoFala = i;
		emSequencia = seguir;
		mostrarFala(i);
		elemento.src = src;
		elemento.currentTime = 0;
		void elemento.play().catch(() => parar());
	}

	function aoTerminar() {
		if (emSequencia && tocandoFala !== null && tocandoFala + 1 < falas.length) {
			tocar(tocandoFala + 1, true);
		} else {
			parar();
		}
	}

	// Um efeito, e não `onDestroy` (que roda também no servidor): para o áudio ao sair.
	$effect(() => () => elemento?.pause());

	const balao = 'max-w-[85%] rounded-[16px] border px-3.5 py-2.5';

	// O modo `ajustavel`, em duas larguras. No celular a coluna da questão
	// CRESCE até o fim da tela (a resposta vem logo depois), e a área nasce com
	// 5,5rem e fica com toda a sobra: é a altura mínima que a coluna respeita
	// antes de a tela inteira precisar rolar. No desktop a coluna tem a altura
	// da tela no máximo, e a área tem a altura do conteúdo e encolhe até caber.
	const raiz = $derived(
		ajustavel ? 'mb-5 flex grow flex-col baixa:mb-3 lg:mb-0 lg:min-h-0 lg:grow-0' : 'mb-5'
	);
	const area =
		'relative h-[5.5rem] grow overflow-y-auto rounded-box outline-none focus-visible:outline-2 ' +
		'focus-visible:outline-offset-2 focus-visible:outline-primary lg:h-auto lg:min-h-24 lg:grow-0';
</script>

{#snippet trecho(texto: string)}
	<div class="rounded-box border border-line bg-base-200 p-4">
		<p
			{dir}
			lang={lang ?? undefined}
			data-content-lang={lang}
			class="font-content leading-[1.65] whitespace-pre-line {compacta
				? 'text-[15px]'
				: 'text-[17px]'}"
		>
			{texto}
		</p>
	</div>
{/snippet}

{#if contexto.tipo === 'texto'}
	{#if ajustavel}
		<!-- A área que rola é transparente e a caixa vai dentro dela: um texto curto
		     não estica a caixa até o fim da coluna. Focável, porque rolar pelo
		     teclado precisa de um lugar para estar. -->
		<div class={raiz}>
			<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
			<div bind:this={rolagem} class={area} role="region" aria-label="O texto" tabindex="0">
				{@render trecho(contexto.texto)}
			</div>
		</div>
	{:else}
		<div class="mb-5">{@render trecho(contexto.texto)}</div>
	{/if}
{:else}
	<audio bind:this={elemento} preload="none" onended={aoTerminar}></audio>
	<div class={raiz}>
		{#if temAudio}
			<div class="mb-3 flex shrink-0 flex-wrap items-center gap-2 baixa:mb-2">
				<button
					type="button"
					onclick={() => (emSequencia ? parar() : tocar(0, true))}
					aria-pressed={emSequencia}
					class="btn btn-sm motion-tap gap-2 btn-accent"
				>
					<svg class="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
						{#if emSequencia}
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
					{emSequencia ? 'Parar' : 'Ouvir o diálogo'}
				</button>
				<button
					type="button"
					onclick={() => (lento = !lento)}
					aria-pressed={lento}
					class="btn btn-sm motion-tap btn-plain"
					title="A velocidade lenta não conta como erro"
				>
					{lento ? 'Devagar' : 'Normal'}
				</button>
			</div>
		{:else if faltaAudio}
			<p class="mb-3 shrink-0 text-[12.5px] text-base-content/65 baixa:mb-2" role="status">
				O áudio do diálogo ainda está sendo gerado.
			</p>
		{/if}

		{#if ajustavel}
			<!-- A área dos balões é o que rola na questão de diálogo (focável, para o
			     teclado rolar também). -->
			<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
			<div bind:this={rolagem} class={area} role="region" aria-label="O diálogo" tabindex="0">
				{@render baloes()}
			</div>
		{:else}
			{@render baloes()}
		{/if}
	</div>
{/if}

{#snippet baloes()}
	<ol
		class="grid list-none gap-2.5 p-0 baixa:gap-2"
		aria-label={ajustavel ? undefined : 'O diálogo'}
	>
		{#each falas as fala, i (i)}
			<li class="flex flex-col {fala.lado === 'fim' ? 'items-end' : 'items-start'}">
				<span
					class="mb-1 px-1 text-[11px] font-bold tracking-[0.06em] text-base-content/65 uppercase"
				>
					{fala.falante}
				</span>
				<div
					class="{balao} flex items-start gap-2.5 transition-[border-color,background-color] duration-200
						       {fala.lado === 'fim' ? 'bg-base-300' : 'bg-base-200'}
						       {tocandoFala === i ? 'border-accent ring-2 ring-accent/30' : 'border-line'}"
				>
					{#if fala.audio}
						<button
							type="button"
							onclick={() => (tocandoFala === i ? parar() : tocar(i, false))}
							aria-label="Ouvir a fala de {fala.falante}"
							class="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-accent text-accent-content transition-[scale] active:scale-90"
						>
							<svg class="size-3.5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
								<path
									d="M8 5.5l10 6.5-10 6.5z"
									fill="currentColor"
									stroke="currentColor"
									stroke-width="1.5"
									stroke-linejoin="round"
								/>
							</svg>
						</button>
					{/if}
					{#if fala.texto}
						<p
							{dir}
							lang={lang ?? undefined}
							data-content-lang={lang}
							class="font-content leading-snug {compacta ? 'text-[14px]' : 'text-[16px]'}"
						>
							{fala.texto}
						</p>
					{:else}
						<!-- Só o áudio: a onda diz que há uma fala ali, e o leitor de tela ouve o porquê. -->
						<span class="flex h-7 items-center gap-[3px]" aria-hidden="true">
							{#each [5, 10, 14, 8, 12, 6, 10] as altura, j (j)}
								<span
									class="w-[3px] rounded-full bg-accent/70 {tocandoFala === i
										? 'animate-[en-wave_0.9s_ease-in-out_infinite]'
										: ''}"
									style="height: {altura * 1.4}px; animation-delay: {j * 90}ms"
								></span>
							{/each}
						</span>
						<span class="sr-only">Fala de {fala.falante}, só em áudio.</span>
					{/if}
				</div>
			</li>
		{/each}
		{#if vez}
			<li class="flex flex-col {vez.lado === 'fim' ? 'items-end' : 'items-start'}">
				<span class="mb-1 px-1 text-[11px] font-bold tracking-[0.06em] text-primary uppercase">
					{vez.falante}
				</span>
				<div
					class="{balao} border-[1.5px] border-dashed border-primary bg-base-100 text-[14px] font-bold text-primary"
				>
					Sua vez
				</div>
			</li>
		{/if}
	</ol>
{/snippet}
