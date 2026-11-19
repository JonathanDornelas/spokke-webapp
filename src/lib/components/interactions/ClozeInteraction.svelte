<script lang="ts">
	import type { ClozeFeedback, ClozeRuntimeItem } from './types';
	import TecladoVirtual from '../TecladoVirtual.svelte';
	import LeituraDoCampo from '../LeituraDoCampo.svelte';
	import { CampoComTeclado } from '../campo-com-teclado.svelte';

	// Digitação tolerante. O normalizador (no servidor) ignora acento e caixa
	// conforme os flags do item — uma letra a menos vira PARCIAL, não zero.
	let {
		item,
		value = $bindable(''),
		feedback = null,
		campo = new CampoComTeclado(),
		tecladoAberto = $bindable(false),
		tecladoNaTela = false
	}: {
		item: ClozeRuntimeItem;
		value?: string;
		feedback?: ClozeFeedback | null;
		/** O campo ligado ao teclado. A tela passa o dela quando é ELA quem encaixa a grade. */
		campo?: CampoComTeclado;
		tecladoAberto?: boolean;
		/** A grade mora na tela (encaixada acima do rodapé), não aqui dentro. */
		tecladoNaTela?: boolean;
	} = $props();

	const borderByState: Record<ClozeFeedback['state'], string> = {
		correct: 'border-success',
		partial: 'border-warning',
		incorrect: 'border-error'
	};
	const border = $derived(feedback ? borderByState[feedback.state] : 'border-line');

	// O teclado virtual, quando o idioma alvo pede um (`LanguageProfile.input`).
	// Com a GRADE aberta, o teclado do aparelho é desligado: ele não escreve este
	// script, e abrir os dois cobriria a questão inteira no celular. A BARRA de
	// acentos é o oposto — ela só completa o teclado do aparelho.
	const semTecladoDoSistema = $derived(item.teclado?.formato === 'grade' && tecladoAberto);

	/**
	 * A frase quebrada em texto e lacunas. Cada lacuna vira um traço com a
	 * LARGURA da palavra que falta (`item.blanks`, em caracteres) — "She ___
	 * here" com um traço curtinho e "extraordinariamente" com um longo leem
	 * como a mesma frase com um buraco, e não como um marcador genérico.
	 *
	 * `ch` é a unidade certa aqui: ela é a largura do "0" da fonte em uso, ou
	 * seja, acompanha o tamanho do texto sem nenhuma conta na tela.
	 */
	const partes = $derived.by(() => {
		const saida: ({ texto: string } | { largura: number })[] = [];
		const regex = /_{2,}/g;
		let ultimo = 0;
		let lacuna = 0;
		let achado: RegExpExecArray | null;
		while ((achado = regex.exec(item.masked)) !== null) {
			if (achado.index > ultimo) saida.push({ texto: item.masked.slice(ultimo, achado.index) });
			// Sem medida vinda do servidor, a lacuna mantém a largura do próprio
			// "___" — nunca some da frase.
			saida.push({ largura: item.blanks?.[lacuna] ?? achado[0].length });
			ultimo = achado.index + achado[0].length;
			lacuna++;
		}
		if (ultimo < item.masked.length) saida.push({ texto: item.masked.slice(ultimo) });
		return saida;
	});
</script>

<p class="mb-4 font-content text-xl leading-relaxed" dir={item.dir}>
	{#each partes as parte, i (i)}
		{#if 'texto' in parte}{parte.texto}{:else}<span
				class="mx-0.5 inline-block border-b-2 border-primary/70 align-baseline"
				style="width: {parte.largura}ch"
				aria-label="lacuna de {parte.largura} letras"
			></span>{/if}
	{/each}
</p>

<p class="mb-3.5 text-[12.5px] font-semibold text-base-content/65">Sua resposta</p>

<input
	bind:value
	bind:this={campo.elemento}
	onblur={campo.lembrar}
	type="text"
	inputmode={semTecladoDoSistema ? 'none' : 'text'}
	autocomplete="off"
	autocapitalize="off"
	spellcheck="false"
	dir={item.dir}
	disabled={!!feedback}
	class="w-full rounded-box border-[1.5px] {border} bg-base-100 px-4 py-3.5 font-content text-[19px]
	       focus:border-primary focus:shadow-[0_0_0_3px_var(--color-base-300)] focus:outline-none"
	placeholder="Digite sua resposta"
/>

{#if item.teclado}
	<LeituraDoCampo teclado={item.teclado} texto={value} />
	<!-- A barra fica sob o campo também no Player (quem a abre é o "Acentos" do
	     rodapé, por isso `docado`), e sai depois de responder: não há mais o que
	     digitar. A grade, no Player, é a tela que desenha. -->
	{#if item.teclado.formato === 'barra' ? !feedback : !tecladoNaTela}
		<TecladoVirtual
			teclado={item.teclado}
			bind:aberto={tecladoAberto}
			docado={tecladoNaTela}
			desativado={!!feedback}
			onacao={(acao) => campo.aplicar(value, acao, (novo) => (value = novo))}
		/>
	{/if}
{/if}
