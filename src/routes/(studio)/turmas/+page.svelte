<script lang="ts">
	// Lista de turmas. Quatro colunas, e nenhuma delas é desempenho: a pergunta
	// aqui é "quem está nesta turma", não "como a turma foi" — nota média,
	// ranking e gráfico são matéria de Resultados (paginas.md "Turmas e alunos").
	import { CLASSE_DA_ETIQUETA, corOuPadrao } from '$lib/etiquetas';
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { withMock } from '$lib/dev/with-mock';
	import IdiomaTag from '$lib/components/IdiomaTag.svelte';
	import FiltroIdioma from '$lib/components/FiltroIdioma.svelte';
	import { casaComFiltro } from '$lib/idiomas';
	import { casaComBusca } from '$lib/busca';
	import AmbientShapes from '$lib/components/AmbientShapes.svelte';
	import NovaTurma from './NovaTurma.svelte';

	interface Classroom {
		id: string;
		name: string;
		badge: string;
		color: string;
		languageLabel: string | null;
		idioma: string | null;
		students: number;
		withEmail: number;
		withAccount: number;
		bounced: number;
		studentNames: string[];
		createdAt: string;
		deliveries: number;
		lastDelivery: string;
	}
	interface PageData {
		classrooms: Classroom[];
		totals: { classrooms: number; students: number; withEmail: number };
		/** A tag com que a turma nova nasce (null: o professor ensina mais de um idioma). */
		idiomaPadrao: string | null;
	}

	const MOCK: PageData = {
		classrooms: [
			{
				id: 'tur_01',
				name: '7º B — inglês',
				badge: '7B',
				color: 'azul',
				languageLabel: 'Inglês',
				idioma: 'en-US',
				students: 24,
				withEmail: 22,
				withAccount: 10,
				bounced: 1,
				studentNames: ['Juliana Souza', 'Pedro Lima'],
				createdAt: '2026-09-01T12:00:00.000Z',
				deliveries: 6,
				lastDelivery: 'há 3 dias'
			},
			{
				id: 'tur_02',
				name: 'Espanhol iniciante',
				badge: 'EI',
				color: 'teal',
				languageLabel: 'Espanhol',
				idioma: 'es-ES',
				students: 12,
				withEmail: 9,
				withAccount: 0,
				bounced: 0,
				studentNames: ['Ana Ribeiro'],
				createdAt: '2026-10-01T12:00:00.000Z',
				deliveries: 2,
				lastDelivery: 'há 2 semanas'
			}
		] as Classroom[],
		totals: { classrooms: 2, students: 36, withEmail: 31 },
		idiomaPadrao: 'en-US'
	};

	let { data: dataProp }: { data?: Partial<PageData> } = $props();
	const data = $derived(withMock(dataProp, MOCK));

	// Busca, filtros e ordem são de TELA: as turmas são do professor e já vieram
	// inteiras no loader (uma ida ao servidor por tecla não compraria nada).
	let filtroIdioma = $state('');
	let busca = $state('');
	type Filtro = 'todas' | 'semConta' | 'voltou' | 'semEnvio';
	let filtro = $state<Filtro>('todas');
	type Ordem = 'recentes' | 'nome' | 'alunos';
	let ordem = $state<Ordem>('recentes');

	const CASA: Record<Filtro, (t: Classroom) => boolean> = {
		todas: () => true,
		// Aluno sem conta não vê o mapa dos módulos: é para quem mandar o convite.
		semConta: (t) => t.students > t.withAccount,
		voltou: (t) => t.bounced > 0,
		semEnvio: (t) => t.deliveries === 0
	};
	// Só aparece o filtro que tem o que mostrar — chip de "0" é ruído.
	const filtros = $derived(
		(
			[
				{ id: 'todas', label: 'Todas' },
				{ id: 'semConta', label: 'Com aluno sem conta' },
				{ id: 'voltou', label: 'E-mail que voltou' },
				{ id: 'semEnvio', label: 'Sem envio ainda' }
			] as { id: Filtro; label: string }[]
		)
			.map((f) => ({ ...f, n: data.classrooms.filter(CASA[f.id]).length }))
			.filter((f) => f.id === 'todas' || f.n > 0)
	);

	/** O aluno que fez a turma aparecer na busca — dito na linha, para não parecer engano. */
	function alunoAchado(t: Classroom): string | null {
		if (!busca.trim() || casaComBusca(t.name, busca)) return null;
		return t.studentNames.find((n) => casaComBusca(n, busca)) ?? null;
	}

	const visiveis = $derived(
		data.classrooms
			.filter(
				(t) =>
					casaComFiltro(t.idioma, filtroIdioma) &&
					CASA[filtro](t) &&
					(casaComBusca(t.name, busca) || t.studentNames.some((n) => casaComBusca(n, busca)))
			)
			.sort((a, b) =>
				ordem === 'nome'
					? a.name.localeCompare(b.name, 'pt-BR')
					: ordem === 'alunos'
						? b.students - a.students
						: b.createdAt.localeCompare(a.createdAt)
			)
	);
	const filtrando = $derived(!!busca.trim() || filtro !== 'todas' || !!filtroIdioma);
	function limparFiltros() {
		busca = '';
		filtro = 'todas';
		filtroIdioma = '';
	}

	// **Criar turma abre a bandeja AQUI** (paginas.md "Turmas e alunos"). O
	// `?nova=1` (e o `?nova=lote`, que já abre no colar) é por onde chega quem
	// vem de fora — o antigo `turmas/nova` redireciona para cá.
	let novaAberta = $state(false);
	let modoNova = $state<'um' | 'lote'>('um');
	function abrirNova(modo: 'um' | 'lote' = 'um') {
		modoNova = modo;
		novaAberta = true;
	}
	onMount(() => {
		const pedido = page.url.searchParams.get('nova');
		if (pedido) abrirNova(pedido === 'lote' ? 'lote' : 'um');
	});
</script>

<svelte:head><title>Turmas · Spokke</title></svelte:head>

{#if data.classrooms.length === 0}
	<!-- **O vazio é uma escolha legítima**, não uma pendência: sem turma o
	     produto funciona pelo link, QR e código. O hero explica o ganho e, no
	     mesmo bloco, diz que nada disso é obrigatório — o mesmo desenho da
	     lista vazia de atividades. -->
	<div class="relative flex min-h-[70vh] items-center overflow-hidden px-4 py-12 lg:px-7 lg:py-14">
		<AmbientShapes height="230px" />
		<div class="relative z-1 max-w-[52ch] animate-entrada">
			<p class="mb-4 text-xs font-bold tracking-[0.13em] text-primary uppercase">Turmas</p>
			<h1
				class="mb-3.5 font-display text-[30px] leading-[1.1] font-semibold tracking-[-0.025em] text-pretty lg:text-4xl"
			>
				Cadastre a turma uma vez e o aluno chega pelo nome certo.
			</h1>
			<p class="mb-3.5 text-[15.5px] leading-relaxed text-pretty text-base-content/65">
				Hoje você cola o link no grupo e recebe "Ju", "juliana" e "Ju 7B" como três pessoas na
				lista. Com a turma cadastrada, cada aluno recebe um link pessoal por e-mail e aparece com o
				nome que você escreveu.
			</p>
			<p
				class="mb-[26px] rounded-[12px] border border-line bg-base-200 px-4 py-3.5 text-sm leading-relaxed text-base-content/65"
			>
				Não é obrigatório. Sem turma nenhuma o produto segue funcionando por link, QR e código —
				turma resolve leitura de resultado e distribuição, não acesso.
			</p>
			<div class="flex flex-wrap gap-3">
				<button
					type="button"
					onclick={() => abrirNova('um')}
					class="btn btn-lg min-h-[50px] motion-tap btn-primary text-base font-bold"
				>
					Criar a primeira turma
				</button>
				<button
					type="button"
					onclick={() => abrirNova('lote')}
					class="btn btn-lg min-h-[50px] motion-tap gap-2 btn-outline text-base font-bold"
				>
					<svg class="size-[17px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
						<path
							d="M8 4.5h8v3H8zM6 6.5h12a1.5 1.5 0 011.5 1.5v11A1.5 1.5 0 0118 20.5H6A1.5 1.5 0 014.5 19V8A1.5 1.5 0 016 6.5z"
							stroke="currentColor"
							stroke-width="2"
							stroke-linejoin="round"
						/>
					</svg>
					Colar uma lista de alunos
				</button>
			</div>
		</div>
	</div>
{:else}
	<div class="pagina-studio">
		<div class="mb-[22px] flex flex-wrap items-end gap-4">
			<div>
				<h1 class="mb-1 font-display text-[26px] font-semibold tracking-[-0.022em] lg:text-[28px]">
					Turmas
				</h1>
				<p class="text-[13.5px] text-base-content/65">
					{data.totals.classrooms}
					{data.totals.classrooms === 1 ? 'turma' : 'turmas'} · {data.totals.students} alunos ·
					{data.totals.withEmail} com e-mail
				</p>
			</div>
			<div class="flex-1"></div>
			<FiltroIdioma tags={data.classrooms.map((t) => t.idioma)} bind:valor={filtroIdioma} />
			<button
				type="button"
				onclick={() => abrirNova('um')}
				class="btn h-[46px] motion-tap gap-2 rounded-[11px] btn-primary px-[19px] text-[15px] font-bold"
			>
				<svg class="size-[1.05rem]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<path
						d="M12 5v14M5 12h14"
						stroke="currentColor"
						stroke-width="2.4"
						stroke-linecap="round"
					/>
				</svg>
				Nova turma
			</button>
		</div>

		<!-- Busca por turma OU por aluno ("em que turma está a Juliana?"), os filtros
		     de situação e a ordem. Tudo de tela. -->
		<div class="mb-4 flex flex-wrap items-center gap-2.5">
			<label class="relative min-w-[220px] flex-[1_1_280px]">
				<span class="sr-only">Buscar turma ou aluno</span>
				<svg
					class="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-base-content/65"
					viewBox="0 0 24 24"
					fill="none"
					aria-hidden="true"
					><path
						d="M11 18.5a7.5 7.5 0 100-15 7.5 7.5 0 000 15zM20.5 20.5l-4.2-4.2"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
					/></svg
				>
				<input
					type="search"
					bind:value={busca}
					placeholder="Buscar turma ou aluno"
					class="input h-[38px] min-h-[38px] w-full ps-9 text-[13.5px]"
				/>
			</label>
			<label class="sr-only" for="ordem-turmas">Ordenar turmas</label>
			<select
				id="ordem-turmas"
				bind:value={ordem}
				class="select h-[38px] min-h-[38px] w-auto py-0 text-[13px]"
			>
				<option value="recentes">Mais recentes</option>
				<option value="nome">Nome (A–Z)</option>
				<option value="alunos">Mais alunos</option>
			</select>
		</div>
		{#if filtros.length > 1}
			<div
				class="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-wrap lg:px-0"
				role="group"
				aria-label="Filtrar turmas"
			>
				{#each filtros as f (f.id)}
					<button
						type="button"
						aria-pressed={filtro === f.id}
						onclick={() => (filtro = f.id)}
						class="inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors {filtro ===
						f.id
							? 'border-primary bg-primary text-primary-content'
							: 'border-line bg-base-100 text-base-content/70 hover:border-primary'}"
					>
						{f.label}
						<span class="font-mono text-[12px] opacity-80">{f.n}</span>
					</button>
				{/each}
			</div>
		{/if}

		{#if visiveis.length === 0}
			<div
				class="mb-[22px] rounded-[14px] border border-dashed border-line px-5 py-8 text-center text-[14px] text-base-content/65"
				role="status"
			>
				<p class="mb-3">Nenhuma turma com {busca.trim() ? `“${busca.trim()}”` : 'esse filtro'}.</p>
				{#if filtrando}
					<button type="button" onclick={limparFiltros} class="btn btn-sm btn-plain">
						Limpar busca e filtros
					</button>
				{/if}
			</div>
		{/if}

		<!-- Desktop: quatro colunas, e nenhuma delas é desempenho. Celular: a
		     mesma informação em cartões, sem rolagem lateral. -->
		<div class="mb-[22px] hidden overflow-hidden rounded-[14px] border border-line lg:block">
			<div
				class="grid grid-cols-[2.6fr_1.5fr_1.15fr_1.3fr_76px] gap-[18px] border-b border-line bg-base-200 px-5 py-[11px] text-[11px] font-bold tracking-[0.09em] text-base-content/65 uppercase"
			>
				<span>Turma</span><span>Alunos</span><span>Enviadas</span><span>Último envio</span><span
				></span>
			</div>
			{#each visiveis as turma (turma.id)}
				<a
					href={resolve('/(studio)/turmas/[id]', { id: turma.id })}
					class="grid grid-cols-[2.6fr_1.5fr_1.15fr_1.3fr_76px] items-center gap-[18px] border-b border-line px-5 py-[15px] text-sm text-base-content no-underline transition-colors last:border-0 hover:bg-base-200"
				>
					<span class="flex min-w-0 items-center gap-3">
						<span
							class="grid size-[34px] shrink-0 place-items-center rounded-[10px] text-xs font-bold {CLASSE_DA_ETIQUETA[
								corOuPadrao(turma.color)
							]}">{turma.badge}</span
						>
						<span class="min-w-0">
							<span class="mb-[3px] block truncate font-semibold">{turma.name}</span>
							{#if alunoAchado(turma)}
								<span class="mb-1 block truncate text-[12px] text-primary"
									>aluno: {alunoAchado(turma)}</span
								>
							{/if}
							<IdiomaTag tag={turma.idioma} class="mt-1" />
						</span>
					</span>
					<span class="min-w-0">
						<span class="mb-[3px] block font-mono text-[13px]">{turma.students} alunos</span>
						<!-- É este número que recebe convite, e por isso ele aparece antes
						     de qualquer botão de enviar. Sem e-mail não é erro: fica em neutro. -->
						<span class="block text-xs text-base-content/65">
							{turma.withEmail === turma.students
								? 'todos com e-mail'
								: `${turma.withEmail} com e-mail`} · {turma.withAccount} com conta
						</span>
						{#if turma.bounced > 0}
							<span class="mt-0.5 block text-xs font-semibold text-error">
								{turma.bounced}
								{turma.bounced === 1 ? 'e-mail voltou' : 'e-mails voltaram'}
							</span>
						{/if}
					</span>
					<span class="font-mono text-[13px] text-base-content/65"
						>{turma.deliveries === 0 ? '—' : turma.deliveries}</span
					>
					<span class="text-[13px] text-base-content/65">{turma.lastDelivery}</span>
					<span class="text-end text-[13px] font-bold text-primary">Abrir</span>
				</a>
			{/each}
		</div>

		<ul class="mb-[22px] grid list-none gap-2.5 p-0 lg:hidden">
			{#each visiveis as turma (turma.id)}
				<li>
					<a
						href={resolve('/(studio)/turmas/[id]', { id: turma.id })}
						class="block cartao-interativo rounded-[14px] border border-line p-4 no-underline"
					>
						<div class="mb-2.5 flex items-center gap-3">
							<span
								class="grid size-[34px] shrink-0 place-items-center rounded-[10px] text-xs font-bold {CLASSE_DA_ETIQUETA[
									corOuPadrao(turma.color)
								]}">{turma.badge}</span
							>
							<span class="min-w-0 flex-1">
								<span class="block truncate text-[0.92rem] font-semibold text-base-content"
									>{turma.name}</span
								>
								{#if alunoAchado(turma)}
									<span class="block truncate text-[12px] text-primary"
										>aluno: {alunoAchado(turma)}</span
									>
								{/if}
								<IdiomaTag tag={turma.idioma} class="mt-1" />
							</span>
						</div>
						<div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-base-content/65">
							<span
								><strong class="font-mono text-base-content">{turma.students}</strong> alunos</span
							>
							<span
								><strong class="font-mono text-base-content">{turma.withEmail}</strong> com e-mail</span
							>
							<span
								><strong class="font-mono text-base-content">{turma.withAccount}</strong> com conta</span
							>
							{#if turma.bounced > 0}
								<span class="font-semibold text-error"
									>{turma.bounced}
									{turma.bounced === 1 ? 'e-mail voltou' : 'e-mails voltaram'}</span
								>
							{/if}
							<span>{turma.deliveries === 0 ? 'nenhum envio' : `${turma.deliveries} enviadas`}</span
							>
							<span>{turma.lastDelivery}</span>
						</div>
					</a>
				</li>
			{/each}
		</ul>

		<!-- Lembrete: turma não é porta. -->
		<div
			class="flex gap-3.5 rounded-[13px] border border-s-[3px] border-line border-s-accent bg-base-200 px-[19px] py-[17px]"
		>
			<svg
				class="mt-0.5 size-[18px] shrink-0 text-accent"
				viewBox="0 0 24 24"
				fill="none"
				aria-hidden="true"
			>
				<path
					d="M10 13.5a4 4 0 005.7 0l3-3a4 4 0 10-5.7-5.7l-1 1M14 10.5a4 4 0 00-5.7 0l-3 3a4 4 0 105.7 5.7l1-1"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			</svg>
			<div class="min-w-0">
				<p class="mb-1 text-sm font-bold">Turma não fecha a porta da frente</p>
				<p class="max-w-[82ch] text-[13px] leading-relaxed text-base-content/65">
					Toda atividade publicada continua com link, QR e código de acesso. Quem não está em turma
					nenhuma entra por ali e digita o nome, como sempre. Cadastrar a turma serve para o aluno
					chegar pelo nome certo na lista de resultados e para você não redistribuir link toda
					semana.
				</p>
			</div>
		</div>
	</div>
{/if}

<NovaTurma
	aberta={novaAberta}
	onfechar={() => (novaAberta = false)}
	idiomaPadrao={data.idiomaPadrao}
	modoInicial={modoNova}
/>
