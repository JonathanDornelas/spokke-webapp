<script lang="ts">
	// Etapa 3 — Nível 2 (kernel.md): resumo LEGÍVEL de cada item gerado. Nunca
	// JSON. Um material pode não gerar nada — isso é um aviso com ação, não uma
	// falha silenciosa. `+page@.svelte` reseta para o layout raiz.
	import { resolve } from '$app/paths';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import WizardShell from '$lib/components/WizardShell.svelte';
	import Loading from '$lib/components/Loading.svelte';
	import { withMock } from '$lib/dev/with-mock';
	import {
		aceitarTodosItens,
		criarItemManual,
		descartarItem,
		gerarItens
	} from '../../atividades.remote';

	type ItemIcon = 'assemble' | 'choice' | 'reading' | 'select' | 'writing';
	interface ReviewItem {
		id: string;
		icon: ItemIcon;
		summary: string;
		meta: string;
		accepted: boolean;
		discardReason?: string;
	}
	interface ReviewGroup {
		materialId: string;
		kindLabel: string;
		excerpt: string;
		reason?: string;
		items: ReviewItem[];
	}

	interface PageData {
		activity: { id: string; title: string; dir: 'ltr' | 'rtl' };
		generating: boolean;
		materialCount: number;
		groups: ReviewGroup[];
	}

	const MOCK: PageData = {
		activity: {
			id: page.params.id ?? 'atv_01',
			title: 'Present perfect — turma B',
			dir: 'ltr' as const
		},
		generating: false,
		materialCount: 2,
		groups: [
			{
				materialId: 'mat_01',
				kindLabel: 'par de frases',
				excerpt: 'She has been working here since 2019.',
				items: [
					{
						id: 'itm_01',
						icon: 'assemble',
						summary: 'Montar a frase a partir da tradução',
						meta: 'Montar a frase · leitura',
						accepted: true
					},
					{
						id: 'itm_02',
						icon: 'choice',
						summary: 'Ouvir e escolher entre 4 opções',
						meta: 'Escolher a alternativa · escuta',
						accepted: true
					},
					{
						id: 'itm_03',
						icon: 'writing',
						summary: 'Digitar a frase ao ouvir o áudio',
						meta: 'Digitar a resposta · escuta + escrita',
						accepted: false,
						discardReason: 'Muito parecido com o item 2'
					}
				]
			},
			{
				materialId: 'mat_02',
				kindLabel: 'par de frases',
				excerpt: 'I have already finished the report.',
				items: [
					{
						id: 'itm_04',
						icon: 'assemble',
						summary: 'Montar a frase a partir da tradução',
						meta: 'Montar a frase · leitura',
						accepted: true
					}
				]
			}
		] as ReviewGroup[]
	};

	let { data: dataProp }: { data?: Partial<PageData> } = $props();
	const data = $derived(withMock(dataProp, MOCK));

	const totalItens = $derived(data.groups.flatMap((g) => g.items).length);
	const accepted = $derived(data.groups.flatMap((g) => g.items).filter((i) => i.accepted).length);

	const descartados = $derived(totalItens - accepted);

	let regenerando = $state(false);
	let criando = $state(false);

	const materiaisHref = $derived(
		resolve('/(studio)/atividades/[id]/materiais', { id: data.activity.id })
	);

	async function regerar() {
		regenerando = true;
		try {
			await gerarItens({ activityId: data.activity.id });
			await invalidateAll();
		} finally {
			regenerando = false;
		}
	}

	// Descartar MARCA o item do rascunho; ele continua lá para o "Restaurar"
	// funcionar na mesma tela e some só na publicação. Versão publicada nunca
	// é tocada (regra inviolável nº 7).
	// Qual item está indo ao servidor. Um id, não um booleano: são N botões na
	// tela, e um booleano só faria os N piscarem juntos.
	let marcandoId = $state<string | null>(null);
	async function marcar(itemId: string, descartado: boolean) {
		marcandoId = itemId;
		try {
			await descartarItem({ activityId: data.activity.id, itemId, descartado });
			await invalidateAll();
		} finally {
			marcandoId = null;
		}
	}

	let aceitando = $state(false);
	async function aceitarTodos() {
		aceitando = true;
		try {
			await aceitarTodosItens({ activityId: data.activity.id });
			await invalidateAll();
		} finally {
			aceitando = false;
		}
	}

	// Nível 3 de autoria: o item nasce vazio no rascunho e o editor abre nele.
	async function criarDoZero() {
		criando = true;
		try {
			const { itemId } = await criarItemManual({ activityId: data.activity.id });
			await goto(
				resolve('/(studio)/atividades/[id]/itens/[itemId]', { id: data.activity.id, itemId })
			);
		} finally {
			criando = false;
		}
	}

	const kindIcon: Record<ItemIcon, string> = {
		assemble: 'M2.5 5.5h19v13h-19zM7 10h.01M11 10h.01M15 10h.01M8 14.5h8',
		choice: 'M4 12.5V11a8 8 0 1116 0v1.5',
		reading:
			'M3 5.5h6a3 3 0 013 3v10a2.5 2.5 0 00-2.5-2.5H3zM21 5.5h-6a3 3 0 00-3 3v10a2.5 2.5 0 012.5-2.5H21z',
		select: 'M4 8.5h16M4 15.5h7',
		writing: 'M4 20h4l11-11a2.83 2.83 0 10-4-4L4 16z'
	};
</script>

<svelte:head><title>Revisar questões · {data.activity.title} · Spokke</title></svelte:head>

<WizardShell
	step={3}
	backHref={resolve('/(studio)/atividades/[id]/materiais', { id: data.activity.id })}
	backLabel="Materiais"
	status="{accepted} aceitos de {totalItens}"
	hint="{accepted} itens entrarão na atividade."
>
	<div class="px-4 py-6 lg:px-[34px] lg:py-[30px]">
		{#if data.generating}
			<!-- `orbita` é a variante de espera LONGA, e esta é a mais longa do
			     Studio: ela é a única que aguenta ficar em tela sem irritar. O
			     esqueleto abaixo continua porque a estrutura do que vem é
			     conhecida — mostrar o formato informa mais do que só girar. -->
			<div class="grid max-w-[640px] gap-2">
				<div class="flex items-center gap-4 rounded-box border border-line px-5 py-[22px]">
					<Loading variant="orbita" size={48} pace="devagar" label="Gerando os itens" />
					<div class="min-w-0 flex-1">
						<p class="mb-1 text-[15px] font-bold">
							Lendo {data.materialCount} materiais e escrevendo as questões
						</p>
						<p class="text-[13px] leading-snug text-base-content/65">
							Sem prazo estimado — a geração é assíncrona.
						</p>
					</div>
				</div>
				{#each [0, 1] as i (i)}
					<div class="h-[52px] skeleton" style="animation-delay: {i * 200}ms"></div>
				{/each}
			</div>
		{:else}
			<div class="mb-6 flex flex-wrap items-center gap-3">
				<div>
					<h1 class="mb-1 font-display text-section font-semibold tracking-[-0.02em]">
						{data.groups.flatMap((g) => g.items).length} itens propostos
					</h1>
					<p class="text-[13.5px] text-base-content/65">
						Revise cada um. Nada é publicado até você chegar na etapa 4.
					</p>
				</div>
				<div class="flex-1"></div>
				<button
					type="button"
					onclick={regerar}
					disabled={regenerando}
					class="btn btn-sm motion-tap gap-2 btn-neutral font-semibold"
				>
					{#if regenerando}
						<Loading variant="fila" size={11} tone="current" label="Gerando" />
						Gerando…
					{:else}
						Gerar novamente
					{/if}
				</button>
				<button
					type="button"
					onclick={aceitarTodos}
					disabled={descartados === 0 || aceitando}
					class="btn btn-sm motion-tap gap-2 btn-outline font-bold"
				>
					{#if aceitando}
						<Loading variant="fila" size={11} tone="current" label="Aceitando" />
						Aceitando…
					{:else}
						Aceitar todos{descartados > 0 ? ` (${descartados})` : ''}
					{/if}
				</button>
			</div>

			<div class="grid gap-5">
				{#each data.groups as group (group.materialId)}
					<!-- `min-w-0`: cada grupo é item de grid e, sem isso, a frase longa
					     do material estica a coluna e a página ganha rolagem lateral. -->
					<section class="min-w-0">
						<div class="mb-2.5 flex min-w-0 items-center gap-2.5">
							<span
								class="shrink-0 text-[11px] font-bold tracking-[0.09em] text-base-content/65 uppercase"
								>De um {group.kindLabel}</span
							>
							<span
								class="min-w-0 truncate font-content text-[13px] text-base-content/65"
								dir={data.activity.dir}>"{group.excerpt}"</span
							>
							<span class="h-px flex-1 bg-line"></span>
						</div>

						{#if group.items.length === 0}
							<div
								class="flex gap-3 rounded-box border border-s-[3px] border-line border-s-warning bg-base-200 px-[18px] py-4"
							>
								<svg
									class="size-[19px] shrink-0 text-warning"
									viewBox="0 0 24 24"
									fill="none"
									aria-hidden="true"
								>
									<path
										d="M12 3.5l9.5 16.5H2.5z"
										stroke="currentColor"
										stroke-width="2"
										stroke-linejoin="round"
									/>
									<path
										d="M12 9.5v4.5M12 17h.01"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
									/>
								</svg>
								<div class="flex-1">
									<p class="mb-1 text-sm font-semibold">Nada gerado a partir deste material</p>
									<p class="text-[13px] leading-snug text-base-content/65">{group.reason}</p>
								</div>
								<a
									href={materiaisHref}
									class="self-center p-2 text-[13px] font-bold whitespace-nowrap text-primary no-underline"
									>Adicionar palavras</a
								>
							</div>
						{:else}
							<ul class="grid list-none gap-2 p-0">
								{#each group.items as item (item.id)}
									<li
										class="flex min-w-0 items-center gap-3.5 rounded-box border border-line px-4 py-3.5
											       transition-[border-color,opacity] {item.accepted
											? 'bg-base-100 hover:border-primary'
											: 'bg-base-200 opacity-65'}"
									>
										<span
											class="grid size-[34px] shrink-0 place-items-center rounded-field bg-base-300 text-primary"
										>
											<svg class="size-[17px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
												<path
													d={kindIcon[item.icon]}
													stroke="currentColor"
													stroke-width="2"
													stroke-linecap="round"
													stroke-linejoin="round"
												/>
											</svg>
										</span>
										<div class="min-w-0 flex-1">
											<p
												class="mb-0.5 text-[14.5px] font-semibold {item.accepted
													? ''
													: 'line-through decoration-base-content/50'}"
											>
												{item.summary}
											</p>
											<p class="text-[12.5px] text-base-content/65">
												{item.accepted ? item.meta : item.discardReason}
											</p>
										</div>
										{#if item.accepted}
											<span class="flex items-center gap-1.5 text-xs font-bold text-success">
												<svg class="size-[15px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
													<path
														d="M4 12.5l5 5L20 6.5"
														stroke="currentColor"
														stroke-width="2.6"
														stroke-linecap="round"
														stroke-linejoin="round"
													/>
												</svg>
												Aceito
											</span>
											<a
												href={resolve('/(studio)/atividades/[id]/itens/[itemId]', {
													id: data.activity.id,
													itemId: item.id
												})}
												class="p-2 text-[12.5px] font-semibold text-base-content/65 no-underline hover:text-base-content"
											>
												Editar
											</a>
											<button
												type="button"
												onclick={() => marcar(item.id, true)}
												disabled={marcandoId !== null}
												class="inline-flex items-center gap-1.5 p-2 text-[12.5px] font-semibold text-base-content/65 transition-colors hover:text-error"
											>
												{#if marcandoId === item.id}
													<Loading variant="fila" size={10} tone="current" label="Descartando" />
												{/if}
												Descartar
											</button>
										{:else}
											<button
												type="button"
												onclick={() => marcar(item.id, false)}
												disabled={marcandoId !== null}
												class="inline-flex items-center gap-1.5 p-2 text-[12.5px] font-bold text-primary"
											>
												{#if marcandoId === item.id}
													<Loading variant="fila" size={10} tone="current" label="Restaurando" />
												{/if}
												Restaurar
											</button>
										{/if}
									</li>
								{/each}
							</ul>
						{/if}
					</section>
				{/each}
			</div>
		{/if}
	</div>

	{#snippet actions()}
		<button
			type="button"
			onclick={criarDoZero}
			disabled={criando}
			class="btn h-[46px] flex-1 motion-tap btn-neutral font-semibold lg:flex-none"
		>
			{#if criando}
				<Loading variant="fila" size={11} tone="current" label="Criando o item" />
				Criando…
			{:else}
				<span class="lg:hidden">Novo item</span>
				<span class="hidden lg:inline">Criar item do zero</span>
			{/if}
		</button>
		<a
			href={resolve('/(studio)/atividades/[id]/publicar', { id: data.activity.id })}
			class="btn h-[46px] flex-1 motion-tap gap-2.5 btn-primary font-bold no-underline lg:flex-none"
		>
			<span class="lg:hidden">Publicar</span>
			<span class="hidden lg:inline">Continuar para publicar</span>
			<svg class="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
				<path
					d="M5 12h13M13 6l6 6-6 6"
					stroke="currentColor"
					stroke-width="2.2"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			</svg>
		</a>
	{/snippet}
</WizardShell>
