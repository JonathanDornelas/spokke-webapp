<script lang="ts">
	import Loading from './Loading.svelte';

	type Size = 'md' | 'lg';

	let {
		recording = false,
		abrindo = false,
		ontoggle,
		size = 'md',
		hint
	}: {
		recording?: boolean;
		/**
		 * O navegador está abrindo o microfone, o que leva de um instante a mais
		 * de um segundo. O botão espera como todo botão que espera: desabilitado,
		 * com a `fila` no lugar do ícone. Sem essa resposta o aluno tocava de novo.
		 */
		abrindo?: boolean;
		ontoggle?: () => void;
		size?: Size;
		/**
		 * A linha sob o botão. Existe como prop porque o que se promete ali mudou
		 * de dono: a gravação da questão de fala termina SOZINHA quando o aluno
		 * para de falar, então "toque para parar" ali seria mentira.
		 */
		hint?: string;
	} = $props();

	// O `lg` (o do Player) volta ao tamanho do `md` na tela baixa: no celular
	// com as barras do navegador, os 12px a mais eram a diferença entre a
	// questão de fala caber ou rolar.
	const buttonSize: Record<Size, string> = {
		md: 'size-24 min-h-24',
		lg: 'size-[108px] min-h-[108px] baixa:size-24 baixa:min-h-24'
	};
	const iconSize: Record<Size, string> = { md: 'size-9', lg: 'size-[42px] baixa:size-9' };
</script>

<div class="flex flex-col items-center gap-[18px] baixa:gap-3">
	<button
		type="button"
		class="btn btn-circle {buttonSize[size]} btn-accent"
		class:animate-[en-pulse-ring_1.9s_ease-out_infinite]={recording}
		onclick={ontoggle}
		disabled={abrindo}
		aria-busy={abrindo}
		aria-pressed={recording}
		aria-label={abrindo
			? 'Abrindo o microfone'
			: recording
				? 'Parar gravação agora'
				: 'Começar a gravar'}
	>
		{#if abrindo}
			<Loading
				variant="fila"
				size={size === 'lg' ? 16 : 14}
				tone="current"
				label="Abrindo o microfone"
			/>
		{:else}
			<svg class={iconSize[size]} viewBox="0 0 24 24" fill="none" aria-hidden="true">
				<rect x="9" y="2.5" width="6" height="11" rx="3" stroke="currentColor" stroke-width="2" />
				<path
					d="M5.5 11.5a6.5 6.5 0 0013 0M12 18v3.5"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
				/>
			</svg>
		{/if}
	</button>
	{#if recording}
		<!-- `items-end` + `origin-bottom`: a barra cresce da base, como onda de
		     áudio. Centrada ela pulsa para os dois lados e lê como carregamento. -->
		<div class="flex h-[34px] w-[200px] items-end gap-1" aria-hidden="true">
			{#each [40, 85, 55, 100, 45, 70, 30, 60, 25] as h, i (i)}
				<div
					class="flex-1 origin-bottom rounded-sm bg-accent"
					style="height: {h}%; animation: en-wave {340 +
						i * 35}ms ease-in-out infinite alternate {i * 25}ms"
				></div>
			{/each}
		</div>
	{/if}
	<p class="text-sm font-semibold" role="status" aria-live="polite">
		{hint ?? (recording ? 'Gravando… toque para parar' : 'Toque para gravar')}
	</p>
</div>
