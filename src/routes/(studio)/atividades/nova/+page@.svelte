<script lang="ts">
	// Etapa 1 do wizard, criando. Os campos são os mesmos da volta a uma
	// atividade que já existe (`CamposDaAtividade.svelte`). `+page@.svelte`
	// reseta para o layout raiz — o wizard não usa a barra lateral do Studio
	// (paginas.md "Studio": "durante a criação o professor tem uma tarefa só").
	import { resolve } from '$app/paths';
	import CamposDaAtividade from '../CamposDaAtividade.svelte';
	import { criarAtividade } from '../atividades.remote';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	/**
	 * Por que não dá para criar — do estado do plano (antes de digitar) ou da
	 * resposta do servidor (a trava de cota pode recusar mesmo com a tela
	 * dizendo que cabia, se outra aba criou no meio).
	 */
	const bloqueio = $derived.by(() => {
		const r = criarAtividade.result;
		if (r && !r.ok) return { motivo: r.motivo, texto: r.error };
		const motivo = data.acesso.motivo.criarAtividade;
		if (!motivo) return null;
		const { uso, limites } = data.acesso;
		const texto =
			motivo === 'criar'
				? `Seu plano permite ${limites.atividades} atividades ao mesmo tempo, e você já tem ${uso.atividades}. Arquive uma que já foi usada (os resultados dela ficam) ou escolha um plano com mais espaço.`
				: motivo === 'trial'
					? 'O período de teste acabou. Nada foi apagado, e os links já publicados seguem abrindo. Para criar de novo, escolha um plano.'
					: 'Seu plano não permite criar atividades agora. Os links já publicados seguem abrindo.';
		return { motivo, texto };
	});
</script>

<svelte:head><title>Nova atividade · Spokke</title></svelte:head>

<form {...criarAtividade}>
	<CamposDaAtividade
		valores={{ title: '', alvo: data.padrao.alvo, aluno: data.padrao.aluno, nivel: null }}
		backHref={resolve('/(studio)/atividades')}
		backLabel="Atividades"
		enviando={!!criarAtividade.pending}
		bloqueado={!!bloqueio}
	>
		{#snippet aviso()}
			{#if bloqueio}
				<!-- O bloqueio vem ANTES dos campos: preencher tudo para descobrir no
				     "Continuar" que não cabia é jogar o trabalho fora. -->
				<div
					class="mb-6 rounded-box border border-s-[3px] border-line border-s-error bg-base-200 px-4 py-3.5 text-[13.5px] leading-relaxed"
					role="alert"
				>
					<p class="mb-2 font-bold">Não dá para criar uma atividade nova agora</p>
					<p class="text-base-content/70">{bloqueio.texto}</p>
					<p class="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
						{#if bloqueio.motivo === 'criar'}
							<a href={resolve('/(studio)/atividades')} class="font-bold">Ver minhas atividades</a>
						{/if}
						{#if bloqueio.motivo}
							<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- rota resolvida mais a query do motivo; a regra não enxerga a concatenação. -->
							<a href={resolve('/(site)/planos') + '?motivo=' + bloqueio.motivo} class="font-bold"
								>Ver os planos</a
							>
						{/if}
					</p>
				</div>
			{/if}
		{/snippet}
	</CamposDaAtividade>
</form>
