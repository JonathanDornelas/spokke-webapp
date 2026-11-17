<script lang="ts">
	// O bloco de cima da lista de materiais: quantas questões entram na atividade
	// e os tipos de questão para TODOS os materiais. Mexer aqui muda todos; o tipo
	// ligado em só alguns aparece tracejado, sem número, e o clique nele o liga em
	// todos (`$lib/atividades/tipos-por-material.ts`). O clique que deixaria um
	// material sem tipo nenhum não desliga: o chip fica com o cursor de bloqueado
	// e o `title` diz o que fazer.
	//
	// A quantidade não corta nada nesta tela: a geração é para todos os materiais,
	// e o que passar do número fica "fora" na revisão, para o professor trocar.
	import { MAX_ITENS, TETO_POR_HABILIDADE, maximoPelosTetos } from '$lib/kernel/generators/select';
	import { fraseDoTeto } from '$lib/atividades/de-fora';
	import { skillLabels } from '$lib/kernel/interactions/skill-schema';
	import type { Skill } from '$lib/kernel/interactions/types';
	import {
		TIPOS,
		bloqueioNoGeral,
		estadoNoGeral,
		type PlanoDeTipos
	} from '$lib/atividades/tipos-por-material';

	let {
		quantidade = $bindable(),
		plano,
		materiais,
		indisponiveis,
		onquantidade,
		onalternar
	}: {
		quantidade: number;
		plano: PlanoDeTipos;
		/** Os ids dos materiais desta atividade, na ordem da lista. */
		materiais: string[];
		/** Tipos que o servidor não entrega hoje, com o motivo. */
		indisponiveis: Map<Skill, string>;
		onquantidade: () => void;
		onalternar: (tipo: Skill) => void;
	} = $props();

	// Só fala (ou só escuta) ligada e mais questões pedidas do que o teto deixa:
	// o botão gera o teto, e esta linha diz por quê e como passar dele.
	const maximo = $derived(maximoPelosTetos(plano.geral));
	const avisoDoTeto = $derived(
		maximo !== null && quantidade > maximo
			? `${fraseDoTeto(plano.geral)} Ligue outro tipo para passar de ${maximo}.`
			: null
	);
</script>

<section
	class="mb-4 rounded-box border border-line bg-base-200 px-4 py-3.5"
	aria-labelledby="bg-titulo"
>
	<h3 id="bg-titulo" class="sr-only">O que gerar</h3>
	<div class="flex flex-wrap items-center gap-x-4 gap-y-3">
		<!-- A trilha ocupa o que sobra da linha. Ela não anda no clique porque os
		     chips ao lado não mudam de largura ao ligar e desligar (o "máx." fica, e
		     o texto reserva a largura do negrito). -->
		<div class="flex min-w-[14rem] flex-1 items-center gap-3">
			<label for="bg-quantidade" class="text-[13px] font-bold">Gerar</label>
			<input
				id="bg-quantidade"
				type="range"
				min="1"
				max={MAX_ITENS}
				bind:value={quantidade}
				oninput={onquantidade}
				class="range min-w-[6rem] flex-1"
				style="--preenchido: {(quantidade - 1) / (MAX_ITENS - 1)}"
				aria-valuetext="{quantidade} {quantidade === 1 ? 'questão' : 'questões'}"
			/>
			<output
				for="bg-quantidade"
				class="min-w-[6.5rem] text-[13px] font-semibold whitespace-nowrap"
			>
				<span class="font-mono text-primary">{quantidade}</span>
				{quantidade === 1 ? 'questão' : 'questões'}
			</output>
		</div>

		<div
			class="flex flex-wrap gap-1.5"
			role="group"
			aria-label="Tipos de questão para todos os materiais"
		>
			{#each TIPOS as tipo (tipo)}
				{@const motivo = indisponiveis.get(tipo)}
				{@const estado = estadoNoGeral(plano, tipo, materiais)}
				{@const ligado = !motivo && estado.tipo !== 'nenhum'}
				{@const bloqueio = motivo ? null : bloqueioNoGeral(plano, tipo, materiais, indisponiveis)}
				<!-- Bloqueado é `aria-disabled`, não `disabled`: o chip continua
				     alcançável pelo teclado e pelo ponteiro, e o `title` aparece. -->
				<button
					type="button"
					onclick={() => {
						if (!bloqueio) onalternar(tipo);
					}}
					disabled={!!motivo}
					aria-disabled={bloqueio ? true : undefined}
					aria-pressed={motivo
						? false
						: estado.tipo === 'todos'
							? true
							: estado.tipo === 'alguns'
								? 'mixed'
								: false}
					title={motivo ?? bloqueio ?? undefined}
					class="flex min-h-[30px] items-center gap-[5px] rounded-full ps-2 pe-2.5 text-[12px] whitespace-nowrap transition-[background-color,color,border-color] duration-150 disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed
					       {ligado
						? estado.tipo === 'alguns'
							? 'border border-dashed border-primary bg-base-100 font-bold text-primary'
							: 'border border-base-300 bg-base-300 font-bold text-primary'
						: 'border border-dashed border-base-content/35 font-semibold text-base-content/65'}"
				>
					<svg class="size-3" viewBox="0 0 24 24" fill="none" aria-hidden="true">
						<path
							d={estado.tipo === 'todos' && !motivo ? 'M4 12.5l5 5L20 6.5' : 'M6 12h12'}
							stroke="currentColor"
							stroke-width="2.8"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
					<!-- A largura é sempre a do texto em negrito: o desligado é mais leve,
					     e trocar o peso no clique também empurrava os vizinhos. -->
					<span class="grid">
						<span class="invisible col-start-1 row-start-1 font-bold" aria-hidden="true"
							>{skillLabels[tipo]}</span
						>
						<span class="col-start-1 row-start-1">{skillLabels[tipo]}</span>
					</span>
					<!-- O "máx." fica ligado ou desligado: sumindo no clique, o chip
					     encolhia e empurrava os vizinhos. O tipo ligado em só alguns
					     materiais é o tracejado, sem número (pedido do dono do repositório). -->
					{#if TETO_POR_HABILIDADE[tipo]}
						<span class="font-mono text-[11px] font-semibold opacity-75"
							>máx. {TETO_POR_HABILIDADE[tipo]}</span
						>
					{/if}
				</button>
			{/each}
		</div>
	</div>

	{#if indisponiveis.size > 0 || plano.geral.length === 0 || avisoDoTeto}
		<div
			class="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-base-content/65"
		>
			{#if plano.geral.length === 0}
				<span role="status">Ligue ao menos um tipo de questão para gerar.</span>
			{/if}
			{#if avisoDoTeto}
				<span role="status">{avisoDoTeto}</span>
			{/if}
			{#each [...indisponiveis] as [tipo, motivo] (tipo)}
				<span>{skillLabels[tipo]}: {motivo}.</span>
			{/each}
		</div>
	{/if}
</section>
