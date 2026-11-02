<script lang="ts">
	import type { Snippet } from 'svelte';
	import { resolve } from '$app/paths';
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
	// Âncoras da home, mais "Planos" — a única entrada da nav que é uma ROTA, e
	// por isso resolvida aqui: na home ela leva à seção; fora dela, à tela de
	// planos, que é onde o detalhe mora.
	const defaultNav: NavItem[] = [
		{ href: '/#habilidades', label: 'Habilidades' },
		{ href: '/#player', label: 'Para o aluno' },
		{ href: '/#correcao', label: 'Correção' },
		{ href: '/#idiomas', label: 'Idiomas' },
		{ href: '/#planos', label: 'Planos' }
	];

	let { nav = defaultNav, extra }: { nav?: NavItem[]; extra?: Snippet } = $props();
</script>

<header
	class="sticky top-0 z-[60] flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-line
	       bg-base-100/85 px-7 py-3.5 backdrop-blur-md"
>
	<Logo size={26} />

	<div class="flex-1"></div>

	<nav class="hidden flex-wrap gap-x-[18px] gap-y-1.5 text-sm text-base-content/65 md:flex">
		{#each nav as item (item.href)}
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- item.href vem de um array (âncora de hash pra home ou rota já resolvida por quem monta a nav), não é literal aqui. -->
			<a href={item.href} class="text-inherit no-underline transition-colors hover:text-primary">
				{item.label}
			</a>
		{/each}
	</nav>

	{#if extra}{@render extra()}{/if}

	<Button href={resolve('/(studio)/inicio')} class="no-underline">Entrar no Studio</Button>
</header>
