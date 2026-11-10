<script lang="ts">
	// O calendário de envios (desenho "Studio Calendario"). Junta todos os
	// módulos e turmas num mês: cada envio na cor do MÓDULO, com a sigla da
	// TURMA; o rascunho tem contorno, o que já saiu fica neutro e o vermelho é só
	// do que não saiu. Clicar num dia abre o detalhe ao lado, com o caminho para a
	// programação daquela turma.
	//
	// No celular a grade do mês não cabe com leitura: a página mostra a lista do
	// mês, dia a dia — por CSS, para o servidor não desenhar uma e o navegador
	// trocar pela outra. As programações pausadas ficam fora, e a tela diz quais.
	import { resolve } from '$app/paths';
	import { CLASSE_DA_ETIQUETA } from '$lib/etiquetas';
	import {
		diaPorExtenso,
		gradeDoMes,
		nomeDoMes,
		porDia,
		rotuloDoDia,
		somarMesesAoMes,
		type EventoDeEnvio
	} from '$lib/modulos/agenda';
	import { TEXTO_DO_MOTIVO } from '$lib/modulos/estado';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// Os derived graváveis seguem VALORES do loader, não `data` inteiro: a escolha
	// do professor não volta sozinha quando os dados recarregam.
	const mesDoLink = $derived(data.mes);
	let mes = $derived(mesDoLink);
	const diaInicial = $derived(data.hoje.startsWith(data.mes) ? data.hoje : `${data.mes}-01`);
	let selecionado = $derived(diaInicial);
	let vis = $state<'mes' | 'lista'>('mes');
	const moduloDoLink = $derived(data.moduloInicial);
	/** Módulos DESLIGADOS no filtro. Vindo de um módulo, só ele fica ligado. */
	let ocultos = $derived<Record<string, boolean>>(
		moduloDoLink
			? Object.fromEntries(
					data.modulos.filter((m) => m.id !== moduloDoLink).map((m) => [m.id, true])
				)
			: {}
	);
	let turma = $state('');
	let enviados = $state(true);

	const filtrados = $derived(
		data.eventos.filter(
			(e) =>
				!ocultos[e.modulo.id] &&
				(!turma || e.turma.id === turma) &&
				(enviados || e.estado !== 'enviada')
		)
	);
	const mapa = $derived(porDia(filtrados));
	const grade = $derived(gradeDoMes(mes, mapa, data.hoje));
	const doMes = $derived(filtrados.filter((e) => e.dia.startsWith(mes)));
	const resumo = $derived.by(() => {
		const prog = doMes.filter((e) => e.estado === 'programada' || e.estado === 'rascunho').length;
		const env = doMes.filter((e) => e.estado === 'enviada').length;
		const falha = doMes.filter((e) => e.estado === 'nao_saiu').length;
		return `${prog} ${prog === 1 ? 'programado' : 'programados'} · ${env} ${env === 1 ? 'enviado' : 'enviados'}${falha ? ` · ${falha} com problema` : ''}`;
	});
	const agenda = $derived.by(() => {
		const dias: { dia: string; itens: EventoDeEnvio[] }[] = [];
		for (const e of doMes) {
			const ultimo = dias.at(-1);
			if (ultimo?.dia === e.dia) ultimo.itens.push(e);
			else dias.push({ dia: e.dia, itens: [e] });
		}
		return dias;
	});
	const doDia = $derived(mapa[selecionado] ?? []);

	// Até onde dá para andar: do primeiro ao último mês com envio, sempre
	// incluindo o mês de hoje.
	const mesDeHoje = $derived(data.hoje.slice(0, 7));
	const limites = $derived.by(() => {
		const meses = data.eventos.map((e) => e.dia.slice(0, 7)).concat(mesDeHoje);
		return {
			min: meses.reduce((a, b) => (b < a ? b : a)),
			max: meses.reduce((a, b) => (b > a ? b : a))
		};
	});
	function irPara(novo: string) {
		mes = novo;
		selecionado = data.hoje.startsWith(novo) ? data.hoje : `${novo}-01`;
	}
	function voltarParaHoje() {
		mes = mesDeHoje;
		selecionado = data.hoje;
	}

	function alternarModulo(id: string) {
		ocultos = { ...ocultos, [id]: !ocultos[id] };
	}

	/** Na grade, um selo por turma e estado no dia: duas atividades da mesma turma são um e-mail. */
	function selos(eventos: EventoDeEnvio[]) {
		const grupos: Record<string, EventoDeEnvio[]> = {};
		for (const e of eventos) (grupos[`${e.alocacaoId}:${e.estado}`] ??= []).push(e);
		return Object.entries(grupos).map(([chave, lista]) => ({
			chave,
			e: lista[0],
			n: lista.length
		}));
	}
	const MAX_SELOS = 3;

	function classeDoSelo(e: EventoDeEnvio): string {
		if (e.estado === 'nao_saiu') return 'bg-error text-error-content';
		if (e.estado === 'enviada')
			return 'bg-base-200 text-base-content/65 ring-1 ring-line ring-inset';
		if (e.estado === 'rascunho')
			return `${CLASSE_DA_ETIQUETA[e.modulo.cor]} ring-[1.5px] ring-base-content/55 ring-inset`;
		return CLASSE_DA_ETIQUETA[e.modulo.cor];
	}

	const ICONE = {
		programada: 'M12 7.5V12l3 2M12 20.5a8.5 8.5 0 100-17 8.5 8.5 0 000 17z',
		enviada: 'M5 12.5l4.5 4.5L19 7',
		nao_saiu: 'M12 7.5v6M12 16.5h.01M12 3l9.5 17H2.5z',
		rascunho: 'M5 19h3l10-10-3-3L5 16z'
	};
	const PILULA: Record<EventoDeEnvio['estado'], { texto: string; classe: string }> = {
		programada: { texto: 'Programada', classe: 'bg-base-300 text-primary' },
		enviada: { texto: 'Liberada', classe: 'border border-line bg-base-100 text-base-content/65' },
		nao_saiu: { texto: 'Não liberada', classe: 'bg-error text-error-content' },
		rascunho: {
			texto: 'Ainda é rascunho',
			classe: 'border-[1.5px] border-dashed border-base-content/55 bg-base-100 text-base-content'
		}
	};
	function detalhe(e: EventoDeEnvio): string {
		if (e.estado === 'nao_saiu') return e.motivo ? TEXTO_DO_MOTIVO[e.motivo] : 'não pôde abrir';
		if (e.estado === 'rascunho')
			return e.motivo === 'arquivada' ? 'está arquivada' : 'publique até a véspera';
		// Módulo LIBERA no mapa do aluno; não há e-mail para contar.
		return e.estado === 'enviada' ? 'liberada no mapa' : 'abre no mapa';
	}
	const linha = (e: EventoDeEnvio) => `${e.modulo.nome} · ${e.turma.nome} · ${e.hora}`;
	const hrefDe = (e: EventoDeEnvio) =>
		resolve('/(studio)/modulos/[id]', { id: e.modulo.id }) + '?turma=' + e.alocacaoId;

	const LEGENDA = [
		{ classe: 'bg-base-300', texto: 'programado, na cor do módulo' },
		{
			classe: 'bg-base-300 ring-[1.5px] ring-base-content/55 ring-inset',
			texto: 'programado, mas ainda é rascunho'
		},
		{ classe: 'bg-base-200 ring-1 ring-line ring-inset', texto: 'já liberado' },
		{ classe: 'bg-error', texto: 'não liberada' }
	];
	const CABECALHO = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
</script>

<svelte:head><title>Calendário · Módulos · Spokke</title></svelte:head>

{#snippet icone(d: string, classe = 'size-3')}
	<svg class="{classe} flex-none" viewBox="0 0 24 24" fill="none" aria-hidden="true"
		><path
			{d}
			stroke="currentColor"
			stroke-width="2.4"
			stroke-linecap="round"
			stroke-linejoin="round"
		/></svg
	>
{/snippet}

{#snippet item(e: EventoDeEnvio, compacto: boolean)}
	{@const P = PILULA[e.estado]}
	<!-- eslint-disable svelte/no-navigation-without-resolve -- rota resolvida em hrefDe, mais a query que abre o painel da turma. -->
	<a
		href={hrefDe(e)}
		class="motion-tap text-base-content no-underline transition-[border-color,background-color] duration-150 hover:border-primary {compacto
			? 'grid gap-1.75 rounded-[11px] border border-line bg-base-200 px-3 py-2.75'
			: 'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[12px] border border-line px-3.5 py-3 hover:bg-base-200'}"
	>
		<!-- eslint-enable svelte/no-navigation-without-resolve -->
		{#if compacto}
			<span class="flex items-center gap-2">
				<span
					class="grid size-7 flex-none place-items-center rounded-[8px] text-[10.5px] font-bold {CLASSE_DA_ETIQUETA[
						e.modulo.cor
					]}">{e.modulo.sigla}</span
				>
				<span class="min-w-0 flex-1 text-[12.5px] text-base-content/65">{linha(e)}</span>
			</span>
			<span class="text-[13.5px] leading-snug font-semibold">{e.atividade.titulo}</span>
		{:else}
			<span
				class="grid size-8.5 flex-none place-items-center rounded-[9px] text-[11.5px] font-bold {CLASSE_DA_ETIQUETA[
					e.modulo.cor
				]}">{e.modulo.sigla}</span
			>
			<span class="min-w-[160px] flex-1">
				<span class="mb-0.5 block text-[14px] font-semibold">{e.atividade.titulo}</span>
				<span class="block text-[12.5px] text-base-content/65">{linha(e)}</span>
			</span>
		{/if}
		<span class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
			<span
				class="inline-flex flex-none items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-bold whitespace-nowrap {P.classe}"
			>
				{@render icone(ICONE[e.estado])}
				{P.texto}
			</span>
			{#if compacto}<span class="text-[12px] text-base-content/65">{detalhe(e)}</span>{/if}
		</span>
	</a>
{/snippet}

{#snippet foraDoCalendario()}
	{#if data.pausadas.length > 0}
		<div class="rounded-[14px] border border-dashed border-line px-4 py-3.5">
			<p class="mb-1.5 flex items-center gap-2 text-[13px] font-bold">
				<svg
					class="size-3.5 flex-none text-base-content/65"
					viewBox="0 0 24 24"
					fill="none"
					aria-hidden="true"
					><path
						d="M9 6v12M15 6v12"
						stroke="currentColor"
						stroke-width="2.2"
						stroke-linecap="round"
					/></svg
				>
				Fora do calendário
			</p>
			<p class="text-[12.5px] leading-relaxed text-pretty text-base-content/65">
				{#each data.pausadas as p, i (p.alocacaoId)}<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- rota resolvida mais a query do painel. --><a
						href={resolve('/(studio)/modulos/[id]', { id: p.moduloId }) + '?turma=' + p.alocacaoId}
						class="font-semibold text-base-content">{p.modulo} no {p.turma}</a
					>{i < data.pausadas.length - 2
						? ', '
						: i === data.pausadas.length - 2
							? ' e '
							: ''}{/each}
				{data.pausadas.length === 1 ? 'está pausado' : 'estão pausados'}{data.pausadas.length === 1
					? ` desde ${data.pausadas[0].desde}`
					: ''}. Nada {data.pausadas.length === 1 ? 'dele' : 'deles'} aparece aqui até você retomar.
			</p>
		</div>
	{/if}
{/snippet}

<div class="pagina-studio">
	<a
		href={resolve('/(studio)/modulos')}
		class="mb-4 inline-flex items-center gap-2 py-1 text-[0.84rem] font-semibold text-base-content/65 no-underline transition-transform hover:-translate-x-0.5"
	>
		{@render icone('M15 5l-7 7 7 7', 'size-4')}
		Módulos
	</a>

	<!-- cabeçalho do mês -->
	<div class="mb-4 flex flex-wrap items-center gap-x-3.5 gap-y-3">
		<div class="min-w-[200px] flex-1">
			<h1 class="mb-1 font-display text-[22px] font-semibold tracking-[-0.024em] lg:text-[28px]">
				{nomeDoMes(mes)}
			</h1>
			<p class="text-[13px] text-base-content/65" aria-live="polite">{resumo}</p>
		</div>
		<div class="flex items-center gap-1.5">
			<button
				type="button"
				onclick={() => irPara(somarMesesAoMes(mes, -1))}
				disabled={mes <= limites.min}
				aria-label="Mês anterior"
				class="grid size-[42px] motion-tap place-items-center rounded-field border border-line bg-base-100 hover:bg-base-200 disabled:opacity-40"
			>
				{@render icone('M15 5l-7 7 7 7', 'size-4')}
			</button>
			<button
				type="button"
				onclick={voltarParaHoje}
				class="h-[42px] motion-tap rounded-field border border-line bg-base-100 px-3.5 text-[13px] font-bold hover:bg-base-200"
				>Hoje</button
			>
			<button
				type="button"
				onclick={() => irPara(somarMesesAoMes(mes, 1))}
				disabled={mes >= limites.max}
				aria-label="Próximo mês"
				class="grid size-[42px] motion-tap place-items-center rounded-field border border-line bg-base-100 hover:bg-base-200 disabled:opacity-40"
			>
				{@render icone('M9 5l7 7-7 7', 'size-4')}
			</button>
		</div>
		<div
			class="hidden gap-0.75 rounded-field border border-line bg-base-200 p-0.75 lg:flex"
			role="group"
			aria-label="Visualização"
		>
			{#each [{ id: 'mes' as const, rotulo: 'Mês' }, { id: 'lista' as const, rotulo: 'Lista' }] as v (v.id)}
				<button
					type="button"
					onclick={() => (vis = v.id)}
					aria-pressed={vis === v.id}
					class="min-h-9 rounded-[8px] px-3.25 text-[12.5px] font-bold {vis === v.id
						? 'bg-primary text-primary-content'
						: 'text-base-content/65'}">{v.rotulo}</button
				>
			{/each}
		</div>
	</div>

	{#if data.eventos.length === 0 && data.pausadas.length === 0}
		<div class="rounded-[14px] border-[1.5px] border-dashed border-line px-5 py-7 text-center">
			<p class="mb-1.5 text-[15px] font-bold">Nada programado ainda</p>
			<p class="mx-auto mb-4 max-w-[56ch] text-[13.5px] leading-relaxed text-base-content/65">
				O calendário mostra os envios dos seus módulos. Abra um módulo, adicione uma turma e
				programe quando cada atividade sai.
			</p>
			<a
				href={resolve('/(studio)/modulos')}
				class="btn min-h-11 motion-tap btn-primary text-[13.5px] font-bold no-underline"
				>Ir para os módulos</a
			>
		</div>
	{:else}
		<!-- filtros: valem para a grade e para a lista -->
		<div class="mb-4.5 flex flex-wrap items-center gap-2">
			<div
				class="-mx-4 flex flex-[1_1_100%] gap-1.5 overflow-x-auto px-4 pb-0.5 lg:mx-0 lg:flex-none lg:flex-wrap lg:overflow-visible lg:px-0 lg:pb-0"
				role="group"
				aria-label="Módulos"
			>
				{#each data.modulos as m (m.id)}
					<button
						type="button"
						onclick={() => alternarModulo(m.id)}
						aria-pressed={!ocultos[m.id]}
						class="flex min-h-[38px] flex-none motion-tap items-center gap-1.75 rounded-full border py-1.25 ps-1.25 pe-3 text-[12.5px] font-bold whitespace-nowrap transition-opacity {ocultos[
							m.id
						]
							? 'border-line bg-base-200 text-base-content/65 opacity-70'
							: 'border-primary/45 bg-base-100 text-base-content'}"
					>
						<span
							class="grid size-6.5 place-items-center rounded-full text-[10.5px] font-bold {CLASSE_DA_ETIQUETA[
								m.cor
							]}">{m.sigla}</span
						>
						{m.nome}
					</button>
				{/each}
			</div>
			<span class="hidden min-w-1 flex-1 lg:block"></span>
			<select
				bind:value={turma}
				aria-label="Turma"
				class="select min-h-10 flex-[1_1_100%] text-[13px] lg:w-auto lg:flex-none"
			>
				<option value="">Todas as turmas</option>
				{#each data.turmas as t (t.id)}
					<option value={t.id}>{t.nome}</option>
				{/each}
			</select>
			<label class="flex min-h-10 cursor-pointer items-center gap-2 text-[13px]">
				<input type="checkbox" bind:checked={enviados} class="checkbox checkbox-primary" />
				Mostrar enviados
			</label>
		</div>

		<div
			class={vis === 'mes'
				? 'lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start lg:gap-5.5'
				: ''}
		>
			<!-- grade do mês (só no desktop) -->
			{#if vis === 'mes'}
				<div class="hidden min-w-0 overflow-hidden rounded-[14px] border border-line lg:block">
					<div class="grid grid-cols-7 border-b border-line bg-base-200" aria-hidden="true">
						{#each CABECALHO as h (h)}
							<span
								class="px-2.5 py-2.25 text-[11px] font-bold tracking-[0.09em] text-base-content/65 uppercase"
								>{h}</span
							>
						{/each}
					</div>
					<div class="grid grid-cols-7">
						{#each grade as c (c.dia)}
							{@const lista = selos(c.eventos)}
							<button
								type="button"
								onclick={() => (selecionado = c.dia)}
								disabled={c.fora}
								aria-pressed={!c.fora && c.dia === selecionado}
								aria-label="{diaPorExtenso(c.dia)}, {c.eventos.length === 0
									? 'nada abre'
									: `${c.eventos.length} ${c.eventos.length === 1 ? 'liberação' : 'liberações'}`}"
								class="flex min-h-[116px] min-w-0 flex-col items-stretch gap-1 border-e border-b border-line p-1.75 text-start transition-colors duration-150 [&:nth-child(7n)]:border-e-0 {c.fora
									? 'cursor-default bg-base-200 opacity-55'
									: c.dia === selecionado
										? 'bg-[color-mix(in_oklab,var(--color-primary)_7%,var(--color-base-100))] ring-2 ring-primary ring-inset'
										: 'bg-base-100 hover:bg-base-200'}"
							>
								<span
									class="grid size-6.5 place-items-center rounded-full text-[12.5px] font-bold {c.hoje
										? 'bg-primary text-primary-content'
										: c.fora
											? 'text-base-content/65'
											: ''}">{c.numero}</span
								>
								{#each lista.slice(0, MAX_SELOS) as s (s.chave)}
									<span
										class="flex min-w-0 items-center gap-1.25 rounded-[6px] px-1.5 py-0.75 text-[11.5px] font-bold {classeDoSelo(
											s.e
										)}"
									>
										<span class="flex-none font-mono font-medium">{s.e.turma.sigla}</span>
										<span class="min-w-0 truncate"
											>{s.e.modulo.nome}{s.n > 1 ? ` ×${s.n}` : ''}</span
										>
									</span>
								{/each}
								{#if lista.length > MAX_SELOS}
									<span class="px-1 text-[11.5px] font-semibold text-base-content/65"
										>+{lista.length - MAX_SELOS} mais</span
									>
								{/if}
							</button>
						{/each}
					</div>
				</div>
			{/if}

			<!-- lista do mês: sempre no celular; no desktop, quando escolhida -->
			<div class="grid min-w-0 gap-4 {vis === 'mes' ? 'lg:hidden' : ''}">
				{#each agenda as g (g.dia)}
					<section>
						<h2
							class="mb-2 flex items-baseline gap-2 text-[13px] font-bold {g.dia === data.hoje
								? 'text-primary'
								: ''}"
						>
							{rotuloDoDia(g.dia)}
							<span class="font-medium text-base-content/65"
								>{g.dia === data.hoje
									? 'hoje'
									: `${g.itens.length} ${g.itens.length === 1 ? 'liberação' : 'liberações'}`}</span
							>
						</h2>
						<div class="grid gap-2">
							{#each g.itens as e (e.id)}
								{@render item(e, false)}
							{/each}
						</div>
					</section>
				{:else}
					<p
						class="rounded-[14px] border-[1.5px] border-dashed border-line p-5.5 text-center text-[13.5px] text-base-content/65"
					>
						Nenhum envio neste mês com esses filtros.
					</p>
				{/each}
				<div class="lg:hidden">{@render foraDoCalendario()}</div>
			</div>

			<!-- o dia escolhido -->
			{#if vis === 'mes'}
				<aside class="hidden min-w-0 content-start gap-4 lg:grid">
					{#key selecionado}
						<div
							class="animate-entrada-curta rounded-[14px] border border-line p-4"
							aria-live="polite"
						>
							<p
								class="mb-1 text-[11px] font-bold tracking-[0.09em] text-base-content/65 uppercase"
							>
								{selecionado === data.hoje ? 'Hoje' : 'Dia escolhido'}
							</p>
							<p class="mb-3.5 font-display text-[20px] font-semibold tracking-[-0.02em]">
								{diaPorExtenso(selecionado)}
							</p>
							<div class="grid gap-2">
								{#each doDia as e (e.id)}
									{@render item(e, true)}
								{:else}
									<p class="text-[13px] leading-normal text-base-content/65">Nada sai neste dia.</p>
								{/each}
							</div>
						</div>
					{/key}
					{@render foraDoCalendario()}
					<ul class="grid list-none gap-1.75 p-0 text-[12.5px] text-base-content/65">
						{#each LEGENDA as l (l.texto)}
							<li class="flex items-center gap-2">
								<span class="h-3 w-5.5 flex-none rounded-[4px] {l.classe}"></span>{l.texto}
							</li>
						{/each}
					</ul>
				</aside>
			{/if}
		</div>
	{/if}
</div>
