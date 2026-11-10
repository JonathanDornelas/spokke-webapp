<script lang="ts">
	// Código de acesso — etapa CONDICIONAL, só existe se o professor ligou a opção
	// ao publicar. O erro não mostra quantas tentativas restam: o limite fica no
	// servidor (server.md "A fronteira de segurança do Player").
	import { page } from '$app/state';
	import AmbientShapes from '$lib/components/AmbientShapes.svelte';
	import { validarCodigo } from '../player.remote';

	const invalido = $derived(validarCodigo.result?.invalid === true);

	let digits = $state(['', '', '', '']);
	let inputs: (HTMLInputElement | undefined)[] = $state([]);

	function onInput(i: number, e: Event) {
		const target = e.target as HTMLInputElement;
		digits[i] = target.value.toUpperCase().slice(-1);
		if (digits[i] && i < 3) inputs[i + 1]?.focus();
	}
	function onKeydown(i: number, e: KeyboardEvent) {
		if (e.key === 'Backspace' && !digits[i] && i > 0) inputs[i - 1]?.focus();
	}
</script>

<svelte:head><title>Código da turma · Spokke</title></svelte:head>

<div
	class="relative flex min-h-0 flex-1 flex-col [justify-content:safe_center] overflow-y-auto px-gutter
	       py-gutter-sm"
>
	<AmbientShapes edges="both" />

	<div class="relative z-1 mx-auto w-full max-w-[440px] animate-entrada">
		<span
			class="mb-5 inline-grid size-[52px] place-items-center rounded-full bg-base-300 text-primary"
		>
			<svg class="size-6" viewBox="0 0 24 24" fill="none" aria-hidden="true">
				<rect
					x="4"
					y="10.5"
					width="16"
					height="10"
					rx="2.5"
					stroke="currentColor"
					stroke-width="2"
				/>
				<path
					d="M8 10.5V7.5a4 4 0 118 0v3"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
				/>
			</svg>
		</span>
		<h1 class="mb-2 font-display text-title font-semibold tracking-[-0.02em] text-pretty">
			Digite o código da turma
		</h1>
		<p class="mb-6 text-[14.5px] leading-relaxed text-base-content/65">
			Seu professor passou um código de 4 letras junto com o link.
		</p>

		<form {...validarCodigo} class="mb-[18px]">
			<input type="hidden" name="slug" value={page.params.slug} />
			<input type="hidden" name="code" value={digits.join('')} />
			<!-- `min-w-0` nos campos: `<input>` nasce com `size=20`, e um item de
			     flex não encolhe abaixo do próprio conteúdo — as quatro caixas
			     estouravam a coluna e saíam do cartão. -->
			<fieldset class="flex w-full gap-2.5">
				<legend class="sr-only">Código de 4 letras</legend>
				{#each digits as d, i (i)}
					<input
						bind:this={inputs[i]}
						value={d}
						oninput={(e) => onInput(i, e)}
						onkeydown={(e) => onKeydown(i, e)}
						name="code{i}"
						maxlength="1"
						size="1"
						inputmode="text"
						autocapitalize="characters"
						autocomplete="off"
						aria-label="Letra {i + 1} de 4"
						class="h-[clamp(3rem,11vw,4rem)] min-w-0 flex-1 rounded-box border-[1.5px] text-center
						       font-mono text-[clamp(1.25rem,5vw,1.75rem)] uppercase
						       {d ? 'border-primary bg-base-100' : 'border-line bg-base-200'}
						       focus:border-primary focus:outline-none"
					/>
				{/each}
			</fieldset>
			<button
				type="submit"
				class="mt-[18px] btn btn-lg min-h-[52px] w-full motion-tap btn-primary text-[17px] font-bold"
				>Entrar</button
			>
		</form>

		{#if invalido}
			<div
				class="flex gap-2.5 rounded-field border-s-[3px] border-error bg-base-200 px-4 py-3"
				role="alert"
			>
				<svg
					class="size-[18px] shrink-0 text-error"
					viewBox="0 0 24 24"
					fill="none"
					aria-hidden="true"
				>
					<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" />
					<path
						d="M12 7.5v6M12 16.5h.01"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
					/>
				</svg>
				<p class="text-[13.5px] leading-snug">Código incorreto. Confira com seu professor.</p>
			</div>
		{/if}
	</div>
</div>
