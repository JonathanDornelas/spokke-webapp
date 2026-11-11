<script lang="ts">
	// Uma escola no painel interno: o contrato (assentos, limites por professor,
	// vigência, status), os membros com as EXCEÇÕES de limite de cada um, e o
	// convite — é por aqui que entra a primeira pessoa da coordenação.
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Loading from '$lib/components/Loading.svelte';
	import {
		convidarParaEscolaAdmin,
		definirExcecaoAdmin,
		editarEscolaAdmin,
		removerDaEscolaAdmin
	} from '../../admin.remote';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const iso = (d: Date | string | null) => (d ? new Date(d).toISOString().slice(0, 10) : '');

	// $state + efeito, e não derived gravável: o formulário faz `bind:value` em
	// campos ANINHADOS, e só o $state é proxy profundo.
	// Nasce vazio e é preenchido pelo efeito — que também o refaz depois de
	// salvar (`invalidateAll`), em vez de guardar só o valor da primeira carga.
	// eslint-disable-next-line svelte/prefer-writable-derived -- bind:value em campos aninhados pede o proxy profundo do $state.
	let form = $state({
		id: '',
		name: '',
		status: 'ativa' as 'ativa' | 'suspensa' | 'encerrada',
		seats: 1,
		atividadesPorProfessor: 0,
		materiaisPorProfessor: 0,
		creditosPorProfessor: 0,
		contractEndsAt: null as Date | null,
		ate: ''
	});
	$effect(() => {
		form = { ...data.escola, ate: iso(data.escola.contractEndsAt) };
	});

	let pendente = $state<string | null>(null);
	let mensagem = $state<{ ok: boolean; texto: string } | null>(null);

	async function rodar(qual: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
		pendente = qual;
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

	function salvarContrato() {
		return rodar('contrato', () =>
			editarEscolaAdmin({
				schoolId: data.escola.id,
				name: form.name,
				seats: Number(form.seats),
				atividadesPorProfessor: Number(form.atividadesPorProfessor),
				materiaisPorProfessor: Number(form.materiaisPorProfessor),
				creditosPorProfessor: Number(form.creditosPorProfessor),
				contractEndsAt: form.ate || undefined,
				status: form.status
			})
		);
	}

	let email = $state('');
	let papel = $state<'coordenacao' | 'professor'>('coordenacao');

	/** Campo vazio = sem exceção (vale o padrão da escola). */
	const numeroOuNulo = (v: string) => (v.trim() === '' ? null : Number(v));
	// eslint-disable-next-line svelte/prefer-writable-derived -- bind:value em campos aninhados pede o proxy profundo do $state.
	let excecoes = $state<Record<string, { a: string; m: string; c: string }>>({});
	$effect(() => {
		excecoes = Object.fromEntries(
			data.membros.map((m) => [
				m.id,
				{
					a: m.atividadesMax?.toString() ?? '',
					m: m.materiaisMax?.toString() ?? '',
					c: m.creditosMax?.toString() ?? ''
				}
			])
		);
	});
</script>

<svelte:head><title>{data.escola.name} · Painel interno · Spokke</title></svelte:head>

<h1 class="mb-1 font-display text-title font-semibold tracking-[-0.022em]">{data.escola.name}</h1>
<p class="mb-6 text-[13.5px] text-base-content/65">
	{data.membros.length}/{data.escola.seats} assentos ·
	<a href={resolve('/(admin)/admin/escolas')}>todas as escolas</a>
</p>

{#if mensagem}
	<p
		class="mb-4 text-[13.5px] font-semibold {mensagem.ok ? 'text-success' : 'text-error'}"
		role="status"
	>
		{mensagem.texto}
	</p>
{/if}

<div class="grid gap-6 lg:grid-cols-2">
	<section class="rounded-box border border-line bg-card px-4 py-4 lg:px-5">
		<h2 class="mb-3 font-display text-section font-semibold">Contrato</h2>
		<div class="grid gap-3 sm:grid-cols-2">
			<label class="block text-[12.5px] font-semibold sm:col-span-2">
				Nome
				<input bind:value={form.name} class="mt-1 input w-full" />
			</label>
			<label class="block text-[12.5px] font-semibold">
				Status
				<select bind:value={form.status} class="mt-1 select w-full">
					<option value="ativa">ativa</option>
					<option value="suspensa">suspensa</option>
					<option value="encerrada">encerrada</option>
				</select>
			</label>
			<label class="block text-[12.5px] font-semibold">
				Contrato até
				<input type="date" bind:value={form.ate} class="mt-1 input w-full" />
			</label>
			<label class="block text-[12.5px] font-semibold">
				Assentos
				<input type="number" min="1" bind:value={form.seats} class="mt-1 input w-full" />
			</label>
			<label class="block text-[12.5px] font-semibold">
				Atividades por professor
				<input
					type="number"
					min="0"
					bind:value={form.atividadesPorProfessor}
					class="mt-1 input w-full"
				/>
			</label>
			<label class="block text-[12.5px] font-semibold">
				Materiais por professor
				<input
					type="number"
					min="0"
					bind:value={form.materiaisPorProfessor}
					class="mt-1 input w-full"
				/>
			</label>
			<label class="block text-[12.5px] font-semibold">
				Créditos de IA por mês
				<input
					type="number"
					min="0"
					bind:value={form.creditosPorProfessor}
					class="mt-1 input w-full"
				/>
			</label>
		</div>
		<p class="mt-3 text-[12px] text-base-content/65">
			Suspensa, encerrada ou vencida: os membros voltam ao próprio plano. Nada é apagado e nenhum
			link sai do ar.
		</p>
		<button
			type="button"
			onclick={salvarContrato}
			disabled={pendente !== null}
			class="mt-3 btn min-h-11 motion-tap gap-2 btn-primary font-bold"
		>
			{#if pendente === 'contrato'}<Loading
					variant="fila"
					size={10}
					tone="current"
					label="Salvando"
				/>{/if}
			Salvar contrato
		</button>
	</section>

	<section class="rounded-box border border-line bg-card px-4 py-4 lg:px-5">
		<h2 class="mb-1 font-display text-section font-semibold">Convidar</h2>
		<p class="mb-3 text-[13px] text-base-content/65">
			O e-mail leva um link de uso único, válido por 7 dias. Comece pela coordenação: é ela que
			convida os professores.
		</p>
		<div class="flex flex-wrap items-end gap-2">
			<label class="block min-w-[220px] flex-1 text-[12.5px] font-semibold">
				E-mail
				<input type="email" bind:value={email} class="mt-1 input w-full" />
			</label>
			<label class="block text-[12.5px] font-semibold">
				Papel
				<select bind:value={papel} class="mt-1 select">
					<option value="coordenacao">coordenação</option>
					<option value="professor">professor</option>
				</select>
			</label>
			<button
				type="button"
				disabled={pendente !== null || !email.includes('@')}
				onclick={() =>
					rodar('convidar', async () => {
						const r = await convidarParaEscolaAdmin({
							schoolId: data.escola.id,
							email,
							role: papel
						});
						if (r.ok) email = '';
						return r;
					})}
				class="btn min-h-11 motion-tap gap-2 btn-primary font-bold"
			>
				{#if pendente === 'convidar'}<Loading
						variant="fila"
						size={10}
						tone="current"
						label="Convidando"
					/>{/if}
				Convidar
			</button>
		</div>
		{#if data.convites.length > 0}
			<ul class="mt-4 grid gap-1 text-[13px]">
				{#each data.convites as c (c.id)}
					<li class="flex flex-wrap justify-between gap-2">
						<span>{c.email} · {c.role}</span>
						<span class="text-base-content/65"
							>{c.sentAt ? 'enviado' : 'na fila'} · vence {new Date(c.expiresAt).toLocaleDateString(
								'pt-BR'
							)}</span
						>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>

<section class="mt-6">
	<h2 class="mb-1 font-display text-section font-semibold">Membros</h2>
	<p class="mb-3 text-[13px] text-base-content/65">
		Exceção de limite: em branco vale o padrão da escola.
	</p>
	<div class="overflow-x-auto rounded-box border border-line bg-card">
		<table class="w-full min-w-[760px] text-left text-[13.5px]">
			<thead class="border-b border-line text-[12px] text-base-content/65">
				<tr>
					<th class="px-4 py-2.5 font-semibold">Professor</th>
					<th class="px-4 py-2.5 font-semibold">Papel</th>
					<th class="px-4 py-2.5 font-semibold">Atividades</th>
					<th class="px-4 py-2.5 font-semibold">Materiais</th>
					<th class="px-4 py-2.5 font-semibold">Créditos</th>
					<th class="px-4 py-2.5"></th>
				</tr>
			</thead>
			<tbody>
				{#each data.membros as m (m.id)}
					<tr class="border-b border-line last:border-0">
						<td class="px-4 py-3">
							<a
								href={resolve('/(admin)/admin/professores/[id]', { id: m.teacher.id })}
								class="font-semibold">{m.teacher.name}</a
							>
							<span class="block text-[12px] text-base-content/65">{m.teacher.email}</span>
						</td>
						<td class="px-4 py-3">{m.role}</td>
						{#if excecoes[m.id]}
							<td class="px-4 py-3">
								<input
									bind:value={excecoes[m.id].a}
									placeholder={String(data.escola.atividadesPorProfessor)}
									aria-label="Exceção de atividades"
									class="input h-9 min-h-9 w-24"
								/>
							</td>
							<td class="px-4 py-3">
								<input
									bind:value={excecoes[m.id].m}
									placeholder={String(data.escola.materiaisPorProfessor)}
									aria-label="Exceção de materiais"
									class="input h-9 min-h-9 w-24"
								/>
							</td>
							<td class="px-4 py-3">
								<input
									bind:value={excecoes[m.id].c}
									placeholder={String(data.escola.creditosPorProfessor)}
									aria-label="Exceção de créditos"
									class="input h-9 min-h-9 w-24"
								/>
							</td>
						{/if}
						<td class="px-4 py-3 whitespace-nowrap">
							<button
								type="button"
								disabled={pendente !== null}
								onclick={() =>
									rodar(`exc-${m.id}`, () =>
										definirExcecaoAdmin({
											membershipId: m.id,
											atividadesMax: numeroOuNulo(excecoes[m.id].a),
											materiaisMax: numeroOuNulo(excecoes[m.id].m),
											creditosMax: numeroOuNulo(excecoes[m.id].c)
										})
									)}
								class="btn btn-sm min-h-9 btn-plain">Salvar</button
							>
							<button
								type="button"
								disabled={pendente !== null}
								onclick={() =>
									rodar(`rm-${m.id}`, () =>
										removerDaEscolaAdmin({ schoolId: data.escola.id, teacherId: m.teacher.id })
									)}
								class="btn btn-sm min-h-9 btn-outline-error">Remover</button
							>
						</td>
					</tr>
				{:else}
					<tr><td colspan="6" class="px-4 py-4 text-base-content/65">Nenhum membro ainda.</td></tr>
				{/each}
			</tbody>
		</table>
	</div>
</section>
