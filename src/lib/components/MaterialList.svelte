<script lang="ts">
	// A tabela de materiais — a mesma na biblioteca e na etapa 2 do wizard.
	// O que muda entre as duas é a quarta coluna ("Em uso" lá, "Origem" aqui)
	// e o que "remover" significa: apagar da biblioteca, ou só tirar desta
	// atividade. Tudo o mais é uma linha só, desenhada uma vez.
	import type { Snippet } from 'svelte';
	import Loading from './Loading.svelte';
	import IdiomaTag from './IdiomaTag.svelte';
	import { PILL_TONE, tipoDe, type MaterialRow } from './material-form';
	import { getProfile } from '$lib/kernel/language/profiles';
	import { idiomaDe } from '$lib/idiomas';
	import MenuDeAcoes from './lista/MenuDeAcoes.svelte';
	import {
		CABECALHO_DA_TABELA,
		LINHA_DA_TABELA,
		LINK_DA_LINHA,
		POR_CIMA_DO_LINK,
		TABELA,
		alternar,
		alternarPagina,
		estadoDaPagina,
		indeterminado
	} from './lista/lista';

	/** A biblioteca mistura idiomas: cada linha mostra o conteúdo na direção da língua DELA. */
	const direcaoDe = (tag: string) => (idiomaDe(tag) ? getProfile(tag).direction : 'ltr');

	let {
		materiais,
		contexto,
		contentTag = 'und',
		dir = 'ltr',
		editandoId = null,
		removendoId = null,
		onedit,
		onremove,
		detalhe,
		marcados = $bindable(),
		acoes
	}: {
		materiais: MaterialRow[];
		contexto: 'biblioteca' | 'wizard';
		contentTag?: string;
		dir?: 'ltr' | 'rtl';
		/** A linha aberta no formulário fica marcada. */
		editandoId?: string | null;
		/** O ID da linha cuja remoção está no servidor — nunca um booleano (components.md "Espera"). */
		removendoId?: string | null;
		onedit: (m: MaterialRow) => void;
		onremove: (m: MaterialRow) => void;
		/** Uma linha a mais sob o material, na largura toda (no wizard: o que ele gera). */
		detalhe?: Snippet<[MaterialRow]>;
		/** Biblioteca: os ids marcados para a ação em massa. Sem ele, a tabela não tem caixa de marcar. */
		marcados?: string[];
		/** Biblioteca: as ações do menu "⋯" de uma linha. Sem ele, ficam os botões de editar e apagar. */
		acoes?: (
			m: MaterialRow
		) => { rotulo: string; icone: string; perigo?: boolean; onclick: () => void }[];
	} = $props();

	const wiz = $derived(contexto === 'wizard');
</script>

{#if wiz}
	<!-- No WIZARD cada material é um cartão (o desenho da etapa 2): a linha com o
	     tipo, o conteúdo, "Editar" e remover — tudo centralizado na vertical — e,
	     embaixo, o que ele gera. O idioma é o da atividade, então não ocupa coluna. -->
	<ul class="grid list-none gap-2.5 p-0">
		{#each materiais as m (m.id)}
			{@const tipo = tipoDe(m.kind)}
			<li
				class="overflow-hidden rounded-[13px] border bg-base-100 transition-colors duration-200 hover:border-primary
				       {editandoId === m.id ? 'border-primary' : 'border-line'}"
			>
				<!-- 20px até a linha do "Gera": colada no título, ela parecia parte do texto. -->
				<div
					class="flex flex-wrap items-center gap-x-[13px] gap-y-2 px-[15px] pt-[13px] lg:flex-nowrap {detalhe
						? 'pb-5'
						: 'pb-[13px]'}"
				>
					<span
						class="inline-flex shrink-0 items-center rounded-full px-2.5 py-[5px] text-[11px] font-bold tracking-[0.05em] whitespace-nowrap uppercase {PILL_TONE[
							tipo.tone
						]}"
					>
						{tipo.label}
					</span>
					<div class="order-1 min-w-0 basis-full lg:order-none lg:flex-1 lg:basis-auto">
						<p
							class="truncate font-content text-[14.5px]"
							dir={m.idioma ? direcaoDe(m.idioma) : dir}
							data-content-lang={m.idioma ?? contentTag}
						>
							{m.primary}
						</p>
						<p
							class="mt-[3px] truncate text-[12.5px] {m.kind === 'text' && m.questions.length === 0
								? 'font-semibold text-base-content'
								: 'text-base-content/65'}"
						>
							{m.secondary}
						</p>
					</div>
					{#if m.daBiblioteca}
						<span
							class="shrink-0 rounded-full bg-accent/14 px-2.5 py-1 text-[11.5px] font-bold whitespace-nowrap text-accent"
							title="Este material já estava na sua biblioteca: ele foi reaproveitado, não duplicado."
						>
							biblioteca
						</span>
					{/if}
					<span class="ms-auto flex shrink-0 items-center gap-0.5 lg:ms-0">
						<button
							type="button"
							onclick={() => onedit(m)}
							aria-pressed={editandoId === m.id}
							class="min-h-10 rounded-lg px-2 text-[12.5px] font-semibold transition-colors duration-200 hover:text-base-content
							       {editandoId === m.id ? 'text-primary' : 'text-base-content/65'}"
						>
							{editandoId === m.id ? 'Editando' : 'Editar'}
						</button>
						<button
							type="button"
							onclick={() => onremove(m)}
							disabled={removendoId !== null}
							class="grid size-[34px] place-items-center rounded-[9px] text-base-content/65 transition-[color,background-color,scale] duration-200 hover:bg-base-300 hover:text-error active:scale-95 disabled:opacity-50"
							aria-label="Remover {m.primary} desta atividade"
						>
							{#if removendoId === m.id}
								<Loading variant="fila" size={10} tone="current" label="Removendo" />
							{:else}
								<svg class="size-3.5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
									<path
										d="M6 6l12 12M18 6L6 18"
										stroke="currentColor"
										stroke-width="2.2"
										stroke-linecap="round"
									/>
								</svg>
							{/if}
						</button>
					</span>
				</div>
				{#if detalhe}{@render detalhe(m)}{/if}
			</li>
		{/each}
	</ul>
{:else}
	<!-- Na BIBLIOTECA é a tabela das listas do Studio (components.md "Listas do
	     Studio"): a caixa de marcar (quando a tela passa `marcados`), o tipo, o
	     conteúdo, o idioma, em quantas atividades ele está e o "⋯" com as ações
	     (quando a tela passa `acoes`). A linha inteira abre a edição: o botão do
	     conteúdo cobre a linha, e a caixa e o menu ficam por cima. -->
	{@const comSelecao = marcados !== undefined}
	{@const ids = materiais.map((m) => m.id)}
	{@const pagina = estadoDaPagina(marcados ?? [], ids)}
	{@const grade = comSelecao
		? 'grid-cols-[auto_minmax(0,1fr)_auto] lg:grid-cols-[28px_132px_minmax(0,1fr)_148px_128px_44px]'
		: 'grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-[132px_minmax(0,1fr)_148px_128px_96px]'}
	<div class={TABELA}>
		<div class="hidden items-center lg:grid {grade} {CABECALHO_DA_TABELA}">
			{#if comSelecao}
				<input
					type="checkbox"
					class="checkbox checkbox-primary"
					checked={pagina.todos}
					use:indeterminado={pagina.alguns}
					onchange={() => (marcados = alternarPagina(marcados ?? [], ids))}
					aria-label="Marcar os materiais desta página"
				/>
			{/if}
			<span>Tipo</span>
			<span>Conteúdo</span>
			<span>Idioma</span>
			<span>Em uso</span>
			<span></span>
		</div>
		{#each materiais as m (m.id)}
			{@const tipo = tipoDe(m.kind)}
			{@const marcado = marcados?.includes(m.id) ?? false}
			<div
				class="grid gap-y-2 {grade} {LINHA_DA_TABELA}
				       {marcado ? 'bg-primary/6' : editandoId === m.id ? 'bg-base-200' : ''}"
			>
				<!-- No celular: caixa, pílula e ações na primeira linha, o conteúdo na
				     segunda. As posições vão EXPLÍCITAS porque item com linha fixa é
				     colocado antes dos automáticos. -->
				{#if comSelecao}
					<input
						type="checkbox"
						class="col-start-1 row-start-1 checkbox checkbox-primary lg:col-auto lg:row-auto {POR_CIMA_DO_LINK}"
						checked={marcado}
						onchange={() => (marcados = alternar(marcados ?? [], m.id))}
						aria-label="Marcar {m.primary}"
					/>
				{/if}
				<span
					class="{comSelecao
						? 'col-start-2'
						: 'col-start-1'} row-start-1 inline-flex items-center gap-1.5 justify-self-start rounded-full px-2.5 py-1 text-[12px] font-bold whitespace-nowrap lg:col-auto lg:row-auto {PILL_TONE[
						tipo.tone
					]}"
				>
					<svg class="size-[13px] shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
						<path
							d={tipo.icon}
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
					{tipo.label}
				</span>
				<button
					type="button"
					onclick={() => onedit(m)}
					class="{comSelecao
						? 'col-span-3'
						: 'col-span-2'} row-start-2 min-w-0 text-start lg:col-span-1 lg:row-auto {LINK_DA_LINHA}"
					aria-label="Editar {m.primary}"
				>
					<span
						class="mb-0.5 block truncate font-content text-[14px] font-semibold"
						dir={m.idioma ? direcaoDe(m.idioma) : dir}
						data-content-lang={m.idioma ?? contentTag}>{m.primary}</span
					>
					<span
						class="block truncate text-[12.5px] {m.kind === 'text' && m.questions.length === 0
							? 'font-semibold text-warning'
							: 'text-base-content/65'}">{m.secondary}</span
					>
				</button>
				<span class="hidden min-w-0 lg:block"><IdiomaTag tag={m.idioma} /></span>
				<span class="hidden min-w-0 lg:block">
					{#if m.arquivado}
						<span
							class="inline-block rounded-full border border-dashed border-line px-2.5 py-1 text-xs font-bold whitespace-nowrap text-base-content/65"
							>arquivado</span
						>
					{:else if m.usedIn === 0}
						<span class="text-[13px] text-base-content/50">nenhuma atividade</span>
					{:else}
						<span class="text-[13px] text-base-content/65">
							{m.usedIn}
							{m.usedIn === 1 ? 'atividade' : 'atividades'}
						</span>
					{/if}
				</span>
				<span
					class="{comSelecao
						? 'col-start-3'
						: 'col-start-2'} row-start-1 flex justify-self-end lg:col-auto lg:row-auto"
				>
					{#if acoes}
						<MenuDeAcoes
							rotulo="Mais ações de {m.primary}"
							ocupado={removendoId === m.id}
							acoes={acoes(m)}
						/>
					{:else}
						<span class="flex gap-1.5 {POR_CIMA_DO_LINK}">
							<button
								type="button"
								onclick={() => onedit(m)}
								class="btn btn-sm {editandoId === m.id ? 'btn-outline' : 'btn-plain'}"
								>Editar</button
							>
							<button
								type="button"
								onclick={() => onremove(m)}
								disabled={removendoId !== null}
								class="grid size-[38px] place-items-center rounded-field border border-line text-base-content/65 transition-colors hover:border-error hover:text-error disabled:opacity-50"
								aria-label="Apagar {m.primary} da biblioteca"
							>
								{#if removendoId === m.id}
									<Loading variant="fila" size={10} tone="current" label="Removendo" />
								{:else}
									<svg class="size-[15px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
										<path
											d="M5 7.5h14M9.5 7.5V5.5h5v2M7 7.5l1 12h8l1-12"
											stroke="currentColor"
											stroke-width="2"
											stroke-linecap="round"
											stroke-linejoin="round"
										/>
									</svg>
								{/if}
							</button>
						</span>
					{/if}
				</span>
			</div>
		{/each}
	</div>
{/if}
