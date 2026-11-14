<script lang="ts">
	// O FILTRO por idioma das listas do Studio (`$lib/idiomas.ts`). Dois
	// formatos, porque ele senta ao lado dos filtros que a tela JÁ tem: `select`
	// onde os outros são selects (atividades, turmas), `chips` onde os outros são
	// chips (biblioteca de materiais). Um filtro de idioma com cara diferente dos
	// vizinhos leria como outra ferramenta.
	//
	// Oferece só os idiomas PRESENTES na lista (mais "sem idioma", se houver), e
	// **some quando há um só**: um filtro de uma opção é ruído, e um com os dez
	// idiomas sempre devolveria lista vazia.
	import { idiomasPresentes, SEM_IDIOMA } from '$lib/idiomas';

	let {
		tags,
		valor = $bindable(''),
		formato = 'select',
		id = 'filtro-idioma',
		onmudou
	}: {
		/** As tags da lista inteira (não da página): é delas que saem as opções. */
		tags: (string | null | undefined)[];
		/** `''` = todos; uma tag; ou `SEM_IDIOMA`. */
		valor?: string;
		formato?: 'select' | 'chips';
		id?: string;
		/** Para a tela voltar à página 1 — filtrar e ficar na 3ª deixa a tabela vazia. */
		onmudou?: (valor: string) => void;
	} = $props();

	const presentes = $derived(idiomasPresentes(tags));
	const opcoes = $derived(presentes.idiomas.length + (presentes.temSemIdioma ? 1 : 0));

	function escolher(v: string) {
		valor = valor === v ? '' : v;
		onmudou?.(valor);
	}

	const chip =
		'inline-flex min-h-[34px] items-center gap-1.5 rounded-full border-[1.5px] py-1 ps-1 pe-3 text-[12.5px] font-semibold transition-colors';
</script>

{#if opcoes > 1}
	{#if formato === 'select'}
		<label class="sr-only" for={id}>Filtrar por idioma</label>
		<select
			{id}
			bind:value={valor}
			onchange={() => onmudou?.(valor)}
			class="select h-10 min-h-10 w-auto py-0 text-[13px]"
		>
			<option value="">Todos os idiomas</option>
			{#each presentes.idiomas as i (i.tag)}
				<option value={i.tag}>{i.rotulo}</option>
			{/each}
			{#if presentes.temSemIdioma}
				<option value={SEM_IDIOMA}>Sem idioma</option>
			{/if}
		</select>
	{:else}
		<div class="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por idioma">
			{#each presentes.idiomas as i (i.tag)}
				<button
					type="button"
					onclick={() => escolher(i.tag)}
					aria-pressed={valor === i.tag}
					class="{chip} {valor === i.tag
						? 'border-primary bg-primary text-primary-content'
						: 'border-line bg-base-100 hover:border-primary'}"
				>
					<span
						class="grid h-[22px] min-w-[26px] place-items-center rounded-full px-1 font-mono text-[10.5px] font-medium tracking-[0.04em] {valor ===
						i.tag
							? 'bg-primary-content/20 text-primary-content'
							: 'bg-base-300 text-primary'}"
						aria-hidden="true">{i.codigo}</span
					>
					{i.rotulo}
				</button>
			{/each}
			{#if presentes.temSemIdioma}
				<button
					type="button"
					onclick={() => escolher(SEM_IDIOMA)}
					aria-pressed={valor === SEM_IDIOMA}
					class="inline-flex min-h-[34px] items-center rounded-full border-[1.5px] px-3.5 py-1 text-[12.5px] font-semibold transition-colors {valor ===
					SEM_IDIOMA
						? 'border-primary bg-primary text-primary-content'
						: 'border-dashed border-line bg-base-100 text-base-content/70 hover:border-primary'}"
					>Sem idioma</button
				>
			{/if}
		</div>
	{/if}
{/if}
