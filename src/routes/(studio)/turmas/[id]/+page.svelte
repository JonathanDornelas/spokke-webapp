<script lang="ts">
	import Alternador from '$lib/components/Alternador.svelte';
	// A turma. Três blocos numa rolagem: o cabeçalho com os quatro números que
	// importam, a chamada com o estado no último envio, e o histórico de envios.
	//
	// "22 com e-mail" fica em violeta porque é o número que vai RECEBER convite;
	// o total de 24 não é. Cada estado de aluno tem ícone e texto — verde e
	// âmbar não entram (são a semântica de correção) e vermelho aparece só no
	// e-mail que voltou, o único que pede ação.
	import { resolve } from '$app/paths';
	import Avatar from '$lib/components/Avatar.svelte';
	import Loading from '$lib/components/Loading.svelte';
	import Pagination from '$lib/components/Pagination.svelte';
	import HeaderCard from '$lib/components/HeaderCard.svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { withMock } from '$lib/dev/with-mock';
	import { CLASSE_DA_ETIQUETA, corOuPadrao, type CorDeEtiqueta } from '$lib/etiquetas';
	import { PILULA_DO_ESTADO } from '$lib/modulos/estado';
	import IdiomaTag from '$lib/components/IdiomaTag.svelte';
	import { baixarCsv, montarCsv, nomeDeArquivo } from '$lib/csv';
	import EditarTurma from './EditarTurma.svelte';
	import EnviarAtividade from './EnviarAtividade.svelte';
	import AdicionarAluno from './AdicionarAluno.svelte';
	import EditarAluno from '../EditarAluno.svelte';

	import { apagarTurma, removerAluno, reenviarConvite, reenviarNaoAbertos } from '../turmas.remote';

	type EstadoAluno =
		'terminou' | 'comecou' | 'enviado' | 'disponivel' | 'sem-envio' | 'sem-email' | 'voltou';
	interface Aluno {
		id: string;
		name: string;
		initials: string;
		avatar: string | null;
		email: string | null;
		state: EstadoAluno;
		/** O convite mais recente dele, para reenviar só para ele. */
		inviteId: string | null;
		/** Já ligou a chamada a uma conta dele, abrindo o convite logado. */
		temConta: boolean;
	}
	interface Envio {
		id: string;
		activityId: string;
		activityTitle: string;
		/** O módulo de onde veio, quando o envio foi de um módulo inteiro. */
		moduleName: string | null;
		/** Falso no envio de módulo "só disponibilizar": ninguém recebeu e-mail. */
		porEmail: boolean;
		when: string;
		invites: number;
		opened: number;
		started: number;
		finished: number;
		unopened: number;
	}
	interface ModuloDaTurma {
		allocationId: string;
		moduleId: string;
		name: string;
		badge: string;
		color: CorDeEtiqueta;
		estado: 'sem' | 'ativa' | 'pausada' | 'concluida' | 'falha';
		resumo: string;
	}
	interface PageData {
		classroom: {
			id: string;
			name: string;
			badge: string;
			color: string;
			languageLabel: string | null;
			idioma: string | null;
			createdAt: string;
		};
		totals: { students: number; withEmail: number; deliveries: number; bounced: number };
		lastDelivery: {
			id: string;
			activityTitle: string;
			when: string;
			porEmail: boolean;
			unopened: number;
		} | null;
		students: Aluno[];
		tally: Record<EstadoAluno, number>;
		deliveries: Envio[];
		modulos: ModuloDaTurma[];
	}

	const MOCK: PageData = {
		classroom: {
			id: 'tur_01',
			name: '7º B — inglês',
			badge: '7B',
			color: 'violeta',
			languageLabel: 'Inglês',
			idioma: 'en-US',
			createdAt: '12 de fevereiro'
		},
		totals: { students: 3, withEmail: 2, deliveries: 1, bounced: 0 },
		lastDelivery: null,
		students: [
			{
				id: 'alu_01',
				name: 'Juliana Pereira',
				initials: 'JP',
				avatar: null,
				email: 'juliana.p@escola.com.br',
				state: 'enviado',
				inviteId: 'cnv_01',
				temConta: true
			},
			{
				id: 'alu_02',
				name: 'Bruna Okamoto',
				initials: 'BO',
				avatar: null,
				email: null,
				state: 'sem-email',
				inviteId: null,
				temConta: false
			}
		] as Aluno[],
		tally: {
			terminou: 0,
			comecou: 0,
			enviado: 1,
			disponivel: 0,
			'sem-envio': 0,
			'sem-email': 1,
			voltou: 0
		},
		deliveries: [] as Envio[],
		modulos: [] as ModuloDaTurma[]
	};

	let { data: dataProp }: { data?: Partial<PageData> } = $props();
	const data = $derived(withMock(dataProp, MOCK));

	// Uma turma de escola passa fácil de trinta alunos, e a chamada inteira
	// numa lista só vira rolagem sem fim.
	let paginaAlunos = $state(1);
	const ALUNOS_POR_PAGINA = 15;
	const alunosNaPagina = $derived(
		data.students.slice((paginaAlunos - 1) * ALUNOS_POR_PAGINA, paginaAlunos * ALUNOS_POR_PAGINA)
	);

	// **No celular, um bloco por vez.** No desktop alunos e envios cabem na
	// mesma rolagem; numa tela de telefone empilhar as duas listas vira uma
	// rolagem infinita, então um seletor escolhe qual aparece.
	let bloco = $state<'alunos' | 'envios'>('alunos');
	// **Criar e editar abrem em BANDEJA** (components.md "Bandeja"): a chamada e
	// os envios continuam à vista atrás do véu, em vez de um formulário abrir no
	// meio da página empurrando a lista para baixo.
	let editarAberta = $state(false);
	let envioAberto = $state(false);
	let novoAlunoAberto = $state(false);
	let confirmandoApagar = $state(false);
	let reenviando = $state(false);

	/** Quantos convites o último envio pôs na fila — a confirmação com o número real. */
	let enviados = $state<number | null>(null);
	async function aoEnviar(n: number) {
		enviados = n;
		await invalidateAll();
	}

	// Ícone + texto por estado. Nenhum verde, nenhum âmbar: essas duas cores
	// são de correção e usá-las aqui confundiria "terminou" com "acertou".
	// "Voltou" é sólido porque é o único que pede ação — e porque 12px em
	// negrito sobre uma tintura de 13% não chega aos 4.5:1.
	const estados: Record<
		EstadoAluno,
		{ label: string; pill: string; legenda: string; icon: string }
	> = {
		terminou: {
			label: 'Terminou',
			pill: 'bg-primary text-primary-content',
			legenda: 'bg-primary',
			icon: 'M5 12.5l4.5 4.5L19 7'
		},
		comecou: {
			label: 'Começou',
			pill: 'bg-base-300 text-primary',
			legenda: 'bg-primary/45',
			icon: 'M12 3a9 9 0 109 9h-9z'
		},
		enviado: {
			label: 'Enviado',
			pill: 'border border-line bg-base-200 text-base-content/65',
			legenda: 'bg-base-300',
			icon: 'M3.5 12l17-7.5-3 17-6-5z'
		},
		// Recebeu pelo módulo SEM e-mail: a atividade está no mapa dele e ninguém o
		// avisou. Neutro, como "Enviado" — não é pendência do professor.
		disponivel: {
			label: 'Disponível',
			pill: 'border border-line bg-base-200 text-base-content/65',
			legenda: 'border border-line bg-base-200',
			icon: 'M7 11V8a5 5 0 019.6-2M5.5 11h13v9.5h-13z'
		},
		// Tem e-mail e ainda não recebeu nada: o estado é da TURMA, não do
		// cadastro. Marcar isso como "sem e-mail" era mentira sobre o cadastro.
		'sem-envio': {
			label: 'Vai receber',
			pill: 'border border-line bg-base-100 text-base-content/65',
			legenda: 'border border-line bg-base-100',
			icon: 'M12 7.5V12l3 2M12 20.5a8.5 8.5 0 100-17 8.5 8.5 0 000 17z'
		},
		'sem-email': {
			label: 'Sem e-mail',
			pill: 'border-[1.5px] border-dashed border-line bg-transparent text-base-content/65',
			legenda: 'border-[1.5px] border-dashed border-base-content/65',
			icon: 'M4.5 6.5h15v11h-15zM5 7l7 6 7-6'
		},
		voltou: {
			label: 'Voltou',
			pill: 'bg-error text-error-content',
			legenda: 'bg-error',
			icon: 'M12 7.5v6M12 16.5h.01M12 3l9.5 17H2.5z'
		}
	};

	const legenda = $derived(
		(
			[
				'terminou',
				'comecou',
				'enviado',
				'disponivel',
				'sem-envio',
				'sem-email',
				'voltou'
			] as EstadoAluno[]
		)
			.map((estado) => ({ estado, n: data.tally[estado] }))
			.filter((linha) => linha.n > 0)
	);

	// Um id, não um booleano: são N linhas na tela e um booleano faria todas
	// piscarem juntas.
	let apagandoId = $state<string | null>(null);
	/**
	 * Apagar um aluno pede confirmação NA LINHA, com a consequência escrita — o
	 * `confirm()` do navegador não diz o que vai junto e não segue o tema.
	 */
	let confirmandoAluno = $state<string | null>(null);
	async function apagarAluno(id: string) {
		apagandoId = id;
		try {
			await removerAluno({ studentId: id });
			confirmandoAluno = null;
			await invalidateAll();
		} catch {
			aviso = 'Não deu para apagar agora. Tente de novo em instantes.';
		} finally {
			apagandoId = null;
		}
	}

	async function reenviar(deliveryId: string) {
		reenviando = true;
		try {
			const r = await reenviarNaoAbertos({ deliveryId });
			aviso = r.ok
				? `${r.reenviados} ${r.reenviados === 1 ? 'convite reenviado' : 'convites reenviados'} · a fila está andando`
				: (r.error ?? 'Não deu para reenviar agora.');
			await invalidateAll();
		} catch {
			aviso = 'Não deu para reenviar agora. Tente de novo em instantes.';
		} finally {
			reenviando = false;
		}
	}

	/** Reenvio para UM aluno — o ícone de cada linha. */
	let reenviandoId = $state<string | null>(null);
	let aviso = $state<string | null>(null);
	async function reenviarPara(aluno: Aluno) {
		if (!aluno.inviteId) return;
		reenviandoId = aluno.id;
		try {
			const r = await reenviarConvite({ inviteId: aluno.inviteId });
			aviso = r.ok ? `Convite reenviado para ${aluno.name}` : (r.error ?? null);
			await invalidateAll();
		} catch {
			aviso = 'Não deu para reenviar agora. Tente de novo em instantes.';
		} finally {
			reenviandoId = null;
		}
	}

	/**
	 * "Exportar antes de apagar": a chamada com o estado de cada aluno, montada no
	 * navegador com o que a tela já mostra (`$lib/csv.ts`), sem endpoint.
	 */
	function exportarChamada() {
		baixarCsv(
			`chamada-${nomeDeArquivo(data.classroom.name)}`,
			montarCsv(
				['Aluno', 'E-mail', 'Último envio', 'Com conta'],
				data.students.map((a) => [
					a.name,
					a.email ?? '',
					estados[a.state].label,
					a.temConta ? 'sim' : 'não'
				])
			)
		);
	}

	/**
	 * O aluno na bandeja de edição. Fica guardado depois de fechar, para a bandeja
	 * sair com o conteúdo dela em vez de esvaziar no meio do deslize.
	 */
	let alunoEmEdicao = $state<Aluno | null>(null);
	let edicaoAberta = $state(false);
	/** "Corrigir e-mail e reenviar": o e-mail voltou e a caixa de reenviar nasce marcada. */
	let corrigindo = $state(false);

	function abrirEdicao(aluno: Aluno, corrigir = false) {
		alunoEmEdicao = aluno;
		corrigindo = corrigir;
		confirmandoAluno = null;
		edicaoAberta = true;
	}

	// **Quem teve o convite recusado.** É o único estado que pede ação, e ele
	// estava só como um número no cabeçalho: o professor via "1 e-mail que
	// voltou" e tinha de procurar na lista qual era. Aqui ele já vem com nome,
	// endereço e o caminho de conserto.
	const voltaram = $derived(data.students.filter((aluno) => aluno.state === 'voltou'));

	/** Quanto de um envio já foi concluído, para a barra e o "% concluíram". */
	function percentual(parte: number, total: number): number {
		return total > 0 ? Math.round((parte / total) * 100) : 0;
	}

	let apagandoTurma = $state(false);
	async function apagar() {
		apagandoTurma = true;
		try {
			await apagarTurma({ classroomId: data.classroom.id });
			await goto(resolve('/(studio)/turmas'));
		} finally {
			apagandoTurma = false;
		}
	}
</script>

<svelte:head><title>{data.classroom.name} — entendo</title></svelte:head>

<div class="pagina-studio">
	<a
		href={resolve('/(studio)/turmas')}
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
		Turmas
	</a>

	<!-- ═══ 1. cabeçalho ═══ -->
	<HeaderCard
		numbers={[
			{ value: data.totals.students, label: 'alunos na turma' },
			// É este número que recebe convite, e por isso é o único em violeta —
			// o total de alunos não recebe.
			{ value: data.totals.withEmail, label: 'com e-mail · recebem convite', tone: 'primary' },
			{ value: data.totals.deliveries, label: 'atividades enviadas' },
			{
				value: data.totals.bounced,
				label: data.totals.bounced === 1 ? 'e-mail que voltou' : 'e-mails que voltaram',
				tone: data.totals.bounced > 0 ? 'error' : undefined
			}
		]}
	>
		{#snippet badge()}
			<span
				class="grid size-[46px] shrink-0 place-items-center rounded-[13px] text-[15px] font-bold {CLASSE_DA_ETIQUETA[
					corOuPadrao(data.classroom.color)
				]}">{data.classroom.badge}</span
			>
		{/snippet}
		<h1 class="mb-1.5 font-display text-[22px] font-semibold tracking-[-0.024em] lg:text-[28px]">
			{data.classroom.name}
		</h1>
		<p class="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[13.5px] text-base-content/65">
			<IdiomaTag tag={data.classroom.idioma} />
			<span>criada em {data.classroom.createdAt}</span>
		</p>
		{#snippet actions()}
			<button
				type="button"
				onclick={() => (editarAberta = true)}
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
				Editar turma
			</button>
			<button
				type="button"
				onclick={() => (envioAberto = true)}
				aria-haspopup="dialog"
				class="btn h-[42px] motion-tap gap-2 btn-primary text-[13.5px] font-bold"
			>
				<svg class="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<path
						d="M3.5 12l17-7.5-3 17-6-5zM11.5 16.5l3-3"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
				Enviar atividade
			</button>
		{/snippet}
	</HeaderCard>

	{#if enviados !== null}
		<p
			class="mb-[26px] flex items-center gap-2 rounded-[13px] border border-s-[3px] border-line border-s-primary bg-base-200 px-4 py-3 text-[0.86rem]"
			role="status"
		>
			<strong class="font-bold text-primary">{enviados}</strong>
			{enviados === 1 ? 'convite saindo' : 'convites saindo'} · a fila está andando. Quem não tem e-mail
			segue na turma e entra pelo link aberto.
		</p>
	{/if}

	<!-- ═══ 1.5 módulos desta turma ═══ A programação de envio de cada módulo
	     alocado; "Programação" (ou "Resolver", quando um envio não saiu) abre o
	     painel no próprio módulo (docs/telas-modulos-professor.md 2.3). -->
	{#if data.modulos.length > 0}
		<section class="mb-7.5">
			<div class="mb-3.5 flex flex-wrap items-baseline gap-x-3.5 gap-y-2.5">
				<h2 class="font-display text-[18px] font-semibold lg:text-[20px]">Módulos desta turma</h2>
				<span class="text-[13px] text-base-content/65">a programação de envio de cada um</span>
			</div>
			<div class="grid gap-2.5">
				{#each data.modulos as m (m.allocationId)}
					{@const E = PILULA_DO_ESTADO[m.estado]}
					<div
						class="flex flex-wrap items-center gap-x-3 gap-y-2.5 rounded-[14px] border border-line p-3.5 lg:flex-nowrap lg:gap-4 lg:px-4.5"
					>
						<span class="flex min-w-0 flex-1 items-center gap-3">
							<span
								class="grid size-9 flex-none place-items-center rounded-[10px] text-[12px] font-bold {CLASSE_DA_ETIQUETA[
									m.color
								]}">{m.badge}</span
							>
							<span class="min-w-0">
								<span class="mb-0.75 block text-[15px] font-semibold">{m.name}</span>
								<span class="block text-[12.5px] text-pretty text-base-content/65">{m.resumo}</span>
							</span>
						</span>
						<span
							class="inline-flex flex-none items-center gap-1.75 rounded-full px-2.75 py-1.25 text-[12px] font-bold whitespace-nowrap {E.classe}"
						>
							<svg class="size-3.5 flex-none" viewBox="0 0 24 24" fill="none" aria-hidden="true"
								><path
									d={E.icone}
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
								/></svg
							>
							{E.curto}
						</span>
						<!-- eslint-disable svelte/no-navigation-without-resolve -- rota resolvida mais a query que abre o painel da turma. -->
						<a
							href={resolve('/(studio)/modulos/[id]', { id: m.moduleId }) +
								'?turma=' +
								m.allocationId}
							class="btn min-h-10 flex-none motion-tap btn-outline text-[13px] font-bold whitespace-nowrap no-underline"
							>{m.estado === 'falha' ? 'Resolver' : 'Programação'}</a
						>
						<!-- eslint-enable svelte/no-navigation-without-resolve -->
					</div>
				{/each}
			</div>
		</section>
	{/if}

	<!-- Seletor só do celular: no desktop os dois blocos ficam na mesma rolagem. -->
	<Alternador
		opcoes={[
			{ id: 'alunos' as const, label: 'Alunos' },
			{ id: 'envios' as const, label: 'Envios' }
		]}
		bind:valor={bloco}
		rotulo="O que mostrar"
		class="mb-4 lg:hidden"
	/>

	<!-- ═══ 2. alunos ═══ -->
	<section class="mb-[30px] lg:block {bloco === 'alunos' ? '' : 'hidden'}">
		<div class="mb-3.5 flex flex-wrap items-baseline gap-x-3.5 gap-y-2.5">
			<h2 class="font-display text-lg font-semibold lg:text-xl">Alunos</h2>
			<span class="text-[13px] text-base-content/65">
				{#if data.lastDelivery}
					estado no último envio · {data.lastDelivery.activityTitle}, {data.lastDelivery.when}
				{:else}
					ainda sem envio — todos entram pelo link aberto
				{/if}
			</span>
			<div class="min-w-1 flex-1"></div>
			<div class="flex flex-wrap gap-2">
				<button
					type="button"
					onclick={() => (novoAlunoAberto = true)}
					aria-haspopup="dialog"
					class="btn h-10 motion-tap gap-2 btn-neutral text-[13px]"
				>
					<svg class="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
						<path
							d="M12 5v14M5 12h14"
							stroke="currentColor"
							stroke-width="2.2"
							stroke-linecap="round"
						/>
					</svg>
					Adicionar aluno
				</button>
				{#if data.lastDelivery && data.lastDelivery.porEmail && data.lastDelivery.unopened > 0}
					<!-- Reenvio é ação separada e SEMPRE com contagem. -->
					<button
						type="button"
						onclick={() => reenviar(data.lastDelivery!.id)}
						disabled={reenviando}
						class="btn h-10 motion-tap gap-2 btn-outline text-[13px] font-bold"
					>
						{#if reenviando}
							<Loading variant="fila" size={11} tone="current" label="Reenviando" />
							Reenviando…
						{:else}
							<svg class="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
								<path
									d="M20 11a8 8 0 00-14.5-4.5L4 8M4 4v4h4M4 13a8 8 0 0014.5 4.5L20 16M20 20v-4h-4"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
								/>
							</svg>
							{data.lastDelivery.unopened === 1
								? 'Reenviar para quem não abriu'
								: `Reenviar para os ${data.lastDelivery.unopened} que não abriram`}
						{/if}
					</button>
				{/if}
			</div>
		</div>

		{#if aviso}
			<p
				class="mb-3 flex items-center gap-2 rounded-[13px] border border-s-[3px] border-line border-s-primary bg-base-200 px-4 py-3 text-[0.86rem]"
				role="status"
			>
				{aviso}
			</p>
		{/if}

		<!-- O e-mail que voltou pede ação, então não fica escondido na lista. -->
		{#each voltaram as aluno (aluno.id)}
			<div
				class="mb-3 flex flex-wrap items-center gap-x-3.5 gap-y-3 rounded-[13px] border border-error/32 bg-error/8 px-4 py-3.5"
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
					<p class="mb-1 text-[13.5px] font-bold">O convite de {aluno.name} voltou</p>
					<p class="text-[12.5px] leading-relaxed text-base-content/65">
						O servidor de <span class="font-mono">{aluno.email}</span> recusou a entrega. Ele não recebeu
						nada.
					</p>
				</div>
				<button
					type="button"
					onclick={() => abrirEdicao(aluno, true)}
					class="btn h-10 shrink-0 motion-tap rounded-[9px] btn-error text-[13px] font-bold"
					>Corrigir e-mail e reenviar</button
				>
			</div>
		{/each}

		{#if data.students.length === 0}
			<div class="rounded-[14px] border border-dashed border-line px-5 py-[26px] text-center">
				<p class="mb-1.5 text-[15px] font-bold">Nenhum aluno ainda</p>
				<p class="mx-auto max-w-[60ch] text-[13.5px] leading-relaxed text-base-content/65">
					Adicione os alunos para poder enviar a atividade direto para eles.
				</p>
			</div>
		{:else}
			<div class="overflow-hidden rounded-[14px] border border-line">
				<div
					class="hidden grid-cols-[2fr_2.1fr_1.5fr_148px] gap-4 border-b border-line bg-base-200 px-5 py-[11px] text-[11px] font-bold tracking-[0.09em] text-base-content/65 uppercase lg:grid"
				>
					<span>Aluno</span><span>E-mail</span><span>Último envio</span><span></span>
				</div>

				{#each alunosNaPagina as aluno (aluno.id)}
					{@const estado = estados[aluno.state]}
					<div
						class="border-b border-line text-sm transition-colors last:border-0 hover:bg-base-200"
					>
						<div
							class="flex flex-wrap items-center gap-x-2.5 gap-y-2 px-3.5 py-[13px] lg:grid lg:grid-cols-[2fr_2.1fr_1.5fr_148px] lg:gap-4 lg:px-5"
						>
							<!-- O nome é um LINK para o histórico do aluno: olhando a chamada,
							     a pergunta seguinte é "como este aqui está indo". -->
							<a
								href={resolve('/(studio)/alunos/[id]', { id: aluno.id })}
								class="flex min-w-0 items-center gap-[11px] text-base-content no-underline"
							>
								<Avatar
									codigo={aluno.avatar}
									nome={aluno.name}
									size={30}
									radius="rounded-full"
									class="shrink-0"
								/>
								<span class="min-w-0 truncate font-semibold">{aluno.name}</span>
								{#if aluno.temConta}
									<!-- Informação, não estado: quem tem conta participa igual. -->
									<span
										class="shrink-0 rounded-full bg-base-300 px-1.5 py-0.5 text-[0.68rem] font-bold text-base-content/70"
										title="Este aluno ligou a chamada a uma conta dele">com conta</span
									>
								{/if}
							</a>
							{#if aluno.email}
								<span class="min-w-0 truncate font-mono text-[13px] text-base-content/65"
									>{aluno.email}</span
								>
							{:else}
								<span class="min-w-0 truncate text-[13px] text-base-content/65 italic"
									>sem e-mail</span
								>
							{/if}
							<!-- Pílula com ícone E texto, nunca a cor sozinha (design-system.md). -->
							<span
								class="inline-flex items-center gap-[7px] justify-self-start rounded-full px-[11px] py-[5px] text-xs font-bold whitespace-nowrap {estado.pill}"
							>
								<svg class="size-3.5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
									<path
										d={estado.icon}
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
								</svg>
								{estado.label}
							</span>
							<span class="ms-auto flex items-center gap-1 lg:ms-0 lg:justify-self-end">
								{#if aluno.state === 'sem-email'}
									<button
										type="button"
										onclick={() => abrirEdicao(aluno)}
										title="Cadastrar e-mail para poder convidar"
										aria-label="Cadastrar e-mail de {aluno.name}"
										class="grid size-[34px] place-items-center rounded-[9px] text-base-content/65 transition-colors hover:bg-base-300 hover:text-primary"
									>
										<svg class="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
											<path
												d="M3.5 12l17-7.5-3 17-6-5zM11.5 16.5l3-3"
												stroke="currentColor"
												stroke-width="2"
												stroke-linecap="round"
												stroke-linejoin="round"
											/>
										</svg>
									</button>
								{:else if aluno.state === 'voltou'}
									<button
										type="button"
										onclick={() => abrirEdicao(aluno, true)}
										title="Corrigir e-mail e reenviar"
										aria-label="Corrigir e-mail de {aluno.name} e reenviar"
										class="grid size-[34px] place-items-center rounded-[9px] text-base-content/65 transition-colors hover:bg-base-300 hover:text-primary"
									>
										<svg class="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
											<path
												d="M3.5 12l17-7.5-3 17-6-5zM11.5 16.5l3-3"
												stroke="currentColor"
												stroke-width="2"
												stroke-linecap="round"
												stroke-linejoin="round"
											/>
										</svg>
									</button>
								{:else}
									<button
										type="button"
										onclick={() => reenviarPara(aluno)}
										disabled={!aluno.inviteId || !aluno.email || reenviandoId !== null}
										title={!aluno.inviteId
											? 'Ainda não recebeu convite'
											: !aluno.email
												? 'Sem e-mail no cadastro'
												: aluno.state === 'disponivel'
													? 'Mandar o link por e-mail só para este aluno'
													: 'Reenviar convite só para este aluno'}
										aria-label="{aluno.state === 'disponivel'
											? 'Mandar o link por e-mail para'
											: 'Reenviar convite para'} {aluno.name}"
										class="grid size-[34px] place-items-center rounded-[9px] text-base-content/65 transition-colors hover:bg-base-300 hover:text-primary disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-base-content/65"
									>
										{#if reenviandoId === aluno.id}
											<Loading variant="fila" size={10} tone="current" label="Reenviando" />
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
										{/if}
									</button>
								{/if}
								<button
									type="button"
									onclick={() => abrirEdicao(aluno)}
									title="Editar nome e e-mail"
									aria-label="Editar {aluno.name}"
									class="grid size-[34px] place-items-center rounded-[9px] text-base-content/65 transition-colors hover:bg-base-300 hover:text-primary"
								>
									<svg class="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
										<path
											d="M4 20h4L19 9a2.8 2.8 0 10-4-4L4 16z"
											stroke="currentColor"
											stroke-width="2"
											stroke-linejoin="round"
										/>
									</svg>
								</button>
								<button
									type="button"
									onclick={() =>
										(confirmandoAluno = confirmandoAluno === aluno.id ? null : aluno.id)}
									disabled={apagandoId !== null}
									aria-expanded={confirmandoAluno === aluno.id}
									title="Apagar aluno e as respostas dele"
									aria-label="Apagar {aluno.name}"
									class="grid size-[34px] place-items-center rounded-[9px] text-base-content/65 transition-colors hover:bg-error/12 hover:text-error"
								>
									{#if apagandoId === aluno.id}
										<Loading variant="fila" size={10} tone="current" label="Apagando" />
									{:else}
										<svg class="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
											<path
												d="M5 7h14M9 7V4.5h6V7M7 7l1 13h8l1-13M10 11v6M14 11v6"
												stroke="currentColor"
												stroke-width="2"
												stroke-linecap="round"
												stroke-linejoin="round"
											/>
										</svg>
									{/if}
								</button>
							</span>
						</div>

						{#if confirmandoAluno === aluno.id}
							<div class="border-t border-line bg-base-200 px-4 py-3.5 lg:px-5">
								<p class="mb-1.5 text-[13.5px] font-bold">Apagar {aluno.name}?</p>
								<p class="mb-3 max-w-[72ch] text-[13px] leading-relaxed text-base-content/65">
									Sai da chamada com as respostas que ele enviou por esta turma, e o link pessoal
									para de funcionar. As tentativas feitas pelo link aberto não são tocadas. Não há
									como desfazer.
								</p>
								<div class="flex flex-wrap gap-2">
									<button
										type="button"
										onclick={() => apagarAluno(aluno.id)}
										disabled={apagandoId !== null}
										class="btn min-h-10 motion-tap gap-2 btn-error text-[13px] font-bold"
									>
										{#if apagandoId === aluno.id}<Loading
												variant="fila"
												size={9}
												tone="current"
												label="Apagando"
											/>{/if}
										Apagar aluno e respostas
									</button>
									<button
										type="button"
										onclick={() => (confirmandoAluno = null)}
										class="btn min-h-10 btn-plain text-[13px]">Manter</button
									>
								</div>
							</div>
						{/if}
					</div>
				{/each}
			</div>

			<div
				class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2.5 text-[12.5px] text-base-content/65"
			>
				<span>Mostrando {alunosNaPagina.length} de {data.students.length}</span>
				<div class="min-w-1 flex-1"></div>
				{#each legenda as linha (linha.estado)}
					<span class="flex items-center gap-[7px]">
						<span class="size-2 rounded-[2px] {estados[linha.estado].legenda}"></span>
						{estados[linha.estado].label}
						{linha.n}
					</span>
				{/each}
			</div>
			<Pagination
				bind:pagina={paginaAlunos}
				porPagina={ALUNOS_POR_PAGINA}
				total={data.students.length}
				rotulo="alunos"
			/>
		{/if}
	</section>

	<!-- ═══ 3. atividades enviadas ═══ -->
	<section class="mb-[30px] lg:block {bloco === 'envios' ? '' : 'hidden'}">
		<div class="mb-3.5 flex flex-wrap items-baseline gap-x-3.5 gap-y-2.5">
			<h2 class="font-display text-lg font-semibold lg:text-xl">Atividades enviadas</h2>
			<span class="text-[13px] text-base-content/65">clicar abre o resultado da atividade</span>
		</div>

		{#if data.deliveries.length === 0}
			<div class="rounded-[14px] border border-dashed border-line px-5 py-[26px] text-center">
				<p class="mb-1.5 text-[15px] font-bold">Nada enviado ainda</p>
				<p class="mx-auto max-w-[60ch] text-[13.5px] leading-relaxed text-base-content/65">
					Publique uma atividade e use "Enviar atividade" — o link aberto continua valendo em
					paralelo.
				</p>
			</div>
		{:else}
			<div class="grid gap-2.5">
				{#each data.deliveries as envio (envio.id)}
					{@const concluido = percentual(envio.finished, envio.invites)}
					{@const emAndamento = percentual(
						Math.max(0, envio.started - envio.finished),
						envio.invites
					)}
					<a
						href={resolve('/(studio)/resultados/[activityId]', { activityId: envio.activityId })}
						class="block cartao-interativo rounded-[14px] border border-line px-4 py-[15px] text-base-content no-underline hover:bg-base-200 lg:flex lg:items-center lg:gap-6 lg:px-5 lg:py-[17px]"
					>
						<div class="min-w-0 flex-1">
							<div class="mb-[5px] flex flex-wrap items-center gap-x-2.5 gap-y-2">
								<span class="text-[15px] font-semibold">{envio.activityTitle}</span>
								{#if envio.moduleName}
									<span
										class="rounded-full bg-base-300 px-[9px] py-1 text-[11.5px] font-bold text-primary"
										>módulo {envio.moduleName}</span
									>
								{/if}
								{#if !envio.porEmail}
									<!-- Envio sem e-mail: "não abriram" falaria de um e-mail que não existiu. -->
									<span
										class="rounded-full border border-line bg-base-200 px-[9px] py-1 text-[11.5px] font-bold whitespace-nowrap text-base-content/65"
										>no mapa, sem e-mail</span
									>
								{:else if envio.unopened > 0}
									<span
										class="rounded-full border border-line bg-base-200 px-[9px] py-1 text-[11.5px] font-bold whitespace-nowrap text-base-content/65"
									>
										{envio.unopened}
										{envio.unopened === 1 ? 'não abriu' : 'não abriram'}
									</span>
								{:else}
									<span
										class="rounded-full bg-base-300 px-[9px] py-1 text-[11.5px] font-bold whitespace-nowrap text-primary"
										>todos abriram</span
									>
								{/if}
							</div>
							<div class="text-[12.5px] text-base-content/65">
								{envio.when} · {envio.invites}
								{envio.invites === 1 ? 'convite' : 'convites'}
							</div>
						</div>
						<div
							class="mt-3 flex items-center gap-5 border-t border-line pt-3 lg:mt-0 lg:border-0 lg:pt-0"
						>
							<div>
								<div class="font-mono text-[15px] font-medium">{envio.opened}/{envio.invites}</div>
								<div class="mt-[3px] text-[11.5px] text-base-content/65">abriram</div>
							</div>
							<div>
								<div class="font-mono text-[15px] font-medium text-primary">
									{envio.finished}/{envio.invites}
								</div>
								<div class="mt-[3px] text-[11.5px] text-base-content/65">terminaram</div>
							</div>
							<div class="min-w-0 flex-1 lg:w-[130px] lg:flex-none">
								<!-- Dois segmentos: quem terminou e quem começou e parou. -->
								<div class="flex h-[7px] gap-[2px] overflow-hidden rounded-full bg-base-300">
									<span class="rounded-full bg-primary" style="width: {concluido}%"></span>
									<span class="rounded-full bg-primary/45" style="width: {emAndamento}%"></span>
								</div>
								<div class="mt-1.5 text-[11.5px] text-base-content/65">{concluido}% concluíram</div>
							</div>
						</div>
					</a>
				{/each}
			</div>
		{/if}
	</section>

	<!-- Apagar é caminho visível, com a consequência dita em texto. -->
	<div class="rounded-[14px] border border-error/28 px-4 py-4 lg:px-[22px] lg:py-5">
		<h3 class="mb-2 text-[15px] font-bold">Apagar esta turma</h3>
		<p class="mb-4 max-w-[76ch] text-[13px] leading-relaxed text-pretty text-base-content/65">
			Apaga os {data.totals.students} cadastros de aluno e todas as respostas enviadas por eles nesta
			turma. Os links pessoais param de funcionar na hora. As atividades e os materiais continuam na sua
			conta, e as tentativas feitas pelo link aberto não são afetadas. Não há como desfazer.
		</p>
		<div class="flex flex-wrap gap-2.5">
			{#if confirmandoApagar}
				<button
					type="button"
					onclick={apagar}
					disabled={apagandoTurma}
					class="btn h-[42px] motion-tap gap-2 btn-error text-[13.5px] font-bold"
				>
					{#if apagandoTurma}
						<Loading variant="fila" size={11} tone="current" label="Apagando" />
						Apagando…
					{:else}
						Confirmar: apagar turma e respostas
					{/if}
				</button>
				<button
					type="button"
					onclick={() => (confirmandoApagar = false)}
					class="btn h-[42px] motion-tap btn-neutral text-[13.5px]">Cancelar</button
				>
			{:else}
				<button
					type="button"
					onclick={() => (confirmandoApagar = true)}
					class="btn h-[42px] motion-tap btn-outline-error text-[13.5px] font-bold"
					>Apagar turma e respostas</button
				>
			{/if}
			{#if data.students.length > 0}
				<!-- A chamada em CSV, para guardar antes de apagar. -->
				<button
					type="button"
					onclick={exportarChamada}
					class="btn h-[42px] motion-tap gap-2 btn-neutral text-[13.5px]"
				>
					<svg class="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true"
						><path
							d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						/></svg
					>
					Exportar antes de apagar
				</button>
			{/if}
		</div>
	</div>
</div>

<EditarTurma aberta={editarAberta} onfechar={() => (editarAberta = false)} turma={data.classroom} />
<EnviarAtividade
	aberta={envioAberto}
	onfechar={() => (envioAberto = false)}
	turma={data.classroom}
	comEmail={data.totals.withEmail}
	onenviado={aoEnviar}
/>
<AdicionarAluno
	aberta={novoAlunoAberto}
	onfechar={() => (novoAlunoAberto = false)}
	turma={data.classroom}
/>
{#if alunoEmEdicao}
	<EditarAluno
		aberta={edicaoAberta}
		onfechar={() => (edicaoAberta = false)}
		aluno={alunoEmEdicao}
		{corrigindo}
		onsalvo={(texto) => (aviso = texto)}
	/>
{/if}
