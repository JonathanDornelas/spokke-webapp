<script lang="ts">
	// O fim da prévia: o resultado do Player (`a/[slug]/resultado`) com o que a
	// própria prévia acabou de viver — o placar, o percurso, por habilidade e
	// questão a questão. Os mesmos blocos, na mesma ordem e com as mesmas regras
	// (parcial é faixa própria; a escrita longa não entra na conta). O que muda é
	// que nada foi gravado: não há "Enviado", não há tentativa, não há turma para
	// comparar o tempo.
	import { resolve } from '$app/paths';
	import AmbientShapes from '$lib/components/AmbientShapes.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import CorrectionIcon from '$lib/components/CorrectionIcon.svelte';
	import Logo from '$lib/components/Logo.svelte';
	import ScoreBar from '$lib/components/ScoreBar.svelte';
	import VolumeControl from '$lib/components/VolumeControl.svelte';
	import { duracao } from '$lib/tempo';
	import type { Desfecho, RespostaDaPrevia } from './resposta.svelte';

	let {
		respostas,
		titulo,
		dir,
		quem,
		msTotal,
		activityId,
		voltarPara,
		onrefazer
	}: {
		respostas: RespostaDaPrevia[];
		titulo: string;
		dir: 'ltr' | 'rtl';
		quem: { nome: string; avatar: string | null };
		msTotal: number;
		activityId: string;
		/** De onde a prévia foi aberta: "Fechar a prévia" volta para lá. */
		voltarPara: 'detalhe' | 'publicar';
		onrefazer: () => void;
	} = $props();

	const fechar = $derived(
		voltarPara === 'detalhe'
			? resolve('/(studio)/atividades/[id]', { id: activityId })
			: resolve('/(studio)/atividades/[id]/publicar', { id: activityId })
	);

	const total = $derived(respostas.length);
	const questoes = $derived(
		respostas.map((r, i) => {
			const state = r.desfecho;
			return {
				n: i + 1,
				label: r.questao.rotulo,
				state,
				ms: r.ms,
				time: r.ms > 0 ? duracao(r.ms) : '—',
				given: r.dada,
				// Só o que não saiu certo precisa da resposta esperada ao lado — e
				// nunca a que espera o professor nem a pulada.
				expected: state === 'partial' || state === 'incorrect' ? r.esperada : '',
				porque: state === 'partial' || state === 'incorrect' ? r.feedback?.hint : undefined
			};
		})
	);

	const tally = $derived({
		correct: questoes.filter((q) => q.state === 'correct').length,
		partial: questoes.filter((q) => q.state === 'partial').length,
		incorrect: questoes.filter((q) => q.state === 'incorrect').length,
		pending: questoes.filter((q) => q.state === 'pending').length,
		skipped: questoes.filter((q) => q.state === 'skipped').length
	});
	const percent = $derived(total > 0 ? Math.round((tally.correct / total) * 100) : 0);

	let soParaRever = $state(false);
	const paraRever = $derived(questoes.filter((q) => q.state !== 'correct'));
	const naLista = $derived(soParaRever ? paraRever : questoes);

	const stateColor: Record<Desfecho, string> = {
		correct: 'bg-success',
		partial: 'bg-warning',
		incorrect: 'bg-error',
		pending: 'bg-base-300',
		skipped: 'bg-base-300'
	};
	const moldura: Record<Desfecho, string> = {
		correct: 'border border-line border-s-[3px] border-s-success bg-card',
		partial: 'border border-line border-s-[3px] border-s-warning bg-card',
		incorrect: 'border border-line border-s-[3px] border-s-error bg-card',
		pending: 'border-[1.5px] border-dashed border-line bg-base-200',
		skipped: 'border-[1.5px] border-dashed border-line bg-base-200'
	};
	const stateLabel: Record<Desfecho, string> = {
		correct: 'Correto',
		partial: 'Parcial',
		incorrect: 'Incorreto',
		pending: 'A corrigir',
		skipped: 'Pulada'
	};
	const stateTone: Record<Desfecho, string> = {
		correct: 'text-success',
		partial: 'text-warning',
		incorrect: 'text-error',
		pending: 'text-base-content/65',
		skipped: 'text-base-content/65'
	};
	const icone = (s: Desfecho) => (s === 'skipped' ? 'pending' : s);

	type Tag = 'firme' | 'quase lá' | 'vale voltar';
	const tagTone: Record<Tag, string> = {
		firme: 'bg-success/13 text-success',
		'quase lá': 'bg-warning/15 text-warning',
		'vale voltar': 'border border-line bg-base-200 text-base-content/65'
	};

	// Por habilidade: agrupado pelo que o aluno FEZ, como no Player. A que espera
	// o professor e a pulada ficam fora: sem veredito, contá-las como erro
	// reprovaria por uma fila que não é de quem respondeu.
	const skills = $derived.by(() => {
		const porRotulo: Record<string, { correct: number; partial: number; total: number }> = {};
		for (const q of questoes) {
			if (q.state === 'pending' || q.state === 'skipped') continue;
			const linha = (porRotulo[q.label] ??= { correct: 0, partial: 0, total: 0 });
			linha.total++;
			if (q.state === 'correct') linha.correct++;
			else if (q.state === 'partial') linha.partial++;
		}
		return Object.entries(porRotulo)
			.map(([name, n]) => ({
				name,
				...n,
				tag: (n.correct === n.total
					? 'firme'
					: n.correct + n.partial >= n.total
						? 'quase lá'
						: 'vale voltar') as Tag
			}))
			.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'pt-BR'));
	});

	// O anel: 264 é o perímetro de um círculo de raio 42 (2πr).
	const PERIMETRO = 264;
	const anelSobra = $derived(Math.round(PERIMETRO * (1 - percent / 100)));

	const respondidas = $derived(questoes.filter((q) => q.ms > 0 && q.state !== 'skipped'));
	const msMedia = $derived(
		respondidas.length > 0 ? respondidas.reduce((t, q) => t + q.ms, 0) / respondidas.length : 0
	);
	const lenta = $derived(
		respondidas.reduce<(typeof questoes)[number] | null>(
			(pior, q) => (!pior || q.ms > pior.ms ? q : pior),
			null
		)
	);
	const cartoes = $derived([
		{
			chave: 'total',
			label: 'Tempo total',
			valor: duracao(msTotal),
			nota: 'da primeira questão ao fim'
		},
		{
			chave: 'media',
			label: 'Média por questão',
			valor: duracao(msMedia),
			nota: 'só das respondidas'
		},
		...(lenta
			? [
					{
						chave: 'lenta',
						label: 'Onde você pensou mais',
						valor: `Q${lenta.n}`,
						nota: `${lenta.time} · ${lenta.label}`
					}
				]
			: [])
	]);

	// A legenda repete a contagem em TEXTO: a barra sozinha é só cor.
	const legenda = $derived(
		[
			{ state: 'correct' as const, n: tally.correct, palavra: 'certas', tom: 'text-success' },
			{ state: 'partial' as const, n: tally.partial, palavra: 'parciais', tom: 'text-warning' },
			{ state: 'incorrect' as const, n: tally.incorrect, palavra: 'erradas', tom: 'text-error' },
			{
				state: 'pending' as const,
				n: tally.pending,
				palavra: 'a corrigir',
				tom: 'text-base-content'
			},
			{
				state: 'skipped' as const,
				n: tally.skipped,
				palavra: tally.skipped === 1 ? 'pulada' : 'puladas',
				tom: 'text-base-content'
			}
		].filter((linha) => linha.n > 0)
	);
</script>

<header
	class="flex shrink-0 items-center gap-3.5 border-b border-line px-5 py-4 lg:px-10 lg:py-[18px]"
>
	<Logo size={22} />
	<span class="hidden h-5 w-px shrink-0 bg-line lg:block"></span>
	<span class="hidden min-w-0 truncate text-[12.5px] text-base-content/65 lg:inline">{titulo}</span>
	<div class="flex-1"></div>
	<span class="flex items-center gap-2 text-[12.5px] whitespace-nowrap text-base-content/65">
		<Avatar codigo={quem.avatar} nome={quem.nome} size={26} radius="rounded-full" />
		<span class="hidden lg:inline">{quem.nome}</span>
	</span>
	<VolumeControl />
	<!-- No Player aqui fica o "Enviado". A prévia não envia nada, e diz isso. -->
	<span
		class="rounded-full bg-base-300 px-3 py-1.5 text-[12.5px] font-bold whitespace-nowrap text-base-content/70"
	>
		Nada foi salvo
	</span>
</header>

<div class="relative flex min-h-0 flex-1 flex-col overflow-y-auto px-gutter py-gutter">
	<AmbientShapes tone="success" edges="both" />

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
							>{percent}%</span
						>
						<span class="mt-[3px] block text-[11px] text-base-content/65">de acerto</span>
					</span>
				</span>
			</div>
			<div class="min-w-[210px] flex-1">
				<p class="mb-[9px] text-xs font-bold tracking-[0.09em] text-base-content/65 uppercase">
					Prévia do aluno · nada foi salvo
				</p>
				<h1
					class="mb-3 font-display text-[24px] leading-[1.14] font-semibold tracking-[-0.025em] text-pretty lg:text-[30px] lg:leading-[1.1]"
				>
					Você acertou {tally.correct} de {total}
				</h1>
				<div class="mb-3 flex gap-1" role="img" aria-label="Resumo das {total} questões">
					{#each questoes as q, i (q.n)}
						<span
							class="h-2.5 flex-1 rounded-full {stateColor[q.state]}"
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

		<!-- ── 2. o percurso ── Sem a média da turma: a prévia não tem turma. -->
		<dl class="mb-5 grid grid-cols-2 gap-2.5 lg:grid-cols-3">
			{#each cartoes as c (c.chave)}
				<div class="rounded-[13px] border border-line bg-card px-[15px] py-3.5">
					<dt class="mb-[9px] flex items-center gap-2">
						<span
							class="grid size-[26px] shrink-0 place-items-center rounded-lg bg-base-300 text-primary"
						>
							<svg class="size-3.5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
								<path
									d={c.chave === 'total'
										? 'M12 7.5V12l3 2M12 20.5a8.5 8.5 0 100-17 8.5 8.5 0 000 17z'
										: c.chave === 'media'
											? 'M5 18a9 9 0 1114 0M12 13.5l4-4'
											: 'M12 20.5a8.5 8.5 0 100-17 8.5 8.5 0 000 17zM12 8v4.5l2.5 2'}
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
								/>
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

		<!-- ── 3. por habilidade ── -->
		{#if skills.length > 0}
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
					{#each skills as k, i (k.name)}
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
							>Todas · {questoes.length}</button
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
								<CorrectionIcon state={icone(q.state)} size={21} />
							</span>
							<div class="min-w-0 flex-1">
								<p
									class="mb-1 flex flex-wrap items-center gap-x-[9px] gap-y-1 text-xs text-base-content/65"
								>
									<span>Questão {q.n}</span>
									<span aria-hidden="true">·</span>
									<span>{q.label}</span>
									<span aria-hidden="true">·</span>
									<!-- Acima de 1,5× a média é onde se pensou mais: âmbar, porque não é erro. -->
									<span class="font-mono {q.ms > msMedia * 1.5 ? 'font-medium text-warning' : ''}"
										>{q.time}</span
									>
								</p>
								{#if q.state === 'pending'}
									<p class="text-[13.5px] leading-normal text-base-content/65">
										Sua resposta escrita foi enviada.
									</p>
								{:else if q.state === 'skipped'}
									<p class="text-[13.5px] leading-normal text-base-content/65">
										Você pulou esta questão.
									</p>
								{:else}
									<p {dir} data-content-lang class="font-content text-[14.5px] leading-normal">
										{q.given}
									</p>
								{/if}
							</div>
							<span class="shrink-0 text-[12.5px] font-bold whitespace-nowrap {stateTone[q.state]}">
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
										<span {dir} data-content-lang class="block font-content text-sm text-success"
											>{q.expected}</span
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

			{#if tally.pending > 0}
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
						A questão de escrita longa vai para o professor corrigir e não entra na conta dos
						{tally.correct} de {total}. Quando ele terminar, o resultado é recalculado.
					</p>
				</div>
			{/if}
		</div>
	</div>
</div>

<footer
	class="flex shrink-0 flex-wrap items-center gap-3 border-t border-line px-5 pt-3.5 pb-[22px] lg:gap-4 lg:px-10 lg:pt-5 lg:pb-[26px]"
>
	<span class="hidden flex-1 text-[12.5px] text-base-content/65 lg:block">
		Nada desta prévia foi salvo: nenhuma tentativa, nenhuma resposta.
	</span>
	<button
		type="button"
		onclick={onrefazer}
		class="btn btn-lg min-h-[50px] flex-1 motion-tap btn-outline text-base font-bold lg:flex-none lg:px-[26px]"
	>
		Responder de novo
	</button>
	<a
		href={fechar}
		class="btn btn-lg min-h-[50px] flex-1 motion-tap btn-primary text-base font-bold no-underline lg:flex-none lg:px-[26px]"
	>
		Fechar a prévia
	</a>
</footer>
