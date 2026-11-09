<script lang="ts">
	import Metadados from '$lib/components/Metadados.svelte';
	import LegalPage from '$lib/components/LegalPage.svelte';
	import { privacidade, atualizadoEm } from '$lib/content/institucional';
</script>

<Metadados
	titulo="O que o Spokke faz com os dados de professores e alunos"
	descricao="O que guardamos, para quê, com quem compartilhamos e como você exerce os direitos da LGPD. Para responder, o aluno só digita um nome ou apelido."
	tituloDaAba="Privacidade · Spokke"
/>

<LegalPage
	eyebrow="Política de privacidade"
	title="O que fazemos com os dados de professores e alunos"
	lede="Em português claro, na ordem das perguntas que um professor faz antes de levar a turma."
	updated={`Atualizada em ${atualizadoEm}`}
	sections={privacidade}
/>
