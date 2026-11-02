<script lang="ts">
	import Alternador from '$lib/components/Alternador.svelte';
	import { caminhoInterno } from '$lib/caminho-interno';
	import { goto } from '$app/navigation';
	import Loading from '$lib/components/Loading.svelte';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { authClient } from '$lib/client/auth';
	import { authAlunoClient } from '$lib/client/auth-aluno';

	// Entrar — professor OU aluno, numa tela só, com um seletor no topo. São
	// duas contas diferentes por baixo (auth.md: duas instâncias de Better Auth,
	// cookies e tabelas separados), mas quem chega em "/entrar" não quer saber
	// disso: quer dizer quem é e entrar. O seletor troca o cliente, a copy e o
	// destino — nunca mistura as duas sessões.
	//
	// A mensagem de erro é GENÉRICA de propósito: nunca revela se um e-mail tem
	// conta (paginas.md "Regras que atravessam várias telas").
	type Como = 'professor' | 'aluno';

	// `?como=aluno` pré-seleciona o aluno — é como o Player e a área do aluno
	// chegam aqui. Sem o parâmetro, professor: é quem digita o endereço na mão.
	let como = $state<Como>(page.url.searchParams.get('como') === 'aluno' ? 'aluno' : 'professor');

	let email = $state('');
	let password = $state('');
	let loading = $state(false);
	let error = $state(false);

	// Só aceita caminho interno de um único "/" (nunca "//host" — isso seria
	// redirect aberto: o parâmetro vem da query string, então qualquer um pode
	// forjar um link de "entrar" apontando pra fora daqui). `redirectTo` vem do
	// guard do Studio em hooks.server.ts; `voltar` vem do Player.
	const redirectTo = $derived(caminhoInterno(page.url.searchParams.get('redirectTo')));
	/** Chegou aqui depois de criar uma senha nova em "esqueci a senha". */
	const senhaNova = $derived(page.url.searchParams.get('senha') === 'nova');
	const voltar = $derived(caminhoInterno(page.url.searchParams.get('voltar')));

	/** A query que o link de "criar conta" carrega: o mesmo modo e o mesmo retorno. */
	const queryDoCadastro = $derived(
		'?' +
			new URLSearchParams({
				...(como === 'aluno' ? { como: 'aluno' } : {}),
				...(voltar ? { voltar } : {}),
				// Quem chegou aqui por um link protegido (o convite de escola, por
				// exemplo) e ainda não tem conta volta para ele depois do cadastro.
				...(redirectTo ? { redirectTo } : {})
			}).toString()
	);

	function trocar(novo: Como) {
		como = novo;
		error = false;
	}

	async function onSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (loading) return;
		loading = true;
		error = false;

		if (como === 'professor') {
			const { error: signInError } = await authClient.signIn.email({ email, password });
			loading = false;
			if (signInError) {
				error = true;
				return;
			}
			if (redirectTo) {
				// eslint-disable-next-line svelte/no-navigation-without-resolve -- caminho validado acima contra redirect aberto; não é uma rota literal pra resolve() conferir.
				await goto(redirectTo);
			} else {
				await goto(resolve('/(studio)/inicio'));
			}
			return;
		}

		const resultado = await authAlunoClient.signIn.email({ email: email.trim(), password });
		loading = false;
		if (resultado.error) {
			error = true;
			return;
		}
		// **Entrar NÃO adota o que está solto neste aparelho.** Ele fazia isso
		// sozinho aqui, e a suposição estava errada mais vezes do que parecia:
		// celular de laboratório, tablet de casa, o irmão que respondeu antes — a
		// conta acabava com respostas de outra pessoa dentro, sem ninguém ter
		// dito nada. Agora a área do aluno conta quantas há e oferece adotar, e
		// quem decide é ele (paginas.md "Área do aluno").
		if (voltar) {
			// eslint-disable-next-line svelte/no-navigation-without-resolve -- caminho validado acima contra redirect aberto; não é rota literal pra resolve() conferir.
			await goto(voltar, { invalidateAll: true });
		} else {
			await goto(resolve('/aluno'), { invalidateAll: true });
		}
	}
</script>

<svelte:head><title>Entrar — entendo</title></svelte:head>

<div
	class="w-full max-w-[400px] animate-entrada rounded-box
	       border border-line bg-base-100 p-8 shadow-[0_24px_56px_-34px_rgb(var(--shadow)/0.35)]"
>
	<!-- O seletor vem ANTES do título: é ele que decide o que a tela promete. -->
	<Alternador
		opcoes={[
			{ id: 'professor' as const, label: 'Professor' },
			{ id: 'aluno' as const, label: 'Aluno' }
		]}
		bind:valor={como}
		rotulo="Entrar como"
		largura="cheia"
		onmudar={trocar}
		class="mb-6"
	/>

	{#if como === 'professor'}
		<h1 class="mb-1.5 font-display text-[27px] font-semibold tracking-[-0.02em]">
			Bom te ver de novo
		</h1>
		<p class="mb-6 text-sm text-base-content/65">Entre para continuar de onde parou.</p>
	{:else}
		<h1 class="mb-1.5 font-display text-[27px] font-semibold tracking-[-0.02em]">Entrar</h1>
		<!-- A conta do aluno é opcional e a tela diz isso: ela guarda o histórico,
		     nunca destrava a atividade (auth.md "A conta do aluno"). -->
		<p class="mb-6 text-sm leading-relaxed text-base-content/65">
			A conta guarda o que você já respondeu e te reencontra em outro aparelho.
			<strong class="font-semibold text-base-content">Você não precisa dela para responder</strong>
			— é só se quiser.
		</p>
	{/if}

	{#if senhaNova && !error}
		<p
			class="mb-4 rounded-field border-s-[3px] border-primary bg-base-200 px-4 py-3 text-[13px] leading-snug"
			role="status"
		>
			Senha nova salva. Entre com ela.
		</p>
	{/if}

	{#if error}
		<div
			class="mb-4 flex gap-2.5 rounded-field border-s-[3px] border-error bg-base-200 px-4 py-3"
			role="alert"
		>
			<svg
				class="size-[18px] shrink-0 text-error"
				viewBox="0 0 24 24"
				fill="none"
				aria-hidden="true"
			>
				<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" />
				<path
					d="M12 7.5v6M12 16.5h.01"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
				/>
			</svg>
			<p class="text-[13px] leading-snug">E-mail ou senha incorretos.</p>
		</div>
	{/if}

	<form class="grid gap-3.5" onsubmit={onSubmit}>
		<label class="block">
			<span class="mb-1.5 block text-[13px] font-semibold">E-mail</span>
			<input
				name="email"
				type="email"
				autocomplete="email"
				required
				disabled={loading}
				bind:value={email}
				class="input w-full"
			/>
		</label>
		<label class="block">
			<span class="mb-1.5 flex justify-between text-[13px] font-semibold">
				Senha
				<!-- As duas contas recuperam a senha por e-mail; o modo vai junto para a
				     tela de recuperar já nascer na conta certa. -->
				<!-- eslint-disable svelte/no-navigation-without-resolve -- rota resolvida mais o modo (?como=aluno); a regra não enxerga a concatenação. -->
				<a
					href={resolve('/(auth)/esqueci-senha') + (como === 'aluno' ? '?como=aluno' : '')}
					class="font-semibold">Esqueci a senha</a
				>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			</span>
			<input
				name="password"
				type="password"
				autocomplete="current-password"
				required
				minlength="8"
				disabled={loading}
				bind:value={password}
				class="input w-full"
			/>
		</label>
		<button
			type="submit"
			disabled={loading}
			class="mt-1 btn min-h-12 w-full motion-tap btn-primary text-base font-bold"
		>
			{#if loading}
				<Loading variant="fila" size={13} tone="current" label="Entrando" />
				Entrando…
			{:else}
				Entrar
			{/if}
		</button>
	</form>

	<!-- eslint-disable svelte/no-navigation-without-resolve -- é a rota resolvida mais a query do modo; a regra não enxerga a concatenação. -->
	<p class="mt-[22px] text-center text-[13.5px] text-base-content/65">
		Ainda não tem conta?
		<a href={resolve('/(auth)/cadastro') + queryDoCadastro} class="font-bold">Criar conta</a>
	</p>
	{#if como === 'aluno' && voltar}
		<p class="mt-2 text-center text-[13px]">
			<a href={voltar} class="p-1 font-semibold text-base-content/65 no-underline"
				>Voltar e responder sem conta</a
			>
		</p>
	{/if}
	<!-- eslint-enable svelte/no-navigation-without-resolve -->
</div>
