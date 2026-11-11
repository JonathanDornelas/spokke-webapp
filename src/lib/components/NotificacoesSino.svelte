<script lang="ts">
	// O SINO do cabeçalho do Studio (docs/notificacoes.md). O número é o de não
	// lidas; abrir mostra as últimas, as não lidas primeiro. Abrir uma notificação
	// a marca como lida e leva à tela onde a coisa se resolve — o sino não resolve
	// nada sozinho, ele aponta.
	//
	// Atualiza sozinho a cada minuto com a aba à vista, e ao abrir: quem dispara
	// os avisos é o Player, o worker e a fila, noutros processos.
	import { resolve } from '$app/paths';
	import {
		notificacoesDoSino,
		marcarNotificacaoLida,
		marcarTodasLidas
	} from '../../routes/(studio)/studio.remote';
	import Loading from './Loading.svelte';
	import { AVISOS_LIDOS, avisarQueLeu } from '$lib/client/avisos';
	import type { Destino, NotificacaoNaTela } from '$lib/notificacoes';

	let { class: className = '' }: { class?: string } = $props();

	const sino = notificacoesDoSino();
	let aberto = $state(false);
	let marcandoTodas = $state(false);
	/** Lidas nesta sessão de tela, antes de o servidor responder de novo. */
	let lidasAqui = $state<string[]>([]);
	const painelId = $props.id();

	const itens = $derived(
		(sino.current?.itens ?? []).map((n) => (lidasAqui.includes(n.id) ? { ...n, lida: true } : n))
	);
	const naoLidas = $derived(
		Math.max(
			0,
			(sino.current?.naoLidas ?? 0) -
				(sino.current?.itens ?? []).filter((n) => !n.lida && lidasAqui.includes(n.id)).length
		)
	);

	$effect(() => {
		const id = setInterval(() => {
			if (document.visibilityState === 'visible') void sino.refresh();
		}, 60_000);
		// Uma tela de destino marcou algo como visto (`$lib/client/avisos.ts`).
		const recarregar = () => void sino.refresh();
		window.addEventListener(AVISOS_LIDOS, recarregar);
		return () => {
			clearInterval(id);
			window.removeEventListener(AVISOS_LIDOS, recarregar);
		};
	});

	async function alternar() {
		aberto = !aberto;
		if (aberto) {
			lidasAqui = [];
			await sino.refresh();
		}
	}

	function hrefDe(destino: Destino): string {
		switch (destino.rota) {
			case 'resultados':
				return resolve('/(studio)/resultados/[activityId]', { activityId: destino.activityId });
			case 'modulo':
				return (
					resolve('/(studio)/modulos/[id]', { id: destino.moduleId }) +
					'?turma=' +
					encodeURIComponent(destino.allocationId)
				);
			case 'atividade':
				return resolve('/(studio)/atividades/[id]', { id: destino.activityId });
			case 'turma':
				return resolve('/(studio)/turmas/[id]', { id: destino.classroomId });
			case 'assinatura':
				return resolve('/(studio)/conta') + '?aba=assinatura';
			case 'escola':
				return resolve('/(studio)/escola');
			case 'planos':
				return resolve('/(site)/planos');
		}
	}

	function abrir(n: NotificacaoNaTela) {
		aberto = false;
		if (n.lida) return;
		lidasAqui = [...lidasAqui, n.id];
		// Não espera: a navegação segue, e o número já caiu na tela. Gravado, os
		// números da barra lateral (a mesma consulta, no layout) caem também.
		marcarNotificacaoLida({ id: n.id })
			.then(avisarQueLeu)
			.catch(() => {});
	}

	async function lerTodas() {
		marcandoTodas = true;
		try {
			await marcarTodasLidas();
			// O sino espera a lista nova antes de soltar o botão; o evento é para o
			// layout, cujos números da barra lateral saem da mesma consulta.
			await sino.refresh();
			avisarQueLeu();
		} finally {
			marcandoTodas = false;
		}
	}

	function haQuanto(iso: string): string {
		const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
		if (min < 1) return 'agora';
		if (min < 60) return `há ${min} min`;
		const h = Math.round(min / 60);
		if (h < 24) return `há ${h} h`;
		const d = Math.round(h / 24);
		if (d === 1) return 'ontem';
		if (d < 7) return `há ${d} dias`;
		return new Date(iso).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });
	}
</script>

<!-- `onfocusout` no container, como a busca: clicar num item tira o foco do
     botão, e fechar ali fecharia o painel antes de o clique chegar. -->
<div
	class="relative {className}"
	onfocusout={(e) => {
		if (!e.currentTarget.contains(e.relatedTarget as Node)) aberto = false;
	}}
	onkeydown={(e) => {
		if (e.key === 'Escape' && aberto) {
			aberto = false;
			(e.currentTarget.querySelector('button') as HTMLButtonElement | null)?.focus();
		}
	}}
	role="presentation"
>
	<button
		type="button"
		onclick={alternar}
		aria-expanded={aberto}
		aria-controls={painelId}
		aria-label={naoLidas > 0 ? `Notificações, ${naoLidas} não lidas` : 'Notificações'}
		class="relative grid size-9 place-items-center rounded-full bg-base-200 text-base-content/70 transition-colors hover:text-primary"
	>
		<svg class="size-[17px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
			<path
				d="M6 9a6 6 0 1112 0c0 4 1.5 5.5 1.5 5.5h-15S6 13 6 9zM10 18.5a2 2 0 004 0"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		</svg>
		{#if naoLidas > 0}
			<span
				class="absolute -end-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-primary px-1 font-mono text-[10.5px] leading-none font-bold text-primary-content"
				aria-hidden="true">{naoLidas > 9 ? '9+' : naoLidas}</span
			>
		{/if}
	</button>

	{#if aberto}
		<div
			id={painelId}
			class="fixed inset-x-3 top-[62px] z-50 animate-entrada-curta overflow-hidden rounded-box border border-line bg-base-100 shadow-[0_18px_44px_-24px_rgb(var(--shadow)/0.55)] sm:absolute sm:inset-x-auto sm:end-0 sm:top-[43px] sm:w-[380px]"
		>
			<div class="flex items-center gap-3 border-b border-line bg-base-200 px-4 py-2.5">
				<p class="text-[13.5px] font-bold">Notificações</p>
				<div class="flex-1"></div>
				{#if naoLidas > 0}
					<button
						type="button"
						onclick={lerTodas}
						disabled={marcandoTodas}
						class="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-primary disabled:opacity-60"
					>
						{#if marcandoTodas}<Loading variant="fila" size={9} label="Marcando" />{/if}
						Marcar todas como lidas
					</button>
				{/if}
			</div>

			{#if !sino.current}
				<div class="px-4 py-6"><Loading variant="fila" label="Carregando notificações" /></div>
			{:else if itens.length === 0}
				<p class="px-4 py-6 text-[13px] leading-relaxed text-base-content/65">
					Nada por aqui. Avisamos quando uma resposta pedir correção, uma liberação de módulo não
					acontecer ou um aluno entrar na turma com a conta.
				</p>
			{:else}
				<ul class="max-h-[min(70vh,480px)] list-none overflow-y-auto p-0">
					{#each itens as n (n.id)}
						<li class="border-b border-line last:border-0">
							<!-- eslint-disable svelte/no-navigation-without-resolve -- `hrefDe` resolve cada rota com resolve(); a regra não enxerga através da função. -->
							<a
								href={hrefDe(n.destino)}
								onclick={() => abrir(n)}
								class="flex gap-3 px-4 py-3 text-base-content no-underline transition-colors hover:bg-base-200 {n.lida
									? ''
									: 'bg-primary/5'}"
							>
								<span
									class="mt-0.5 grid size-7 flex-none place-items-center rounded-full {n.tom ===
									'acao'
										? 'bg-primary/12 text-primary'
										: 'bg-base-300 text-base-content/65'}"
									aria-hidden="true"
								>
									<svg class="size-3.5" viewBox="0 0 24 24" fill="none">
										{#if n.tom === 'acao'}
											<path
												d="M12 7.5v5.5M12 16.5h.01"
												stroke="currentColor"
												stroke-width="2.4"
												stroke-linecap="round"
											/>
										{:else}
											<path
												d="M5 12.5l4.5 4.5L19 7"
												stroke="currentColor"
												stroke-width="2.4"
												stroke-linecap="round"
												stroke-linejoin="round"
											/>
										{/if}
									</svg>
								</span>
								<span class="min-w-0 flex-1">
									<span
										class="block text-[13.5px] leading-snug {n.lida ? 'font-medium' : 'font-bold'}"
										>{n.titulo}</span
									>
									{#if n.detalhe}
										<span class="mt-0.5 block text-[12.5px] leading-snug text-base-content/65"
											>{n.detalhe}</span
										>
									{/if}
									<span class="mt-1 block text-[11.5px] text-base-content/55"
										>{haQuanto(n.quando)}{n.lida ? '' : ' · não lida'}</span
									>
								</span>
							</a>
							<!-- eslint-enable svelte/no-navigation-without-resolve -->
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}
</div>
