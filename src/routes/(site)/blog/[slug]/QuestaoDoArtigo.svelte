<script lang="ts">
	// A questão embutida no artigo (o "Blog Questao" do Claude Design), com as
	// peças de verdade: as mesmas do celular da home e de `/exemplo`
	// (`EnunciadoDaQuestao`, `RespostaDaQuestao`, `RespostaDoExemplo`). Quem
	// corrige é `corrigirExemplo`, no servidor, com o teto por IP que já existe.
	// O protótipo corrigia no navegador com uma distância de letras própria;
	// isso seria um segundo corretor, divergindo do produto no primeiro ajuste.
	import { untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import Loading from '$lib/components/Loading.svelte';
	import EnunciadoDaQuestao from '../../../exemplo/EnunciadoDaQuestao.svelte';
	import RespostaDaQuestao from '../../../exemplo/RespostaDaQuestao.svelte';
	import { RespostaDoExemplo, type QuestaoNaTela } from '../../../exemplo/resposta.svelte';

	let { questao, texto }: { questao: QuestaoNaTela; texto: string } = $props();

	const resposta = untrack(() => new RespostaDoExemplo(questao));
	const id = $props.id();

	function verificar(e: SubmitEvent) {
		e.preventDefault();
		void resposta.verificar();
	}
</script>

<section aria-labelledby="{id}-titulo" class="my-10 grid gap-4">
	<div>
		<h3 id="{id}-titulo" class="mb-1.5 font-display text-[21px] font-semibold tracking-[-0.01em]">
			Responda como o seu aluno
		</h3>
		<p class="text-[15px] leading-[1.55] text-base-content/65">{texto}</p>
	</div>

	<form
		onsubmit={verificar}
		class="rounded-[16px] border border-line bg-card p-[clamp(18px,2.4vw,26px)]"
	>
		<EnunciadoDaQuestao {resposta} compacto />
		<RespostaDaQuestao {resposta} />
		<div class="mt-4">
			{#if resposta.feedback}
				<button
					type="button"
					onclick={() => resposta.zerar()}
					class="btn btn-lg w-full motion-tap btn-plain hover:border-primary"
				>
					Tentar de novo
				</button>
			{:else}
				<button
					type="submit"
					disabled={!resposta.pronta || resposta.verificando}
					class="btn btn-lg w-full motion-tap gap-2 btn-primary"
				>
					{#if resposta.verificando}
						<Loading variant="fila" size={12} tone="current" label="Verificando" />
						Verificando…
					{:else}
						Verificar
					{/if}
				</button>
			{/if}
		</div>
	</form>

	<a
		href={resolve('/exemplo')}
		data-evento="cta_blog"
		data-rotulo="Responder a atividade de exemplo completa"
		class="inline-flex items-center gap-2 justify-self-start text-[15px] font-bold text-primary underline underline-offset-[3px]"
	>
		Responder a atividade de exemplo completa
		<svg class="size-4 rtl:-scale-x-100" viewBox="0 0 24 24" fill="none" aria-hidden="true">
			<path
				d="M5 12h13M13 6l6 6-6 6"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		</svg>
	</a>
</section>
