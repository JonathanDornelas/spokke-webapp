<script lang="ts">
	// O aluno e o histórico dele. Clicar num nome em qualquer lista do Studio
	// leva para cá. Mesmo molde da turma: cabeçalho com quatro números, blocos
	// numa rolagem, ações no topo.
	//
	// Duas coisas que a tela nunca esconde: quando o aluno não tem e-mail (é
	// cadastro, não conta — ele participa igual, só não recebe convite) e que o
	// histórico só tem o que está LIGADO a ele. Responder pelo link aberto sem
	// abrir o link pessoal é o caminho normal e essas respostas não têm dono.
	import { resolve } from '$app/paths';
	import Avatar from '$lib/components/Avatar.svelte';
	import { invalidateAll } from '$app/navigation';
	import { withMock } from '$lib/dev/with-mock';
	import HeaderCard from '$lib/components/HeaderCard.svelte';
	import Loading from '$lib/components/Loading.svelte';
	import { reenviarConvite } from '../../turmas/turmas.remote';
	import EditarAluno from '../../turmas/EditarAluno.svelte';

	interface Tentativa {
		id: string;
		activityId: string;
		activityTitle: string;
		language: string;
		when: string;
		finished: boolean;
		answered: number;
		itemCount: number;
		name: string;
		score: { correct: number; partial: number; incorrect: number };
		percent: number | null;
	}
	interface PageData {
		student: {
			id: string;
			name: string;
			initials: string;
			avatar: string | null;
			email: string | null;
			createdAt: string;
			/** O último convite dele, para reenviar só para ele. */
			inviteId: string | null;
			/** O último convite voltou — o único estado que pede ação. */
			conviteVoltou: boolean;
			/** A conta do aluno, quando a chamada está ligada a uma. */
			account: { name: string; email: string } | null;
		};
		classroom: { id: string; name: string; badge: string; color: string } | null;
		totals: { attempts: number; finished: number; average: number | null };
		attempts: Tentativa[];
	}

	const MOCK: PageData = {
		student: {
			id: 'alu_01',
			name: 'Juliana Pereira',
			initials: 'JP',
			avatar: null,
			email: 'juliana@escola.br',
			createdAt: '4 de março',
			inviteId: 'cnv_01',
			conviteVoltou: false,
			account: null
		},
		classroom: { id: 'tur_01', name: '7º B — inglês', badge: '7B', color: 'violeta' },
		totals: { attempts: 3, finished: 2, average: 74 },
		attempts: [
			{
				id: 'att_01',
				activityId: 'atv_01',
				activityTitle: 'Present perfect — turma B',
				language: 'Inglês',
				when: 'ontem',
				finished: true,
				answered: 12,
				itemCount: 12,
				name: 'Juliana Pereira',
				score: { correct: 9, partial: 2, incorrect: 1 },
				percent: 75
			}
		] as Tentativa[]
	};

	let { data: dataProp }: { data?: Partial<PageData> } = $props();
	const data = $derived(withMock(dataProp, MOCK));

	// **Editar o cadastro daqui**, na MESMA bandeja da chamada da turma
	// (`turmas/EditarAluno.svelte`): corrigir um e-mail digitado errado a partir
	// desta tela exigia voltar, achar a linha e abrir a edição lá.
	let editando = $state(false);
	/** "Corrigir e-mail e reenviar": o convite voltou, e a caixa de reenviar nasce marcada. */
	let corrigindo = $state(false);

	let reenviando = $state(false);
	let aviso = $state<string | null>(null);
	async function reenviar() {
		if (!data.student.inviteId) return;
		reenviando = true;
		try {
			const r = await reenviarConvite({ inviteId: data.student.inviteId });
			aviso = r.ok ? 'Convite reenviado · a fila está andando' : (r.error ?? null);
			await invalidateAll();
		} finally {
			reenviando = false;
		}
	}

	function largura(parte: number, tentativa: Tentativa): number {
		const total = tentativa.score.correct + tentativa.score.partial + tentativa.score.incorrect;
		return total > 0 ? (parte / total) * 100 : 0;
	}
</script>

<svelte:head><title>{data.student.name} — entendo</title></svelte:head>

<div class="pagina-studio">
	<a
		href={data.classroom
			? resolve('/(studio)/turmas/[id]', { id: data.classroom.id })
			: resolve('/(studio)/turmas')}
		class="mb-4 inline-flex items-center gap-2 py-1 text-[0.84rem] font-semibold text-base-content/65 no-underline transition-transform hover:-translate-x-0.5"
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
		{data.classroom ? data.classroom.name : 'Turmas'}
	</a>

	<!-- ═══ 1. cabeçalho ═══ O acerto médio é o único em violeta, com a regra
	     escrita embaixo — só das terminadas, senão quem parou na segunda questão
	     puxa o número para baixo por um motivo que não é desempenho. -->
	<HeaderCard
		numbers={[
			{ value: data.totals.attempts, label: 'tentativas' },
			{ value: data.totals.finished, label: 'terminadas' },
			{
				value: data.totals.average === null ? '—' : `${data.totals.average}%`,
				label: 'acerto médio · só das terminadas',
				tone: data.totals.average === null ? 'muted' : 'primary'
			},
			{ value: data.classroom ? 1 : 0, label: 'turma' }
		]}
	>
		{#snippet badge()}
			<Avatar
				codigo={data.student.avatar}
				nome={data.student.name}
				size={46}
				radius="rounded-[13px]"
				class="shrink-0"
			/>
		{/snippet}
		<h1 class="mb-1.5 font-display text-[22px] font-semibold tracking-[-0.024em] lg:text-[28px]">
			{data.student.name}
		</h1>
		<div class="flex flex-wrap items-center gap-x-3 gap-y-1.5">
			{#if data.student.email}
				<!-- O endereço quebrado aparece em vermelho, não discreto: é ele que
				     precisa ser corrigido. -->
				<span
					class="font-mono text-[13px] {data.student.conviteVoltou
						? 'font-semibold text-error'
						: 'text-base-content/65'}">{data.student.email}</span
				>
			{:else}
				<!-- Sem e-mail é sobre o CADASTRO, não sobre o aluno faltar: ele
				     participa igual, só entra pelo link aberto ou pelo QR. -->
				<span class="text-[13px] text-base-content/65">sem e-mail — participa pelo link aberto</span
				>
			{/if}
			<span class="text-[13.5px] text-base-content/65"
				>· na turma desde {data.student.createdAt}</span
			>
		</div>
		{#snippet actions()}
			<button
				type="button"
				onclick={() => {
					corrigindo = false;
					editando = true;
				}}
				aria-haspopup="dialog"
				class="btn h-[42px] motion-tap gap-2 btn-plain text-[13.5px]"
			>
				<svg class="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<path
						d="M4 20h4L19 9a2.8 2.8 0 10-4-4L4 16z"
						stroke="currentColor"
						stroke-width="2"
						stroke-linejoin="round"
					/>
				</svg>
				Editar cadastro
			</button>
			{#if data.student.inviteId && data.student.email}
				<button
					type="button"
					onclick={reenviar}
					disabled={reenviando}
					class="btn h-[42px] motion-tap gap-2 btn-outline text-[13.5px] font-bold"
				>
					{#if reenviando}
						<Loading variant="fila" size={11} tone="current" label="Reenviando" />
						Reenviando…
					{:else}
						<svg class="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<path
								d="M3.5 12l17-7.5-3 17-6-5zM11.5 16.5l3-3"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						</svg>
						Reenviar convite
					{/if}
				</button>
			{/if}
		{/snippet}
	</HeaderCard>

	{#if aviso}
		<p
			class="mb-[26px] flex items-center gap-2 rounded-[13px] border border-s-[3px] border-line border-s-primary bg-base-200 px-4 py-3 text-[0.86rem]"
			role="status"
		>
			{aviso}
		</p>
	{/if}

	<!-- ═══ 2. e-mail que voltou — só nesse estado ═══ A mesma faixa vermelha
	     da turma, com a mesma ação. -->
	{#if data.student.conviteVoltou}
		<div
			class="mb-[26px] flex flex-wrap items-center gap-x-3.5 gap-y-3 rounded-[13px] border border-error/32 bg-error/8 px-4 py-3.5"
		>
			<svg class="size-5 shrink-0 text-error" viewBox="0 0 24 24" fill="none" aria-hidden="true">
				<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" />
				<path
					d="M12 7.5v5.5M12 16.5h.01"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
				/>
			</svg>
			<div class="min-w-[220px] flex-1">
				<p class="mb-1 text-[13.5px] font-bold">O último convite voltou</p>
				<p class="text-[12.5px] leading-relaxed text-base-content/65">
					O servidor de <span class="font-mono">{data.student.email}</span> recusou a entrega. Ele não
					recebeu nada.
				</p>
			</div>
			<button
				type="button"
				onclick={() => {
					corrigindo = true;
					editando = true;
				}}
				class="btn h-10 shrink-0 motion-tap rounded-[9px] btn-error text-[13px] font-bold"
				>Corrigir e-mail e reenviar</button
			>
		</div>
	{/if}

	<!-- ═══ 3. conta ligada ═══ Os dois e-mails são verdade: o professor
	     digitou um, o aluno cadastrou outro na conta dele. O convite continua
	     indo para o do cadastro; ele entra com o da conta. -->
	{#if data.student.account}
		<div
			class="mb-[26px] grid gap-3 rounded-[14px] border border-line px-4 py-[15px] lg:flex lg:items-center lg:gap-[22px] lg:px-5 lg:py-4"
		>
			<div class="flex shrink-0 items-center gap-[11px]">
				<span
					class="grid size-8 shrink-0 place-items-center rounded-[10px] bg-accent/13 text-accent"
				>
					<svg class="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
						<path
							d="M10 13.5a4 4 0 005.7 0l3-3a4 4 0 10-5.7-5.7l-1 1M14 10.5a4 4 0 00-5.7 0l-3 3a4 4 0 105.7 5.7l1-1"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
				</span>
				<p class="text-[13.5px] font-bold">Criou conta no entendo</p>
			</div>
			<div class="grid min-w-[260px] flex-1 grid-cols-2 gap-x-4 gap-y-1 lg:gap-x-6 lg:gap-y-1.5">
				<span class="text-[11px] font-bold tracking-[0.09em] text-base-content/65 uppercase"
					>No seu cadastro</span
				>
				<span class="text-[11px] font-bold tracking-[0.09em] text-base-content/65 uppercase"
					>Na conta</span
				>
				<span class="truncate font-mono text-[13px]">{data.student.email ?? '—'}</span>
				<span class="truncate font-mono text-[13px]">{data.student.account.email}</span>
			</div>
			<p
				class="min-w-[220px] flex-1 text-[12.5px] leading-relaxed text-pretty text-base-content/65"
			>
				Os dois são verdade. O convite continua indo para o do cadastro; a entrada é com o da conta.
			</p>
		</div>
	{/if}

	<!-- ═══ 4. histórico ═══ -->
	<section class="mb-[26px]">
		<div class="mb-3.5 flex flex-wrap items-baseline gap-x-3.5 gap-y-2.5">
			<h2 class="font-display text-lg font-semibold lg:text-xl">Histórico por atividade</h2>
			<span class="text-[13px] text-base-content/65">
				{#if data.attempts.length === 0}
					nada ligado a esta ficha ainda
				{:else}
					{data.totals.finished}
					{data.totals.finished === 1 ? 'tentativa terminada' : 'tentativas terminadas'}, ligadas a
					esta ficha
				{/if}
			</span>
		</div>

		{#if data.attempts.length > 0}
			<div class="overflow-hidden rounded-[14px] border border-line">
				<div
					class="hidden grid-cols-[2.4fr_1fr_1fr_1.7fr_62px] gap-4 border-b border-line bg-base-200 px-5 py-[11px] text-[11px] font-bold tracking-[0.09em] text-base-content/65 uppercase lg:grid"
				>
					<span>Atividade</span><span>Quando</span><span>Respondidas</span><span
						>Certo · parcial · errado</span
					><span class="text-end">Acerto</span>
				</div>
				{#each data.attempts as tentativa (tentativa.id)}
					<a
						href={resolve('/(studio)/atividades/[id]', { id: tentativa.activityId })}
						class="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line px-3.5 py-[13px] text-sm text-base-content no-underline transition-colors last:border-0 hover:bg-base-200 lg:grid lg:grid-cols-[2.4fr_1fr_1fr_1.7fr_62px] lg:gap-4 lg:px-5 lg:py-3.5"
					>
						<span class="min-w-0 basis-full lg:basis-auto">
							<span class="mb-[3px] block font-semibold text-pretty">{tentativa.activityTitle}</span
							>
							<span class="block text-xs text-base-content/65">
								{tentativa.language}
								{#if !tentativa.finished}
									· <span class="font-semibold">parou na {tentativa.answered + 1}ª</span>
								{/if}
								{#if tentativa.name !== data.student.name}
									<!-- Tentativa vinculada DEPOIS, feita com outro nome. Dizer isso
									     é o que evita o professor achar que a lista está errada. -->
									· respondeu como "{tentativa.name}"
								{/if}
							</span>
						</span>
						<span class="text-[13px] text-base-content/65">{tentativa.when}</span>
						<span class="font-mono text-[13px] text-base-content/65"
							>{tentativa.answered} de {tentativa.itemCount}</span
						>
						<span class="min-w-0 basis-full lg:basis-auto">
							<!-- Parcial com faixa própria, e os três números escritos: a
							     cor sozinha não comunica correção. -->
							<span class="mb-1.5 flex h-[9px] overflow-hidden rounded-full bg-base-300">
								<span
									class="bg-success"
									style="width: {largura(tentativa.score.correct, tentativa)}%"
								></span>
								<span
									class="bg-warning"
									style="width: {largura(tentativa.score.partial, tentativa)}%"
								></span>
								<span
									class="bg-error"
									style="width: {largura(tentativa.score.incorrect, tentativa)}%"
								></span>
							</span>
							<span class="flex gap-3 font-mono text-[11.5px]">
								<span class="text-success">{tentativa.score.correct}</span>
								<span class="text-warning">{tentativa.score.partial}</span>
								<span class="text-error">{tentativa.score.incorrect}</span>
							</span>
						</span>
						<span
							class="ms-auto font-display text-lg font-extrabold tracking-[-0.02em] lg:ms-0 lg:text-end"
						>
							{tentativa.percent === null ? '—' : `${tentativa.percent}%`}
						</span>
					</a>
				{/each}
			</div>
		{:else}
			<!-- O vazio diz POR QUE está vazio: "nada respondido" e "respondeu por
			     fora do convite" parecem a mesma coisa na tela e são coisas
			     diferentes no banco. -->
			<div class="rounded-[14px] border border-dashed border-line px-5 py-[26px] text-center">
				<p class="mb-[7px] text-[15px] font-bold">Ainda não respondeu nada por aqui</p>
				<p
					class="mx-auto max-w-[60ch] text-[13.5px] leading-relaxed text-pretty text-base-content/65"
				>
					{#if data.student.email}
						Está na turma e recebe os convites.
					{:else}
						Está na turma e entra pelo link aberto.
					{/if}
					Se tiver respondido pelo link aberto, sem passar pelo link pessoal do convite, a tentativa vale
					para a turma e fica fora desta lista.
				</p>
			</div>
		{/if}
	</section>

	<!-- ═══ 5. o que esta lista não mostra ═══ Dito em TEXTO, e depois da
	     lista: quem procura uma tentativa que não está aqui precisa saber por
	     quê antes de achar que a tela perdeu dado. -->
	<div
		class="flex gap-3.5 rounded-[13px] border border-line bg-base-200 px-4 py-3.5 lg:px-[19px] lg:py-[17px]"
	>
		<svg
			class="mt-0.5 size-[18px] shrink-0 text-accent"
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
		<div class="min-w-0">
			<p class="mb-[5px] text-[13.5px] font-bold">
				Esta lista só tem o que está ligado a este aluno
			</p>
			<p class="text-[12.5px] leading-relaxed text-pretty text-base-content/65">
				Quando o aluno responde pelo link aberto sem abrir o link pessoal do convite, a tentativa
				continua contando para a turma e aparece nos resultados da atividade — mas sem dono, e por
				isso não entra aqui. Isso é normal, não é dado faltando.
			</p>
		</div>
	</div>
</div>

<EditarAluno
	aberta={editando}
	onfechar={() => (editando = false)}
	aluno={data.student}
	{corrigindo}
	emailDaConta={data.student.account?.email ?? null}
	onsalvo={(texto) => (aviso = texto)}
/>
