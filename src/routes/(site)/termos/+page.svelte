<script lang="ts">
	import Metadados from '$lib/components/Metadados.svelte';
	import LegalPage from '$lib/components/LegalPage.svelte';
	import { termos, atualizadoEm } from '$lib/content/institucional';
</script>

<Metadados
	titulo="Termos de uso do Spokke"
	descricao="O que o Spokke promete, o que ele não promete e o que esperamos de quem usa: conta, conteúdo, planos e cancelamento."
	tituloDaAba="Termos de uso · Spokke"
/>

<LegalPage
	eyebrow="Termos de uso"
	title="As regras entre você e o Spokke"
	lede="O que o Spokke promete, o que ele não promete e o que esperamos de quem usa."
	updated={`Atualizados em ${atualizadoEm}`}
	sections={termos}
/>
