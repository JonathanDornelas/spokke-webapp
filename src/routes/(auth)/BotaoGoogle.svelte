<script lang="ts">
	// "Continuar com o Google", em entrar e em criar conta, para professor e para
	// aluno. O seletor da tela escolhe o cliente — são duas instâncias de Better
	// Auth (auth.md), e entrar como aluno nunca vira sessão de professor.
	//
	// Quem decide o que o Google pode fazer é o servidor (`server/auth/google.ts`):
	// conta com senha não é ligada sozinha, e nenhum token do Google fica guardado.
	// Aqui só se pede a ida e se diz para onde voltar.
	import Loading from '$lib/components/Loading.svelte';
	import { authClient } from '$lib/client/auth';
	import { authAlunoClient } from '$lib/client/auth-aluno';

	let {
		como,
		destino,
		destinoDeQuemChega,
		voltaComErro
	}: {
		como: 'professor' | 'aluno';
		/** Para onde vai quem já tinha conta. Caminho interno, já validado pela tela. */
		destino: string;
		/** Para onde vai quem acabou de criar a conta pelo Google. */
		destinoDeQuemChega?: string;
		/** A própria tela, com o modo: o Better Auth acrescenta `?error=…` na volta. */
		voltaComErro: string;
	} = $props();

	let indo = $state(false);
	let falhou = $state(false);

	async function continuar() {
		if (indo) return;
		indo = true;
		falhou = false;
		const cliente = como === 'aluno' ? authAlunoClient : authClient;
		const { error } = await cliente.signIn.social({
			provider: 'google',
			callbackURL: destino,
			newUserCallbackURL: destinoDeQuemChega ?? destino,
			errorCallbackURL: voltaComErro
		});
		// Sem erro, o navegador já está a caminho do Google: o botão continua
		// esperando até a página trocar.
		if (error) {
			indo = false;
			falhou = true;
		}
	}
</script>

<button
	type="button"
	onclick={continuar}
	disabled={indo}
	class="btn min-h-12 w-full motion-tap gap-3 btn-neutral text-[15px] font-semibold"
>
	{#if indo}
		<Loading variant="fila" size={13} tone="current" label="Indo para o Google" />
		Indo para o Google…
	{:else}
		<!-- A marca do Google é dele, com as cores dele (as regras de marca do
		     botão "entrar com o Google" pedem o G original): por isso é um arquivo
		     em `static/`, e não um SVG com cor de tema. -->
		<img src="/marcas/google.svg" alt="" width="18" height="18" class="size-[18px]" />
		Continuar com o Google
	{/if}
</button>
{#if falhou}
	<p class="mt-2 text-center text-[12.5px] font-semibold text-error" role="alert">
		Não deu para chegar ao Google agora. Tente de novo ou use o seu e-mail.
	</p>
{/if}
