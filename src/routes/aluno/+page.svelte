<script lang="ts">
	// A área do aluno. Só existe por causa da conta — e por isso ela nunca
	// aparece no caminho de responder: quem não tem conta não passa por aqui e
	// não perde nada.
	//
	// Uma coluna, em ordem de PERGUNTA: onde eu estudo, como venho indo, e o que
	// respondi. As estatísticas ficam ENTRE as turmas e o histórico porque
	// respondem antes da lista — a tendência das últimas três diz mais que
	// qualquer nota isolada.
	//
	// **Adotar tentativas é a única escrita desta área**, e aparece como convite
	// pontual no topo: some quando não há nada solto neste aparelho. Nada é
	// adotado sozinho — o aluno decide se aquelas respostas eram dele.
	import { CLASSE_DA_ETIQUETA, corOuPadrao } from '$lib/etiquetas';
	import { goto, invalidateAll } from '$app/navigation';
	import Loading from '$lib/components/Loading.svelte';
	import { resolve } from '$app/paths';
	import { authAlunoClient } from '$lib/client/auth-aluno';
	import Avatar from '$lib/components/Avatar.svelte';
	import AvatarEditor from '$lib/components/AvatarEditor.svelte';
	import HeaderCard from '$lib/components/HeaderCard.svelte';
	import Logo from '$lib/components/Logo.svelte';
	import ScoreBar from '$lib/components/ScoreBar.svelte';
	import { CODIGO_PADRAO, avatarPadrao, sortearCodigo } from '$lib/avatar/montar';
	import { adotarMinhasTentativas, gravarMeuAvatar } from './aluno.remote';
	import { resumoDoMapa, type EstadoDaFase, type MapaDoModulo } from '$lib/modulos/mapa';
	import { ICONE_PIXEL } from '$lib/modulos/pixel';
	import LigarGoogle from '$lib/components/LigarGoogle.svelte';

	/** A trilha curta do cartão de módulo: ícone por estado, nunca só cor. */
	const TRILHA: Record<EstadoDaFase, { classe: string; icone: string }> = {
		done: { classe: 'bg-primary text-primary-content', icone: ICONE_PIXEL.bandeira },
		doing: {
			classe: 'bg-base-100 text-primary shadow-[inset_0_0_0_2px_var(--color-primary)]',
			icone: ICONE_PIXEL.jogar
		},
		open: {
			classe: 'bg-base-100 text-primary shadow-[inset_0_0_0_2px_var(--color-primary)]',
			icone: ICONE_PIXEL.jogar
		},
		locked: { classe: 'bg-base-300 text-base-content/65', icone: ICONE_PIXEL.cadeado },
		closed: {
			classe: 'bg-base-200 text-base-content/65 shadow-[inset_0_0_0_1.5px_var(--color-line)]',
			icone: ICONE_PIXEL.xis
		}
	};

	interface Tentativa {
		id: string;
		slug: string;
		title: string;
		teacher: string;
		language: string;
		when: string;
		finished: boolean;
		answered: number;
		itemCount: number;
		showResult: boolean;
		score: { correct: number; partial: number; incorrect: number } | null;
		percent: number | null;
		tempo: string | null;
		estado: string;
		barra: { correct: number; partial: number; incorrect: number } | null;
	}
	interface Habilidade {
		name: string;
		correct: number;
		partial: number;
		total: number;
		tag: 'firme' | 'quase lá' | 'vale voltar';
	}
	interface PageData {
		account: { name: string; email: string; avatar: string | null };
		classrooms: { id: string; classroom: string; badge: string; color: string; teacher: string }[];
		attempts: Tentativa[];
		totals: { attempts: number; finished: number };
		soltas: number;
		stats: {
			acertoMedio: number | null;
			comPlacar: number;
			tendencia: number | null;
			tempoMedio: string | null;
			semanasSeguidas: number;
		};
		habilidades: Habilidade[];
		/** Os mapas de módulo das turmas desta conta (docs/telas-modulos-aluno.md). */
		modulos: MapaDoModulo[];
		/** Como a conta entra (senha, Google) e se o Google está ligado no servidor. */
		login: { googleDisponivel: boolean; google: boolean; senha: boolean };
	}

	let { data }: { data: PageData } = $props();

	const tagTone: Record<Habilidade['tag'], string> = {
		firme: 'bg-success/13 text-success',
		'quase lá': 'bg-warning/15 text-warning',
		'vale voltar': 'border border-line bg-base-200 text-base-content/65'
	};

	const primeiroNome = $derived(data.account.name.trim().split(/\s+/)[0] ?? data.account.name);

	// ── avatar ──
	let editorAberto = $state(false);
	// Só o RASCUNHO do editor — `abrirEditor` semeia com o avatar da conta a cada
	// abertura. Ler `data` aqui capturaria o valor inicial e ficaria desatualizado
	// depois do `invalidateAll`.
	let codigo = $state(CODIGO_PADRAO);
	let salvandoAvatar = $state(false);
	// O avatar mostrado é o da CONTA até o editor abrir: sem isto, sortear e
	// fechar sem usar deixava a tela mostrando um avatar que não foi gravado.
	const avatarNaTela = $derived(editorAberto ? codigo : (data.account.avatar ?? null));

	/** Falha ao gravar é DITA: o avatar da tela voltaria ao antigo sem explicação. */
	let erroAvatar = $state<string | null>(null);
	async function usarAvatar(escolhido: string) {
		salvandoAvatar = true;
		erroAvatar = null;
		try {
			await gravarMeuAvatar(escolhido);
			await invalidateAll();
		} catch {
			erroAvatar = 'Não deu para gravar o avatar agora. Tente de novo em instantes.';
		} finally {
			salvandoAvatar = false;
		}
	}

	function abrirEditor() {
		codigo = data.account.avatar ?? avatarPadrao(data.account.name);
		editorAberto = true;
	}

	async function sortearEUsar() {
		const sorteado = sortearCodigo();
		codigo = sorteado;
		await usarAvatar(sorteado);
	}

	// ── adotar as tentativas soltas ──
	let adotando = $state(false);
	let erroAdotar = $state<string | null>(null);
	async function adotar() {
		adotando = true;
		erroAdotar = null;
		try {
			await adotarMinhasTentativas();
			await invalidateAll();
		} catch {
			erroAdotar = 'Não deu para trazer as respostas agora. Tente de novo em instantes.';
		} finally {
			adotando = false;
		}
	}

	/** Cada linha do histórico abre em detalhe — fechada por padrão. */
	let aberta = $state<string | null>(null);

	let saindo = $state(false);
	async function sair() {
		saindo = true;
		await authAlunoClient.signOut();
		await goto(resolve('/'), { invalidateAll: true });
	}

	const cartoes = $derived.by(() => {
		const s = data.stats;
		const lista: { chave: string; label: string; valor: string; nota: string }[] = [];
		if (s.acertoMedio !== null) {
			lista.push({
				chave: 'acerto',
				label: 'Acerto médio',
				valor: `${s.acertoMedio}%`,
				nota: `nas ${s.comPlacar} com resultado liberado`
			});
		}
		if (s.tendencia !== null) {
			lista.push({
				chave: 'tendencia',
				label: 'Últimas três',
				valor: `${s.tendencia > 0 ? '+' : ''}${s.tendencia}%`,
				nota:
					s.tendencia > 0
						? 'melhor que as três anteriores'
						: s.tendencia < 0
							? 'abaixo das três anteriores'
							: 'igual às três anteriores'
			});
		}
		if (s.tempoMedio) {
			lista.push({
				chave: 'tempo',
				label: 'Tempo médio',
				valor: s.tempoMedio,
				nota: 'por atividade terminada'
			});
		}
		if (s.semanasSeguidas > 0) {
			lista.push({
				chave: 'semanas',
				label: 'Semanas seguidas',
				valor: String(s.semanasSeguidas),
				nota: 'com pelo menos uma atividade'
			});
		}
		return lista;
	});
</script>

<svelte:head>
	<title>Minhas atividades · Spokke</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="min-h-dvh bg-base-100">
	<header class="flex items-center gap-3 border-b border-line px-gutter py-3">
		<Logo />
		<div class="min-w-0 flex-1"></div>
		<span class="hidden min-w-0 truncate font-mono text-[12.5px] text-base-content/65 sm:inline"
			>{data.account.email}</span
		>
		<button
			type="button"
			onclick={sair}
			disabled={saindo}
			class="btn h-10 shrink-0 motion-tap gap-2 btn-neutral text-[13px]"
		>
			{#if saindo}
				<Loading variant="fila" size={10} tone="current" label="Saindo" />
				Saindo…
			{:else}
				<svg class="size-[15px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<path
						d="M14 8V5.5a2 2 0 00-2-2H6a2 2 0 00-2 2v13a2 2 0 002 2h6a2 2 0 002-2V16"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
					/>
					<path
						d="M10.5 12h10M17.5 8.5l3.5 3.5-3.5 3.5"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
				Sair
			{/if}
		</button>
	</header>

	<main class="mx-auto w-full max-w-[880px] px-gutter pt-5 pb-9 lg:pt-[30px]">
		<!-- ═══ 1. cabeçalho ═══ Diz em uma frase para que a área serve — e que
		     os links funcionam sem ela. A conta é oferta, nunca exigência
		     (auth.md "A conta do aluno"). -->
		<HeaderCard
			numbers={[
				{ value: data.totals.attempts, label: 'tentativas' },
				{ value: data.totals.finished, label: 'terminadas' },
				{
					value: data.classrooms.length,
					label: data.classrooms.length === 1 ? 'turma' : 'turmas',
					tone: data.classrooms.length > 0 ? 'primary' : undefined
				}
			]}
		>
			{#snippet badge()}
				<Avatar
					codigo={data.account.avatar}
					nome={data.account.name}
					size={46}
					radius="rounded-[13px]"
				/>
			{/snippet}
			<h1 class="mb-1.5 font-display text-[22px] font-semibold tracking-[-0.024em] lg:text-[28px]">
				Olá, {primeiroNome}
			</h1>
			<p class="max-w-[62ch] text-[13.5px] leading-relaxed text-pretty text-base-content/65">
				Esta área guarda o que você respondeu, para reencontrar em outro aparelho. Os links que o
				professor manda funcionam com ou sem entrar aqui.
			</p>
		</HeaderCard>

		<!-- ═══ 2. tentativas soltas ═══ Convite PONTUAL: só existe enquanto há
		     algo solto neste aparelho. Nada é adotado sozinho — quem decide se
		     aquelas respostas eram dele é o aluno. -->
		{#if data.soltas > 0}
			<div
				class="mb-[26px] flex flex-wrap items-center gap-x-4 gap-y-3 rounded-box border border-s-[3px] border-line border-s-primary bg-base-200 px-4 py-[15px] lg:px-[18px]"
			>
				<svg
					class="size-5 shrink-0 self-start text-primary"
					viewBox="0 0 24 24"
					fill="none"
					aria-hidden="true"
				>
					<path
						d="M20.5 12v6a2 2 0 01-2 2h-13a2 2 0 01-2-2v-6M12 3.5v10M8 9.5l4 4 4-4"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
				<div class="min-w-[240px] flex-1">
					<p class="mb-1 text-sm font-bold">
						{data.soltas}
						{data.soltas === 1 ? 'tentativa respondida' : 'tentativas respondidas'} neste aparelho sem
						conta
					</p>
					<p class="text-[13px] leading-relaxed text-pretty text-base-content/65">
						Se {data.soltas === 1 ? 'foi' : 'foram'} você, dá para
						{data.soltas === 1 ? 'trazê-la' : 'trazê-las'} para esta conta e
						{data.soltas === 1 ? 'ela passa' : 'elas passam'} a aparecer aqui de qualquer aparelho.
					</p>
				</div>
				<button
					type="button"
					onclick={adotar}
					disabled={adotando}
					class="btn min-h-10 w-full shrink-0 motion-tap gap-2 btn-primary text-[13px] font-bold lg:w-auto"
				>
					{#if adotando}
						<Loading variant="fila" size={10} tone="current" label="Trazendo" />
						Trazendo…
					{:else}
						{data.soltas === 1 ? 'Adotar minha tentativa' : 'Adotar minhas tentativas'}
					{/if}
				</button>
				{#if erroAdotar}
					<p class="w-full text-[13px] font-semibold text-error" role="alert">{erroAdotar}</p>
				{/if}
			</div>
		{/if}

		<!-- ═══ 3. avatar ═══ -->
		<section class="mb-[26px]">
			<div class="mb-3.5 flex flex-wrap items-baseline gap-x-3.5 gap-y-2.5">
				<h2 class="font-display text-lg font-semibold lg:text-xl">Seu avatar</h2>
				<span class="text-[13px] text-base-content/65"
					>é o que a sua turma vê ao lado do seu nome</span
				>
			</div>
			<div
				class="flex flex-wrap items-center gap-x-4 gap-y-3.5 rounded-box border border-line bg-card p-4 lg:px-5 lg:py-[18px]"
			>
				<Avatar
					codigo={avatarNaTela}
					nome={data.account.name}
					size={64}
					radius="rounded-[14px]"
					class="border border-line"
				/>
				<p
					class="min-w-[200px] flex-1 text-[13px] leading-relaxed text-pretty text-base-content/65"
				>
					Onze peças, nenhuma obrigatória. Ele é gravado como dezoito números — não é uma foto, e
					não sai do seu aparelho para lugar nenhum.
				</p>
				<div class="flex w-full flex-wrap gap-2 lg:w-auto">
					<button
						type="button"
						onclick={abrirEditor}
						disabled={salvandoAvatar}
						class="btn min-h-11 flex-1 motion-tap btn-primary text-[13.5px] font-bold lg:flex-none"
						>Montar peça por peça</button
					>
					<button
						type="button"
						onclick={sortearEUsar}
						disabled={salvandoAvatar}
						class="btn min-h-11 flex-1 motion-tap gap-2 btn-plain text-[13.5px] font-semibold lg:flex-none"
					>
						{#if salvandoAvatar}
							<Loading variant="fila" size={10} tone="current" label="Salvando" />
							Salvando…
						{:else}
							Sortear
						{/if}
					</button>
				</div>
				{#if erroAvatar}
					<p class="w-full text-[13px] font-semibold text-error" role="alert">{erroAvatar}</p>
				{/if}
			</div>
		</section>

		<!-- Entrar com o Google: só com o Google ligado no servidor (ou já ligado
		     nesta conta). É daqui que sai quem criou a conta com senha e quer
		     entrar pelo Google — a tela de entrar manda para cá. -->
		{#if data.login.googleDisponivel || data.login.google}
			<section class="mb-[26px]">
				<div class="mb-3.5 flex flex-wrap items-baseline gap-x-3.5 gap-y-2.5">
					<h2 class="font-display text-lg font-semibold lg:text-xl">Entrar com o Google</h2>
					<span class="text-[13px] text-base-content/65">opcional, no lugar da senha</span>
				</div>
				<div class="rounded-box border border-line bg-card p-4 lg:px-5 lg:py-[18px]">
					<LigarGoogle
						como="aluno"
						email={data.account.email}
						ligado={data.login.google}
						temSenha={data.login.senha}
						aqui={resolve('/aluno')}
					/>
				</div>
			</section>
		{/if}

		<!-- ═══ 4. turmas ═══ -->
		<section class="mb-[26px]">
			<div class="mb-3.5 flex flex-wrap items-baseline gap-x-3.5 gap-y-2.5">
				<h2 class="font-display text-lg font-semibold lg:text-xl">Suas turmas</h2>
				<span class="text-[13px] text-base-content/65">
					{data.classrooms.length > 0
						? 'quem te adicionou vê o que você respondeu'
						: 'nenhuma ainda'}
				</span>
			</div>
			{#if data.classrooms.length > 0}
				<ul class="flex list-none flex-wrap gap-[11px] p-0">
					{#each data.classrooms as ficha (ficha.id)}
						<li
							class="flex min-w-[230px] flex-1 items-center gap-3 rounded-[14px] border border-line px-4 py-3.5"
						>
							<span
								class="grid size-[34px] shrink-0 place-items-center rounded-[10px] text-xs font-bold {CLASSE_DA_ETIQUETA[
									corOuPadrao(ficha.color)
								]}">{ficha.badge}</span
							>
							<span class="min-w-0">
								<span class="mb-[3px] block truncate text-sm font-semibold">{ficha.classroom}</span>
								<span class="block text-[12.5px] text-base-content/65">com {ficha.teacher}</span>
							</span>
						</li>
					{/each}
				</ul>
			{:else}
				<p
					class="rounded-[14px] border border-dashed border-line px-[17px] py-[15px] text-[13.5px] leading-relaxed text-pretty text-base-content/65"
				>
					Você ainda não está em nenhuma turma. Não faz falta: os links que o professor manda
					funcionam do mesmo jeito.
				</p>
			{/if}
		</section>

		<!-- ═══ 4.5 seus módulos ═══ Só aparece quando há algum: conta nova não
		     mostra caixa vazia. O cartão abre o mapa (docs/telas-modulos-aluno.md 1). -->
		{#if data.modulos.length > 0}
			<section class="mb-[26px]">
				<div class="mb-3.5 flex flex-wrap items-baseline gap-x-3.5 gap-y-2.5">
					<h2 class="font-display text-lg font-semibold lg:text-xl">Seus módulos</h2>
					<span class="text-[13px] text-base-content/65">o caminho de cada um, fase por fase</span>
				</div>
				<ul class="grid list-none grid-cols-1 gap-[11px] p-0 lg:grid-cols-2">
					{#each data.modulos as m (m.id)}
						{@const r = resumoDoMapa(m.fases)}
						<li class="min-w-0">
							<a
								href={resolve('/aluno/modulos/[id]', { id: m.id })}
								class="block min-w-0 cartao-interativo rounded-[14px] border border-line px-[17px] py-4 text-base-content no-underline hover:bg-base-200"
							>
								<span class="mb-0.75 flex items-baseline gap-2.5">
									<span class="min-w-0 flex-1 text-[15px] font-bold">{m.nome}</span>
									<span class="flex-none text-[13px] font-bold"
										>{r.concluidas} de {r.total} fases</span
									>
								</span>
								<span class="mb-3 block text-[12.5px] text-base-content/65"
									>{m.professor} · {m.turma}</span
								>
								<span class="mb-3 flex flex-wrap gap-1" aria-hidden="true">
									{#each m.fases as f (f.id)}
										<span
											class="grid size-6 place-items-center [clip-path:polygon(3px_0,calc(100%-3px)_0,100%_3px,100%_calc(100%-3px),calc(100%-3px)_100%,3px_100%,0_calc(100%-3px),0_3px)] {TRILHA[
												f.estado
											].classe}"
										>
											<svg class="size-[11px]" viewBox="0 0 7 7" shape-rendering="crispEdges"
												><path d={TRILHA[f.estado].icone} fill="currentColor" /></svg
											>
										</span>
									{/each}
								</span>
								<span
									class="flex items-center gap-2 text-[13px] {r.proxima.tipo === 'jogar'
										? 'font-bold text-primary'
										: 'text-base-content/65'}"
								>
									<svg
										class="size-3.5 flex-none"
										viewBox="0 0 7 7"
										shape-rendering="crispEdges"
										aria-hidden="true"
										><path
											d={r.proxima.tipo === 'jogar'
												? ICONE_PIXEL.jogar
												: r.proxima.tipo === 'fim'
													? ICONE_PIXEL.bandeira
													: ICONE_PIXEL.calendario}
											fill="currentColor"
										/></svg
									>
									{r.proxima.tipo === 'jogar'
										? `${r.proxima.fase.estado === 'doing' ? 'Continuar' : 'Jogar'} ${r.proxima.fase.titulo}`
										: r.proxima.tipo === 'fim'
											? 'Módulo concluído'
											: r.proxima.abre
												? `${r.proxima.tipo === 'vazio' ? 'A primeira' : 'Em dia. A próxima'} abre ${r.proxima.abre}`
												: r.proxima.tipo === 'vazio'
													? 'A primeira fase chega pelo seu e-mail'
													: 'Em dia. A próxima chega pelo seu e-mail'}
								</span>
							</a>
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		<!-- ═══ 5. como você vem indo ═══ Só das atividades com resultado
		     liberado — a conta não contorna o interruptor do professor. -->
		{#if cartoes.length > 0 || data.habilidades.length > 0}
			<section class="mb-[26px]">
				<div class="mb-3.5 flex flex-wrap items-baseline gap-x-3.5 gap-y-2.5">
					<h2 class="font-display text-lg font-semibold lg:text-xl">Como você vem indo</h2>
					<span class="text-[13px] text-base-content/65"
						>só das atividades com resultado liberado</span
					>
				</div>

				{#if cartoes.length > 0}
					<dl class="mb-3 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
						{#each cartoes as c (c.chave)}
							<div class="rounded-[13px] border border-line bg-card px-[15px] py-3.5">
								<dt class="mb-[9px] flex items-center gap-2">
									<span
										class="grid size-[26px] shrink-0 place-items-center rounded-lg bg-base-300 text-primary"
									>
										<svg class="size-3.5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
											{#if c.chave === 'acerto'}
												<path
													d="M12 20.5a8.5 8.5 0 100-17 8.5 8.5 0 000 17zM12 16a4 4 0 100-8 4 4 0 000 8zM12 13v.01"
													stroke="currentColor"
													stroke-width="2"
													stroke-linecap="round"
													stroke-linejoin="round"
												/>
											{:else if c.chave === 'tendencia'}
												<path
													d="M4 17l5-5 3.5 3.5L20 8M20 8h-4.5M20 8v4.5"
													stroke="currentColor"
													stroke-width="2"
													stroke-linecap="round"
													stroke-linejoin="round"
												/>
											{:else if c.chave === 'tempo'}
												<path
													d="M12 7.5V12l3 2M12 20.5a8.5 8.5 0 100-17 8.5 8.5 0 000 17z"
													stroke="currentColor"
													stroke-width="2"
													stroke-linecap="round"
													stroke-linejoin="round"
												/>
											{:else}
												<path
													d="M12 3.5s5 4 5 8.5a5 5 0 01-10 0c0-1.7.8-3 1.6-3.9.3 1.5 1.1 2.2 1.9 2.2 1 0 1.5-1 1.5-2.4 0-1.6-.5-3-.5-4.4z"
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

				{#if data.habilidades.length > 0}
					<p class="mb-2.5 text-[12.5px] text-base-content/65">
						Por habilidade, somando tudo que você já fez
					</p>
					<ul class="grid list-none gap-[9px] p-0">
						{#each data.habilidades as k, i (k.name)}
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
				{/if}
			</section>
		{/if}

		<!-- ═══ 6. histórico ═══ -->
		<section>
			<div class="mb-3.5 flex flex-wrap items-baseline gap-x-3.5 gap-y-2.5">
				<h2 class="font-display text-lg font-semibold lg:text-xl">O que você respondeu</h2>
				<span class="text-[13px] text-base-content/65">
					{#if data.attempts.length === 0}
						nada ainda
					{:else}
						{data.totals.attempts}
						{data.totals.attempts === 1 ? 'tentativa' : 'tentativas'} nesta conta
					{/if}
				</span>
			</div>

			{#if data.attempts.length > 0}
				<div class="mb-3 overflow-hidden rounded-[14px] border border-line">
					{#each data.attempts as tentativa (tentativa.id)}
						{@const estaAberta = aberta === tentativa.id}
						<div class="border-b border-line last:border-0">
							<!-- A linha inteira abre o detalhe: `aria-expanded` diz o que ela
							     faz, e o "Continuar" mora DENTRO do detalhe para não haver
							     botão dentro de botão. -->
							<button
								type="button"
								onclick={() => (aberta = estaAberta ? null : tentativa.id)}
								aria-expanded={estaAberta}
								class="flex w-full flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-[13px] text-start text-sm transition-colors hover:bg-base-200 lg:gap-5 lg:px-5 lg:py-3.5"
							>
								<span class="min-w-[200px] flex-1">
									<span class="mb-[3px] block font-semibold text-pretty">{tentativa.title}</span>
									<span class="block text-[12.5px] text-base-content/65">
										{tentativa.teacher} · {tentativa.language} · {tentativa.when}
									</span>
								</span>
								<span class="shrink-0 font-mono text-[13px] text-base-content/65"
									>{tentativa.answered} de {tentativa.itemCount}</span
								>
								{#if tentativa.percent !== null}
									<span
										class="inline-flex shrink-0 items-center gap-2 rounded-full bg-base-300 px-3 py-1.5 text-xs font-bold whitespace-nowrap text-primary"
									>
										<svg class="size-3.5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
											<path
												d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM14.6 12a2.6 2.6 0 11-5.2 0 2.6 2.6 0 015.2 0z"
												stroke="currentColor"
												stroke-width="2"
												stroke-linejoin="round"
											/>
										</svg>
										{tentativa.percent}%
									</span>
								{:else}
									<!-- O professor desligou o feedback: "Sem placar" com ícone
									     próprio, não 0% nem traço — os dois pareceriam nota ruim ou
									     dado perdido. A conta guarda o histórico, não contorna o que
									     ele decidiu mostrar. -->
									<span
										class="inline-flex shrink-0 items-center gap-2 rounded-full border border-line bg-base-200 px-3 py-1.5 text-xs font-bold whitespace-nowrap text-base-content/65"
									>
										<svg class="size-3.5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
											<path
												d="M4 4.5l16 15M9.2 6.2A9.4 9.4 0 0112 5.9c6 0 9.5 6.1 9.5 6.1a17 17 0 01-3.3 3.9M6.3 8.3A17 17 0 002.5 12s3.5 6.1 9.5 6.1c1 0 2-.2 2.9-.5"
												stroke="currentColor"
												stroke-width="2"
												stroke-linecap="round"
												stroke-linejoin="round"
											/>
										</svg>
										Sem placar
									</span>
								{/if}
								<svg
									class="size-4 shrink-0 text-base-content/65 transition-transform duration-200 {estaAberta
										? 'rotate-180'
										: ''}"
									viewBox="0 0 24 24"
									fill="none"
									aria-hidden="true"
								>
									<path
										d="M6 9.5l6 6 6-6"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
								</svg>
							</button>

							{#if estaAberta}
								<div
									class="flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-line bg-base-200 px-3.5 py-[11px] lg:px-5"
								>
									{#if tentativa.barra}
										<span class="min-w-[180px] flex-1">
											<ScoreBar
												correct={tentativa.barra.correct}
												partial={tentativa.barra.partial}
												incorrect={tentativa.barra.incorrect}
												height="h-[9px]"
											/>
											<span
												class="mt-2 flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-base-content/65"
											>
												<span class="flex items-center gap-1.5">
													<span class="size-2 rounded-[2px] bg-success"></span>
													<strong class="text-success">{tentativa.barra.correct}</strong> certas
												</span>
												<span class="flex items-center gap-1.5">
													<span class="size-2 rounded-[2px] bg-warning"></span>
													<strong class="text-warning">{tentativa.barra.partial}</strong> parciais
												</span>
												<span class="flex items-center gap-1.5">
													<span class="size-2 rounded-[2px] bg-error"></span>
													<strong class="text-error">{tentativa.barra.incorrect}</strong> erradas
												</span>
											</span>
										</span>
									{:else}
										<p
											class="min-w-[180px] flex-1 text-[12.5px] leading-relaxed text-pretty text-base-content/65"
										>
											O professor não liberou o resultado desta — só o registro de que você
											respondeu.
										</p>
									{/if}

									<span
										class="flex shrink-0 flex-wrap gap-x-4 gap-y-1 text-xs text-base-content/65"
									>
										{#if tentativa.tempo}
											<span class="font-mono">{tentativa.tempo}</span>
										{/if}
										<span>{tentativa.estado}</span>
									</span>

									{#if tentativa.finished && tentativa.showResult}
										<a
											href={resolve('/a/[slug]/revisao', { slug: tentativa.slug })}
											class="btn btn-sm min-h-9 shrink-0 motion-tap btn-plain text-xs font-semibold no-underline"
											>Ver questão a questão</a
										>
									{:else if !tentativa.finished}
										<a
											href={resolve('/a/[slug]', { slug: tentativa.slug })}
											class="btn btn-sm min-h-9 shrink-0 motion-tap btn-primary text-xs font-bold no-underline"
											>Continuar</a
										>
									{/if}
								</div>
							{/if}
						</div>
					{/each}
				</div>
				<p class="text-[12.5px] leading-relaxed text-pretty text-base-content/65">
					A nota só aparece quando o professor liga "mostrar resultado" naquela atividade. Sem isso
					a tentativa continua registrada — só não tem placar.
				</p>
			{:else}
				<!-- Conta nova sem tentativa não é falha: é o caminho normal de quem
				     só criou conta. O vazio explica o ganho, sem sugerir pendência. -->
				<div class="rounded-[14px] border border-dashed border-line px-5 py-[26px] text-center">
					<p class="mb-[7px] text-[15px] font-bold">Nada respondido com esta conta ainda</p>
					<p
						class="mx-auto max-w-[58ch] text-[13.5px] leading-relaxed text-pretty text-base-content/65"
					>
						Assim que você abrir um link e terminar uma atividade estando logado, ela aparece aqui —
						e continua aparecendo se você trocar de celular.
					</p>
				</div>
			{/if}
		</section>
	</main>
</div>

<AvatarEditor bind:codigo bind:aberto={editorAberto} nome={data.account.name} onusar={usarAvatar} />
