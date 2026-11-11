<script lang="ts">
	// As perguntas frequentes do artigo, como conteúdo: cada uma num `<details>`,
	// a primeira aberta. Sem `FAQPage` no JSON-LD (o Google não mostra mais o
	// resultado rico para este tipo de site); a resposta é texto que se lê.
	let {
		id,
		titulo,
		perguntas
	}: { id: string; titulo: string; perguntas: { pergunta: string; respostaHtml: string }[] } =
		$props();
</script>

<section aria-labelledby={id}>
	<h2
		{id}
		class="mt-14 mb-2 scroll-mt-24 font-display text-[24px] leading-[1.18] font-semibold tracking-[-0.015em] text-balance md:text-[28px]"
	>
		{titulo}
	</h2>
	<div class="border-t border-line">
		{#each perguntas as p, i (p.pergunta)}
			<details open={i === 0} class="group border-b border-line">
				<summary
					class="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3.5 font-display text-[20px] leading-[1.3] font-semibold [&::-webkit-details-marker]:hidden"
				>
					{p.pergunta}
					<svg
						class="size-5 flex-none transition-transform group-open:rotate-180"
						viewBox="0 0 24 24"
						fill="none"
						aria-hidden="true"
					>
						<path
							d="M6 9l6 6 6-6"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
				</summary>
				<!-- eslint-disable svelte/no-at-html-tags -- Markdown do próprio repositório, convertido no servidor. -->
				<p class="mb-[18px] max-w-[68ch] text-[17px] leading-[1.7] md:text-[18px]">
					{@html p.respostaHtml}
				</p>
				<!-- eslint-enable svelte/no-at-html-tags -->
			</details>
		{/each}
	</div>
</section>
