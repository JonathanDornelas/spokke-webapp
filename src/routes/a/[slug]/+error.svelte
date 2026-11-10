<script lang="ts">
	// Link indisponível. QUATRO causas, quatro mensagens — uma mensagem genérica
	// deixa o aluno sem saber se erra o link, se espera, ou se avisa o professor.
	// O motivo vem em `page.error.reason` (tipado em src/app.d.ts), lançado pelo
	// futuro loader via `error(404, { message, reason: 'notFound' })` etc. — ver
	// .claude/rules/paginas.md "Player".
	import { page } from '$app/state';

	type Reason = 'notFound' | 'unpublished' | 'audioPending' | 'attemptLost';

	const reason = $derived<Reason>(page.error?.reason ?? 'notFound');

	const copy: Record<
		Reason,
		{ title: string; body: string; action?: string; note?: string; tone: string }
	> = {
		notFound: {
			title: 'Este link não existe',
			body: 'Confira se copiou o endereço inteiro. Se veio por mensagem, ele pode ter sido cortado.',
			action: 'Digitar o link de novo',
			tone: 'bg-base-300 text-base-content/65'
		},
		unpublished: {
			title: 'Esta atividade foi encerrada',
			body: 'O professor tirou o link do ar. Se você já tinha respondido, suas respostas continuam com ele.',
			note: 'Fale com seu professor se precisar responder mesmo assim.',
			tone: 'bg-warning/14 text-warning'
		},
		audioPending: {
			title: 'Preparando os áudios',
			body: 'Esta atividade tem exercícios de escuta e o áudio ainda está sendo gerado. Costuma ser rápido.',
			action: 'Tentar de novo',
			tone: 'bg-accent text-accent-content'
		},
		attemptLost: {
			title: 'Perdemos sua sessão',
			body: 'As respostas que você já enviou estão salvas. Volte a entrar para continuar de onde parou.',
			action: 'Voltar para a atividade',
			tone: 'bg-error/14 text-error'
		}
	};
	const c = $derived(copy[reason]);
</script>

<svelte:head><title>{c.title} · Spokke</title></svelte:head>

<div class="flex min-h-dvh items-center justify-center bg-base-100 px-6 py-8">
	<div class="w-full max-w-[440px]">
		<span
			class="mb-[18px] inline-grid size-[52px] place-items-center rounded-full {c.tone}
			       {reason === 'audioPending' ? 'animate-[en-pulse-ring_2.2s_ease-out_infinite]' : ''}"
		>
			{#if reason === 'notFound'}
				<svg class="size-6" viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2" />
					<path
						d="M16.5 16.5L21 21"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
					/>
				</svg>
			{:else if reason === 'unpublished'}
				<svg class="size-6" viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" />
					<path d="M12 7.5V12l3 2" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
				</svg>
			{:else if reason === 'audioPending'}
				<svg class="size-6" viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<path
						d="M4 12l1.5 3M8 8l1.5 11M12 5l1.5 15M16 9l1.5 8M20 12l1 3"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
					/>
				</svg>
			{:else}
				<svg class="size-6" viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" />
					<path
						d="M12 7.5v6M12 16.5h.01"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
					/>
				</svg>
			{/if}
		</span>

		<h1 class="mb-2.5 font-display text-2xl leading-tight font-semibold tracking-[-0.02em]">
			{c.title}
		</h1>
		<p class="mb-[18px] text-[14.5px] leading-relaxed text-base-content/65">{c.body}</p>

		{#if reason === 'audioPending'}
			<div class="mb-[18px] flex h-[26px] items-end gap-1" aria-hidden="true">
				{#each [40, 85, 55, 100, 45, 70] as h, i (i)}
					<div
						class="flex-1 origin-bottom rounded-sm bg-accent/60"
						style="height: {h}%; animation: en-wave {340 +
							i * 26}ms ease-in-out infinite alternate {i * 30}ms"
					></div>
				{/each}
			</div>
			<p class="mb-[18px] text-[12.5px] leading-snug text-base-content/65">
				Sem prazo estimado: a geração é assíncrona.
			</p>
		{/if}

		{#if c.note}
			<p
				class="rounded-field bg-base-200 px-3.5 py-3 text-[13px] leading-snug text-base-content/65"
			>
				{c.note}
			</p>
		{/if}
		{#if c.action}
			<button
				type="button"
				onclick={() => location.reload()}
				class="btn min-h-12 motion-tap btn-primary font-bold">{c.action}</button
			>
		{/if}
	</div>
</div>
