<script lang="ts">
	// O INÍCIO do Studio (o desenho "Studio Dashboard", 1b — "mapa da conta"):
	// uma peça por área, em grade. A semana abre a página com os números e as
	// tentativas por dia; ao lado, as últimas tentativas dos alunos; depois uma
	// peça por área — atividades, módulos, turmas, resultados, materiais e
	// assinatura —, cada uma com o número principal, um detalhe visual próprio e
	// uma linha de contexto. Tudo é LEITURA: cada peça leva à tela da área, onde
	// as ações moram (paginas.md "Início").
	//
	// Celular: uma coluna. Tablet: duas, com a semana e as tentativas em largura
	// inteira. A partir de `xl` (1280px, onde a coluna do conteúdo passa de
	// ~1000px ao lado da barra lateral), a grade de doze do desenho.
	import { resolve } from '$app/paths';
	import Avatar from '$lib/components/Avatar.svelte';
	import { CLASSE_DA_ETIQUETA } from '$lib/etiquetas';
	import { NOME_DO_PLANO } from '$lib/billing/catalogo';
	import { fracaoDeUso } from '$lib/billing/resumo';
	import { descricaoDasBarras, type MarcaDoDia } from '$lib/inicio/semana';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const p = $derived(data.painel);
	const acesso = $derived(data.acesso);

	const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
	const ddmm = (d: Date | string) =>
		new Date(d).toLocaleDateString('pt-BR', {
			day: '2-digit',
			month: '2-digit',
			timeZone: 'America/Sao_Paulo'
		});

	// ── o topo ──
	// "Criar com IA" só quando ela existe E o plano deixa — um botão principal que
	// leva a "não disponível no seu plano" é pior que nenhum. Sem ela, o principal
	// é criar atividade, que no celular não tem outro botão à vista.
	const comIa = $derived(data.iaConfigurada && acesso.pode.usarIa);

	// ── a semana ──
	const MARCA: Record<Exclude<MarcaDoDia, null>, { titulo: string; d: string; classe: string }> = {
		hoje: { titulo: 'hoje', d: 'M12 6v6l4 2', classe: 'bg-primary text-primary-content' },
		pico: {
			titulo: 'dia mais movimentado',
			d: 'M5 15l7-7 7 7',
			classe: 'bg-base-300 text-primary'
		},
		envio: {
			titulo: 'dia com envio',
			d: 'M3.5 12l17-7.5-3 17-6-5z',
			classe: 'border border-line bg-base-100 text-base-content/60'
		}
	};
	// A legenda só explica marca que está na tela: "dia com envio" numa semana sem
	// envio é uma regra a decorar para nada.
	const legenda = $derived(
		(['hoje', 'pico', 'envio'] as const).filter((m) => p.semana.barras.some((b) => b.marca === m))
	);
	const kpis = $derived([
		{
			valor: String(p.semana.naFila),
			rotulo: p.semana.naFila === 1 ? 'envio na fila' : 'envios na fila',
			d: 'M12 3.5l8.5 4.5-8.5 4.5L3.5 8zM3.5 12.5l8.5 4.5 8.5-4.5M3.5 16.5l8.5 4.5 8.5-4.5',
			classe: 'bg-base-300 text-primary'
		},
		{
			valor: String(p.semana.tentativas),
			rotulo: p.semana.tentativas === 1 ? 'tentativa' : 'tentativas',
			d: 'M7 5v14l11-7z',
			classe: 'bg-info/13 text-info'
		},
		{
			valor: p.semana.acerto === null ? '—' : `${p.semana.acerto}%`,
			rotulo: 'acerto na semana',
			d: 'M5 12.5l4.5 4.5L19 7',
			classe: 'bg-success/13 text-success'
		}
	]);

	// ── as tentativas ──
	const ESTADO = {
		corrigir: { texto: 'para corrigir', classe: 'font-semibold text-warning' },
		andamento: { texto: 'em andamento', classe: 'text-base-content/60' },
		terminou: { texto: 'terminou', classe: 'text-base-content/60' }
	} as const;

	// ── as peças ──
	const ESTADO_DA_ATIVIDADE = {
		rascunho: 'rascunho',
		'no-ar': 'no ar',
		mudancas: 'mudanças por publicar',
		arquivada: 'arquivada'
	} as const;

	const rodapeAtividades = $derived.by(() => {
		const { noAr, rascunhos, arquivadas, ultimas } = p.atividades;
		if (noAr + rascunhos + arquivadas === 0)
			return 'Nenhuma atividade ainda. Comece pelas frases que você já usa em aula.';
		const partes = [
			rascunhos > 0 ? plural(rascunhos, 'rascunho', 'rascunhos') : null,
			arquivadas > 0 ? plural(arquivadas, 'arquivada', 'arquivadas') : null
		].filter(Boolean);
		const conta = partes.length ? ` ${partes.join(', ')}.` : '';
		return ultimas.length ? `Editadas por último.${conta}` : `Todas arquivadas.`;
	});

	// Os quatro grupos da barra de módulos, na ordem do desenho. Vermelho só no
	// envio que não saiu — a mesma regra da lista de módulos.
	const gruposDeModulo = $derived(
		[
			{
				n: p.modulos.grupos.programado,
				texto: (n: number) => (n === 1 ? 'programado' : 'programados'),
				classe: 'bg-primary'
			},
			{
				n: p.modulos.grupos.erro,
				texto: () => 'com envio que não saiu',
				classe: 'bg-error'
			},
			{
				n: p.modulos.grupos.parado,
				texto: (n: number) => (n === 1 ? 'pausado ou concluído' : 'pausados ou concluídos'),
				classe: 'bg-base-content/45'
			},
			{
				n: p.modulos.grupos.sem,
				texto: () => 'sem programação',
				classe: 'bg-base-300'
			}
		].filter((g) => g.n > 0)
	);
	const rodapeModulos = $derived.by(() => {
		const { total, grupos, proximo } = p.modulos;
		if (total === 0) return 'Junte atividades numa sequência e programe o envio para uma turma.';
		if (grupos.erro > 0)
			return grupos.erro === 1
				? 'Um módulo tem envio que não saiu. Abra Módulos para resolver.'
				: `${grupos.erro} módulos têm envio que não saiu. Abra Módulos para resolver.`;
		if (proximo)
			return `Próximo envio: ${proximo.quando}, ${proximo.atividade} para ${proximo.turma}.`;
		return 'Nenhum envio programado.';
	});

	const rodapeTurmas = $derived.by(() => {
		const { total, alunos, comEmail, semEmail, vazia } = p.turmas;
		if (total === 0)
			return 'Cadastre a turma para mandar atividades por e-mail. O link aberto funciona sem isso.';
		if (alunos === 0) return 'Nenhum aluno cadastrado ainda.';
		const recebem = `${comEmail} ${comEmail === 1 ? 'aluno recebe' : 'alunos recebem'} e-mail.`;
		if (semEmail) return `${recebem} Ninguém em ${semEmail} tem e-mail ainda.`;
		if (vazia) return `${recebem} ${vazia} ainda não tem alunos.`;
		return recebem;
	});

	const rodapeResultados = $derived.by(() => {
		const { tentativas, atividades, menor } = p.resultados;
		if (tentativas === 0)
			return 'Publique uma atividade e mande o link para a turma: o acerto aparece aqui.';
		const base = `${plural(tentativas, 'tentativa', 'tentativas')} em ${plural(atividades, 'atividade', 'atividades')}.`;
		return menor ? `${base} Menor acerto: ${menor}.` : base;
	});

	const rodapeMateriais = $derived.by(() => {
		if (p.materiais.total === 0)
			return 'Frases, vocabulário, textos e diálogos viram exercício. Comece pela biblioteca.';
		const vagas = acesso.limites.materiais - acesso.uso.materiais;
		if (vagas <= 0) return 'Chegou ao limite do plano. Nada foi apagado, só não cabe outro.';
		return `Cabem mais ${vagas} no seu plano.`;
	});

	// A assinatura: o nome curto do plano no lugar do número, e UMA barra — os
	// créditos quando o plano tem IA, senão as atividades, que é o limite que trava
	// primeiro. As duas barras de estoque já estão no cartão da barra lateral.
	const plano = $derived.by(() => {
		if (acesso.origem === 'trial') {
			const d = acesso.diasDeTrial ?? 0;
			return { nome: 'Teste', sub: d === 1 ? 'falta 1 dia' : `faltam ${d} dias` };
		}
		if (acesso.origem === 'escola')
			return { nome: NOME_DO_PLANO.scholar, sub: acesso.escola?.nome ?? 'plano da escola' };
		if (!acesso.plano) return { nome: 'Sem plano', sub: 'criar e publicar pausados' };
		const sub =
			acesso.situacao === 'atrasada'
				? 'pagamento pendente'
				: acesso.situacao === 'ativa'
					? acesso.cancelAtPeriodEnd
						? 'encerra no fim do período'
						: 'em dia'
					: 'pausado';
		return { nome: NOME_DO_PLANO[acesso.plano], sub };
	});
	const barraDoPlano = $derived.by(() => {
		if (acesso.limites.ia) {
			const franquia = acesso.limites.creditosPorCiclo;
			const usados = Math.max(0, franquia - acesso.creditos.saldo);
			return {
				fracao: fracaoDeUso(usados, franquia),
				texto: `${usados} de ${franquia} créditos de IA usados neste ciclo`
			};
		}
		return {
			fracao: fracaoDeUso(acesso.uso.atividades, acesso.limites.atividades),
			texto: `${acesso.uso.atividades} de ${acesso.limites.atividades} atividades no plano`
		};
	});
	const rodapePlano = $derived.by(() => {
		if (acesso.origem === 'trial')
			return acesso.trialEndsAt
				? `O teste termina em ${ddmm(acesso.trialEndsAt)}. Depois, criar e publicar param até você escolher um plano.`
				: 'Depois do teste, criar e publicar param até você escolher um plano.';
		if (acesso.origem === 'escola')
			return 'Pelo contrato da escola, com os limites que ela definiu.';
		if (acesso.situacao === 'atrasada')
			return 'Pagamento pendente. Criar e publicar param se não for resolvido.';
		if (acesso.situacao !== 'ativa' || !acesso.plano)
			return 'Os links continuam no ar. Escolha um plano para voltar a criar.';
		if (acesso.cancelAtPeriodEnd && acesso.currentPeriodEnd)
			return `Encerra em ${ddmm(acesso.currentPeriodEnd)}. Os links continuam no ar.`;
		return acesso.currentPeriodEnd ? `Renova em ${ddmm(acesso.currentPeriodEnd)}.` : 'Plano ativo.';
	});

	// O cartão de cada área é um link inteiro, e precisa parecer um: o hover
	// padrão de cartão (`cartao-interativo`, app.css).
	const PECA =
		'flex min-w-0 flex-col gap-3 rounded-[18px] border border-line p-4.5 text-base-content no-underline cartao-interativo hover:text-base-content';
</script>

<svelte:head><title>Início — entendo</title></svelte:head>

{#snippet icone(d: string, classe = 'size-4', traco = '2')}
	<svg class="{classe} flex-none" viewBox="0 0 24 24" fill="none" aria-hidden="true"
		><path
			{d}
			stroke="currentColor"
			stroke-width={traco}
			stroke-linecap="round"
			stroke-linejoin="round"
		/></svg
	>
{/snippet}

{#snippet cabecaDaPeca(rotulo: string, d: string)}
	<span class="flex items-center gap-[9px]">
		<span class="grid size-8 flex-none place-items-center rounded-[9px] bg-base-300 text-primary">
			{@render icone(d)}
		</span>
		<span class="flex-1 text-[14.5px] font-bold">{rotulo}</span>
		{@render icone('M9 6l6 6-6 6', 'size-[15px] text-base-content/50', '2.2')}
	</span>
{/snippet}

{#snippet numeroDaPeca(valor: string, sub: string)}
	<span class="flex min-w-0 items-baseline gap-2">
		<span class="font-display text-[32px] leading-none font-extrabold tracking-[-0.03em]"
			>{valor}</span
		>
		<span class="min-w-0 truncate text-[13px] text-base-content/65">{sub}</span>
	</span>
{/snippet}

{#snippet rodapeDaPeca(texto: string)}
	<span class="flex-1"></span>
	<span class="text-[12.5px] leading-normal text-pretty text-base-content/65">{texto}</span>
{/snippet}

<div class="pagina-studio">
	<!-- O topo: o dia, o cumprimento e as duas criações que não têm botão na barra lateral. -->
	<div class="mb-6 flex flex-wrap items-end gap-x-4 gap-y-3.5">
		<div class="min-w-[220px] flex-1">
			<p class="mb-1 text-[13px] text-base-content/65">{p.hoje}</p>
			<h1
				class="font-display text-[25px] leading-[1.1] font-semibold tracking-[-0.026em] lg:text-[32px]"
			>
				{p.saudacao}, {data.primeiroNome}
			</h1>
		</div>
		<!-- eslint-disable svelte/no-navigation-without-resolve -- é a rota resolvida mais a query que abre a criação; a regra não enxerga a concatenação. -->
		<div class="flex flex-[1_1_100%] gap-2 sm:flex-none">
			<a
				href={resolve('/(studio)/modulos') + '?novo=1'}
				class="btn min-h-11 flex-1 motion-tap gap-2 btn-outline text-[13.5px] font-semibold whitespace-nowrap no-underline"
			>
				{@render icone(
					'M12 3.5l8.5 4.5-8.5 4.5L3.5 8zM3.5 12.5l8.5 4.5 8.5-4.5M3.5 16.5l8.5 4.5 8.5-4.5',
					'size-[15px]'
				)}
				Novo módulo
			</a>
			{#if comIa}
				<a
					href={resolve('/(studio)/materiais') + '?novo=ia'}
					class="btn min-h-11 flex-1 motion-tap gap-2 btn-primary text-[13.5px] font-bold whitespace-nowrap no-underline"
				>
					{@render icone(
						'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z',
						'size-[15px]',
						'1.9'
					)}
					Criar com IA
				</a>
			{:else}
				<a
					href={resolve('/(studio)/atividades/nova')}
					class="btn min-h-11 flex-1 motion-tap gap-2 btn-primary text-[13.5px] font-bold whitespace-nowrap no-underline"
				>
					{@render icone('M12 5v14M5 12h14', 'size-[15px]', '2.2')}
					Nova atividade
				</a>
			{/if}
		</div>
		<!-- eslint-enable svelte/no-navigation-without-resolve -->
	</div>

	<div
		class="grid animate-entrada-curta grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-12 xl:gap-3.5"
	>
		<!-- A semana: os três números e as tentativas por dia. Sem formas de
		     ambiente: o cartão é gráfico e legenda de ponta a ponta, e não há canto
		     sem texto onde elas caibam (design-system.md "Formas de ambiente"). -->
		<section
			class="rounded-[18px] border border-line bg-base-200 px-4.5 py-5 md:col-span-2 lg:px-5.5 xl:col-span-8"
			aria-labelledby="titulo-semana"
		>
			<div>
				<div class="mb-4 flex flex-wrap items-baseline gap-x-3.5 gap-y-1.5">
					<h2 id="titulo-semana" class="font-display text-[20px] font-semibold tracking-[-0.015em]">
						Esta semana
					</h2>
					<span class="text-[13px] text-base-content/65">{p.semana.rotulo}</span>
					<span class="min-w-1 flex-1"></span>
					<a
						href={resolve('/(studio)/modulos/calendario')}
						class="text-[13px] font-bold text-primary no-underline">Calendário</a
					>
				</div>

				<!-- Três números, três colunas em qualquer largura: com `auto-fit` o
				     terceiro caía sozinho numa linha no celular. Lá o ícone sai. -->
				<div class="mb-4.5 grid grid-cols-3 gap-2 sm:gap-2.5">
					{#each kpis as k (k.rotulo)}
						<div
							class="flex min-w-0 items-start gap-2.5 rounded-[13px] border border-line bg-base-100 p-2.5 sm:p-3"
						>
							<span
								class="grid size-[34px] flex-none place-items-center rounded-[10px] max-sm:hidden {k.classe}"
							>
								{@render icone(k.d, 'size-[18px]')}
							</span>
							<span class="min-w-0 flex-1">
								<span
									class="block font-display text-[24px] leading-none font-extrabold tracking-[-0.03em]"
									>{k.valor}</span
								>
								<span
									class="mt-[5px] block text-[12px] leading-snug text-pretty [overflow-wrap:anywhere] text-base-content/65"
									>{k.rotulo}</span
								>
							</span>
						</div>
					{/each}
				</div>

				<!-- O gráfico se anuncia por texto: as barras são desenho. -->
				<div
					class="grid h-[150px] grid-cols-7 items-end gap-1.5 sm:gap-2"
					role="img"
					aria-label={descricaoDasBarras(p.semana.barras)}
				>
					{#each p.semana.barras as b (b.dia)}
						<div class="flex h-full min-w-0 flex-col items-center justify-end gap-1.5">
							{#if b.marca}
								<span
									class="grid size-[22px] place-items-center rounded-full {MARCA[b.marca].classe}"
									title={MARCA[b.marca].titulo}
								>
									{@render icone(MARCA[b.marca].d, 'size-3', '2.4')}
								</span>
							{/if}
							<span class="font-mono text-[11.5px] text-base-content/65">{b.tentativas}</span>
							<span
								class="w-full max-w-12 origin-bottom animate-crescer-y rounded-[7px_7px_3px_3px]
								       {b.hoje
									? 'bg-primary'
									: b.tentativas > 0
										? 'bg-[color-mix(in_oklab,var(--color-primary)_30%,var(--color-base-300))]'
										: 'bg-line'}"
								style="height: {Math.max(3, Math.round(b.fracao * 80))}px"
							></span>
							<span
								class="text-[11.5px] font-bold tracking-[0.05em] uppercase {b.hoje
									? 'text-primary'
									: 'text-base-content/60'}">{b.rotulo}</span
							>
						</div>
					{/each}
				</div>
				<div
					class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-base-content/65"
				>
					<span>Tentativas por dia, todas as turmas</span>
					<span class="min-w-1 flex-1"></span>
					{#each legenda as m (m)}
						<span class="flex items-center gap-1.5">
							<span class="grid size-[18px] place-items-center rounded-full {MARCA[m].classe}">
								{@render icone(MARCA[m].d, 'size-2.5', '2.6')}
							</span>
							{MARCA[m].titulo}
						</span>
					{/each}
				</div>
			</div>
		</section>

		<!-- As últimas tentativas, de todas as turmas. -->
		<section
			class="flex min-w-0 flex-col rounded-[18px] border border-line p-4.5 md:col-span-2 xl:col-span-4"
			aria-labelledby="titulo-tentativas"
		>
			<div class="mb-1 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
				<h2 id="titulo-tentativas" class="text-[15.5px] font-bold">Tentativas recentes</h2>
				<span class="min-w-1 flex-1"></span>
				<a
					href={resolve('/(studio)/resultados')}
					class="text-[13px] font-bold text-primary no-underline">Ver todas</a
				>
			</div>
			<p class="mb-2.5 text-[12.5px] text-base-content/65">As últimas, de todas as turmas</p>
			{#if p.tentativas.length === 0}
				<p
					class="rounded-[12px] border border-dashed border-line px-3.5 py-4 text-[13px] leading-relaxed text-pretty text-base-content/65"
				>
					Nenhuma tentativa ainda. Quando um aluno responder, ela aparece aqui, com o acerto.
				</p>
			{:else}
				<ul class="grid">
					{#each p.tentativas as t (t.id)}
						<li>
							<a
								href={resolve('/(studio)/resultados/[activityId]/[attemptId]', {
									activityId: t.activityId,
									attemptId: t.id
								})}
								aria-label="{t.nome}{t.turma
									? `, ${t.turma.nome}`
									: ''}, {t.atividade}, {t.quando}{t.acerto === null
									? ''
									: `, ${t.acerto}% de acerto`}, {ESTADO[t.estado].texto}"
								class="flex min-w-0 items-center gap-2.5 border-t border-line px-1 py-2.5 text-base-content no-underline transition-colors hover:bg-base-200 hover:text-base-content"
							>
								<Avatar
									codigo={t.avatar}
									nome={t.nome}
									size={34}
									radius="rounded-full"
									class="flex-none"
								/>
								<span class="min-w-0 flex-1">
									<span class="flex min-w-0 items-center gap-1.5">
										<span class="truncate text-[13px] font-bold">{t.nome}</span>
										{#if t.turma}
											<span
												class="flex-none rounded-[5px] px-[5px] py-0.5 text-[10.5px] font-bold {CLASSE_DA_ETIQUETA[
													t.turma.cor
												]}">{t.turma.sigla}</span
											>
										{/if}
									</span>
									<span class="mt-0.5 block truncate text-[12px] text-base-content/65"
										>{t.atividade} · {t.quando}</span
									>
								</span>
								<span class="grid flex-none justify-items-end gap-[3px]">
									<span
										class="text-[15px] leading-none font-extrabold tracking-[-0.01em] {t.acerto ===
										null
											? 'text-base-content/50'
											: ''}">{t.acerto === null ? '—' : `${t.acerto}%`}</span
									>
									<span class="text-[11px] {ESTADO[t.estado].classe}">{ESTADO[t.estado].texto}</span
									>
								</span>
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<!-- ── uma peça por área ── -->
		<a href={resolve('/(studio)/atividades')} class="{PECA} xl:col-span-4">
			{@render cabecaDaPeca('Atividades', 'M4 6h16M4 12h12M4 18h8')}
			{@render numeroDaPeca(String(p.atividades.noAr), 'no ar')}
			{#if p.atividades.ultimas.length}
				<span class="grid gap-1.5 border-t border-line pt-3">
					{#each p.atividades.ultimas as a (a.id)}
						<span class="flex min-w-0 items-center gap-2.5 text-[13px]">
							<span class="min-w-0 flex-1 truncate">{a.titulo}</span>
							<span class="flex-none text-[12px] text-base-content/60"
								>{ESTADO_DA_ATIVIDADE[a.estado]}</span
							>
						</span>
					{/each}
				</span>
			{/if}
			{@render rodapeDaPeca(rodapeAtividades)}
		</a>

		<a href={resolve('/(studio)/modulos')} class="{PECA} xl:col-span-4">
			{@render cabecaDaPeca(
				'Módulos',
				'M12 3.5l8.5 4.5-8.5 4.5L3.5 8zM3.5 12.5l8.5 4.5 8.5-4.5M3.5 16.5l8.5 4.5 8.5-4.5'
			)}
			{@render numeroDaPeca(
				String(p.modulos.total),
				`${p.modulos.total === 1 ? 'módulo' : 'módulos'} · ${plural(p.modulos.atividades, 'atividade', 'atividades')}`
			)}
			{#if gruposDeModulo.length}
				<span class="grid gap-1.5">
					<span class="flex h-2 gap-0.5" aria-hidden="true">
						{#each gruposDeModulo as g (g.classe)}
							<span
								class="origin-left animate-crescer-x rounded-[3px] {g.classe}"
								style="width: {(g.n / p.modulos.total) * 100}%"
							></span>
						{/each}
					</span>
					<span class="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-base-content/65">
						{#each gruposDeModulo as g (g.classe)}
							<span class="flex items-center gap-1.5"
								><span class="size-[9px] rounded-[3px] {g.classe}"></span>{g.n}
								{g.texto(g.n)}</span
							>
						{/each}
					</span>
				</span>
			{/if}
			{@render rodapeDaPeca(rodapeModulos)}
		</a>

		<a href={resolve('/(studio)/turmas')} class="{PECA} xl:col-span-4">
			{@render cabecaDaPeca(
				'Turmas',
				'M9 11.3a3.3 3.3 0 100-6.6 3.3 3.3 0 000 6.6zM3 19c0-3.1 2.7-5 6-5s6 1.9 6 5M16.5 7.2a3 3 0 010 5.6M17 19c0-2.3-.7-3.9-2-4.7'
			)}
			{@render numeroDaPeca(
				String(p.turmas.total),
				`${p.turmas.total === 1 ? 'turma' : 'turmas'} · ${plural(p.turmas.alunos, 'aluno', 'alunos')}`
			)}
			{#if p.turmas.fileira.length}
				<span class="flex items-center">
					{#each p.turmas.fileira as aluno, i (i)}
						<span class="-me-2 rounded-full ring-2 ring-base-100">
							<Avatar codigo={aluno.avatar} nome={aluno.nome} size={34} radius="rounded-full" />
						</span>
					{/each}
					{#if p.turmas.alunos > p.turmas.fileira.length}
						<span class="ms-4 text-[12.5px] text-base-content/65"
							>+{plural(p.turmas.alunos - p.turmas.fileira.length, 'aluno', 'alunos')}</span
						>
					{/if}
				</span>
			{/if}
			{@render rodapeDaPeca(rodapeTurmas)}
		</a>

		<a href={resolve('/(studio)/resultados')} class="{PECA} xl:col-span-6">
			{@render cabecaDaPeca('Resultados', 'M4 18V9M10 18V4M16 18v-6M22 18v-9')}
			{@render numeroDaPeca(
				p.resultados.acerto === null ? '—' : `${p.resultados.acerto}%`,
				'acerto médio'
			)}
			{#if p.resultados.tentativas > 0}
				{@const faixas = [
					{ n: p.resultados.distribuicao.correct, texto: 'certo', classe: 'bg-success' },
					{ n: p.resultados.distribuicao.partial, texto: 'parcial', classe: 'bg-warning' },
					{ n: p.resultados.distribuicao.incorrect, texto: 'errado', classe: 'bg-error' }
				]}
				<span class="grid gap-1.5">
					<!-- Parcial tem faixa própria (paginas.md): somada ao erro, ela some. -->
					<span class="flex h-2 gap-0.5" aria-hidden="true">
						{#each faixas.filter((f) => f.n > 0) as f (f.texto)}
							<span
								class="origin-left animate-crescer-x rounded-[3px] {f.classe}"
								style="width: {f.n}%"
							></span>
						{/each}
					</span>
					<span class="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-base-content/65">
						{#each faixas as f (f.texto)}
							<span class="flex items-center gap-1.5"
								><span class="size-[9px] rounded-[3px] {f.classe}"></span>{f.n}% {f.texto}</span
							>
						{/each}
					</span>
				</span>
			{/if}
			{@render rodapeDaPeca(rodapeResultados)}
		</a>

		<a href={resolve('/(studio)/materiais')} class="{PECA} xl:col-span-3">
			{@render cabecaDaPeca(
				'Materiais',
				'M3 5.5h6a3 3 0 013 3v10a2.5 2.5 0 00-2.5-2.5H3zM21 5.5h-6a3 3 0 00-3 3v10a2.5 2.5 0 012.5-2.5H21z'
			)}
			{@render numeroDaPeca(
				String(p.materiais.total),
				p.materiais.total === 1 ? 'material' : 'materiais'
			)}
			{#if p.materiais.porTipo.length}
				<span class="flex flex-wrap gap-1.5">
					{#each p.materiais.porTipo as tipo (tipo.rotulo)}
						<span
							class="rounded-full border border-line bg-base-200 px-2.5 py-1 text-[12px] font-semibold"
							>{tipo.rotulo}
							<span class="font-mono font-normal text-base-content/65">{tipo.n}</span></span
						>
					{/each}
				</span>
			{/if}
			{@render rodapeDaPeca(rodapeMateriais)}
		</a>

		<a href={resolve('/(studio)/assinatura')} class="{PECA} xl:col-span-3">
			{@render cabecaDaPeca('Assinatura', 'M3.5 6.5h17v11h-17zM3.5 10h17M7 14.5h4')}
			{@render numeroDaPeca(plano.nome, plano.sub)}
			<span class="grid gap-1.5">
				<span class="flex h-2 overflow-hidden rounded-full bg-base-300" aria-hidden="true">
					<span
						class="origin-left animate-crescer-x rounded-full {barraDoPlano.fracao >= 1
							? 'bg-error'
							: 'bg-primary'}"
						style="width: {barraDoPlano.fracao * 100}%"
					></span>
				</span>
				<span class="text-[12px] text-base-content/65">{barraDoPlano.texto}</span>
			</span>
			{@render rodapeDaPeca(rodapePlano)}
		</a>
	</div>
</div>
