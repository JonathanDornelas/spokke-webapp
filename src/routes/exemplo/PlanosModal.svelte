<script lang="ts">
	// Os planos, num modal, no fim da atividade de exemplo. É o momento em que o
	// professor acabou de ver o produto funcionando, e a pergunta seguinte é
	// "quanto custa para levar isto à minha turma".
	//
	// **Um `<dialog>` de verdade**, como o `AvatarEditor`: foco preso, Escape e
	// véu vêm do elemento. E a tabela é a MESMA de `/planos` e da home
	// (`PlanosTabela`): sem `onescolher` (quem não tem conta) o botão leva ao
	// cadastro, que começa no trial; logado, vira um pedido para a equipe, como
	// em `/planos`, porque ainda não há gateway (adr-002-billing.md).
	import { DURACAO } from '$lib/movimento';
	import PlanosTabela from '$lib/components/PlanosTabela.svelte';
	import { ehPlanoPago } from '$lib/billing/catalogo';
	import type { CicloDeCobranca, PlanoId } from '$lib/content/planos';
	import { solicitarPlano } from '../(studio)/conta/conta.remote';

	let { aberto = $bindable(false), logado = false }: { aberto?: boolean; logado?: boolean } =
		$props();

	let dialogo = $state<HTMLDialogElement>();
	let fechando = $state(false);
	let pedido = $state<PlanoId | null>(null);
	let erro = $state<string | null>(null);

	// `showModal()` é imperativo: o efeito espelha `aberto` no elemento.
	$effect(() => {
		if (!dialogo) return;
		if (aberto && !dialogo.open) {
			fechando = false;
			dialogo.showModal();
		} else if (!aberto && dialogo.open && !fechando) {
			fecharComSaida(dialogo);
		}
	});

	/** A saída anima com o diálogo ainda aberto; o `close()` vem no fim dela. */
	function fecharComSaida(el: HTMLDialogElement) {
		fechando = true;
		const terminar = () => {
			if (!fechando) return;
			fechando = false;
			if (!aberto && el.open) el.close();
		};
		el.addEventListener('animationend', terminar, { once: true });
		setTimeout(terminar, DURACAO.curta + 60);
	}

	const animacao = $derived(
		fechando
			? 'animate-modal-saida backdrop:animate-veu-saida'
			: 'open:animate-entrada-curta backdrop:animate-veu'
	);

	async function escolher(plano: PlanoId, ciclo: CicloDeCobranca) {
		erro = null;
		if (!ehPlanoPago(plano)) return;
		try {
			const r = await solicitarPlano({ plano, ciclo });
			if (r.tipo === 'redirecionar') {
				window.location.assign(r.url);
				return;
			}
			pedido = plano;
		} catch {
			erro = 'Não deu para enviar o pedido agora. Tente de novo em instantes.';
		}
	}
</script>

<dialog
	bind:this={dialogo}
	onclose={() => (aberto = false)}
	oncancel={(e) => {
		e.preventDefault();
		aberto = false;
	}}
	onclick={(e) => {
		if (e.target === dialogo) aberto = false;
	}}
	aria-labelledby="planos-modal-titulo"
	class="m-auto max-h-[calc(100dvh-1.75rem)] w-[calc(100vw-1.75rem)] max-w-[1120px] overflow-hidden rounded-box border border-line bg-base-100 p-0 text-base-content
	       shadow-[0_34px_70px_-34px_rgba(20,18,31,0.55)] backdrop:bg-overlay backdrop:backdrop-blur-[3px]
	       {animacao} lg:max-h-[calc(100dvh-3.75rem)]"
>
	<div class="flex max-h-[inherit] flex-col">
		<div class="flex shrink-0 items-center gap-3 border-b border-line px-4 py-3.5 lg:px-[22px]">
			<span class="min-w-0 flex-1">
				<span
					id="planos-modal-titulo"
					class="block font-display text-[19px] font-semibold tracking-[-0.02em]"
				>
					Leve uma atividade assim para a sua turma
				</span>
				<span class="mt-0.5 block text-[12.5px] text-base-content/65">
					Os primeiros 14 dias são grátis e não pedem cartão.
				</span>
			</span>
			<button
				type="button"
				onclick={() => (aberto = false)}
				aria-label="Fechar os planos"
				class="btn btn-circle size-[38px] shrink-0 motion-tap btn-plain"
			>
				<svg class="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<path
						d="M6 6l12 12M18 6L6 18"
						stroke="currentColor"
						stroke-width="2.2"
						stroke-linecap="round"
					/>
				</svg>
			</button>
		</div>

		<div class="min-h-0 overflow-y-auto px-4 py-6 lg:px-8 lg:py-8">
			{#if pedido}
				<p
					class="mb-6 rounded-box border border-s-[3px] border-line border-s-primary bg-base-200 px-4 py-3 text-[14px] leading-relaxed"
					role="status"
				>
					Pedido enviado. A equipe vai falar com você para combinar o pagamento e ativar o plano.
				</p>
			{/if}
			{#if erro}
				<p class="mb-6 text-[14px] text-base-content/80" role="status">{erro}</p>
			{/if}
			<PlanosTabela
				compacto
				titulo="Um preço por professor. Para a escola, um contrato."
				onescolher={logado ? escolher : undefined}
				pedidoPendente={pedido}
			/>
		</div>
	</div>
</dialog>
