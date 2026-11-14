<script lang="ts">
	// Biblioteca. Apagar um material remove ele da biblioteca e dos rascunhos —
	// as versões PUBLICADAS guardam uma cópia congelada e continuam intactas
	// (regra inviolável 7, db.md "Versionamento imutável"). Arquivar tira da
	// biblioteca e do limite do plano sem mexer em atividade nenhuma.
	//
	// No desenho comum das listas do Studio (components.md "Listas do Studio"):
	// cabeçalho com "Novo material", busca e filtros, chips de situação, a barra
	// do que está marcado, a tabela e a paginação. A linha inteira abre a edição.
	//
	// O formulário é o MESMO da etapa 2 do wizard (`MaterialForm.svelte`), e
	// grava o mesmo `ContentUnit` (os dois passam por `montarMaterial`). Aqui
	// ele abre numa BANDEJA sobre a lista (`Bandeja.svelte`, a mesma de todo
	// formulário do Studio), que é onde o professor confere se o que acabou de
	// digitar já estava lá.
	import { onMount, tick } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import AmbientShapes from '$lib/components/AmbientShapes.svelte';
	import Bandeja from '$lib/components/Bandeja.svelte';
	import MaterialForm, {
		type Modo,
		type SugestaoDeTraducao
	} from '$lib/components/MaterialForm.svelte';
	import MaterialList from '$lib/components/MaterialList.svelte';
	import Pagination from '$lib/components/Pagination.svelte';
	import FiltroIdioma from '$lib/components/FiltroIdioma.svelte';
	import CabecalhoDaLista from '$lib/components/lista/CabecalhoDaLista.svelte';
	import FerramentasDaLista from '$lib/components/lista/FerramentasDaLista.svelte';
	import ChipsDaLista from '$lib/components/lista/ChipsDaLista.svelte';
	import BarraDeSelecao from '$lib/components/lista/BarraDeSelecao.svelte';
	import VazioDaLista from '$lib/components/lista/VazioDaLista.svelte';
	import ConfirmarAcao from '$lib/components/lista/ConfirmarAcao.svelte';
	import { BOTAO_NOVO, ICONE_MAIS, POR_PAGINA, SELECT_DA_LISTA } from '$lib/components/lista/lista';
	import { casaComFiltro, idiomaDe } from '$lib/idiomas';
	import { casaComBusca } from '$lib/busca';
	import { TIPOS, type MaterialKind, type MaterialRow } from '$lib/components/material-form';
	import { withMock } from '$lib/dev/with-mock';
	import {
		apagarMateriais,
		arquivarMateriais,
		atualizarMaterial,
		criarMaterial,
		criarMateriaisEmLote,
		desarquivarMateriais
	} from './materiais.remote';
	import { aceitarPropostasIa, gerarPropostasIa } from './ia.remote';
	import { gerarComArquivo } from '$lib/client/arquivo-ia';
	import { sugerirTraducao } from './traducao.remote';
	import type { ResultadoMaterial } from '$lib/components/MaterialForm.svelte';
	import type { EstadoDaIa, RespostaDaGeracao } from '$lib/billing/ia';
	import type { ContentUnitKind } from '$lib/kernel/content/types';

	interface PageData {
		materials: MaterialRow[];
		usedInCount: number;
		archivedCount: number;
		/** O idioma com que um material novo nasce — o que o professor mais usa. */
		idiomaPadrao: string | null;
		ia: EstadoDaIa;
		iaIdiomas: { alvo: string; origem: string };
		traducaoAutomatica: boolean;
	}

	const MOCK: PageData = {
		materials: [
			{
				id: 'mat_01',
				kind: 'pair',
				primary: 'She has been working here since 2019.',
				secondary: 'Ela trabalha aqui desde 2019.',
				idioma: 'en-US',
				usedIn: 2,
				target: 'She has been working here since 2019.',
				source: 'Ela trabalha aqui desde 2019.',
				raw: '',
				note: '',
				example: '',
				questions: [],
				lines: []
			}
		],
		usedInCount: 1,
		archivedCount: 0,
		idiomaPadrao: 'en-US',
		ia: {
			configurada: false,
			pode: false,
			motivo: 'ia',
			saldo: 0,
			custoPorProposta: 1,
			fontes: { imagem: false, video: false },
			idiomas: null
		},
		iaIdiomas: { alvo: 'en-US', origem: 'pt-BR' },
		traducaoAutomatica: false
	};

	let { data: dataProp }: { data?: Partial<PageData> } = $props();
	const data = $derived(withMock(dataProp, MOCK));

	// ── busca, filtros e ordem: de TELA ─────────────────────────────────────
	// A biblioteca inteira é do professor e já veio no loader. O arquivado é uma
	// situação à parte: "Todos" não o mistura, porque ele saiu da biblioteca.
	type Situacao = 'todos' | 'emUso' | 'semUso' | 'arquivados';
	type Ordem = 'recentes' | 'nome' | 'uso';
	let busca = $state('');
	let situacao = $state<Situacao>('todos');
	let filtroKind = $state<MaterialKind | ''>('');
	let filtroIdioma = $state('');
	let ordem = $state<Ordem>('recentes');
	let pagina = $state(1);

	const ativos = $derived(data.materials.filter((m) => !m.arquivado));
	const situacoes = $derived<{ id: Situacao; label: string; n: number }[]>([
		{ id: 'todos', label: 'Todos', n: ativos.length },
		{ id: 'emUso', label: 'Em atividades', n: data.usedInCount },
		{ id: 'semUso', label: 'Sem uso', n: ativos.length - data.usedInCount },
		{ id: 'arquivados', label: 'Arquivados', n: data.archivedCount }
	]);

	const visiveis = $derived(
		data.materials
			.filter((m) => {
				if (situacao === 'arquivados' ? !m.arquivado : m.arquivado) return false;
				if (situacao === 'emUso' && m.usedIn === 0) return false;
				if (situacao === 'semUso' && m.usedIn > 0) return false;
				if (filtroKind && m.kind !== filtroKind) return false;
				if (!casaComFiltro(m.idioma ?? null, filtroIdioma)) return false;
				return casaComBusca(m.primary, busca) || casaComBusca(m.secondary, busca);
			})
			.sort((x, y) =>
				ordem === 'nome'
					? x.primary.localeCompare(y.primary, 'pt-BR')
					: ordem === 'uso'
						? y.usedIn - x.usedIn
						: 0
			)
	);
	// A biblioteca cresce sozinha: tudo que o professor cola dentro de uma
	// atividade entra aqui. Sem paginar, uma tabela de duzentas linhas.
	const naPagina = $derived(visiveis.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA));

	const filtrando = $derived(
		!!busca.trim() || !!filtroKind || !!filtroIdioma || situacao !== 'todos'
	);
	function limparFiltros() {
		busca = '';
		filtroKind = '';
		filtroIdioma = '';
		situacao = 'todos';
	}

	// Filtrar ou buscar volta para a primeira página e desmarca: a ação em massa
	// vale para o que está na tela.
	let marcados = $state<string[]>([]);
	$effect(() => {
		void filtroKind;
		void filtroIdioma;
		void busca;
		void situacao;
		pagina = 1;
		marcados = [];
	});

	// ── o painel ────────────────────────────────────────────────────────────
	let painel = $state(false);
	let formulario = $state<MaterialForm | null>(null);
	let modo = $state<Modo>('um');
	let editando = $state<MaterialRow | null>(null);
	/** A tag de idioma escolhida no formulário — vale também para a IA. */
	let idioma = $state<string | null>(null);
	let salvando = $state(false);

	// O foco só pega depois de o painel deixar de ser `hidden`.
	async function abrirNovo() {
		painel = true;
		await tick();
		formulario?.novo();
	}
	async function abrirComIa() {
		await abrirNovo();
		modo = 'ia';
	}
	function editar(m: MaterialRow) {
		painel = true;
		formulario?.editar(m);
	}
	// O "Criar com IA" do início chega com `?novo=ia`: o painel abre já no modo
	// da IA, em vez de deixar o professor procurar a aba depois de chegar.
	onMount(async () => {
		if (page.url.searchParams.get('novo') === 'ia') await abrirComIa();
	});
	function fechar() {
		painel = false;
		formulario?.limpar();
	}

	// Uma remote function por modo, e o painel fecha sozinho no sucesso: deixá-lo
	// aberto fazia o professor achar que não tinha salvo e clicar de novo. O lote
	// é a exceção — ele fica, mostrando quantas linhas entraram, porque colar a
	// lista seguinte é o gesto natural.
	const acao = $derived(
		editando ? atualizarMaterial : modo === 'lista' ? criarMateriaisEmLote : criarMaterial
	);
	const resultado = $derived(acao.result);
	const enviar = $derived(
		acao.enhance(async ({ submit }) => {
			const alvo = acao;
			salvando = true;
			try {
				await submit();
				// O erro e a contagem do lote ficam no fim do corpo da bandeja, que rola:
				// o formulário os traz para a vista.
				if (!alvo.result?.ok) {
					void formulario?.mostrarResultado();
					return;
				}
				if (alvo === criarMateriaisEmLote) {
					formulario?.limpar();
					void formulario?.mostrarResultado();
				} else fechar();
				await invalidateAll();
			} finally {
				salvando = false;
			}
		})
	);

	// ── gerar com IA ── A página fala com o servidor; o componente só desenha
	// (components.md "Convenções"). O `requestId` sai daqui: é ele que torna o
	// débito idempotente — um clique duplo não paga duas vezes.
	let resultadoIa = $state<ResultadoMaterial | undefined>(undefined);

	async function gerarIa(pedido: {
		kind: ContentUnitKind;
		texto: string;
		quantos: 5 | 10 | 20;
		arquivo?: { fonte: 'imagem' | 'video'; blob: Blob };
	}): Promise<RespostaDaGeracao> {
		// Com arquivo (a foto, ou a fala do trecho do vídeo), o pedido vai pelo endpoint que
		// recebe binário, com os mesmos idiomas da remote function.
		if (pedido.arquivo) {
			return gerarComArquivo({
				requestId: crypto.randomUUID(),
				kind: pedido.kind,
				fonte: pedido.arquivo.fonte,
				quantos: pedido.quantos,
				pedido: pedido.texto,
				arquivo: pedido.arquivo.blob,
				sourceLang: data.iaIdiomas.origem,
				targetLang: idioma || data.iaIdiomas.alvo
			});
		}
		const r = await gerarPropostasIa({
			requestId: crypto.randomUUID(),
			kind: pedido.kind,
			pedido: pedido.texto,
			quantos: pedido.quantos,
			sourceLang: data.iaIdiomas.origem,
			// A IA escreve no idioma escolhido no formulário (a tag do material).
			targetLang: idioma || data.iaIdiomas.alvo
		});
		return r.ok ? { ok: true, propostas: r.propostas, saldo: r.saldo } : r;
	}

	// A sugestão de tradução enquanto o professor digita — do idioma do material
	// para a língua do aluno. Falhar é normal: o servidor traduz ao salvar.
	async function sugerir(
		texto: string,
		de: string,
		para: string
	): Promise<SugestaoDeTraducao | null> {
		try {
			const r = await sugerirTraducao({ texto, de, para });
			return r.ok ? { traducao: r.traducao, alternativas: r.alternativas } : null;
		} catch {
			return null;
		}
	}

	async function aceitarIa(kind: ContentUnitKind, dados: Record<string, unknown>[]) {
		const r = await aceitarPropostasIa({
			kind,
			propostas: dados,
			idioma: idioma || data.iaIdiomas.alvo
		});
		resultadoIa = r;
		if (r.ok) await invalidateAll();
		return r.ok;
	}

	// ── arquivar, desarquivar, apagar ───────────────────────────────────────
	type AcaoDaLista = 'arquivar' | 'apagar';
	let confirmando = $state<{ acao: AcaoDaLista; ids: string[] } | null>(null);
	let dialogoAberto = $state(false);
	let ocupado = $state<string | null>(null);
	let erro = $state<string | null>(null);
	let aviso = $state<string | null>(null);
	const alvo = $derived(
		confirmando ? data.materials.filter((m) => confirmando?.ids.includes(m.id)) : []
	);
	const emUsoNoAlvo = $derived(alvo.filter((m) => m.usedIn > 0).length);

	function palavra(n: number, um: string, varios: string) {
		return `${n} ${n === 1 ? um : varios}`;
	}

	function pedir(acaoDaLista: AcaoDaLista, ids: string[]) {
		erro = null;
		aviso = null;
		confirmando = { acao: acaoDaLista, ids };
		dialogoAberto = true;
	}

	async function confirmar() {
		if (!confirmando) return;
		const { acao: qual, ids } = confirmando;
		ocupado = ids.length === 1 ? ids[0] : 'varios';
		erro = null;
		try {
			if (qual === 'arquivar') {
				const r = await arquivarMateriais({ contentIds: ids });
				aviso = `${palavra(r.arquivados, 'material arquivado', 'materiais arquivados')}. Estão em "Arquivados".`;
			} else {
				const r = await apagarMateriais({ contentIds: ids });
				aviso = `${palavra(r.removidos, 'material apagado', 'materiais apagados')}.`;
			}
			if (editando && ids.includes(editando.id)) fechar();
			marcados = marcados.filter((id) => !ids.includes(id));
			dialogoAberto = false;
			await invalidateAll();
		} catch {
			erro = 'Não deu para concluir agora. Tente de novo em instantes.';
		} finally {
			ocupado = null;
		}
	}

	/** Desarquivar não pede confirmação: nada se perde, e a vaga é conferida no servidor. */
	async function desarquivar(ids: string[]) {
		ocupado = ids.length === 1 ? ids[0] : 'varios';
		erro = null;
		aviso = null;
		try {
			const r = await desarquivarMateriais({ contentIds: ids });
			if (!r.ok) {
				erro = r.error;
				return;
			}
			aviso = `${palavra(r.quantos, 'material voltou', 'materiais voltaram')} para a biblioteca.`;
			marcados = marcados.filter((id) => !ids.includes(id));
			await invalidateAll();
		} catch {
			erro = 'Não deu para concluir agora. Tente de novo em instantes.';
		} finally {
			ocupado = null;
		}
	}

	const ICONE = {
		editar: 'M5 19h3l10-10-3-3L5 16z',
		arquivar: 'M4 7.5h16v3H4zM5.5 10.5v8h13v-8M10 14h4',
		desarquivar: 'M4 7.5h16v3H4zM5.5 10.5v8h13v-8M12 18v-5M9.5 15.5L12 13l2.5 2.5',
		apagar: 'M6 7h12M9.5 7V5h5v2M8 7l.8 12h6.4L16 7'
	};
	const acoesDaLinha = (m: MaterialRow) => [
		{ rotulo: 'Editar', icone: ICONE.editar, onclick: () => editar(m) },
		m.arquivado
			? { rotulo: 'Desarquivar', icone: ICONE.desarquivar, onclick: () => desarquivar([m.id]) }
			: { rotulo: 'Arquivar', icone: ICONE.arquivar, onclick: () => pedir('arquivar', [m.id]) },
		{ rotulo: 'Apagar', icone: ICONE.apagar, perigo: true, onclick: () => pedir('apagar', [m.id]) }
	];
</script>

<svelte:head><title>Materiais · Spokke</title></svelte:head>

{#if data.materials.length === 0}
	<!-- A biblioteca vazia é um hero, como a lista vazia de atividades e a de
	     turmas: o ganho numa frase e os caminhos para começar. -->
	<div class="relative flex min-h-[70vh] items-center overflow-hidden px-4 py-12 lg:px-7 lg:py-14">
		<AmbientShapes height="230px" />
		<div class="relative z-1 max-w-[52ch] animate-entrada">
			<p class="mb-4 text-xs font-bold tracking-[0.13em] text-primary uppercase">Materiais</p>
			<h1
				class="mb-3.5 font-display text-[30px] leading-[1.1] font-semibold tracking-[-0.025em] text-pretty lg:text-4xl"
			>
				Cadastre a frase uma vez e use em quantas atividades quiser.
			</h1>
			<p class="mb-[26px] text-[15.5px] leading-relaxed text-pretty text-base-content/65">
				Tudo que você cola dentro de uma atividade também entra aqui. Na próxima, é só trazer da
				biblioteca em vez de digitar de novo.
			</p>
			<div class="flex flex-wrap gap-3">
				<button
					type="button"
					onclick={abrirNovo}
					class="btn btn-lg min-h-[50px] motion-tap btn-primary text-base font-bold"
				>
					Cadastrar o primeiro material
				</button>
				{#if data.ia.configurada}
					<button
						type="button"
						onclick={abrirComIa}
						class="btn btn-lg min-h-[50px] motion-tap btn-outline text-base font-bold"
					>
						Gerar com IA
					</button>
				{/if}
			</div>
		</div>
	</div>
{:else}
	<div class="pagina-studio">
		<CabecalhoDaLista titulo="Materiais">
			{palavra(ativos.length, 'material', 'materiais')} · {data.usedInCount} em atividades
			{#snippet acao()}
				<button type="button" onclick={abrirNovo} class={BOTAO_NOVO}>
					<svg class="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
						<path d={ICONE_MAIS} stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
					</svg>
					Novo material
				</button>
			{/snippet}
		</CabecalhoDaLista>

		<FerramentasDaLista bind:busca rotulo="Buscar no conteúdo">
			<label class="sr-only" for="filtro-tipo">Filtrar por tipo</label>
			<select id="filtro-tipo" bind:value={filtroKind} class={SELECT_DA_LISTA}>
				<option value="">Todos os tipos</option>
				{#each TIPOS as t (t.id)}
					<option value={t.id}>{t.label}</option>
				{/each}
			</select>
			<FiltroIdioma tags={data.materials.map((m) => m.idioma)} bind:valor={filtroIdioma} />
			<label class="sr-only" for="ordem-materiais">Ordenar materiais</label>
			<select id="ordem-materiais" bind:value={ordem} class={SELECT_DA_LISTA}>
				<option value="recentes">Mais recentes</option>
				<option value="nome">A–Z</option>
				<option value="uso">Mais usados</option>
			</select>
		</FerramentasDaLista>

		<ChipsDaLista opcoes={situacoes} bind:valor={situacao} rotulo="Filtrar materiais" />

		{#if aviso}
			<p class="mb-3 text-[13.5px] font-semibold text-base-content/75" role="status">{aviso}</p>
		{/if}
		{#if erro && !dialogoAberto}
			<p class="mb-3 text-[13.5px] font-semibold text-error" role="alert">{erro}</p>
		{/if}

		{#if marcados.length > 0}
			<BarraDeSelecao
				quantos={marcados.length}
				singular="material marcado"
				plural="materiais marcados"
				onlimpar={() => (marcados = [])}
			>
				{#if situacao === 'arquivados'}
					<button
						type="button"
						onclick={() => desarquivar(marcados)}
						disabled={ocupado !== null}
						class="btn btn-sm motion-tap btn-plain font-semibold"
					>
						Desarquivar
					</button>
				{:else}
					<button
						type="button"
						onclick={() => pedir('arquivar', marcados)}
						disabled={ocupado !== null}
						class="btn btn-sm motion-tap btn-plain font-semibold"
					>
						Arquivar
					</button>
				{/if}
				<button
					type="button"
					onclick={() => pedir('apagar', marcados)}
					disabled={ocupado !== null}
					class="btn btn-sm motion-tap btn-outline-error font-semibold"
				>
					Apagar
				</button>
			</BarraDeSelecao>
		{/if}

		{#if visiveis.length === 0}
			<VazioDaLista
				texto={situacao === 'arquivados' && !busca.trim()
					? 'Nenhum material arquivado.'
					: busca.trim()
						? `Nenhum material com “${busca.trim()}”.`
						: 'Nenhum material com esse filtro.'}
				onlimpar={filtrando ? limparFiltros : undefined}
			/>
		{:else}
			<MaterialList
				materiais={naPagina}
				contexto="biblioteca"
				editandoId={painel ? (editando?.id ?? null) : null}
				removendoId={ocupado}
				onedit={editar}
				onremove={(m) => pedir('apagar', [m.id])}
				bind:marcados
				acoes={acoesDaLinha}
			/>
			<Pagination bind:pagina porPagina={POR_PAGINA} total={visiveis.length} rotulo="materiais" />
		{/if}
	</div>
{/if}

<ConfirmarAcao
	bind:aberto={dialogoAberto}
	titulo={confirmando?.acao === 'apagar'
		? `Apagar ${palavra(alvo.length, 'material', 'materiais')}?`
		: `Arquivar ${palavra(alvo.length, 'material', 'materiais')}?`}
	rotuloDoBotao={confirmando?.acao === 'apagar' ? 'Apagar' : 'Arquivar'}
	perigo={confirmando?.acao === 'apagar'}
	ocupado={ocupado !== null}
	{erro}
	onconfirmar={confirmar}
>
	{#if confirmando?.acao === 'apagar'}
		<p class="mb-3">
			Sai da sua biblioteca e dos rascunhos{emUsoNoAlvo > 0
				? ` (${palavra(emUsoNoAlvo, 'está em atividade', 'estão em atividades')})`
				: ''}. As atividades que já estão no ar continuam intactas: elas guardam uma cópia
			congelada.
		</p>
	{:else}
		<p class="mb-3">
			Sai da biblioteca e do limite do seu plano. As atividades que já usam continuam usando, e dá
			para desarquivar depois, se couber no plano.
		</p>
	{/if}
	<ul class="grid list-none gap-1 p-0 text-[13px] text-base-content">
		{#each alvo.slice(0, 5) as m (m.id)}
			<li class="truncate font-content">· {m.primary}</li>
		{/each}
		{#if alvo.length > 5}
			<li class="text-base-content/65">e mais {alvo.length - 5}</li>
		{/if}
	</ul>
</ConfirmarAcao>

<!-- A bandeja sobre a lista: cadastrar não tira o professor de onde ele confere.
     Ela fica MONTADA mesmo fechada (`manterMontada`) para o `bind:this` do
     formulário existir antes do primeiro clique em "Novo material"; fechada, é
     `invisible` + `inert`. O `MaterialForm` desenha o próprio cabeçalho e
     rodapé (`moldura={false}`), porque é o mesmo da etapa 2 do wizard. -->
<Bandeja
	aberta={painel}
	onfechar={fechar}
	rotulo={editando ? 'Editar material' : 'Novo material'}
	moldura={false}
	manterMontada
>
	<form {...enviar} class="contents">
		{#if editando}<input type="hidden" name="contentId" value={editando.id} />{/if}
		<MaterialForm
			bind:this={formulario}
			bind:modo
			bind:editando
			contexto="biblioteca"
			conjunto={ativos}
			resultado={modo === 'ia' ? resultadoIa : resultado}
			{salvando}
			onfechar={fechar}
			ia={data.ia}
			ongerarIa={gerarIa}
			onaceitarIa={aceitarIa}
			traducaoAutomatica={data.traducaoAutomatica}
			linguaDoAluno={data.iaIdiomas.origem}
			sourceLabel={idiomaDe(data.iaIdiomas.origem)?.rotulo}
			onsugerirTraducao={sugerir}
			bind:idioma
			idiomaPadrao={data.idiomaPadrao}
		/>
	</form>
</Bandeja>
