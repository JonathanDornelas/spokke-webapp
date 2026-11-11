<script lang="ts">
	// Os metadados de uma página: título da aba, descrição, canonical, Open Graph
	// e Twitter Card, num lugar só (components.md "Metadados"). É o que monta a
	// prévia quando o link vai para o WhatsApp, o LinkedIn ou um e-mail.
	//
	// Tudo sai no HTML inicial, renderizado no servidor: o robô que monta a prévia
	// não roda JavaScript. A URL é ABSOLUTA, a partir da origem do pedido — em
	// produção o `ORIGIN` do adapter-node faz dela a do domínio público.
	import { page } from '$app/state';

	let {
		titulo,
		descricao,
		tituloDaAba,
		imagem = '/og/spokke.png',
		imagemAlt = 'Spokke: exercícios de idioma com o material da sua aula.',
		tipo = 'website',
		indexar = true,
		publicadoEm,
		atualizadoEm,
		secao
	}: {
		/** O título na prévia (og:title). Curto: a prévia corta perto de 60 caracteres. */
		titulo: string;
		descricao: string;
		/** O `<title>` da aba, quando é diferente do título da prévia. */
		tituloDaAba?: string;
		/** Caminho em `static/` (1200×630) ou URL absoluta. */
		imagem?: string;
		imagemAlt?: string;
		tipo?: 'website' | 'article';
		/**
		 * Falso para o que não deve aparecer em busca (a atividade de um professor,
		 * o convite de turma): ganha `noindex` e perde o canonical, mas a prévia de
		 * compartilhamento continua — é justamente o link que vai para o grupo.
		 */
		indexar?: boolean;
		/** Artigo do blog (`tipo="article"`): o dia em que saiu, AAAA-MM-DD. Sem autor: o blog não assina (docs/blog.md). */
		publicadoEm?: string;
		/** O dia da última mudança de conteúdo, quando houve. */
		atualizadoEm?: string | null;
		/** O tema do artigo (`article:section`). */
		secao?: string;
	} = $props();

	const url = $derived(page.url.origin + page.url.pathname);
	const imagemAbsoluta = $derived(/^https?:\/\//.test(imagem) ? imagem : page.url.origin + imagem);
	/** O tipo sai da extensão: as imagens do site são PNG, as capas do blog são JPEG. */
	const tipoDaImagem = $derived(
		/\.jpe?g(?:[?#]|$)/i.test(imagem)
			? 'image/jpeg'
			: /\.webp(?:[?#]|$)/i.test(imagem)
				? 'image/webp'
				: 'image/png'
	);
</script>

<svelte:head>
	<title>{tituloDaAba ?? titulo}</title>
	<meta name="description" content={descricao} />
	{#if indexar}
		<link rel="canonical" href={url} />
	{:else}
		<meta name="robots" content="noindex" />
	{/if}

	<meta property="og:type" content={tipo} />
	<meta property="og:site_name" content="Spokke" />
	<meta property="og:locale" content="pt_BR" />
	<meta property="og:title" content={titulo} />
	<meta property="og:description" content={descricao} />
	<meta property="og:url" content={url} />
	<meta property="og:image" content={imagemAbsoluta} />
	<meta property="og:image:type" content={tipoDaImagem} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:image:alt" content={imagemAlt} />
	{#if tipo === 'article' && publicadoEm}
		<meta property="article:published_time" content={publicadoEm} />
		<meta property="article:modified_time" content={atualizadoEm ?? publicadoEm} />
		{#if secao}<meta property="article:section" content={secao} />{/if}
	{/if}

	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={titulo} />
	<meta name="twitter:description" content={descricao} />
	<meta name="twitter:image" content={imagemAbsoluta} />
	<meta name="twitter:image:alt" content={imagemAlt} />
</svelte:head>
