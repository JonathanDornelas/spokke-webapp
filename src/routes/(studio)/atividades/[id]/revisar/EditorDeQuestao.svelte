<script lang="ts">
	// O EDITOR DE QUESTÃO, em modal sobre a revisão — para editar uma questão ou
	// criar uma do zero. Era uma tela inteira: o professor saía da lista para
	// corrigir uma questão e voltava sem saber onde estava. Aqui a lista fica atrás
	// do véu.
	//
	// Esta é a CASCA: véu, entrada e saída (`transicoes.ts`), foco preso, Esc e o
	// clique no véu. O formulário (`FormularioDaQuestao`) monta a cada abertura —
	// reabrir começa do que está gravado — e é ele quem decide se pode fechar
	// (mudança não salva pergunta antes).
	import { tick } from 'svelte';
	import { modal, veu } from '$lib/client/transicoes';
	import FormularioDaQuestao from './FormularioDaQuestao.svelte';

	let {
		alvo,
		activityId,
		numero,
		total,
		proximoId,
		fora,
		idioma,
		capacidades,
		onfechar,
		onsalvo,
		onalternarFora
	}: {
		/** A questão aberta: `itemId` nulo é uma questão nova. Nulo = fechado. */
		alvo: { itemId: string | null } | null;
		activityId: string;
		/** A posição da questão aberta entre as que estão na atividade. */
		numero: number | null;
		total: number;
		/** A questão seguinte, para "Salvar e ir para a próxima". */
		proximoId: string | null;
		/** A questão aberta está fora da atividade. */
		fora: boolean;
		idioma: { tag: string; dir: 'ltr' | 'rtl'; alvo: string; aluno: string };
		capacidades: { tts: boolean; asr: boolean };
		onfechar: () => void;
		onsalvo: (itemId: string, irPara: string | null) => void;
		onalternarFora: (itemId: string, fora: boolean) => Promise<string | null>;
	} = $props();

	let painel = $state<HTMLElement | null>(null);
	let formulario = $state<FormularioDaQuestao | null>(null);

	$effect(() => {
		if (!alvo) return;
		const voltarPara =
			document.activeElement instanceof HTMLElement ? document.activeElement : null;
		void tick().then(() => {
			if (painel && !painel.contains(document.activeElement)) painel.focus({ preventScroll: true });
		});
		return () => {
			if (voltarPara && document.contains(voltarPara)) voltarPara.focus({ preventScroll: true });
		};
	});

	const FOCAVEIS =
		'a[href],button:not(:disabled),input:not(:disabled):not([type="hidden"]),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])';

	/** O Tab dá a volta dentro do modal: o que está atrás do véu não recebe foco. */
	function prenderFoco(e: KeyboardEvent) {
		if (e.key !== 'Tab' || !painel) return;
		const focaveis = [...painel.querySelectorAll<HTMLElement>(FOCAVEIS)].filter(
			(el) => el.getClientRects().length > 0
		);
		if (focaveis.length === 0) return;
		const primeiro = focaveis[0];
		const ultimo = focaveis[focaveis.length - 1];
		const atual = document.activeElement;
		if (e.shiftKey && (atual === primeiro || atual === painel)) {
			e.preventDefault();
			ultimo.focus();
		} else if (!e.shiftKey && atual === ultimo) {
			e.preventDefault();
			primeiro.focus();
		}
	}

	function tentarFechar() {
		if (formulario?.podeFechar() ?? true) onfechar();
	}

	function aoTeclar(e: KeyboardEvent) {
		if (alvo && e.key === 'Escape' && !e.defaultPrevented) {
			e.preventDefault();
			tentarFechar();
		}
	}
</script>

<svelte:window onkeydown={aoTeclar} />

{#if alvo}
	<div class="fixed inset-0 z-50">
		<!-- O véu fecha ao clicar, como na bandeja; o teclado fecha pelo Esc. -->
		<button
			type="button"
			tabindex="-1"
			onclick={tentarFechar}
			class="absolute inset-0 bg-overlay"
			aria-label="Fechar"
			in:veu
			out:veu
		></button>
		<div
			bind:this={painel}
			role="dialog"
			aria-modal="true"
			aria-labelledby="editor-titulo"
			tabindex="-1"
			onkeydown={prenderFoco}
			in:modal
			out:modal
			class="absolute inset-x-0 top-3 bottom-0 flex flex-col overflow-hidden rounded-t-[22px] border border-line bg-base-100 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.45)] outline-none lg:inset-y-9 lg:mx-auto lg:w-[min(1080px,calc(100vw-48px))] lg:rounded-[20px]"
		>
			{#key alvo.itemId ?? 'nova'}
				<FormularioDaQuestao
					bind:this={formulario}
					{activityId}
					itemId={alvo.itemId}
					{numero}
					{total}
					{proximoId}
					{fora}
					{idioma}
					{capacidades}
					onfechar={tentarFechar}
					{onsalvo}
					{onalternarFora}
				/>
			{/key}
		</div>
	</div>
{/if}
