<script lang="ts">
	let { current, total }: { current: number; total: number } = $props();
</script>

<div class="h-2.5 overflow-hidden rounded-full bg-base-300" role="presentation">
	<div
		class="h-full origin-left rounded-full bg-primary transition-transform duration-1000 ease-out-soft"
		style="transform: scaleX({current / total})"
	></div>
</div>
<p class="sr-only" aria-live="polite">Questão {current} de {total}</p>
