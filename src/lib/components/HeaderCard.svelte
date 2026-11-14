<script lang="ts">
	// O cartão de cabeçalho das telas de detalhe do Studio — turma, atividade,
	// aluno — e da área do aluno. É UM desenho: etiqueta, título e uma linha de
	// contexto à esquerda, as ações à direita, e embaixo os números que
	// importam, separados por um filete. As formas de ambiente ficam no canto
	// oposto ao texto (design-system.md: nunca atrás de texto).
	//
	// Os números são uma LISTA curta em linha, não uma grade que espalha quatro
	// valores pela largura toda: lidos juntos eles respondem uma pergunta só
	// ("qual é o tamanho disto?"), e a distância entre eles quebrava a leitura.
	// Quem merece cor é dito por `tone` — um por cartão, no máximo dois.
	import type { Snippet } from 'svelte';
	import AmbientShapes from './AmbientShapes.svelte';

	type Tone = 'primary' | 'error' | 'muted';
	interface Numero {
		value: string | number;
		label: string;
		tone?: Tone;
	}

	let {
		numbers = [],
		badge,
		actions,
		detalhes,
		children
	}: {
		numbers?: Numero[];
		/** A etiqueta à esquerda do título: iniciais, sigla da turma ou um ícone. */
		badge?: Snippet;
		/**
		 * Os botões. No celular eles descem para uma linha própria e dividem a
		 * largura; quando os dois rótulos não cabem lado a lado, um fica sobre o outro.
		 */
		actions?: Snippet;
		/**
		 * O que vem sob o título e a linha de contexto: os dados da atividade, um
		 * aviso. No celular ocupa a largura INTEIRA do cartão — na coluna do
		 * título, recuada pela etiqueta, o select de nível e as datas passavam da
		 * borda. No desktop alinha com o título, depois das ações.
		 */
		detalhes?: Snippet;
		/** Título e linha de contexto. */
		children: Snippet;
	} = $props();

	const tons: Record<Tone, string> = {
		primary: 'text-primary',
		error: 'text-error',
		muted: 'text-base-content/65'
	};
</script>

<section
	class="relative mb-[26px] overflow-hidden rounded-[16px] border border-line bg-base-200 px-4 py-[18px] lg:px-[26px] lg:py-6"
>
	<!-- No celular o canto não existe: a largura inteira é do texto. -->
	<div class="hidden lg:contents">
		<AmbientShapes layout="corner" />
	</div>

	<div class="relative z-1">
		<div class="mb-[18px] flex flex-wrap items-start gap-x-[18px] gap-y-3.5">
			{#if badge}
				{@render badge()}
			{/if}
			<div class="min-w-0 flex-1">
				{@render children()}
			</div>
			{#if detalhes}
				<!-- Uma linha própria do flex: no celular entre o título e as ações; no
				     desktop por último (`order-last`), com o recuo da etiqueta (46px + o
				     vão de 18px) para começar onde o título começa. -->
				<div class="w-full min-w-0 lg:order-last {badge ? 'lg:ps-16' : ''}">
					{@render detalhes()}
				</div>
			{/if}
			{#if actions}
				<!-- `flex-wrap`: o item de flex não encolhe abaixo do próprio texto, e
				     "Editar no wizard" com "Enviar para turma" passavam 15px da borda num
				     celular de 390. Quebrando, cada um ocupa a linha inteira. -->
				<div class="flex w-full flex-wrap gap-2 *:flex-1 lg:w-auto lg:flex-nowrap lg:*:flex-none">
					{@render actions()}
				</div>
			{/if}
		</div>

		{#if numbers.length > 0}
			<div class="flex flex-wrap gap-x-[30px] gap-y-3 border-t border-line pt-4">
				{#each numbers as numero (numero.label)}
					<div>
						<div
							class="font-display text-2xl leading-none font-extrabold tracking-[-0.025em] {numero.tone
								? tons[numero.tone]
								: ''}"
						>
							{numero.value}
						</div>
						<div class="mt-[5px] text-xs text-base-content/65">{numero.label}</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</section>
