<script lang="ts">
	// Como foi UMA atividade (paginas.md "Resultados"). Os itens vêm ordenados por
	// DIFICULDADE, não pela ordem da atividade: o de cima é o que a turma mais
	// errou, e é ele que decide a próxima aula. À direita, cada tentativa mostra a
	// sequência de questões em barrinhas — dá para ver quem travou no meio sem
	// abrir a tentativa.
	//
	// O professor não vê versão: as tentativas antigas guardam a versão que o
	// aluno viu, e a barrinha de cada uma usa os itens DELA (db.md).
	import { marcarVisto } from '$lib/client/avisos';
	import { resolve } from '$app/paths';
	import Avatar from '$lib/components/Avatar.svelte';
	import { page } from '$app/state';
	import IdiomaTag from '$lib/components/IdiomaTag.svelte';
	import Pagination from '$lib/components/Pagination.svelte';
	import ScoreBar from '$lib/components/ScoreBar.svelte';
	import { withMock } from '$lib/dev/with-mock';
	import { baixarCsv, montarCsv, nomeDeArquivo } from '$lib/csv';

	type ItemState = 'correct' | 'partial' | 'incorrect' | 'pending' | 'empty';
	interface ItemStat {
		id: string;
		index: number;
		interactionLabel: string;
		correct: number;
		partial: number;
		incorrect: number;
	}
	interface AttemptRow {
		id: string;
		initials: string;
		avatar: string | null;
		name: string;
		when: string;
		duration: string;
		itemStates: ItemState[];
	}
	interface Stat {
		value: string;
		label: string;
		tone?: string;
	}
	interface PageData {
		activity: {
			id: string;
			title: string;
			noAr: boolean;
			idioma: string | null;
			convidados: number;
		};
		stats: Stat[];
		items: ItemStat[];
		attempts: AttemptRow[];
	}

	const MOCK: PageData = {
		activity: {
			id: page.params.activityId ?? 'atv_01',
			title: 'Present perfect — turma B',
			noAr: true,
			idioma: 'en-US',
			convidados: 24
		},
		stats: [
			{ value: '18', label: 'tentativas' },
			{ value: '71%', label: 'acerto médio', tone: 'text-success' },
			{ value: '18%', label: 'parcial', tone: 'text-warning' }
		],
		items: [
			{
				id: 'itm_04',
				index: 4,
				interactionLabel: 'escrita',
				correct: 38,
				partial: 30,
				incorrect: 32
			},
			{
				id: 'itm_05',
				index: 5,
				interactionLabel: 'montar frase',
				correct: 66,
				partial: 20,
				incorrect: 14
			},
			{ id: 'itm_01', index: 1, interactionLabel: 'leitura', correct: 91, partial: 5, incorrect: 4 }
		],
		attempts: [
			{
				id: 'att_01',
				initials: 'JP',
				avatar: null,
				name: 'João P.',
				when: 'hoje, 14:20',
				duration: '6 min',
				itemStates: ['correct', 'correct', 'partial', 'correct', 'empty']
			}
		]
	};

	let { data: dataProp }: { data?: Partial<PageData> } = $props();
	const data = $derived(withMock(dataProp, MOCK));

	// Uma turma inteira respondendo gera dezenas de tentativas; a coluna da
	// direita não é lugar para uma lista infinita.
	let pagina = $state(1);
	const POR_PAGINA = 10;
	const naPagina = $derived(data.attempts.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA));

	// `pending` é escrita longa ainda sem nota do professor: não é erro nem acerto,
	// e por isso não leva cor da correção.
	const COR: Record<ItemState, string> = {
		correct: 'bg-success',
		partial: 'bg-warning',
		incorrect: 'bg-error',
		pending: 'bg-base-content/30',
		empty: 'bg-base-300'
	};
	const TEXTO: Record<ItemState, string> = {
		correct: 'certo',
		partial: 'parcial',
		incorrect: 'errado',
		pending: 'sem nota',
		empty: 'sem resposta'
	};
	const resumoDaTentativa = (estados: ItemState[]) =>
		estados.map((e, i) => `questão ${i + 1}: ${TEXTO[e]}`).join(', ');

	function exportar() {
		const maxItens = Math.max(0, ...data.attempts.map((a) => a.itemStates.length));
		baixarCsv(
			`resultados-${nomeDeArquivo(data.activity.title)}`,
			montarCsv(
				[
					'Aluno',
					'Quando',
					'Duração',
					...Array.from({ length: maxItens }, (_, i) => `Questão ${i + 1}`)
				],
				data.attempts.map((a) => [a.name, a.when, a.duration, ...a.itemStates.map((e) => TEXTO[e])])
			)
		);
	}

	// Abrir os resultados conta como ver quem terminou a atividade
	// (docs/notificacoes.md). Na página e não no loader: o loader roda também no
	// pré-carregamento ao passar o ponteiro sobre o link.
	$effect(() => {
		const activityId = page.params.activityId;
		if (activityId) marcarVisto({ secao: 'resultados', activityId });
	});
</script>

<svelte:head><title>{data.activity.title} · Resultados · Spokke</title></svelte:head>

<div class="flex min-h-full flex-col">
	<header
		class="flex flex-none flex-wrap items-center gap-x-3.5 gap-y-2.5 border-b border-line px-4 py-3.5 lg:px-7 lg:py-[15px]"
	>
		<a
			href={resolve('/(studio)/resultados')}
			class="flex flex-none items-center gap-2 px-0.5 py-2 text-[13.5px] font-semibold text-base-content/65 no-underline transition-transform hover:-translate-x-0.5"
			aria-label="Voltar para os resultados"
		>
			<svg class="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true"
				><path
					d="M15 5l-7 7 7 7"
					stroke="currentColor"
					stroke-width="2.2"
					stroke-linecap="round"
					stroke-linejoin="round"
				/></svg
			>
			<span class="hidden lg:inline">Resultados</span>
		</a>
		<div class="min-w-0">
			<h1 class="font-display text-[18px] font-semibold tracking-[-0.02em] lg:text-[23px]">
				{data.activity.title}
			</h1>
			<p
				class="mt-0.75 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-base-content/65"
			>
				<IdiomaTag tag={data.activity.idioma} compacta />
				<span
					>{data.attempts.length}
					{data.attempts.length === 1 ? 'tentativa' : 'tentativas'}{data.activity.convidados > 0
						? ` · ${data.activity.convidados} ${data.activity.convidados === 1 ? 'aluno convidado' : 'alunos convidados'}`
						: ''}</span
				>
			</p>
		</div>
		<span class="min-w-1 flex-1"></span>
		{#if data.activity.noAr}
			<span
				class="flex-none rounded-full bg-primary px-[11px] py-[5px] text-xs font-bold whitespace-nowrap text-primary-content"
				>No ar</span
			>
		{/if}
		<button
			type="button"
			onclick={exportar}
			disabled={data.attempts.length === 0}
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

	<div
		class="flex pagina-studio flex-1 flex-col gap-6.5 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-stretch lg:gap-8.5"
	>
		<div class="flex min-w-0 flex-col">
			<div
				class="mb-6.5 grid grid-cols-2 gap-x-4 gap-y-4.5 lg:flex lg:flex-wrap lg:gap-x-7.5 lg:gap-y-5.5"
			>
				{#each data.stats as stat (stat.label)}
					<div>
						<div
							class="font-display text-[32px] leading-none font-extrabold tracking-[-0.025em] {stat.tone ??
								''}"
						>
							{stat.value}
						</div>
						<div class="mt-1.5 text-[12.5px] text-base-content/65">{stat.label}</div>
					</div>
				{/each}
			</div>

			<h2 class="mb-1 text-[11px] font-bold tracking-[0.09em] text-base-content/65 uppercase">
				Questões ordenadas por dificuldade
			</h2>
			<p class="mb-4 text-[12.5px] leading-normal text-base-content/65">
				O de cima é o que a turma mais errou — é ele que decide a próxima aula.
			</p>

			{#if data.items.length === 0}
				<p
					class="rounded-[14px] border-[1.5px] border-dashed border-line p-5 text-[13.5px] text-base-content/65"
				>
					Esta atividade ainda não tem questões publicadas.
				</p>
			{:else}
				<div class="grid gap-3.5">
					{#each data.items as item, i (item.id)}
						<div>
							<div class="mb-1.75 flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
								<span class="text-[13.5px] font-semibold">Questão {item.index}</span>
								<span class="text-[12.5px] text-base-content/65">{item.interactionLabel}</span>
								<span class="min-w-1 flex-1"></span>
								<span class="font-mono text-[12.5px] text-base-content/65"
									>{item.correct}% certo</span
								>
							</div>
							<ScoreBar
								correct={item.correct}
								partial={item.partial}
								incorrect={item.incorrect}
								height="h-[9px]"
								delay={i * 80}
							/>
						</div>
					{/each}
				</div>
			{/if}

			<span class="min-h-4 flex-1"></span>
			<div
				class="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-4 text-[12.5px] text-base-content/65"
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
			</div>
		</div>

		<aside
			class="flex min-w-0 flex-col border-t border-line pt-5.5 lg:border-s lg:border-t-0 lg:ps-6.5 lg:pt-0"
		>
			<div class="mb-3.25 flex items-baseline justify-between gap-3">
				<h2 class="text-[11px] font-bold tracking-[0.09em] text-base-content/65 uppercase">
					Tentativas recentes
				</h2>
				<span class="text-[12.5px] text-base-content/65">{data.attempts.length}</span>
			</div>
			{#if data.attempts.length === 0}
				<p class="text-[13px] leading-normal text-base-content/65">
					Ninguém respondeu ainda. O link, o QR e o código estão na
					<a href={resolve('/(studio)/atividades/[id]', { id: data.activity.id })}
						>página da atividade</a
					>.
				</p>
			{:else}
				<ul class="grid list-none gap-1.75 p-0">
					{#each naPagina as at (at.id)}
						<li>
							<a
								href={resolve('/(studio)/resultados/[activityId]/[attemptId]', {
									activityId: data.activity.id,
									attemptId: at.id
								})}
								class="flex items-center gap-2.75 rounded-[11px] border border-line bg-base-100 px-3.25 py-2.75 no-underline transition-[transform,border-color,translate,scale] duration-200 hover:translate-x-0.75 hover:border-primary"
							>
								<Avatar
									codigo={at.avatar}
									nome={at.name}
									size={28}
									radius="rounded-full"
									class="flex-none"
								/>
								<span class="min-w-0 flex-1">
									<span class="block truncate text-[13.5px] font-semibold text-base-content"
										>{at.name}</span
									>
									<span class="block text-[11.5px] text-base-content/65"
										>{at.when} · {at.duration}</span
									>
								</span>
								<span
									class="flex flex-none gap-0.5"
									role="img"
									aria-label={resumoDaTentativa(at.itemStates)}
								>
									{#each at.itemStates as s, k (k)}
										<span class="h-4 w-[5px] rounded-[2px] {COR[s]}"></span>
									{/each}
								</span>
							</a>
						</li>
					{/each}
				</ul>
				<Pagination
					bind:pagina
					porPagina={POR_PAGINA}
					total={data.attempts.length}
					rotulo="tentativas"
				/>
			{/if}
			<span class="min-h-3.5 flex-1"></span>
			<p class="border-t border-line pt-3.5 text-[12.5px] leading-normal text-base-content/65">
				Cada barrinha é uma questão, na ordem em que o aluno respondeu.
			</p>
		</aside>
	</div>

	<footer
		class="flex flex-none flex-wrap items-center gap-x-4.5 gap-y-2 border-t border-line px-4 pt-3 pb-4 text-[12.5px] text-base-content/65 lg:px-7 lg:py-3.5"
	>
		<span
			>Tentativas antigas guardam a versão que o aluno viu; publicar de novo não muda nenhuma delas.</span
		>
		<span class="min-w-1 flex-1"></span>
		<a href={resolve('/(site)/ajuda')} class="font-semibold">Como ler estes números</a>
	</footer>
</div>
