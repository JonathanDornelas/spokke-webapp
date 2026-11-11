<script lang="ts">
	import { HUB_DAS_ESCOLAS } from '$lib/blog/temas';
	import HubDoBlog from '$lib/components/blog/HubDoBlog.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<HubDoBlog
	hub={HUB_DAS_ESCOLAS}
	guia={data.guia}
	artigos={data.artigos}
	outrosTemas={data.outrosTemas}
	indexar={data.indexar}
	paraEscolas
	rotuloDoGuia="Guia principal"
/>
