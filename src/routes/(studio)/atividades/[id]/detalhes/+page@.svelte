<script lang="ts">
	// Etapa 1 de uma atividade que já existe: os mesmos campos de `nova`, salvando
	// NESTA atividade. `+page@.svelte` reseta para o layout raiz, como as outras
	// etapas do wizard.
	import { resolve } from '$app/paths';
	import CamposDaAtividade from '../../CamposDaAtividade.svelte';
	import { editarDetalhes } from '../../atividades.remote';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>Detalhes · {data.activity.title} · Spokke</title></svelte:head>

<form {...editarDetalhes}>
	<CamposDaAtividade
		valores={data.valores}
		idiomasTravados={data.idiomasTravados}
		backHref={resolve('/(studio)/atividades')}
		backLabel="Atividades"
		enviando={!!editarDetalhes.pending}
	>
		{#snippet extra()}
			<input type="hidden" name="activityId" value={data.activity.id} />
		{/snippet}
	</CamposDaAtividade>
</form>
