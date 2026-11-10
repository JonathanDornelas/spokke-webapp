<script lang="ts">
	// As escolas (plano Scholar). Contrato por fora do sistema: aqui se cria a
	// escola com os assentos e os limites POR PROFESSOR combinados, e depois se
	// convida a coordenação (docs/adr-005-escola.md).
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Loading from '$lib/components/Loading.svelte';
	import { criarEscolaAdmin } from '../admin.remote';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let criando = $state(false);
	let nome = $state('');
	let assentos = $state(5);
	let atividades = $state(30);
	let materiais = $state(300);
	let creditos = $state(300);
	let ate = $state('');
	let salvando = $state(false);
	let erro = $state<string | null>(null);

	async function criar(e: SubmitEvent) {
		e.preventDefault();
		salvando = true;
		erro = null;
		try {
			const r = await criarEscolaAdmin({
				name: nome,
				seats: Number(assentos),
				atividadesPorProfessor: Number(atividades),
				materiaisPorProfessor: Number(materiais),
				creditosPorProfessor: Number(creditos),
				contractEndsAt: ate || undefined,
				status: 'ativa'
			});
			if (!r.ok) {
				erro = r.error;
				return;
			}
			await goto(resolve('/(admin)/admin/escolas/[id]', { id: r.id }));
		} catch {
			erro = 'Não deu para criar agora.';
		} finally {
			salvando = false;
		}
	}

	const STATUS: Record<string, string> = {
		ativa: 'bg-success/13 text-success',
		suspensa: 'bg-warning/15 text-warning',
		encerrada: 'bg-base-200 text-base-content/65'
	};
</script>

<svelte:head><title>Escolas · Painel interno · Spokke</title></svelte:head>

<div class="mb-5 flex flex-wrap items-end gap-3">
	<h1 class="flex-1 font-display text-title font-semibold tracking-[-0.022em]">Escolas</h1>
	{#if !criando}
		<button
			type="button"
			onclick={() => (criando = true)}
			class="btn min-h-11 motion-tap btn-primary font-bold">Nova escola</button
		>
	{/if}
</div>

{#if criando}
	<form
		onsubmit={criar}
		class="mb-6 max-w-[720px] rounded-box border border-line bg-card px-4 py-4 lg:px-5"
	>
		<label class="block text-[12.5px] font-semibold">
			Nome da escola
			<input bind:value={nome} required class="mt-1 input w-full" />
		</label>
		<div class="mt-3 grid gap-3 sm:grid-cols-3">
			<label class="block text-[12.5px] font-semibold">
				Assentos (professores)
				<input type="number" min="1" bind:value={assentos} class="mt-1 input w-full" />
			</label>
			<label class="block text-[12.5px] font-semibold">
				Contrato até (opcional)
				<input type="date" bind:value={ate} class="mt-1 input w-full" />
			</label>
		</div>
		<p class="mt-4 mb-1 text-[12.5px] font-bold">Limites por professor</p>
		<div class="grid gap-3 sm:grid-cols-3">
			<label class="block text-[12.5px] font-semibold">
				Atividades
				<input type="number" min="0" bind:value={atividades} class="mt-1 input w-full" />
			</label>
			<label class="block text-[12.5px] font-semibold">
				Materiais
				<input type="number" min="0" bind:value={materiais} class="mt-1 input w-full" />
			</label>
			<label class="block text-[12.5px] font-semibold">
				Créditos de IA por mês
				<input type="number" min="0" bind:value={creditos} class="mt-1 input w-full" />
			</label>
		</div>
		<div class="mt-4 flex gap-2">
			<button
				type="submit"
				disabled={salvando || !nome.trim()}
				class="btn min-h-11 motion-tap gap-2 btn-primary font-bold"
			>
				{#if salvando}<Loading variant="fila" size={10} tone="current" label="Criando" />{/if}
				Criar escola
			</button>
			<button type="button" onclick={() => (criando = false)} class="btn min-h-11 btn-plain"
				>Cancelar</button
			>
		</div>
		{#if erro}<p class="mt-2 text-[13px] font-semibold text-error" role="alert">{erro}</p>{/if}
	</form>
{/if}

<ul class="overflow-hidden rounded-box border border-line bg-card">
	{#each data.escolas as s (s.id)}
		<li class="border-b border-line last:border-0">
			<a
				href={resolve('/(admin)/admin/escolas/[id]', { id: s.id })}
				class="flex flex-wrap items-center gap-3 px-4 py-3 no-underline hover:bg-base-200"
			>
				<span class="min-w-[200px] flex-1 font-semibold text-base-content">{s.name}</span>
				<span class="rounded-full px-2.5 py-1 text-[12px] font-bold {STATUS[s.status] ?? ''}"
					>{s.status}</span
				>
				<span class="font-mono text-[13px] text-base-content/70"
					>{s.membros}/{s.seats} assentos</span
				>
				<span class="text-[12.5px] text-base-content/65"
					>{s.contractEndsAt
						? `até ${new Date(s.contractEndsAt).toLocaleDateString('pt-BR')}`
						: 'sem fim'}</span
				>
			</a>
		</li>
	{:else}
		<li class="px-4 py-4 text-[13.5px] text-base-content/65">Nenhuma escola ainda.</li>
	{/each}
</ul>
