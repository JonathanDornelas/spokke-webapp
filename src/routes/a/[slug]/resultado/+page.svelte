<script lang="ts">
	import { untrack } from 'svelte';
	// Fim da tentativa. Quatro blocos em ordem de PERGUNTA: quanto eu fiz, como
	// foi meu percurso, em que eu fui bem, e o que aconteceu em cada questão.
	//
	// **O tempo é informação de estudo, nunca cobrança.** A média vem ao lado da
	// média da turma e a questão mais demorada é "onde você pensou mais" — um
	// aluno que leva o dobro do tempo e acerta não errou nada.
	//
	// **Sem feedback ele ainda vê o percurso**: quantas respondeu, quanto levou,
	// que tentativa é esta. Nenhum acerto vaza nisso — nem por cor, nem por
	// contagem — e a frase embaixo diz exatamente o que aqueles números são.
	// Ver paginas.md "Player".
	import { resolve } from '$app/paths';
	import AmbientShapes from '$lib/components/AmbientShapes.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import CorrectionIcon from '$lib/components/CorrectionIcon.svelte';
	import Logo from '$lib/components/Logo.svelte';
	import ScoreBar from '$lib/components/ScoreBar.svelte';
	import VolumeControl from '$lib/components/VolumeControl.svelte';
	import { som } from '$lib/client/sons.svelte';
	import { withMock } from '$lib/dev/with-mock';

	type ItemState = 'correct' | 'partial' | 'incorrect' | 'pending';

	interface Question {
		n: number;
		label: string;
		state: ItemState;
		ms: number;
		time: string;
		given: string;
		expected?: string;
		porque?: string;
	}
	interface Skill {
		name: string;
		correct: number;
		partial: number;
		total: number;
		tag: 'firme' | 'quase lá' | 'vale voltar';
	}
	interface Stats {
		tempoTotal: string;
		mediaPorQuestao: string;
		mediaDaTurma: string | null;
		maisDemorada: { n: number; time: string; label: string } | null;
		acertosNaPrimeira: number | null;
	}
	interface PageData {
		showFeedback: boolean;
		activity: { title: string; itemCount: number; slug: string; dir: 'ltr' | 'rtl' };
		student: { name: string; initials: string; temConta: boolean; avatar: string | null };
		duration: string;
		teacherNote?: string;
		attempt: { numero: number; total: number; quando: string; respondidas: number };
		tally: { correct: number; partial: number; incorrect: number; pending: number };
		percent: number | null;
		itemStates: ItemState[];
		questions: Question[];
		skills: Skill[];
		stats: Stats | null;
	}

	const MOCK: PageData = {
		showFeedback: true,
		activity: {
			title: 'Present perfect — turma B',
			itemCount: 8,
			slug: 'present-perfect-b',
			dir: 'ltr' as const
		},
		student: { name: 'João P.', initials: 'JP', temConta: false, avatar: null },
		duration: '10 min 22 s',
		teacherNote: undefined,
		attempt: { numero: 2, total: 2, quando: '14 de setembro', respondidas: 8 },
		tally: { correct: 5, partial: 2, incorrect: 0, pending: 1 },
		percent: 63,
		itemStates: [
			'correct',
			'correct',
			'correct',
			'partial',
			'correct',
			'partial',
			'correct',
			'pending'
		] as ItemState[],
		questions: [
			{
				n: 1,
				label: 'montar frase',
				state: 'correct',
				ms: 38_000,
				time: '38 s',
				given: 'She has worked here since 2019.'
			},
			{
				n: 2,
				label: 'escuta',
				state: 'correct',
				ms: 52_000,
				time: '52 s',
				given: 'She has been working here.'
			},
			{ n: 3, label: 'escolha', state: 'correct', ms: 21_000, time: '21 s', given: 'has finished' },
			{
				n: 4,
				label: 'escrita tolerante',
				state: 'partial',
				ms: 96_000,
				time: '1 min 36 s',
				given: 'has been workin',
				expected: 'has been working',
				porque: 'Faltou o g no final. O sentido está certo, por isso conta como parcial.'
			},
			{
				n: 5,
				label: 'montar frase',
				state: 'correct',
				ms: 44_000,
				time: '44 s',
				given: 'She has been working here since 2019.'
			},
			{
				n: 6,
				label: 'escolha',
				state: 'partial',
				ms: 73_000,
				time: '1 min 13 s',
				given: 'have gone',
				expected: 'has gone',
				porque: 'O sujeito é she, então o verbo vai para has. A escolha do particípio estava certa.'
			},
			{
				n: 7,
				label: 'escuta',
				state: 'correct',
				ms: 40_000,
				time: '40 s',
				given: 'They have just arrived.'
			},
			{ n: 8, label: 'escrita longa', state: 'pending', ms: 138_000, time: '2 min 18 s', given: '' }
		] as Question[],
		skills: [
			{ name: 'montar frase', correct: 2, partial: 0, total: 2, tag: 'firme' },
			{ name: 'escuta', correct: 2, partial: 0, total: 2, tag: 'firme' },
			{ name: 'escolha', correct: 1, partial: 1, total: 2, tag: 'quase lá' },
			{ name: 'escrita tolerante', correct: 0, partial: 1, total: 1, tag: 'quase lá' }
		] as Skill[],
		stats: {
			tempoTotal: '10 min 22 s',
			mediaPorQuestao: '1 min 03 s',
			mediaDaTurma: '1 min 12 s',
			maisDemorada: { n: 8, time: '2 min 18 s', label: 'escrita longa' },
			acertosNaPrimeira: 3
		}
	};

	let { data: dataProp }: { data?: Partial<PageData> } = $props();
	const data = $derived(withMock(dataProp, MOCK));

	/** Só as que não saíram corretas — é o que o aluno volta para ver. */
	let soParaRever = $state(false);
	const paraRever = $derived(data.questions.filter((q) => q.state !== 'correct'));
	const naLista = $derived(soParaRever ? paraRever : data.questions);

	const stateColor: Record<ItemState, string> = {
		correct: 'bg-success',
		partial: 'bg-warning',
		incorrect: 'bg-error',
		pending: 'bg-base-300'
	};
	const moldura: Record<ItemState, string> = {
		correct: 'border border-line border-s-[3px] border-s-success bg-card',
		partial: 'border border-line border-s-[3px] border-s-warning bg-card',
		incorrect: 'border border-line border-s-[3px] border-s-error bg-card',
		pending: 'border-[1.5px] border-dashed border-line bg-base-200'
	};
	const stateLabel: Record<ItemState, string> = {
		correct: 'Correto',
		partial: 'Parcial',
		incorrect: 'Incorreto',
		pending: 'A corrigir'
	};
	const stateTone: Record<ItemState, string> = {
		correct: 'text-success',
		partial: 'text-warning',
		incorrect: 'text-error',
		pending: 'text-base-content/65'
	};
	const tagTone: Record<Skill['tag'], string> = {
		firme: 'bg-success/13 text-success',
		'quase lá': 'bg-warning/15 text-warning',
		'vale voltar': 'border border-line bg-base-200 text-base-content/65'
	};

	// O anel: 264 é o perímetro de um círculo de raio 42 (2πr), e o quanto dele
	// FICA de fora é o que a animação desenha.
	const PERIMETRO = 264;
	const anelSobra = $derived(Math.round(PERIMETRO * (1 - (data.percent ?? 0) / 100)));

	/** A média do aluno é lenta quando passa de 1,5× a média das questões dele. */
	const msMedia = $derived(
		data.questions.length > 0
			? data.questions.reduce((t, q) => t + q.ms, 0) / data.questions.length
			: 0
	);

	// O som de fim, UMA vez. Ele acompanha a tela de desfecho e não depende de
	// ter havido acerto — quem chegou até aqui terminou, que é o que ele
	// celebra. Abrir /resultado direto pelo endereço não tem gesto do usuário
	// nesta aba e o browser recusa o áudio: o módulo engole a recusa e a tela
	// segue igual, calada.
	//
	// **`untrack` não é detalhe: sem ele o efeito escuta `som.volume`.** Tanto
	// `sincronizar` quanto `tocar` LEEM esse estado, então mexer no regulador
	// re-executava o efeito e tocava o som de novo — a cada passo do slider.
	// Antes isso reiniciava um `<audio>` só (um som cortado); com Web Audio cada
	// toque é uma fonte nova, e elas se somavam num ruído.
	$effect(() => {
		untrack(() => {
			som.sincronizar();
			som.tocar('finish');
		});
	});

	// A legenda repete a contagem por estado em TEXTO — a barra sozinha é só
	// cor, e cor sozinha nunca comunica correção (design-system.md).
	const legenda = $derived(
		[
			{ state: 'correct' as const, n: data.tally.correct, palavra: 'certas', tom: 'text-success' },
			{
				state: 'partial' as const,
				n: data.tally.partial,
				palavra: 'parciais',
				tom: 'text-warning'
			},
			{
				state: 'incorrect' as const,
				n: data.tally.incorrect,
				palavra: 'erradas',
				tom: 'text-error'
			},
			{
				state: 'pending' as const,
				n: data.tally.pending,
				palavra: 'a corrigir',
				tom: 'text-base-content'
			}
		].filter((linha) => linha.n > 0)
	);

	/** Os quatro números do percurso, já montados — a tela só escolhe o ícone. */
	const cartoes = $derived.by(() => {
		const s = data.stats;
		if (!s) return [];
		return [
			{
				chave: 'total',
				label: 'Tempo total',
				valor: s.tempoTotal,
				nota: 'do primeiro toque ao envio'
			},
			{
				chave: 'media',
				label: 'Média por questão',
				valor: s.mediaPorQuestao,
				nota: s.mediaDaTurma ? `a turma leva ${s.mediaDaTurma}` : 'você foi o primeiro a entregar'
			},
			...(s.maisDemorada
				? [
						{
							chave: 'lenta',
							label: 'Onde você pensou mais',
							valor: `Q${s.maisDemorada.n}`,
							nota: `${s.maisDemorada.time} · ${s.maisDemorada.label}`
						}
					]
				: []),
			{
				chave: 'tentativa',
				label: 'Tentativa',
				valor: `${data.attempt.numero} de ${data.attempt.total}`,
				nota:
					s.acertosNaPrimeira === null
						? 'primeira vez nesta atividade'
						: `na 1ª você fez ${s.acertosNaPrimeira} de ${data.activity.itemCount}`
			}
		];
	});
</script>

<svelte:head><title>Resultado — {data.activity.title}</title></svelte:head>

<header
	class="flex shrink-0 items-center gap-3.5 border-b border-line px-5 py-4 lg:px-10 lg:py-[18px]"
>
	<Logo size={22} />
	<span class="hidden h-5 w-px shrink-0 bg-line lg:block"></span>
	<span class="hidden min-w-0 truncate text-[12.5px] text-base-content/65 lg:inline"
		>{data.activity.title}</span
	>
	<div class="flex-1"></div>
	{#if data.student.temConta}
		<!-- Com conta, o nome é a porta do painel do aluno. Sem conta é só o nome:
		     a área não existe para quem não a tem, e este não é o lugar de
		     oferecê-la. -->
		<a
			href={resolve('/aluno')}
			class="flex items-center gap-2 rounded-full py-1 pe-2 text-[12.5px] whitespace-nowrap text-base-content/65 no-underline transition-colors hover:text-primary"
			title="Abrir minhas atividades"
		>
			<Avatar
				codigo={data.student.avatar}
				nome={data.student.name}
				size={26}
				radius="rounded-full"
			/>
			<span class="hidden lg:inline">{data.student.name}</span>
		</a>
	{:else}
		<span class="flex items-center gap-2 text-[12.5px] whitespace-nowrap text-base-content/65">
			<Avatar
				codigo={data.student.avatar}
				nome={data.student.name}
				size={26}
				radius="rounded-full"
			/>
			<span class="hidden lg:inline">{data.student.name}</span>
		</span>
	{/if}
	<VolumeControl />
	<span
		class="flex items-center gap-1.5 rounded-full bg-success/12 px-3 py-1.5 text-[12.5px] font-bold whitespace-nowrap text-success"
	>
		<svg class="size-[15px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
			<path
				d="M4 12.5l5 5L20 6.5"
				stroke="currentColor"
				stroke-width="2.6"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		</svg>
		Enviado
	</span>
</header>

<div class="relative flex min-h-0 flex-1 flex-col overflow-y-auto px-gutter py-gutter">
	<AmbientShapes tone="success" edges="both" />

	{#if !data.showFeedback}
		<!-- ═══ sem feedback ═══ Nenhum veredito, nem por cor nem por contagem.
		     O PERCURSO continua: os três números abaixo existem igual com
		     resultado ligado ou desligado, e a frase final diz o que eles são. -->
		<div class="relative z-1 m-auto w-full max-w-[560px] animate-entrada text-center">
			<span
				class="mb-[22px] inline-grid size-[68px] place-items-center rounded-full bg-success text-success-content"
			>
				<CorrectionIcon state="correct" size={32} animate />
			</span>
			<h1 class="mb-3 font-display text-title font-semibold tracking-[-0.025em] text-pretty">
				Respostas enviadas
			</h1>
			<p class="mb-6 text-[15px] leading-relaxed text-base-content/65">
				As {data.activity.itemCount} questões foram registradas.
				{data.teacherNote ?? 'Seu professor combinou de comentar o resultado em aula.'}
			</p>

			<dl class="mb-6 grid gap-2.5 text-start sm:grid-cols-3">
				{#each [{ valor: `${data.attempt.respondidas} de ${data.activity.itemCount}`, label: 'questões respondidas' }, { valor: data.duration, label: 'tempo até enviar' }, { valor: `${data.attempt.numero}ª`, label: 'tentativa nesta atividade' }] as n (n.label)}
					<div class="rounded-box border border-line bg-card px-4 py-3.5">
						<dt class="sr-only">{n.label}</dt>
						<dd>
							<span
								class="block font-display text-[22px] leading-none font-extrabold tracking-[-0.025em]"
								>{n.valor}</span
							>
							<span class="mt-1.5 block text-[12.5px] leading-snug text-base-content/65"
								>{n.label}</span
							>
						</dd>
					</div>
				{/each}
			</dl>

			<p
				class="mx-auto max-w-[58ch] text-[12.5px] leading-relaxed text-pretty text-base-content/65"
			>
				Estes números são só sobre o seu percurso — quantas você respondeu e quanto tempo levou.
				Nenhum acerto é revelado nesta atividade: o professor desligou o feedback ao publicar.
			</p>
		</div>
	{:else}
		<div class="relative z-1 mx-auto w-full max-w-[680px] animate-entrada">
			<!-- ── 1. o placar ── -->
			<div
				class="mb-3.5 flex flex-wrap items-center gap-x-[26px] gap-y-5 rounded-box border border-line bg-base-200 p-4 lg:px-6 lg:py-[22px]"
			>
				<div class="relative size-[108px] shrink-0">
					<svg viewBox="0 0 96 96" class="size-full -rotate-90" aria-hidden="true">
						<circle
							cx="48"
							cy="48"
							r="42"
							fill="none"
							stroke="var(--color-base-300)"
							stroke-width="9"
						/>
						<circle
							cx="48"
							cy="48"
							r="42"
							fill="none"
							stroke="var(--color-success)"
							stroke-width="9"
							stroke-linecap="round"
							stroke-dasharray={PERIMETRO}
							style="--dash: {anelSobra}; stroke-dashoffset: {anelSobra}; animation: en-ring 900ms var(--ease-out-soft) 120ms both;"
						/>
					</svg>
					<span class="absolute inset-0 grid place-items-center text-center">
						<span>
							<span
								class="block font-display text-[27px] leading-none font-extrabold tracking-[-0.03em]"
								>{data.percent}%</span
							>
							<span class="mt-[3px] block text-[11px] text-base-content/65">de acerto</span>
						</span>
					</span>
				</div>
				<div class="min-w-[210px] flex-1">
					<p class="mb-[9px] text-xs font-bold tracking-[0.09em] text-base-content/65 uppercase">
						Tentativa {data.attempt.numero} de {data.attempt.total} · {data.attempt.quando}
					</p>
					<h1
						class="mb-3 font-display text-[24px] leading-[1.14] font-semibold tracking-[-0.025em] text-pretty lg:text-[30px] lg:leading-[1.1]"
					>
						Você acertou {data.tally.correct} de {data.activity.itemCount}
					</h1>
					<div
						class="mb-3 flex gap-1"
						role="img"
						aria-label="Resumo das {data.activity.itemCount} questões"
					>
						{#each data.itemStates as s, i (i)}
							<span
								class="h-2.5 flex-1 rounded-full {stateColor[s]}"
								style="transform-origin: left; animation: en-grow-x 620ms var(--ease-out-soft) {i *
									70}ms both;"
							></span>
						{/each}
					</div>
					<p class="flex flex-wrap items-center gap-x-[18px] gap-y-2 text-[13px]">
						{#each legenda as linha (linha.state)}
							<span class="flex items-center gap-[7px] text-base-content/65">
								<span class="size-2.5 rounded-[3px] {stateColor[linha.state]}"></span>
								<strong class="font-bold {linha.tom}">{linha.n}</strong>
								{linha.palavra}
							</span>
						{/each}
					</p>
				</div>
			</div>

			<!-- ── 2. o percurso ── O tempo entra como estudo, não como cobrança:
			     a média vem ao lado da média da turma, e a questão mais demorada
			     é "onde você pensou mais". -->
			{#if cartoes.length > 0}
				<dl class="mb-5 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
					{#each cartoes as c (c.chave)}
						<div class="rounded-[13px] border border-line bg-card px-[15px] py-3.5">
							<dt class="mb-[9px] flex items-center gap-2">
								<span
									class="grid size-[26px] shrink-0 place-items-center rounded-lg bg-base-300 text-primary"
								>
									<svg class="size-3.5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
										{#if c.chave === 'total'}
											<path
												d="M12 7.5V12l3 2M12 20.5a8.5 8.5 0 100-17 8.5 8.5 0 000 17z"
												stroke="currentColor"
												stroke-width="2"
												stroke-linecap="round"
												stroke-linejoin="round"
											/>
										{:else if c.chave === 'media'}
											<path
												d="M5 18a9 9 0 1114 0M12 13.5l4-4"
												stroke="currentColor"
												stroke-width="2"
												stroke-linecap="round"
												stroke-linejoin="round"
											/>
										{:else if c.chave === 'lenta'}
											<path
												d="M12 20.5a8.5 8.5 0 100-17 8.5 8.5 0 000 17zM12 8v4.5l2.5 2"
												stroke="currentColor"
												stroke-width="2"
												stroke-linecap="round"
												stroke-linejoin="round"
											/>
										{:else}
											<path
												d="M4 12a8 8 0 018-8 8 8 0 017 4M20 12a8 8 0 01-8 8 8 8 0 01-7-4M19 3.5V8h-4.5M5 20.5V16h4.5"
												stroke="currentColor"
												stroke-width="2"
												stroke-linecap="round"
												stroke-linejoin="round"
											/>
										{/if}
									</svg>
								</span>
								<span class="text-xs text-base-content/65">{c.label}</span>
							</dt>
							<dd>
								<span
									class="mb-[5px] block font-display text-[23px] leading-none font-extrabold tracking-[-0.025em]"
									>{c.valor}</span
								>
								<span class="block text-xs leading-[1.45] text-base-content/65">{c.nota}</span>
							</dd>
						</div>
					{/each}
				</dl>
			{/if}

			<!-- ── 3. por habilidade ── -->
			{#if data.skills.length > 0}
				<div class="mb-5">
					<div class="mb-[11px] flex flex-wrap items-baseline gap-x-3 gap-y-2">
						<h2 class="font-display text-base font-semibold tracking-[-0.018em] lg:text-lg">
							Por habilidade
						</h2>
						<span class="text-[12.5px] text-base-content/65"
							>onde você foi bem e onde vale voltar</span
						>
					</div>
					<ul class="grid list-none gap-[9px] p-0">
						{#each data.skills as k, i (k.name)}
							<li
								class="flex flex-wrap items-center gap-x-3.5 gap-y-2 rounded-xl border border-line bg-card px-[15px] py-3"
							>
								<span class="min-w-[118px] flex-1 text-[13.5px] font-semibold">{k.name}</span>
								<span class="min-w-[130px] flex-[2]">
									<ScoreBar
										correct={k.correct}
										partial={k.partial}
										incorrect={k.total - k.correct - k.partial}
										height="h-[9px]"
										delay={i * 90}
									/>
								</span>
								<span class="min-w-[58px] shrink-0 font-mono text-[12.5px] text-base-content/65"
									>{k.correct}/{k.total}</span
								>
								<span
									class="shrink-0 rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap {tagTone[
										k.tag
									]}">{k.tag}</span
								>
							</li>
						{/each}
					</ul>
				</div>
			{/if}

			<!-- ── 4. questão a questão ── -->
			<div>
				<div class="mb-[11px] flex flex-wrap items-baseline gap-x-3 gap-y-2">
					<h2 class="font-display text-base font-semibold tracking-[-0.018em] lg:text-lg">
						Questão a questão
					</h2>
					<div class="min-w-1 flex-1"></div>
					{#if paraRever.length > 0}
						<div
							class="flex gap-[3px] rounded-full border border-line bg-base-200 p-[3px]"
							role="group"
							aria-label="Filtrar as questões"
						>
							<button
								type="button"
								onclick={() => (soParaRever = false)}
								aria-pressed={!soParaRever}
								class="rounded-full px-3 py-[7px] text-xs font-bold transition-colors
								       {!soParaRever ? 'bg-primary text-primary-content' : 'text-base-content/65'}"
								>Todas · {data.questions.length}</button
							>
							<button
								type="button"
								onclick={() => (soParaRever = true)}
								aria-pressed={soParaRever}
								class="rounded-full px-3 py-[7px] text-xs font-bold transition-colors
								       {soParaRever ? 'bg-primary text-primary-content' : 'text-base-content/65'}"
								>Para rever · {paraRever.length}</button
							>
						</div>
					{/if}
				</div>

				<ul class="grid list-none gap-[9px] p-0">
					{#each naLista as q (q.n)}
						<li class="overflow-hidden rounded-[13px] {moldura[q.state]}">
							<div class="flex items-center gap-3 px-3.5 py-[13px] lg:px-[17px] lg:py-3.5">
								<span class="shrink-0 {stateTone[q.state]}">
									<CorrectionIcon state={q.state} size={21} />
								</span>
								<div class="min-w-0 flex-1">
									<p
										class="mb-1 flex flex-wrap items-center gap-x-[9px] gap-y-1 text-xs text-base-content/65"
									>
										<span>Questão {q.n}</span>
										<span aria-hidden="true">·</span>
										<span>{q.label}</span>
										<span aria-hidden="true">·</span>
										<!-- Tempo acima de 1,5× a média dele ganha destaque — é onde
										     ele pensou mais, e a cor é âmbar porque não é erro. -->
										<span class="font-mono {q.ms > msMedia * 1.5 ? 'font-medium text-warning' : ''}"
											>{q.time}</span
										>
									</p>
									{#if q.state === 'pending'}
										<p class="text-[13.5px] leading-normal text-base-content/65">
											Sua resposta escrita foi enviada.
										</p>
									{:else}
										<p
											dir={data.activity.dir}
											data-content-lang
											class="font-content text-[14.5px] leading-normal"
										>
											{q.given}
										</p>
									{/if}
								</div>
								<span
									class="shrink-0 text-[12.5px] font-bold whitespace-nowrap {stateTone[q.state]}"
								>
									{stateLabel[q.state]}
								</span>
							</div>

							{#if q.expected || q.porque}
								<div
									class="flex flex-wrap gap-x-[22px] gap-y-2 border-t border-line bg-base-200 px-3.5 pt-[11px] pb-3 lg:px-[17px] lg:pt-3 lg:pb-[13px]"
								>
									{#if q.expected}
										<span class="min-w-[180px] flex-1">
											<span
												class="mb-1 block text-[11px] font-bold tracking-[0.08em] text-base-content/65 uppercase"
												>Resposta esperada</span
											>
											<span
												dir={data.activity.dir}
												data-content-lang
												class="block font-content text-sm text-success">{q.expected}</span
											>
										</span>
									{/if}
									{#if q.porque}
										<span class="min-w-[200px] flex-[1.3]">
											<span
												class="mb-1 block text-[11px] font-bold tracking-[0.08em] text-base-content/65 uppercase"
												>Por quê</span
											>
											<span class="block text-[13px] leading-normal text-pretty">{q.porque}</span>
										</span>
									{/if}
								</div>
							{/if}
						</li>
					{/each}
				</ul>

				{#if data.tally.pending > 0}
					<div
						class="mt-3 flex gap-[11px] rounded-xl border border-s-[3px] border-line border-s-warning bg-base-200 px-4 py-[15px]"
					>
						<svg
							class="size-[19px] shrink-0 text-warning"
							viewBox="0 0 24 24"
							fill="none"
							aria-hidden="true"
						>
							<path
								d="M4 20h4l11-11a2.83 2.83 0 10-4-4L4 16z"
								stroke="currentColor"
								stroke-width="2"
								stroke-linejoin="round"
							/>
						</svg>
						<p class="text-[13.5px] leading-[1.55] text-pretty">
							A questão de escrita longa vai para o professor corrigir — ela não entra na conta dos
							{data.tally.correct} de {data.activity.itemCount}. Quando ele terminar, o seu
							resultado é recalculado.
						</p>
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>

{#if data.showFeedback}
	<footer
		class="flex shrink-0 items-center gap-4 border-t border-line px-5 pt-3.5 pb-[22px] lg:px-10 lg:pt-5 lg:pb-[26px]"
	>
		<span class="hidden flex-1 text-[12.5px] text-base-content/65 lg:block">
			Suas respostas ficam com o professor desta atividade.
		</span>
		<a
			href={resolve('/a/[slug]/revisao', { slug: data.activity.slug })}
			class="btn btn-lg min-h-[50px] w-full motion-tap gap-2.5 btn-outline text-base font-bold no-underline lg:w-auto lg:px-[26px]"
		>
			Rever minhas respostas
			<svg class="size-[18px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
				<path
					d="M9 5l7 7-7 7"
					stroke="currentColor"
					stroke-width="2.2"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			</svg>
		</a>
	</footer>
{/if}
