<script lang="ts">
	// Pedidos de plano esperando a equipe. Sem gateway (docs/adr-002-billing.md),
	// é aqui que uma assinatura nasce: combinado o pagamento com o professor,
	// "Atender" ativa o plano pedido — e fecha o pedido na mesma transação, então
	// dois cliques não ativam duas vezes.
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Loading from '$lib/components/Loading.svelte';
	import { NOME_DO_PLANO, ehPlanoPago } from '$lib/billing/catalogo';
	import { atenderPedidoAdmin, cancelarPedidoAdmin } from '../admin.remote';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let pendente = $state<string | null>(null);
	let erro = $state<string | null>(null);
	/** A data de fim combinada, por pedido. Vazia = um ciclo a partir de hoje. */
	let ate = $state<Record<string, string>>({});

	async function rodar(id: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
		pendente = id;
		erro = null;
		try {
			const r = await fn();
			if (!r.ok) erro = r.error ?? 'Falhou.';
			await invalidateAll();
		} catch {
			erro = 'Não deu para concluir agora.';
		} finally {
			pendente = null;
		}
	}
</script>

<svelte:head><title>Pedidos · Painel interno · Spokke</title></svelte:head>

<h1 class="mb-1 font-display text-title font-semibold tracking-[-0.022em]">Pedidos de plano</h1>
<p class="mb-5 text-[13.5px] text-base-content/65">
	Do mais antigo para o mais novo. Atenda depois de combinar o pagamento com o professor.
</p>

{#if erro}
	<p class="mb-4 text-[13.5px] font-semibold text-error" role="alert">{erro}</p>
{/if}

<ul class="grid gap-3">
	{#each data.pedidos as p (p.id)}
		<li class="rounded-box border border-line bg-card px-4 py-4 lg:px-5">
			<div class="flex flex-wrap items-start justify-between gap-3">
				<div class="min-w-0">
					<p class="font-semibold">
						{ehPlanoPago(p.plano) ? NOME_DO_PLANO[p.plano] : p.plano} ({p.ciclo})
						<span class="font-normal text-base-content/65">
							· pedido em {new Date(p.createdAt).toLocaleDateString('pt-BR')}</span
						>
					</p>
					<a
						href={resolve('/(admin)/admin/professores/[id]', { id: p.teacher.id })}
						class="text-[13.5px]">{p.teacher.name}</a
					>
					<span class="text-[13px] text-base-content/65"> · {p.teacher.email}</span>
					{#if p.teacher.plan}
						<span class="text-[13px] text-base-content/65">
							· hoje no {ehPlanoPago(p.teacher.plan)
								? NOME_DO_PLANO[p.teacher.plan]
								: p.teacher.plan}</span
						>
					{/if}
				</div>
				<div class="flex flex-wrap items-end gap-2">
					<label class="block text-[12px] font-semibold">
						Vale até (opcional)
						<input type="date" bind:value={ate[p.id]} class="mt-1 input w-40" />
					</label>
					<button
						type="button"
						disabled={pendente !== null}
						onclick={() =>
							rodar(p.id, () =>
								atenderPedidoAdmin({ pedidoId: p.id, ate: ate[p.id] || undefined })
							)}
						class="btn min-h-11 motion-tap gap-2 btn-primary font-bold"
					>
						{#if pendente === p.id}<Loading
								variant="fila"
								size={10}
								tone="current"
								label="Ativando"
							/>{/if}
						Atender
					</button>
					<button
						type="button"
						disabled={pendente !== null}
						onclick={() => rodar(p.id, () => cancelarPedidoAdmin({ pedidoId: p.id }))}
						class="btn min-h-11 motion-tap btn-plain font-semibold">Recusar</button
					>
				</div>
			</div>
		</li>
	{:else}
		<li
			class="rounded-box border border-dashed border-line px-5 py-6 text-center text-base-content/65"
		>
			Nenhum pedido esperando.
		</li>
	{/each}
</ul>
