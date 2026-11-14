<script lang="ts">
	// O "Gera" de UM material: os tipos de questão dele e a prévia do que ele
	// rende. Ligar aqui um tipo que o bloco de cima não tem liga lá também — o
	// bloco de cima é a união (`$lib/atividades/tipos-por-material.ts`).
	//
	// A prévia é a do SERVIDOR (`previaDoMaterial`): os geradores de verdade, com a
	// mesma regra de "entra com estes tipos" da geração, e UM exemplo de cada tipo
	// (escuta, fala, leitura, escrita), como QUESTÃO RESUMIDA — os quatro cartões do
	// desenho. O tipo desligado aparece apagado.
	import { skillLabels } from '$lib/kernel/interactions/skill-schema';
	import type { Skill } from '$lib/kernel/interactions/types';
	import { TIPOS, bloqueioNoMaterial } from '$lib/atividades/tipos-por-material';
	import QuestaoResumida from '$lib/components/QuestaoResumida.svelte';
	import { desdobrar, recolher } from '$lib/client/transicoes';
	import { previaDoMaterial } from '../../atividades.remote';

	let {
		activityId,
		materialId,
		tipos,
		indisponiveis,
		dir,
		lang,
		onalternar
	}: {
		activityId: string;
		materialId: string;
		tipos: Skill[];
		indisponiveis: Map<Skill, string>;
		dir: 'ltr' | 'rtl';
		lang: string;
		onalternar: (tipo: Skill) => void;
	} = $props();

	let aberta = $state(false);
	// Só consulta com a prévia aberta: são vários materiais na lista, e cada um
	// pedindo a sua ao montar seria uma ida ao servidor por cartão sem ninguém ter
	// pedido. Fechando, o bloco SAI com o conteúdo que tinha — o efeito de dentro
	// fica parado durante a saída, então ele não esvazia no meio do recolher.
	const consulta = $derived(
		aberta ? previaDoMaterial({ activityId, contentId: materialId, tipos }) : null
	);

	/**
	 * A largura de cada cartão sai da largura da FAIXA (`cqw`). Com espaço, os
	 * quatro cabem inteiros, lado a lado, como no desenho (15px de respiro nas duas
	 * pontas e 9px entre eles: (100cqw - 42px) / 4). Numa faixa estreita eles rolam
	 * de lado, com um cartão e MEIO ou dois e meio à vista — o meio cartão na
	 * ponta é o que diz que há mais para o lado: (100cqw - 9·N) / (N + 0,5).
	 */
	const LARGURA =
		'w-[calc((100cqw-9px)/1.5)] @min-[470px]:w-[calc((100cqw-18px)/2.5)] @min-[690px]:w-[calc((100cqw-42px)/4)]';

	const LIGADO = 'M4 12.5l5 5L20 6.5';
	const DESLIGADO = 'M6 12h12';
</script>

<div class="flex flex-wrap items-center gap-1.5 px-[15px] pb-3">
	<span class="me-0.5 text-[12px] font-semibold text-base-content/65">Gera</span>
	{#each TIPOS as tipo (tipo)}
		{@const motivo = indisponiveis.get(tipo)}
		{@const ligado = !motivo && tipos.includes(tipo)}
		<!-- O último tipo ligado não desliga: o material ficaria sem gerar nada.
		     `aria-disabled` (e não `disabled`) para o `title` aparecer. -->
		{@const bloqueio = motivo ? null : bloqueioNoMaterial(tipos, tipo, indisponiveis)}
		<button
			type="button"
			onclick={() => {
				if (!bloqueio) onalternar(tipo);
			}}
			disabled={!!motivo}
			aria-disabled={bloqueio ? true : undefined}
			aria-pressed={ligado}
			title={motivo ?? bloqueio ?? undefined}
			class="flex min-h-[30px] items-center gap-[5px] rounded-full ps-2 pe-2.5 text-[12px] whitespace-nowrap transition-[background-color,color,border-color] duration-150 disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed
			       {ligado
				? 'border border-base-300 bg-base-300 font-bold text-primary'
				: 'border border-dashed border-base-content/35 font-semibold text-base-content/65'}"
		>
			<svg class="size-3" viewBox="0 0 24 24" fill="none" aria-hidden="true">
				<path
					d={ligado ? LIGADO : DESLIGADO}
					stroke="currentColor"
					stroke-width="2.8"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			</svg>
			<!-- Largura sempre a do negrito: trocar o peso no clique empurrava os vizinhos. -->
			<span class="grid">
				<span class="invisible col-start-1 row-start-1 font-bold" aria-hidden="true"
					>{skillLabels[tipo]}</span
				>
				<span class="col-start-1 row-start-1">{skillLabels[tipo]}</span>
			</span>
		</button>
	{/each}
	<span class="min-w-1 flex-1"></span>
	<button
		type="button"
		onclick={() => (aberta = !aberta)}
		aria-expanded={aberta}
		aria-controls="previa-{materialId}"
		class="flex min-h-[30px] items-center gap-[7px] rounded-lg px-[9px] text-[12.5px] font-bold whitespace-nowrap text-primary transition-colors duration-200 hover:bg-base-300"
	>
		<svg class="size-[15px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
			<path
				d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"
				stroke="currentColor"
				stroke-width="2"
				stroke-linejoin="round"
			/>
			<circle cx="12" cy="12" r="2.8" stroke="currentColor" stroke-width="2" />
		</svg>
		{aberta ? 'Fechar prévia' : 'Prévia'}
	</button>
</div>

{#if aberta && consulta}
	<div
		id="previa-{materialId}"
		class="border-t border-line bg-base-200 pt-3.5 pb-4"
		in:desdobrar
		out:recolher
	>
		<p class="mb-[11px] px-[15px] text-[12.5px] leading-normal text-base-content/65">
			Um exemplo de cada tipo, do jeito que o aluno vê. O tipo desligado aparece apagado.
		</p>
		<!-- Numa faixa estreita os cartões rolam de lado. O respiro de 15px antes do
		     primeiro vale também para o ENCAIXE da rolagem (`scroll-ps`): sem ele o
		     navegador encaixava o primeiro cartão colado na borda. -->
		<div class="@container flex snap-x scroll-ps-[15px] gap-[9px] overflow-x-auto ps-[15px] pb-1.5">
			{#await consulta}
				{#each [0, 1, 2, 3] as i (i)}
					<div
						class="{LARGURA} h-[178px] shrink-0 skeleton rounded-[13px]"
						style="animation-delay: {i * 120}ms"
					></div>
				{/each}
			{:then itens}
				{#if itens.length === 0}
					<p class="pe-[15px] text-[12.5px] text-base-content/65">
						Este material ainda não rende questão sozinho: as alternativas erradas vêm dos outros
						materiais do mesmo tipo.
					</p>
				{:else}
					{#each itens as item (item.id)}
						<div class="{LARGURA} shrink-0 snap-start">
							<QuestaoResumida questao={item} tamanho="pequena" {dir} {lang} />
						</div>
					{/each}
					<!-- O respiro do fim: com o vão de 9px, o último cartão para a 15px da
					     borda, como o primeiro. Padding no fim de uma faixa rolável não
					     entra na conta da rolagem em todo navegador. -->
					<span class="w-1.5 shrink-0" aria-hidden="true"></span>
				{/if}
			{:catch}
				<p class="pe-[15px] text-[12.5px] text-base-content/65">
					Não deu para montar a prévia agora.
				</p>
			{/await}
		</div>
	</div>
{/if}
