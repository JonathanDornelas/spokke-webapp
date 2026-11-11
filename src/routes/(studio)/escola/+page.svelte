<script lang="ts">
	// A área da COORDENAÇÃO da escola (plano Scholar — docs/adr-005-escola.md).
	// Em ordem de pergunta: quanto do contrato estamos usando, quem são os
	// professores e como cada um está no limite, como vão as turmas — e convidar.
	//
	// **Só números.** A coordenação vê, por turma, quantos alunos, envios,
	// tentativas e o acerto médio — nunca o nome de um aluno nem uma resposta
	// (decisão do dono do repositório). A tela diz isso, para ninguém procurar.
	//
	// Convidar abre uma BANDEJA (components.md "Bandeja"), como todo formulário
	// de criar do Studio; a coluna da direita fica com os assentos e os
	// convites em aberto, que é o que se confere antes e depois de convidar.
	import { marcarVisto } from '$lib/client/avisos';
	import { invalidateAll } from '$app/navigation';
	import Avatar from '$lib/components/Avatar.svelte';
	import Bandeja from '$lib/components/Bandeja.svelte';
	import HeaderCard from '$lib/components/HeaderCard.svelte';
	import Loading from '$lib/components/Loading.svelte';
	import { fracaoDeUso } from '$lib/billing/resumo';
	import { convidarProfessor, removerProfessor, revogarConvite } from './escola.remote';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let email = $state('');
	let papel = $state<'professor' | 'coordenacao'>('professor');
	let pendente = $state<string | null>(null);
	let mensagem = $state<{ ok: boolean; texto: string } | null>(null);
	let convidando = $state(false);
	let erroConvite = $state<string | null>(null);
	const emailValido = $derived(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()));

	function abrirConvite() {
		email = '';
		papel = 'professor';
		erroConvite = null;
		convidando = true;
	}
	async function convidar(e: SubmitEvent) {
		e.preventDefault();
		if (!emailValido || pendente !== null) return;
		pendente = 'convidar';
		erroConvite = null;
		try {
			const r = await convidarProfessor({ email: email.trim(), role: papel });
			if (!r.ok) {
				erroConvite = r.error ?? 'Não deu para convidar.';
				return;
			}
			mensagem = { ok: true, texto: `Convite para ${email.trim()} na fila de e-mail.` };
			convidando = false;
			await invalidateAll();
		} catch {
			erroConvite = 'Não deu para convidar agora. Tente de novo em instantes.';
		} finally {
			pendente = null;
		}
	}

	const PAPEIS = [
		{
			id: 'professor' as const,
			titulo: 'Professor',
			texto: 'Cria e envia as próprias atividades, dentro dos limites do contrato.'
		},
		{
			id: 'coordenacao' as const,
			titulo: 'Coordenação',
			texto:
				'Também vê os números da escola e convida professores. Nunca vê nome de aluno nem resposta.'
		}
	];

	async function rodar(
		qual: string,
		fn: () => Promise<{ ok: boolean; error?: string }>,
		sucesso: string
	) {
		pendente = qual;
		mensagem = null;
		try {
			const r = await fn();
			mensagem = r.ok ? { ok: true, texto: sucesso } : { ok: false, texto: r.error ?? 'Não deu.' };
			await invalidateAll();
		} catch {
			mensagem = { ok: false, texto: 'Não deu para concluir agora. Tente de novo em instantes.' };
		} finally {
			pendente = null;
		}
	}

	const assentosLivres = $derived(data.resumo.assentos - data.resumo.ocupados);

	// Abrir a escola conta como ver quem entrou nela (docs/notificacoes.md).
	$effect(() => {
		marcarVisto({ secao: 'escola' });
	});
</script>

<svelte:head><title>Escola · Spokke</title></svelte:head>

<div class="pagina-studio">
	<HeaderCard
		numbers={[
			{ value: `${data.resumo.ocupados}/${data.resumo.assentos}`, label: 'assentos' },
			{ value: data.professores.length, label: 'professores', tone: 'primary' },
			{ value: data.turmas.length, label: 'turmas' },
			{ value: data.convites.length, label: 'convites em aberto' }
		]}
	>
		<p class="text-[12px] font-bold tracking-[0.09em] text-base-content/60 uppercase">Escola</p>
		<h1 class="font-display text-[22px] font-semibold tracking-[-0.022em] lg:text-[28px]">
			{data.resumo.nome}
		</h1>
		<p class="text-[13.5px] text-base-content/65">
			Por professor: {data.resumo.limites.atividades} atividades · {data.resumo.limites.materiais} materiais
			· {data.resumo.limites.creditos} créditos de IA por mês{data.resumo.contratoAte
				? ` · contrato até ${new Date(data.resumo.contratoAte).toLocaleDateString('pt-BR')}`
				: ''}
		</p>
		{#snippet actions()}
			<button
				type="button"
				onclick={abrirConvite}
				aria-haspopup="dialog"
				class="btn h-[42px] motion-tap gap-2 btn-primary text-[13.5px] font-bold"
			>
				<svg class="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<path
						d="M12 5v14M5 12h14"
						stroke="currentColor"
						stroke-width="2.2"
						stroke-linecap="round"
					/>
				</svg>
				Convidar
			</button>
		{/snippet}
	</HeaderCard>

	{#if mensagem}
		<p
			class="mt-4 text-[13.5px] font-semibold {mensagem.ok ? 'text-primary' : 'text-error'}"
			role="status"
		>
			{mensagem.texto}
		</p>
	{/if}

	<div class="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
		<section>
			<h2 class="mb-1 font-display text-section font-semibold">Professores</h2>
			<p class="mb-3 text-[13px] text-base-content/65">
				o uso de cada um contra o limite do contrato
			</p>
			<ul class="grid list-none gap-2.5 p-0">
				{#each data.professores as p (p.id)}
					<li class="rounded-box border border-line bg-card px-4 py-3.5">
						<div class="flex flex-wrap items-start gap-x-3 gap-y-1">
							<Avatar
								codigo={p.avatar}
								nome={p.name}
								size={34}
								radius="rounded-full"
								class="shrink-0"
							/>
							<div class="min-w-0 flex-1">
								<p class="font-semibold">
									{p.name}
									{#if p.role === 'coordenacao'}
										<span
											class="ms-1 rounded-full bg-base-300 px-2 py-0.5 text-[11px] font-bold text-primary"
											>coordenação</span
										>
									{/if}
								</p>
								<p class="text-[12.5px] text-base-content/65">
									{p.email} · {p.turmas}
									{p.turmas === 1 ? 'turma' : 'turmas'} · {p.noAr} no ar
								</p>
							</div>
							{#if p.id !== data.euId}
								<button
									type="button"
									disabled={pendente !== null}
									onclick={() =>
										rodar(
											`rm-${p.id}`,
											() => removerProfessor({ teacherId: p.id }),
											`${p.name} saiu da escola.`
										)}
									class="btn btn-sm min-h-9 btn-plain text-[12.5px]">Tirar da escola</button
								>
							{/if}
						</div>
						<dl class="mt-2.5 grid gap-2 sm:grid-cols-3">
							{#each [{ nome: 'Atividades', usado: p.uso.atividades, limite: p.limites.atividades }, { nome: 'Materiais', usado: p.uso.materiais, limite: p.limites.materiais }, { nome: 'Créditos (saldo)', usado: p.creditos.saldo, limite: p.creditos.porCiclo }] as linha (linha.nome)}
								<div>
									<div class="flex justify-between text-[12px]">
										<dt class="text-base-content/65">{linha.nome}</dt>
										<dd class="font-mono">{linha.usado}/{linha.limite}</dd>
									</div>
									<div
										class="mt-1 h-[5px] overflow-hidden rounded-full bg-base-300"
										aria-hidden="true"
									>
										<div
											class="h-full origin-left rounded-full bg-primary"
											style="transform: scaleX({fracaoDeUso(linha.usado, linha.limite)})"
										></div>
									</div>
								</div>
							{/each}
						</dl>
					</li>
				{/each}
			</ul>

			<h2 class="mt-8 mb-1 font-display text-section font-semibold">Turmas</h2>
			<p class="mb-3 text-[13px] text-base-content/65">
				só números — a coordenação não vê nome de aluno nem resposta
			</p>
			<div class="overflow-x-auto rounded-box border border-line bg-card">
				<table class="w-full min-w-[620px] text-left text-[13.5px]">
					<thead class="border-b border-line text-[12px] text-base-content/65">
						<tr>
							<th class="px-4 py-2.5 font-semibold">Turma</th>
							<th class="px-4 py-2.5 font-semibold">Professor</th>
							<th class="px-4 py-2.5 font-semibold">Alunos</th>
							<th class="px-4 py-2.5 font-semibold">Envios</th>
							<th class="px-4 py-2.5 font-semibold">Terminadas</th>
							<th class="px-4 py-2.5 font-semibold">Acerto médio</th>
						</tr>
					</thead>
					<tbody>
						{#each data.turmas as t (t.id)}
							<tr class="border-b border-line last:border-0">
								<td class="px-4 py-3 font-semibold">{t.name}</td>
								<td class="px-4 py-3 text-base-content/70">{t.professor}</td>
								<td class="px-4 py-3 font-mono">{t.alunos}</td>
								<td class="px-4 py-3 font-mono">{t.envios}</td>
								<td class="px-4 py-3 font-mono">{t.terminadas}/{t.tentativas}</td>
								<td
									class="px-4 py-3 font-mono {t.acertoMedio !== null
										? 'text-primary'
										: 'text-base-content/50'}"
									>{t.acertoMedio !== null ? `${t.acertoMedio}%` : '—'}</td
								>
							</tr>
						{:else}
							<tr
								><td colspan="6" class="px-4 py-4 text-base-content/65">Nenhuma turma ainda.</td
								></tr
							>
						{/each}
					</tbody>
				</table>
			</div>
		</section>

		<aside class="grid content-start gap-4">
			<section class="rounded-box border border-line bg-card px-4 py-4">
				<h2 class="mb-1 font-display text-[20px] font-semibold">Convites em aberto</h2>
				<p class="mb-3 text-[12.5px] text-base-content/65">
					{assentosLivres > 0
						? `${assentosLivres} ${assentosLivres === 1 ? 'assento livre' : 'assentos livres'}. Cada convite vale 7 dias.`
						: 'Todos os assentos estão ocupados — fale com a equipe para ampliar o contrato.'}
				</p>
				{#if data.convites.length > 0}
					<ul class="grid list-none gap-2 p-0 text-[12.5px]">
						{#each data.convites as c (c.id)}
							<li class="flex items-center justify-between gap-2">
								<span class="min-w-0 truncate"
									>{c.email} · {c.role === 'coordenacao' ? 'coordenação' : 'professor'}</span
								>
								<button
									type="button"
									disabled={pendente !== null}
									onclick={() =>
										rodar(
											`rv-${c.id}`,
											() => revogarConvite({ inviteId: c.id }),
											'Convite revogado.'
										)}
									class="shrink-0 font-bold text-error">Revogar</button
								>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="text-[12.5px] text-base-content/65">Nenhum convite esperando resposta.</p>
				{/if}
				<button
					type="button"
					onclick={abrirConvite}
					aria-haspopup="dialog"
					disabled={assentosLivres <= 0}
					class="mt-4 btn min-h-11 w-full motion-tap btn-outline font-bold">Convidar alguém</button
				>
			</section>
		</aside>
	</div>
</div>

<Bandeja
	aberta={convidando}
	onfechar={() => (convidando = false)}
	titulo="Convidar para a escola"
	descricao="Quem aceitar passa a usar o plano da escola. O conteúdo de cada professor continua dele."
	resumo={assentosLivres <= 0
		? 'Sem assento livre: o convite não pode sair.'
		: emailValido
			? `O convite vai para ${email.trim()} e vale 7 dias.`
			: `${assentosLivres} ${assentosLivres === 1 ? 'assento livre' : 'assentos livres'}. O convite chega por e-mail e vale 7 dias.`}
	erro={erroConvite}
>
	<form id="convite-escola" onsubmit={convidar} class="grid gap-6">
		<label class="fieldset">
			<span class="fieldset-legend">E-mail</span>
			<input
				type="email"
				bind:value={email}
				required
				placeholder="professora@escola.com.br"
				class="input w-full text-[15px]"
				data-autofoco
			/>
			<span class="fieldset-label">O link de aceite vai para este endereço.</span>
		</label>

		<fieldset class="fieldset border-0 p-0">
			<legend class="mb-1.5 fieldset-legend">Papel</legend>
			<div class="grid gap-2">
				{#each PAPEIS as p (p.id)}
					<label
						class="flex cursor-pointer items-start gap-3 rounded-box border-[1.5px] border-line bg-base-100 px-3.5 py-3 transition-colors hover:border-primary/60 has-[:checked]:border-primary has-[:checked]:bg-primary/6"
					>
						<input type="radio" name="papel" value={p.id} bind:group={papel} class="mt-0.5 radio" />
						<span class="min-w-0">
							<span class="block text-[14px] font-bold">{p.titulo}</span>
							<span class="block text-[12.5px] leading-snug text-base-content/65">{p.texto}</span>
						</span>
					</label>
				{/each}
			</div>
		</fieldset>
	</form>

	{#snippet rodape()}
		<button
			type="button"
			onclick={() => (convidando = false)}
			class="btn min-h-11 motion-tap btn-plain">Cancelar</button
		>
		<button
			type="submit"
			form="convite-escola"
			disabled={pendente !== null || !emailValido || assentosLivres <= 0}
			class="btn min-h-11 motion-tap gap-2 btn-primary font-bold"
		>
			{#if pendente === 'convidar'}<Loading
					variant="fila"
					size={10}
					tone="current"
					label="Convidando"
				/>{/if}
			Enviar convite
		</button>
	{/snippet}
</Bandeja>
