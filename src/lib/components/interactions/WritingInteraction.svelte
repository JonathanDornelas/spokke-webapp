<script lang="ts">
	import type { WritingRuntimeItem } from './types';
	import TecladoVirtual from '../TecladoVirtual.svelte';
	import LeituraDoCampo from '../LeituraDoCampo.svelte';
	import { CampoComTeclado } from '../campo-com-teclado.svelte';

	// Resposta longa. Sem correção automática — vai para a fila de correção manual
	// (grading mode `rubric`, kernel.md). O rascunho sobrevive a recarregar a página.
	let {
		item,
		value = $bindable(''),
		storageKey,
		campo = new CampoComTeclado(),
		tecladoAberto = $bindable(false),
		tecladoNaTela = false
	}: {
		item: WritingRuntimeItem;
		value?: string;
		storageKey: string;
		/** O campo ligado ao teclado. A tela passa o dela quando é ELA quem encaixa a grade. */
		campo?: CampoComTeclado;
		tecladoAberto?: boolean;
		/** A grade mora na tela (encaixada acima do rodapé), não aqui dentro. */
		tecladoNaTela?: boolean;
	} = $props();

	$effect(() => {
		const saved = localStorage.getItem(storageKey);
		if (saved && !value) value = saved;
	});
	$effect(() => {
		if (value) localStorage.setItem(storageKey, value);
	});

	// O teclado virtual, quando o idioma alvo pede um. Mesmas regras do campo
	// curto (`ClozeInteraction`): a grade aberta desliga o teclado do aparelho, a
	// barra de acentos o complementa.
	const semTecladoDoSistema = $derived(item.teclado?.formato === 'grade' && tecladoAberto);
</script>

<p class="mb-4 text-[13.5px] leading-snug text-base-content/65">{item.instructions}</p>

<div
	class="flex flex-1 flex-col rounded-box border-[1.5px] border-line bg-base-100 p-3.5 focus-within:border-primary"
>
	<textarea
		bind:value
		bind:this={campo.elemento}
		onblur={campo.lembrar}
		inputmode={semTecladoDoSistema ? 'none' : 'text'}
		dir={item.dir}
		maxlength={item.maxLength}
		class="flex-1 resize-none bg-transparent font-content text-[17px] leading-relaxed outline-none"
		placeholder="Escreva aqui"></textarea>
	<div
		class="mt-2.5 flex items-center justify-between border-t border-line pt-2.5 text-xs text-base-content/65"
	>
		<span>Salvo automaticamente</span>
		<span class="font-mono">{value.length} / {item.maxLength}</span>
	</div>
</div>

{#if item.teclado}
	<LeituraDoCampo teclado={item.teclado} texto={value} />
	{#if item.teclado.formato === 'barra' || !tecladoNaTela}
		<!-- O limite vale para o teclado virtual também: o `maxlength` do campo só
		     segura o que se DIGITA, não o que o script insere. -->
		<TecladoVirtual
			teclado={item.teclado}
			bind:aberto={tecladoAberto}
			docado={tecladoNaTela}
			onacao={(acao) => campo.aplicar(value, acao, (novo) => (value = novo), item.maxLength)}
		/>
	{/if}
{/if}
