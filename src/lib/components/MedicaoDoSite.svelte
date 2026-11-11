<script lang="ts">
	// O aviso de medição e a medição em si (Google Analytics 4), montados uma vez
	// no layout raiz. Sem `PUBLIC_GA_ID` (o estado de fábrica) não aparece aviso
	// e nada carrega. Com ele, o aviso aparece só nas páginas públicas
	// (`rotaMedida`) e o script só entra depois do "Aceitar": recusar é tão fácil
	// quanto aceitar, e o site continua igual (docs/operacao.md "Analytics").
	//
	// Os cliques medidos são marcados no próprio HTML (`data-evento`, com
	// `data-rotulo` e `data-artigo`), e um ouvinte só, aqui, os registra: a tela
	// não importa nada de medição para ganhar um evento.
	//
	// A cada troca de tela o envio é ligado ou DESLIGADO (`ligarEnvio`): o gtag.js
	// continua na página depois de uma navegação do SvelteKit, e a medição
	// automática dele seguiria quem aceitou na home e entrou no Studio pelo link.
	import { onMount } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { env } from '$env/dynamic/public';
	import {
		EVENTO_DE_PREFERENCIAS,
		carregarGa,
		gravarEscolha,
		idValido,
		lerEscolha,
		ligarEnvio,
		registrarEvento,
		registrarPagina,
		revogar,
		rotaMedida,
		type Escolha
	} from '$lib/client/medicao';

	const id = env.PUBLIC_GA_ID?.trim() ?? '';
	const ligada = idValido(id);

	let pronto = $state(false);
	let escolha = $state<Escolha | null>(null);
	const medida = $derived(rotaMedida(page.route.id));
	const mostrarAviso = $derived(ligada && pronto && medida && escolha === null);

	// Na página medida, liga o envio, carrega o gtag.js (uma vez) e registra a
	// visualização; nas outras, só desliga o envio.
	function acompanhar() {
		if (!ligada || escolha !== 'aceito') return;
		const medida = rotaMedida(page.route.id);
		ligarEnvio(id, medida);
		if (!medida) return;
		carregarGa(id);
		registrarPagina();
	}

	function decidir(nova: Escolha) {
		escolha = nova;
		gravarEscolha(nova);
		if (nova === 'aceito') acompanhar();
		else revogar();
	}

	onMount(() => {
		if (!ligada) return;
		escolha = lerEscolha();
		pronto = true;
		acompanhar();

		const reabrir = () => {
			revogar();
			gravarEscolha(null);
			escolha = null;
		};
		const clique = (e: MouseEvent) => {
			const alvo =
				e.target instanceof Element ? e.target.closest<HTMLElement>('[data-evento]') : null;
			if (!alvo?.dataset.evento) return;
			const parametros: Record<string, string> = {};
			if (alvo.dataset.rotulo) parametros.rotulo = alvo.dataset.rotulo;
			if (alvo.dataset.artigo) parametros.artigo = alvo.dataset.artigo;
			registrarEvento(alvo.dataset.evento, parametros);
		};
		addEventListener(EVENTO_DE_PREFERENCIAS, reabrir);
		document.addEventListener('click', clique, { capture: true });
		return () => {
			removeEventListener(EVENTO_DE_PREFERENCIAS, reabrir);
			document.removeEventListener('click', clique, { capture: true });
		};
	});

	// A troca de tela do SvelteKit não recarrega o documento: cada navegação é
	// um page_view, se a página de destino é medida e a pessoa aceitou — e, se
	// não é medida, o momento de desligar o envio.
	afterNavigate(({ from }) => {
		if (from) acompanhar();
	});
</script>

{#if mostrarAviso}
	<div
		role="region"
		aria-label="Aviso de medição de audiência"
		class="fixed inset-x-3 bottom-3 z-[70] mx-auto flex max-w-[720px] animate-entrada-curta flex-wrap items-center gap-x-5 gap-y-2 rounded-[14px] border border-line bg-card px-4 py-2.5 shadow-[0_18px_40px_-24px_rgb(var(--shadow)/0.5)] sm:px-5 sm:py-3"
	>
		<!-- Curto de propósito: no celular o aviso não pode passar de um oitavo da
		     altura da tela (docs/blog.md, "Nada que cubra o texto no celular"). -->
		<p class="min-w-0 flex-[1_1_300px] text-[13px] leading-snug text-base-content/80">
			Só medimos as visitas, com o Google Analytics, se você aceitar.
			<a
				href={resolve('/(site)/cookies')}
				class="font-semibold text-primary underline underline-offset-2">Cookies</a
			>
		</p>
		<div class="flex gap-2">
			<button
				type="button"
				class="btn btn-sm motion-tap btn-plain"
				onclick={() => decidir('recusado')}
			>
				Recusar
			</button>
			<button
				type="button"
				class="btn btn-sm motion-tap btn-primary"
				onclick={() => decidir('aceito')}
			>
				Aceitar
			</button>
		</div>
	</div>
{/if}
