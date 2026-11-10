<script lang="ts">
	// Casca do Studio. Duas navegações, não uma responsiva: no desktop a barra
	// LATERAL fixa; no celular, barra inferior de abas mais um drawer no
	// hambúrguer. O WIZARD DE CRIAÇÃO NÃO USA ESTE LAYOUT — durante a criação o
	// professor tem uma tarefa só (paginas.md "Studio").
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import Logo from '$lib/components/Logo.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import AmbientShapes from '$lib/components/AmbientShapes.svelte';
	import StudioSearch from '$lib/components/StudioSearch.svelte';
	import NotificacoesSino from '$lib/components/NotificacoesSino.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import PlanoCard from '$lib/components/PlanoCard.svelte';
	import { authClient } from '$lib/client/auth';
	import { painelLateral, veu } from '$lib/client/transicoes';
	import type { LayoutProps } from './$types';

	// `data` vem de +layout.server.ts — por essa altura a sessão já foi
	// verificada em hooks.server.ts (auth.md: layout nunca é a guarda, só lê).
	let { children, data }: LayoutProps = $props();

	let drawerAberto = $state(false);
	let saindo = $state(false);

	async function sair() {
		saindo = true;
		await authClient.signOut();
		await goto(resolve('/'));
	}

	const nav = $derived([
		// O início: para onde o professor vai ao entrar (paginas.md "Início").
		{ href: resolve('/(studio)/inicio'), label: 'Início', icon: 'inicio' },
		{ href: resolve('/(studio)/atividades'), label: 'Atividades', icon: 'list' },
		// Módulos: coleções de atividades. No celular ficam na gaveta (a barra de abas tem 4).
		{ href: resolve('/(studio)/modulos'), label: 'Módulos', icon: 'modulo' },
		{ href: resolve('/(studio)/turmas'), label: 'Turmas', icon: 'turma' },
		{ href: resolve('/(studio)/resultados'), label: 'Resultados', icon: 'chart' },
		{ href: resolve('/(studio)/materiais'), label: 'Materiais', icon: 'book' },
		// A área da coordenação só aparece para quem coordena uma escola — a
		// barreira de verdade é `requireCoordenacao` no servidor.
		...(data.coordena
			? [{ href: resolve('/(studio)/escola'), label: 'Escola', icon: 'escola' }]
			: []),
		{ href: resolve('/(studio)/assinatura'), label: 'Assinatura', icon: 'gear' }
	]);
	// No celular a barra tem quatro alvos: mais que isso vira alvo pequeno
	// demais. O início é o primeiro, porque é onde o professor chega; a conta não
	// precisa de aba — o avatar do cabeçalho já leva a ela, e a assinatura mora
	// dentro dela. Materiais e módulos ficam na gaveta: são trabalho de mesa.
	const abas = [
		{ href: resolve('/(studio)/inicio'), label: 'Início', icon: 'inicio' },
		{ href: resolve('/(studio)/atividades'), label: 'Atividades', icon: 'list' },
		{ href: resolve('/(studio)/turmas'), label: 'Turmas', icon: 'turma' },
		{ href: resolve('/(studio)/resultados'), label: 'Resultados', icon: 'chart' }
	];

	const paths: Record<string, string> = {
		inicio: 'M4 11l8-6.5 8 6.5V20h-5.5v-5h-5v5H4z',
		list: 'M3 4h18v16H3zM7 9h10M7 13h6',
		modulo: 'M4 7.5l8-4 8 4-8 4zM4 12l8 4 8-4M4 16.5l8 4 8-4',
		escola: 'M12 3.5l9 4.5-9 4.5-9-4.5zM6 11v5.5c0 1.7 2.7 3 6 3s6-1.3 6-3V11',
		chart: 'M4 18V9M10 18V4M16 18v-6M22 18v-9',
		book: 'M3 5.5h6a3 3 0 013 3v10a2.5 2.5 0 00-2.5-2.5H3zM21 5.5h-6a3 3 0 00-3 3v10a2.5 2.5 0 012.5-2.5H21z',
		gear: 'M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2 2M16.4 16.4l2 2M18.4 5.6l-2 2M7.6 16.4l-2 2',
		user: 'M4.5 20v-1.5a5 5 0 015-5h5a5 5 0 015 5V20',
		turma:
			'M3 19.5v-1a4 4 0 014-4h4a4 4 0 014 4v1M9 10.5a3 3 0 100-6 3 3 0 000 6zM16.5 14.2a4 4 0 014.5 4v1.3M16 4.7a3 3 0 010 5.8'
	};

	const ativo = (href: string) => page.url.pathname.startsWith(href);

	// O rótulo da rota atual alimenta o breadcrumb do topo. Rota que não tem
	// item de menu próprio empresta o rótulo de onde ela pertence — o aluno
	// mora dentro de Turmas, e sem isto o breadcrumb saía "Studio › Studio". A
	// conta também: ela saiu da barra de abas do celular (o avatar leva a ela).
	const emprestados: [string, string][] = [
		[resolve('/(studio)/alunos'), 'Turmas'],
		[resolve('/(studio)/conta'), 'Conta']
	];
	const atual = $derived(
		[...nav, ...abas].find((i) => ativo(i.href))?.label ??
			emprestados.find(([href]) => ativo(href))?.[1] ??
			'Studio'
	);
</script>

<!-- O painel do professor não aparece em busca: tudo aqui é conta de alguém. -->
<svelte:head><meta name="robots" content="noindex" /></svelte:head>

{#snippet icone(nome: string, size = 17)}
	<svg
		class="shrink-0"
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="none"
		aria-hidden="true"
	>
		{#if nome === 'list'}
			<rect x="3" y="4" width="18" height="16" rx="3" stroke="currentColor" stroke-width="2" />
		{/if}
		{#if nome === 'gear'}
			<circle cx="12" cy="12" r="3.2" stroke="currentColor" stroke-width="2" />
		{/if}
		{#if nome === 'user'}
			<circle cx="12" cy="8" r="3.5" stroke="currentColor" stroke-width="2" />
		{/if}
		<path
			d={paths[nome]}
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
		/>
	</svg>
{/snippet}

{#snippet listaNav(itens: typeof nav, aoClicar?: () => void)}
	{#each itens as item (item.href)}
		<!-- Sem fundo: as formas de ambiente atravessam a lateral inteira e só o
		     TEXTO fica por cima delas. Item ativo se distingue por peso e cor,
		     mais o filete à esquerda — não por um bloco opaco. -->
		<a
			href={item.href}
			onclick={aoClicar}
			class="relative flex items-center gap-[11px] rounded-[9px] px-3 py-2.5 text-sm no-underline transition-colors
			       {ativo(item.href)
				? 'font-bold text-primary'
				: 'text-base-content/70 hover:text-base-content'}"
			aria-current={ativo(item.href) ? 'page' : undefined}
		>
			{#if ativo(item.href)}
				<span
					class="absolute inset-y-1.5 start-0 w-[3px] rounded-full bg-primary"
					aria-hidden="true"
				></span>
			{/if}
			{@render icone(item.icon)}
			<span class="flex-1">{item.label}</span>
			{#if item.label === 'Resultados' && data.aCorrigir > 0}
				<span
					class="grid min-w-5 place-items-center rounded-full bg-warning/20 px-1.5 py-0.5 text-[11px] font-bold text-warning"
				>
					{data.aCorrigir}
				</span>
			{/if}
			{#if item.label === 'Módulos' && data.modulosComFalha > 0}
				<!-- O envio programado que não saiu: o único estado de módulo que pede
				     ação, e por isso o único em vermelho (docs/telas-modulos-professor.md). -->
				<span
					class="grid size-5 place-items-center rounded-full bg-error text-[11px] font-bold text-error-content"
					aria-label="{data.modulosComFalha} {data.modulosComFalha === 1
						? 'liberação que não aconteceu'
						: 'liberações que não aconteceram'}"
				>
					{data.modulosComFalha}
				</span>
			{/if}
		</a>
	{/each}
{/snippet}

{#snippet cartaoPlano()}
	<!-- Plano, uso do estoque e créditos — o mesmo estado que decide os
	     bloqueios (`can()`), montado no servidor (+layout.server.ts). -->
	<PlanoCard acesso={data.acesso} />
{/snippet}

<div class="flex min-h-screen bg-base-100">
	<!-- Barra lateral: só desktop, e FIXA. `sticky` com `h-dvh` em vez de
	     `fixed`: ela continua ocupando a coluna do flex, então o conteúdo não
	     precisa de margem compensatória — que é o que sai errado no primeiro
	     leiaute novo que alguém escrever. `overflow-y-auto` porque um menu mais
	     longo que a tela precisa rolar SOZINHO, sem levar a página junto. -->
	<!-- Sem `relative` junto: as duas classes disputam a mesma propriedade e
	     quem vence é a ordem do CSS, não a da lista. `sticky` já cria o bloco
	     de contenção que as formas de ambiente precisam. `self-start` porque um
	     item de flex esticado (o padrão) não gruda. -->
	<aside
		class="sticky top-0 hidden h-dvh w-[232px] shrink-0 flex-col self-start overflow-x-hidden overflow-y-auto border-e border-line lg:flex"
	>
		<!-- A faixa decorativa cobre a coluna INTEIRA, atrás de tudo: é ela que
		     dá vida ao vazio da lateral (design-system.md "Formas de ambiente"). -->
		<AmbientShapes layout="column" scale={0.66} />

		<div class="relative z-1 flex items-center gap-[9px] px-[18px] pt-5 pb-[18px]">
			<Logo size={22} />
		</div>

		<div class="relative z-1 px-3.5 pb-4">
			<a
				href={resolve('/(studio)/atividades/nova')}
				class="btn h-[42px] w-full motion-tap gap-2 btn-primary font-bold no-underline"
			>
				<svg class="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<path
						d="M12 5v14M5 12h14"
						stroke="currentColor"
						stroke-width="2.2"
						stroke-linecap="round"
					/>
				</svg>
				Nova atividade
			</a>
		</div>

		<nav class="relative z-1 grid gap-0.5 px-2.5">{@render listaNav(nav)}</nav>

		<div class="min-h-[120px] flex-1"></div>

		<div class="relative z-1 px-3.5 pb-3">{@render cartaoPlano()}</div>

		<div class="relative z-1 flex items-center gap-2.5 px-4 py-3.5">
			<Avatar
				codigo={data.teacher.avatar}
				nome={data.teacher.name}
				size={32}
				radius="rounded-full"
				class="shrink-0"
			/>
			<a
				href={resolve('/(studio)/conta')}
				class="min-w-0 flex-1 text-[12.5px] leading-tight no-underline"
			>
				<span class="block truncate font-semibold text-base-content">{data.teacher.name}</span>
				<span class="block truncate text-base-content/65">{data.teacher.email}</span>
			</a>
			<button
				type="button"
				onclick={sair}
				disabled={saindo}
				class="grid size-7 shrink-0 place-items-center rounded-field text-base-content/50 transition-colors hover:bg-base-200 hover:text-error"
				aria-label="Sair"
			>
				<svg class="size-[15px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<path
						d="M9 4.5H5.5a1 1 0 00-1 1v13a1 1 0 001 1H9M15.5 16l4-4-4-4M19 12H8.5"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
			</button>
		</div>
	</aside>

	<div class="flex min-w-0 flex-1 flex-col">
		<!-- Topo do celular: hambúrguer, marca, notificação e avatar. -->
		<header class="flex items-center gap-3 border-b border-line px-4 py-3 lg:hidden">
			<button
				type="button"
				onclick={() => (drawerAberto = true)}
				class="grid size-9 shrink-0 place-items-center rounded-field border border-line text-base-content"
				aria-label="Abrir menu"
			>
				<svg class="size-[18px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<path
						d="M4 7h16M4 12h16M4 17h16"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
					/>
				</svg>
			</button>
			<Logo size={22} />
			<div class="flex-1"></div>
			<ThemeToggle />
			<NotificacoesSino />
			<a
				href={resolve('/(studio)/conta')}
				class="shrink-0 rounded-full no-underline"
				aria-label="Sua conta"
			>
				<Avatar
					codigo={data.teacher.avatar}
					nome={data.teacher.name}
					size={36}
					radius="rounded-full"
				/>
			</a>
		</header>

		<!-- Topo do desktop: trilha, busca, notificação e ajuda. -->
		<header class="hidden items-center gap-4 px-[30px] py-[13px] lg:flex">
			<nav class="flex items-center gap-[9px] text-[13px]" aria-label="Trilha">
				<a href={resolve('/(studio)/inicio')} class="text-base-content/60 no-underline">Studio</a>
				<svg
					class="size-3.5 text-base-content/40"
					viewBox="0 0 24 24"
					fill="none"
					aria-hidden="true"
				>
					<path
						d="M9 5l7 7-7 7"
						stroke="currentColor"
						stroke-width="2.2"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
				<span class="font-semibold text-base-content">{atual}</span>
			</nav>
			<div class="flex-1"></div>
			<StudioSearch />
			<NotificacoesSino />
			<ThemeToggle />
			<a
				href={resolve('/(site)/ajuda')}
				class="text-[13px] font-semibold text-base-content no-underline">Ajuda</a
			>
		</header>

		<main class="min-w-0 flex-1 pb-[76px] lg:pb-0">{@render children()}</main>

		<footer
			class="hidden flex-wrap items-center gap-x-[18px] gap-y-2 px-[30px] py-[15px] text-[12.5px] text-base-content/60 lg:flex"
		>
			<span>Copyright © 2026 Spokke. Todos os direitos reservados.</span>
			<a href={resolve('/(site)/privacidade')} class="text-inherit no-underline">Privacidade</a>
			<a href={resolve('/(site)/termos')} class="text-inherit no-underline">Termos</a>
			<a href={resolve('/(site)/ajuda')} class="text-inherit no-underline">Central de ajuda</a>
		</footer>
	</div>
</div>

<!-- Barra de abas do celular. -->
<nav
	class="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-line bg-base-100 lg:hidden"
	aria-label="Navegação"
>
	{#each abas as aba (aba.href)}
		<a
			href={aba.href}
			class="relative flex flex-col items-center gap-1 py-2.5 text-[11px] no-underline
			       {ativo(aba.href) ? 'font-bold text-primary' : 'text-base-content/60'}"
			aria-current={ativo(aba.href) ? 'page' : undefined}
		>
			{@render icone(aba.icon, 20)}
			{aba.label}
			{#if aba.label === 'Resultados' && data.aCorrigir > 0}
				<span
					class="absolute top-1 right-1/2 grid size-[18px] translate-x-[18px] place-items-center rounded-full bg-warning text-[10px] font-bold text-warning-content"
				>
					{data.aCorrigir}
				</span>
			{/if}
		</a>
	{/each}
</nav>

{#if drawerAberto}
	<!-- Drawer do hambúrguer: as entradas que não cabem na barra de abas. -->
	<div class="fixed inset-0 z-50 lg:hidden">
		<!-- Véu e gaveta ENTRAM e SAEM (`$lib/client/transicoes.ts`): aparecer de
		     uma vez parecia a tela piscando, e sumir de uma vez, um travamento. -->
		<button
			type="button"
			onclick={() => (drawerAberto = false)}
			class="absolute inset-0 bg-overlay"
			aria-label="Fechar menu"
			in:veu
			out:veu
		></button>
		<div
			class="absolute inset-y-0 start-0 flex w-[268px] flex-col bg-base-100 shadow-[0_0_40px_-8px_rgba(0,0,0,0.25)]"
			in:painelLateral={{ lado: 'inicio' }}
			out:painelLateral={{ lado: 'inicio' }}
		>
			<div class="flex items-center gap-2 px-[18px] pt-5 pb-4">
				<Logo size={22} />
				<div class="flex-1"></div>
				<button
					type="button"
					onclick={() => (drawerAberto = false)}
					class="grid size-8 place-items-center rounded-field text-base-content/60"
					aria-label="Fechar menu"
				>
					<svg class="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
						<path
							d="M6 6l12 12M18 6L6 18"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
						/>
					</svg>
				</button>
			</div>

			<div class="px-3.5 pb-4">
				<a
					href={resolve('/(studio)/atividades/nova')}
					onclick={() => (drawerAberto = false)}
					class="btn h-[42px] w-full motion-tap gap-2 btn-primary font-bold no-underline"
				>
					<svg class="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
						<path
							d="M12 5v14M5 12h14"
							stroke="currentColor"
							stroke-width="2.2"
							stroke-linecap="round"
						/>
					</svg>
					Nova atividade
				</a>
			</div>

			<nav class="grid gap-0.5 px-2.5">
				{@render listaNav(nav, () => (drawerAberto = false))}
			</nav>

			<div class="flex-1"></div>
			<div class="px-3.5 pb-3">{@render cartaoPlano()}</div>
			<div class="flex items-center gap-2.5 border-t border-line px-4 py-3.5">
				<Avatar
					codigo={data.teacher.avatar}
					nome={data.teacher.name}
					size={32}
					radius="rounded-full"
					class="shrink-0"
				/>
				<div class="min-w-0 flex-1 text-[12.5px] leading-tight">
					<span class="block truncate font-semibold">{data.teacher.name}</span>
					<span class="block truncate text-base-content/65">{data.teacher.email}</span>
				</div>
				<button
					type="button"
					onclick={sair}
					disabled={saindo}
					class="grid size-8 shrink-0 place-items-center rounded-field text-base-content/50 hover:text-error"
					aria-label="Sair"
				>
					<svg class="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
						<path
							d="M9 4.5H5.5a1 1 0 00-1 1v13a1 1 0 001 1H9M15.5 16l4-4-4-4M19 12H8.5"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
				</button>
			</div>
		</div>
	</div>
{/if}
