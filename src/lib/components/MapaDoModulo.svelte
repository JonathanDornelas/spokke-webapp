<script lang="ts">
	// O MAPA do módulo, no tema de jogo em 8 bits (docs/telas-modulos-aluno.md).
	// O mesmo componente desenha o mapa do aluno e a prévia do professor
	// (`previa`: sem ação nenhuma e sem progresso de ninguém).
	//
	// - **O desenho é visual; a estrutura é uma `<ol>`**, uma fase por item, e o
	//   leitor de tela lê "Fase 3 de 8, Frutas 3, em andamento, continuar". A
	//   trilha, o cenário e o avatar são `aria-hidden`.
	// - **Pixel art como DADO** (o molde de `$lib/avatar/`): cada sprite é uma
	//   grade de letras, cada letra uma cor por TOKEN, e vira `path` com
	//   `crispEdges`. Nenhuma imagem, e o tema escuro troca as cores sozinho.
	// - **Concluída é azul, não verde**: terminou não é acertou. As estrelas só
	//   existem onde o professor liberou o resultado.
	// - **O mapa não tranca o link**: toda fase liberada abre, mesmo fora da
	//   ordem. Quem tranca é só a programação do professor.
	// - O avatar anda UMA vez (quando ele avançou desde a última visita) e para;
	//   a festa do módulo concluído também é uma vez só. As duas memórias ficam
	//   no aparelho (`localStorage`) — não é dado novo sobre o aluno.
	import { onMount, tick } from 'svelte';
	import Avatar from './Avatar.svelte';
	import { modal, veu } from '$lib/client/transicoes';
	import { viewport } from '$lib/client/viewport.svelte';
	import { som } from '$lib/client/sons.svelte';
	import { caminhoDaGrade, ICONE_PIXEL } from '$lib/modulos/pixel';
	import {
		comAcao,
		estrelasDe,
		posicaoDoAvatar,
		resumoDoMapa,
		type EstadoDaFase,
		type Fase,
		type MapaDoModulo
	} from '$lib/modulos/mapa';

	let {
		mapa,
		mundo = 1,
		avatar = null,
		nome = '',
		previa = false
	}: {
		mapa: MapaDoModulo;
		/** O número do "MUNDO" — a posição do módulo entre os do aluno. */
		mundo?: number;
		avatar?: string | null;
		nome?: string;
		/** A prévia do professor: nenhuma ação, nenhum progresso. */
		previa?: boolean;
	} = $props();

	const desk = $derived(viewport.desktop);
	let largura = $state(356);

	const fases = $derived(mapa.fases);
	const N = $derived(fases.length);
	const resumo = $derived(resumoDoMapa(fases));
	const atual = $derived(posicaoDoAvatar(fases));

	// ── geometria: vertical de baixo para cima no celular; serpenteia no desktop ──
	const W = $derived(
		desk ? Math.min(880, Math.max(640, largura)) : Math.min(420, Math.max(300, largura))
	);
	const seqN = $derived(N + 2);
	const geo = $derived.by(() => {
		if (desk) {
			const porLinha = 5;
			const linhas = Math.ceil(seqN / porLinha);
			const H = linhas * 210 + 40;
			const pos = Array.from({ length: seqN }, (_, i) => {
				const r = Math.floor(i / porLinha);
				const c = i % porLinha;
				const col = r % 2 === 0 ? c : porLinha - 1 - c;
				return { x: Math.round(W * (0.1 + col * 0.2)), y: H - 140 - r * 210 };
			});
			return { H, pos };
		}
		const H = (N + 1) * 104 + 170;
		const pos = Array.from({ length: seqN }, (_, i) => ({
			x: i === 0 || i === seqN - 1 ? Math.round(W * 0.5) : Math.round(W * (i % 2 ? 0.3 : 0.7)),
			y: H - 70 - i * 104
		}));
		return { H, pos };
	});

	// ── pixel art ──
	function sprite(
		grade: string[],
		s: number,
		ox: number,
		oy: number,
		cores: Record<string, string>
	) {
		return Object.entries(cores)
			.map(([k, f]) => ({ d: caminhoDaGrade(grade, s, ox, oy, k), f }))
			.filter((p) => p.d);
	}
	const ICONE = {
		flag: ICONE_PIXEL.bandeira,
		lock: ICONE_PIXEL.cadeado,
		play: ICONE_PIXEL.jogar,
		x: ICONE_PIXEL.xis,
		star: ICONE_PIXEL.estrela,
		cal: ICONE_PIXEL.calendario,
		eye: ICONE_PIXEL.olho
	};

	const MORRO = [
		'......gg........',
		'....gggggg......',
		'...gghggggg.....',
		'..gggggghggg....',
		'.gghgggggggggg..',
		'gggggggggggghggg'
	];
	const NUVEM = ['...www....', '.wwwwwww..', 'wwwwwwwwww', '.llllllll.'];
	const CASTELO = [
		'......cc...',
		'......ccc..',
		'.....a.....',
		'a.a..a..a.a',
		'aaa.aaa.aaa',
		'abaaaaaaaba',
		'abbbbbbbbba',
		'abbkbbbkbba',
		'abbbbbbbbba',
		'abbbkkkbbba',
		'abbbkkkbbba',
		'aaaaaaaaaaa'
	];
	const LARGADA = [
		'acc.....',
		'acccc...',
		'accccc..',
		'acccc...',
		'a.......',
		'a.......',
		'a.......',
		'a.......',
		'aaa.....'
	];

	const arte = $derived.by(() => {
		const { H, pos } = geo;
		// A trilha: quadradinhos a cada 14px, azul até onde ele chegou.
		let feito = '';
		let falta = '';
		for (let i = 0; i < seqN - 1; i++) {
			const a = pos[i];
			const b = pos[i + 1];
			const pts =
				desk || a.x === b.x
					? [a, b]
					: [a, { x: a.x, y: (a.y + b.y) / 2 }, { x: b.x, y: (a.y + b.y) / 2 }, b];
			const segs: {
				p: { x: number; y: number };
				q: { x: number; y: number };
				L: number;
				s: number;
			}[] = [];
			let total = 0;
			for (let k = 0; k < pts.length - 1; k++) {
				const L = Math.abs(pts[k + 1].x - pts[k].x) + Math.abs(pts[k + 1].y - pts[k].y);
				segs.push({ p: pts[k], q: pts[k + 1], L, s: total });
				total += L;
			}
			for (let t = 36; t <= total - 36; t += 14) {
				const sg = segs.find((s) => t >= s.s && t <= s.s + s.L) ?? segs[segs.length - 1];
				const u = sg.L ? (t - sg.s) / sg.L : 0;
				const x = Math.round(sg.p.x + (sg.q.x - sg.p.x) * u) - 3;
				const y = Math.round(sg.p.y + (sg.q.y - sg.p.y) * u) - 3;
				const r = `M${x} ${y}h6v6h-6z`;
				if (i < atual) feito += r;
				else falta += r;
			}
		}
		const morro = {
			g: 'color-mix(in oklab, var(--color-accent) 20%, var(--color-base-200))',
			h: 'color-mix(in oklab, var(--color-accent) 38%, var(--color-base-200))'
		};
		const nuvem = { w: 'var(--color-base-100)', l: 'var(--color-line)' };
		const ini = pos[0];
		const fim = pos[seqN - 1];
		return [
			...sprite(MORRO, 6, 0, H - 36, morro),
			...(desk ? [] : sprite(MORRO, 6, W - 96, H - 36, morro)),
			...(desk
				? [
						...sprite(NUVEM, 4, Math.round(W * 0.56), 14, nuvem),
						...sprite(NUVEM, 4, Math.round(W * 0.8), 34, nuvem)
					]
				: [...sprite(NUVEM, 4, 10, 22, nuvem), ...sprite(NUVEM, 4, W - 52, 52, nuvem)]),
			...[
				{ d: feito, f: 'var(--color-primary)' },
				{ d: falta, f: 'color-mix(in oklab, var(--color-base-content) 30%, transparent)' }
			].filter((p) => p.d),
			...sprite(LARGADA, 4, ini.x - 8, ini.y - 18, {
				a: 'color-mix(in oklab, var(--color-base-content) 60%, transparent)',
				c: 'var(--color-accent)'
			}),
			...sprite(CASTELO, 4, fim.x - 22, fim.y - 30, {
				a: 'var(--color-primary)',
				b: 'color-mix(in oklab, var(--color-primary) 30%, var(--color-base-100))',
				k: 'var(--color-base-content)',
				c: 'var(--color-accent)'
			})
		];
	});

	// ── estados ──
	const ESTADO: Record<EstadoDaFase, { texto: string; icone: string; no: string; pilula: string }> =
		{
			done: {
				texto: 'concluída',
				icone: ICONE.flag,
				no: 'bg-primary text-primary-content shadow-[inset_0_0_0_3px_color-mix(in_oklab,var(--color-primary)_70%,var(--color-base-content)),inset_0_-7px_0_0_color-mix(in_oklab,var(--color-primary)_78%,var(--color-base-content))]',
				pilula: 'bg-primary text-primary-content'
			},
			doing: {
				texto: 'em andamento',
				icone: ICONE.play,
				no: 'bg-base-100 text-primary shadow-[inset_0_0_0_3px_var(--color-primary),inset_0_-7px_0_0_var(--color-base-300)]',
				pilula: 'bg-base-300 text-primary'
			},
			open: {
				texto: 'liberada',
				icone: ICONE.play,
				no: 'bg-base-100 text-primary shadow-[inset_0_0_0_3px_var(--color-primary),inset_0_-7px_0_0_var(--color-base-300)]',
				pilula: 'bg-base-300 text-primary'
			},
			locked: {
				texto: 'trancada',
				icone: ICONE.lock,
				no: 'bg-base-300 text-base-content/65 shadow-[inset_0_0_0_3px_var(--color-line),inset_0_-7px_0_0_color-mix(in_oklab,var(--color-line)_70%,var(--color-base-content))]',
				pilula: 'border border-line bg-base-200 text-base-content/70'
			},
			closed: {
				texto: 'encerrada',
				icone: ICONE.x,
				no: 'bg-base-200 text-base-content/65 shadow-[inset_0_0_0_3px_var(--color-line)]',
				pilula: 'border-[1.5px] border-dashed border-line text-base-content/70'
			}
		};
	const PIXEL =
		'[clip-path:polygon(6px_0,calc(100%-6px)_0,100%_6px,100%_calc(100%-6px),calc(100%-6px)_100%,6px_100%,0_calc(100%-6px),0_6px)]';

	const verbo = (f: Fase) =>
		f.estado === 'done'
			? 'ver o resultado'
			: f.estado === 'doing'
				? 'continuar'
				: f.estado === 'open'
					? 'jogar'
					: '';
	const meta = (f: Fase) =>
		f.estado === 'done'
			? f.acerto === null
				? 'sem placar'
				: 'ver resultado'
			: f.estado === 'doing'
				? 'continuar'
				: f.estado === 'open'
					? 'jogar'
					: f.estado === 'locked'
						? f.abre
							? `abre ${f.abre}`
							: 'ainda não chegou'
						: 'encerrada pelo professor';
	const aria = (f: Fase, i: number) =>
		[
			`Fase ${i + 1} de ${N}`,
			f.titulo,
			ESTADO[f.estado].texto,
			f.estado === 'locked' && f.abre ? `abre ${f.abre}` : '',
			f.estado === 'done' && f.acerto === null ? 'sem placar' : '',
			previa ? '' : verbo(f)
		]
			.filter(Boolean)
			.join(', ');

	// ── avatar e festa: uma vez, lembrado no aparelho ──
	const chave = $derived(`spokke-mapa-${mapa.id}`);
	let de = $state<number | null>(null);
	let andando = $state(false);
	let festa = $state(false);

	function lerMemoria(): { pos: number; festa: boolean } | null {
		try {
			const v = localStorage.getItem(chave);
			return v ? (JSON.parse(v) as { pos: number; festa: boolean }) : null;
		} catch {
			return null;
		}
	}
	function gravarMemoria(m: { pos: number; festa: boolean }) {
		try {
			localStorage.setItem(chave, JSON.stringify(m));
		} catch {
			// Navegação privada, armazenamento bloqueado: o mapa funciona igual,
			// só sem lembrar onde o avatar estava.
		}
	}

	const avPos = $derived(geo.pos[Math.min(atual, seqN - 1)]);
	const avDe = $derived(de !== null ? geo.pos[Math.max(0, Math.min(de, seqN - 1))] : null);

	let rolagem = $state<HTMLElement>();
	let lista = $state<HTMLElement>();

	onMount(() => {
		const reduzido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		const memoria = previa ? null : lerMemoria();
		const concluiu = N > 0 && resumo.concluidas === N;
		if (!previa) {
			if (memoria && memoria.pos < atual && !reduzido) {
				de = memoria.pos;
				requestAnimationFrame(() => {
					andando = true;
					de = null;
				});
			}
			if (concluiu && !memoria?.festa) {
				festa = !reduzido;
				som.preparar('finish');
				setTimeout(() => som.tocar('finish'), reduzido ? 0 : 1100);
			}
			gravarMemoria({ pos: atual, festa: concluiu || !!memoria?.festa });
		}
		void tick().then(() => {
			// A rolagem e o foco vão para a fase atual.
			if (rolagem && rolagem.scrollHeight > rolagem.clientHeight) {
				rolagem.scrollTop = Math.max(0, avPos.y - rolagem.clientHeight / 2);
			}
			const alvo = lista?.querySelector<HTMLElement>('[data-atual="true"]');
			alvo?.focus({ preventScroll: true });
		});
	});

	const confete = Array.from({ length: 14 }, (_, k) => {
		const ang = (k / 14) * Math.PI * 2;
		return {
			dx: Math.round(Math.cos(ang) * 70),
			dy: Math.round(Math.sin(ang) * 56 - 20),
			atraso: 1000 + (k % 3) * 90,
			cor:
				k % 3 === 0
					? 'var(--color-accent)'
					: k % 3 === 1
						? 'var(--color-primary)'
						: 'color-mix(in oklab, var(--color-primary) 40%, var(--color-base-100))'
		};
	});

	// ── a folha da fase ──
	let aberta = $state<number | null>(null);
	const folha = $derived(aberta !== null ? fases[aberta] : null);
	let folhaEl = $state<HTMLElement>();
	async function abrir(i: number) {
		aberta = i;
		await tick();
		folhaEl?.focus();
	}
	function aoTeclar(e: KeyboardEvent) {
		if (e.key === 'Escape' && aberta !== null) aberta = null;
	}

	const AVISO = $derived.by(() => {
		const p = resumo.proxima;
		if (p.tipo === 'fim')
			return {
				forte: 'Módulo concluído.',
				texto: `Você terminou todas as fases de ${mapa.nome}.`,
				icone: ICONE.flag,
				destaque: true
			};
		if (p.tipo === 'vazio')
			return {
				forte: 'Tudo pronto para começar.',
				// O módulo LIBERA no mapa e não manda e-mail (adr-004): sem data, a fase ainda não
				// foi programada para a turma, e é isso que a tela diz.
				texto: p.abre
					? `A primeira fase abre ${p.abre}.`
					: 'A primeira fase ainda não tem data marcada.',
				icone: ICONE.cal,
				destaque: false
			};
		if (p.tipo === 'esperar')
			return {
				forte: 'Você está em dia.',
				texto: p.abre
					? `A próxima fase abre ${p.abre}.`
					: 'A próxima fase ainda não tem data marcada.',
				icone: ICONE.cal,
				destaque: false
			};
		return null;
	});
</script>

<svelte:window onkeydown={aoTeclar} />

<div class="flex min-h-0 flex-1 flex-col" bind:clientWidth={largura}>
	<!-- título + progresso em degraus -->
	<div class="mb-3.5 flex-none lg:mb-5">
		<p class="mb-1.5 font-pixel text-[12px] tracking-[0.06em] text-primary" aria-hidden="true">
			MUNDO {mundo}
		</p>
		<h1 class="mb-1.25 font-display text-[24px] font-semibold tracking-[-0.024em] lg:text-[30px]">
			{mapa.nome}
		</h1>
		<p class="mb-3.5 text-[13px] text-base-content/65">
			{mapa.professor} · {mapa.turma}{mapa.contexto ? ` · ${mapa.contexto}` : ''}
		</p>
		<div class="flex items-center gap-3">
			<span class="flex-none text-[14px] font-bold">{resumo.concluidas} de {N} fases</span>
			<span
				class="grid h-3 min-w-0 flex-1 auto-cols-[minmax(0,1fr)] grid-flow-col gap-0.75"
				aria-hidden="true"
			>
				{#each fases as f (f.id)}
					<span
						class="block {f.estado === 'done'
							? 'bg-primary'
							: f.estado === 'closed'
								? 'bg-[repeating-linear-gradient(135deg,var(--color-line)_0_3px,transparent_3px_6px)] shadow-[inset_0_0_0_1px_var(--color-line)]'
								: 'bg-base-300'}"
					></span>
				{/each}
			</span>
		</div>
	</div>

	{#if AVISO && !previa}
		<div
			class="mb-3 flex flex-none items-center gap-3 rounded-field px-3.5 py-3 lg:mb-4.5 {AVISO.destaque
				? 'bg-base-300'
				: 'border border-line bg-base-200'}"
		>
			<svg
				class="size-5 flex-none text-primary"
				viewBox="0 0 7 7"
				shape-rendering="crispEdges"
				aria-hidden="true"><path d={AVISO.icone} fill="currentColor" /></svg
			>
			<p class="text-[13.5px] leading-normal text-pretty">
				<strong class="font-bold">{AVISO.forte}</strong>
				{AVISO.texto}
			</p>
		</div>
	{/if}

	<!-- o mapa: cenário e trilha são aria-hidden; a estrutura é uma <ol> -->
	<div
		bind:this={rolagem}
		class="relative -mx-4 min-h-0 flex-1 overflow-auto overscroll-contain px-4 lg:mx-0 lg:flex-none lg:overflow-visible lg:px-0"
	>
		<div
			class="relative mx-auto overflow-hidden rounded-[14px] border border-line bg-base-200"
			style:width="{W}px"
			style:height="{geo.H}px"
		>
			<svg
				width={W}
				height={geo.H}
				shape-rendering="crispEdges"
				class="absolute inset-0 block"
				aria-hidden="true"
			>
				{#each arte as a, i (i)}
					<path d={a.d} style:fill={a.f} />
				{/each}
			</svg>

			<ol
				bind:this={lista}
				class="absolute inset-0 m-0 list-none p-0"
				aria-label="Fases do módulo {mapa.nome}"
			>
				{#each fases as f, i (f.id)}
					{@const E = ESTADO[f.estado]}
					{@const p = geo.pos[i + 1]}
					{@const ladoEsq = !desk && p.x < W / 2}
					<li class="absolute size-14" style:left="{p.x - 28}px" style:top="{p.y - 28}px">
						{#if f.estado === 'open' && !previa}
							<span
								aria-hidden="true"
								class="absolute -inset-2.5 animate-[en-lit_1100ms_steps(5,end)_400ms_1_both] bg-primary/30 [clip-path:polygon(8px_0,calc(100%-8px)_0,100%_8px,100%_calc(100%-8px),calc(100%-8px)_100%,8px_100%,0_calc(100%-8px),0_8px)]"
							></span>
						{/if}
						{#if comAcao(f.estado) && !previa}
							<button
								type="button"
								onclick={() => abrir(i)}
								data-atual={String(i + 1 === atual)}
								aria-label={aria(f, i)}
								class="relative grid size-14 cursor-pointer place-items-center border-0 p-0 transition-transform duration-140 [transition-timing-function:steps(2,end)] hover:-translate-y-0.75 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-base-content active:translate-y-0.75 {PIXEL} {E.no}"
							>
								<svg
									class="size-[21px]"
									viewBox="0 0 7 7"
									shape-rendering="crispEdges"
									aria-hidden="true"><path d={E.icone} fill="currentColor" /></svg
								>
							</button>
						{:else}
							<span
								role="img"
								aria-label={aria(f, i)}
								class="grid size-14 place-items-center {PIXEL} {E.no}"
							>
								<svg
									class="size-[21px]"
									viewBox="0 0 7 7"
									shape-rendering="crispEdges"
									aria-hidden="true"><path d={E.icone} fill="currentColor" /></svg
								>
							</span>
						{/if}
						<span
							aria-hidden="true"
							class="absolute block rounded-[10px] border border-line bg-base-100 px-2.5 py-1.75 {desk
								? 'top-[66px] -left-[49px] w-[154px] text-center'
								: ladoEsq
									? 'top-7 left-[68px] w-[190px] max-w-[calc(var(--w)-100px)] -translate-y-1/2'
									: 'top-7 right-[68px] w-[190px] max-w-[calc(var(--w)-100px)] -translate-y-1/2'}"
							style:--w="{W}px"
						>
							<span class="mb-0.5 block font-pixel text-[10.5px] tracking-[0.05em] text-primary"
								>FASE {i + 1}</span
							>
							<span class="block text-[13px] leading-tight font-semibold text-pretty"
								>{f.titulo}</span
							>
							<span
								class="mt-1 flex items-center gap-1.25 text-[12px] text-base-content/65 {desk
									? 'justify-center'
									: ''}"
							>
								{#if f.estado === 'done' && f.acerto !== null}
									<span class="flex gap-0.5">
										{#each [0, 1, 2] as k (k)}
											<svg class="size-[13px]" viewBox="0 0 7 7" shape-rendering="crispEdges"
												><path
													d={ICONE.star}
													style:fill={k < estrelasDe(f.acerto)
														? 'var(--color-primary)'
														: 'var(--color-line)'}
												/></svg
											>
										{/each}
									</span>
								{:else if f.estado === 'done'}
									<svg class="size-[13px] flex-none" viewBox="0 0 24 24" fill="none"
										><path
											d="M4 4.5l16 15M9.2 6.2A9.4 9.4 0 0112 5.9c6 0 9.5 6.1 9.5 6.1a17 17 0 01-3.3 3.9M6.3 8.3A17 17 0 002.5 12s3.5 6.1 9.5 6.1c1 0 2-.2 2.9-.5"
											stroke="currentColor"
											stroke-width="2.2"
											stroke-linecap="round"
										/></svg
									>
								{/if}
								<span
									class={(f.estado === 'doing' || f.estado === 'open') && !previa
										? 'font-bold text-primary'
										: ''}>{previa && comAcao(f.estado) ? 'liberada' : meta(f)}</span
								>
							</span>
						</span>
					</li>
				{/each}
			</ol>

			{#if !previa}
				<!-- o avatar do próprio aluno; anda UMA vez quando ele avançou -->
				<span
					aria-hidden="true"
					class="pointer-events-none absolute h-[46px] w-10"
					style:left="{avPos.x - 20}px"
					style:top="{avPos.y - 78}px"
					style:transform={avDe
						? `translate3d(${avDe.x - avPos.x}px,${avDe.y - avPos.y}px,0)`
						: 'none'}
					style:transition={andando ? 'transform 1100ms steps(8, end)' : 'none'}
				>
					<span
						class="block size-10 overflow-hidden shadow-[0_0_0_2px_var(--color-base-100),0_0_0_4px_var(--color-primary)] [clip-path:polygon(4px_0,calc(100%-4px)_0,100%_4px,100%_calc(100%-4px),calc(100%-4px)_100%,4px_100%,0_calc(100%-4px),0_4px)]"
					>
						<Avatar codigo={avatar} {nome} size={40} radius="rounded-none" />
					</span>
					<span class="mx-auto mt-0.5 block h-1 w-6 bg-base-content/22"></span>
				</span>

				{#if festa}
					<span
						aria-hidden="true"
						class="pointer-events-none absolute size-0"
						style:left="{avPos.x}px"
						style:top="{avPos.y - 30}px"
					>
						{#each confete as c, k (k)}
							<span
								class="absolute size-2 animate-[en-pop_1200ms_steps(6,end)_both]"
								style:background={c.cor}
								style:--dx="{c.dx}px"
								style:--dy="{c.dy}px"
								style:animation-delay="{c.atraso}ms"
							></span>
						{/each}
					</span>
				{/if}
			{/if}
		</div>
	</div>

	<p
		class="flex-none py-2.5 text-[12.5px] leading-normal text-pretty text-base-content/65 lg:mt-3.5 lg:py-0"
	>
		{previa
			? 'Prévia com a programação desta turma. Nenhum progresso de aluno aparece aqui.'
			: 'Toda fase liberada abre, mesmo fora da ordem. O caminho é uma sugestão.'}
	</p>
</div>

<!-- a folha da fase: de baixo no celular, cartão no desktop -->
{#if folha && aberta !== null}
	{@const E = ESTADO[folha.estado]}
	{@const placar = folha.estado === 'done' && folha.acerto !== null}
	<div class="fixed inset-0 z-50 flex items-end lg:grid lg:place-items-center lg:p-7.5">
		<!-- A ENTRADA da folha é por CSS (de baixo no celular, subindo no desktop);
		     a saída e o véu, pelas transições comuns (`$lib/client/transicoes.ts`). -->
		<button
			type="button"
			class="absolute inset-0 bg-overlay"
			aria-label="Fechar"
			onclick={() => (aberta = null)}
			in:veu
			out:veu
		></button>
		<div
			bind:this={folhaEl}
			tabindex="-1"
			role="dialog"
			aria-modal="true"
			aria-label={folha.titulo}
			out:modal
			class="relative w-full animate-folha rounded-t-[22px] border border-line bg-base-100 px-4 pt-5 pb-6.5 shadow-[0_30px_60px_-30px_rgba(15,20,32,0.6)] outline-none lg:w-[420px] lg:animate-entrada-curta lg:rounded-[18px] lg:p-5.5"
		>
			<div class="mb-3.5 flex items-start gap-3">
				<span class="min-w-0 flex-1">
					<span
						class="mb-1.25 block font-pixel text-[11.5px] tracking-[0.05em] text-primary"
						aria-hidden="true">FASE {aberta + 1} DE {N}</span
					>
					<span
						class="block font-display text-[21px] leading-tight font-semibold tracking-[-0.02em]"
						>{folha.titulo}</span
					>
				</span>
				<button
					type="button"
					onclick={() => (aberta = null)}
					class="btn size-11 min-h-11 flex-none btn-plain p-0"
					aria-label="Fechar"
				>
					<svg class="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true"
						><path
							d="M6 6l12 12M18 6L6 18"
							stroke="currentColor"
							stroke-width="2.2"
							stroke-linecap="round"
						/></svg
					>
				</button>
			</div>
			<div class="mb-4 flex flex-wrap gap-2">
				{#if mapa.contexto || folha.nivel}
					<span
						class="rounded-full border border-line bg-base-200 px-2.75 py-1.25 text-[12.5px] font-semibold"
						>{[mapa.contexto.split(' · ')[0], folha.nivel].filter(Boolean).join(' · ')}</span
					>
				{/if}
				<span
					class="rounded-full border border-line bg-base-200 px-2.75 py-1.25 text-[12.5px] font-semibold"
					>{folha.questoes} {folha.questoes === 1 ? 'questão' : 'questões'}</span
				>
				<span
					class="inline-flex items-center gap-1.5 rounded-full px-2.75 py-1.25 text-[12.5px] font-bold {E.pilula}"
				>
					<svg class="size-3" viewBox="0 0 7 7" shape-rendering="crispEdges" aria-hidden="true"
						><path
							d={folha.estado === 'done' && folha.acerto === null ? ICONE.eye : E.icone}
							fill="currentColor"
						/></svg
					>
					{folha.estado === 'done' && folha.acerto === null ? 'concluída · sem placar' : E.texto}
				</span>
			</div>
			{#if placar && folha.acerto !== null}
				<div class="mb-4 flex items-center gap-3 rounded-field bg-base-200 px-3.5 py-3">
					<span class="flex gap-0.75">
						{#each [0, 1, 2] as k (k)}
							<svg
								class="size-[22px]"
								viewBox="0 0 7 7"
								shape-rendering="crispEdges"
								aria-hidden="true"
								><path
									d={ICONE.star}
									style:fill={k < estrelasDe(folha.acerto)
										? 'var(--color-primary)'
										: 'var(--color-line)'}
								/></svg
							>
						{/each}
					</span>
					<span class="text-[13.5px]"
						><strong class="font-bold">{folha.acerto}%</strong> de acerto na sua melhor tentativa</span
					>
				</div>
			{/if}
			<p class="mb-4 text-[13.5px] leading-relaxed text-pretty text-base-content/65">
				{folha.estado === 'done'
					? placar
						? 'Você terminou esta fase. O resultado mostra cada questão do jeito que o professor liberou.'
						: 'Você terminou esta fase. O professor não liberou o placar desta atividade, então o mapa só marca que ela foi feita.'
					: folha.estado === 'doing'
						? 'Você parou no meio. Continuar abre pelo seu link pessoal, do ponto onde parou, e a fase acende quando você terminar.'
						: 'Esta fase já chegou para a sua turma. Jogar abre pelo seu link pessoal, para a tentativa contar no mapa.'}
			</p>
			{#if folha.href}
				<!-- eslint-disable svelte/no-navigation-without-resolve -- o href vem pronto do servidor: o link pessoal do convite (/e/<token>) ou o resultado da publicação. -->
				<a
					href={folha.href}
					class="btn min-h-[50px] w-full motion-tap gap-2.25 btn-primary text-[15px] font-bold no-underline"
				>
					<svg class="size-4" viewBox="0 0 7 7" shape-rendering="crispEdges" aria-hidden="true"
						><path d={folha.estado === 'done' ? ICONE.flag : ICONE.play} fill="currentColor" /></svg
					>
					{folha.estado === 'done'
						? 'Ver o resultado'
						: folha.estado === 'doing'
							? 'Continuar'
							: 'Jogar'}
				</a>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			{/if}
		</div>
	</div>
{/if}
