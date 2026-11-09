<script lang="ts">
	import Metadados from '$lib/components/Metadados.svelte';
	// O convite de conta, do lado do aluno. Sem conta: criar uma ou entrar na que
	// tem, nas telas de sempre, e voltar para cá. Com conta: a tela diz QUAL conta
	// vai entrar na turma antes do botão — o aparelho pode estar com a de outra
	// pessoa aberta (auth.md "A conta do aluno").
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import Logo from '$lib/components/Logo.svelte';
	import Loading from '$lib/components/Loading.svelte';
	import AmbientShapes from '$lib/components/AmbientShapes.svelte';
	import { authAlunoClient } from '$lib/client/auth-aluno';
	import { entrarNaTurmaPeloConvite } from '../../aluno.remote';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const token = $derived(page.params.token ?? '');
	const aqui = $derived(`/aluno/convite/${token}`);
	const query = $derived(`?como=aluno&voltar=${encodeURIComponent(aqui)}`);

	let ligou = $state(false);
	let ligando = $state(false);
	let saindo = $state(false);
	let erro = $state<string | null>(null);

	const MOTIVO: Record<string, string> = {
		'outra-conta': 'Este convite já está ligado a outra conta.',
		invalido: 'Este convite não abre mais. Peça um novo ao professor.'
	};

	async function entrar() {
		ligando = true;
		erro = null;
		try {
			const { desfecho } = await entrarNaTurmaPeloConvite({ token });
			if (desfecho === 'ligada' || desfecho === 'ja-era-sua') ligou = true;
			else erro = MOTIVO[desfecho];
		} catch {
			erro = 'Não deu para entrar na turma agora. Tente de novo em instantes.';
		} finally {
			ligando = false;
		}
	}

	async function naoSouEu() {
		saindo = true;
		try {
			await authAlunoClient.signOut();
			await invalidateAll();
		} finally {
			saindo = false;
		}
	}
</script>

<Metadados
	titulo={data.turma ? `Convite para a turma ${data.turma}` : 'Convite de turma'}
	descricao={data.professor
		? `${data.professor} chamou você para a turma no Spokke. Crie a sua conta de aluno, ou entre na que já tem, e as atividades aparecem num mapa.`
		: 'Convite de turma no Spokke.'}
	tituloDaAba="Convite de turma · Spokke"
	imagem="/og/atividade.png"
	imagemAlt="Convite de turma no Spokke."
	indexar={false}
/>

<div class="relative flex min-h-screen flex-col bg-base-200">
	<AmbientShapes layout="tela" />
	<header class="relative z-1 px-8 py-5"><Logo /></header>
	<main class="relative z-1 flex flex-1 items-center justify-center px-4 pb-16 sm:px-6">
		<div
			class="w-full max-w-[540px] animate-entrada rounded-box border border-line bg-base-100 p-7 shadow-[0_24px_56px_-34px_rgb(var(--shadow)/0.35)] sm:p-8"
		>
			{#if ligou || data.estado === 'ja-era-sua'}
				<p class="mb-2 text-xs font-bold tracking-[0.09em] text-primary uppercase">
					Convite de turma
				</p>
				<h1 class="mb-3 font-display text-[26px] font-semibold tracking-[-0.02em] text-balance">
					{ligou ? 'Pronto, você está na turma' : 'Você já está na turma'}
					{data.turma}
				</h1>
				<p class="mb-6 text-[14.5px] leading-relaxed text-base-content/70">
					As atividades que {data.professor} liberar aparecem na sua área, num mapa da turma.
				</p>
				<a
					href={resolve('/aluno')}
					class="btn min-h-12 motion-tap btn-primary font-bold no-underline">Ir para a minha área</a
				>
			{:else if data.estado === 'aberto'}
				<p class="mb-2 text-xs font-bold tracking-[0.09em] text-primary uppercase">
					Convite de turma
				</p>
				<h1 class="mb-3 font-display text-[26px] font-semibold tracking-[-0.02em] text-balance">
					{data.professor} chamou você para a turma {data.turma}
				</h1>
				<p class="mb-5 text-[14.5px] leading-relaxed text-base-content/70">
					Convite para <strong class="text-base-content">{data.aluno}</strong>. Com a conta, as
					atividades da turma aparecem num mapa conforme forem liberadas, e o que você responder
					fica guardado em qualquer aparelho.
				</p>

				{#if data.conta}
					<div class="mb-5 rounded-field border border-line bg-base-200 px-4 py-3">
						<p class="text-[13px] text-base-content/65">Você está com a conta</p>
						<p class="truncate text-[15px] font-semibold">{data.conta.nome}</p>
						<p class="truncate font-mono text-[12.5px] text-base-content/65">{data.conta.email}</p>
					</div>
					<div class="flex flex-wrap gap-2">
						<button
							type="button"
							onclick={entrar}
							disabled={ligando || saindo}
							class="btn min-h-12 motion-tap gap-2 btn-primary font-bold"
						>
							{#if ligando}<Loading
									variant="fila"
									size={10}
									tone="current"
									label="Entrando na turma"
								/>{/if}
							Entrar na turma com esta conta
						</button>
						<button
							type="button"
							onclick={naoSouEu}
							disabled={ligando || saindo}
							class="btn min-h-12 motion-tap gap-2 btn-plain"
						>
							{#if saindo}<Loading variant="fila" size={10} tone="current" label="Saindo" />{/if}
							Não sou eu
						</button>
					</div>
				{:else}
					<div class="flex flex-wrap gap-2">
						<!-- eslint-disable svelte/no-navigation-without-resolve -- rota resolvida mais o modo e o `voltar` (caminho interno). -->
						<a
							href={resolve('/(auth)/cadastro') + query}
							class="btn min-h-12 motion-tap btn-primary font-bold no-underline"
							>Criar minha conta</a
						>
						<a
							href={resolve('/(auth)/entrar') + query}
							class="btn min-h-12 motion-tap btn-plain no-underline">Já tenho conta</a
						>
						<!-- eslint-enable svelte/no-navigation-without-resolve -->
					</div>
				{/if}
				{#if erro}
					<p class="mt-3 text-[13.5px] font-semibold text-error" role="alert">{erro}</p>
				{/if}
				<p
					class="mt-6 border-t border-line pt-4 text-[12.5px] leading-relaxed text-base-content/60"
				>
					A conta é opcional. As atividades que chegarem por link continuam abrindo sem ela.
				</p>
			{:else if data.estado === 'usado'}
				<h1 class="mb-3 font-display text-[26px] font-semibold tracking-[-0.02em] text-balance">
					Este convite já foi usado
				</h1>
				<p class="mb-6 text-[14.5px] leading-relaxed text-base-content/70">
					Ele está ligado a outra conta. Se foi engano, peça a {data.professor} um convite novo.
				</p>
				{#if data.conta}
					<a href={resolve('/aluno')} class="btn min-h-12 btn-plain no-underline"
						>Ir para a minha área</a
					>
				{/if}
			{:else}
				<h1 class="mb-3 font-display text-[26px] font-semibold tracking-[-0.02em] text-balance">
					Este convite não abre mais
				</h1>
				<p class="mb-6 text-[14.5px] leading-relaxed text-base-content/70">
					O professor pode ter gerado um link novo. Peça o convite de novo a ele.
				</p>
				<a href={resolve('/')} class="btn min-h-12 btn-plain no-underline">Conhecer o Spokke</a>
			{/if}
		</div>
	</main>
</div>
