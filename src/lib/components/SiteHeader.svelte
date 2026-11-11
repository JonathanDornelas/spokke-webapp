<script lang="ts">
	import type { Snippet } from 'svelte';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Logo from './Logo.svelte';
	import Button from './Button.svelte';

	interface NavItem {
		href: string;
		label: string;
	}

	// Cabeçalho público — mesmo desenho na home e nas páginas institucionais
	// (paginas.md "Grupo (site)"). O default aponta pra seções da home; quem usa
	// fora dela (paginas.md "Grupo (site)") passa a própria nav. `extra` é o único ponto de
	// extensão: só a home usa (o toggle de tema manual — home.md "Toggle de
	// tema" — é exclusivo dela, as páginas institucionais seguem o sistema).
	// Âncoras da home, mais "Planos" e "Blog". Planos leva à seção da home; o
	// Blog é ROTA, resolvida aqui, e fica por último, como no desenho do Claude
	// Design. Quem passa a própria nav põe o Blog nela (o layout de (site) põe).
	const defaultNav: NavItem[] = [
		{ href: '/#habilidades', label: 'Habilidades' },
		{ href: '/#player', label: 'Para o aluno' },
		{ href: '/#correcao', label: 'Correção' },
		{ href: '/#idiomas', label: 'Idiomas' },
		{ href: '/#planos', label: 'Planos' },
		{ href: resolve('/(site)/blog'), label: 'Blog' }
	];

	let { nav = defaultNav, extra }: { nav?: NavItem[]; extra?: Snippet } = $props();

	const itens = $derived(nav);

	/** A rota em que se está (as âncoras da home nunca contam). */
	function atual(href: string): boolean {
		if (href.includes('#')) return false;
		return page.url.pathname === href || page.url.pathname.startsWith(`${href}/`);
	}

	// No celular a navegação vive num menu (o "Blog Cabecalho" do Claude
	// Design): na largura de um telefone, os links e o "Entrar no Studio" não
	// cabem ao lado da marca.
	let menuAberto = $state(false);
	const idDoMenu = $props.id();
</script>

<svelte:window
	onkeydown={(e) => {
		if (menuAberto && e.key === 'Escape') menuAberto = false;
	}}
/>

<header class="sticky top-0 z-[60] border-b border-line bg-base-100/85 backdrop-blur-md">
	<div class="flex flex-wrap items-center gap-x-5 gap-y-3 px-7 py-3.5">
		<Logo size={26} />

		<div class="flex-1"></div>

		<nav
			aria-label="Principal"
			class="hidden flex-wrap gap-x-[18px] gap-y-1.5 text-sm text-base-content/65 md:flex"
		>
			{#each itens as item (item.href)}
				<!-- eslint-disable svelte/no-navigation-without-resolve -- item.href vem de um array (âncora de hash pra home ou rota já resolvida por quem monta a nav), não é literal aqui. -->
				<a
					href={item.href}
					aria-current={atual(item.href) ? 'page' : undefined}
					class="text-inherit no-underline transition-colors hover:text-primary aria-[current=page]:font-bold aria-[current=page]:text-primary"
				>
					{item.label}
				</a>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			{/each}
		</nav>

		{#if extra}{@render extra()}{/if}

		<!-- O invólucro esconde no celular: um `hidden` no próprio botão brigaria com o display do `.btn`. -->
		<div class="hidden md:block">
			<Button href={resolve('/(studio)/inicio')} class="no-underline">Entrar no Studio</Button>
		</div>

		<button
			type="button"
			class="grid size-11 motion-tap place-items-center rounded-field border border-line text-base-content md:hidden"
			aria-expanded={menuAberto}
			aria-controls={idDoMenu}
			aria-label={menuAberto ? 'Fechar o menu' : 'Abrir o menu'}
			onclick={() => (menuAberto = !menuAberto)}
		>
			<svg class="size-[18px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
				{#if menuAberto}
					<path
						d="M6 6l12 12M18 6L6 18"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
					/>
				{:else}
					<path
						d="M4 7h16M4 12h16M4 17h16"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
					/>
				{/if}
			</svg>
		</button>
	</div>

	{#if menuAberto}
		<nav
			id={idDoMenu}
			aria-label="Principal"
			class="grid animate-entrada-curta border-t border-line px-[18px] pt-1 pb-[18px] md:hidden"
		>
			{#each itens as item (item.href)}
				<!-- eslint-disable svelte/no-navigation-without-resolve -- item.href vem de um array (âncora ou rota já resolvida). -->
				<a
					href={item.href}
					aria-current={atual(item.href) ? 'page' : undefined}
					onclick={() => (menuAberto = false)}
					class="flex min-h-12 items-center border-b border-line text-base text-base-content no-underline aria-[current=page]:font-bold aria-[current=page]:text-primary"
				>
					{item.label}
				</a>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			{/each}
			<Button href={resolve('/(studio)/inicio')} size="lg" class="mt-2.5 w-full no-underline"
				>Entrar no Studio</Button
			>
		</nav>
	{/if}
</header>
