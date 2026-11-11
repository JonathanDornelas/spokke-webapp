<script lang="ts">
	import IndiceDoBlog from '$lib/components/blog/IndiceDoBlog.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<IndiceDoBlog dados={data.indice} />
