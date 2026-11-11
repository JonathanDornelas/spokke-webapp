<script lang="ts">
	// Editar o cadastro de um aluno — da chamada da turma E da ficha dele
	// (`alunos/[id]`): é o mesmo cadastro, e a mesma bandeja nos dois lugares.
	//
	// **Reenviar é uma escolha visível**, uma caixa no fim do formulário, e não
	// um modo escondido em que o botão "Salvar" passava a reenviar. Ela nasce
	// marcada quando a bandeja abre pelo "Corrigir e-mail e reenviar" — o caso
	// do e-mail que voltou — e só existe para quem já recebeu um convite.
	import { untrack } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import Avatar from '$lib/components/Avatar.svelte';
	import Bandeja from '$lib/components/Bandeja.svelte';
	import Loading from '$lib/components/Loading.svelte';
	import { reenviarConvite, salvarAluno } from './turmas.remote';

	let {
		aberta,
		onfechar,
		aluno,
		corrigindo = false,
		emailDaConta = null,
		onsalvo
	}: {
		aberta: boolean;
		onfechar: () => void;
		aluno: {
			id: string;
			name: string;
			email: string | null;
			avatar: string | null;
			/** O convite mais recente — sem ele não há o que reenviar. */
			inviteId: string | null;
		};
		/** Aberta pelo "Corrigir e-mail e reenviar": o último convite voltou. */
		corrigindo?: boolean;
		/** O e-mail da CONTA do aluno, quando ele ligou uma — pode ser outro. */
		emailDaConta?: string | null;
		/** O que a tela confirma depois de salvar (o reenvio, quando houve). */
		onsalvo?: (aviso: string | null) => void;
	} = $props();

	const formId = $props.id();
	let nome = $state('');
	let email = $state('');
	let reenviar = $state(false);
	let erro = $state<string | null>(null);

	$effect(() => {
		if (!aberta) return;
		untrack(() => {
			nome = aluno.name;
			email = aluno.email ?? '';
			reenviar = corrigindo;
			erro = null;
		});
	});

	const podeReenviar = $derived(aluno.inviteId !== null && email.trim().length > 0);
	const resumo = $derived(
		podeReenviar && reenviar
			? `Ao salvar, o convite sai de novo para ${email.trim()} — o link antigo para de valer.`
			: email.trim()
				? 'O próximo convite vai para este e-mail.'
				: 'Sem e-mail ele continua na chamada e nos resultados, e entra pelo link aberto.'
	);
</script>

<Bandeja
	{aberta}
	{onfechar}
	titulo="Editar cadastro"
	descricao="O nome e o e-mail deste aluno. As respostas dele não mudam."
	{resumo}
	{erro}
>
	{#snippet marca()}
		<Avatar
			codigo={aluno.avatar}
			nome={aluno.name}
			size={46}
			radius="rounded-[13px]"
			class="flex-none"
		/>
	{/snippet}

	{#if corrigindo && aluno.email}
		<div
			class="mb-5 flex gap-2.5 rounded-box border border-error/32 bg-error/8 px-3.5 py-3"
			role="note"
		>
			<svg
				class="mt-px size-4 flex-none text-error"
				viewBox="0 0 24 24"
				fill="none"
				aria-hidden="true"
				><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" /><path
					d="M12 7.5v5.5M12 16.5h.01"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
				/></svg
			>
			<p class="text-[13px] leading-relaxed text-base-content/75">
				O convite para <span class="font-mono font-semibold">{aluno.email}</span> voltou: o servidor recusou
				a entrega e nada chegou. Corrija o endereço abaixo.
			</p>
		</div>
	{/if}

	<form
		id={formId}
		{...salvarAluno.enhance(async ({ submit }) => {
			erro = null;
			try {
				await submit();
				if (!salvarAluno.result?.ok) {
					erro = 'Não deu para salvar. Confira os campos e tente de novo.';
					return;
				}
				let aviso: string | null = null;
				if (reenviar && podeReenviar && aluno.inviteId) {
					const r = await reenviarConvite({ inviteId: aluno.inviteId });
					aviso = r.ok
						? `Convite reenviado para ${nome.trim()} · a fila está andando`
						: (r.error ?? null);
					await invalidateAll();
				}
				onsalvo?.(aviso);
				onfechar();
			} catch {
				erro = 'Não deu para salvar agora. Tente de novo em instantes.';
			}
		})}
		class="grid gap-5"
	>
		<input type="hidden" name="studentId" value={aluno.id} />
		<label class="fieldset">
			<span class="fieldset-legend">Nome</span>
			<input
				name="name"
				bind:value={nome}
				required
				maxlength="120"
				class="input w-full text-[15px]"
				data-autofoco={corrigindo ? undefined : true}
			/>
		</label>
		<label class="fieldset">
			<span class="fieldset-legend"
				>E-mail <span class="font-normal text-base-content/60">· opcional</span></span
			>
			<input
				name="email"
				type="email"
				bind:value={email}
				placeholder="sem e-mail"
				class="input w-full font-mono text-[14px]"
				data-autofoco={corrigindo ? true : undefined}
			/>
			<span class="fieldset-label">É para onde vai o link pessoal de cada atividade enviada.</span>
		</label>

		{#if emailDaConta}
			<!-- Os dois e-mails são verdade: o professor digitou um, o aluno
			     cadastrou outro na conta dele (paginas.md "Turmas e alunos"). -->
			<p
				class="rounded-box bg-base-200 px-3.5 py-3 text-[12.5px] leading-relaxed text-base-content/70"
			>
				Na conta do aluno o e-mail é <span class="font-mono font-semibold">{emailDaConta}</span>. O
				convite vai para o do cadastro; para entrar na conta, vale o da conta.
			</p>
		{/if}

		{#if aluno.inviteId}
			<label
				class="flex cursor-pointer items-start gap-3 rounded-box border border-line px-3.5 py-3 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60"
			>
				<input
					type="checkbox"
					bind:checked={reenviar}
					disabled={!podeReenviar}
					class="mt-0.5 checkbox checkbox-primary"
				/>
				<span class="min-w-0">
					<span class="block text-[13.5px] font-semibold">Reenviar o convite ao salvar</span>
					<span class="block text-[12.5px] leading-snug text-base-content/65">
						{podeReenviar
							? 'Sai um link novo para o e-mail acima; o antigo para de valer.'
							: 'Precisa de um e-mail para reenviar.'}
					</span>
				</span>
			</label>
		{/if}
	</form>

	{#snippet rodape()}
		<button type="button" onclick={onfechar} class="btn min-h-11 motion-tap btn-plain"
			>Cancelar</button
		>
		<button
			type="submit"
			form={formId}
			disabled={nome.trim().length === 0 || salvarAluno.pending > 0}
			class="btn min-h-11 motion-tap gap-2 btn-primary font-bold"
		>
			{#if salvarAluno.pending > 0}<Loading
					variant="fila"
					size={10}
					tone="current"
					label="Salvando"
				/>{/if}
			{reenviar && podeReenviar ? 'Salvar e reenviar' : 'Salvar'}
		</button>
	{/snippet}
</Bandeja>
