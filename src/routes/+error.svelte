<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import Logo from '$lib/components/Logo.svelte';

	const is404 = $derived(page.status === 404);
</script>

<svelte:head><title>{is404 ? 'Página não encontrada' : 'Erro'} — Spokke</title></svelte:head>

<div class="flex min-h-screen flex-col bg-base-200">
	<header class="px-8 py-5"><Logo /></header>
	<main class="flex flex-1 items-center px-8 pb-20">
		<div
			class="relative mx-auto flex w-full max-w-[1000px] items-center overflow-hidden
			       rounded-[20px] border border-line bg-base-100 p-11"
		>
			<div
				aria-hidden="true"
				class="pointer-events-none absolute inset-y-0 end-0 w-[260px] overflow-hidden"
			>
				<div
					class="absolute top-[8%] left-[18%] size-[130px] animate-[en-float-a_17s_ease-in-out_infinite] rounded-full bg-primary/25 blur-[2px]"
				></div>
				<div
					class="absolute right-[6%] bottom-[12%] h-[82px] w-[92px] animate-[en-drift-spin_25s_ease-in-out_infinite] bg-accent/20 [clip-path:polygon(50%_0%,100%_100%,0%_100%)]"
				></div>
				<div
					class="absolute bottom-[18%] left-[8%] size-12 animate-[en-float-c_19s_ease-in-out_infinite] rounded-2xl bg-warning/25"
				></div>
			</div>

			<div class="relative z-1 max-w-[44ch]">
				<p class="mb-3.5 font-mono text-[13px] text-primary">{page.status}</p>
				{#if is404}
					<h1
						class="mb-3 font-display text-[34px] leading-tight font-semibold tracking-[-0.025em] text-pretty"
					>
						Esta página não existe.
					</h1>
					<p class="mb-[22px] text-[15px] leading-relaxed text-base-content/65">
						O endereço pode ter mudado, ou o link veio digitado errado. Se você procurava uma
						atividade, o link do aluno começa com <code class="font-mono text-[13px]">/a/</code>.
					</p>
				{:else}
					<h1
						class="mb-3 font-display text-[34px] leading-tight font-semibold tracking-[-0.025em] text-pretty"
					>
						Alguma coisa quebrou do nosso lado.
					</h1>
					<p class="mb-[22px] text-[15px] leading-relaxed text-base-content/65">
						Não foi você. O erro já foi registrado. Se estava respondendo uma atividade, suas
						respostas anteriores foram salvas.
					</p>
				{/if}
				<div class="flex flex-wrap items-center gap-2.5">
					<a
						href={resolve('/')}
						class="btn min-h-[46px] motion-tap btn-primary font-bold no-underline"
					>
						{is404 ? 'Ir para o início' : 'Tentar de novo'}
					</a>
					<button
						type="button"
						onclick={() => history.back()}
						class="btn min-h-[46px] motion-tap btn-neutral font-semibold"
					>
						Voltar
					</button>
					{#if !is404 && page.error?.ref}
						<span class="font-mono text-xs text-base-content/65">ref {page.error.ref}</span>
					{/if}
				</div>
			</div>
		</div>
	</main>
</div>
