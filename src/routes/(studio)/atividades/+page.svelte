<script lang="ts">
	// Lista de atividades. Com zero atividades, esta rota renderiza o ONBOARDING —
	// é a primeira impressão do Studio, não uma lista vazia (paginas.md "Mapa").
	//
	// No desenho comum das listas do Studio (components.md "Listas do Studio"):
	// cabeçalho com "Nova atividade", busca e filtros, chips de situação, a barra
	// do que está marcado, a tabela (cartões no celular) e a paginação. Marcar
	// linhas arquiva, desarquiva ou apaga várias de uma vez; o "⋯" de cada linha
	// faz o mesmo com uma.
	import { resolve } from '$app/paths';
	import { invalidateAll } from '$app/navigation';
	import AmbientShapes from '$lib/components/AmbientShapes.svelte';
	import Pagination from '$lib/components/Pagination.svelte';
	import ScoreBar from '$lib/components/ScoreBar.svelte';
	import { withMock } from '$lib/dev/with-mock';
	import { NIVEIS, rotuloDoNivel, type NivelId } from '$lib/atividades/nivel';
	import { skillLabels } from '$lib/kernel/interactions/skill-schema';
	import type { Skill } from '$lib/kernel/interactions/types';
	import IdiomaTag from '$lib/components/IdiomaTag.svelte';
	import FiltroIdioma from '$lib/components/FiltroIdioma.svelte';
	import { casaComFiltro } from '$lib/idiomas';
	import { casaComBusca } from '$lib/busca';
	import CabecalhoDaLista from '$lib/components/lista/CabecalhoDaLista.svelte';
	import FerramentasDaLista from '$lib/components/lista/FerramentasDaLista.svelte';
	import ChipsDaLista from '$lib/components/lista/ChipsDaLista.svelte';
	import BarraDeSelecao from '$lib/components/lista/BarraDeSelecao.svelte';
	import MenuDeAcoes from '$lib/components/lista/MenuDeAcoes.svelte';
	import VazioDaLista from '$lib/components/lista/VazioDaLista.svelte';
	import ConfirmarAcao from '$lib/components/lista/ConfirmarAcao.svelte';
	import {
		BOTAO_NOVO,
		CABECALHO_DA_TABELA,
		CARTAO_DA_LISTA,
		ICONE_MAIS,
		LINHA_DA_TABELA,
		LINK_DA_LINHA,
		POR_CIMA_DO_LINK,
		POR_PAGINA,
		SELECT_DA_LISTA,
		TABELA,
		alternar,
		alternarPagina,
		estadoDaPagina,
		indeterminado
	} from '$lib/components/lista/lista';
	import { apagarAtividades, arquivarAtividades, desarquivarAtividades } from './atividades.remote';

	interface Score {
		correct: number;
		partial: number;
		incorrect: number;
	}
	interface ActivityRow {
		id: string;
		title: string;
		itemCount: number;
		/** As chaves do kernel; o nome na tela sai de `skillLabels`. */
		skills: Skill[];
		language: string;
		idioma: string | null;
		noAr: boolean;
		arquivada: boolean;
		level: NivelId | null;
		modulos: { id: string; name: string }[];
		attempts: number | null;
		invited: number | null;
		score: Score;
	}
	interface Resume {
		id: string;
		title: string;
		materiais: number;
		itens: number;
		editadoEm: string;
		etapa: number;
		etapaLabel: string;
	}
	interface PageData {
		teacher: { firstName: string };
		activities: ActivityRow[];
		totalCount: number;
		activeCount: number;
		archivedCount: number;
		publishedCount: number;
		draftCount: number;
		resume: Resume | null;
		// Vem do layout do Studio (barra lateral e badge), não deste loader.
		aCorrigir: number;
		mes: { nome: string; tentativas: number; acertoMedio: number; respostas: number };
	}

	const MOCK: PageData = {
		teacher: { firstName: 'Ana' },
		activities: [
			{
				id: 'atv_01',
				title: 'Present perfect · turma B',
				itemCount: 8,
				skills: ['listening', 'reading', 'writing'],
				language: 'Inglês',
				idioma: 'en-US',
				noAr: true,
				arquivada: false,
				level: null,
				modulos: [],
				attempts: 18,
				invited: 24,
				score: { correct: 12, partial: 4, incorrect: 2 }
			}
		] as ActivityRow[],
		totalCount: 1,
		activeCount: 1,
		archivedCount: 0,
		publishedCount: 1,
		draftCount: 0,
		resume: null,
		aCorrigir: 0,
		mes: { nome: 'Setembro', tentativas: 49, acertoMedio: 74, respostas: 140 }
	};

	let { data: dataProp }: { data?: Partial<PageData> } = $props();
	const data = $derived(withMock(dataProp, MOCK));

	// ── busca, filtros e ordem: de TELA ─────────────────────────────────────
	// A lista inteira chega no loader (é dado do próprio professor), então nada
	// aqui custa ida ao servidor. "Arquivadas" é uma situação à parte: "Todas"
	// não as mistura, porque elas estão fora do ar para quem não começou.
	type Situacao = 'todas' | 'publicadas' | 'rascunhos' | 'arquivadas';
	type Ordem = 'recentes' | 'nome' | 'tentativas';
	let busca = $state('');
	let situacao = $state<Situacao>('todas');
	let filtroNivel = $state<NivelId | ''>('');
	let filtroModulo = $state('');
	let filtroIdioma = $state('');
	let ordem = $state<Ordem>('recentes');
	let pagina = $state(1);

	const modulosNaLista = $derived(
		[...new Map(data.activities.flatMap((a) => a.modulos).map((m) => [m.id, m])).values()].sort(
			(x, y) => x.name.localeCompare(y.name, 'pt-BR')
		)
	);

	const situacoes = $derived<{ id: Situacao; label: string; n: number }[]>([
		{ id: 'todas', label: 'Todas', n: data.activeCount },
		{ id: 'publicadas', label: 'No ar', n: data.publishedCount },
		{ id: 'rascunhos', label: 'Rascunhos', n: data.draftCount },
		{ id: 'arquivadas', label: 'Arquivadas', n: data.archivedCount }
	]);

	const visiveis = $derived(
		data.activities
			.filter(
				(a) =>
					(situacao === 'arquivadas'
						? a.arquivada
						: !a.arquivada &&
							(situacao === 'todas' ? true : situacao === 'publicadas' ? a.noAr : !a.noAr)) &&
					(!filtroNivel || a.level === filtroNivel) &&
					(!filtroModulo || a.modulos.some((m) => m.id === filtroModulo)) &&
					casaComFiltro(a.idioma, filtroIdioma) &&
					casaComBusca(a.title, busca)
			)
			.sort((x, y) =>
				ordem === 'nome'
					? x.title.localeCompare(y.title, 'pt-BR')
					: ordem === 'tentativas'
						? (y.attempts ?? -1) - (x.attempts ?? -1)
						: 0
			)
	);
	const naPagina = $derived(visiveis.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA));

	const filtrando = $derived(
		!!busca.trim() || !!filtroNivel || !!filtroModulo || !!filtroIdioma || situacao !== 'todas'
	);
	function limparFiltros() {
		busca = '';
		filtroNivel = '';
		filtroModulo = '';
		filtroIdioma = '';
		situacao = 'todas';
	}

	// ── a seleção ───────────────────────────────────────────────────────────
	// Filtrar, buscar ou trocar de situação volta para a página 1 E desmarca: a
	// ação em massa vale para o que está na tela, e uma linha que sumiu no filtro
	// não pode ser arquivada sem o professor vê-la.
	let marcados = $state<string[]>([]);
	$effect(() => {
		void busca;
		void situacao;
		void filtroNivel;
		void filtroModulo;
		void filtroIdioma;
		pagina = 1;
		marcados = [];
	});
	const idsDaPagina = $derived(naPagina.map((a) => a.id));
	const daPagina = $derived(estadoDaPagina(marcados, idsDaPagina));

	// ── arquivar, desarquivar, apagar ───────────────────────────────────────
	type Acao = 'arquivar' | 'apagar';
	let confirmando = $state<{ acao: Acao; ids: string[] } | null>(null);
	let dialogoAberto = $state(false);
	let ocupado = $state<string | null>(null);
	let erro = $state<string | null>(null);
	let aviso = $state<string | null>(null);
	const alvo = $derived(
		confirmando ? data.activities.filter((a) => confirmando?.ids.includes(a.id)) : []
	);
	const tentativasDoAlvo = $derived(alvo.reduce((n, a) => n + (a.attempts ?? 0), 0));

	function pedir(acao: Acao, ids: string[]) {
		erro = null;
		aviso = null;
		confirmando = { acao, ids };
		dialogoAberto = true;
	}

	function palavra(n: number, um: string, varios: string) {
		return `${n} ${n === 1 ? um : varios}`;
	}

	/** "8 questões · Escuta, Leitura" — a linha de baixo do título, nas duas formas da lista. */
	function resumoDasQuestoes(a: ActivityRow) {
		const quantas = palavra(a.itemCount, 'questão', 'questões');
		return a.skills.length
			? `${quantas} · ${a.skills.map((s) => skillLabels[s]).join(', ')}`
			: quantas;
	}

	async function confirmar() {
		if (!confirmando) return;
		const { acao, ids } = confirmando;
		ocupado = ids.length === 1 ? ids[0] : 'varias';
		erro = null;
		try {
			if (acao === 'arquivar') {
				const r = await arquivarAtividades({ activityIds: ids });
				aviso = `${palavra(r.quantas, 'atividade arquivada', 'atividades arquivadas')}. Estão em "Arquivadas".`;
			} else {
				const r = await apagarAtividades({ activityIds: ids, confirmacao: 'apagar' });
				if (!r.ok) {
					erro = r.error;
					return;
				}
				aviso = `${palavra(r.quantas, 'atividade apagada', 'atividades apagadas')}.`;
			}
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
		ocupado = ids.length === 1 ? ids[0] : 'varias';
		erro = null;
		aviso = null;
		try {
			const r = await desarquivarAtividades({ activityIds: ids });
			if (!r.ok) {
				erro = r.error;
				return;
			}
			aviso = `${palavra(r.quantas, 'atividade voltou', 'atividades voltaram')} para a lista.`;
			marcados = marcados.filter((id) => !ids.includes(id));
			await invalidateAll();
		} catch {
			erro = 'Não deu para concluir agora. Tente de novo em instantes.';
		} finally {
			ocupado = null;
		}
	}

	const ICONE = {
		arquivar: 'M4 7.5h16v3H4zM5.5 10.5v8h13v-8M10 14h4',
		desarquivar: 'M4 7.5h16v3H4zM5.5 10.5v8h13v-8M12 18v-5M9.5 15.5L12 13l2.5 2.5',
		apagar: 'M6 7h12M9.5 7V5h5v2M8 7l.8 12h6.4L16 7'
	};
</script>

<svelte:head><title>Atividades · Spokke</title></svelte:head>

{#snippet estado(a: ActivityRow, tamanho: 'linha' | 'cartao')}
	{@const base =
		tamanho === 'linha'
			? 'inline-block rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap'
			: 'shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold whitespace-nowrap'}
	{#if a.arquivada}
		<span class="{base} border border-dashed border-line text-base-content/65">arquivada</span>
	{:else if a.noAr}
		<span class="{base} bg-primary text-primary-content">No ar</span>
	{:else}
		<span class="{base} border border-line text-base-content/65">rascunho</span>
	{/if}
{/snippet}

{#snippet tentativas(a: ActivityRow)}
	{#if a.attempts !== null}
		<span class="font-mono text-[13px] whitespace-nowrap text-base-content">
			{a.attempts}{#if a.invited !== null}<span class="text-base-content/65">
					/ {a.invited}</span
				>{/if}
		</span>
	{:else}
		<span class="text-base-content/65">—</span>
	{/if}
{/snippet}

{#snippet menu(a: ActivityRow)}
	<MenuDeAcoes
		rotulo="Mais ações de {a.title}"
		ocupado={ocupado === a.id}
		acoes={[
			a.arquivada
				? { rotulo: 'Desarquivar', icone: ICONE.desarquivar, onclick: () => desarquivar([a.id]) }
				: { rotulo: 'Arquivar', icone: ICONE.arquivar, onclick: () => pedir('arquivar', [a.id]) },
			{
				rotulo: 'Apagar',
				icone: ICONE.apagar,
				perigo: true,
				onclick: () => pedir('apagar', [a.id])
			}
		]}
	/>
{/snippet}

{#if data.totalCount === 0}
	<div class="relative flex min-h-[70vh] items-center overflow-hidden px-4 py-12 lg:px-7 lg:py-14">
		<AmbientShapes height="230px" />
		<div class="relative z-1 max-w-[46ch] animate-entrada">
			<!-- "Boas-vindas", e não "Bem-vinda": a saudação vale para quem quer que
			     abra a conta, e o cadastro não pergunta como a pessoa quer ser tratada. -->
			<p class="mb-4 text-xs font-bold tracking-[0.13em] text-primary uppercase">
				Boas-vindas, {data.teacher.firstName}
			</p>
			<h1
				class="mb-3.5 font-display text-[30px] leading-[1.08] font-semibold tracking-[-0.025em] text-pretty lg:text-4xl"
			>
				Sua primeira atividade leva uns dez minutos.
			</h1>
			<p class="mb-[26px] text-[15.5px] leading-relaxed text-base-content/65">
				Cole uma lista de frases que você já usa em aula. O gerador propõe os exercícios, você
				revisa e publica. O link fica pronto para mandar no grupo da turma.
			</p>
			<!-- No celular os dois dividem a largura toda, como o "Nova atividade" da
			     lista; lado a lado, cada um do tamanho do próprio texto. -->
			<div class="grid gap-3 sm:flex sm:flex-wrap">
				<a
					href={resolve('/(studio)/atividades/nova')}
					class="btn btn-lg min-h-[50px] motion-tap btn-primary text-base font-bold no-underline"
				>
					Criar a primeira atividade
				</a>
				<!-- eslint-disable svelte/no-navigation-without-resolve -- rota de exemplo ainda não construída; a home usa o mesmo link (README da entrega). -->
				<a
					href="/exemplo"
					class="btn btn-lg min-h-[50px] motion-tap gap-2 btn-outline text-base font-bold no-underline"
				>
					<svg class="size-[17px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
						<path
							d="M8 5.5l10 6.5-10 6.5z"
							stroke="currentColor"
							stroke-width="2"
							stroke-linejoin="round"
						/>
					</svg>
					Ver uma pronta
				</a>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			</div>
		</div>
	</div>
{:else}
	<div class="pagina-studio">
		<CabecalhoDaLista titulo="Atividades">
			{palavra(data.totalCount, 'atividade', 'atividades')} · {data.publishedCount} no ar
			<span class="hidden lg:inline">· {data.mes.tentativas} tentativas neste mês</span>
			{#snippet acao()}
				<a href={resolve('/(studio)/atividades/nova')} class={BOTAO_NOVO}>
					<svg class="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
						<path d={ICONE_MAIS} stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
					</svg>
					Nova atividade
				</a>
			{/snippet}
		</CabecalhoDaLista>

		{#if data.resume}
			<!-- A tarefa começada vem ANTES da lista: é a retomada, não mais um
			     item qualquer. -->
			<a
				href={data.resume.etapa === 3
					? resolve('/(studio)/atividades/[id]/revisar', { id: data.resume.id })
					: resolve('/(studio)/atividades/[id]/materiais', { id: data.resume.id })}
				class="mb-[18px] flex flex-col gap-4 rounded-box bg-base-300 px-[22px] py-[22px] no-underline
				       lg:flex-row lg:items-center lg:gap-[26px] lg:px-[26px]"
			>
				<div class="min-w-0 flex-1">
					<p
						class="mb-1.5 flex items-center gap-2 text-[11px] font-bold tracking-[0.09em] text-primary uppercase"
					>
						<svg class="size-[15px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" />
							<path
								d="M12 7.5V12l3 2"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
							/>
						</svg>
						Você parou aqui
					</p>
					<p
						class="mb-1 font-display text-[21px] font-semibold tracking-[-0.02em] text-base-content"
					>
						{data.resume.title}
					</p>
					<p class="mb-3.5 text-[13.5px] text-base-content/65">
						{palavra(data.resume.materiais, 'material colado', 'materiais colados')}, {data.resume
							.itens === 0
							? 'questões ainda não geradas'
							: palavra(data.resume.itens, 'questão gerada', 'questões geradas')}. Editada {data
							.resume.editadoEm}.
					</p>
					<div class="flex items-center gap-3.5">
						<div class="h-[7px] w-full max-w-[300px] overflow-hidden rounded-full bg-base-100">
							<div
								class="h-full rounded-full bg-primary"
								style="width: {(data.resume.etapa / 4) * 100}%"
							></div>
						</div>
						<span class="shrink-0 text-[12.5px] text-base-content/65">
							Etapa {data.resume.etapa} de 4 · {data.resume.etapaLabel}
						</span>
					</div>
				</div>
				<span
					class="btn min-h-[46px] shrink-0 motion-tap gap-2.5 btn-primary font-bold whitespace-nowrap"
				>
					Continuar de onde parei
					<svg class="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
						<path
							d="M5 12h13M13 6l6 6-6 6"
							stroke="currentColor"
							stroke-width="2.2"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
				</span>
			</a>
		{/if}

		<FerramentasDaLista bind:busca rotulo="Buscar atividade">
			<label class="sr-only" for="filtro-nivel">Filtrar por nível</label>
			<select id="filtro-nivel" bind:value={filtroNivel} class={SELECT_DA_LISTA}>
				<option value="">Todos os níveis</option>
				{#each NIVEIS as n (n.id)}
					<option value={n.id}>{rotuloDoNivel(n.id)}</option>
				{/each}
			</select>
			<FiltroIdioma tags={data.activities.map((a) => a.idioma)} bind:valor={filtroIdioma} />
			{#if modulosNaLista.length > 0}
				<label class="sr-only" for="filtro-modulo">Filtrar por módulo</label>
				<select id="filtro-modulo" bind:value={filtroModulo} class={SELECT_DA_LISTA}>
					<option value="">Todos os módulos</option>
					{#each modulosNaLista as m (m.id)}
						<option value={m.id}>{m.name}</option>
					{/each}
				</select>
			{/if}
			<label class="sr-only" for="ordem-atividades">Ordenar atividades</label>
			<select id="ordem-atividades" bind:value={ordem} class={SELECT_DA_LISTA}>
				<option value="recentes">Mais recentes</option>
				<option value="nome">Nome (A–Z)</option>
				<option value="tentativas">Mais tentativas</option>
			</select>
		</FerramentasDaLista>

		<ChipsDaLista opcoes={situacoes} bind:valor={situacao} rotulo="Filtrar atividades" />

		{#if aviso}
			<p class="mb-3 text-[13.5px] font-semibold text-base-content/75" role="status">{aviso}</p>
		{/if}
		{#if erro && !dialogoAberto}
			<p class="mb-3 text-[13.5px] font-semibold text-error" role="alert">{erro}</p>
		{/if}

		{#if marcados.length > 0}
			<BarraDeSelecao
				quantos={marcados.length}
				singular="atividade marcada"
				plural="atividades marcadas"
				onlimpar={() => (marcados = [])}
			>
				{#if situacao === 'arquivadas'}
					<button
						type="button"
						onclick={() => desarquivar(marcados)}
						disabled={ocupado !== null}
						class="btn btn-sm motion-tap gap-2 btn-plain font-semibold"
					>
						Desarquivar
					</button>
				{:else}
					<button
						type="button"
						onclick={() => pedir('arquivar', marcados)}
						disabled={ocupado !== null}
						class="btn btn-sm motion-tap gap-2 btn-plain font-semibold"
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
				texto={situacao === 'arquivadas' && !busca.trim()
					? 'Nenhuma atividade arquivada.'
					: busca.trim()
						? `Nenhuma atividade com “${busca.trim()}”.`
						: situacao === 'todas' && data.activeCount === 0
							? 'Todas as suas atividades estão arquivadas.'
							: 'Nenhuma atividade com esse filtro.'}
				onlimpar={filtrando ? limparFiltros : undefined}
			/>
		{:else}
			<!-- Tabela: desktop. -->
			<div class="hidden lg:block {TABELA}">
				<div
					class="grid grid-cols-[28px_2.4fr_1fr_1fr_1.4fr_44px] items-center {CABECALHO_DA_TABELA}"
				>
					<input
						type="checkbox"
						class="checkbox checkbox-primary"
						checked={daPagina.todos}
						use:indeterminado={daPagina.alguns}
						onchange={() => (marcados = alternarPagina(marcados, idsDaPagina))}
						aria-label="Marcar as atividades desta página"
					/>
					<span>Atividade</span><span>Idioma</span><span>Situação</span><span>Tentativas</span><span
					></span>
				</div>
				{#each naPagina as a (a.id)}
					<div
						class="grid grid-cols-[28px_2.4fr_1fr_1fr_1.4fr_44px] {LINHA_DA_TABELA}
						       {marcados.includes(a.id) ? 'bg-primary/6' : ''}"
					>
						<input
							type="checkbox"
							class="checkbox checkbox-primary {POR_CIMA_DO_LINK}"
							checked={marcados.includes(a.id)}
							onchange={() => (marcados = alternar(marcados, a.id))}
							aria-label="Marcar {a.title}"
						/>
						<div class="min-w-0">
							<a
								href={resolve('/(studio)/atividades/[id]', { id: a.id })}
								class="block truncate font-semibold text-base-content {LINK_DA_LINHA}">{a.title}</a
							>
							<div class="mt-0.5 truncate text-xs text-base-content/65">
								{resumoDasQuestoes(a)}{a.level ? ` · ${a.level}` : ''}
							</div>
						</div>
						<span class="min-w-0"><IdiomaTag tag={a.idioma} /></span>
						<span>{@render estado(a, 'linha')}</span>
						<span class="flex items-center gap-2.5">
							{@render tentativas(a)}
							{#if a.score.correct + a.score.partial + a.score.incorrect > 0}
								<span class="w-[92px]">
									<ScoreBar
										correct={a.score.correct}
										partial={a.score.partial}
										incorrect={a.score.incorrect}
										height="h-[5px]"
									/>
								</span>
							{/if}
						</span>
						{@render menu(a)}
					</div>
				{/each}
			</div>

			<!-- Cartões: celular. -->
			<ul class="grid list-none gap-2.5 p-0 lg:hidden">
				{#each naPagina as a (a.id)}
					<li
						class="{CARTAO_DA_LISTA} {marcados.includes(a.id) ? 'border-primary bg-primary/6' : ''}"
					>
						<div class="mb-1 flex items-start gap-3">
							<input
								type="checkbox"
								class="mt-0.5 checkbox checkbox-primary {POR_CIMA_DO_LINK}"
								checked={marcados.includes(a.id)}
								onchange={() => (marcados = alternar(marcados, a.id))}
								aria-label="Marcar {a.title}"
							/>
							<a
								href={resolve('/(studio)/atividades/[id]', { id: a.id })}
								class="min-w-0 flex-1 font-semibold text-base-content {LINK_DA_LINHA}">{a.title}</a
							>
							{@render estado(a, 'cartao')}
							{@render menu(a)}
						</div>
						<p class="mb-2.5 ps-8 text-xs text-base-content/65">
							{resumoDasQuestoes(a)}{a.level ? ` · ${a.level}` : ''}
						</p>
						{#if a.score.correct + a.score.partial + a.score.incorrect > 0}
							<div class="mb-2.5 ps-8">
								<ScoreBar
									correct={a.score.correct}
									partial={a.score.partial}
									incorrect={a.score.incorrect}
									height="h-[5px]"
								/>
							</div>
						{/if}
						<div class="flex flex-wrap items-center gap-x-3 gap-y-1.5 ps-8 text-[13px]">
							<IdiomaTag tag={a.idioma} />
							<!-- Escrito por extenso: o número sozinho só se lia com o cabeçalho
							     "Tentativas" da tabela, que o cartão não tem. Rascunho não tem
							     link, e portanto nem tentativa: nada aparece. -->
							{#if a.attempts !== null}
								<span class="whitespace-nowrap text-base-content/65"
									>{palavra(a.attempts, 'tentativa', 'tentativas')}</span
								>
							{/if}
						</div>
					</li>
				{/each}
			</ul>

			<Pagination bind:pagina porPagina={POR_PAGINA} total={visiveis.length} rotulo="atividades" />
		{/if}

		<!-- O que espera por você — e só quando existe. -->
		{#if data.aCorrigir > 0}
			<a
				href={resolve('/(studio)/resultados')}
				class="mt-3.5 flex items-center gap-3 rounded-[14px] border border-line px-[18px] py-3.5 text-base-content no-underline transition-colors hover:border-primary hover:bg-base-200"
			>
				<svg
					class="size-[17px] shrink-0 text-primary"
					viewBox="0 0 24 24"
					fill="none"
					aria-hidden="true"
				>
					<path
						d="M4 20h4l11-11a2.83 2.83 0 10-4-4L4 16z"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
				<span class="min-w-0 flex-1 text-sm">
					<strong class="font-semibold"
						>{data.aCorrigir}
						{data.aCorrigir === 1 ? 'resposta de escrita espera' : 'respostas de escrita esperam'} o seu
						retorno.</strong
					>
					<span class="text-base-content/65"> O resto o servidor já corrigiu.</span>
				</span>
				<span class="shrink-0 text-[12.5px] font-bold text-primary">Ver resultados</span>
			</a>
		{/if}
	</div>

	<ConfirmarAcao
		bind:aberto={dialogoAberto}
		titulo={confirmando?.acao === 'apagar'
			? `Apagar ${palavra(alvo.length, 'atividade', 'atividades')} de vez?`
			: `Arquivar ${palavra(alvo.length, 'atividade', 'atividades')}?`}
		rotuloDoBotao={confirmando?.acao === 'apagar' ? 'Apagar de vez' : 'Arquivar'}
		perigo={confirmando?.acao === 'apagar'}
		digitar={confirmando?.acao === 'apagar' ? 'apagar' : undefined}
		ocupado={ocupado !== null}
		{erro}
		onconfirmar={confirmar}
	>
		{#if confirmando?.acao === 'apagar'}
			<p class="mb-3">
				Some a atividade, as questões e o link{tentativasDoAlvo > 0
					? `, e ${palavra(tentativasDoAlvo, 'tentativa', 'tentativas')} dos alunos`
					: ''}. Não tem volta. Os materiais continuam na sua biblioteca.
			</p>
		{:else}
			<p class="mb-3">
				O link fecha para quem ainda não começou, e elas saem do limite do seu plano. Quem já está
				respondendo termina, e os resultados ficam guardados. Dá para desarquivar depois, se couber
				no plano.
			</p>
		{/if}
		<ul class="grid list-none gap-1 p-0 text-[13px] text-base-content">
			{#each alvo.slice(0, 5) as a (a.id)}
				<li class="truncate">· {a.title}</li>
			{/each}
			{#if alvo.length > 5}
				<li class="text-base-content/65">e mais {alvo.length - 5}</li>
			{/if}
		</ul>
	</ConfirmarAcao>
{/if}
