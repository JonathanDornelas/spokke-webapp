<script lang="ts">
	// O bloco "No Spokke" (ou "Na sua escola", no artigo de escola): depois da
	// metade do texto, quando o leitor já entendeu o método, três ou quatro
	// frases sobre como fazer aquilo no produto e UMA chamada, a do público do
	// artigo. É uma das três chamadas que o artigo pode ter (docs/blog.md).
	import { conversaoDoPublico } from '$lib/blog/links';
	import type { Publico } from '$lib/blog/tipos';

	let {
		id,
		titulo,
		html,
		publico,
		slug
	}: { id: string; titulo: string; html: string; publico: Publico; slug: string } = $props();

	const chamada = $derived(conversaoDoPublico(publico, slug).primaria);
</script>

<section aria-labelledby={id}>
	<h2
		{id}
		class="mt-14 mb-4 scroll-mt-24 font-display text-[24px] leading-[1.18] font-semibold tracking-[-0.015em] text-balance md:text-[28px]"
	>
		{titulo}
	</h2>
	<div
		class="mb-9 rounded-s-[4px] rounded-e-[14px] border-s-4 border-primary bg-base-200 px-6 py-[22px]"
	>
		<!-- eslint-disable svelte/no-at-html-tags -- Markdown do próprio repositório, convertido no servidor. -->
		<div
			class="mb-4 text-[16.5px] leading-[1.65] text-pretty [&_a]:text-primary [&_a]:underline [&_p+p]:mt-3"
		>
			{@html html}
		</div>
		<!-- eslint-enable svelte/no-at-html-tags -->
		<!-- eslint-disable svelte/no-navigation-without-resolve -- o destino já sai de resolve() em `$lib/blog/links`. -->
		<a
			href={chamada.href}
			data-evento="cta_blog"
			data-rotulo={chamada.rotulo}
			data-artigo={slug}
			class="btn min-h-[46px] motion-tap btn-primary px-5 text-[15px] no-underline"
		>
			{chamada.rotulo}
		</a>
		<!-- eslint-enable svelte/no-navigation-without-resolve -->
	</div>
</section>
