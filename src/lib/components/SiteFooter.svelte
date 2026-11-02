<script lang="ts">
	import { resolve } from '$app/paths';
	import Logo from './Logo.svelte';
	import { empresa, selos } from '$lib/content/institucional';

	// Rodapé público — mesmo desenho na home e nas páginas institucionais.
	// resolve() roda aqui, na montagem do array, pra cada rota real existir de
	// verdade; os `<a>` abaixo só leem `item.href` como variável.
	const cols = [
		{
			t: 'Produto',
			links: [
				{ href: '/#habilidades', label: 'Habilidades' },
				{ href: '/#player', label: 'Para o aluno' },
				{ href: '/#correcao', label: 'Correção' },
				{ href: '/#idiomas', label: 'Idiomas' },
				// A rota, não a âncora da home: aqui o leitor quer comparar, e a
				// tela de planos é a que tem o detalhe.
				{ href: resolve('/(site)/planos'), label: 'Planos' }
			]
		},
		{
			t: 'Plataforma',
			links: [
				{ href: resolve('/(site)/sobre'), label: 'Sobre' },
				{ href: resolve('/(site)/ajuda'), label: 'Ajuda' },
				{ href: resolve('/(site)/status'), label: 'Status' },
				{ href: resolve('/(site)/contato'), label: 'Contato' }
			]
		},
		{
			t: 'Legal',
			links: [
				{ href: resolve('/(site)/privacidade'), label: 'Privacidade' },
				{ href: resolve('/(site)/termos'), label: 'Termos' },
				{ href: resolve('/(site)/cookies'), label: 'Cookies' },
				{ href: resolve('/(site)/acessibilidade'), label: 'Acessibilidade' }
			]
		}
	];
</script>

<footer class="border-t border-line bg-base-100">
	<div class="mx-auto flex max-w-[1200px] flex-col gap-6 px-7 pt-10 pb-[30px]">
		<div
			class="grid gap-[30px] sm:grid-cols-2 lg:grid-cols-[minmax(220px,1.4fr)_repeat(3,minmax(0,1fr))]"
		>
			<div class="min-w-0">
				<div class="mb-2.5"><Logo size={22} /></div>
				<p class="max-w-[32ch] text-[13px] leading-relaxed text-base-content/65">
					Exercícios de idiomas com o material da aula, para professores autônomos e escolas.
				</p>
			</div>

			{#each cols as col (col.t)}
				<div class="min-w-0">
					<p class="mb-3 text-[11px] font-bold tracking-[0.09em] text-base-content/65 uppercase">
						{col.t}
					</p>
					<nav class="grid justify-items-start gap-[7px] text-[13.5px]">
						<!-- eslint-disable svelte/no-navigation-without-resolve -- col.links mistura âncora de hash (produto) com rotas já resolvidas por resolve() na montagem do array acima. -->
						{#each col.links as l (l.href)}
							<a
								href={l.href}
								class="text-base-content/65 no-underline transition-colors hover:text-primary"
							>
								{l.label}
							</a>
						{/each}
						<!-- eslint-enable svelte/no-navigation-without-resolve -->
					</nav>
				</div>
			{/each}
		</div>

		<!-- A identificação da empresa (Decreto 7.962/2013: nome empresarial e CNPJ
		     em local visível) no lugar do "Todos os sistemas operando", que era um
		     ponto verde fixo dizendo algo que ninguém media. -->
		<div class="flex flex-wrap items-center gap-x-[18px] gap-y-2.5 border-t border-line pt-[18px]">
			<span class="text-[12.5px] text-base-content/65">
				© 2026 {empresa.legalName} · {empresa.legalDoc}
			</span>
			{#if selos.length > 0}
				<div class="flex-1"></div>
				<!-- eslint-disable svelte/no-navigation-without-resolve -- a verificação é a página EXTERNA do emissor do selo. -->
				<ul class="flex list-none flex-wrap items-center gap-4 p-0" aria-label="Selos">
					{#each selos as selo (selo.nome)}
						<li>
							<a
								href={selo.verificacao}
								target="_blank"
								rel="noopener noreferrer"
								title={selo.nome}
							>
								<img
									src="/selos/{selo.imagem}"
									alt={selo.nome}
									width={selo.largura}
									height={selo.altura}
									loading="lazy"
								/>
							</a>
						</li>
					{/each}
				</ul>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			{/if}
		</div>
	</div>
</footer>
