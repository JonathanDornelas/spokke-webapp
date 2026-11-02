<script lang="ts">
	// Escolher VÁRIAS atividades para um módulo — no "Novo módulo" e no
	// "Acrescentar atividades" do módulo aberto, a mesma lista.
	//
	// **A ordem do clique é a ordem do módulo**, e cada escolhida mostra o
	// número dela: a sequência é o que o aluno recebe e o que o mapa desenha,
	// então ela se vê enquanto se escolhe (reordenar continua no módulo, por
	// arrastar e pelas setas). Busca e idioma são de TELA — a lista já veio
	// inteira no loader.
	import FiltroIdioma from './FiltroIdioma.svelte';
	import IdiomaTag from './IdiomaTag.svelte';
	import { casaComFiltro } from '$lib/idiomas';

	type Atividade = {
		id: string;
		title: string;
		level: string | null;
		idioma: string | null;
		noAr: boolean;
	};

	let {
		atividades,
		escolhidas = $bindable([]),
		vazio = 'Nenhuma atividade para escolher.'
	}: {
		atividades: Atividade[];
		/** Os ids, NA ORDEM em que foram marcados. */
		escolhidas?: string[];
		/** O que dizer quando não há nenhuma — cada tela sabe por quê. */
		vazio?: string;
	} = $props();

	let busca = $state('');
	let idioma = $state('');

	/** Busca de TELA: sem caixa e sem acento, para "intermediario" achar "Intermediário". */
	const simples = (t: string) =>
		t.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR');
	const visiveis = $derived.by(() => {
		const q = simples(busca.trim());
		return atividades.filter(
			(a) => casaComFiltro(a.idioma, idioma) && (!q || simples(a.title).includes(q))
		);
	});

	function alternar(id: string) {
		escolhidas = escolhidas.includes(id) ? escolhidas.filter((x) => x !== id) : [...escolhidas, id];
	}
</script>

{#if atividades.length === 0}
	<p
		class="rounded-box border border-dashed border-line px-4 py-5 text-[13.5px] leading-relaxed text-base-content/65"
	>
		{vazio}
	</p>
{:else}
	<div class="mb-3 grid gap-3">
		{#if atividades.length > 6}
			<label
				class="flex min-h-11 items-center gap-2 rounded-field border border-line bg-base-200 px-3"
			>
				<svg
					class="size-4 shrink-0 text-base-content/50"
					viewBox="0 0 24 24"
					fill="none"
					aria-hidden="true"
				>
					<circle cx="11" cy="11" r="6.5" stroke="currentColor" stroke-width="2" />
					<path d="M16 16l4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
				</svg>
				<span class="sr-only">Buscar pelo título</span>
				<input
					bind:value={busca}
					type="search"
					placeholder="Buscar pelo título"
					class="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-base-content/50"
				/>
			</label>
		{/if}
		<FiltroIdioma tags={atividades.map((a) => a.idioma)} bind:valor={idioma} formato="chips" />
	</div>

	<ul class="grid list-none gap-1.5 p-0">
		{#each visiveis as a (a.id)}
			{@const posicao = escolhidas.indexOf(a.id)}
			<li>
				<label
					class="flex min-h-13 cursor-pointer items-center gap-3 rounded-box border-[1.5px] border-line bg-base-100 px-3 py-2 transition-colors hover:border-primary/60 has-[:checked]:border-primary has-[:checked]:bg-primary/6"
				>
					<input
						type="checkbox"
						class="checkbox flex-none checkbox-primary"
						checked={posicao >= 0}
						onchange={() => alternar(a.id)}
					/>
					<span class="min-w-0 flex-1">
						<span class="block truncate text-[14px] font-semibold">{a.title}</span>
						<span class="flex flex-wrap items-center gap-x-2 text-[12px] text-base-content/65">
							{#if a.level}<span>{a.level}</span><span aria-hidden="true">·</span>{/if}
							<span>{a.noAr ? 'no ar' : 'rascunho · só sai para a turma depois de publicada'}</span>
						</span>
					</span>
					<IdiomaTag tag={a.idioma} compacta />
					<!-- A posição na sequência, só nas escolhidas. -->
					<span
						class="grid size-7 flex-none place-items-center rounded-full font-mono text-[12px] font-medium {posicao >=
						0
							? 'bg-primary text-primary-content'
							: 'invisible'}"
						aria-hidden={posicao < 0}
						>{posicao >= 0 ? posicao + 1 : ''}<span class="sr-only">ª na ordem</span></span
					>
				</label>
			</li>
		{:else}
			<li class="px-1 py-3 text-[13px] text-base-content/65">Nenhuma atividade com esse filtro.</li>
		{/each}
	</ul>
{/if}
