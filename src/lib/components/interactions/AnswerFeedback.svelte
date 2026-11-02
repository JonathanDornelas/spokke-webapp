<script lang="ts">
	/**
	 * O veredito de UMA questão do Player, para TODAS as interações.
	 *
	 * Ele existia só dentro do `ClozeInteraction`, então quem respondia errado
	 * um "Monte a frase" não via feedback nenhum: a tela esperava os 2,2 s de
	 * leitura e passava para a próxima. As outras sete interações não tinham
	 * onde mostrar o resultado.
	 *
	 * **Ícone e texto, nunca só cor** (design-system.md "Estado de correção"):
	 * daltonismo é comum e este é o momento mais importante do exercício. Vale
	 * também para as marcas: a palavra fora de lugar leva sublinhado ondulado e
	 * um traço de anotação, não só a cor vermelha.
	 *
	 * Não é o `CorrectionState.svelte`: aquele repete a resposta numa caixa,
	 * porque serve a listas e relatórios onde ela não está na tela. Aqui a
	 * resposta está logo acima — o que falta é o veredito.
	 */
	import CorrectionIcon from '../CorrectionIcon.svelte';
	import type { Dir } from './types';

	let {
		state,
		hint = '',
		marks = [],
		expected = [],
		heard = '',
		dir = 'ltr'
	}: {
		state: 'correct' | 'partial' | 'incorrect';
		/** O que faltou. Vem do servidor: nada aqui decide certo ou errado. */
		hint?: string;
		/**
		 * A resposta do aluno pedaço a pedaço. Quando vem preenchida, a frase
		 * que ELE montou é remontada aqui com o que saiu do lugar grifado — é
		 * mais útil do que "8 de 9 na posição certa; a 5ª está fora", que o
		 * obrigava a recontar a própria frase.
		 */
		marks?: { text: string; ok: boolean }[];
		/**
		 * A resposta certa, pedaço a pedaço. Marcar o erro sem dizer o certo
		 * deixa metade do retorno de fora: o aluno vê que a palavra está torta e
		 * continua sem saber qual era.
		 */
		expected?: string[];
		/**
		 * O que o serviço de áudio ENTENDEU, só em `speak`. Sem isto o aluno
		 * recebe "Quase." sem saber se pronunciou torto ou se o microfone comeu
		 * metade da frase — e não tem o que corrigir na próxima tentativa.
		 */
		heard?: string;
		/** Direção do conteúdo — vem do `LanguageProfile`, não da interface. */
		dir?: Dir;
	} = $props();

	// Classes inteiras e literais por estado — o Tailwind só gera o que aparece
	// completo no código-fonte.
	const borda = {
		correct: 'border-s-success',
		partial: 'border-s-warning',
		incorrect: 'border-s-error'
	};
	// **Parcial existe.** Tratá-lo como erro seco frustra o aluno, e é o
	// resultado normal de correção tolerante e de ASR (kernel.md).
	const titulo = {
		correct: 'Correto.',
		partial: 'Quase.',
		incorrect: 'Não foi dessa vez.'
	};

	const foraDeLugar = $derived(marks.filter((m) => !m.ok).map((m) => m.text));
</script>

<div
	class="mt-3.5 flex animate-entrada items-start gap-2.5
	       rounded-field border-s-[3px] bg-base-200 px-4 py-3 {borda[state]}"
	role="status"
	aria-live="polite"
>
	<span class="mt-px shrink-0">
		<CorrectionIcon {state} size={17} animate={state === 'correct'} />
	</span>
	<div class="min-w-0 flex-1">
		<p class="text-[13.5px] leading-snug">
			<strong>{titulo[state]}</strong>
			{hint ?? ''}
		</p>

		{#if marks.length > 0}
			<!-- A frase que o aluno montou, com o que está fora do lugar grifado.
			     `aria-hidden` porque a linha abaixo diz o mesmo em palavras: o
			     sublinhado ondulado não é anunciável. -->
			<p
				class="mt-2 flex flex-wrap items-baseline gap-x-1.5 gap-y-1 font-content text-[15px] leading-relaxed"
				{dir}
				aria-hidden="true"
			>
				{#each marks as marca, i (i)}
					{#if marca.ok}
						<span>{marca.text}</span>
					{:else}
						<span
							class="font-semibold text-error underline decoration-error decoration-wavy decoration-2 underline-offset-[5px]"
						>
							{marca.text}
						</span>
					{/if}
				{/each}
			</p>
			<p class="sr-only">
				Sua resposta: {marks.map((m) => m.text).join(' ')}. Fora de lugar: {foraDeLugar.join(
					', '
				) || 'nada'}.
			</p>
		{/if}

		{#if heard}
			<!-- Fala: o que se ouviu vem ANTES do gabarito, na mesma ordem do resto
			     do produto — primeiro o que o aluno fez, depois o certo. Entre aspas
			     e com rótulo porque, sem eles, a transcrição lida como enunciado. -->
			<p class="mt-2.5 text-[12px] font-semibold text-base-content/65">Ouvimos:</p>
			<p class="mt-1 font-content text-[15px] leading-relaxed" {dir}>“{heard}”</p>
		{/if}

		{#if expected.length > 0 && state !== 'correct'}
			<!-- Como deveria ficar. Vem depois do que ele montou, para o olho
			     comparar as duas linhas na mesma ordem de leitura. -->
			<p class="mt-2.5 text-[12px] font-semibold text-base-content/65">O certo era:</p>
			<p
				class="mt-1 flex flex-wrap items-baseline gap-x-1.5 gap-y-1 font-content text-[15px] leading-relaxed text-success"
				{dir}
			>
				{#each expected as pedaco, i (i)}
					<span>{pedaco}</span>
				{/each}
			</p>
		{/if}
	</div>
</div>
