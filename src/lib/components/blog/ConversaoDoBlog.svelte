<script lang="ts">
	// A faixa de conversão do fim das páginas do blog (o "Blog Conversao" do
	// Claude Design): escura no artigo e no hub, clara no índice. O texto e os
	// destinos seguem o público (`conversaoDoPublico`): professor cria a conta,
	// escola conversa sobre o plano da escola.
	import { conversaoDoPublico } from '$lib/blog/links';
	import type { Publico } from '$lib/blog/tipos';

	let {
		publico,
		slug,
		variante = 'escura',
		titulo
	}: {
		publico: Publico;
		/** O artigo de onde a pessoa sai: vai no `?origem=` do cadastro e do contato. */
		slug?: string;
		variante?: 'escura' | 'clara';
		/** Troca o título padrão do público (o hub do tema fala do assunto dele). */
		titulo?: string;
	} = $props();

	const c = $derived(conversaoDoPublico(publico, slug));
	const id = $props.id();
</script>

<section
	aria-labelledby="{id}-titulo"
	class={variante === 'escura'
		? 'bg-panel text-panel-content'
		: 'border-t border-line bg-base-200 text-base-content'}
>
	<div
		class="mx-auto flex max-w-[1200px] flex-wrap items-center gap-x-12 gap-y-6 px-[clamp(18px,2.4vw,28px)] py-[clamp(40px,5vw,64px)]"
	>
		<div class="min-w-0 flex-[1_1_420px]">
			<h2
				id="{id}-titulo"
				class="mb-3 font-display text-[clamp(26px,1.6vw+18px,36px)] leading-[1.1] font-semibold tracking-[-0.02em] text-balance"
			>
				{titulo ?? c.titulo}
			</h2>
			<p
				class="text-[15px] leading-normal {variante === 'escura'
					? 'text-panel-dim'
					: 'text-base-content/65'}"
			>
				{c.nota}
			</p>
		</div>
		<div class="flex flex-wrap gap-3">
			<!-- eslint-disable svelte/no-navigation-without-resolve -- os destinos já saem de resolve() em `$lib/blog/links`. -->
			<a
				href={c.primaria.href}
				data-evento="cta_blog"
				data-rotulo={c.primaria.rotulo}
				data-artigo={slug ?? 'indice'}
				class="btn btn-lg motion-tap btn-primary no-underline"
			>
				{c.primaria.rotulo}
			</a>
			<a
				href={c.secundaria.href}
				data-evento="cta_blog"
				data-rotulo={c.secundaria.rotulo}
				data-artigo={slug ?? 'indice'}
				class="btn btn-lg motion-tap no-underline {variante === 'escura'
					? 'border-panel-line bg-transparent text-panel-content hover:border-panel-content'
					: 'btn-plain hover:border-primary'}"
			>
				{c.secundaria.rotulo}
			</a>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
		</div>
	</div>
</section>
