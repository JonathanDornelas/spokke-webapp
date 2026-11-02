<script lang="ts">
	// Adicionar aluno a uma turma que já existe. **A bandeja fica aberta depois
	// de adicionar**: cadastrar uma turma é um nome depois do outro, e fechar a
	// cada aluno obrigava a reabrir vinte e quatro vezes. Quem já entrou nesta
	// rodada aparece embaixo, para o professor conferir sem fechar.
	import { tick, untrack } from 'svelte';
	import Bandeja from '$lib/components/Bandeja.svelte';
	import Loading from '$lib/components/Loading.svelte';
	import { CLASSE_DA_ETIQUETA, corOuPadrao } from '$lib/etiquetas';
	import { adicionarAluno } from '../turmas.remote';

	let {
		aberta,
		onfechar,
		turma
	}: {
		aberta: boolean;
		onfechar: () => void;
		turma: { id: string; name: string; badge: string; color: string };
	} = $props();

	const formId = $props.id();
	let nome = $state('');
	let email = $state('');
	let entraram = $state<{ name: string; email: string }[]>([]);
	let erro = $state<string | null>(null);
	let campoNome = $state<HTMLInputElement | null>(null);

	$effect(() => {
		if (!aberta) return;
		untrack(() => {
			nome = '';
			email = '';
			entraram = [];
			erro = null;
		});
	});

	const resumo = $derived(
		entraram.length > 0
			? `${entraram.length} ${entraram.length === 1 ? 'aluno entrou' : 'alunos entraram'} nesta rodada. Pode seguir com o próximo.`
			: 'Sem e-mail ele entra na chamada e nos resultados, só não recebe convite.'
	);
</script>

<Bandeja
	{aberta}
	{onfechar}
	titulo="Adicionar aluno"
	descricao="Em {turma.name}. Nome e e-mail, mais nada — e o e-mail é opcional."
	{resumo}
	{erro}
>
	{#snippet marca()}
		<span
			class="grid size-[46px] flex-none place-items-center rounded-[13px] text-[15px] font-bold {CLASSE_DA_ETIQUETA[
				corOuPadrao(turma.color)
			]}"
			aria-hidden="true">{turma.badge}</span
		>
	{/snippet}

	<form
		id={formId}
		{...adicionarAluno.enhance(async ({ submit }) => {
			erro = null;
			const entrou = { name: nome.trim(), email: email.trim() };
			try {
				if ((await submit()) && adicionarAluno.result?.ok) {
					entraram = [entrou, ...entraram];
					nome = '';
					email = '';
					await tick();
					campoNome?.focus();
				}
			} catch {
				erro = 'Não deu para adicionar agora. Tente de novo em instantes.';
			}
		})}
		class="grid gap-5"
	>
		<input type="hidden" name="classroomId" value={turma.id} />
		<label class="fieldset">
			<span class="fieldset-legend">Nome</span>
			<input
				bind:this={campoNome}
				name="name"
				bind:value={nome}
				required
				maxlength="120"
				class="input w-full text-[15px]"
				data-autofoco
			/>
			<span class="fieldset-label">Como você quer ver ele na chamada e nos resultados.</span>
		</label>
		<label class="fieldset">
			<span class="fieldset-legend"
				>E-mail <span class="font-normal text-base-content/60">· opcional</span></span
			>
			<input name="email" type="email" bind:value={email} class="input w-full text-[15px]" />
			<span class="fieldset-label">Para onde vai o link pessoal de cada atividade enviada.</span>
		</label>
	</form>

	{#if entraram.length > 0}
		<section class="mt-7 border-t border-line pt-5" aria-live="polite">
			<h3 class="mb-2.5 text-[13.5px] font-bold">Entraram agora</h3>
			<ul class="grid list-none gap-1.5 p-0">
				{#each entraram as aluno, i (i)}
					<li
						class="flex animate-entrada-curta flex-wrap items-baseline gap-x-2.5 gap-y-0.5 rounded-field bg-base-200 px-3 py-2"
					>
						<span class="text-[13.5px] font-semibold">{aluno.name}</span>
						{#if aluno.email}
							<span class="min-w-0 truncate font-mono text-[12.5px] text-base-content/65"
								>{aluno.email}</span
							>
						{:else}
							<span class="text-[12.5px] text-base-content/65 italic">sem e-mail</span>
						{/if}
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#snippet rodape()}
		<button type="button" onclick={onfechar} class="btn min-h-11 motion-tap btn-plain"
			>{entraram.length > 0 ? 'Concluir' : 'Cancelar'}</button
		>
		<button
			type="submit"
			form={formId}
			disabled={nome.trim().length === 0 || adicionarAluno.pending > 0}
			class="btn min-h-11 motion-tap gap-2 btn-primary font-bold"
		>
			{#if adicionarAluno.pending > 0}<Loading
					variant="fila"
					size={10}
					tone="current"
					label="Adicionando"
				/>{/if}
			Adicionar
		</button>
	{/snippet}
</Bandeja>
