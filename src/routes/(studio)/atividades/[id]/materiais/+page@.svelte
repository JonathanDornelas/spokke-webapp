<script lang="ts">
	// Etapa 2 — Nível 1 de autoria (kernel.md): colar conteúdo. Nada de configurar
	// interação aqui. `+page@.svelte` reseta para o layout raiz, sem a barra
	// lateral do Studio.
	//
	// O formulário é o MESMO da biblioteca (`MaterialForm.svelte`): lá ele é
	// painel sobre a lista, aqui é coluna fixa à esquerda. No celular ele cobre a
	// lista e "Ver os N materiais" alterna entre os dois.
	import { resolve } from '$app/paths';
	import IdiomaTag from '$lib/components/IdiomaTag.svelte';
	import FiltroIdioma from '$lib/components/FiltroIdioma.svelte';
	import { casaComFiltro } from '$lib/idiomas';
	import Loading from '$lib/components/Loading.svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import MaterialForm, { type MaterialRef, type Modo } from '$lib/components/MaterialForm.svelte';
	import MaterialList from '$lib/components/MaterialList.svelte';
	import WizardShell from '$lib/components/WizardShell.svelte';
	import AmbientShapes from '$lib/components/AmbientShapes.svelte';
	import {
		KIND_TO_KERNEL,
		PILL_TONE,
		TIPOS,
		tipoDe,
		type MaterialKind,
		type MaterialRow
	} from '$lib/components/material-form';
	import { withMock } from '$lib/dev/with-mock';
	import { aceitarPropostasIa, gerarPropostasIa } from '../../../materiais/ia.remote';
	import { sugerirTraducao } from '../../../materiais/traducao.remote';
	import type { ResultadoMaterial } from '$lib/components/MaterialForm.svelte';
	import type { EstadoDaIa, RespostaDaGeracao } from '$lib/billing/ia';
	import type { ContentUnitKind } from '$lib/kernel/content/types';
	import { estimarRendimento } from '$lib/kernel/content/rendimento';
	import {
		adicionarMaterial,
		adicionarMateriaisEmLote,
		editarMaterial,
		gerarItens,
		materiaisDisponiveis,
		removerMaterial,
		usarDaBiblioteca
	} from '../../atividades.remote';

	interface PageData {
		activity: {
			id: string;
			title: string;
			dir: 'ltr' | 'rtl';
			tag: string;
			targetLabel: string;
			sourceLabel: string;
			sourceTag: string;
		};
		materials: MaterialRow[];
		ia: EstadoDaIa;
		traducaoAutomatica: boolean;
	}

	const MOCK: PageData = {
		activity: {
			id: page.params.id ?? 'atv_01',
			title: 'Present perfect — turma B',
			dir: 'ltr',
			tag: 'en-US',
			targetLabel: 'Inglês',
			sourceLabel: 'Português',
			sourceTag: 'pt-BR'
		},
		materials: [
			{
				id: 'mat_01',
				kind: 'pair',
				primary: 'She has been working here since 2019.',
				secondary: 'Ela trabalha aqui desde 2019.',
				idioma: 'en-US',
				usedIn: 2,
				daBiblioteca: true,
				target: 'She has been working here since 2019.',
				source: 'Ela trabalha aqui desde 2019.',
				raw: '',
				note: '',
				example: '',
				questions: [],
				lines: []
			},
			{
				id: 'mat_02',
				kind: 'pair',
				primary: 'I have already finished the report.',
				secondary: 'Eu já terminei o relatório.',
				idioma: 'en-US',
				usedIn: 1,
				daBiblioteca: false,
				target: 'I have already finished the report.',
				source: 'Eu já terminei o relatório.',
				raw: '',
				note: '',
				example: '',
				questions: [],
				lines: []
			}
		],
		ia: {
			configurada: false,
			pode: false,
			motivo: 'ia',
			saldo: 0,
			custoPorProposta: 1,
			idiomas: null
		},
		traducaoAutomatica: false
	};

	let { data: dataProp }: { data?: Partial<PageData> } = $props();
	const data = $derived(withMock(dataProp, MOCK));

	// ── o formulário ────────────────────────────────────────────────────────
	let formulario = $state<MaterialForm | null>(null);
	let modo = $state<Modo>('um');
	let editando = $state<MaterialRow | null>(null);
	let salvando = $state(false);
	/** No celular só um dos dois cabe: o formulário ou a lista. */
	let formAberto = $state(true);

	// Uma remote function por modo. Os campos são os mesmos, e duplicar o
	// markup faria as duas telas divergirem no primeiro ajuste de layout.
	const acao = $derived(
		editando ? editarMaterial : modo === 'lista' ? adicionarMateriaisEmLote : adicionarMaterial
	);
	const resultado = $derived(acao.result);

	// ── gerar com IA ── nos idiomas DESTA atividade (o servidor os lê dela, não do
	// browser). O `requestId` torna o débito idempotente: clique duplo não paga duas vezes.
	let resultadoIa = $state<ResultadoMaterial | undefined>(undefined);

	async function gerarIa(pedido: {
		kind: ContentUnitKind;
		texto: string;
		quantos: 5 | 10 | 20;
	}): Promise<RespostaDaGeracao> {
		const r = await gerarPropostasIa({
			requestId: crypto.randomUUID(),
			kind: pedido.kind,
			pedido: pedido.texto,
			quantos: pedido.quantos,
			activityId: data.activity.id
		});
		return r.ok ? { ok: true, propostas: r.propostas, saldo: r.saldo } : r;
	}

	// A sugestão de tradução enquanto o professor digita. Falhar é normal (o
	// tradutor pode estar carregando): a tela diz e o servidor traduz ao salvar.
	async function sugerir(texto: string, de: string, para: string): Promise<string | null> {
		try {
			const r = await sugerirTraducao({ texto, de, para });
			return r.ok ? r.traducao : null;
		} catch {
			return null;
		}
	}

	async function aceitarIa(kind: ContentUnitKind, dados: Record<string, unknown>[]) {
		const r = await aceitarPropostasIa({ kind, propostas: dados, activityId: data.activity.id });
		resultadoIa = r;
		if (r.ok) await invalidateAll();
		return r.ok;
	}
	const enviar = $derived(
		acao.enhance(async ({ submit }) => {
			const alvo = acao;
			salvando = true;
			try {
				await submit();
				if (alvo.result?.ok) formulario?.limpar();
			} finally {
				salvando = false;
			}
		})
	);

	function editar(m: MaterialRow) {
		formulario?.editar(m);
		formAberto = true;
	}

	// ── a biblioteca ────────────────────────────────────────────────────────
	// O que está na biblioteca e ainda não está aqui. Serve ao painel de trazer
	// E ao aviso de repetido do formulário: o servidor reaproveita o que o
	// professor já tem, e a tela diz isso enquanto ele digita, não depois.
	const disponiveis = $derived(materiaisDisponiveis({ activityId: data.activity.id }));
	const conhecidos = $derived<MaterialRef[]>([
		...data.materials,
		...(disponiveis.current ?? []).map((m) => ({
			id: m.id,
			kind: m.kind,
			target: m.primary,
			source: m.secondary,
			note: m.note,
			example: m.example
		}))
	]);

	/**
	 * Trazer da biblioteca é uma ESCOLHA, não um clique por linha: o professor
	 * marca o que quer da aula passada, filtra por tipo ou por busca, e traz
	 * tudo de uma vez.
	 */
	let mostrarBiblioteca = $state(false);
	let escolhidos = $state<string[]>([]);
	let buscaBiblioteca = $state('');
	let filtroBiblioteca = $state<MaterialKind | 'todos'>('todos');
	/**
	 * O filtro de idioma nasce no idioma DA ATIVIDADE: trazer uma frase de
	 * espanhol para uma atividade de inglês é quase sempre engano — mas não é
	 * proibido, e o professor tira o filtro se quiser.
	 */
	let filtroIdiomaBib = $state('');
	let trazendo = $state(false);
	let removendoId = $state<string | null>(null);

	function alternarEscolha(contentId: string) {
		escolhidos = escolhidos.includes(contentId)
			? escolhidos.filter((id) => id !== contentId)
			: [...escolhidos, contentId];
	}

	function filtrar<
		T extends { kind: MaterialKind; primary: string; secondary: string; idioma: string | null }
	>(lista: T[]) {
		const termo = buscaBiblioteca.trim().toLowerCase();
		return lista.filter(
			(m) =>
				(filtroBiblioteca === 'todos' || m.kind === filtroBiblioteca) &&
				casaComFiltro(m.idioma, filtroIdiomaBib) &&
				(termo === '' ||
					m.primary.toLowerCase().includes(termo) ||
					m.secondary.toLowerCase().includes(termo))
		);
	}

	async function trazerDaBiblioteca() {
		if (escolhidos.length === 0) return;
		trazendo = true;
		try {
			await usarDaBiblioteca({ activityId: data.activity.id, contentIds: escolhidos });
			escolhidos = [];
			await disponiveis.refresh();
			await invalidateAll();
		} finally {
			trazendo = false;
		}
	}

	function abrirBiblioteca() {
		mostrarBiblioteca = true;
		escolhidos = [];
		buscaBiblioteca = '';
		filtroBiblioteca = 'todos';
		filtroIdiomaBib = (disponiveis.current ?? []).some((m) => m.idioma === data.activity.tag)
			? data.activity.tag
			: '';
		formAberto = false;
	}

	async function remover(m: MaterialRow) {
		removendoId = m.id;
		try {
			await removerMaterial({ activityId: data.activity.id, contentId: m.id });
			if (editando?.id === m.id) formulario?.limpar();
			await disponiveis.refresh();
			await invalidateAll();
		} finally {
			removendoId = null;
		}
	}

	// ── gerar ───────────────────────────────────────────────────────────────
	let gerando = $state(false);
	async function onGerarItens() {
		gerando = true;
		try {
			await gerarItens({ activityId: data.activity.id });
			await goto(resolve('/(studio)/atividades/[id]/revisar', { id: data.activity.id }));
		} finally {
			gerando = false;
		}
	}

	const total = $derived(data.materials.length);
	const daBiblioteca = $derived(data.materials.filter((m) => m.daBiblioteca).length);
	// O rodapé diz o que o conjunto JÁ rende — é a mesma conta do bloco de
	// rendimento do formulário, sem escuta e fala, que dependem do provedor.
	const rendimento = $derived(
		estimarRendimento(
			data.materials.map((m) => ({ kind: KIND_TO_KERNEL[m.kind], questions: m.questions.length }))
		)
	);
	const statusTexto = $derived(`${total} ${total === 1 ? 'material' : 'materiais'}`);
	const hintTexto = $derived(
		total === 0
			? 'Precisa de ao menos 1 material para avançar.'
			: rendimento.itens === 0
				? `${statusTexto} · ainda não dá para gerar nenhuma questão`
				: `${statusTexto} · dá para gerar ao menos ${rendimento.itens} ${rendimento.itens === 1 ? 'questão' : 'questões'}`
	);
</script>

<svelte:head><title>Materiais · {data.activity.title} · Spokke</title></svelte:head>

<WizardShell
	step={2}
	backHref={resolve('/(studio)/atividades/nova')}
	backLabel="Detalhes"
	status={statusTexto}
	hint={hintTexto}
	rolagem="colunas"
>
	<div class="flex min-h-0 flex-1 flex-col lg:flex-row">
		<!-- O formulário é coluna fixa no desktop; no celular cobre a lista até o
		     professor pedir para ver os materiais. `min-w-0` nas duas colunas: item
		     de flex nasce com `min-width: auto`, então uma frase longa esticava a
		     coluna e a página ganhava rolagem horizontal. A coluna tem a altura da
		     tela (`rolagem="colunas"`), e quem rola é o corpo do formulário: o
		     cabeçalho e o botão de adicionar ficam sempre à vista. -->
		<form
			{...enviar}
			class="min-h-0 min-w-0 flex-1 flex-col border-b border-line lg:flex lg:w-[500px] lg:flex-none lg:border-e lg:border-b-0 {formAberto
				? 'flex'
				: 'hidden'}"
		>
			<input type="hidden" name="activityId" value={data.activity.id} />
			{#if editando}<input type="hidden" name="contentId" value={editando.id} />{/if}
			<MaterialForm
				bind:this={formulario}
				bind:modo
				bind:editando
				contexto="wizard"
				conjunto={data.materials}
				biblioteca={conhecidos}
				contentTag={data.activity.tag}
				dir={data.activity.dir}
				targetLabel={data.activity.targetLabel}
				sourceLabel={data.activity.sourceLabel}
				resultado={modo === 'ia' ? resultadoIa : resultado}
				{salvando}
				ia={data.ia}
				ongerarIa={gerarIa}
				onaceitarIa={aceitarIa}
				traducaoAutomatica={data.traducaoAutomatica}
				linguaDoAluno={data.activity.sourceTag}
				onsugerirTraducao={sugerir}
				onfechar={() => (formAberto = false)}
				fecharRotulo="Ver os {statusTexto}"
				fecharSoNoCelular
			/>
		</form>

		<!-- A lista é a outra coluna que rola por dentro, com a faixa de formas no
		     FIM dela: com poucos materiais a faixa fica embaixo, no vazio; com
		     muitos, vem depois do último — o texto nunca passa por cima das formas. -->
		<div
			class="min-h-0 min-w-0 flex-1 flex-col overflow-y-auto lg:flex {formAberto
				? 'hidden'
				: 'flex'}"
		>
			<div class="flex-1 px-4 py-5 lg:px-7 lg:py-6">
				<div class="mb-4 flex flex-wrap items-end gap-x-4 gap-y-3">
					<div class="min-w-[180px] flex-1">
						<h2
							class="mb-1 font-display text-[22px] font-semibold tracking-[-0.024em] lg:text-[26px]"
						>
							Materiais desta atividade
						</h2>
						<p class="text-[13px] text-base-content/65">
							{statusTexto}{daBiblioteca > 0
								? ` · ${daBiblioteca} ${daBiblioteca === 1 ? 'vindo' : 'vindos'} da biblioteca`
								: ''}
						</p>
					</div>
					<div class="flex flex-wrap gap-2">
						<button
							type="button"
							onclick={() => (formAberto = true)}
							class="btn btn-sm motion-tap gap-2 btn-primary lg:hidden"
						>
							<svg class="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
								<path
									d="M12 5v14M5 12h14"
									stroke="currentColor"
									stroke-width="2.2"
									stroke-linecap="round"
								/>
							</svg>
							Adicionar
						</button>
						{#if !mostrarBiblioteca}
							<button
								type="button"
								onclick={abrirBiblioteca}
								class="btn btn-sm motion-tap gap-2 btn-outline"
							>
								<svg
									class="size-[15px] shrink-0"
									viewBox="0 0 24 24"
									fill="none"
									aria-hidden="true"
								>
									<path
										d="M3 5.5h6a3 3 0 013 3v10a2.5 2.5 0 00-2.5-2.5H3zM21 5.5h-6a3 3 0 00-3 3v10a2.5 2.5 0 012.5-2.5H21z"
										stroke="currentColor"
										stroke-width="2"
										stroke-linejoin="round"
									/>
								</svg>
								Usar da biblioteca
							</button>
						{/if}
					</div>
				</div>

				<!-- A biblioteca é do professor, não da atividade: trazer daqui LIGA o
			     material às duas, não copia (paginas.md "Materiais"). -->
				{#if mostrarBiblioteca}
					<section class="mb-4 min-w-0 rounded-box border border-line bg-base-200 p-4">
						<div class="mb-3 flex items-baseline gap-3">
							<h3 class="font-display text-[20px] font-semibold">Da sua biblioteca</h3>
							<div class="flex-1"></div>
							<button
								type="button"
								onclick={() => (mostrarBiblioteca = false)}
								class="p-1 text-[12.5px] font-semibold text-base-content/65 hover:text-base-content"
								>Fechar</button
							>
						</div>

						{#await disponiveis}
							<div class="h-[3.25rem] skeleton"></div>
						{:then lista}
							{#if lista.length === 0}
								<p class="text-[13px] leading-snug text-base-content/65">
									Tudo que você já cadastrou já está nesta atividade.
								</p>
							{:else}
								{@const visiveis = filtrar(lista)}
								<!-- Busca e filtro por tipo: a biblioteca cresce a cada atividade,
							     e rolar uma lista de 200 frases para achar as três da aula
							     passada não é escolher, é procurar. -->
								<div class="mb-3 flex flex-wrap items-center gap-2">
									<input
										bind:value={buscaBiblioteca}
										placeholder="Buscar…"
										class="input h-auto min-w-[9rem] flex-1 py-2 text-[13.5px]"
										aria-label="Buscar na biblioteca"
									/>
									<div class="flex flex-wrap gap-1.5">
										{#each [{ id: 'todos' as const, label: 'Todos' }, ...TIPOS] as f (f.id)}
											<button
												type="button"
												onclick={() => (filtroBiblioteca = f.id)}
												aria-pressed={filtroBiblioteca === f.id}
												class="rounded-full px-3 py-1.5 text-[12px] transition-colors
											       {filtroBiblioteca === f.id
													? 'border-[1.5px] border-primary bg-base-300 font-bold text-primary'
													: 'border border-line bg-base-100 font-semibold text-base-content/65'}"
												>{f.label}</button
											>
										{/each}
									</div>
									<FiltroIdioma
										tags={lista.map((m) => m.idioma)}
										bind:valor={filtroIdiomaBib}
										formato="chips"
									/>
								</div>

								{#if visiveis.length === 0}
									<p class="text-[13px] leading-snug text-base-content/65">
										Nada aqui com esse filtro.
									</p>
								{:else}
									<!-- `max-h` em proporção da viewport: a lista rola dentro do
								     painel em vez de empurrar o resto da tela para baixo. -->
									<ul class="grid max-h-[45vh] list-none gap-2 overflow-y-auto p-0">
										{#each visiveis as m (m.id)}
											{@const marcado = escolhidos.includes(m.id)}
											{@const tipo = tipoDe(m.kind)}
											<li>
												<!-- A linha INTEIRA alterna a escolha: um alvo de 2px no fim
											     da linha é o pior jeito de marcar quinze itens. -->
												<button
													type="button"
													onclick={() => alternarEscolha(m.id)}
													aria-pressed={marcado}
													class="flex w-full min-w-0 items-center gap-3 rounded-field border px-3.5 py-2.5 text-start
												       transition-[border-color,background-color]
												       {marcado ? 'border-primary bg-base-300' : 'border-line bg-base-100 hover:border-primary'}"
												>
													<span
														class="grid size-[18px] shrink-0 place-items-center rounded-[5px] border-[1.5px]
													       {marcado ? 'border-primary bg-primary text-primary-content' : 'border-line'}"
													>
														{#if marcado}
															<svg
																class="size-[11px]"
																viewBox="0 0 24 24"
																fill="none"
																aria-hidden="true"
															>
																<path
																	d="M4 12.5l5 5L20 6.5"
																	stroke="currentColor"
																	stroke-width="3"
																	stroke-linecap="round"
																	stroke-linejoin="round"
																/>
															</svg>
														{/if}
													</span>
													<span
														class="shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-bold whitespace-nowrap {PILL_TONE[
															tipo.tone
														]}">{tipo.label}</span
													>
													<span class="min-w-0 flex-1">
														<span
															class="block truncate font-content text-[14px]"
															dir={data.activity.dir}
															data-content-lang={m.idioma ?? data.activity.tag}>{m.primary}</span
														>
														<span class="block truncate text-[12px] text-base-content/65"
															>{m.secondary}</span
														>
													</span>
													<IdiomaTag tag={m.idioma} compacta />
												</button>
											</li>
										{/each}
									</ul>

									<div class="mt-3 flex flex-wrap items-center gap-2.5">
										<button
											type="button"
											onclick={() =>
												(escolhidos =
													escolhidos.length === visiveis.length ? [] : visiveis.map((m) => m.id))}
											class="p-1 text-[12.5px] font-semibold text-base-content/65 hover:text-base-content"
											>{escolhidos.length === visiveis.length
												? 'Limpar seleção'
												: `Selecionar os ${visiveis.length}`}</button
										>
										<div class="flex-1"></div>
										<button
											type="button"
											onclick={trazerDaBiblioteca}
											disabled={escolhidos.length === 0 || trazendo}
											class="btn btn-sm motion-tap btn-primary"
										>
											{#if trazendo}
												<Loading variant="fila" size={11} tone="current" label="Trazendo" />
												Trazendo…
											{:else if escolhidos.length === 0}
												Trazer
											{:else}
												Trazer {escolhidos.length}
											{/if}
										</button>
									</div>
								{/if}
							{/if}
						{/await}
					</section>
				{/if}

				{#if total === 0}
					<div
						class="rounded-box border-[1.5px] border-dashed border-line bg-base-200 p-[26px] text-center"
					>
						<p class="mb-1.5 font-display text-[20px] font-semibold">Nenhum material ainda</p>
						<p class="text-[13px] leading-snug text-base-content/65">
							Cole uma lista de frases ao lado, ou traga algo que você já cadastrou.
						</p>
					</div>
				{:else}
					<MaterialList
						materiais={data.materials}
						contexto="wizard"
						contentTag={data.activity.tag}
						dir={data.activity.dir}
						editandoId={editando?.id ?? null}
						{removendoId}
						onedit={editar}
						onremove={remover}
					/>
					<p class="mt-3.5 text-[12.5px] leading-relaxed text-pretty text-base-content/65">
						Remover tira o material desta atividade. Ele continua na sua biblioteca e em outras
						atividades que o usem.
					</p>
				{/if}
			</div>
			<div class="pointer-events-none relative h-[150px] shrink-0 lg:h-[190px]">
				<AmbientShapes height="100%" edges="bottom" />
			</div>
		</div>
	</div>

	{#snippet actions()}
		<button
			type="button"
			onclick={() => (mostrarBiblioteca ? (mostrarBiblioteca = false) : abrirBiblioteca())}
			class="btn h-[46px] flex-1 motion-tap btn-neutral lg:flex-none"
		>
			<span class="lg:hidden">Biblioteca</span>
			<span class="hidden lg:inline">Usar da biblioteca</span>
		</button>
		<button
			type="button"
			onclick={onGerarItens}
			disabled={total === 0 || gerando}
			class="btn h-[46px] flex-1 motion-tap gap-2.5 btn-primary lg:flex-none lg:px-5"
		>
			{#if gerando}
				<Loading variant="fila" size={13} tone="current" label="Gerando" />
				Gerando…
			{:else}
				Gerar itens
				<svg class="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<path
						d="M5 12h13M13 6l6 6-6 6"
						stroke="currentColor"
						stroke-width="2.2"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
			{/if}
		</button>
	{/snippet}
</WizardShell>
