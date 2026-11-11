<script lang="ts">
	// Ligar (e desligar) o Google numa conta que já existe — na Conta do
	// professor e na área do aluno. É o caminho seguro para quem criou a conta
	// com senha: a sessão aberta prova que a conta é dela, o Google prova o
	// e-mail, e o Better Auth exige que os dois e-mails sejam o mesmo
	// (`server/auth/google.ts`). Entrar pelo Google numa conta com senha NÃO liga
	// sozinho — a tela de entrar manda para cá.
	//
	// Desligar só aparece quando sobra outro jeito de entrar (a senha): tirar a
	// única porta deixaria a conta trancada.
	import { page } from '$app/state';
	import { invalidateAll } from '$app/navigation';
	import Loading from './Loading.svelte';
	import { authClient } from '$lib/client/auth';
	import { authAlunoClient } from '$lib/client/auth-aluno';

	let {
		como,
		email,
		ligado,
		temSenha,
		aqui
	}: {
		como: 'professor' | 'aluno';
		email: string;
		/** A conta já entra pelo Google. */
		ligado: boolean;
		/** A conta também tem senha — é o que permite desligar o Google. */
		temSenha: boolean;
		/** O caminho desta tela: a volta do Google cai aqui, com `?google=…`. */
		aqui: string;
	} = $props();

	let ocupado = $state(false);
	let erro = $state<string | null>(null);

	const cliente = $derived(como === 'aluno' ? authAlunoClient : authClient);

	/** O que a volta do Google trouxe, quando foi ele que trouxe a pessoa aqui. */
	const volta = $derived.by(() => {
		const google = page.url.searchParams.get('google');
		if (google === 'ligado')
			return { ok: true, texto: 'Pronto: agora você também entra pelo Google.' };
		if (google !== 'erro') return null;
		const codigo = page.url.searchParams.get('error');
		const texto =
			codigo === 'email_does_not_match'
				? `A conta Google escolhida tem outro e-mail. Use a conta Google de ${email}.`
				: codigo === 'account_already_linked_to_different_user'
					? 'Essa conta Google já entra em outra conta do Spokke.'
					: codigo === 'access_denied'
						? 'A ligação com o Google foi cancelada.'
						: 'Não deu para ligar o Google agora. Tente de novo em instantes.';
		return { ok: false, texto };
	});

	async function ligar() {
		if (ocupado) return;
		ocupado = true;
		erro = null;
		const { error } = await cliente.linkSocial({
			provider: 'google',
			callbackURL: `${aqui}?google=ligado`,
			errorCallbackURL: `${aqui}?google=erro`
		});
		// Sem erro, o navegador já está indo para o Google.
		if (error) {
			ocupado = false;
			erro = 'Não deu para chegar ao Google agora. Tente de novo em instantes.';
		}
	}

	async function desligar() {
		if (ocupado) return;
		ocupado = true;
		erro = null;
		// Desligar pede o id da LINHA da conta (não o do Google): quem sabe qual é
		// a lista das portas desta conta, que o próprio Better Auth devolve.
		const { data: contas } = await cliente.listAccounts();
		const doGoogle = contas?.find((c) => c.providerId === 'google');
		const { error } = doGoogle
			? await cliente.unlinkAccount({ accountId: doGoogle.id })
			: { error: true };
		if (error) erro = 'Não deu para desligar o Google agora. Tente de novo em instantes.';
		else await invalidateAll();
		ocupado = false;
	}
</script>

{#if ligado}
	<p class="mb-4 text-[13px] leading-relaxed text-pretty text-base-content/65">
		Ligado: você entra pelo Google com <strong class="font-semibold text-base-content"
			>{email}</strong
		>{temSenha ? ', ou com a sua senha.' : '.'}
		{#if !temSenha}
			É a única forma de entrar nesta conta, então ele não desliga daqui.
		{/if}
	</p>
	{#if temSenha}
		<button
			type="button"
			onclick={desligar}
			disabled={ocupado}
			class="btn min-h-11 w-full motion-tap gap-2 btn-neutral font-semibold"
		>
			{#if ocupado}
				<Loading variant="fila" size={10} tone="current" label="Desligando" />
			{/if}
			Desligar o Google
		</button>
	{/if}
{:else}
	<p class="mb-4 text-[13px] leading-relaxed text-pretty text-base-content/65">
		Entre sem digitar a senha, com a conta Google de
		<strong class="font-semibold text-base-content">{email}</strong>. Só vale o mesmo e-mail desta
		conta.
	</p>
	<button
		type="button"
		onclick={ligar}
		disabled={ocupado}
		class="btn min-h-11 w-full motion-tap gap-2.5 btn-neutral font-semibold"
	>
		{#if ocupado}
			<Loading variant="fila" size={10} tone="current" label="Indo para o Google" />
			Indo para o Google…
		{:else}
			<img src="/marcas/google.svg" alt="" width="16" height="16" class="size-4" />
			Ligar o Google
		{/if}
	</button>
{/if}

{#if erro}
	<p class="mt-3 text-[13px] font-semibold text-error" role="alert">{erro}</p>
{:else if volta}
	<p
		class="mt-3 text-[13px] font-semibold {volta.ok ? 'text-primary' : 'text-error'}"
		role={volta.ok ? 'status' : 'alert'}
	>
		{volta.texto}
	</p>
{/if}
