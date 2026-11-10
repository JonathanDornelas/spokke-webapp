<script lang="ts">
	// A prévia do mapa do aluno para o professor (docs/telas-modulos-professor.md
	// 2.6). É uma tela FECHADA sobre o módulo, como a prévia da atividade: sem a
	// barra lateral do Studio (o `@` reseta para o layout raiz), e a saída é um X
	// que volta para o módulo. Nenhuma fase tem ação, e nenhum progresso aparece.
	import { resolve } from '$app/paths';
	import Logo from '$lib/components/Logo.svelte';
	import MapaDoModulo from '$lib/components/MapaDoModulo.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>Prévia do mapa · {data.mapa.nome} · Spokke</title></svelte:head>

<div data-surface="player" class="flex h-dvh flex-col bg-base-100 lg:h-auto lg:min-h-dvh">
	<header
		class="flex flex-none items-center gap-3 border-b border-line px-4 py-2.5 lg:px-6.5 lg:py-3"
	>
		<Logo />
		<span
			class="rounded-full border border-line bg-base-200 px-2.75 py-1 text-[12px] font-bold text-base-content/70"
			>Prévia · {data.mapa.turma}</span
		>
		<span class="min-w-0 flex-1"></span>
		<a
			href={resolve('/(studio)/modulos/[id]', { id: data.mapa.id })}
			class="grid size-11 flex-none place-items-center rounded-[11px] border border-line bg-base-200 text-base-content hover:bg-base-300"
			aria-label="Fechar a prévia e voltar ao módulo"
		>
			<svg class="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true"
				><path
					d="M6 6l12 12M18 6L6 18"
					stroke="currentColor"
					stroke-width="2.2"
					stroke-linecap="round"
				/></svg
			>
		</a>
	</header>

	<main class="flex min-h-0 flex-1 flex-col px-4 pt-4 lg:flex-none lg:px-6.5 lg:pt-7 lg:pb-7.5">
		<div class="mx-auto flex min-h-0 w-full max-w-[880px] flex-1 flex-col">
			<MapaDoModulo mapa={data.mapa} previa />
		</div>
	</main>
</div>
