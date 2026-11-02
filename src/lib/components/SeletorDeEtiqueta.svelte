<script lang="ts">
	// A cor da etiqueta de turma e de módulo, escolhida pela ETIQUETA já com a
	// sigla — o professor vê como ela vai aparecer na lista, não uma bolinha de
	// cor (components.md "Etiqueta de cor"). Era o mesmo markup em quatro
	// formulários, e cada um com um tamanho.
	//
	// São rádios de verdade: as setas andam entre as cores, e o valor vai no
	// `<form>` pelo `name` quando a tela usa um (a turma). O nome da cor vai no
	// texto escondido e no `title` — cor sozinha não se anuncia.
	import {
		CLASSE_DA_ETIQUETA,
		CORES_DE_ETIQUETA,
		NOME_DA_COR,
		type CorDeEtiqueta
	} from '$lib/etiquetas';

	let {
		cor = $bindable(),
		sigla,
		name,
		rotulo = 'Cor da etiqueta'
	}: {
		cor: CorDeEtiqueta;
		/** As letras que a etiqueta mostra — saem do nome, e mudam enquanto ele é digitado. */
		sigla: string;
		/** O campo do `<form>`, quando a cor é enviada por formulário. */
		name?: string;
		rotulo?: string;
	} = $props();

	const id = $props.id();
</script>

<fieldset class="fieldset border-0 p-0">
	<legend class="mb-1.5 fieldset-legend">{rotulo}</legend>
	<div class="flex flex-wrap gap-2">
		{#each CORES_DE_ETIQUETA as opcao (opcao)}
			<label class="cursor-pointer" title={NOME_DA_COR[opcao]}>
				<input
					type="radio"
					name={name ?? `cor-${id}`}
					value={opcao}
					bind:group={cor}
					class="peer sr-only"
				/>
				<span class="sr-only">{NOME_DA_COR[opcao]}</span>
				<span
					aria-hidden="true"
					class="grid size-12 place-items-center rounded-[12px] border-2 border-line bg-base-100 transition-[border-color,background-color,translate] peer-checked:border-primary peer-checked:bg-base-200 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary hover:-translate-y-0.5"
				>
					<span
						class="grid size-8 place-items-center rounded-[8px] text-[11px] font-bold {CLASSE_DA_ETIQUETA[
							opcao
						]}">{sigla}</span
					>
				</span>
			</label>
		{/each}
	</div>
</fieldset>
