<script lang="ts">
	// O editor do avatar, desenhado como a tela de criar personagem de um jogo:
	// o palco escuro com o personagem iluminado à esquerda, a trilha de
	// categorias com o cursor de menu no meio, a oficina das peças à direita.
	//
	// **O tamanho NÃO muda com o que se escolhe.** O diálogo tem altura e largura
	// fixas (tela cheia no celular) e só as regiões de dentro rolam. Antes ele
	// era do tamanho do conteúdo, centralizado: cada categoria tinha outra
	// quantidade de peças e as abas quebravam em duas linhas, então o modal
	// inteiro encolhia e crescia a cada toque.
	//
	// **É um `<dialog>` de verdade, não uma `div` com fundo escuro.** Foco preso,
	// Escape e o backdrop vêm do próprio elemento — "sem framework de UI"
	// (design-system.md) é razão para usar a plataforma, não para reimplementar
	// o que ela já faz.
	//
	// **Cada miniatura mostra a escolha no avatar de AGORA**, não num manequim:
	// é a única forma de saber se aquele cabelo combina com aquela pele.
	//
	// Cancelar devolve o avatar como estava ao abrir — inclusive no Escape.
	import Avatar from './Avatar.svelte';
	import {
		CASAS_ACESSORIO,
		CATEGORIAS,
		CATEGORIA_INICIAL,
		SUGESTOES,
		type Categoria
	} from '$lib/avatar/catalogo';
	import {
		acessoriosLigados,
		alternarAcessorio,
		ciclar,
		codigoDaOpcao,
		escolhaAtual,
		trocarCasa,
		type Escolha
	} from '$lib/avatar/editar';
	import {
		ICONE_ANTERIOR,
		ICONE_CURSOR,
		ICONE_DADO,
		ICONE_DA_CATEGORIA,
		ICONE_DESFAZER,
		ICONE_FECHAR,
		ICONE_PROXIMO,
		ICONE_VISTO
	} from '$lib/avatar/icones';
	import { normalizar, sortearCodigo } from '$lib/avatar/montar';
	import { DURACAO } from '$lib/movimento';

	let {
		/** O código em edição. Sobe a cada toque, para a prévia de fora acompanhar. */
		codigo = $bindable(),
		aberto = $bindable(false),
		/** O nome de quem é o avatar — vai na plaquinha do palco. */
		nome = '',
		/** Chamado no "Usar este avatar", com o código final. */
		onusar,
		/** Chamado ao cancelar ou fechar, já com o código restaurado. */
		oncancelar
	}: {
		codigo: string;
		aberto?: boolean;
		nome?: string;
		onusar?: (codigo: string) => void;
		oncancelar?: () => void;
	} = $props();

	/** A trilha: os prontos primeiro, separados das onze categorias. */
	const PRONTOS = 'prontos';
	const ABAS = [
		{ chave: PRONTOS, label: 'Prontos' },
		...CATEGORIAS.map((c) => ({ chave: c.chave, label: c.label }))
	];

	/** Os três tamanhos em que o avatar de fato aparece, com o raio de cada lugar. */
	const USOS = [
		{ px: 56, onde: 'cabeçalho', raio: 'rounded-full' },
		{ px: 40, onde: 'turma', raio: 'rounded-[8px]' },
		{ px: 32, onde: 'lista', raio: 'rounded-[6px]' }
	];

	/** O canto cortado em degrau — a moldura de pixel, a mesma do mapa do módulo. */
	const CORTE =
		'[clip-path:polygon(8px_0,calc(100%-8px)_0,100%_8px,100%_calc(100%-8px),calc(100%-8px)_100%,8px_100%,0_calc(100%-8px),0_8px)]';
	const CORTE_DENTRO =
		'[clip-path:polygon(6px_0,calc(100%-6px)_0,100%_6px,100%_calc(100%-6px),calc(100%-6px)_100%,6px_100%,0_calc(100%-6px),0_6px)]';

	/** O botão do palco escuro: o mesmo nos dois temas, porque o palco é sempre escuro. */
	const BOTAO_PALCO =
		'inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] border border-panel-line bg-panel-line/35 px-3 text-[13.5px] font-semibold text-panel-content motion-tap hover:bg-panel-line/75 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-panel-content disabled:pointer-events-none disabled:opacity-40';

	/** As setas ◀ ▶ do seletor da oficina. */
	const SETA =
		'grid size-10 shrink-0 place-items-center rounded-[10px] border border-line bg-base-100 motion-tap hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

	let dialogo = $state<HTMLDialogElement | null>(null);
	let grade = $state<HTMLDivElement | null>(null);
	let trilha = $state<HTMLDivElement | null>(null);
	let aba = $state(CATEGORIA_INICIAL);
	/** O avatar como estava ao abrir — o que "Cancelar" devolve. */
	let comoEstava = $state(codigo);
	/** Os códigos anteriores, para o "Desfazer" (e o Ctrl+Z). */
	let historico = $state<string[]>([]);
	/** Quantas vezes o dado girou — cada sorteio vira ele um quarto de volta. */
	let giros = $state(0);
	/** O que as setas ‹ › anunciam para o leitor de tela. */
	let anuncio = $state('');

	// `showModal()` é imperativo: não existe atributo que o faça. O efeito
	// espelha `aberto` no elemento nos dois sentidos de abertura.
	$effect(() => {
		if (!dialogo) return;
		if (aberto && !dialogo.open) {
			comoEstava = codigo;
			historico = [];
			aba = CATEGORIA_INICIAL;
			fechando = false;
			dialogo.showModal();
		} else if (!aberto && dialogo.open && !fechando) {
			fecharComSaida(dialogo);
		}
	});

	/**
	 * Fechar ANIMA antes de fechar: o `close()` nativo some com o diálogo e o
	 * véu no mesmo quadro, e a tela parecia piscar. A saída (`--duration-curta`)
	 * roda com o diálogo ainda aberto; o `close()` vem no fim dela. O
	 * `setTimeout` é a rede para quando a animação não roda.
	 */
	let fechando = $state(false);
	function fecharComSaida(el: HTMLDialogElement) {
		fechando = true;
		const terminar = () => {
			if (!fechando) return;
			fechando = false;
			if (!aberto && el.open) el.close();
		};
		el.addEventListener('animationend', terminar, { once: true });
		setTimeout(terminar, DURACAO.curta + 60);
	}
	const animacao = $derived(
		fechando
			? 'animate-modal-saida backdrop:animate-veu-saida'
			: 'open:animate-entrada-curta backdrop:animate-veu'
	);

	// Trocar de categoria volta a grade para o topo (senão ela abre rolada no
	// meio, no ponto em que a anterior estava) e, no celular, traz a aba
	// escolhida para dentro da faixa.
	$effect(() => {
		void aba;
		if (grade) grade.scrollTop = 0;
		trilha
			?.querySelector<HTMLElement>('[aria-selected="true"]')
			?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
	});

	const categoria = $derived<Categoria | null>(CATEGORIAS.find((c) => c.chave === aba) ?? null);
	const agora = $derived(normalizar(codigo).split('-').map(Number));
	const antes = $derived(normalizar(comoEstava).split('-').map(Number));
	const ligados = $derived(acessoriosLigados(codigo));
	const multi = $derived(categoria?.chave === 'acessorio');
	const titulo = $derived(categoria?.label ?? 'Prontos');
	/** Qual dos prontos está no palco — -1 quando o avatar já não é nenhum deles. */
	const pronto = $derived(SUGESTOES.findIndex((s) => normalizar(s) === normalizar(codigo)));
	const escolha = $derived<Escolha>(
		categoria
			? escolhaAtual(categoria, codigo)
			: {
					indice: pronto,
					total: SUGESTOES.length,
					nome: pronto < 0 ? 'nenhum deles' : `pronto ${pronto + 1}`,
					cicla: true
				}
	);

	/**
	 * A casa de cor pertence à PRIMEIRA categoria que a usa: a barba tem a cor
	 * do cabelo, e trocar a cor do cabelo não pode contar como "a barba mudou".
	 */
	const donoDaCor = (casa: number) => CATEGORIAS.find((c) => c.iCor === casa)?.chave;

	/** A categoria está diferente de quando o editor abriu. */
	function mudou(c: Categoria): boolean {
		const cor = c.iCor >= 0 && donoDaCor(c.iCor) === c.chave && antes[c.iCor] !== agora[c.iCor];
		if (c.chave === 'acessorio') {
			const a = CASAS_ACESSORIO.map((i) => antes[i] ?? 0).filter((v) => v > 0);
			const b = [...ligados];
			return cor || a.length !== b.length || a.some((v) => !b.includes(v));
		}
		return cor || (c.iForma !== null && antes[c.iForma] !== agora[c.iForma]);
	}
	const mudancas = $derived(CATEGORIAS.filter(mudou).length);

	interface Opcao {
		i: number;
		nome: string;
		codigo: string;
		ativo: boolean;
		/** Só nas categorias que são só cor: a amostra embaixo da miniatura. */
		cor?: string;
	}

	// Pele e fundo, que são só cor, também viram miniaturas — o tom de pele no
	// rosto de agora diz mais que um quadradinho de cor solto.
	const opcoes = $derived.by<Opcao[]>(() => {
		const c = categoria;
		if (!c) {
			return SUGESTOES.map((s, i) => ({
				i,
				nome: `Pronto ${i + 1}`,
				codigo: s,
				ativo: normalizar(codigo) === normalizar(s)
			}));
		}
		if (c.iForma === null) {
			return c.paleta.map((cor, i) => ({
				i,
				nome: `${c.corLabel}, opção ${i + 1}`,
				codigo: trocarCasa(codigo, c.iCor, i),
				ativo: agora[c.iCor] === i,
				cor
			}));
		}
		const casa = c.iForma;
		return Array.from({ length: c.nFormas }, (_, i) => ({
			i,
			nome: c.nomes[i] ?? String(i + 1),
			codigo: codigoDaOpcao(codigo, casa, i),
			ativo: multi ? (i === 0 ? ligados.length === 0 : ligados.includes(i)) : agora[casa] === i
		}));
	});

	/** A paleta da base da oficina — só onde há peça E cor (pele e fundo já são a grade). */
	const paleta = $derived(
		categoria && categoria.iForma !== null && categoria.paleta.length > 0 ? categoria.paleta : []
	);

	/** Toda mudança passa por aqui, para o "Desfazer" ter o que desfazer. */
	function mudar(novo: string) {
		if (novo === codigo) return;
		historico = [...historico.slice(-49), codigo];
		codigo = novo;
	}

	function desfazer() {
		const anterior = historico.at(-1);
		if (anterior === undefined) return;
		historico = historico.slice(0, -1);
		codigo = anterior;
	}

	function sortear() {
		giros += 1;
		mudar(sortearCodigo());
	}

	function tocar(o: Opcao) {
		const c = categoria;
		if (!c) return mudar(o.codigo);
		if (c.iForma === null) return mudar(trocarCasa(codigo, c.iCor, o.i));
		mudar(multi ? alternarAcessorio(codigo, o.i) : trocarCasa(codigo, c.iForma, o.i));
	}

	/** As setas ◀ ▶. Nos prontos elas passam de um personagem montado para o outro. */
	function passo(direcao: number) {
		const n = SUGESTOES.length;
		const novo = categoria
			? ciclar(categoria, codigo, direcao)
			: SUGESTOES[pronto < 0 ? (direcao > 0 ? 0 : n - 1) : (pronto + direcao + n) % n]!;
		mudar(novo);
		// `escolha` é derivada: lida aqui, já vem do código novo.
		anuncio = `${titulo}: ${escolha.nome}, ${escolha.indice + 1} de ${escolha.total}`;
	}

	/** A trilha é um `tablist`: setas andam (nos dois sentidos, porque no celular ela é horizontal). */
	function teclaNaTrilha(e: KeyboardEvent) {
		const i = ABAS.findIndex((a) => a.chave === aba);
		const alvo =
			e.key === 'ArrowDown' || e.key === 'ArrowRight'
				? (i + 1) % ABAS.length
				: e.key === 'ArrowUp' || e.key === 'ArrowLeft'
					? (i - 1 + ABAS.length) % ABAS.length
					: e.key === 'Home'
						? 0
						: e.key === 'End'
							? ABAS.length - 1
							: -1;
		if (alvo < 0) return;
		e.preventDefault();
		aba = ABAS[alvo]!.chave;
		trilha?.querySelector<HTMLElement>(`[data-aba="${aba}"]`)?.focus();
	}

	function teclaNoDialogo(e: KeyboardEvent) {
		if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
			e.preventDefault();
			desfazer();
		}
	}

	const dois = (n: number) => String(n).padStart(2, '0');

	function cancelar() {
		codigo = comoEstava;
		aberto = false;
		oncancelar?.();
	}

	function usar() {
		aberto = false;
		onusar?.(codigo);
	}
</script>

{#snippet pixel(d: string, classe: string)}
	<svg viewBox="0 0 7 7" class={classe} shape-rendering="crispEdges" aria-hidden="true">
		<path {d} fill="currentColor" />
	</svg>
{/snippet}

{#snippet acoesDoPalco(classe: string)}
	<div class={classe}>
		<button type="button" onclick={sortear} class={BOTAO_PALCO}>
			<span
				class="inline-block transition-transform duration-(--duration-media) [transition-timing-function:steps(3,end)]"
				style:transform="rotate({giros * 90}deg)"
			>
				{@render pixel(ICONE_DADO, 'size-4')}
			</span>
			Sortear
		</button>
		<button
			type="button"
			onclick={desfazer}
			disabled={historico.length === 0}
			aria-keyshortcuts="Control+Z"
			class={BOTAO_PALCO}
		>
			{@render pixel(ICONE_DESFAZER, 'size-4')}
			Desfazer
		</button>
	</div>
{/snippet}

<!-- Escape (o `cancel` nativo, com o fechar imediato impedido para a saída
     animar) e o clique no véu (o clique cai no próprio `<dialog>`, fora do
     conteúdo) devolvem o avatar como estava — senão "fechar sem querer" grava
     a mudança. O véu é o `overlay`, preto nos dois temas. -->
<dialog
	bind:this={dialogo}
	onclose={() => {
		if (aberto) cancelar();
	}}
	oncancel={(e) => {
		e.preventDefault();
		cancelar();
	}}
	onclick={(e) => {
		if (e.target === dialogo) cancelar();
	}}
	onkeydown={teclaNoDialogo}
	aria-labelledby="avatar-editor-titulo"
	class="m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden border-0 bg-base-100 p-0 text-base-content
	       backdrop:bg-overlay backdrop:backdrop-blur-[3px]
	       lg:m-auto lg:h-[min(680px,calc(100dvh-2.5rem))] lg:w-[min(1080px,calc(100vw-2.5rem))] lg:rounded-box lg:border lg:border-line
	       lg:shadow-[0_40px_90px_-40px_rgba(9,14,25,0.7)] {animacao}"
>
	<div
		class="grid h-full grid-rows-[auto_auto_minmax(0,1fr)_auto]
		       lg:grid-cols-[320px_164px_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)_auto]"
	>
		<!-- ═══ o palco ═══ -->
		<section
			class="relative isolate flex min-h-0 flex-col overflow-hidden bg-panel text-panel-content lg:row-span-2"
		>
			<!-- A luz de palco: cenário, sem movimento. -->
			<div aria-hidden="true" class="pointer-events-none absolute inset-0 -z-10">
				<div
					class="absolute inset-x-0 top-0 h-full bg-[radial-gradient(70%_50%_at_50%_42%,color-mix(in_oklab,var(--color-primary)_38%,transparent),transparent_75%)] lg:bg-[radial-gradient(85%_42%_at_50%_44%,color-mix(in_oklab,var(--color-primary)_42%,transparent),transparent_78%)]"
				></div>
			</div>

			<div class="px-4 pe-14 pt-4 lg:px-6 lg:pt-6">
				<h2
					id="avatar-editor-titulo"
					class="font-display text-[18px] font-semibold tracking-[-0.02em] lg:text-[21px]"
				>
					Monte seu avatar
				</h2>
				<p class="mt-0.5 text-[12.5px] text-panel-dim">Onze peças, nenhuma obrigatória.</p>
			</div>

			<div
				class="flex flex-1 items-center gap-4 px-4 pt-3 pb-4 lg:flex-col lg:justify-center lg:gap-0 lg:px-6 lg:py-2"
			>
				<div class="relative flex shrink-0 flex-col items-center">
					<!-- O chão quadriculado em perspectiva, que nasce no pedestal e some
					     para trás: é ele que transforma o quadro num palco. -->
					<span
						aria-hidden="true"
						class="pointer-events-none absolute -inset-x-56 top-[calc(100%-18px)] -z-10 hidden h-[190px] origin-top [transform:perspective(260px)_rotateX(64deg)] bg-[linear-gradient(var(--color-panel-line)_1px,transparent_1px),linear-gradient(90deg,var(--color-panel-line)_1px,transparent_1px)] mask-[radial-gradient(50%_70%_at_50%_0%,black_25%,transparent_100%)] bg-size-[28px_28px] lg:block"
					></span>
					<!-- O personagem dá um pulinho em três quadros a cada troca: a
					     resposta ao toque, no mesmo passo de jogo antigo do mapa. -->
					{#key codigo}
						<span class="block animate-salto [filter:drop-shadow(0_16px_22px_rgb(0_0_0/0.45))]">
							<span class="block bg-panel-content/90 p-[3px] {CORTE}">
								<span class="block size-[92px] overflow-hidden lg:size-[172px] {CORTE_DENTRO}">
									<Avatar {codigo} size={172} radius="rounded-none" class="size-full!" />
								</span>
							</span>
						</span>
					{/key}
					<!-- O pedestal: a luz da marca no chão e a sombra do personagem. -->
					<span aria-hidden="true" class="relative mt-2 block h-3 w-[120%] lg:mt-3 lg:h-5">
						<span
							class="absolute inset-0 bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--color-primary)_60%,transparent),transparent)]"
						></span>
						<span
							class="absolute inset-x-[18%] inset-y-[22%] bg-[radial-gradient(closest-side,rgb(0_0_0/0.6),transparent)]"
						></span>
					</span>
				</div>

				<div class="min-w-0 flex-1 lg:mt-3 lg:w-full lg:flex-none">
					<p
						class="truncate text-[15px] font-bold tracking-[-0.01em] lg:text-center lg:text-[17px]"
					>
						{nome || 'Seu avatar'}
					</p>
					{@render acoesDoPalco('mt-2.5 grid grid-cols-2 gap-2 lg:hidden')}
				</div>
			</div>

			<!-- Os três tamanhos reais: é aqui que se descobre que as sardas somem
			     em 32px — e é para ser assim. -->
			<div class="hidden px-6 pb-5 lg:block">
				<p class="mb-3 text-center text-[12px] text-panel-dim">Onde ele aparece</p>
				<div class="flex items-end justify-center gap-6">
					{#each USOS as u (u.px)}
						<span class="grid justify-items-center gap-1.5">
							<Avatar {codigo} size={u.px} radius={u.raio} class="ring-1 ring-panel-line" />
							<span class="text-[11px] text-panel-dim">{u.onde}</span>
						</span>
					{/each}
				</div>
			</div>

			{@render acoesDoPalco('hidden grid-cols-2 gap-2 px-6 pb-6 lg:grid')}
		</section>

		<!-- ═══ a trilha de categorias ═══
		     Vertical no computador, uma faixa que rola de lado no celular. -->
		<div
			bind:this={trilha}
			role="tablist"
			tabindex="-1"
			aria-label="Partes do avatar"
			onkeydown={teclaNaTrilha}
			class="flex gap-1.5 overflow-x-auto border-b border-line bg-base-200 px-3 py-2.5
			       lg:flex-col lg:gap-0.5 lg:overflow-x-visible lg:overflow-y-auto lg:border-e lg:border-b-0 lg:px-2.5 lg:py-3.5"
		>
			{#each ABAS as a, n (a.chave)}
				{@const sel = a.chave === aba}
				{@const cat = CATEGORIAS.find((c) => c.chave === a.chave)}
				{@const alterada = cat ? mudou(cat) : false}
				<button
					type="button"
					role="tab"
					id="avatar-aba-{a.chave}"
					data-aba={a.chave}
					aria-selected={sel}
					aria-controls="avatar-oficina"
					tabindex={sel ? 0 : -1}
					onclick={() => (aba = a.chave)}
					class="relative flex h-10 shrink-0 items-center gap-2 rounded-full border px-3.5 text-[13px] font-semibold whitespace-nowrap transition-colors
					       focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary
					       lg:w-full lg:rounded-[9px] lg:border-0 lg:ps-7 lg:pe-2.5 lg:text-[13.5px]
					       {sel
						? 'border-primary bg-primary text-primary-content lg:bg-base-100 lg:text-base-content lg:shadow-[0_0_0_1px_var(--color-line),0_1px_2px_rgba(15,20,32,0.06)]'
						: 'border-line bg-base-100 text-base-content/75 hover:text-base-content lg:bg-transparent lg:hover:bg-base-100/70'}"
				>
					{#if sel}
						{@render pixel(ICONE_CURSOR, 'absolute start-2 hidden size-2.5 text-primary lg:block')}
					{/if}
					{@render pixel(
						ICONE_DA_CATEGORIA[a.chave] ?? '',
						`size-4 shrink-0 lg:size-[18px] ${sel ? 'lg:text-primary' : 'opacity-80'}`
					)}
					<span class="lg:flex-1 lg:text-start">{a.label}</span>
					{#if alterada}
						<span
							class="size-1.5 shrink-0 rounded-full {sel
								? 'bg-primary-content lg:bg-primary'
								: 'bg-primary'}"
							aria-hidden="true"
						></span>
						<span class="sr-only">, mudou</span>
					{/if}
				</button>
				{#if n === 0}
					<span
						role="none"
						class="mx-1 my-1.5 w-px shrink-0 self-stretch bg-line lg:mx-2 lg:my-2 lg:h-px lg:w-auto"
					></span>
				{/if}
			{/each}
		</div>

		<!-- ═══ a oficina ═══ -->
		<div
			id="avatar-oficina"
			role="tabpanel"
			aria-labelledby="avatar-aba-{aba}"
			class="flex min-h-0 min-w-0 flex-col lg:col-start-3 lg:row-start-1"
		>
			<div class="shrink-0 px-4 pt-4 pb-3 lg:px-7 lg:pe-16 lg:pt-6 lg:pb-4">
				<h3 class="font-display text-[19px] font-semibold tracking-[-0.02em] lg:text-[22px]">
					{titulo}
				</h3>

				<!-- O seletor de jogo: ◀ opção ▶, com a posição ao lado. Em acessório,
				     que é escolha múltipla, só a caixa — as setas não fariam sentido. -->
				<div class="mt-2.5 flex items-center gap-1.5" role="group" aria-label={titulo}>
					{#if escolha.cicla}
						<button
							type="button"
							onclick={() => passo(-1)}
							aria-label="{titulo}: opção anterior"
							class={SETA}
						>
							{@render pixel(ICONE_ANTERIOR, 'size-3.5')}
						</button>
					{/if}
					<span
						class="flex h-10 min-w-0 flex-1 items-center justify-between gap-3 rounded-[10px] border border-line bg-base-200 px-3.5 lg:max-w-[300px]"
					>
						<span class="truncate text-[14px] font-semibold text-primary">{escolha.nome}</span>
						<span class="shrink-0 font-pixel text-[11px] text-base-content/60" aria-hidden="true">
							{#if multi}
								{escolha.indice}/{escolha.total}
							{:else}
								{escolha.indice < 0 ? '--' : dois(escolha.indice + 1)}/{dois(escolha.total)}
							{/if}
						</span>
						<span class="sr-only">
							{multi
								? `, ${escolha.indice} de ${escolha.total} peças`
								: escolha.indice < 0
									? ''
									: `, ${escolha.indice + 1} de ${escolha.total}`}
						</span>
					</span>
					{#if escolha.cicla}
						<button
							type="button"
							onclick={() => passo(1)}
							aria-label="{titulo}: próxima opção"
							class={SETA}
						>
							{@render pixel(ICONE_PROXIMO, 'size-3.5')}
						</button>
					{/if}
				</div>
				<p
					class="mt-2.5 max-w-[62ch] text-[12.5px] leading-relaxed text-pretty text-base-content/65 lg:min-h-[3lh]"
				>
					{categoria?.nota ??
						'Comece de um destes e ajuste o que quiser nas outras partes — ou use do jeito que está.'}
				</p>
				<p class="sr-only" aria-live="polite">{anuncio}</p>
			</div>

			<div
				bind:this={grade}
				class="min-h-0 flex-1 [scrollbar-gutter:stable] overflow-y-auto px-4 pt-1 pb-5 lg:px-7 lg:pb-6"
			>
				<div
					class="grid gap-2.5 {categoria
						? 'grid-cols-[repeat(auto-fill,minmax(76px,1fr))]'
						: 'grid-cols-[repeat(auto-fill,minmax(104px,1fr))]'}"
				>
					{#each opcoes as o (`${aba}-${o.i}`)}
						<button
							type="button"
							onclick={() => tocar(o)}
							aria-pressed={o.ativo}
							aria-label={o.cor || !categoria ? o.nome : undefined}
							class="group relative flex flex-col items-center gap-1.5 rounded-[12px] border-2 px-1.5 pt-2 pb-1.5
							       transition-[translate,border-color,background-color] [transition-timing-function:steps(2,end)] hover:-translate-y-0.5
							       focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary
							       {o.ativo
								? 'border-primary bg-primary/8'
								: 'border-line bg-base-200 hover:border-base-content/30'}"
						>
							<Avatar
								codigo={o.codigo}
								size={categoria ? 54 : 76}
								radius="rounded-[8px]"
								class="max-w-full"
							/>
							{#if o.cor}
								<!-- A cor é conteúdo (é a pele de alguém), não um token de
								     interface — ver `paletas.ts`. -->
								<span
									class="my-1 block h-2 w-9 rounded-full ring-1 ring-line"
									style:background={o.cor}
								></span>
							{:else if categoria}
								<span
									class="line-clamp-2 text-center text-[11.5px] leading-tight font-semibold {o.ativo
										? 'text-primary'
										: 'text-base-content/70'}">{o.nome}</span
								>
							{/if}
							{#if o.ativo}
								<span
									class="absolute -end-2 -top-2 grid size-5 place-items-center rounded-full bg-primary text-primary-content shadow-[0_0_0_2px_var(--color-base-100)]"
									aria-hidden="true"
								>
									{@render pixel(ICONE_VISTO, 'size-3')}
								</span>
							{/if}
						</button>
					{/each}
				</div>
			</div>

			{#if paleta.length > 0 && categoria}
				<div
					class="flex shrink-0 items-center gap-3 border-t border-line bg-base-200/70 px-4 py-2.5 lg:gap-4 lg:px-7 lg:py-3"
				>
					<p class="w-24 shrink-0 text-[12px] leading-tight font-semibold text-base-content/70">
						{categoria.corLabel}
					</p>
					<div
						class="flex min-w-0 flex-1 gap-2 overflow-x-auto p-1"
						role="group"
						aria-label={categoria.corLabel}
					>
						{#each paleta as cor, i (cor)}
							{@const sel = agora[categoria.iCor] === i}
							<button
								type="button"
								onclick={() => mudar(trocarCasa(codigo, categoria.iCor, i))}
								aria-pressed={sel}
								aria-label="{categoria.corLabel}, opção {i + 1}"
								class="relative grid size-9 shrink-0 motion-tap place-items-center rounded-[10px]
								       focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary
								       {sel
									? 'shadow-[0_0_0_2px_var(--color-base-100),0_0_0_4px_var(--color-primary)]'
									: 'shadow-[0_0_0_1px_var(--color-line)] hover:-translate-y-0.5'}"
								style:background={cor}
							>
								{#if sel}
									<span
										class="grid size-4 place-items-center rounded-full bg-base-100 text-primary"
										aria-hidden="true"
									>
										{@render pixel(ICONE_VISTO, 'size-2.5')}
									</span>
								{/if}
							</button>
						{/each}
					</div>
				</div>
			{/if}
		</div>

		<!-- ═══ o rodapé ═══ -->
		<div
			class="flex shrink-0 items-center gap-2.5 border-t border-line bg-base-100 px-4 py-3 lg:col-span-2 lg:col-start-2 lg:row-start-2 lg:px-7 lg:py-3.5"
		>
			<button
				type="button"
				onclick={cancelar}
				class="btn min-h-[46px] motion-tap btn-outline font-semibold">Cancelar</button
			>
			<span class="hidden flex-1 text-[12.5px] text-base-content/65 lg:block">
				{#if mudancas === 0}
					Nada mudou desde que você abriu.
				{:else}
					{mudancas}
					{mudancas === 1 ? 'parte mudou' : 'partes mudaram'} desde que você abriu.
				{/if}
			</span>
			<button
				type="button"
				onclick={usar}
				class="btn min-h-[46px] flex-1 motion-tap btn-primary font-bold lg:flex-none lg:px-6"
				>Usar este avatar</button
			>
		</div>
	</div>

	<button
		type="button"
		onclick={cancelar}
		aria-label="Fechar sem salvar"
		class="absolute end-3 top-3 z-10 grid size-[38px] motion-tap place-items-center rounded-full text-panel-content hover:bg-panel-line/60
		       focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary
		       lg:end-4 lg:top-4 lg:text-base-content lg:hover:bg-base-200"
	>
		{@render pixel(ICONE_FECHAR, 'size-3.5')}
	</button>
</dialog>
