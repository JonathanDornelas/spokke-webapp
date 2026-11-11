<script lang="ts">
	import HubDoBlog from '$lib/components/blog/HubDoBlog.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<HubDoBlog
	hub={data.tema}
	guia={data.guia}
	artigos={data.artigos}
	outrosTemas={data.outrosTemas}
	indexar={data.indexar}
	linkDasEscolas={data.temHubDasEscolas}
	rotuloDoGuia="Guia principal do tema"
/>
