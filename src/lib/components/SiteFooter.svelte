<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Logo from './Logo.svelte';
	import { env } from '$env/dynamic/public';
	import { EVENTO_DE_PREFERENCIAS, idValido } from '$lib/client/medicao';

	// Com a medição ligada (PUBLIC_GA_ID), o rodapé oferece desfazer a escolha:
	// retirar o consentimento tem de ser tão fácil quanto dar (LGPD, art. 8º, § 5º).
	const medicaoLigada = idValido(env.PUBLIC_GA_ID);
	import {
		dominioDoSite,
		empresa,
		redes,
		selos,
		selosDeVerificacao
	} from '$lib/content/institucional';

	// Os selos verificam o domínio EM QUE O SITE ESTÁ ABERTO: em produção é o
	// domínio real, sem configurar nada no deploy. Em casa (localhost, IP, .local)
	// não há o que verificar, e eles apontam para o domínio do site, para
	// aparecerem iguais no desenvolvimento.
	const dominio = $derived.by(() => {
		const host = page.url.hostname;
		const local =
			host === 'localhost' ||
			host.endsWith('.local') ||
			/^[\d.]+$/.test(host) ||
			host.includes(':');
		return local ? dominioDoSite : host.replace(/^www\./, '');
	});
	const verificacoes = $derived(selosDeVerificacao(dominio));

	const ICONE_DA_REDE = {
		Instagram:
			'M7.5 3.5h9a4 4 0 014 4v9a4 4 0 01-4 4h-9a4 4 0 01-4-4v-9a4 4 0 014-4zM12 8.3a3.7 3.7 0 100 7.4 3.7 3.7 0 000-7.4zM17.2 6.8v.01',
		YouTube:
			'M4.2 7.6c.2-1.3 1.2-2.2 2.5-2.3C8.4 5.1 10.2 5 12 5s3.6.1 5.3.3c1.3.1 2.3 1 2.5 2.3.2 1.4.2 2.9.2 4.4s0 3-.2 4.4c-.2 1.3-1.2 2.2-2.5 2.3-1.7.2-3.5.3-5.3.3s-3.6-.1-5.3-.3c-1.3-.1-2.3-1-2.5-2.3C4 15 4 13.5 4 12s0-3 .2-4.4zM10.3 9.3v5.4l4.6-2.7z',
		// A nota do TikTok no mesmo traço das outras duas: a haste, a bolinha aberta
		// onde ela encosta e a bandeirinha que sai do topo.
		TikTok: 'M13 4v12a4 4 0 11-4-4M13 4c.4 2.9 2.5 4.9 5.5 5.1'
	} as const;

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
				{ href: resolve('/(site)/blog'), label: 'Blog' },
				{ href: resolve('/(site)/ajuda'), label: 'Ajuda' },
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

{#snippet iconeDaRede(nome: keyof typeof ICONE_DA_REDE)}
	<svg class="size-[17px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
		<path
			d={ICONE_DA_REDE[nome]}
			stroke="currentColor"
			stroke-width="1.9"
			stroke-linecap="round"
			stroke-linejoin="round"
		/>
	</svg>
{/snippet}

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
				<!-- Com `url`, link para o perfil em nova aba. Sem ela (perfil que ainda
				     não existe) o ícone fica sem link — nada de `href="#"` levando a lugar
				     nenhum —, com o mesmo hover, para a fileira não mudar quando ele entrar. -->
				<ul class="mt-4 flex list-none gap-2 p-0" aria-label="Redes sociais">
					{#each redes as rede (rede.nome)}
						<li>
							{#if rede.url}
								<!-- eslint-disable svelte/no-navigation-without-resolve -- o perfil é uma página EXTERNA. -->
								<a
									href={rede.url}
									target="_blank"
									rel="noopener noreferrer"
									aria-label="{rede.nome} do Spokke"
									class="grid size-9 motion-tap place-items-center rounded-full border border-line text-base-content/70 hover:-translate-y-0.5 hover:border-primary hover:bg-primary/8 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
								>
									{@render iconeDaRede(rede.nome)}
								</a>
								<!-- eslint-enable svelte/no-navigation-without-resolve -->
							{:else}
								<span
									role="img"
									aria-label="{rede.nome} (em breve)"
									title="{rede.nome}: em breve"
									class="grid size-9 motion-tap place-items-center rounded-full border border-line text-base-content/70 hover:-translate-y-0.5 hover:border-primary hover:bg-primary/8 hover:text-primary"
								>
									{@render iconeDaRede(rede.nome)}
								</span>
							{/if}
						</li>
					{/each}
				</ul>
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

		<!-- A identificação da empresa (o nome empresarial; o CNPJ não aparece no
		     site, a pedido do dono do repositório) no lugar do "Todos os sistemas
		     operando", que era um ponto verde fixo dizendo algo que ninguém media. -->
		<div class="flex flex-wrap items-center gap-x-[18px] gap-y-2.5 border-t border-line pt-[18px]">
			<span class="text-[12.5px] text-base-content/65">
				Copyright © 2026 {empresa.legalName}. Todos os direitos reservados.
			</span>
			{#if medicaoLigada}
				<button
					type="button"
					class="text-[12.5px] text-base-content/65 underline decoration-line underline-offset-[3px] transition-colors hover:text-primary"
					onclick={() => dispatchEvent(new CustomEvent(EVENTO_DE_PREFERENCIAS))}
				>
					Preferências de cookies
				</button>
			{/if}
			<div class="flex-1"></div>
			<!-- Os selos de verificação, no extremo oposto do "©". Cada um leva à
			     verificação AO VIVO do terceiro para este domínio, e o texto convida
			     a conferir em vez de afirmar "site seguro". -->
			<!-- eslint-disable svelte/no-navigation-without-resolve -- a verificação é a página EXTERNA do terceiro. -->
			<ul
				class="flex list-none flex-wrap items-center gap-2.5 p-0"
				aria-label="Selos de verificação"
			>
				{#each verificacoes as selo (selo.nome)}
					<li>
						<!-- O selo é um PNG (2x) branco com borda, que funciona nos dois
						     temas; o `alt` diz o que o link faz, porque a imagem é o
						     próprio link. -->
						<a
							href={selo.verificacao}
							target="_blank"
							rel="noopener noreferrer"
							title="{selo.nome}: {selo.acao}"
							class="block motion-tap rounded-[12px] hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
						>
							<img
								src="/selos/{selo.imagem.arquivo}"
								alt="{selo.nome}: {selo.acao} (abre em nova aba)"
								width={selo.imagem.largura}
								height={selo.imagem.altura}
								loading="lazy"
								class="block"
							/>
						</a>
					</li>
				{/each}
			</ul>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
			{#if selos.length > 0}
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
