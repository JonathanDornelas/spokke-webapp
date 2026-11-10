<script lang="ts">
	// Tentativa de um aluno — e a tela de CORREÇÃO. Não existe mais uma fila à
	// parte: ver a resposta, comentar e dar a nota de rubrica acontecem aqui, no
	// mesmo lugar, porque decidir sem ver o resto da tentativa era o que a fila
	// obrigava (paginas.md "Resultados").
	//
	// Apagar aqui é como o direito de exclusão do aluno se exerce: o pedido é
	// dele, a ação é do professor (auth.md "Dados do aluno e LGPD").
	import { goto, invalidateAll } from '$app/navigation';
	import Avatar from '$lib/components/Avatar.svelte';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import CorrectionIcon from '$lib/components/CorrectionIcon.svelte';
	import Loading from '$lib/components/Loading.svelte';
	import { withMock } from '$lib/dev/with-mock';
	import { apagarTentativa, comentarResposta } from '../../resultados.remote';

	type AnswerState = 'correct' | 'partial' | 'incorrect' | 'pending';
	type RubricGrade = 'fail' | 'partial' | 'pass';
	interface Answer {
		id: string;
		answerId: string | null;
		index: number;
		itemLabel: string;
		instruction: string;
		given: string;
		expected: string;
		porRubrica: boolean;
		state: AnswerState;
		respondida: boolean;
		comment: string;
		reviewedScore: number | null;
		reviewed: boolean;
		skill: string;
		/**
		 * A gravação do aluno, quando ele autorizou guardar. `src` é uma rota do
		 * Studio que confere o dono antes de servir — o objeto no bucket é
		 * privado, ao contrário do áudio da atividade.
		 */
		audio: { src: string; diasAteExpirar: number } | null;
	}
	interface PageData {
		activity: { id: string; title: string; dir: 'ltr' | 'rtl' };
		attempt: {
			id: string;
			name: string;
			initials: string;
			avatar: string | null;
			when: string;
			duration: string;
			studentId: string | null;
		};
		tally: { correct: number; partial: number; incorrect: number; pending: number };
		/** Quando as gravações desta tentativa somem. `null` quando não há nenhuma. */
		audioExpira: { quantidade: number; emDias: number } | null;
		answers: Answer[];
	}

	const MOCK: PageData = {
		activity: {
			id: page.params.activityId ?? 'atv_01',
			title: 'Present perfect — turma B',
			dir: 'ltr' as const
		},
		attempt: {
			id: page.params.attemptId ?? 'att_01',
			name: 'João M.',
			initials: 'JM',
			avatar: null,
			when: 'há 2h',
			duration: '6min',
			studentId: null
		},
		tally: { correct: 3, partial: 1, incorrect: 1, pending: 1 },
		audioExpira: null,
		answers: [
			{
				id: 'ans_01',
				answerId: 'ans_01',
				index: 1,
				itemLabel: 'Montar a frase a partir da tradução',
				instruction: 'Monte a frase',
				given: 'She has been working here since 2019.',
				expected: 'She has been working here since 2019.',
				porRubrica: false,
				state: 'correct',
				respondida: true,
				comment: '',
				reviewedScore: null,
				reviewed: false,
				skill: 'reading'
			},
			{
				id: 'ans_05',
				answerId: 'ans_05',
				index: 2,
				itemLabel: 'Digitar a resposta · criada por você',
				instruction: 'Escreva 3 frases sobre o que você já fez hoje.',
				given: 'I have already had breakfast. I have cleaned my room.',
				expected: '',
				porRubrica: true,
				state: 'pending',
				respondida: true,
				comment: '',
				reviewedScore: null,
				reviewed: false,
				skill: 'writing'
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
	const label: Record<AnswerState, string> = {
		correct: 'Correto',
		partial: 'Parcial',
		incorrect: 'Incorreto',
		pending: 'A comentar'
	};
	const tone: Record<AnswerState, string> = {
		correct: 'text-success',
		partial: 'text-warning',
		incorrect: 'text-error',
		pending: 'text-base-content/65'
	};

	const rubric: { id: RubricGrade; label: string; nota: number; cls: string }[] = [
		{
			id: 'fail',
			label: 'Não atende',
			nota: 0,
			cls: 'border-error bg-error/10 text-error'
		},
		{
			id: 'partial',
			label: 'Atende em parte',
			nota: 0.5,
			cls: 'border-warning bg-warning/12 text-warning'
		},
		{ id: 'pass', label: 'Atende', nota: 1, cls: 'border-success bg-success/12 text-success' }
	];

	const tallyRows = $derived([
		{ state: 'correct' as const, n: data.tally.correct, word: 'certos' },
		{ state: 'partial' as const, n: data.tally.partial, word: 'parciais' },
		{ state: 'incorrect' as const, n: data.tally.incorrect, word: 'errados' },
		...(data.tally.pending > 0
			? [{ state: 'pending' as const, n: data.tally.pending, word: 'a comentar' }]
			: [])
	]);

	// Qual resposta está aberta para comentar. Uma por vez: a fila antiga tinha
	// um formulário só na tela e era isso que funcionava — o que faltava era
	// poder escolher QUAL resposta comentar, e ver as outras ao lado.
	let abertoId = $state<string | null>(null);
	let rascunho = $state('');
	let nota = $state<RubricGrade | null>(null);
	let salvandoId = $state<string | null>(null);
	let apagando = $state(false);
	let confirmandoApagar = $state(false);

	function abrir(a: Answer) {
		if (!a.answerId) return;
		abertoId = abertoId === a.id ? null : a.id;
		rascunho = a.comment;
		nota = rubric.find((r) => r.nota === a.reviewedScore)?.id ?? null;
	}

	async function salvar(a: Answer) {
		if (!a.answerId) return;
		salvandoId = a.id;
		try {
			await comentarResposta({
				answerId: a.answerId,
				comment: rascunho,
				// `undefined` mantém a nota que estava; só mando `grade` quando o
				// item é por rubrica e o professor escolheu alguma.
				grade: a.porRubrica ? nota : undefined
			});
			abertoId = null;
			await invalidateAll();
		} finally {
			salvandoId = null;
		}
	}

	async function apagar() {
		apagando = true;
		try {
			await apagarTentativa({ attemptId: data.attempt.id });
			await goto(resolve('/(studio)/resultados/[activityId]', { activityId: data.activity.id }));
		} finally {
			apagando = false;
		}
	}
</script>

<svelte:head
	><title>Tentativa de {data.attempt.name} · {data.activity.title} · Spokke</title></svelte:head
>

<div>
	<div
		class="flex flex-wrap items-center gap-3.5 border-b border-line px-4 py-3.5 lg:px-7 lg:py-[18px]"
	>
		<a
			href={resolve('/(studio)/resultados/[activityId]', { activityId: data.activity.id })}
			class="flex items-center gap-2 py-2 text-[13.5px] font-semibold text-base-content/65 no-underline transition-transform hover:-translate-x-0.5"
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
			{data.activity.title}
		</a>
		<Avatar codigo={data.attempt.avatar} nome={data.attempt.name} size={38} radius="rounded-full" />
		<div>
			{#if data.attempt.studentId}
				<!-- Clicar no nome de um aluno abre o histórico dele, de qualquer
				     lista (paginas.md "Turmas e alunos"). -->
				<a
					href={resolve('/(studio)/alunos/[id]', { id: data.attempt.studentId })}
					class="font-display text-xl font-semibold text-base-content no-underline hover:text-primary"
				>
					{data.attempt.name}
				</a>
			{:else}
				<h1 class="font-display text-xl font-semibold">{data.attempt.name}</h1>
			{/if}
			<p class="text-[12.5px] text-base-content/65">
				{data.attempt.when} · {data.attempt.duration}
			</p>
			{#if data.audioExpira}
				<!-- **O prazo das gravações, no topo.** Diferente do áudio da
				     atividade, este NÃO se regenera: é a voz de uma pessoa, gravada
				     uma vez. Se o professor for dar retorno de pronúncia, é agora —
				     e o aviso precisa estar onde ele decide, não escondido em cada
				     resposta. -->
				<p
					class="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-warning/12 px-2.5 py-1 text-[11.5px] font-semibold text-warning"
				>
					<svg class="size-[13px] shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
						<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" />
						<path
							d="M12 7.5V12l3 2"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
					{data.audioExpira.quantidade}
					{data.audioExpira.quantidade === 1 ? 'gravação some' : 'gravações somem'}
					{data.audioExpira.emDias === 0
						? 'hoje'
						: data.audioExpira.emDias === 1
							? 'amanhã'
							: `em ${data.audioExpira.emDias} dias`}
				</p>
			{/if}
		</div>
		<div class="flex-1"></div>
		<div class="flex items-center gap-5">
			{#each tallyRows as row (row.state)}
				<div class="text-end">
					<div class="font-display text-2xl leading-none font-extrabold {tone[row.state]}">
						{row.n}
					</div>
					<div class="mt-1 text-[11.5px] text-base-content/65">{row.word}</div>
				</div>
			{/each}
		</div>
		<button
			type="button"
			onclick={() => (confirmandoApagar = true)}
			class="btn btn-sm motion-tap gap-2 border-error/40 bg-transparent font-semibold text-error hover:bg-error/8"
		>
			<svg class="size-[15px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
				<path
					d="M4 6.5h16M9.5 6.5V4.5h5v2M6.5 6.5l1 13h9l1-13"
					stroke="currentColor"
					stroke-width="1.8"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			</svg>
			Apagar tentativa
		</button>
	</div>

	<div class="pagina-studio">
		<p class="mb-3.5 text-[12.5px] text-base-content/65">
			Clique numa resposta para comentar. O comentário é seu retorno para o aluno; nas respostas de
			escrita por rubrica a nota também sai daqui.
		</p>

		<ul class="grid list-none gap-2 p-0">
			{#each data.answers as a (a.id)}
				{@const aberto = abertoId === a.id}
				<li
					class="rounded-box border border-line transition-colors
					       {a.state === 'pending' ? 'border-dashed bg-base-200' : 'border-s-[3px] ' + border[a.state]}
					       {aberto ? 'border-primary' : ''}"
				>
					<button
						type="button"
						onclick={() => abrir(a)}
						disabled={!a.answerId}
						class="flex w-full items-center gap-3.5 px-4 py-3.5 text-start disabled:cursor-default"
					>
						<span class="w-5 shrink-0 font-mono text-xs text-base-content/65">{a.index}</span>
						<span class="min-w-0 flex-1">
							<span class="mb-1 block text-[12.5px] text-base-content/65">{a.itemLabel}</span>
							{#if a.respondida}
								<span
									class="block truncate font-content text-[15px] text-base-content"
									dir={data.activity.dir}
								>
									{a.given || '—'}
								</span>
							{:else}
								<span class="block text-[13.5px] text-base-content/50">Não respondida</span>
							{/if}
							{#if a.comment && !aberto}
								<span class="mt-1 block truncate text-[12.5px] text-primary">
									Seu comentário: {a.comment}
								</span>
							{/if}
						</span>
						<span
							class="flex shrink-0 items-center gap-1.5 text-[13px] font-bold whitespace-nowrap {tone[
								a.state
							]}"
						>
							<CorrectionIcon state={a.state} size={17} />
							{label[a.state]}
						</span>
					</button>

					{#if aberto}
						<div class="border-t border-line px-4 py-3.5">
							{#if a.instruction}
								<p class="mb-2 text-[12.5px] font-semibold text-base-content/65">
									{a.instruction}
								</p>
							{/if}
							<p
								class="mb-3 rounded-field border border-line bg-base-200 p-3.5 font-content text-[15px] leading-relaxed"
								dir={data.activity.dir}
							>
								{a.given || '—'}
							</p>
							{#if a.audio}
								<!-- A gravação do aluno. Ela não substitui a transcrição acima:
								     o que o serviço ENTENDEU e o que ele DISSE são coisas
								     diferentes, e é justamente na diferença entre as duas que
								     mora o retorno de pronúncia. -->
								<div class="mb-3 rounded-field border border-line bg-base-100 p-3">
									<p
										class="mb-2 flex items-center gap-2 text-[11px] font-bold tracking-[0.08em] text-base-content/65 uppercase"
									>
										<svg class="size-[15px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
											<rect
												x="9"
												y="2.5"
												width="6"
												height="11"
												rx="3"
												stroke="currentColor"
												stroke-width="2"
											/>
											<path
												d="M5.5 11.5a6.5 6.5 0 0013 0M12 18v3.5"
												stroke="currentColor"
												stroke-width="2"
												stroke-linecap="round"
											/>
										</svg>
										A voz do aluno
									</p>
									<audio controls preload="none" src={a.audio.src} class="w-full"></audio>
									<p class="mt-1.5 text-[11.5px] text-base-content/65">
										Some {a.audio.diasAteExpirar === 0
											? 'hoje'
											: a.audio.diasAteExpirar === 1
												? 'amanhã'
												: `em ${a.audio.diasAteExpirar} dias`}.
									</p>
								</div>
							{/if}

							{#if a.expected}
								<p class="mb-3 text-[12.5px] text-base-content/65">
									Esperado:
									<span class="font-content text-base-content" dir={data.activity.dir}
										>{a.expected}</span
									>
								</p>
							{/if}

							{#if a.porRubrica}
								<div class="mb-3 flex flex-wrap items-center gap-2.5">
									<span class="text-[12.5px] font-semibold text-base-content/65">Rubrica:</span>
									{#each rubric as r (r.id)}
										<button
											type="button"
											onclick={() => (nota = nota === r.id ? null : r.id)}
											aria-pressed={nota === r.id}
											class="rounded-full px-3 py-1.5 text-[12.5px] font-bold transition-transform duration-150 hover:-translate-y-0.5
											       {nota === r.id
												? 'border-[1.5px] ' + r.cls
												: 'border border-line bg-base-200 text-base-content/65'}"
										>
											{r.label}
										</button>
									{/each}
								</div>
							{/if}

							<textarea
								bind:value={rascunho}
								rows="3"
								class="mb-3 textarea w-full text-sm leading-relaxed"
								placeholder="Comentário para o aluno (opcional)"></textarea>

							<div class="flex flex-wrap items-center gap-2.5">
								<button
									type="button"
									onclick={() => salvar(a)}
									disabled={salvandoId !== null ||
										(a.porRubrica && nota === null && !rascunho.trim())}
									class="btn btn-sm min-h-10 motion-tap gap-2 btn-primary font-bold"
								>
									{#if salvandoId === a.id}
										<Loading variant="fila" size={11} tone="current" label="Salvando" />
										Salvando…
									{:else}
										Salvar retorno
									{/if}
								</button>
								<button
									type="button"
									onclick={() => (abertoId = null)}
									class="btn btn-sm min-h-10 motion-tap btn-ghost font-semibold">Fechar</button
								>
								{#if a.porRubrica}
									<span class="text-[12.5px] text-base-content/65">
										Sem rubrica a resposta continua "a comentar" — ela não tem nota automática.
									</span>
								{/if}
							</div>
						</div>
					{/if}
				</li>
			{/each}
		</ul>

		{#if confirmandoApagar}
			<div
				class="mt-4 flex gap-3 rounded-box border border-s-[3px] border-line border-s-error bg-base-200 px-4 py-3.5"
				role="alertdialog"
				aria-label="Confirmar exclusão"
			>
				<svg
					class="size-[18px] shrink-0 text-error"
					viewBox="0 0 24 24"
					fill="none"
					aria-hidden="true"
				>
					<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" />
					<path
						d="M12 7.5v6M12 16.5h.01"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
					/>
				</svg>
				<p class="flex-1 text-[13px] leading-snug">
					Apagar a tentativa remove o nome, as respostas e o áudio gravado. É como um aluno, ou o
					responsável por ele, exerce o direito de exclusão — a ação é sua, o pedido é dele.
				</p>
				<div class="flex items-center gap-2.5">
					<button
						type="button"
						onclick={() => (confirmandoApagar = false)}
						class="btn btn-sm motion-tap btn-neutral font-semibold whitespace-nowrap"
						>Cancelar</button
					>
					<button
						type="button"
						onclick={apagar}
						disabled={apagando}
						class="btn btn-sm motion-tap gap-2 border-none bg-error font-bold whitespace-nowrap text-error-content"
					>
						{#if apagando}
							<Loading variant="fila" size={11} tone="current" label="Apagando" />
							Apagando…
						{:else}
							Apagar mesmo assim
						{/if}
					</button>
				</div>
			</div>
		{:else}
			<div
				class="mt-4 flex gap-3 rounded-box border border-s-[3px] border-line border-s-primary bg-base-200 px-4 py-3.5"
			>
				<svg
					class="size-[18px] shrink-0 text-primary"
					viewBox="0 0 24 24"
					fill="none"
					aria-hidden="true"
				>
					<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" />
					<path
						d="M12 11v5.5M12 7.5h.01"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
					/>
				</svg>
				<p class="text-[13px] leading-snug">
					A nota que você dá numa rubrica fica guardada separada da correção automática — dá para
					mudar de ideia sem que a resposta perca o que a máquina achou dela.
				</p>
			</div>
		{/if}
	</div>
</div>
