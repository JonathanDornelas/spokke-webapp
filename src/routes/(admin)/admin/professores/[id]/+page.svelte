<script lang="ts">
	// Um professor no painel interno: a assinatura dele, o uso do estoque e o
	// histórico — e as ações de gestão (ativar ou trocar plano, estender o trial,
	// cancelar). Toda ação escreve pelo `assinaturas.ts` com o ator `admin:<id>`,
	// então o histórico abaixo diz quem fez o quê.
	import { invalidateAll } from '$app/navigation';
	import Loading from '$lib/components/Loading.svelte';
	import PlanoCard from '$lib/components/PlanoCard.svelte';
	import { CICLOS, NOME_DO_PLANO, PLANOS_PAGOS, ehPlanoPago } from '$lib/billing/catalogo';
	import {
		ativarPlanoAdmin,
		cancelarAdmin,
		concederCreditosAdmin,
		estenderTrialAdmin,
		reativarAdmin
	} from '../../admin.remote';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let plano = $state<(typeof PLANOS_PAGOS)[number]>('pro');
	let ciclo = $state<(typeof CICLOS)[number]>('mensal');
	let ate = $state('');
	let dias = $state(7);
	let creditos = $state(50);
	let motivoCredito = $state('');
	let pendente = $state<string | null>(null);
	let mensagem = $state<{ ok: boolean; texto: string } | null>(null);

	async function rodar(nome: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
		pendente = nome;
		mensagem = null;
		try {
			const r = await fn();
			mensagem = r.ok ? { ok: true, texto: 'Feito.' } : { ok: false, texto: r.error ?? 'Falhou.' };
			await invalidateAll();
		} catch {
			mensagem = { ok: false, texto: 'Não deu para concluir agora.' };
		} finally {
			pendente = null;
		}
	}

	const quando = (d: Date | string | null) =>
		d
			? new Date(d).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })
			: '—';
	const emTrial = $derived(data.acesso.origem === 'trial' || data.acesso.situacao === 'expirada');
	const temAssinatura = $derived(data.conta.subscriptionStatus === 'active');
</script>

<svelte:head><title>{data.conta.name} · Painel interno · Spokke</title></svelte:head>

<div class="mb-6">
	<h1 class="font-display text-title font-semibold tracking-[-0.022em]">{data.conta.name}</h1>
	<p class="text-[13.5px] text-base-content/65">
		{data.conta.email} · conta criada em {quando(data.conta.createdAt)} ·
		<span class="font-mono text-[12px]">{data.conta.id}</span>
	</p>
</div>

<div class="grid gap-6 lg:grid-cols-[300px_1fr]">
	<div class="grid content-start gap-4">
		<PlanoCard acesso={data.acesso} mostrarAcao={false} />
		<dl class="rounded-box border border-line bg-card px-4 py-3 text-[13px]">
			<div class="flex justify-between py-1">
				<dt class="text-base-content/65">Plano gravado</dt>
				<dd class="font-semibold">
					{ehPlanoPago(data.conta.plan) ? NOME_DO_PLANO[data.conta.plan] : '—'}
					{data.conta.planCycle ? `(${data.conta.planCycle})` : ''}
				</dd>
			</div>
			<div class="flex justify-between py-1">
				<dt class="text-base-content/65">Status</dt>
				<dd class="font-mono">{data.conta.subscriptionStatus ?? '—'}</dd>
			</div>
			<div class="flex justify-between py-1">
				<dt class="text-base-content/65">Fim do trial</dt>
				<dd>{quando(data.conta.trialEndsAt)}</dd>
			</div>
			<div class="flex justify-between py-1">
				<dt class="text-base-content/65">Fim do período</dt>
				<dd>{quando(data.conta.currentPeriodEnd)}</dd>
			</div>
			{#if data.conta.cancelAtPeriodEnd}
				<p class="pt-1 font-semibold text-warning">Cancelamento agendado</p>
			{/if}
		</dl>
	</div>

	<div class="grid content-start gap-6">
		<section class="rounded-box border border-line bg-card px-4 py-4 lg:px-5">
			<h2 class="mb-1 font-display text-section font-semibold">Ativar ou trocar de plano</h2>
			<p class="mb-3.5 text-[13px] text-base-content/65">
				Depois de combinar o pagamento. Sem data de fim, vale um ciclo a partir de hoje.
			</p>
			<div class="grid gap-3 sm:grid-cols-3">
				<label class="block text-[12.5px] font-semibold">
					Plano
					<select bind:value={plano} class="mt-1 select w-full">
						{#each PLANOS_PAGOS as id (id)}
							<option value={id}>{NOME_DO_PLANO[id]}</option>
						{/each}
					</select>
				</label>
				<label class="block text-[12.5px] font-semibold">
					Ciclo
					<select bind:value={ciclo} class="mt-1 select w-full">
						{#each CICLOS as id (id)}
							<option value={id}>{id}</option>
						{/each}
					</select>
				</label>
				<label class="block text-[12.5px] font-semibold">
					Vale até (opcional)
					<input type="date" bind:value={ate} class="mt-1 input w-full" />
				</label>
			</div>
			<button
				type="button"
				disabled={pendente !== null}
				onclick={() =>
					rodar('ativar', () =>
						ativarPlanoAdmin({ teacherId: data.conta.id, plano, ciclo, ate: ate || undefined })
					)}
				class="mt-3.5 btn min-h-11 motion-tap gap-2 btn-primary font-bold"
			>
				{#if pendente === 'ativar'}<Loading
						variant="fila"
						size={10}
						tone="current"
						label="Ativando"
					/>{/if}
				Ativar {NOME_DO_PLANO[plano]}
			</button>
		</section>

		{#if emTrial && !temAssinatura}
			<section class="rounded-box border border-line bg-card px-4 py-4 lg:px-5">
				<h2 class="mb-1 font-display text-section font-semibold">Período de teste</h2>
				<p class="mb-3.5 text-[13px] text-base-content/65">
					Dias positivos estendem; negativos encerram antes (útil para testar o bloqueio).
				</p>
				<div class="flex flex-wrap items-end gap-3">
					<label class="block text-[12.5px] font-semibold">
						Dias
						<input type="number" bind:value={dias} min="-365" max="365" class="mt-1 input w-28" />
					</label>
					<button
						type="button"
						disabled={pendente !== null}
						onclick={() =>
							rodar('trial', () =>
								estenderTrialAdmin({ teacherId: data.conta.id, dias: Number(dias) })
							)}
						class="btn min-h-11 motion-tap gap-2 btn-plain font-semibold"
					>
						{#if pendente === 'trial'}<Loading
								variant="fila"
								size={10}
								tone="current"
								label="Salvando"
							/>{/if}
						{dias >= 0 ? 'Estender' : 'Encerrar antes'}
					</button>
				</div>
			</section>
		{/if}

		{#if temAssinatura}
			<section class="rounded-box border border-line bg-card px-4 py-4 lg:px-5">
				<h2 class="mb-1 font-display text-section font-semibold">Cancelar</h2>
				<p class="mb-3.5 text-[13px] text-base-content/65">
					Nada é apagado e nenhum link sai do ar — só criar e publicar pausam.
				</p>
				<div class="flex flex-wrap gap-2">
					{#if data.conta.cancelAtPeriodEnd}
						<button
							type="button"
							disabled={pendente !== null}
							onclick={() => rodar('reativar', () => reativarAdmin({ teacherId: data.conta.id }))}
							class="btn min-h-11 motion-tap btn-plain font-semibold">Desfazer cancelamento</button
						>
					{:else}
						<button
							type="button"
							disabled={pendente !== null}
							onclick={() =>
								rodar('cancelar', () =>
									cancelarAdmin({ teacherId: data.conta.id, noFimDoPeriodo: true })
								)}
							class="btn min-h-11 motion-tap btn-plain font-semibold">No fim do período</button
						>
					{/if}
					<button
						type="button"
						disabled={pendente !== null}
						onclick={() =>
							rodar('cancelar', () =>
								cancelarAdmin({ teacherId: data.conta.id, noFimDoPeriodo: false })
							)}
						class="btn min-h-11 motion-tap btn-outline-error font-semibold">Encerrar agora</button
					>
				</div>
			</section>
		{/if}

		{#if data.acesso.limites.ia}
			<section class="rounded-box border border-line bg-card px-4 py-4 lg:px-5">
				<h2 class="mb-1 font-display text-section font-semibold">Créditos de cortesia</h2>
				<p class="mb-3.5 text-[13px] text-base-content/65">
					Saldo agora: {data.acesso.creditos.saldo}. Valem só neste ciclo — não acumulam.
				</p>
				<div class="flex flex-wrap items-end gap-3">
					<label class="block text-[12.5px] font-semibold">
						Créditos
						<input type="number" bind:value={creditos} min="1" class="mt-1 input w-28" />
					</label>
					<label class="block min-w-[200px] flex-1 text-[12.5px] font-semibold">
						Motivo
						<input
							bind:value={motivoCredito}
							class="mt-1 input w-full"
							placeholder="ex.: falha na geração"
						/>
					</label>
					<button
						type="button"
						disabled={pendente !== null || !(Number(creditos) > 0)}
						onclick={() =>
							rodar('creditos', () =>
								concederCreditosAdmin({
									teacherId: data.conta.id,
									creditos: Number(creditos),
									motivo: motivoCredito
								})
							)}
						class="btn min-h-11 motion-tap gap-2 btn-plain font-semibold"
					>
						{#if pendente === 'creditos'}<Loading
								variant="fila"
								size={10}
								tone="current"
								label="Concedendo"
							/>{/if}
						Conceder
					</button>
				</div>
			</section>
		{/if}

		{#if mensagem}
			<p
				class="text-[13.5px] font-semibold {mensagem.ok ? 'text-success' : 'text-error'}"
				role="status"
			>
				{mensagem.texto}
			</p>
		{/if}

		<section>
			<h2 class="mb-2 font-display text-section font-semibold">Pedidos</h2>
			<ul class="overflow-hidden rounded-box border border-line bg-card text-[13.5px]">
				{#each data.pedidos as p (p.id)}
					<li
						class="flex flex-wrap justify-between gap-2 border-b border-line px-4 py-2.5 last:border-0"
					>
						<span>{ehPlanoPago(p.plano) ? NOME_DO_PLANO[p.plano] : p.plano} ({p.ciclo})</span>
						<span class="text-base-content/65">{p.status} · {quando(p.createdAt)}</span>
					</li>
				{:else}
					<li class="px-4 py-2.5 text-base-content/65">Nenhum pedido.</li>
				{/each}
			</ul>
		</section>

		<section>
			<h2 class="mb-2 font-display text-section font-semibold">Histórico</h2>
			<ul class="overflow-hidden rounded-box border border-line bg-card text-[13.5px]">
				{#each data.historico as e (e.id)}
					<li
						class="flex flex-wrap justify-between gap-2 border-b border-line px-4 py-2.5 last:border-0"
					>
						<span class="font-semibold">{e.texto}</span>
						<span class="text-[12.5px] text-base-content/65"
							><span class="font-mono">{e.ator}</span> · {quando(e.quando)}</span
						>
					</li>
				{:else}
					<li class="px-4 py-2.5 text-base-content/65">Nada registrado.</li>
				{/each}
			</ul>
		</section>
	</div>
</div>
