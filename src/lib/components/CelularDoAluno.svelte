<script lang="ts">
	// O CELULAR onde o professor vê uma questão como o aluno vê — no palco da
	// revisão e no editor de questão. As medidas são as do celular da home
	// (`src/routes/+page.svelte`), que o dono do repositório escolheu como padrão:
	// o APARELHO tem 344 × 600 e não muda; quem encolhe é a TELA, por `zoom`
	// (0,85), como a escala de interface de um celular de verdade. É zoom de
	// LAYOUT, não de pintura: as caixas encolhem junto e a medida sai certa.
	//
	// A questão CABE na tela, sempre (pedido do dono do repositório): quando ela é
	// mais alta que a área, a própria questão ganha um segundo `zoom`, o maior que
	// a deixa inteira à vista. Esticar o aparelho desfigurava o celular, e rolar
	// escondia justamente o fim da questão — as peças do "montar", a última fala
	// do "ordenar". Abaixo de `MENOR_AJUSTE` a letra deixa de se ler, e aí a área
	// rola (não acontece com as questões que o produto gera).
	//
	// Sem `data-surface="player"`, como o celular da home e o Player de verdade
	// (`a/[slug]/q/[n]`): o alvo de 48px dele inflava as setas do "ordenar", as
	// peças e as palavras do "tocar", e a prévia saía diferente do que o aluno vê.
	import type { Snippet } from 'svelte';

	let {
		posicao = null,
		total = 0,
		apagado = false,
		rotulo,
		children,
		rodape
	}: {
		/** A posição da questão no roteiro (a barra de progresso). Nula = fora dele. */
		posicao?: number | null;
		total?: number;
		/** A questão está fora da atividade: o aparelho aparece apagado. */
		apagado?: boolean;
		/** O que o leitor de tela ouve: o aparelho é uma figura. */
		rotulo: string;
		children: Snippet;
		/** A ação do rodapé (o "Verificar"). */
		rodape?: Snippet;
	} = $props();

	const progresso = $derived(posicao && total ? Math.min(1, posicao / total) : 0);

	/** O menor zoom da questão. Abaixo dele a área rola em vez de encolher mais. */
	const MENOR_AJUSTE = 0.55;

	let area = $state<HTMLDivElement | null>(null);
	let questao = $state<HTMLDivElement | null>(null);

	// O zoom é escrito direto no elemento, fora do estado do Svelte: ele é MEDIDA
	// do que está na tela, e passar por estado reagiria à própria escrita.
	$effect(() => {
		const fora = area;
		const dentro = questao;
		if (!fora || !dentro) return;
		let quadro = 0;
		const cabe = () => fora.scrollHeight <= fora.clientHeight + 1;
		const ajustar = () => {
			quadro = 0;
			dentro.style.zoom = '1';
			// Escondido (o editor no celular): nada a medir.
			if (fora.clientHeight === 0 || cabe()) return;
			let menor = MENOR_AJUSTE;
			let maior = 1;
			dentro.style.zoom = String(menor);
			if (!cabe()) return;
			// Busca binária: com menos zoom a questão também fica mais LARGA por
			// dentro e quebra menos linhas, então a altura não cai em proporção.
			for (let i = 0; i < 7; i++) {
				const meio = (menor + maior) / 2;
				dentro.style.zoom = String(meio);
				if (cabe()) menor = meio;
				else maior = meio;
			}
			dentro.style.zoom = String(menor);
		};
		const pedir = () => {
			if (!quadro) quadro = requestAnimationFrame(ajustar);
		};
		ajustar();
		// Muda o tamanho (a fonte chegou, a coluna mudou) ou muda o conteúdo (a peça
		// foi para a frase, o veredito apareceu, outra questão entrou). O zoom que o
		// próprio ajuste escreve não conta, senão ele se chamaria para sempre.
		const tamanho = new ResizeObserver(pedir);
		tamanho.observe(fora);
		tamanho.observe(dentro);
		const conteudo = new MutationObserver((mudancas) => {
			if (mudancas.some((m) => m.target !== dentro || m.attributeName !== 'style')) pedir();
		});
		conteudo.observe(dentro, {
			childList: true,
			subtree: true,
			characterData: true,
			attributes: true
		});
		return () => {
			tamanho.disconnect();
			conteudo.disconnect();
			if (quadro) cancelAnimationFrame(quadro);
		};
	});
</script>

<div
	role="group"
	aria-label={rotulo}
	class="flex h-[600px] w-[344px] shrink-0 flex-col overflow-hidden rounded-[40px] border-[9px] border-bezel bg-base-100
	       shadow-[0_30px_70px_-34px_rgb(var(--shadow)/0.55)] transition-[opacity,filter] duration-200
	       {apagado ? 'opacity-50 grayscale' : ''}"
>
	<div
		class="flex h-[calc(582px/var(--escala))] w-[calc(326px/var(--escala))] [zoom:var(--escala)] flex-col [--escala:0.85]"
	>
		<div class="flex shrink-0 items-center gap-3 p-4 pb-3" aria-hidden="true">
			<span class="size-[34px] shrink-0 rounded-full bg-base-200"></span>
			<div class="h-2.5 flex-1 overflow-hidden rounded-full bg-base-300">
				<div
					class="h-full origin-left rounded-full bg-primary transition-transform duration-500"
					style="transform: scaleX({progresso})"
				></div>
			</div>
			<span class="font-mono text-xs text-base-content/60"
				>{posicao ? `${posicao}/${total}` : 'fora'}</span
			>
		</div>

		<!-- A área não rola: a questão encolhe até caber (o `zoom` de `ajustar`). Ela
		     cresce até o fim da área (`grow`) para a fala e a escrita livre, que
		     empurram o microfone e o campo para baixo, continuarem como no Player. -->
		<div bind:this={area} class="flex min-h-0 flex-1 flex-col overflow-y-auto">
			<div bind:this={questao} class="flex shrink-0 grow flex-col px-5 pt-2 pb-4">
				{@render children()}
			</div>
		</div>

		{#if rodape}
			<div class="shrink-0 border-t border-line px-5 pt-3 pb-5">{@render rodape()}</div>
		{/if}
	</div>
</div>
