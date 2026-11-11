<script lang="ts">
	// O JSON-LD da página, no HTML inicial (o robô de busca não precisa rodar
	// JavaScript). `serializarJsonLd` escapa o `<`: um título com a tag de
	// fechamento não termina o bloco no meio. Os objetos saem de
	// `$lib/blog/dados-estruturados`.
	//
	// A tag é montada por partes de propósito: o nome dela escrito inteiro
	// dentro deste bloco confunde o parser do Svelte e o do Prettier, que
	// procuram o fim do script do componente pelo texto.
	import { serializarJsonLd } from '$lib/blog/dados-estruturados';

	let { dados }: { dados: Record<string, unknown>[] } = $props();

	const TAG = 'scr' + 'ipt';
	const html = $derived(
		dados.map((d) => `<${TAG} type="application/ld+json">${serializarJsonLd(d)}</${TAG}>`).join('')
	);
</script>

<svelte:head>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- JSON montado aqui a partir de objetos nossos, com o `<` escapado. -->
	{@html html}
</svelte:head>
