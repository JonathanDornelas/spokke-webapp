<script lang="ts">
	// O filtro que não achou nada — o mesmo nas três listas. Diz o que não bateu
	// e oferece desfazer a busca e os filtros de uma vez. (A lista vazia de
	// verdade, sem nenhum item, é o hero de cada tela.)
	let { texto, onlimpar }: { texto: string; onlimpar?: () => void } = $props();
</script>

<div
	class="mb-[22px] rounded-[14px] border border-dashed border-line px-5 py-8 text-center text-[14px] text-base-content/65"
	role="status"
>
	<p class={onlimpar ? 'mb-3' : ''}>{texto}</p>
	{#if onlimpar}
		<button type="button" onclick={onlimpar} class="btn btn-sm motion-tap btn-plain">
			Limpar busca e filtros
		</button>
	{/if}
</div>
