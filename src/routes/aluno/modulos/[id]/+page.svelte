<script lang="ts">
	// O mapa do módulo do aluno (docs/telas-modulos-aluno.md 2). A superfície é a
	// do PLAYER, não a do Studio: celular, alvo de 48px, cabeçalho de uma linha
	// (voltar, marca, volume). No celular a página não rola — o mapa rola por
	// dentro, como a área da questão (design-system.md "Dois contextos").
	import { resolve } from '$app/paths';
	import Logo from '$lib/components/Logo.svelte';
	import MapaDoModulo from '$lib/components/MapaDoModulo.svelte';
	import VolumeControl from '$lib/components/VolumeControl.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{data.mapa.nome} · Spokke</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div data-surface="player" class="flex h-dvh flex-col bg-base-100 lg:h-auto lg:min-h-dvh">
	<header
		class="flex flex-none items-center gap-3 border-b border-line px-4 py-2.5 lg:px-6.5 lg:py-3"
	>
		<a
			href={resolve('/aluno')}
			class="grid size-11 flex-none place-items-center rounded-[11px] border border-line bg-base-200 text-base-content hover:bg-base-300"
			aria-label="Voltar para o painel"
		>
			<svg class="size-[17px]" viewBox="0 0 24 24" fill="none" aria-hidden="true"
				><path
					d="M15 5l-7 7 7 7"
					stroke="currentColor"
					stroke-width="2.2"
					stroke-linecap="round"
					stroke-linejoin="round"
				/></svg
			>
		</a>
		<Logo />
		<span class="min-w-0 flex-1"></span>
		<VolumeControl />
	</header>

	<main
		class="flex min-h-0 flex-1 flex-col px-4 pt-4 lg:flex-none lg:px-6.5 lg:pt-7 lg:pb-7.5"
		aria-label="Mapa do módulo {data.mapa.nome}"
	>
		<div class="mx-auto flex min-h-0 w-full max-w-[880px] flex-1 flex-col">
			<MapaDoModulo
				mapa={data.mapa}
				mundo={data.mundo}
				avatar={data.aluno.avatar}
				nome={data.aluno.nome}
			/>
		</div>
	</main>
</div>
