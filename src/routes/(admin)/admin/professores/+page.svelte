<script lang="ts">
	// A lista de professores do painel interno: conta, plano, situação e o
	// tamanho do que cada um guarda. Nada de dado de aluno (repos/admin.ts).
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const SITUACAO: Record<string, { texto: string; classe: string }> = {
		trial: { texto: 'trial', classe: 'bg-base-300 text-primary' },
		ativa: { texto: 'ativa', classe: 'bg-success/13 text-success' },
		atrasada: { texto: 'atrasada', classe: 'bg-warning/15 text-warning' },
		cancelada: { texto: 'cancelada', classe: 'bg-base-200 text-base-content/65' },
		expirada: { texto: 'pausada', classe: 'bg-error/13 text-error' }
	};
</script>

<svelte:head><title>Professores · Painel interno · Spokke</title></svelte:head>

<h1 class="mb-5 font-display text-title font-semibold tracking-[-0.022em]">Professores</h1>

<form method="GET" class="mb-5 flex max-w-[520px] gap-2">
	<label class="sr-only" for="busca-prof">Buscar por nome, e-mail ou id</label>
	<input
		id="busca-prof"
		name="q"
		value={data.busca}
		placeholder="Nome, e-mail ou id"
		class="input w-full"
	/>
	<button type="submit" class="btn min-h-11 motion-tap btn-primary font-bold">Buscar</button>
</form>

<div class="overflow-x-auto rounded-box border border-line bg-card">
	<table class="w-full min-w-[720px] text-left text-[13.5px]">
		<thead class="border-b border-line text-[12px] text-base-content/65">
			<tr>
				<th class="px-4 py-2.5 font-semibold">Professor</th>
				<th class="px-4 py-2.5 font-semibold">Plano</th>
				<th class="px-4 py-2.5 font-semibold">Situação</th>
				<th class="px-4 py-2.5 font-semibold">Atividades</th>
				<th class="px-4 py-2.5 font-semibold">Materiais</th>
				<th class="px-4 py-2.5 font-semibold">Desde</th>
			</tr>
		</thead>
		<tbody>
			{#each data.professores as p (p.id)}
				<tr class="border-b border-line last:border-0 hover:bg-base-200">
					<td class="px-4 py-3">
						<a href={resolve('/(admin)/admin/professores/[id]', { id: p.id })} class="font-semibold"
							>{p.name}</a
						>
						<span class="block text-[12.5px] text-base-content/65">{p.email}</span>
					</td>
					<td class="px-4 py-3">{p.plano ?? '—'}</td>
					<td class="px-4 py-3">
						<span
							class="rounded-full px-2.5 py-1 text-[12px] font-bold {SITUACAO[p.situacao].classe}"
							>{SITUACAO[p.situacao].texto}</span
						>
					</td>
					<td class="px-4 py-3 font-mono">{p.atividades}</td>
					<td class="px-4 py-3 font-mono">{p.materiais}</td>
					<td class="px-4 py-3 text-base-content/65"
						>{new Date(p.desde).toLocaleDateString('pt-BR')}</td
					>
				</tr>
			{:else}
				<tr>
					<td colspan="6" class="px-4 py-4 text-base-content/65">Ninguém encontrado.</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>
<p class="mt-2 text-[12px] text-base-content/60">Mostrando até 50, os mais recentes primeiro.</p>
