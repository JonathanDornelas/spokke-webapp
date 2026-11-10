<script lang="ts">
	// Casca do Player. Ocupa a viewport inteira, sem barra lateral e sem chrome do
	// Studio. No desktop (>=1120px) o conteúdo vira duas colunas dentro de um
	// cartão centrado; abaixo disso é o layout do celular esticado.
	import { onMount } from 'svelte';
	import { instalarDiario } from '$lib/client/diario';

	let { children }: { children: import('svelte').Snippet } = $props();

	// O diário da tela (`$lib/client/diario.ts`) liga aqui, na casca: assim um
	// erro na entrada ou entre duas questões também fica anotado para o relato
	// de problema. Só na memória da aba; nada sai sem o aluno mandar.
	onMount(instalarDiario);
</script>

<!-- A atividade é do professor e vai pelo link dele: fora da busca. A PRÉVIA do link continua (Metadados na entrada). -->
<svelte:head><meta name="robots" content="noindex" /></svelte:head>

<!-- `h-dvh` e não `min-h-dvh`: a PÁGINA não rola. Quando a questão não cabe,
     quem rola é a área da questão dentro do cartão — o cabeçalho com o progresso
     e o rodapé com a ação principal ficam onde estão (design-system.md: "ação
     principal fixa no rodapé"). Com a página rolando, a barra de progresso subia
     para fora da tela e o botão de verificar ficava abaixo da dobra.
     `min-h-0` no cartão porque item de flex não encolhe abaixo do conteúdo sem
     ele, e a área rolável nunca chegava a existir. -->
<div class="flex h-dvh flex-col overflow-hidden bg-base-100 lg:bg-base-200 lg:py-8">
	<div
		class="mx-auto flex min-h-0 w-full flex-1 flex-col overflow-hidden lg:max-w-[1100px] lg:rounded-[20px]
		       lg:border lg:border-line lg:bg-base-100 lg:shadow-[0_24px_56px_-40px_rgb(var(--shadow)/0.4)]"
	>
		{@render children()}
	</div>
</div>
