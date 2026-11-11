<script lang="ts">
	import Metadados from '$lib/components/Metadados.svelte';
	import LegalPage from '$lib/components/LegalPage.svelte';
	import { acessibilidade, atualizadoEm } from '$lib/content/institucional';
</script>

<Metadados
	titulo="Acessibilidade no Spokke"
	descricao="O que já funciona, onde ainda existe barreira e como avisar quando algo travar."
	tituloDaAba="Acessibilidade · Spokke"
/>

<LegalPage
	eyebrow="Acessibilidade"
	title="O que já funciona e o que ainda não"
	lede="O que já funciona, onde ainda existe barreira e como avisar quando algo travar."
	updated={`Atualizada em ${atualizadoEm}`}
	sections={acessibilidade}
/>
