<script lang="ts">
	// Lista de atividades. Com zero atividades, esta rota renderiza o ONBOARDING —
	// é a primeira impressão do Studio, não uma lista vazia (paginas.md "Mapa").
	//
	// Duas formas para a mesma lista: TABELA no desktop (densa, o Studio pode
	// ser rico) e CARTÕES no celular, onde uma tabela de 5 colunas não cabe.
	import { resolve } from '$app/paths';
	import AmbientShapes from '$lib/components/AmbientShapes.svelte';
	import Pagination from '$lib/components/Pagination.svelte';
	import ScoreBar from '$lib/components/ScoreBar.svelte';
	import { withMock } from '$lib/dev/with-mock';
	import { NIVEIS, rotuloDoNivel, type NivelId } from '$lib/atividades/nivel';
	import IdiomaTag from '$lib/components/IdiomaTag.svelte';
	import FiltroIdioma from '$lib/components/FiltroIdioma.svelte';
	import { casaComFiltro } from '$lib/idiomas';

	interface Score {
		correct: number;
		partial: number;
		incorrect: number;
	}
	interface ActivityRow {
		id: string;
		title: string;
		itemCount: number;
		skills: string[];
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
				title: 'Present perfect — turma B',
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
			},
			{
				id: 'atv_02',
				title: 'Saudações e apresentação',
				itemCount: 6,
				skills: ['speaking', 'listening'],
				language: 'Árabe',
				idioma: 'ar-SA',
				noAr: false,
				arquivada: false,
				level: null,
				modulos: [],
				attempts: null,
				invited: null,
				score: { correct: 0, partial: 0, incorrect: 0 }
			},
			{
				id: 'atv_03',
				title: 'Números e horas',
				itemCount: 10,
				skills: ['listening'],
				language: 'Japonês',
				idioma: 'ja-JP',
				noAr: true,
				arquivada: false,
				level: null,
				modulos: [],
				attempts: 31,
				invited: 31,
				score: { correct: 28, partial: 2, incorrect: 1 }
			}
		] as ActivityRow[],
		totalCount: 3,
		activeCount: 3,
		archivedCount: 0,
		publishedCount: 2,
		draftCount: 1,
		resume: {
			id: 'atv_04',
			title: 'Comida e restaurante',
			materiais: 7,
			itens: 0,
			editadoEm: 'há 2 dias',
			etapa: 2,
			etapaLabel: 'Materiais'
		} as Resume | null,
		aCorrigir: 3,
		mes: { nome: 'Setembro', tentativas: 49, acertoMedio: 74, respostas: 140 }
	};

	let { data: dataProp }: { data?: Partial<PageData> } = $props();
	const data = $derived(withMock(dataProp, MOCK));

	// Os chips eram DECORATIVOS: nenhum `onclick`, e o primeiro sempre pintado
	// como ativo. Agora eles filtram de verdade — a lista inteira chega no
	// loader, então a troca é instantânea e não custa ida ao servidor.
	// "Arquivadas" só aparece quando existe alguma: arquivar é como o professor
	// libera vaga no plano (docs/adr-002-billing.md), e "Todas" não as mistura —
	// elas estão fora do ar para quem não começou.
	type Filtro = 'todas' | 'publicadas' | 'rascunhos' | 'arquivadas';
	let filtro = $state<Filtro>('todas');
	// Nível e módulo são filtros a MAIS, combinados com o de estado: "as B1 do
	// módulo Frutas que estão no ar". Vazio = todos.
	let filtroNivel = $state<NivelId | ''>('');
	let filtroModulo = $state('');
	let filtroIdioma = $state('');
	const modulosNaLista = $derived(
		[...new Map(data.activities.flatMap((a) => a.modulos).map((m) => [m.id, m])).values()].sort(
			(x, y) => x.name.localeCompare(y.name, 'pt-BR')
		)
	);
	let pagina = $state(1);

	const filtros: { id: Filtro; label: string; n: number }[] = $derived([
		{ id: 'todas', label: 'Todas', n: data.activeCount },
		{ id: 'publicadas', label: 'Publicadas', n: data.publishedCount },
		{ id: 'rascunhos', label: 'Rascunhos', n: data.draftCount },
		...(data.archivedCount > 0
			? [{ id: 'arquivadas' as const, label: 'Arquivadas', n: data.archivedCount }]
			: [])
	]);

	const visiveis = $derived(
		data.activities.filter(
			(a) =>
				(filtro === 'arquivadas'
					? a.arquivada
					: !a.arquivada &&
						(filtro === 'todas' ? true : filtro === 'publicadas' ? a.noAr : !a.noAr)) &&
				(!filtroNivel || a.level === filtroNivel) &&
				(!filtroModulo || a.modulos.some((m) => m.id === filtroModulo)) &&
				casaComFiltro(a.idioma, filtroIdioma)
		)
	);

	const POR_PAGINA = 8;
	const naPagina = $derived(visiveis.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA));

	// Trocar de filtro volta para a primeira página: manter a 3ª ao filtrar de
	// 20 para 4 atividades deixava a tabela vazia sem explicação.
	function escolher(id: Filtro) {
		filtro = id;
		pagina = 1;
	}
</script>

<svelte:head><title>Atividades — Spokke</title></svelte:head>

{#if data.totalCount === 0}
	<div class="relative flex min-h-[70vh] items-center overflow-hidden px-4 py-12 lg:px-7 lg:py-14">
		<AmbientShapes height="230px" />
		<div class="relative z-1 max-w-[46ch] animate-entrada">
			<p class="mb-4 text-xs font-bold tracking-[0.13em] text-primary uppercase">
				Bem-vinda, {data.teacher.firstName}
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
			<div class="flex flex-wrap gap-3">
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
		<div class="mb-4 flex flex-wrap items-end gap-4 lg:mb-[18px]">
			<div>
				<h1 class="mb-1 font-display text-[26px] font-semibold tracking-[-0.02em] lg:text-[27px]">
					Atividades
				</h1>
				<p class="text-[13.5px] text-base-content/65">
					{data.totalCount}
					{data.totalCount === 1 ? 'atividade' : 'atividades'} · {data.publishedCount} publicadas
					<span class="hidden lg:inline">· {data.mes.tentativas} tentativas neste mês</span>
				</p>
			</div>
			<div class="flex-1"></div>
			<!-- Nível e módulo: selects ao lado dos chips de estado. Só aparecem quando
			     há o que escolher — um filtro de uma opção só é ruído. -->
			<div class="flex flex-wrap gap-2">
				<label class="sr-only" for="filtro-nivel">Filtrar por nível</label>
				<select
					id="filtro-nivel"
					bind:value={filtroNivel}
					onchange={() => (pagina = 1)}
					class="select h-[38px] min-h-[38px] w-auto py-0 text-[13px]"
				>
					<option value="">Todos os níveis</option>
					{#each NIVEIS as n (n.id)}
						<option value={n.id}>{rotuloDoNivel(n.id)}</option>
					{/each}
				</select>
				<FiltroIdioma
					tags={data.activities.map((a) => a.idioma)}
					bind:valor={filtroIdioma}
					onmudou={() => (pagina = 1)}
				/>
				{#if modulosNaLista.length > 0}
					<label class="sr-only" for="filtro-modulo">Filtrar por módulo</label>
					<select
						id="filtro-modulo"
						bind:value={filtroModulo}
						onchange={() => (pagina = 1)}
						class="select h-[38px] min-h-[38px] w-auto py-0 text-[13px]"
					>
						<option value="">Todos os módulos</option>
						{#each modulosNaLista as m (m.id)}
							<option value={m.id}>{m.name}</option>
						{/each}
					</select>
				{/if}
			</div>
			<!-- No celular os filtros rolam na horizontal. -->
			<div class="-mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-wrap lg:px-0">
				{#each filtros as opcao (opcao.id)}
					<button
						type="button"
						onclick={() => escolher(opcao.id)}
						aria-pressed={filtro === opcao.id}
						class="flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] transition-colors
						       {filtro === opcao.id
							? 'bg-base-300 font-bold text-primary'
							: 'border border-line bg-base-200 text-base-content/65 hover:bg-base-300'}"
					>
						{opcao.label}
						<span class="font-mono text-[12px] opacity-70">{opcao.n}</span>
					</button>
				{/each}
			</div>
		</div>

		{#if data.resume}
			<!-- A tarefa começada vem ANTES da lista: é a retomada, não mais um
			     item qualquer. -->
			<a
				href={resolve('/(studio)/atividades/[id]/materiais', { id: data.resume.id })}
				class="mb-4 flex flex-col gap-4 rounded-box bg-base-300 px-[22px] py-[22px] no-underline
				       lg:mb-[18px] lg:flex-row lg:items-center lg:gap-[26px] lg:px-[26px]"
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
						{data.resume.materiais}
						{data.resume.materiais === 1 ? 'material colado' : 'materiais colados'}, {data.resume
							.itens === 0
							? 'itens ainda não gerados'
							: `${data.resume.itens} ${data.resume.itens === 1 ? 'item gerado' : 'itens gerados'}`}.
						Editada {data.resume.editadoEm}.
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

		<!-- Tabela: desktop. -->
		<div class="hidden overflow-hidden rounded-box border border-line lg:block">
			<div
				class="grid grid-cols-[2.4fr_1fr_1fr_1.4fr_86px] gap-4 border-b border-line bg-base-200 px-[18px] py-[11px] text-[11px] font-bold tracking-[0.09em] text-base-content/65 uppercase"
			>
				<span>Atividade</span><span>Idioma</span><span>Status</span><span>Tentativas</span><span
				></span>
			</div>
			{#each naPagina as a (a.id)}
				<a
					href={resolve('/(studio)/atividades/[id]', { id: a.id })}
					class="grid grid-cols-[2.4fr_1fr_1fr_1.4fr_86px] items-center gap-4 border-b border-line px-[18px] py-[15px] text-sm no-underline transition-colors last:border-0 hover:bg-base-200"
				>
					<div class="min-w-0">
						<div class="truncate font-semibold text-base-content">{a.title}</div>
						<div class="mt-0.5 truncate text-xs text-base-content/65">
							{a.itemCount} itens · {a.skills.join(', ')}{a.level ? ` · ${a.level}` : ''}
						</div>
					</div>
					<span class="min-w-0"><IdiomaTag tag={a.idioma} /></span>
					<span>
						{#if a.arquivada}
							<span
								class="inline-block rounded-full border border-dashed border-line px-2.5 py-1 text-xs font-bold whitespace-nowrap text-base-content/65"
							>
								arquivada
							</span>
						{:else if a.noAr}
							<span
								class="inline-block rounded-full bg-primary px-[11px] py-[5px] text-xs font-bold whitespace-nowrap text-primary-content"
							>
								No ar
							</span>
						{:else}
							<span
								class="inline-block rounded-full border border-line px-2.5 py-1 text-xs font-bold whitespace-nowrap text-base-content/65"
							>
								rascunho
							</span>
						{/if}
					</span>
					<span class="flex items-center gap-2.5">
						{#if a.attempts !== null}
							<span class="font-mono text-[13px] whitespace-nowrap text-base-content">
								{a.attempts}{#if a.invited !== null}<span class="text-base-content/65">
										/ {a.invited}</span
									>{/if}
							</span>
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
						{:else}
							<span class="text-base-content/65">—</span>
						{/if}
					</span>
					<span class="text-end text-[13px] font-bold text-primary">Abrir</span>
				</a>
			{/each}
		</div>

		<!-- Cartões: celular. -->
		<div class="grid gap-2.5 lg:hidden">
			{#each naPagina as a (a.id)}
				<a
					href={resolve('/(studio)/atividades/[id]', { id: a.id })}
					class="block rounded-box border border-line px-4 py-3.5 no-underline"
				>
					<div class="mb-1 flex items-start gap-3">
						<span class="min-w-0 flex-1 font-semibold text-base-content">{a.title}</span>
						{#if a.arquivada}
							<span
								class="shrink-0 rounded-full border border-dashed border-line px-2.5 py-1 text-[11px] font-bold whitespace-nowrap text-base-content/65"
							>
								arquivada
							</span>
						{:else if a.noAr}
							<span
								class="shrink-0 rounded-full bg-primary px-2.5 py-1 text-[11px] font-bold whitespace-nowrap text-primary-content"
							>
								No ar
							</span>
						{:else}
							<span
								class="shrink-0 rounded-full border border-line px-2.5 py-1 text-[11px] font-bold whitespace-nowrap text-base-content/65"
							>
								rascunho
							</span>
						{/if}
					</div>
					<p class="mb-2.5 text-xs text-base-content/65">
						{a.itemCount} itens · {a.skills.join(', ')}
					</p>
					{#if a.score.correct + a.score.partial + a.score.incorrect > 0}
						<div class="mb-2.5">
							<ScoreBar
								correct={a.score.correct}
								partial={a.score.partial}
								incorrect={a.score.incorrect}
								height="h-[5px]"
							/>
						</div>
					{/if}
					<div class="flex items-center gap-3 text-[13px]">
						<IdiomaTag tag={a.idioma} />
						<span class="font-mono text-base-content">
							{#if a.attempts !== null}{a.attempts}{#if a.invited !== null}<span
										class="text-base-content/65"
									>
										/ {a.invited}</span
									>{/if}{:else}<span class="text-base-content/65">—</span>{/if}
						</span>
						<div class="flex-1"></div>
						<span class="font-bold text-primary">Abrir</span>
					</div>
				</a>
			{/each}
		</div>

		{#if visiveis.length === 0}
			<p
				class="mt-3.5 rounded-box border border-line px-[18px] py-5 text-[13.5px] text-base-content/65"
			>
				{filtro === 'publicadas'
					? 'Nenhuma atividade no ar ainda.'
					: filtro === 'arquivadas'
						? 'Nenhuma atividade arquivada.'
						: filtro === 'todas'
							? 'Todas as suas atividades estão arquivadas.'
							: 'Nenhum rascunho — está tudo publicado.'}
			</p>
		{/if}

		<!-- Era um "Ver todas" que não fazia nada, ao lado de uma contagem que
		     descrevia o corte de 6 do loader. -->
		<Pagination bind:pagina porPagina={POR_PAGINA} total={visiveis.length} rotulo="atividades" />

		<!-- O que espera por você — e só quando existe. Os dois cartões que ficavam
		     aqui sempre (um "nenhuma resposta esperando", outro repetindo o "Nova
		     atividade") e a faixa com os números do mês (já no cabeçalho e em
		     Resultados) saíram: eram a mesma informação pela segunda vez. -->
		{#if data.aCorrigir > 0}
			<a
				href={resolve('/(studio)/resultados')}
				class="mt-3.5 flex items-center gap-3 rounded-box border border-line px-[18px] py-3.5 text-base-content no-underline transition-colors hover:border-primary hover:bg-base-200"
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
{/if}
