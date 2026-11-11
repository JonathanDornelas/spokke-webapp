<script lang="ts">
	import AnswerFeedback from '$lib/components/interactions/AnswerFeedback.svelte';
	import AssembleInteraction from '$lib/components/interactions/AssembleInteraction.svelte';
	import ChoiceInteraction from '$lib/components/interactions/ChoiceInteraction.svelte';
	import ClozeInteraction from '$lib/components/interactions/ClozeInteraction.svelte';
	import MatchInteraction from '$lib/components/interactions/MatchInteraction.svelte';
	import SpeakInteraction from '$lib/components/interactions/SpeakInteraction.svelte';
	import Loading from '$lib/components/Loading.svelte';
	import type { Attachment } from 'svelte/attachments';
	import type { RespostaDoExemplo } from './resposta.svelte';

	// Onde se responde: a interação real do Player, o veredito que veio do
	// servidor e a espera da correção por cima. Os mesmos componentes da `/q/[n]`
	// — o exemplo não tem cópia própria de nenhum deles.
	let {
		resposta,
		desktop = false,
		compacto = false
	}: {
		resposta: RespostaDoExemplo;
		desktop?: boolean;
		/**
		 * O celular da home: a questão inteira tem de caber na tela do aparelho,
		 * sem rolar. Sai a dica de teclado do "montar" e, depois de corrigir, as
		 * peças que sobraram — a frase montada e o veredito ficam.
		 */
		compacto?: boolean;
	} = $props();
	const q = $derived(resposta.questao);

	/**
	 * O veredito entra à vista. Na fala, com a frase, o microfone e o
	 * "Entendemos", ele nascia abaixo da dobra do celular da home — e quem
	 * apertou "Verificar" não via resposta nenhuma.
	 */
	const mostrar: Attachment<HTMLElement> = (el) => {
		const suave = !matchMedia('(prefers-reduced-motion: reduce)').matches;
		el.scrollIntoView({ block: 'nearest', behavior: suave ? 'smooth' : 'auto' });
	};
</script>

<div class="relative flex min-w-0 flex-1 flex-col">
	{#if q.interaction === 'choice'}
		<ChoiceInteraction item={q} bind:value={resposta.escolha} {desktop} />
	{:else if q.interaction === 'type' || q.interaction === 'cloze'}
		<ClozeInteraction item={q} bind:value={resposta.texto} feedback={resposta.feedback} />
	{:else if q.interaction === 'assemble'}
		<AssembleInteraction
			item={q}
			bind:chosen={resposta.montagem}
			dicaDeTeclado={!compacto}
			corrigida={compacto && resposta.feedback !== null}
		/>
	{:else if q.interaction === 'match'}
		<MatchInteraction
			item={q}
			bind:pairs={resposta.pares}
			leftLabel={q.targetLabel}
			rightLabel={q.sourceLabel}
			feedback={resposta.feedback}
		/>
	{:else if q.interaction === 'speak'}
		<SpeakInteraction
			item={q}
			recording={resposta.gravando}
			ontoggle={() => resposta.alternarGravacao()}
			estado={resposta.gravacao.estado}
			segundos={resposta.gravacao.segundos}
			maxSegundos={resposta.gravacao.maxSegundos}
			ouvido={resposta.ouvido}
			ouvindo={resposta.ouvindo}
			corrigida={compacto && resposta.feedback !== null}
		/>
		{#if !(compacto && resposta.feedback)}
			<p class="text-center text-[12px] leading-snug text-base-content/60">
				A gravação é transcrita e descartada. Nada fica guardado.
			</p>
		{/if}
	{/if}

	{#if resposta.feedback}
		<div {@attach mostrar}>
			<AnswerFeedback
				state={resposta.feedback.state}
				hint={resposta.feedback.hint}
				marks={q.interaction === 'match' ? undefined : resposta.feedback.marks}
				expected={q.interaction === 'match' ? undefined : resposta.feedback.expected}
				heard={resposta.feedback.heard}
				dir={q.dir}
			/>
		</div>
	{/if}

	{#if resposta.erro}
		<!-- Falha no caminho, não veredito: ícone e texto, sem as cores da correção. -->
		<p
			class="mt-3.5 flex items-start gap-2.5 rounded-field border border-line bg-base-200 px-4 py-3 text-[13.5px] leading-snug"
			role="status"
		>
			<svg
				class="mt-px size-[17px] shrink-0 text-base-content/65"
				viewBox="0 0 24 24"
				fill="none"
				aria-hidden="true"
			>
				<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" />
				<path
					d="M12 7.5v5.5M12 16.5h.01"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
				/>
			</svg>
			{resposta.erro}
		</p>
	{/if}

	{#if resposta.verificando}
		<div
			class="absolute inset-0 z-2 -m-2 flex flex-col items-center justify-center gap-3 rounded-box
			       bg-base-100/62 backdrop-blur-[1.5px]"
		>
			<Loading variant="traco" size={42} label="Verificando sua resposta" />
			<span class="text-[13px] font-semibold">Verificando sua resposta</span>
		</div>
	{/if}
</div>
