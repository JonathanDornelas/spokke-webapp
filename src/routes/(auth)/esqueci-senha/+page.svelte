<script lang="ts">
	import Alternador from '$lib/components/Alternador.svelte';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import Loading from '$lib/components/Loading.svelte';
	import { authClient } from '$lib/client/auth';
	import { authAlunoClient } from '$lib/client/auth-aluno';

	// Recuperar acesso — professor OU aluno, com o mesmo seletor da tela de
	// entrar: são duas contas por baixo (auth.md), e o pedido vai para a
	// instância certa. `?como=aluno` pré-seleciona, como no entrar.
	//
	// A confirmação é NEUTRA — "se esse e-mail existir". Não vaza quem tem conta.
	type Como = 'professor' | 'aluno';
	let como = $state<Como>(page.url.searchParams.get('como') === 'aluno' ? 'aluno' : 'professor');
	let email = $state('');
	let sent = $state(false);
	let loading = $state(false);
	let cooldown = $state(0);

	/** Para onde o link do e-mail leva: a tela de nova senha, já sabendo de que conta é. */
	const destino = $derived(
		resolve('/(auth)/redefinir-senha') + (como === 'aluno' ? '?como=aluno' : '')
	);
	const voltarParaEntrar = $derived(
		resolve('/(auth)/entrar') + (como === 'aluno' ? '?como=aluno' : '')
	);

	// Better Auth não distingue e-mail existente de inexistente na resposta — a
	// UI trata os dois como "enviado" de propósito, mesma regra da tela de entrar.
	function pedir() {
		const cliente = como === 'aluno' ? authAlunoClient : authClient;
		return cliente.requestPasswordReset({ email: email.trim(), redirectTo: destino });
	}

	async function onSubmit(e: SubmitEvent) {
		e.preventDefault();
		loading = true;
		await pedir();
		loading = false;
		sent = true;
		startCooldown();
	}

	function startCooldown() {
		cooldown = 45;
		const t = setInterval(() => {
			cooldown = cooldown > 0 ? cooldown - 1 : 0;
			if (cooldown === 0) clearInterval(t);
		}, 1000);
	}

	async function resend() {
		if (cooldown > 0) return;
		await pedir();
		startCooldown();
	}
</script>

<svelte:head><title>Recuperar acesso — entendo</title></svelte:head>

<div
	class="w-full max-w-[384px] animate-entrada rounded-box
	       border border-line bg-base-100 p-8 shadow-[0_24px_56px_-34px_rgb(var(--shadow)/0.35)]"
>
	{#if sent}
		<div class="text-center">
			<span
				class="mb-4 inline-grid size-[52px] place-items-center rounded-full bg-base-300 text-primary"
			>
				<svg class="size-6" viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<rect
						x="2.5"
						y="5"
						width="19"
						height="14"
						rx="3"
						stroke="currentColor"
						stroke-width="2"
					/>
					<path
						d="M3.5 6.5l8.5 6.5 8.5-6.5"
						stroke="currentColor"
						stroke-width="2"
						stroke-linejoin="round"
					/>
				</svg>
			</span>
			<h1 class="mb-2 font-display text-xl font-semibold tracking-[-0.02em]">
				Verifique seu e-mail
			</h1>
			<p class="mb-4 text-[13.5px] leading-relaxed text-base-content/65">
				Se esse e-mail existir, enviamos um link. O link vale por 1 hora.
			</p>
			<div class="border-t border-line pt-3.5 text-[12.5px] text-base-content/65">
				Não chegou?
				{#if cooldown > 0}
					<span class="font-bold">Reenviar em 0:{String(cooldown).padStart(2, '0')}</span>
				{:else}
					<button type="button" onclick={resend} class="font-bold text-primary">Reenviar</button>
				{/if}
			</div>
		</div>
	{:else}
		<Alternador
			opcoes={[
				{ id: 'professor' as const, label: 'Professor' },
				{ id: 'aluno' as const, label: 'Aluno' }
			]}
			bind:valor={como}
			rotulo="Recuperar a conta de"
			largura="cheia"
			class="mb-6"
		/>
		<h1 class="mb-1.5 font-display text-[22px] font-semibold tracking-[-0.02em]">
			Recuperar acesso
		</h1>
		<p class="mb-[18px] text-[13.5px] leading-snug text-base-content/65">
			{como === 'aluno'
				? 'Digite o e-mail da sua conta de aluno. Enviamos um link para criar uma senha nova.'
				: 'Digite o e-mail da sua conta. Enviamos um link para criar uma senha nova.'}
		</p>
		<form class="grid gap-3.5" onsubmit={onSubmit}>
			<label class="block">
				<span class="mb-1.5 block text-[13px] font-semibold">E-mail</span>
				<input
					name="email"
					type="email"
					autocomplete="email"
					required
					bind:value={email}
					class="input w-full"
				/>
			</label>
			<button
				type="submit"
				disabled={loading}
				class="btn min-h-[46px] w-full motion-tap btn-primary font-bold"
			>
				{#if loading}
					<Loading variant="fila" size={13} tone="current" label="Enviando" />
					Enviando…
				{:else}
					Enviar link
				{/if}
			</button>
		</form>
		<p class="mt-4 text-center text-[13px]">
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- é a rota resolvida mais o modo (?como=aluno); a regra não enxerga a concatenação. -->
			<a href={voltarParaEntrar}>Voltar para entrar</a>
		</p>
	{/if}
</div>
