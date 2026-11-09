<!--
  Formas de ambiente: no máximo 3-5 por tela, opacidade abaixo de 0.35, nunca atrás de texto.
  Confinadas por mask-image (fade), nunca cortadas em linha reta. Ver .claude/rules/design-system.md.
  Cinco formas, cinco tipos diferentes — não repita o mesmo tipo dentro de uma composição.
-->
<script lang="ts">
	// `height`: a altura da FAIXA. O padrão é um `clamp` e não uma porcentagem:
	// a faixa é uma BORDA da tela, e em porcentagem ela crescia junto com o
	// container até as formas flutuarem no meio do conteúdo em vez de margeá-lo
	// (42% de uma tela de 900px são 378px — o dobro do desenho). O clamp mantém
	// a proporção onde ela importa, entre um celular e um monitor, com piso e
	// teto perto dos 150/190px do protótipo.
	// `tone`: 'success' troca a cor primária pelo verde de correção — usado só na
	// tela de resultado do Player, quando o desfecho é positivo.
	// `layout`: 'band' é a faixa horizontal (hero, capa); 'column' é a coluna
	// estreita e alta da barra lateral do Studio, onde as posições em
	// porcentagem da faixa amontoariam tudo num canto só; 'corner' é o CANTO de
	// um cartão de cabeçalho (turma, atividade, aluno): uma coluna de 300px no
	// fim da linha, com fade para o lado do texto. As formas aqui são pequenas
	// e em px fixo — o cartão tem sempre a mesma altura, e um clamp em `vw`
	// as fazia sair do tamanho do cartão num monitor largo.
	// `scale`: multiplicador do tamanho das formas. Elas crescem com `vw` — a
	// VIEWPORT —, então dentro de uma moldura pequena (a prévia de celular do
	// editor de item) elas saíam do tamanho de uma tela inteira. Só quem
	// desenha uma tela DENTRO de outra precisa disto; a tela real fica em 1.
	// 'tela' espalha as formas pela página INTEIRA, nas margens do conteúdo: é
	// a composição das telas de entrar e criar conta, onde o cartão fica no meio
	// de uma página vazia e duas faixas deixavam o meio chapado. O cartão é
	// opaco, então o que passa por trás dele some, e nenhuma forma fica atrás de
	// texto.
	// `edges`: 'both' repete a faixa espelhada no rodapé — é a composição das
	// telas do Player, onde o conteúdo fica no meio do cartão e uma faixa só no
	// topo deixa a metade de baixo chapada. 'bottom' é só a de baixo, para painel
	// cujo conteúdo começa colado no topo (a prévia do editor de item): ali uma
	// faixa no topo cairia atrás do rótulo, e a regra é nunca atrás de texto.
	let {
		height = 'clamp(9rem, 21vh, 12.5rem)',
		tone = 'primary',
		layout = 'band',
		edges = 'top',
		scale = 1
	}: {
		height?: string;
		tone?: 'primary' | 'success';
		layout?: 'band' | 'column' | 'corner' | 'tela';
		edges?: 'top' | 'bottom' | 'both';
		scale?: number;
	} = $props();

	// Classes inteiras e literais por tom — Tailwind só gera CSS para classes que
	// aparecem completas no código-fonte, então nada de montar a string em runtime
	// (ex. mainColor.replace(...)): a classe resultante não existiria no build.
	const circleColor = $derived(
		tone === 'success'
			? 'bg-[radial-gradient(circle_at_34%_32%,color-mix(in_oklab,var(--color-success)_22%,transparent),transparent_70%)]'
			: 'bg-[radial-gradient(circle_at_34%_32%,color-mix(in_oklab,var(--color-primary)_22%,transparent),transparent_70%)]'
	);
	const triangleColor = $derived(tone === 'success' ? 'bg-success/25' : 'bg-primary/25');
	const ringColor = $derived(tone === 'success' ? 'border-success/35' : 'border-primary/30');

	// As formas também crescem com a tela: `clamp(mínimo, proporção, máximo)`.
	// Em px fixo elas dominam um celular e somem num monitor largo.
	const grande =
		'w-[calc(clamp(7rem,14vw,13rem)*var(--amb-k,1))] h-[calc(clamp(7rem,14vw,13rem)*var(--amb-k,1))]';
	const media =
		'w-[calc(clamp(4.5rem,8vw,8rem)*var(--amb-k,1))] h-[calc(clamp(4.5rem,8vw,8rem)*var(--amb-k,1))]';
	const pequena =
		'w-[calc(clamp(2.5rem,4.5vw,4.5rem)*var(--amb-k,1))] h-[calc(clamp(2.5rem,4.5vw,4.5rem)*var(--amb-k,1))]';
	const capsula =
		'w-[calc(clamp(3rem,6vw,5.5rem)*var(--amb-k,1))] h-[calc(clamp(1.25rem,2.2vw,2rem)*var(--amb-k,1))]';
</script>

{#snippet faixaTopo()}
	<!-- círculo -->
	<div
		class="absolute top-[6%] left-[4%] {grande} animate-[en-float-a_17s_ease-in-out_infinite]
		       rounded-full {circleColor}"
	></div>
	<!-- quadrado arredondado -->
	<div
		class="absolute -top-[18%] right-[14%] {media} animate-[en-float-c_21s_ease-in-out_infinite]
		       rounded-[28%] border-[1.5px] border-accent/40"
	></div>
	<!-- triângulo -->
	<div
		class="absolute -bottom-[30%] left-[16%] {media} animate-[en-drift-spin_26s_ease-in-out_infinite]
		       {triangleColor} [clip-path:polygon(50%_0%,100%_100%,0%_100%)]"
	></div>
	<!-- anel tracejado -->
	<div
		class="absolute right-[6%] bottom-[10%] {pequena} animate-spin rounded-full border-2
		       border-dashed {ringColor} [animation-duration:24s]"
	></div>
	<!-- cápsula -->
	<div
		class="absolute top-[30%] left-[1%] {capsula} animate-[en-float-b_15s_ease-in-out_infinite]
		       rounded-full border-[1.5px] border-accent/35"
	></div>
{/snippet}

{#snippet faixaBase()}
	<!-- Composição do rodapé: outras cinco famílias, para as duas faixas não
	     lerem como a mesma imagem repetida. -->
	<div
		class="absolute right-[4%] -bottom-[26%] {grande} animate-[en-float-b_21s_ease-in-out_infinite]
		       rounded-full {circleColor}"
	></div>
	<div
		class="absolute -bottom-[28%] left-[6%] {media} animate-[en-drift-spin_29s_ease-in-out_infinite]
		       bg-accent/15 [clip-path:polygon(50%_0%,100%_100%,0%_100%)]"
	></div>
	<div
		class="absolute -bottom-[18%] left-[40%] {pequena} animate-[en-float-c_20s_ease-in-out_infinite]
		       bg-accent/14 [clip-path:polygon(25%_3%,75%_3%,100%_50%,75%_97%,25%_97%,0%_50%)]"
	></div>
	<div
		class="absolute right-[34%] bottom-[6%] {pequena} animate-spin rounded-full border-[1.5px]
		       border-dashed {ringColor} [animation-duration:30s]"
	></div>
	<div
		class="absolute right-[16%] bottom-[24%] {capsula} animate-[en-float-a_16s_ease-in-out_infinite]
		       rounded-full border-[1.5px] border-warning/30"
	></div>
{/snippet}

{#if layout === 'corner'}
	<div
		aria-hidden="true"
		class="pointer-events-none absolute inset-y-0 end-0 w-[300px] overflow-hidden
		       [mask-image:linear-gradient(to_left,#000_34%,transparent_92%)] rtl:[mask-image:linear-gradient(to_right,#000_34%,transparent_92%)]"
	>
		<!-- círculo esmaecido -->
		<div
			class="absolute -end-[8%] -top-[34%] size-[138px] animate-[en-float-b_24s_ease-in-out_infinite]
			       rounded-full bg-[radial-gradient(circle_at_38%_34%,color-mix(in_oklab,var(--color-primary)_20%,transparent),transparent_70%)]"
		></div>
		<!-- triângulo -->
		<div
			class="absolute end-[30%] -bottom-[26%] h-[76px] w-[84px] animate-[en-float-a_20s_ease-in-out_infinite]
			       bg-accent/14 [clip-path:polygon(50%_0%,100%_100%,0%_100%)]"
		></div>
		<!-- hexágono -->
		<div
			class="absolute end-[10%] bottom-[8%] size-[54px] animate-[en-drift-spin_30s_ease-in-out_infinite]
			       bg-primary/11 [clip-path:polygon(25%_3%,75%_3%,100%_50%,75%_97%,25%_97%,0%_50%)]"
		></div>
		<!-- anel tracejado -->
		<div
			class="absolute end-[48%] top-[24%] size-[30px] animate-spin rounded-full border-[1.5px]
			       border-dashed border-primary/26 [animation-duration:34s]"
		></div>
		<!-- ponto -->
		<div class="absolute end-[20%] top-[44%] size-3 rounded-full bg-accent/28"></div>
	</div>
{:else if layout === 'tela'}
	<!-- Página inteira: sete famílias, nenhuma repetida, nas margens e em
	     alturas diferentes. O canto de cima à esquerda fica livre para a marca.
	     O movimento é o `en-vagar-*` (app.css), de amplitude maior que o das
	     faixas: com o vaivém curto delas, numa página vazia, as formas pareciam
	     paradas. Durações primas entre si, para o conjunto não repetir a mesma
	     configuração e o olho não achar o ponto onde o laço recomeça. -->
	<div
		aria-hidden="true"
		class="pointer-events-none absolute inset-0 overflow-hidden"
		style="--amb-k: {scale}"
	>
		<div
			class="absolute top-[30%] -left-[5%] {grande} animate-[en-vagar-a_17s_ease-in-out_infinite]
			       rounded-full {circleColor}"
		></div>
		<div
			class="absolute top-[6%] right-[10%] {media} animate-[en-vagar-c_13s_ease-in-out_infinite]
			       rounded-[28%] border-[1.5px] border-accent/40"
		></div>
		<div
			class="absolute bottom-[8%] left-[12%] {media} animate-[en-drift-spin_19s_ease-in-out_infinite]
			       {triangleColor} [clip-path:polygon(50%_0%,100%_100%,0%_100%)]"
		></div>
		<div
			class="absolute top-[48%] right-[4%] {media} animate-[en-vagar-b_15s_ease-in-out_infinite]
			       bg-accent/14 [clip-path:polygon(25%_3%,75%_3%,100%_50%,75%_97%,25%_97%,0%_50%)]"
		></div>
		<div
			class="absolute right-[18%] bottom-[12%] {pequena} animate-spin rounded-full border-2
			       border-dashed {ringColor} [animation-duration:14s]"
		></div>
		<div
			class="absolute top-[16%] left-[20%] {capsula} animate-[en-vagar-b_23s_ease-in-out_infinite]
			       rounded-full border-[1.5px] border-accent/35"
		></div>
		<div
			class="absolute top-[70%] left-[4%] {pequena} animate-[en-vagar-a_21s_ease-in-out_infinite]
			       bg-primary/14 [clip-path:polygon(40%_0,60%_0,60%_40%,100%_40%,100%_60%,60%_60%,60%_100%,40%_100%,40%_60%,0_60%,0_40%,40%_40%)]"
		></div>
	</div>
{:else if layout === 'column' || edges !== 'bottom'}
	<div
		aria-hidden="true"
		class="pointer-events-none absolute inset-x-0 top-0 overflow-hidden
	       {layout === 'column'
			? 'inset-y-0 [mask-image:linear-gradient(to_bottom,transparent_0%,#000_14%,#000_86%,transparent_100%)]'
			: '[mask-image:linear-gradient(to_bottom,#000_46%,transparent_96%)]'}"
		style="--amb-k: {scale}; {layout === 'column' ? '' : `height: ${height}`}"
	>
		{#if layout === 'column'}
			<!-- Coluna: as formas descem a lateral em vez de se espalharem na
		     largura. Mesmas cinco famílias da faixa, outra distribuição. -->
			<div
				class="absolute top-[6%] left-[16%] {pequena} animate-[en-float-c_21s_ease-in-out_infinite]
			       rounded-[28%] bg-warning/15"
			></div>
			<div
				class="absolute top-[13%] -left-[26%] {grande} animate-[en-float-a_17s_ease-in-out_infinite]
			       rounded-full {circleColor}"
			></div>
			<div
				class="absolute top-[30%] right-[10%] {media} animate-[en-float-b_19s_ease-in-out_infinite]
			       bg-accent/20 [clip-path:polygon(50%_0%,100%_100%,0%_100%)]"
			></div>
			<div
				class="absolute top-[54%] left-[42%] {pequena} animate-spin rounded-full border-2
			       border-dashed {ringColor} [animation-duration:26s]"
			></div>
			<div
				class="absolute top-[70%] left-[22%] {media} animate-[en-drift-spin_28s_ease-in-out_infinite]
			       bg-primary/12 [clip-path:polygon(25%_3%,75%_3%,100%_50%,75%_97%,25%_97%,0%_50%)]"
			></div>
		{:else}
			{@render faixaTopo()}
		{/if}
	</div>
{/if}

{#if layout === 'band' && (edges === 'both' || edges === 'bottom')}
	<div
		aria-hidden="true"
		class="pointer-events-none absolute inset-x-0 bottom-0 overflow-hidden
		       [mask-image:linear-gradient(to_top,#000_46%,transparent_96%)]"
		style="--amb-k: {scale}; height: {height}"
	>
		{@render faixaBase()}
	</div>
{/if}
