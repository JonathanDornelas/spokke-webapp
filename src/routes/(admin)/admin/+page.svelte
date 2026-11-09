<script lang="ts">
	// Visão geral: o que pede ação HOJE — pedidos de plano esperando, trials que
	// vencem em três dias, jobs que esgotaram as tentativas. Os números de
	// assinantes vêm depois: são contexto, não tarefa.
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Loading from '$lib/components/Loading.svelte';
	import { NOME_DO_PLANO, ehPlanoPago } from '$lib/billing/catalogo';
	import { reenfileirarJobAdmin } from './admin.remote';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let reenfileirando = $state<string | null>(null);

	async function reenfileirar(jobId: string) {
		reenfileirando = jobId;
		try {
			await reenfileirarJobAdmin({ jobId });
			await invalidateAll();
		} finally {
			reenfileirando = null;
		}
	}

	const dataCurta = (d: Date | string | null) =>
		d ? new Date(d).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }) : '—';
</script>

<svelte:head><title>Painel interno — Spokke</title></svelte:head>

<h1 class="mb-5 font-display text-title font-semibold tracking-[-0.022em]">Visão geral</h1>

<dl class="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
	<div class="rounded-box border border-line bg-card px-4 py-3.5">
		<dt class="text-[12.5px] text-base-content/65">Professores</dt>
		<dd class="font-display text-[26px] font-semibold">{data.geral.total}</dd>
	</div>
	<div class="rounded-box border border-line bg-card px-4 py-3.5">
		<dt class="text-[12.5px] text-base-content/65">Em período de teste</dt>
		<dd class="font-display text-[26px] font-semibold">{data.geral.emTrial}</dd>
	</div>
	<div
		class="rounded-box border px-4 py-3.5 {data.geral.pedidosPendentes > 0
			? 'border-warning/45 bg-warning/6'
			: 'border-line bg-card'}"
	>
		<dt class="text-[12.5px] text-base-content/65">
			<a href={resolve('/(admin)/admin/pedidos')}>Pedidos de plano</a>
		</dt>
		<dd class="font-display text-[26px] font-semibold">{data.geral.pedidosPendentes}</dd>
	</div>
	<div
		class="rounded-box border px-4 py-3.5 {data.geral.jobsFalhados > 0
			? 'border-error/35 bg-error/6'
			: 'border-line bg-card'}"
	>
		<dt class="text-[12.5px] text-base-content/65">Jobs falhados</dt>
		<dd class="font-display text-[26px] font-semibold">{data.geral.jobsFalhados}</dd>
	</div>
</dl>

<div class="grid gap-8 lg:grid-cols-2">
	<section>
		<h2 class="mb-1 font-display text-section font-semibold">Assinaturas em vigor</h2>
		<p class="mb-3 text-[13px] text-base-content/65">por plano, com o período ainda correndo</p>
		<ul class="overflow-hidden rounded-box border border-line bg-card">
			{#each data.geral.ativosPorPlano as linha (linha.plano)}
				<li class="flex justify-between border-b border-line px-4 py-3 last:border-0">
					<span class="font-semibold"
						>{ehPlanoPago(linha.plano) ? NOME_DO_PLANO[linha.plano] : (linha.plano ?? '—')}</span
					>
					<span class="font-mono">{linha.n}</span>
				</li>
			{:else}
				<li class="px-4 py-3 text-[13.5px] text-base-content/65">Nenhuma assinatura ativa.</li>
			{/each}
		</ul>
	</section>

	<section>
		<h2 class="mb-1 font-display text-section font-semibold">Trials que vencem em 3 dias</h2>
		<p class="mb-3 text-[13px] text-base-content/65">quem ainda dá tempo de converter</p>
		<ul class="overflow-hidden rounded-box border border-line bg-card">
			{#each data.geral.trialsVencendo as prof (prof.id)}
				<li class="border-b border-line last:border-0">
					<a
						href={resolve('/(admin)/admin/professores/[id]', { id: prof.id })}
						class="flex flex-wrap justify-between gap-2 px-4 py-3 no-underline hover:bg-base-200"
					>
						<span class="min-w-0">
							<span class="block font-semibold text-base-content">{prof.name}</span>
							<span class="block truncate text-[12.5px] text-base-content/65">{prof.email}</span>
						</span>
						<span class="font-mono text-[13px] text-warning">{dataCurta(prof.trialEndsAt)}</span>
					</a>
				</li>
			{:else}
				<li class="px-4 py-3 text-[13.5px] text-base-content/65">Nenhum trial vencendo.</li>
			{/each}
		</ul>
	</section>
</div>

<section class="mt-8">
	<h2 class="mb-1 font-display text-section font-semibold">Jobs que falharam</h2>
	<p class="mb-3 text-[13px] text-base-content/65">
		esgotaram as tentativas e não vão rodar sozinhos — nunca somem em silêncio
	</p>
	<ul class="overflow-hidden rounded-box border border-line bg-card">
		{#each data.falhados as job (job.id)}
			<li class="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 last:border-0">
				<span class="rounded-full bg-base-300 px-2.5 py-1 font-mono text-[12px]">{job.tipo}</span>
				<span class="min-w-[200px] flex-1 truncate font-mono text-[12.5px] text-base-content/70"
					>{job.erro ?? 'sem mensagem'}</span
				>
				<span class="text-[12.5px] text-base-content/65"
					>{job.tentativas}× · {dataCurta(job.quando)}</span
				>
				<button
					type="button"
					onclick={() => reenfileirar(job.id)}
					disabled={reenfileirando !== null}
					class="btn btn-sm min-h-9 motion-tap gap-2 btn-plain font-semibold"
				>
					{#if reenfileirando === job.id}
						<Loading variant="fila" size={10} tone="current" label="Reenfileirando" />
					{/if}
					Tentar de novo
				</button>
			</li>
		{:else}
			<li class="px-4 py-3 text-[13.5px] text-base-content/65">Nenhum job falhado.</li>
		{/each}
	</ul>
</section>
