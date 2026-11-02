<script lang="ts">
	// Revisão do aluno — o destino do "Rever minhas respostas" do resultado.
	// Mesma semântica de correção do resto do produto: ícone e texto, nunca só
	// cor (design-system.md). A resposta certa só aparece porque o professor
	// liberou o resultado ao publicar; sem isso o loader nem deixa entrar.
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import AmbientShapes from '$lib/components/AmbientShapes.svelte';
	import CorrectionIcon from '$lib/components/CorrectionIcon.svelte';
	import { withMock } from '$lib/dev/with-mock';

	type AnswerState = 'correct' | 'partial' | 'incorrect' | 'pending';
	interface Answer {
		id: string;
		index: number;
		prompt: string;
		label: string;
		given: string;
		expected?: string;
		state: AnswerState;
	}
	interface PageData {
		activity: { slug: string; title: string; itemCount: number; dir: 'ltr' | 'rtl' };
		student: { name: string };
		tally: { correct: number; partial: number; incorrect: number };
		answers: Answer[];
	}

	const MOCK: PageData = {
		activity: {
			slug: page.params.slug ?? 'present-perfect-b',
			title: 'Present perfect — turma B',
			itemCount: 5,
			dir: 'ltr' as const
		},
		student: { name: 'Aluno' },
		tally: { correct: 3, partial: 1, incorrect: 1 },
		answers: [
			{
				id: 'itm_01',
				index: 1,
				prompt: 'Monte a frase.',
				label: 'montar frase',
				given: 'She has been working here since 2019.',
				state: 'correct'
			},
			{
				id: 'itm_03',
				index: 3,
				prompt: 'Complete a frase.',
				label: 'completar lacuna',
				given: 'has ben',
				expected: 'has been',
				state: 'partial'
			}
		] as Answer[]
	};

	let { data: dataProp }: { data?: Partial<PageData> } = $props();
	const data = $derived(withMock(dataProp, MOCK));

	const border: Record<AnswerState, string> = {
		correct: 'border-s-success',
		partial: 'border-s-warning',
		incorrect: 'border-s-error',
		pending: ''
	};
	const rotulo: Record<AnswerState, string> = {
		correct: 'Correto',
		partial: 'Quase',
		incorrect: 'Incorreto',
		pending: 'Aguardando correção'
	};
	const tom: Record<AnswerState, string> = {
		correct: 'text-success',
		partial: 'text-warning',
		incorrect: 'text-error',
		pending: 'text-base-content/65'
	};

	const contagens = $derived([
		{ state: 'correct' as const, n: data.tally.correct, palavra: 'certas' },
		{ state: 'partial' as const, n: data.tally.partial, palavra: 'quase' },
		{ state: 'incorrect' as const, n: data.tally.incorrect, palavra: 'erradas' }
	]);
</script>

<svelte:head><title>Suas respostas — {data.activity.title}</title></svelte:head>

<div class="relative flex min-h-0 flex-1 flex-col overflow-y-auto px-gutter py-gutter">
	<AmbientShapes edges="both" />

	<div class="relative z-1 mx-auto w-full max-w-[620px] animate-entrada">
		<a
			href={resolve('/a/[slug]/resultado', { slug: data.activity.slug })}
			class="mb-4 inline-flex items-center gap-2 py-2 text-[13.5px] font-semibold text-base-content/65 no-underline transition-transform hover:-translate-x-0.5"
		>
			<svg class="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
				<path
					d="M15 5l-7 7 7 7"
					stroke="currentColor"
					stroke-width="2.2"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			</svg>
			Resultado
		</a>

		<h1 class="mb-2.5 font-display text-title font-semibold tracking-[-0.025em] text-pretty">
			Suas respostas
		</h1>
		<p class="mb-5 text-[14.5px] leading-relaxed text-base-content/65">
			{data.student.name} · {data.answers.length} de {data.activity.itemCount} questões respondidas
		</p>

		<div class="mb-6 flex gap-5">
			{#each contagens as c (c.state)}
				<div>
					<div class="font-display text-2xl leading-none font-extrabold {tom[c.state]}">{c.n}</div>
					<div class="mt-1 text-[11.5px] text-base-content/65">{c.palavra}</div>
				</div>
			{/each}
		</div>

		<ul class="grid list-none gap-2.5 p-0">
			{#each data.answers as a (a.id)}
				<li
					class="min-w-0 rounded-box border border-line px-4 py-3.5
					       {a.state === 'pending' ? 'border-dashed bg-base-200' : 'border-s-[3px] ' + border[a.state]}"
				>
					<div class="mb-2 flex items-center gap-2.5">
						<span class="font-mono text-[12px] text-base-content/60">{a.index}</span>
						<span class="min-w-0 flex-1 truncate text-[12.5px] text-base-content/65"
							>{a.prompt} · {a.label}</span
						>
						<span class="flex shrink-0 items-center gap-1.5 text-xs font-bold {tom[a.state]}">
							<CorrectionIcon state={a.state} size={16} />
							{rotulo[a.state]}
						</span>
					</div>

					<p class="mb-0.5 text-[11px] font-bold tracking-[0.08em] text-base-content/65 uppercase">
						Sua resposta
					</p>
					<p dir={data.activity.dir} class="font-content text-[15px] break-words">
						{a.given || '—'}
					</p>

					{#if a.expected}
						<p
							class="mt-2.5 mb-0.5 text-[11px] font-bold tracking-[0.08em] text-base-content/65 uppercase"
						>
							Resposta certa
						</p>
						<p dir={data.activity.dir} class="font-content text-[15px] break-words text-success">
							{a.expected}
						</p>
					{/if}
				</li>
			{:else}
				<li
					class="rounded-box border-[1.5px] border-dashed border-line bg-base-200 p-[26px] text-center"
				>
					<p class="mb-1.5 font-display text-[17px] font-semibold">Nenhuma resposta ainda</p>
					<p class="text-[13px] leading-snug text-base-content/65">
						Assim que você responder as questões, elas aparecem aqui.
					</p>
				</li>
			{/each}
		</ul>
	</div>
</div>
