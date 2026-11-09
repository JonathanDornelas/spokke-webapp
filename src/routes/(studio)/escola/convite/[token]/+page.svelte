<script lang="ts">
	// O aceite do convite de escola. Diz o que muda ANTES do botão — aceitar dá à
	// coordenação uma visão (só números) sobre as turmas do professor — e diz o
	// que NÃO muda: o conteúdo continua dele (docs/adr-005-escola.md).
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import Loading from '$lib/components/Loading.svelte';
	import { aceitarConvite } from '../../escola.remote';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let aceitando = $state(false);
	let erro = $state<string | null>(null);

	const MOTIVO: Record<string, string> = {
		invalido: 'Este convite não existe mais. Peça outro à coordenação.',
		usado: 'Este convite já foi usado.',
		expirado: 'Este convite venceu. Peça outro à coordenação.',
		'sem-assento': 'A escola não tem mais assentos livres. Fale com a coordenação.',
		'outra-escola': 'Você já faz parte de outra escola. Saia dela antes, em Conta › Assinatura.',
		inativa: 'O contrato desta escola não está ativo agora.'
	};

	async function aceitar() {
		aceitando = true;
		erro = null;
		try {
			const r = await aceitarConvite({ token: page.params.token ?? '' });
			if (!r.ok) {
				erro = MOTIVO[r.motivo] ?? 'Não deu para aceitar.';
				return;
			}
			await invalidateAll();
			await goto(resolve('/(studio)/inicio'));
		} catch {
			erro = 'Não deu para aceitar agora. Tente de novo em instantes.';
		} finally {
			aceitando = false;
		}
	}
</script>

<svelte:head><title>Convite de escola — Spokke</title></svelte:head>

<div class="pagina-studio">
	{#if data.estado === 'aberto'}
		<p class="mb-2 text-xs font-bold tracking-[0.09em] text-primary uppercase">Convite de escola</p>
		<h1 class="mb-3 font-display text-title font-semibold tracking-[-0.022em] text-pretty">
			{data.escola} convidou você {data.role === 'coordenacao'
				? 'para a coordenação'
				: 'como professor'}
		</h1>
		<p class="mb-4 text-[14.5px] leading-relaxed text-base-content/70">Ao aceitar:</p>
		<ul class="mb-5 grid gap-2.5 text-[14px] leading-relaxed">
			<li class="rounded-box border border-line bg-card px-4 py-3">
				<strong>Seu plano passa a ser o da escola</strong>, com os limites do contrato. Se você tem
				uma assinatura própria, cancele-a em Conta para não pagar duas vezes.
			</li>
			<li class="rounded-box border border-line bg-card px-4 py-3">
				<strong>A coordenação vê os números das suas turmas</strong> — quantos alunos, envios, quantos
				terminaram e o acerto médio. Nunca o nome de um aluno nem uma resposta.
			</li>
			<li class="rounded-box border border-line bg-card px-4 py-3">
				<strong>Seu conteúdo continua seu.</strong> Atividades, materiais e resultados ficam com você,
				inclusive se você sair da escola.
			</li>
		</ul>
		{#if data.outraEscola}
			<p class="mb-4 text-[13.5px] font-semibold text-error" role="alert">
				Você já faz parte de {data.outraEscola}. Saia dela antes, em Conta › Assinatura.
			</p>
		{/if}
		<p class="mb-4 text-[12.5px] text-base-content/60">
			Convite enviado para {data.emailDoConvite}.
		</p>
		<div class="flex flex-wrap gap-2">
			<button
				type="button"
				onclick={aceitar}
				disabled={aceitando || !!data.outraEscola}
				class="btn min-h-12 motion-tap gap-2 btn-primary font-bold"
			>
				{#if aceitando}<Loading variant="fila" size={10} tone="current" label="Aceitando" />{/if}
				Aceitar o convite
			</button>
			<a href={resolve('/(studio)/inicio')} class="btn min-h-12 btn-plain no-underline">Agora não</a
			>
		</div>
		{#if erro}<p class="mt-3 text-[13.5px] font-semibold text-error" role="alert">{erro}</p>{/if}
	{:else if data.estado === 'ja-membro'}
		<h1 class="mb-3 font-display text-title font-semibold">Você já faz parte de {data.escola}</h1>
		<a
			href={resolve('/(studio)/atividades')}
			class="btn min-h-12 btn-primary font-bold no-underline">Ir para as atividades</a
		>
	{:else}
		<h1 class="mb-3 font-display text-title font-semibold">Este convite não está disponível</h1>
		<p class="mb-5 text-[14.5px] text-base-content/70">{MOTIVO[data.estado] ?? MOTIVO.invalido}</p>
		<a href={resolve('/(studio)/inicio')} class="btn min-h-12 btn-plain no-underline"
			>Voltar ao Studio</a
		>
	{/if}
</div>
