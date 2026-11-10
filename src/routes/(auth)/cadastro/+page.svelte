<script lang="ts">
	import Metadados from '$lib/components/Metadados.svelte';
	import Alternador from '$lib/components/Alternador.svelte';
	import { caminhoInterno } from '$lib/caminho-interno';
	import { goto } from '$app/navigation';
	import Loading from '$lib/components/Loading.svelte';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { authClient } from '$lib/client/auth';
	import { authAlunoClient } from '$lib/client/auth-aluno';
	import { IDIOMAS } from '$lib/idiomas';
	import { gravarMeusIdiomas } from '../../(studio)/conta/conta.remote';
	import BotaoGoogle from '../BotaoGoogle.svelte';
	import { mensagemDoGoogle } from '../erro-do-google';

	// Criar conta — professor OU aluno, com o mesmo seletor de "/entrar". As duas
	// contas são separadas por baixo (auth.md); o que muda aqui é a copy, o
	// painel do lado e para onde a pessoa vai depois.
	//
	// Professor: o cadastro É o começo do teste de 14 dias (`TRIAL` no catálogo),
	// e a tela diz isso no título e no botão. O teste vai exigir cartão quando o
	// gateway existir (billing.md "Trial"); até lá, nada aqui fala de cartão.
	// Aluno: a conta é OPCIONAL e a tela diz isso: ela guarda o histórico,
	// nunca destrava a atividade.
	type Como = 'professor' | 'aluno';

	let como = $state<Como>(page.url.searchParams.get('como') === 'aluno' ? 'aluno' : 'professor');
	let name = $state('');
	let email = $state('');
	let password = $state('');
	let loading = $state(false);
	let emailTaken = $state(false);
	let erro = $state('');
	/**
	 * Os idiomas que o professor ensina — OPCIONAL. Não destrava nada: vira o
	 * padrão da atividade nova, da turma nova e da biblioteca, para ninguém ter de
	 * trocar "Inglês (EUA)" toda vez. Muda depois em Conta.
	 */
	let ensina = $state<string[]>([]);
	function alternarIdioma(tag: string) {
		ensina = ensina.includes(tag) ? ensina.filter((t) => t !== tag) : [...ensina, tag];
	}

	const voltar = $derived(caminhoInterno(page.url.searchParams.get('voltar')));
	// `redirectTo` vem do guard do Studio (via a tela de entrar): quem abriu um
	// link protegido — o convite de escola — sem ter conta volta para ele depois de
	// criar a conta, em vez de cair na lista de atividades e perder o convite.
	const redirectTo = $derived(caminhoInterno(page.url.searchParams.get('redirectTo')));
	const queryDoEntrar = $derived(
		'?' +
			new URLSearchParams({
				...(como === 'aluno' ? { como: 'aluno' } : {}),
				...(voltar ? { voltar } : {}),
				...(redirectTo ? { redirectTo } : {})
			}).toString()
	);

	// ── Google ── (só com as chaves no servidor: `(auth)/+layout.server.ts`). Os
	// idiomas que ensina não vão por ele: são opcionais e se escolhem na Conta.
	const google = $derived(page.data.google === true);
	const erroGoogle = $derived(mensagemDoGoogle(page.url.searchParams.get('error'), como));
	const estaTela = $derived(
		resolve('/(auth)/cadastro') +
			'?' +
			new URLSearchParams({
				...(como === 'aluno' ? { como: 'aluno' } : {}),
				...(voltar ? { voltar } : {}),
				...(redirectTo ? { redirectTo } : {})
			}).toString()
	);

	const strength = $derived(Math.min(4, Math.floor(password.length / 4)));
	const strengthLabel = $derived(['', 'Fraca', 'Razoável', 'Boa', 'Ótima'][strength]);

	// O painel da direita: um título, o que a conta traz e, embaixo, a condição.
	// Cada linha confere com `docs/funcionalidades.md`.
	const painel: Record<Como, { titulo: string; itens: string[]; nota: string }> = {
		professor: {
			titulo: 'O que vem na sua conta',
			itens: [
				'Exercícios de escuta, fala, leitura e escrita feitos com o seu material',
				'Seus alunos respondem pelo link, sem criar conta',
				'Correção na hora, com o quase separado do erro',
				'O que a turma errou, questão por questão'
			],
			nota: '14 dias grátis. Depois, você escolhe o plano.'
		},
		aluno: {
			titulo: 'Para que serve a conta',
			itens: [
				'Seu histórico de respostas em qualquer aparelho',
				'Os módulos da sua turma num mapa de fases',
				'Só nome, e-mail e senha (ou o Google, no lugar da senha). Nada além disso.'
			],
			nota: 'É opcional. Toda atividade abre sem conta.'
		}
	};

	function trocar(novo: Como) {
		como = novo;
		emailTaken = false;
		erro = '';
	}

	async function onSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (loading) return;
		loading = true;
		emailTaken = false;
		erro = '';

		if (como === 'professor') {
			const { error } = await authClient.signUp.email({ name, email, password });
			loading = false;
			if (error) {
				// Better Auth já não distingue "e-mail inválido" de "já existe" na
				// mensagem pública — trate qualquer erro de cadastro como conflito de
				// e-mail, que é o caso disparadamente mais comum aqui.
				emailTaken = true;
				return;
			}
			// A conta já existe e a sessão também: os idiomas vão por uma remote
			// function da conta, filtrados no servidor. Falhar aqui não desfaz o
			// cadastro — é um padrão, e ele se escolhe de novo em Conta.
			if (ensina.length > 0) {
				try {
					await gravarMeusIdiomas({ idiomas: ensina });
				} catch {
					// segue: a conta foi criada
				}
			}
			if (redirectTo) {
				// eslint-disable-next-line svelte/no-navigation-without-resolve -- caminho validado contra redirect aberto (`caminhoInterno`); não é rota literal pra resolve() conferir.
				await goto(redirectTo, { invalidateAll: true });
			} else {
				await goto(resolve('/(studio)/atividades'));
			}
			return;
		}

		const resultado = await authAlunoClient.signUp.email({
			name: name.trim(),
			email: email.trim(),
			password
		});
		loading = false;
		if (resultado.error) {
			// No criar o erro é específico: a pessoa já sabe o próprio endereço e
			// precisa saber que ele está em uso.
			erro = resultado.error.message ?? 'Não deu para criar a conta. Tente de novo.';
			return;
		}
		// Criar conta também não adota nada sozinho — o convite fica na área do
		// aluno, com a contagem. Mesma razão da tela de entrar.
		if (voltar) {
			// eslint-disable-next-line svelte/no-navigation-without-resolve -- caminho validado acima contra redirect aberto; não é rota literal pra resolve() conferir.
			await goto(voltar, { invalidateAll: true });
		} else {
			await goto(resolve('/aluno'), { invalidateAll: true });
		}
	}
</script>

<Metadados
	titulo="Crie sua conta no Spokke"
	descricao="Monte a primeira atividade com o material da sua aula. Toda conta começa com 14 dias de teste grátis."
	tituloDaAba="Criar conta · Spokke"
/>

<!-- `animate-entrada`: o cartão sobe ao abrir, como o de entrar. -->
<div
	class="grid w-full max-w-[860px] animate-entrada overflow-hidden rounded-box border border-line
	       bg-base-100 shadow-[0_24px_56px_-34px_rgb(var(--shadow)/0.35)] md:grid-cols-[1fr_280px]"
>
	<div class="p-8">
		<Alternador
			opcoes={[
				{ id: 'professor' as const, label: 'Professor' },
				{ id: 'aluno' as const, label: 'Aluno' }
			]}
			bind:valor={como}
			rotulo="Criar conta como"
			largura="cheia"
			onmudar={trocar}
			class="mb-6 max-w-[320px]"
		/>

		{#if como === 'professor'}
			<h1 class="mb-1.5 font-display text-[26px] font-semibold tracking-[-0.02em] text-balance">
				Teste o Spokke por 14 dias
			</h1>
			<p class="mb-[22px] text-sm text-base-content/65">
				Seus alunos não precisam de conta, só do link.
			</p>
		{:else}
			<h1 class="mb-1.5 font-display text-[26px] font-semibold tracking-[-0.02em]">
				Crie sua conta de aluno
			</h1>
			<p class="mb-[22px] text-sm leading-relaxed text-base-content/65">
				Ela guarda o que você responde e te acompanha em qualquer aparelho.
				<strong class="font-semibold text-base-content">É opcional:</strong> as atividades abrem sem conta.
			</p>
		{/if}

		{#if erroGoogle}
			<p
				class="mb-4 rounded-field border-s-[3px] border-error bg-base-200 px-4 py-3 text-[13px] leading-snug"
				role="alert"
			>
				{erroGoogle}
			</p>
		{/if}

		{#if google}
			<!-- Um toque, e a conta nasce com o nome e o e-mail do Google — sem
			     senha. O professor entra no teste de 14 dias do mesmo jeito. -->
			<BotaoGoogle
				{como}
				destino={como === 'professor'
					? (redirectTo ?? resolve('/(studio)/atividades'))
					: (voltar ?? resolve('/aluno'))}
				voltaComErro={estaTela}
			/>
			<div
				class="my-5 flex items-center gap-3 text-[12.5px] text-base-content/60"
				aria-hidden="true"
			>
				<span class="h-px flex-1 bg-line"></span>
				ou com o seu e-mail
				<span class="h-px flex-1 bg-line"></span>
			</div>
		{/if}

		<form class="grid gap-3.5" onsubmit={onSubmit}>
			<label class="block">
				<span class="mb-1.5 block text-[13px] font-semibold">Seu nome</span>
				<input
					name="name"
					autocomplete="name"
					required
					maxlength="60"
					disabled={loading}
					bind:value={name}
					class="input w-full"
				/>
			</label>
			<label class="block">
				<span class="mb-1.5 block text-[13px] font-semibold">E-mail</span>
				<input
					name="email"
					type="email"
					autocomplete="email"
					required
					disabled={loading}
					bind:value={email}
					class="input w-full {emailTaken ? 'input-error' : ''}"
				/>
				{#if emailTaken}
					<!-- eslint-disable svelte/no-navigation-without-resolve -- rota resolvida mais a query do modo. -->
					<span class="mt-1.5 flex items-center gap-1.5 text-[12.5px] font-semibold text-error">
						<svg class="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" />
							<path
								d="M12 7.5v6M12 16.5h.01"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
							/>
						</svg>
						Este e-mail já tem conta.
						<a href={resolve('/(auth)/entrar') + queryDoEntrar} class="text-inherit underline"
							>Entrar</a
						>
					</span>
					<!-- eslint-enable svelte/no-navigation-without-resolve -->
				{/if}
			</label>
			<label class="block">
				<span class="mb-1.5 block text-[13px] font-semibold">Senha</span>
				<input
					name="password"
					type="password"
					autocomplete="new-password"
					required
					minlength="8"
					disabled={loading}
					bind:value={password}
					class="input w-full"
				/>
				{#if password}
					<span class="mt-2 flex items-center gap-2">
						<span class="flex flex-1 gap-[3px]">
							{#each [1, 2, 3, 4] as i (i)}
								<span class="h-1 flex-1 rounded-full {i <= strength ? 'bg-success' : 'bg-base-300'}"
								></span>
							{/each}
						</span>
						<span class="text-xs font-semibold text-success">{strengthLabel}</span>
					</span>
				{:else}
					<span class="mt-1.5 block text-[12px] text-base-content/65">Pelo menos 8 caracteres.</span
					>
				{/if}
			</label>

			{#if como === 'professor'}
				<fieldset class="border-0 p-0" disabled={loading}>
					<legend class="mb-1.5 text-[13px] font-semibold">
						Quais idiomas você ensina? <span class="font-normal text-base-content/65"
							>(opcional)</span
						>
					</legend>
					<div class="flex flex-wrap gap-1.5">
						{#each IDIOMAS as idioma (idioma.tag)}
							<button
								type="button"
								onclick={() => alternarIdioma(idioma.tag)}
								aria-pressed={ensina.includes(idioma.tag)}
								class="min-h-9 motion-tap rounded-full border px-3 text-[12.5px] font-semibold transition-colors {ensina.includes(
									idioma.tag
								)
									? 'border-primary bg-primary text-primary-content'
									: 'border-line bg-base-100 text-base-content/75 hover:border-primary'}"
								>{idioma.rotulo}</button
							>
						{/each}
					</div>
					<span class="mt-1.5 block text-[12px] text-base-content/65"
						>Eles viram o padrão das suas atividades e turmas. Dá para mudar depois.</span
					>
				</fieldset>
			{/if}

			{#if erro}
				<p
					class="rounded-field border-s-[3px] border-error bg-base-200 px-4 py-3 text-[13px] leading-snug"
					role="alert"
				>
					{erro}
				</p>
			{/if}

			<button
				type="submit"
				disabled={loading}
				class="mt-1 btn min-h-12 w-full motion-tap btn-primary text-base font-bold"
			>
				{#if loading}
					<Loading variant="fila" size={13} tone="current" label="Criando" />
					Criando sua conta…
				{:else}
					{como === 'professor' ? 'Começar o teste grátis' : 'Criar conta'}
				{/if}
			</button>
		</form>

		<p class="mt-4 text-center text-xs leading-relaxed text-base-content/65">
			Ao criar a conta, você concorda com os <a href={resolve('/(site)/termos')}>Termos de uso</a> e
			a <a href={resolve('/(site)/privacidade')}>Política de privacidade</a>.
		</p>
		<!-- eslint-disable svelte/no-navigation-without-resolve -- rota resolvida mais a query do modo; `voltar` é validado contra redirect aberto. -->
		<p class="mt-3 text-center text-[13.5px] text-base-content/65">
			Já tem conta?
			<a href={resolve('/(auth)/entrar') + queryDoEntrar} class="font-bold">Entrar</a>
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

	<!-- O painel acompanha a altura do formulário: o conteúdo em cima, alinhado
	     com o seletor, a condição embaixo, e as formas no vão do meio. Antes a
	     lista ficava colada no topo de uma coluna vazia, com uma forma por trás
	     da primeira linha. No celular o painel vai para baixo do formulário,
	     sem vão no meio, e as formas saem: cairiam atrás da nota. -->
	<div class="relative flex flex-col justify-between gap-8 overflow-hidden bg-panel p-7">
		<div aria-hidden="true" class="pointer-events-none absolute inset-0 hidden md:block">
			<div
				class="absolute top-[52%] -right-[22%] size-[150px] animate-[en-float-a_16s_ease-in-out_infinite] rounded-full bg-primary/50 blur-[1px]"
			></div>
			<div
				class="absolute top-[62%] -left-[12%] h-[84px] w-24 animate-[en-drift-spin_24s_ease-in-out_infinite] bg-accent/25 [clip-path:polygon(50%_0%,100%_100%,0%_100%)]"
			></div>
			<div
				class="absolute top-[74%] right-[34%] size-9 animate-[en-breathe_7s_ease-in-out_infinite] rounded-full bg-warning/35"
			></div>
		</div>

		<div class="relative z-1">
			<p class="mb-4 text-[11px] font-bold tracking-[0.12em] text-panel-dim uppercase">
				{painel[como].titulo}
			</p>
			<ul class="grid list-none gap-3.5 p-0">
				{#each painel[como].itens as line (line)}
					<li class="flex items-start gap-2.5">
						<svg
							class="mt-0.5 size-[17px] shrink-0 text-accent"
							viewBox="0 0 24 24"
							fill="none"
							aria-hidden="true"
						>
							<path
								d="M4 12.5l5 5L20 6.5"
								stroke="currentColor"
								stroke-width="2.6"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						</svg>
						<span class="text-[13.5px] leading-snug text-panel-content">{line}</span>
					</li>
				{/each}
			</ul>
		</div>

		<p
			class="relative z-1 border-t border-panel-line pt-4 text-[13px] leading-snug font-semibold text-panel-content"
		>
			{painel[como].nota}
		</p>
	</div>
</div>
