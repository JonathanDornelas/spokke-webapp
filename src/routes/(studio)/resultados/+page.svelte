<script lang="ts">
	// Resultados: uma linha por atividade publicada, com tentativas, acerto e a
	// última tentativa lado a lado (paginas.md "Resultados"). A barra é CURTA de
	// propósito, para comparar linha com linha sem atravessar a tela.
	//
	// Por padrão a lista vem AGRUPADA por idioma (a tag de `$lib/idiomas.ts`) e
	// ordenada pelo MENOR acerto: o que precisa de atenção sobe. Busca, ordem e
	// agrupamento são de tela — a lista é do professor e já veio inteira.
	//
	// **Parcial tem faixa própria**, e com menos de 3 tentativas a linha avisa
	// que ainda é pouco para ler. Atividade sem tentativa não vira número: vira um
	// caminho para mandar o link.
	import { resolve } from '$app/paths';
	import IdiomaTag from '$lib/components/IdiomaTag.svelte';
	import { withMock } from '$lib/dev/with-mock';
	import { idiomaDe } from '$lib/idiomas';
	import { baixarCsv, montarCsv } from '$lib/csv';

	interface ActivitySummary {
		id: string;
		title: string;
		idioma: string | null;
		attempts: number;
		correct: number;
		partial: number;
		incorrect: number;
		publishedAgo: string;
		lastAttempt: Date | null;
	}
	interface PageData {
		publishedCount: number;
		totalAttempts: number;
		averageCorrect: number | null;
		activities: ActivitySummary[];
	}

	const MOCK: PageData = {
		publishedCount: 3,
		totalAttempts: 27,
		averageCorrect: 68,
		activities: [
			{
				id: 'atv_01',
				title: 'Present perfect — turma B',
				idioma: 'en-US',
				attempts: 18,
				correct: 71,
				partial: 18,
				incorrect: 11,
				publishedAgo: '2 semanas',
				lastAttempt: new Date('2026-10-08T14:20:00')
			},
			{
				id: 'atv_02',
				title: 'Comidas — vocabulário',
				idioma: 'ja-JP',
				attempts: 2,
				correct: 40,
				partial: 20,
				incorrect: 40,
				publishedAgo: '3 dias',
				lastAttempt: new Date('2026-10-07T09:10:00')
			},
			{
				id: 'atv_03',
				title: 'Diálogo — no restaurante',
				idioma: 'es-ES',
				attempts: 0,
				correct: 0,
				partial: 0,
				incorrect: 0,
				publishedAgo: '2 dias',
				lastAttempt: null
			}
		]
	};

	let { data: dataProp }: { data?: Partial<PageData> } = $props();
	const data = $derived(withMock(dataProp, MOCK));

	type Ordem = 'acerto' | 'recentes' | 'tentativas';
	const ORDENS: { id: Ordem; label: string }[] = [
		{ id: 'acerto', label: 'Menor acerto' },
		{ id: 'recentes', label: 'Mais recentes' },
		{ id: 'tentativas', label: 'Mais tentativas' }
	];
	let ordem = $state<Ordem>('acerto');
	let agrupar = $state(true);
	let busca = $state('');

	/** Abaixo disto a porcentagem oscila demais para tirar conclusão. */
	const POUCO = 3;

	type Comparavel = { attempts: number; correct: number; ultima: number };
	// Sem tentativa vai para o FIM em qualquer ordem: 0% ali é ausência, não erro.
	function comparar(a: Comparavel, b: Comparavel): number {
		if ((a.attempts === 0) !== (b.attempts === 0)) return a.attempts === 0 ? 1 : -1;
		if (ordem === 'recentes') return b.ultima - a.ultima;
		if (ordem === 'tentativas') return b.attempts - a.attempts;
		return a.correct - b.correct;
	}

	const linhas = $derived.by(() => {
		const termo = busca.trim().toLocaleLowerCase('pt-BR');
		return data.activities
			.filter((a) => !termo || a.title.toLocaleLowerCase('pt-BR').includes(termo))
			.map((a) => ({ ...a, ultima: a.lastAttempt?.getTime() ?? 0 }))
			.sort(comparar);
	});

	const grupos = $derived.by(() => {
		if (!agrupar) return linhas.length > 0 ? [{ idioma: undefined, linhas, meta: '' }] : [];
		// Objeto local do cálculo, refeito a cada mudança — não é estado.
		const porIdioma: Record<string, typeof linhas> = {};
		for (const l of linhas) (porIdioma[l.idioma ?? ''] ??= []).push(l);
		return Object.entries(porIdioma)
			.map(([chave, ls]) => {
				const attempts = ls.reduce((t, l) => t + l.attempts, 0);
				const correct =
					attempts === 0
						? 0
						: Math.round(ls.reduce((t, l) => t + l.correct * l.attempts, 0) / attempts);
				const ultima = Math.max(...ls.map((l) => l.ultima));
				const meta = [
					`${ls.length} ${ls.length === 1 ? 'atividade' : 'atividades'}`,
					`${attempts} ${attempts === 1 ? 'tentativa' : 'tentativas'}`,
					...(attempts > 0 ? [`${correct}% de acerto`] : [])
				].join(' · ');
				return { idioma: chave || null, linhas: ls, meta, attempts, correct, ultima };
			})
			.sort(comparar);
	});

	const dataCurta = (d: Date | null) =>
		d ? d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—';

	const segmentos = (a: { correct: number; partial: number; incorrect: number }) =>
		[
			{ w: a.correct, classe: 'bg-success' },
			{ w: a.partial, classe: 'bg-warning' },
			{ w: a.incorrect, classe: 'bg-error' }
		].filter((s) => s.w > 0);

	function exportar() {
		baixarCsv(
			'resultados',
			montarCsv(
				[
					'Atividade',
					'Idioma',
					'Tentativas',
					'Certo (%)',
					'Parcial (%)',
					'Errado (%)',
					'Última tentativa'
				],
				linhas.map((l) => [
					l.title,
					idiomaDe(l.idioma)?.rotulo ?? 'Sem idioma',
					l.attempts,
					l.attempts > 0 ? l.correct : null,
					l.attempts > 0 ? l.partial : null,
					l.attempts > 0 ? l.incorrect : null,
					l.lastAttempt ? l.lastAttempt.toLocaleDateString('pt-BR') : null
				])
			)
		);
	}
</script>

<svelte:head><title>Resultados · Spokke</title></svelte:head>

<div class="flex min-h-full flex-col">
	<header
		class="flex flex-none flex-wrap items-center gap-x-3.5 gap-y-2.5 border-b border-line px-4 py-3.5 lg:px-7 lg:py-[15px]"
	>
		<div class="min-w-0">
			<h1 class="font-display text-[18px] font-semibold tracking-[-0.02em] lg:text-[23px]">
				Resultados
			</h1>
			<p class="mt-0.75 text-[12.5px] text-base-content/65">
				{data.publishedCount}
				{data.publishedCount === 1 ? 'atividade publicada' : 'atividades publicadas'} · {data.totalAttempts}
				{data.totalAttempts === 1 ? 'tentativa' : 'tentativas'}
			</p>
		</div>
		<span class="min-w-1 flex-1"></span>
		<button
			type="button"
			onclick={exportar}
			disabled={linhas.length === 0}
			class="btn min-h-10 motion-tap gap-2 btn-plain text-[13px] font-semibold"
		>
			<svg class="size-[15px]" viewBox="0 0 24 24" fill="none" aria-hidden="true"
				><path
					d="M12 3.5v11M8 11l4 4 4-4M4.5 19.5h15"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				/></svg
			>
			CSV
		</button>
	</header>

	<div class="pagina-studio flex-1">
		{#if data.activities.length === 0}
			<div
				class="rounded-[14px] border-[1.5px] border-dashed border-line bg-base-200 p-7 text-center"
			>
				<p class="mb-1.5 font-display text-[20px] font-semibold">Nada publicado ainda</p>
				<p class="mx-auto max-w-[460px] text-[13.5px] leading-snug text-base-content/65">
					Os números aparecem aqui quando uma atividade vai ao ar e a turma começa a responder.
				</p>
			</div>
		{:else}
			<!-- resumo -->
			<div class="mb-5.5 grid grid-cols-3 gap-3.5 lg:flex lg:flex-wrap lg:gap-x-11 lg:gap-y-5">
				{#each [{ v: String(data.publishedCount), l: data.publishedCount === 1 ? 'atividade publicada' : 'atividades publicadas' }, { v: String(data.totalAttempts), l: 'tentativas no total' }, { v: data.averageCorrect === null ? '—' : `${data.averageCorrect}%`, l: 'acerto médio, pesado por tentativa' }] as r (r.l)}
					<div class="min-w-0">
						<div class="font-display text-[28px] leading-none font-extrabold tracking-[-0.025em]">
							{r.v}
						</div>
						<div class="mt-1.5 text-[12.5px] text-base-content/65">{r.l}</div>
					</div>
				{/each}
			</div>

			<!-- ferramentas -->
			<div class="mb-3.5 flex flex-wrap items-center gap-2.5">
				<label
					class="flex min-h-[42px] flex-[1_1_100%] items-center gap-2 rounded-field border-[1.5px] border-line bg-base-100 px-3 focus-within:border-primary lg:flex-[0_1_280px]"
				>
					<svg
						class="size-[15px] flex-none text-base-content/65"
						viewBox="0 0 24 24"
						fill="none"
						aria-hidden="true"
						><circle cx="11" cy="11" r="6.5" stroke="currentColor" stroke-width="2" /><path
							d="M16 16l4.5 4.5"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
						/></svg
					>
					<input
						bind:value={busca}
						placeholder="Buscar atividade"
						aria-label="Buscar atividade"
						class="min-w-0 flex-1 border-0 bg-transparent py-2.5 text-[13.5px] outline-none"
					/>
				</label>
				<div
					class="flex gap-0.75 rounded-field border border-line bg-base-200 p-0.75"
					role="group"
					aria-label="Ordenar"
				>
					{#each ORDENS as o (o.id)}
						<button
							type="button"
							onclick={() => (ordem = o.id)}
							aria-pressed={ordem === o.id}
							class="min-h-9 rounded-[8px] px-2.75 text-[12.5px] font-bold whitespace-nowrap transition-colors {ordem ===
							o.id
								? 'bg-primary text-primary-content'
								: 'text-base-content/70 hover:text-base-content'}">{o.label}</button
						>
					{/each}
				</div>
				<button
					type="button"
					onclick={() => (agrupar = !agrupar)}
					aria-pressed={agrupar}
					class="flex min-h-[42px] motion-tap items-center gap-1.75 rounded-field border px-3 text-[12.5px] font-bold whitespace-nowrap {agrupar
						? 'border-primary/40 bg-base-300 text-primary'
						: 'border-line bg-base-100 text-base-content/70'}"
				>
					<svg class="size-3.5" viewBox="0 0 24 24" fill="none" aria-hidden="true"
						><path
							d="M4 6h16M4 12h10M4 18h6"
							stroke="currentColor"
							stroke-width="2.2"
							stroke-linecap="round"
						/></svg
					>
					Agrupar por idioma
				</button>
			</div>

			<!-- cabeçalho da tabela -->
			<div
				class="hidden grid-cols-[minmax(0,1fr)_120px_260px_104px_20px] gap-4.5 px-4 pb-2 text-[11px] font-bold tracking-[0.09em] text-base-content/65 uppercase lg:grid"
			>
				<span>Atividade</span><span>Tentativas</span><span>Acerto médio</span><span>Última</span
				><span></span>
			</div>

			<div class="grid gap-4.5">
				{#each grupos as g (g.idioma ?? 'todos')}
					<div class="overflow-hidden rounded-[14px] border border-line">
						{#if g.idioma !== undefined}
							<div
								class="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-base-200 px-4 py-2.5"
							>
								<IdiomaTag tag={g.idioma} />
								<span class="text-[12.5px] text-base-content/65">{g.meta}</span>
							</div>
						{/if}
						{#each g.linhas as l (l.id)}
							{@const pouca = l.attempts > 0 && l.attempts < POUCO}
							<a
								href={l.attempts === 0
									? resolve('/(studio)/atividades/[id]', { id: l.id })
									: resolve('/(studio)/resultados/[activityId]', { activityId: l.id })}
								aria-label={l.attempts === 0
									? `${l.title}, sem tentativa ainda — abrir para mandar o link`
									: `${l.title}, ${l.attempts} ${l.attempts === 1 ? 'tentativa' : 'tentativas'}, ${l.correct}% certo, ${l.partial}% parcial, ${l.incorrect}% errado`}
								class="-mt-px grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2.5 border-t border-line p-3.5 text-base-content no-underline transition-colors hover:bg-base-200 lg:grid-cols-[minmax(0,1fr)_120px_260px_104px_20px] lg:gap-4.5 lg:px-4 lg:py-[13px]"
							>
								<span class="col-span-2 min-w-0 lg:col-span-1">
									<span class="block truncate text-[14.5px] font-semibold">{l.title}</span>
									<span
										class="mt-0.5 flex flex-wrap items-center gap-2 text-[12.5px] text-base-content/65"
									>
										{#if !agrupar}<IdiomaTag tag={l.idioma} compacta />{/if}
										<span class={agrupar ? '' : 'lg:hidden'}
											>{l.lastAttempt
												? `última tentativa ${dataCurta(l.lastAttempt)}`
												: `publicada há ${l.publishedAgo}`}</span
										>
									</span>
								</span>
								<span
									class="col-start-2 row-start-2 grid justify-items-end gap-0.75 text-end lg:col-auto lg:row-auto lg:justify-items-start lg:text-start"
								>
									<span class="font-mono text-[13.5px]"
										>{l.attempts} {l.attempts === 1 ? 'tentativa' : 'tentativas'}</span
									>
									{#if pouca}<span class="text-[11.5px] text-base-content/65">pouco para ler</span
										>{/if}
								</span>
								<span
									class="col-start-1 row-start-2 flex min-w-0 items-center gap-3 lg:col-auto lg:row-auto"
								>
									{#if l.attempts === 0}
										<span class="text-[12.5px] text-base-content/65"
											>Sem tentativa ainda. <span class="font-bold text-primary">Mandar o link</span
											></span
										>
									{:else}
										<span
											class="w-11 flex-none text-end font-display text-[18px] font-extrabold tracking-[-0.02em]"
											>{l.correct}%</span
										>
										<span class="grid min-w-0 flex-1 gap-1.25">
											<span class="flex h-2 gap-0.5" aria-hidden="true">
												{#each segmentos(l) as sg, k (k)}
													<span
														class="origin-left animate-crescer-x rounded-[3px] {sg.classe}"
														style:width="{sg.w}%"
													></span>
												{/each}
											</span>
											<span class="text-[11.5px] text-base-content/65"
												>{l.partial}% parcial · {l.incorrect}% errado</span
											>
										</span>
									{/if}
								</span>
								<span class="hidden font-mono text-[12.5px] text-base-content/65 lg:block"
									>{dataCurta(l.lastAttempt)}</span
								>
								<svg
									class="hidden size-4 text-base-content/65 lg:block"
									viewBox="0 0 24 24"
									fill="none"
									aria-hidden="true"
									><path
										d="M9 6l6 6-6 6"
										stroke="currentColor"
										stroke-width="2.2"
										stroke-linecap="round"
										stroke-linejoin="round"
									/></svg
								>
							</a>
						{/each}
					</div>
				{:else}
					<p
						class="m-0 rounded-[14px] border-[1.5px] border-dashed border-line p-5.5 text-center text-[13.5px] text-base-content/65"
					>
						Nenhuma atividade com esse nome.
					</p>
				{/each}
			</div>

			<div
				class="mt-5.5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-3.5 text-[12.5px] text-base-content/65"
			>
				<span class="flex items-center gap-1.75"
					><span class="size-2.5 rounded-[3px] bg-success"></span>certo</span
				>
				<span class="flex items-center gap-1.75"
					><span class="size-2.5 rounded-[3px] bg-warning"></span>parcial</span
				>
				<span class="flex items-center gap-1.75"
					><span class="size-2.5 rounded-[3px] bg-error"></span>errado</span
				>
				<span class="min-w-1 flex-1"></span>
				<span>Com menos de {POUCO} tentativas a porcentagem ainda oscila muito.</span>
			</div>
		{/if}
	</div>

	<footer
		class="flex flex-none flex-wrap items-center gap-x-4.5 gap-y-2 border-t border-line px-4 pt-3 pb-4 text-[12.5px] text-base-content/65 lg:px-7 lg:py-3.5"
	>
		<span>Uma atividade sem tentativa não vira número — vira um pedido para reenviar o link.</span>
		<span class="min-w-1 flex-1"></span>
		<a href={resolve('/(site)/ajuda')} class="font-semibold">Como ler estes números</a>
	</footer>
</div>
