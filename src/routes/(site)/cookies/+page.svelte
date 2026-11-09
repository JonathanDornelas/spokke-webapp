<script lang="ts">
	import Metadados from '$lib/components/Metadados.svelte';
	import LegalPage from '$lib/components/LegalPage.svelte';
	import { cookies, atualizadoEm } from '$lib/content/institucional';
</script>

<Metadados
	titulo="Cookies do Spokke"
	descricao="Cada cookie e cada dado guardado no navegador, com prazo e finalidade. Nenhum é de publicidade ou de análise."
	tituloDaAba="Cookies · Spokke"
/>

<LegalPage
	eyebrow="Cookies"
	title="Quais cookies usamos e por quê"
	lede="Um por um, com prazo e finalidade. Nenhum é de publicidade ou de análise."
	updated={`Atualizada em ${atualizadoEm}`}
	sections={cookies}
/>
