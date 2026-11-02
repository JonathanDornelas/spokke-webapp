<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import AvatarEditor from '$lib/components/AvatarEditor.svelte';
	import PlanosTabela from '$lib/components/PlanosTabela.svelte';
	import { CODIGO_PADRAO, sortearCodigo } from '$lib/avatar/montar';
	import type { PlanoId } from '$lib/content/planos';
	import TecladoVirtual from '$lib/components/TecladoVirtual.svelte';
	import LeituraDoCampo from '$lib/components/LeituraDoCampo.svelte';
	import { CampoComTeclado } from '$lib/components/campo-com-teclado.svelte';
	import { acentosFrances, arabe, devanagari, kana, pinyin } from '$lib/kernel/language/teclados';
	import { tema } from '$lib/client/theme.svelte';
	import TextField from '$lib/components/TextField.svelte';
	import CorrectionState from '$lib/components/CorrectionState.svelte';
	import AudioPlayer from '$lib/components/AudioPlayer.svelte';
	import Recorder from '$lib/components/Recorder.svelte';
	import AssembleTokens from '$lib/components/AssembleTokens.svelte';
	import ProgressBar from '$lib/components/ProgressBar.svelte';
	import ResultTrack from '$lib/components/ResultTrack.svelte';
	import PlayerQuestionShell from '$lib/components/PlayerQuestionShell.svelte';
	import AmbientShapes from '$lib/components/AmbientShapes.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import Alert from '$lib/components/Alert.svelte';
	import Logo from '$lib/components/Logo.svelte';
	import ScoreBar from '$lib/components/ScoreBar.svelte';
	import Stepper from '$lib/components/Stepper.svelte';
	import CorrectionIcon from '$lib/components/CorrectionIcon.svelte';
	import Loading from '$lib/components/Loading.svelte';
	import LoadingBar from '$lib/components/LoadingBar.svelte';
	import MaterialForm, { type Modo } from '$lib/components/MaterialForm.svelte';
	import Bandeja from '$lib/components/Bandeja.svelte';
	import SeletorDeEtiqueta from '$lib/components/SeletorDeEtiqueta.svelte';
	import SeletorDeAtividades from '$lib/components/SeletorDeAtividades.svelte';
	import { CLASSE_DA_ETIQUETA, etiquetaDaTurma, type CorDeEtiqueta } from '$lib/etiquetas';
	import MaterialList from '$lib/components/MaterialList.svelte';
	import type { MaterialRow } from '$lib/components/material-form';
	import { reveal } from '$lib/actions/reveal';

	type Token = { id: string; text: string };

	// ── Materiais: o mesmo formulário nos dois contextos, e a lista ────────
	const linha = (
		id: string,
		kind: MaterialRow['kind'],
		primary: string,
		secondary: string,
		extra: Partial<MaterialRow> = {}
	): MaterialRow => ({
		id,
		kind,
		primary,
		secondary,
		idioma: 'en-US',
		usedIn: 1,
		target: primary,
		source: secondary,
		raw: '',
		note: '',
		example: '',
		questions: [],
		lines: [],
		...extra
	});
	const materiaisDemo: MaterialRow[] = [
		linha('m1', 'pair', 'She leaves home at eight.', 'Ela sai de casa às oito.', {
			usedIn: 3,
			daBiblioteca: true
		}),
		linha('m2', 'vocab', 'breakfast', 'café da manhã', { usedIn: 2, daBiblioteca: true }),
		linha('m3', 'vocab', 'afternoon', 'tarde', { usedIn: 0, idioma: null }),
		linha('m4', 'text', "Ana's morning", 'Sem perguntas — nada será gerado deste texto', {
			raw: 'Ana wakes up at six thirty every morning.',
			secondary: 'Sem perguntas — nada será gerado deste texto'
		}),
		linha('m5', 'dialogue', 'At the bakery', '4 falas', {
			target: '',
			source: '',
			lines: [
				{ speaker: 'A', text: 'What do you have for breakfast?' },
				{ speaker: 'B', text: 'I have coffee and bread.' },
				{ speaker: 'A', text: 'Nothing else?' },
				{ speaker: 'B', text: 'And you?' }
			]
		})
	];
	let modoDemo = $state<Modo>('um');
	let editandoDemo = $state<MaterialRow | null>(null);
	let formDemo = $state<MaterialForm | null>(null);
	let contextoDemo = $state<'biblioteca' | 'wizard'>('wizard');

	const sections = [
		['cores', 'Cores'],
		['tipografia', 'Tipografia'],
		['icones', 'Ícones'],
		['componentes', 'Componentes'],
		['loading', 'Loading'],
		['correcao', 'Estados de correção'],
		['player', 'Player — 6 interações'],
		['studio', 'Studio'],
		['materiais', 'Materiais'],
		['bandeja', 'Bandeja'],
		['avatar', 'Avatar'],
		['planos', 'Planos'],
		['teclado', 'Teclado virtual'],
		['movimento', 'Movimento'],
		['scroll', 'Entrada em scroll']
	] as const;

	// ── bandeja ──
	let bandejaDemo = $state(false);
	let bandejaComErro = $state(false);
	let nomeDemo = $state('Unidade 4 — rotina');
	let corDemo = $state<CorDeEtiqueta>('teal');
	let escolhidasDemo = $state<string[]>([]);
	const atividadesDemo = [
		{ id: 'a1', title: 'Present perfect — turma B', level: 'B1', idioma: 'en-US', noAr: true },
		{ id: 'a2', title: 'Rotina da manhã', level: 'A2', idioma: 'en-US', noAr: true },
		{ id: 'a3', title: 'Frutas e legumes', level: 'A1', idioma: 'es-ES', noAr: false },
		{ id: 'a4', title: 'Pedir no restaurante', level: null, idioma: 'en-US', noAr: true }
	];

	// ── avatar e planos ──
	let avatarDemo = $state(CODIGO_PADRAO);
	let editorDemo = $state(false);
	// Sorteio na MONTAGEM seria diferente no servidor e no cliente (hidratação
	// reclamaria): a lista nasce fixa e só troca no clique.
	let sorteados = $state<string[]>([
		'0-0-4-1-3-0-0-0-0-1-0-1-0-0-0-0',
		'2-3-0-0-0-1-0-0-0-2-1-3-1-0-0-5',
		'4-7-0-1-0-0-0-1-0-1-2-6-0-1-3-3',
		'1-5-6-2-4-0-0-0-0-1-7-7-5-5-1-2',
		'3-1-1-0-1-3-1-0-0-0-3-4-4-0-0-9',
		'5-11-0-1-2-0-0-3-0-1-4-1-2-0-0-7',
		'1-8-7-4-3-5-0-0-0-2-6-0-3-2-1-8',
		'2-6-3-0-1-0-0-2-2-1-5-5-1-4-3-11'
	]);
	let planoDemo = $state<PlanoId | null>(null);

	// ── teclado virtual ── Campos VIVOS, um por layout, para conferir o que só o
	// browser prova: a tecla não rouba o foco, a letra cai no cursor e não no
	// fim, o ゛ age na letra anterior, e a grade árabe corre da direita para a
	// esquerda.
	const tecladosDemo = [
		{ id: 'kana', rotulo: 'Japonês — kana, gojūon', teclado: kana, dir: 'ltr' as const },
		{ id: 'pinyin', rotulo: 'Mandarim — pinyin com tom', teclado: pinyin, dir: 'ltr' as const },
		{ id: 'arabe', rotulo: 'Árabe — grade, RTL', teclado: arabe, dir: 'rtl' as const },
		{ id: 'devanagari', rotulo: 'Híndi — grade, matras', teclado: devanagari, dir: 'ltr' as const },
		{
			id: 'frances',
			rotulo: 'Francês — barra de acentos',
			teclado: acentosFrances,
			dir: 'ltr' as const
		}
	];
	let textosDemo = $state<Record<string, string>>({
		kana: '',
		pinyin: '',
		arabe: '',
		devanagari: '',
		frances: ''
	});
	// Ocultos, como no Player: quem abre é o "Mostrar o teclado de …".
	let abertosDemo = $state<Record<string, boolean>>({
		kana: false,
		pinyin: false,
		arabe: false,
		devanagari: false,
		frances: false
	});
	const camposDemo: Record<string, CampoComTeclado> = {
		kana: new CampoComTeclado(),
		pinyin: new CampoComTeclado(),
		arabe: new CampoComTeclado(),
		devanagari: new CampoComTeclado(),
		frances: new CampoComTeclado()
	};

	// O catálogo alterna o ritmo para mostrar as duas velocidades: `devagar`
	// (1,75×) é o que se usa quando a espera passa de dez segundos.
	let ritmo = $state<'normal' | 'devagar'>('normal');
	// `size` é sempre a ALTURA do componente — por isso a fila tem escala
	// própria: ela é uma linha baixa, não uma caixa quadrada.
	const loadingVariants = [
		{
			id: 'orbita' as const,
			nome: 'Órbita',
			tamanhos: [24, 40, 64],
			uso: 'Espera de 3 s ou mais, com o bloco dedicado a ela. Evite dentro de botão ou linha.'
		},
		{
			id: 'fila' as const,
			nome: 'Fila',
			tamanhos: [10, 14, 22],
			uso: 'Espera curta: botão, campo, linha. Evite centralizada numa tela vazia.'
		},
		{
			id: 'traco' as const,
			nome: 'Traço',
			tamanhos: [24, 40, 64],
			uso: 'Sobreposição e cartão recarregando. Evite abaixo de 24px — o tracejado vira ruído.'
		}
	];

	const semanticTokens = [
		{ bg: 'bg-success', label: 'success — correto', hex: '#12855F · escuro #3ECF98' },
		{ bg: 'bg-warning', label: 'warning — parcial', hex: '#B26A00 · escuro #F2B23A' },
		{ bg: 'bg-error', label: 'error — incorreto', hex: '#C8324A · escuro #FF7183' }
	];

	// Mesmo gerenciador de tema do produto — ver $lib/client/theme.
	$effect(() => tema.sincronizar());
	const theme = $derived(tema.atual);
	const toggleTheme = () => tema.alternar();

	const iconSet = [
		{
			name: 'play',
			path: '<path d="M8 5.5l10 6.5-10 6.5z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>'
		},
		{
			name: 'mic',
			path: '<rect x="9" y="2.5" width="6" height="11" rx="3" stroke="currentColor" stroke-width="2"/><path d="M5.5 11.5a6.5 6.5 0 0013 0M12 18v3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
		},
		{
			name: 'waveform',
			path: '<path d="M4 12l1.5 3M8 8l1.5 11M12 5l1.5 15M16 9l1.5 8M20 12l1 3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
		},
		{
			name: 'keyboard',
			path: '<rect x="2.5" y="5.5" width="19" height="13" rx="3" stroke="currentColor" stroke-width="2"/><path d="M7 10h.01M11 10h.01M15 10h.01M8 14.5h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
		},
		{
			name: 'reading',
			path: '<path d="M3 5.5h6a3 3 0 013 3v10a2.5 2.5 0 00-2.5-2.5H3zM21 5.5h-6a3 3 0 00-3 3v10a2.5 2.5 0 012.5-2.5H21z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>'
		},
		{
			name: 'writing',
			path: '<path d="M4 20h4l11-11a2.83 2.83 0 10-4-4L4 16z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>'
		},
		{
			name: 'check',
			path: '<path d="M4 12.5l5 5L20 6.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
		},
		{
			name: 'close',
			path: '<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
		},
		{
			name: 'half',
			path: '<circle cx="12" cy="12" r="8.6" stroke="currentColor" stroke-width="2"/><path d="M12 3.4a8.6 8.6 0 010 17.2z" fill="currentColor"/>'
		},
		{
			name: 'generate',
			path: '<path d="M13 4l-8 9h6l-2 7 8-9h-6z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>'
		},
		{
			name: 'skip',
			path: '<path d="M10 7.5h7.5a4.5 4.5 0 010 9H10M14 3.5l-4 4 4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
		},
		{
			name: 'results',
			path: '<path d="M4 18V9M10 18V4M16 18v-6M22 18v-9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
		}
	];

	let fieldValue = $state('');
	// só o catálogo abre a onda já "tocando" (sem chamar audio.play()) — nunca faça isso numa
	// tela real do Player, é o bindable existir só para demo, ver components.md.
	let audioDemoPlaying = $state(true);

	const correctionStates = ['unanswered', 'correct', 'partial', 'incorrect'] as const;

	let progressCurrent = $state(5);
	const progressTotal = 8;
	const resultItems = [
		{ state: 'correct' as const },
		{ state: 'correct' as const },
		{ state: 'partial' as const },
		{ state: 'incorrect' as const },
		{ state: 'unanswered' as const }
	];

	// --- Player: as seis interações -----------------------------------------
	let choiceIndex = $state(2);
	const choiceTotal = 8;
	const choiceOptions = [
		{ id: 'a', text: 'She has been working here.' },
		{ id: 'b', text: 'She is working here.' },
		{ id: 'c', text: 'She worked here.' }
	];
	const choiceSelectedId = 'b';

	let composePool = $state<Token[]>([
		{ id: 'p1', text: 'working' },
		{ id: 'p2', text: 'since' },
		{ id: 'p3', text: 'here' },
		{ id: 'p4', text: '2019' }
	]);
	let composeTokens = $state<Token[]>([
		{ id: 't1', text: 'She' },
		{ id: 't2', text: 'has' },
		{ id: 't3', text: 'been' }
	]);

	let speakRecording = $state(true);

	const phoneFrame =
		'relative flex h-[720px] w-[366px] flex-col overflow-hidden rounded-[40px] border-[9px] border-base-content bg-base-100 shadow-[0_10px_30px_-18px_rgba(26,23,48,0.35)]';

	const revealCards = [1, 2, 3, 4];
</script>

<svelte:head>
	<title>Catálogo de componentes — entendo</title>
</svelte:head>

<div class="min-h-dvh">
	<header
		class="sticky top-0 z-50 flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-line bg-base-100 px-6 py-3.5"
	>
		<div class="flex items-center gap-2.5">
			<svg class="size-[26px] text-primary" viewBox="0 0 24 24" fill="none" aria-hidden="true">
				<rect
					x="1.5"
					y="2.5"
					width="21"
					height="15"
					rx="4"
					stroke="currentColor"
					stroke-width="2"
				/>
				<path d="M7 21.5L11 17.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
				<path d="M7 10h10" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
				<path d="M7 14h6" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
			</svg>
			<span class="font-display text-[19px] font-extrabold tracking-tight">entendo</span>
			<span class="border-s border-line ps-3 text-[13px] text-base-content/60">Catálogo de dev</span
			>
		</div>
		<div class="flex-1"></div>
		<nav class="flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] text-base-content/60">
			{#each sections as [id, label] (id)}
				<a
					href="#{id}"
					class="transition-[color,transform,translate,scale] duration-150 hover:-translate-y-px hover:text-primary"
				>
					{label}
				</a>
			{/each}
		</nav>
		<button type="button" class="btn btn-sm rounded-selector btn-neutral" onclick={toggleTheme}>
			{theme === 'light' ? '🌙 Tema escuro' : '☀️ Tema claro'}
		</button>
	</header>

	<main class="mx-auto max-w-[1240px] px-6 py-8 md:px-12">
		<div
			class="relative grid grid-cols-1 items-end gap-10 pt-16 pb-16 lg:grid-cols-[1.15fr_1fr] lg:gap-16 lg:pt-[226px]"
		>
			<div
				aria-hidden="true"
				class="pointer-events-none absolute inset-x-0 -top-8 z-0 h-[190px] overflow-hidden
				       [mask-image:linear-gradient(to_bottom,#000_46%,transparent_96%)]"
			>
				<div
					style="position:absolute; inset-inline-start:4%; inset-block-start:6%; width:170px; height:170px; border-radius:999px; background:radial-gradient(circle at 32% 30%, color-mix(in oklab, var(--color-primary) 34%, transparent), transparent 68%); filter:blur(2px); animation: en-float-a 17s ease-in-out infinite;"
				></div>
				<div
					style="position:absolute; inset-inline-end:14%; inset-block-start:-18%; width:128px; height:128px; border-radius:42px; border:1.5px solid color-mix(in oklab, var(--color-accent) 42%, transparent); animation: en-float-c 21s ease-in-out infinite;"
				></div>
				<div
					style="position:absolute; inset-inline-start:42%; inset-block-end:-26%; width:88px; height:88px; border-radius:999px; background:color-mix(in oklab, var(--color-warning) 20%, transparent); animation: en-float-b 14s ease-in-out infinite;"
				></div>
				<div
					style="position:absolute; inset-inline-end:3%; inset-block-end:-34%; width:150px; height:150px; border-radius:999px; border:1.5px dashed color-mix(in oklab, var(--color-primary) 32%, transparent); animation: en-float-b 24s ease-in-out infinite;"
				></div>
				<div
					style="position:absolute; inset-inline-start:24%; inset-block-start:8%; width:54px; height:54px; border-radius:18px; background:color-mix(in oklab, var(--color-accent) 22%, transparent); animation: en-float-a 12s ease-in-out infinite 1.4s;"
				></div>
				<div
					style="position:absolute; inset-inline-start:16%; inset-block-end:-30%; width:104px; height:92px; background:color-mix(in oklab, var(--color-primary) 24%, transparent); clip-path:polygon(50% 0%,100% 100%,0% 100%); animation: en-drift-spin 26s ease-in-out infinite;"
				></div>
				<div
					style="position:absolute; inset-inline-end:30%; inset-block-start:14%; width:78px; height:78px; background:color-mix(in oklab, var(--color-accent) 18%, transparent); clip-path:polygon(25% 3%,75% 3%,100% 50%,75% 97%,25% 97%,0% 50%); animation: en-float-c 18s ease-in-out infinite 0.8s;"
				></div>
				<div
					style="position:absolute; inset-inline-start:56%; inset-block-start:10%; width:46px; height:46px; background:color-mix(in oklab, var(--color-warning) 26%, transparent); clip-path:polygon(40% 0,60% 0,60% 40%,100% 40%,100% 60%,60% 60%,60% 100%,40% 100%,40% 60%,0 60%,0 40%,40% 40%); animation: spin 22s linear infinite;"
				></div>
				<div
					style="position:absolute; inset-inline-end:44%; inset-block-end:-8%; width:96px; height:40px; border-radius:999px; border:1.5px solid color-mix(in oklab, var(--color-primary) 30%, transparent); animation: en-float-a 20s ease-in-out infinite 2s;"
				></div>
				<div
					style="position:absolute; inset-inline-start:2%; inset-block-end:8%; width:26px; height:26px; border-radius:999px; background:color-mix(in oklab, var(--color-accent) 34%, transparent); animation: en-breathe 6s ease-in-out infinite;"
				></div>
				<div
					style="position:absolute; inset-inline-end:22%; inset-block-end:-22%; width:60px; height:60px; border-radius:999px; border:2px solid color-mix(in oklab, var(--color-accent) 34%, transparent); border-inline-end-color:transparent; border-block-start-color:transparent; animation: spin 14s linear infinite;"
				></div>
			</div>

			<div class="relative z-10">
				<p class="mb-5 text-xs font-bold tracking-[0.16em] text-primary uppercase">
					Fundação visual
				</p>
				<h1
					class="mb-6 font-display text-[68px] leading-[0.98] font-extrabold tracking-[-0.035em] text-pretty"
				>
					Um sistema para duas superfícies com orçamentos diferentes.
				</h1>
				<p class="max-w-[52ch] text-[17px] leading-[1.6] text-pretty text-base-content/60">
					O Studio pode ser rico: desktop, sessão longa, professor logado. O Player é a superfície
					crítica: celular fraco, 4G, aluno sem paciência. Os dois compartilham tokens, tipografia e
					semântica de correção — não densidade nem peso.
				</p>
			</div>

			<div class="relative z-10 grid grid-cols-2 gap-3">
				<div
					class="flex min-h-[132px] flex-col justify-between rounded-box bg-primary p-[22px] text-primary-content"
				>
					<span class="text-xs font-bold tracking-[0.1em] uppercase opacity-80">Studio</span>
					<span class="font-display text-[22px] leading-[1.15] font-semibold">
						Denso, informativo, com atalhos
					</span>
				</div>
				<div
					class="flex min-h-[132px] flex-col justify-between rounded-box border border-line bg-card p-[22px]"
				>
					<span class="text-xs font-bold tracking-[0.1em] text-base-content/60 uppercase">
						Player
					</span>
					<span class="font-display text-[22px] leading-[1.15] font-semibold">
						Um alvo por tela, 48px de toque
					</span>
				</div>
				<div
					class="col-span-2 rounded-box bg-base-300 px-[22px] py-[18px] text-[13px] leading-[1.55]"
				>
					Tokens semânticos definidos em <code class="font-mono text-xs">app.css</code>. Cor literal
					do Tailwind não entra em componente de produto.
				</div>
			</div>
		</div>

		<section id="cores" class="mb-14 scroll-mt-6 border-t border-line pt-14">
			<h2 class="font-display text-2xl">Cores e tokens</h2>
			<p class="mt-1 max-w-2xl text-sm text-base-content/60">
				Verde, âmbar e vermelho são reservados para a semântica de correção. Por isso a marca é
				violeta: nenhum uso decorativo compete com o feedback do exercício.
			</p>
			<div class="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
				<div class="overflow-hidden rounded-box border border-line bg-card">
					<div class="h-24 bg-primary"></div>
					<div class="p-3.5">
						<div class="text-sm font-bold">primary</div>
						<div class="mt-1 font-mono text-[11px] text-base-content/60">
							#5A3FF3 · escuro #8B7BFF
						</div>
					</div>
				</div>
				<div class="overflow-hidden rounded-box border border-line bg-card">
					<div class="h-24 bg-accent"></div>
					<div class="p-3.5">
						<div class="text-sm font-bold">accent</div>
						<div class="mt-1 font-mono text-[11px] text-base-content/60">
							#0EA5B7 · escuro #35C4D4
						</div>
					</div>
				</div>
				<div class="overflow-hidden rounded-box border border-line bg-card">
					<div class="h-24 bg-base-content"></div>
					<div class="p-3.5">
						<div class="text-sm font-bold">base-content</div>
						<div class="mt-1 font-mono text-[11px] text-base-content/60">
							#1A1730 · escuro #ECEAF7
						</div>
					</div>
				</div>
				<div class="overflow-hidden rounded-box border border-line bg-card">
					<div class="grid h-24 grid-cols-3">
						<div class="bg-base-100"></div>
						<div class="bg-base-200"></div>
						<div class="bg-base-300"></div>
					</div>
					<div class="p-3.5">
						<div class="text-sm font-bold">base 100 / 200 / 300</div>
						<div class="mt-1 font-mono text-[11px] text-base-content/60">
							superfícies, cartões, trilhas
						</div>
					</div>
				</div>
			</div>

			<div class="mt-3.5 grid grid-cols-1 gap-3.5 sm:grid-cols-3">
				{#each semanticTokens as t (t.label)}
					<div class="flex overflow-hidden rounded-box border border-line bg-card">
						<div class="flex w-[76px] shrink-0 items-center justify-center {t.bg}">
							{#if t.label.startsWith('success')}
								<svg class="size-[26px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
									<path
										d="M4 12.5l5 5L20 6.5"
										stroke="#FFFFFF"
										stroke-width="2.6"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
								</svg>
							{:else if t.label.startsWith('warning')}
								<svg class="size-[26px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
									<circle cx="12" cy="12" r="8.6" stroke="#FFFFFF" stroke-width="2.4" />
									<path d="M12 3.4a8.6 8.6 0 010 17.2z" fill="#FFFFFF" />
								</svg>
							{:else}
								<svg class="size-[26px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
									<path
										d="M6 6l12 12M18 6L6 18"
										stroke="#FFFFFF"
										stroke-width="2.6"
										stroke-linecap="round"
									/>
								</svg>
							{/if}
						</div>
						<div class="px-4 py-3.5">
							<div class="text-sm font-bold">{t.label}</div>
							<div class="mt-1 font-mono text-[11px] text-base-content/60">{t.hex}</div>
						</div>
					</div>
				{/each}
			</div>

			<pre
				class="mt-5 overflow-auto rounded-box bg-[#1a1730] p-6 font-mono text-[12.5px] leading-relaxed text-[#dcd8f0]"><code
					>{`@theme {
  --color-primary: #5A3FF3;      --color-accent: #0EA5B7;
  --color-success: #12855F;      --color-warning: #B26A00;
  --color-error: #C8324A;        --color-base-content: #1A1730;
  --color-base-100: #FFFFFF;     --color-base-200: #F5F4FB;
  --color-base-300: #E7E3F7;     --color-line: #E2DEF2;
  --radius-field: 0.625rem;      --radius-box: 0.875rem;
}
/* dark: mesma variável, valor diferente — data-theme="dark" ou prefers-color-scheme */`}</code
				></pre>
		</section>

		<section id="tipografia" class="mb-14 scroll-mt-6">
			<h2 class="font-display text-2xl">Tipografia e escala</h2>
			<p class="mt-1 max-w-2xl text-sm text-base-content/60">
				Três famílias com papéis fixos. O conteúdo do idioma alvo nunca usa a fonte da interface:
				Noto Sans cobre árabe, hebraico, japonês, chinês e tailandês sem fallback improvisado.
			</p>
			<div class="mt-5 grid grid-cols-1 gap-3.5 sm:grid-cols-3">
				<div class="rounded-box border border-line bg-card p-6">
					<div class="font-display text-5xl leading-none font-extrabold tracking-tight">Aa</div>
					<div class="mt-4.5 text-sm font-bold">Bricolage Grotesque</div>
					<div class="mt-1.5 text-[13px] leading-relaxed text-base-content/60">
						Títulos e números grandes. 600 e 800. Nunca abaixo de 20px.
					</div>
				</div>
				<div class="rounded-box border border-line bg-card p-6">
					<div class="font-sans text-5xl leading-none font-semibold">Aa</div>
					<div class="mt-4.5 text-sm font-bold">Plus Jakarta Sans</div>
					<div class="mt-1.5 text-[13px] leading-relaxed text-base-content/60">
						Interface, rótulos, corpo de texto. 400 a 700.
					</div>
				</div>
				<div class="rounded-box border border-line bg-card p-6">
					<div class="font-content text-5xl leading-none">Aa あ</div>
					<div class="mt-4.5 text-sm font-bold">Noto Sans</div>
					<div class="mt-1.5 text-[13px] leading-relaxed text-base-content/60">
						Conteúdo do idioma alvo. Aplicada no container que recebe <code
							class="font-mono text-[11px]">dir</code
						>.
					</div>
				</div>
			</div>

			<div
				class="mt-3.5 divide-y divide-line overflow-hidden rounded-box border border-line bg-card"
			>
				<div
					class="grid grid-cols-[110px_1fr] gap-4 bg-base-200 px-5 py-2.5 text-[11px] font-bold tracking-wide text-base-content/60 uppercase sm:grid-cols-[130px_1fr_190px]"
				>
					<span>Token</span><span>Amostra</span><span class="hidden sm:block">Uso</span>
				</div>
				<div
					class="grid grid-cols-[110px_1fr] items-baseline gap-4 px-5 py-4 sm:grid-cols-[130px_1fr_190px]"
				>
					<span class="font-mono text-xs text-base-content/60">display/56</span>
					<span
						class="font-display text-[40px] leading-none font-extrabold tracking-tight sm:text-[56px]"
					>
						Vamos começar
					</span>
					<span class="hidden text-[13px] text-base-content/60 sm:block">Capa do exercício</span>
				</div>
				<div
					class="grid grid-cols-[110px_1fr] items-baseline gap-4 px-5 py-4 sm:grid-cols-[130px_1fr_190px]"
				>
					<span class="font-mono text-xs text-base-content/60">title/32</span>
					<span class="font-display text-2xl leading-snug font-semibold"
						>Escute e escolha a resposta</span
					>
					<span class="hidden text-[13px] text-base-content/60 sm:block">Enunciado no Player</span>
				</div>
				<div
					class="grid grid-cols-[110px_1fr] items-baseline gap-4 px-5 py-4 sm:grid-cols-[130px_1fr_190px]"
				>
					<span class="font-mono text-xs text-base-content/60">content/22</span>
					<span class="font-content text-[22px]" data-content-lang="en" dir="ltr">
						She has been working here since 2019.
					</span>
					<span class="hidden text-[13px] text-base-content/60 sm:block">Mínimo 20px no Player</span
					>
				</div>
				<div
					class="grid grid-cols-[110px_1fr] items-baseline gap-4 px-5 py-4 sm:grid-cols-[130px_1fr_190px]"
				>
					<span class="font-mono text-xs text-base-content/60">body/16</span>
					<span class="text-base leading-relaxed"
						>Instruções e o corpo do Studio. Peso 400, altura 1.6.</span
					>
					<span class="hidden text-[13px] text-base-content/60 sm:block">Padrão de leitura</span>
				</div>
				<div
					class="grid grid-cols-[110px_1fr] items-baseline gap-4 px-5 py-4 sm:grid-cols-[130px_1fr_190px]"
				>
					<span class="font-mono text-xs text-base-content/60">label/12</span>
					<span class="text-xs font-bold tracking-wide uppercase">Rótulo de seção</span>
					<span class="hidden text-[13px] text-base-content/60 sm:block">Cabeçalhos, metadados</span
					>
				</div>
			</div>
		</section>

		<section id="icones" class="mb-14 scroll-mt-6">
			<h2 class="font-display text-2xl">Ícones e ilustração</h2>
			<p class="mt-1 max-w-2xl text-sm text-base-content/60">
				Traço de 2px, grade de 24px, <code class="font-mono text-[12px]">currentColor</code>
				sempre. Inline no Player — sem fonte de ícone, sem pacote no bundle.
			</p>
			<div class="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-6">
				{#each iconSet as icon (icon.name)}
					<div
						class="flex motion-tap flex-col items-center gap-3 rounded-box border border-line bg-card p-4.5 transition-[transform,border-color,color,translate,scale] duration-200 hover:-translate-y-1 hover:border-primary hover:text-primary"
					>
						<svg class="size-[26px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<!-- eslint-disable-next-line svelte/no-at-html-tags -- icon.path é literal fixo definido acima, não input do usuário -->
							{@html icon.path}
						</svg>
						<span class="font-mono text-[11px] text-base-content/60">{icon.name}</span>
					</div>
				{/each}
			</div>

			<div class="mt-3.5 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
				<div
					class="flex items-center gap-5 rounded-box border border-dashed border-line bg-card p-6"
				>
					<div
						class="flex h-24 w-[120px] shrink-0 items-center justify-center rounded-field bg-base-300 text-base-content/60"
					>
						<svg class="size-[30px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<rect
								x="2.5"
								y="4.5"
								width="19"
								height="15"
								rx="3"
								stroke="currentColor"
								stroke-width="2"
							/>
							<path
								d="M3 16l5-4.5 4 3.5 3-2.5 6 5"
								stroke="currentColor"
								stroke-width="2"
								stroke-linejoin="round"
							/>
							<circle cx="16" cy="9" r="1.6" fill="currentColor" />
						</svg>
					</div>
					<div>
						<div class="mb-1.5 text-[15px] font-bold">
							Ilustração: placeholder até haver arte real
						</div>
						<div class="text-[13px] leading-relaxed text-base-content/60">
							Conteúdo, não decoração de layout. No Player entra como imagem otimizada com
							<code class="font-mono text-[11px]">width</code>/<code class="font-mono text-[11px]"
								>height</code
							>
							fixos — nunca SVG desenhado à mão.
						</div>
					</div>
				</div>
				<div class="rounded-box border border-line bg-card p-6">
					<div class="mb-2.5 text-[15px] font-bold">Tamanhos</div>
					<div class="flex items-end gap-5.5 text-primary">
						{#each [16, 20, 24, 32] as sz (sz)}
							<div class="flex flex-col items-center gap-2">
								<svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" aria-hidden="true">
									<path
										d="M8 5.5l10 6.5-10 6.5z"
										stroke="currentColor"
										stroke-width={sz <= 20 ? 2.2 : 1.9}
										stroke-linejoin="round"
									/>
								</svg>
								<span class="font-mono text-[11px] text-base-content/60">{sz}</span>
							</div>
						{/each}
					</div>
					<div class="mt-4 text-[13px] leading-relaxed text-base-content/60">
						16 e 20 no Studio. 24 e 32 no Player, sempre num alvo de toque de 48px.
					</div>
				</div>
			</div>
		</section>

		<section id="componentes" class="mb-14 scroll-mt-6">
			<h2 class="font-display text-2xl">Componentes</h2>
			<p class="mt-1 max-w-2xl text-sm text-base-content/60">
				Componente de UI não contém regra de negócio: chama o kernel ou uma remote function.
			</p>

			<div class="mt-5 grid grid-cols-1 gap-3.5 lg:grid-cols-2">
				<div class="rounded-box border border-line bg-card p-6.5">
					<div class="mb-5 text-[11px] font-bold tracking-wide text-base-content/60 uppercase">
						Botões
					</div>
					<div class="mb-4 flex flex-wrap items-center gap-2.5">
						<Button variant="primary">Publicar</Button>
						<Button variant="outline">Pré-visualizar</Button>
						<Button variant="neutral">Cancelar</Button>
						<Button variant="ghost">Ver depois</Button>
					</div>
					<div class="flex flex-wrap items-center gap-2.5">
						<Button variant="primary" size="sm">sm</Button>
						<Button variant="primary" size="lg">lg · alvo do Player</Button>
						<Button variant="primary" disabled>desabilitado</Button>
						<span
							class="inline-flex items-center rounded-field border-2 border-primary px-4 py-2.5 text-[13px] font-semibold text-primary outline outline-3 outline-base-300"
						>
							foco visível
						</span>
					</div>
				</div>

				<div class="rounded-box border border-line bg-card p-6.5">
					<div class="mb-5 text-[11px] font-bold tracking-wide text-base-content/60 uppercase">
						Campos · input, select, textarea, toggle
					</div>
					<div class="grid gap-3.5">
						<TextField
							label="Título da atividade"
							bind:value={fieldValue}
							placeholder="Present perfect — turma B"
						/>
						<div class="grid grid-cols-2 gap-3">
							<fieldset class="fieldset">
								<legend class="fieldset-legend">Idioma alvo</legend>
								<select class="select">
									<option>Inglês</option>
									<option>Árabe</option>
								</select>
							</fieldset>
							<TextField
								label="Tolerância"
								error="Erro é ícone mais texto"
								value="Ignorar acentos"
							/>
						</div>
						<fieldset class="fieldset">
							<legend class="fieldset-legend">Cole uma frase por linha</legend>
							<textarea
								class="textarea"
								rows="2"
								placeholder="She has been working here since 2019."></textarea>
						</fieldset>
						<label
							class="flex cursor-pointer items-center justify-between gap-3.5 rounded-box border border-line bg-base-200 px-4 py-3.5"
						>
							<span class="text-sm font-semibold">Mostrar o resultado ao aluno</span>
							<input type="checkbox" checked class="toggle shrink-0 toggle-primary" />
						</label>
					</div>
				</div>
			</div>

			<div class="mt-3.5 grid grid-cols-1 gap-3.5 lg:grid-cols-3">
				<div class="rounded-box border border-line bg-card p-6.5">
					<div class="mb-5 text-[11px] font-bold tracking-wide text-base-content/60 uppercase">
						Badges e chips
					</div>
					<div class="mb-4.5 flex flex-wrap gap-2">
						<Badge variant="neutral" tone="soft">rascunho</Badge>
						<Badge variant="primary" tone="solid">publicada v3</Badge>
						<Badge variant="success" tone="outline">corrigida</Badge>
						<Badge variant="neutral" tone="outline">imutável</Badge>
					</div>
					<div class="flex flex-wrap gap-2">
						<span
							class="rounded-field border border-b-[3px] border-line bg-base-100 px-3.5 py-2 text-[17px]"
							data-content-lang="en"
							dir="ltr">has</span
						>
						<span
							class="rounded-field border border-b-[3px] border-line bg-base-100 px-3.5 py-2 text-[17px]"
							data-content-lang="en"
							dir="ltr">been</span
						>
						<span
							class="rounded-field border border-b-[3px] border-primary bg-base-300 px-3.5 py-2 text-[17px] text-primary"
							data-content-lang="en"
							dir="ltr">working</span
						>
					</div>
					<div class="mt-3.5 text-[12.5px] leading-relaxed text-base-content/60">
						Token de <code class="font-mono text-[11px]">assemble</code>: arrastável e clicável.
						Teclado obrigatório.
					</div>
				</div>

				<div class="rounded-box border border-line bg-card p-6.5">
					<div class="mb-5 text-[11px] font-bold tracking-wide text-base-content/60 uppercase">
						Progresso
					</div>
					<ProgressBar current={progressCurrent} total={progressTotal} />
					<div class="mt-2.5 flex justify-between text-[12.5px] text-base-content/60">
						<span>Questão {progressCurrent} de {progressTotal}</span>
						<span>{Math.round((progressCurrent / progressTotal) * 100)}%</span>
					</div>
					<div class="mt-5.5 mb-2.5">
						<ResultTrack items={resultItems} />
					</div>
					<div class="text-[12.5px] leading-relaxed text-base-content/60">
						A trilha por item resume a tentativa. Cada segmento tem <code
							class="font-mono text-[11px]">aria-label</code
						> com o estado por extenso.
					</div>
				</div>

				<div class="rounded-box border border-line bg-card p-6.5">
					<div class="mb-5 text-[11px] font-bold tracking-wide text-base-content/60 uppercase">
						Áudio
					</div>
					<AudioPlayer src="/dev/silence.wav" bind:playing={audioDemoPlaying} />
					<div class="mt-3.5 text-[12.5px] leading-relaxed text-base-content/60">
						Reprodução visível, velocidade alternável, sem autoplay. Repetições contam para a
						tentativa.
					</div>
				</div>
			</div>

			<div class="mt-3.5 grid grid-cols-1 gap-3.5 lg:grid-cols-2">
				<div class="rounded-box border border-line bg-card p-6.5">
					<div class="mb-5 text-[11px] font-bold tracking-wide text-base-content/60 uppercase">
						Marca e faixa de resultado
					</div>
					<Logo size={22} />
					<div class="mt-5 grid gap-2">
						<ScoreBar correct={71} partial={18} incorrect={11} />
						<div class="flex gap-4 text-[12.5px] text-base-content/60">
							<span><strong class="text-success">71%</strong> certo</span>
							<span><strong class="text-warning">18%</strong> parcial</span>
							<span><strong class="text-error">11%</strong> errado</span>
						</div>
					</div>
				</div>

				<div class="rounded-box border border-line bg-card p-6.5">
					<div class="mb-5 text-[11px] font-bold tracking-wide text-base-content/60 uppercase">
						Ícone de correção compacto
					</div>
					<div class="flex flex-wrap items-center gap-4">
						<span class="flex items-center gap-1.5 text-sm font-bold text-success">
							<CorrectionIcon state="correct" />Correto
						</span>
						<span class="flex items-center gap-1.5 text-sm font-bold text-warning">
							<CorrectionIcon state="partial" />Parcial
						</span>
						<span class="flex items-center gap-1.5 text-sm font-bold text-error">
							<CorrectionIcon state="incorrect" />Incorreto
						</span>
						<span class="flex items-center gap-1.5 text-sm font-bold text-base-content/60">
							<CorrectionIcon state="pending" />Pendente
						</span>
					</div>
					<div class="mt-3.5 text-[12.5px] leading-relaxed text-base-content/60">
						Para linhas de lista (fila de resultados, resposta de tentativa) — o bloco completo é
						<code class="font-mono text-[11px]">CorrectionState</code>, acima.
					</div>
				</div>
			</div>

			<div class="mt-3.5 rounded-box border border-line bg-card p-6.5">
				<div class="mb-5 text-[11px] font-bold tracking-wide text-base-content/60 uppercase">
					Etapas do wizard
				</div>
				<Stepper current={2} />
			</div>

			<div class="mt-3.5 grid grid-cols-1 gap-3.5 lg:grid-cols-2">
				<div class="rounded-box border border-line bg-card p-6.5">
					<div class="mb-5 text-[11px] font-bold tracking-wide text-base-content/60 uppercase">
						Alerta
					</div>
					<div class="grid gap-2.5">
						<Alert variant="info">
							<strong>O que está no ar não muda sozinho.</strong> Suas edições só entram no link depois
							que você publicar as mudanças.
						</Alert>
						<Alert variant="warning">
							Sem provedor de ASR configurado. A interação <code class="font-mono text-xs"
								>speak</code
							> vai ficar oculta no Player.
						</Alert>
					</div>
				</div>

				<div class="rounded-box border border-line bg-card p-6.5">
					<div class="mb-5 text-[11px] font-bold tracking-wide text-base-content/60 uppercase">
						Cartão de atividade
					</div>
					<div class="rounded-field border border-line bg-base-100 p-4.5">
						<div class="flex items-start justify-between gap-3">
							<div>
								<div class="font-display text-[19px] font-semibold">Present perfect — turma B</div>
								<div class="mt-1.5 text-[13px] text-base-content/60">
									Inglês · 8 questões · escuta, leitura, escrita
								</div>
							</div>
							<Badge variant="primary" tone="solid">publicada v3</Badge>
						</div>
						<div class="mt-4.5 flex items-center gap-4 border-t border-line pt-4">
							<span class="font-mono text-xs text-base-content/60">/a/present-perfect-b</span>
							<div class="flex-1"></div>
							<Button variant="neutral" size="sm">Copiar link</Button>
							<Button variant="ghost" size="sm" class="!text-primary">Resultados</Button>
						</div>
					</div>
				</div>
			</div>
		</section>

		<section id="loading" class="mb-14 scroll-mt-6">
			<h2 class="font-display text-2xl">Loading</h2>
			<p class="mt-1 max-w-2xl text-sm text-base-content/60">
				Três variações do mesmo vocabulário — círculo, triângulo, hexágono e anel tracejado. Cada
				uma tem um lugar, e nenhuma delas depende do movimento para ser compreendida: com
				<code class="font-mono text-xs">prefers-reduced-motion</code> tudo congela e quem informa a espera
				é o texto ao lado.
			</p>

			<div class="mt-4 flex items-center gap-2.5">
				<span class="text-[11px] font-bold tracking-wide text-base-content/60 uppercase">Ritmo</span
				>
				<button
					type="button"
					onclick={() => (ritmo = ritmo === 'normal' ? 'devagar' : 'normal')}
					class="btn btn-sm rounded-selector btn-neutral font-semibold"
				>
					{ritmo === 'normal' ? 'Normal' : 'Devagar (1,75×)'}
				</button>
			</div>

			<div class="mt-4 grid grid-cols-1 gap-3.5 lg:grid-cols-3">
				{#each loadingVariants as v (v.id)}
					<div class="rounded-box border border-line bg-card p-6.5">
						<div class="mb-1.5 font-mono text-[12px] text-primary">variant="{v.id}"</div>
						<div class="mb-1.5 font-display text-lg font-semibold">{v.nome}</div>
						<p class="mb-5 text-[13px] leading-relaxed text-base-content/60">{v.uso}</p>
						<!-- `items-end` alinha os rótulos numa linha só: as três caixas
						     têm alturas diferentes e, centradas, os px ficavam em escada. -->
						<div
							class="flex flex-wrap items-end justify-center gap-x-9 gap-y-5 rounded-box border border-line bg-base-200 px-5 py-7"
						>
							{#each v.tamanhos as px (px)}
								<div class="flex flex-col items-center gap-3">
									<Loading variant={v.id} size={px} pace={ritmo} />
									<span class="font-mono text-[11.5px] text-base-content/60">{px}px</span>
								</div>
							{/each}
						</div>
					</div>
				{/each}
			</div>

			<div class="mt-3.5 grid grid-cols-1 gap-3.5 lg:grid-cols-2">
				<div class="rounded-box border border-line bg-card p-6.5">
					<div class="mb-5 text-[11px] font-bold tracking-wide text-base-content/60 uppercase">
						Em contexto
					</div>
					<div class="grid gap-3.5">
						<button type="button" disabled class="btn gap-2.5 btn-primary font-bold">
							<Loading variant="fila" size={12} tone="current" label="Enviando" />
							Enviando 22 convites
						</button>
						<div class="flex items-center gap-4 rounded-box border border-line px-5 py-[22px]">
							<Loading variant="orbita" size={48} pace="devagar" label="Gerando" />
							<div class="min-w-0 flex-1">
								<p class="mb-1 text-[15px] font-bold">Lendo o material e escrevendo as questões</p>
								<p class="text-[13px] leading-snug text-base-content/60">
									Sem prazo estimado — a geração é assíncrona.
								</p>
							</div>
						</div>
						<div class="relative overflow-hidden rounded-box border border-line bg-base-200 p-5">
							<div class="opacity-30">
								<p class="mb-1.5 text-[15px] font-bold">Present perfect — turma B</p>
								<p class="text-[13px] text-base-content/60">22 convites · há 3 dias</p>
							</div>
							<div
								class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-base-200/62 backdrop-blur-[1.5px]"
							>
								<Loading variant="traco" size={42} label="Atualizando os resultados" />
								<span class="text-[13px] font-semibold">Atualizando os resultados</span>
							</div>
						</div>
					</div>
				</div>

				<div class="rounded-box border border-line bg-card p-6.5">
					<div class="mb-5 text-[11px] font-bold tracking-wide text-base-content/60 uppercase">
						Quando não usar nenhuma
					</div>
					<p class="mb-5 text-[13px] leading-relaxed text-base-content/60">
						Se você sabe o formato do que vem, mostre o formato. Se você não sabe quanto falta, não
						mostre porcentagem.
					</p>
					<div class="grid gap-3.5">
						<div class="rounded-box border border-line bg-base-200 p-4">
							<p class="mb-3 text-[11px] font-bold tracking-wide text-base-content/60 uppercase">
								Esqueleto
							</p>
							<div class="grid gap-2">
								<div class="h-[38px] skeleton"></div>
								<div class="h-[38px] skeleton" style="animation-delay: 200ms"></div>
							</div>
						</div>
						<div class="rounded-box border border-line bg-base-200 p-4">
							<p class="mb-3 text-[11px] font-bold tracking-wide text-base-content/60 uppercase">
								Barra de fila
							</p>
							<LoadingBar
								pace={ritmo}
								label="22 convites saindo. O e-mail sai por fila e pode levar alguns minutos."
							/>
						</div>
					</div>
				</div>
			</div>
		</section>

		<section id="correcao" class="mb-14 scroll-mt-6">
			<h2 class="font-display text-2xl">Estados de correção</h2>
			<p class="mt-1 max-w-2xl text-sm text-base-content/60">
				Três estados por item, e parcial é um deles. Cada estado carrega cor, ícone e texto — os
				três juntos, sempre.
			</p>
			<div class="mt-5 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
				{#each correctionStates as st (st)}
					<div class="rounded-box border border-line bg-card p-5.5">
						<CorrectionState
							state={st}
							answer={st === 'partial' ? 'has been work<u>in</u>' : 'has been working'}
							message={st === 'unanswered'
								? 'Neutro. Nunca parece erro antes de responder.'
								: st === 'correct'
									? 'Anunciado na live region: "Correto".'
									: st === 'partial'
										? 'Mostra o que faltou, não só que errou.'
										: 'Gabarito só aparece se o professor permitir.'}
							lang="en"
							dir="ltr"
						/>
					</div>
				{/each}
			</div>
			<div class="mt-3.5 grid grid-cols-1 gap-3.5 sm:grid-cols-3">
				<div class="rounded-box bg-base-300 p-5">
					<strong class="mb-1.5 block text-[13.5px]">Live region</strong>
					<span class="text-[13.5px] leading-relaxed"
						>Ao corrigir cada item, o resultado por extenso vai para <code class="font-mono text-xs"
							>aria-live="polite"</code
						>.</span
					>
				</div>
				<div class="rounded-box bg-base-300 p-5">
					<strong class="mb-1.5 block text-[13.5px]">Foco ao avançar</strong>
					<span class="text-[13.5px] leading-relaxed"
						>O foco vai para o início da nova questão, não fica no botão anterior.</span
					>
				</div>
				<div class="rounded-box bg-base-300 p-5">
					<strong class="mb-1.5 block text-[13.5px]">Propriedades lógicas</strong>
					<span class="text-[13.5px] leading-relaxed"
						><code class="font-mono text-xs">ms-</code>, <code class="font-mono text-xs">me-</code>,
						<code class="font-mono text-xs">text-start</code>. Conteúdo pode ser RTL com interface
						LTR.</span
					>
				</div>
			</div>
		</section>

		<section id="player" class="mb-14 scroll-mt-6">
			<h2 class="font-display text-2xl">Player — as seis interações</h2>
			<p class="mt-1 max-w-2xl text-sm text-base-content/60">
				Uma pergunta por tela, ação principal fixa no rodapé, alvo de toque de 48px. Aluno anônimo:
				o nome é pedido uma vez e nada mais.
			</p>

			<div class="mt-6 flex flex-wrap gap-7">
				<!-- Escuta + escolha -->
				<div class="max-w-[366px]">
					<div class={phoneFrame}>
						<PlayerQuestionShell index={choiceIndex} total={choiceTotal}>
							<div
								class="mb-3.5 flex items-center gap-2 text-xs font-bold tracking-wide text-accent uppercase"
							>
								<svg class="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
									<path
										d="M4 12.5V11a8 8 0 1116 0v1.5"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
									/>
									<rect
										x="2.5"
										y="12.5"
										width="4.5"
										height="7"
										rx="2"
										stroke="currentColor"
										stroke-width="2"
									/>
									<rect
										x="17"
										y="12.5"
										width="4.5"
										height="7"
										rx="2"
										stroke="currentColor"
										stroke-width="2"
									/>
								</svg>
								Escuta
							</div>
							<h3 class="mb-5 font-display text-[26px] leading-tight font-semibold">
								Escute e escolha o que você ouviu
							</h3>
							<div
								class="mb-5.5 flex items-center gap-3.5 rounded-field border border-line bg-base-200 p-3.5"
							>
								<span
									class="flex size-[52px] shrink-0 items-center justify-center rounded-selector bg-accent text-accent-content"
								>
									<svg class="size-6" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
										<path d="M8 5.5l10 6.5-10 6.5z" />
									</svg>
								</span>
								<div class="flex-1 text-sm font-semibold">
									Tocar áudio
									<div class="mt-0.5 text-xs font-normal text-base-content/60">
										0:04 · toque para repetir
									</div>
								</div>
								<span
									class="rounded-selector border border-line bg-base-100 px-2.5 py-2 font-mono text-xs"
									>0.75×</span
								>
							</div>
							<div class="grid gap-2.5">
								{#each choiceOptions as opt (opt.id)}
									<button
										type="button"
										class="rounded-field border-[1.5px] border-b-[3px] px-4 py-3.5 text-start text-lg
										       {opt.id === choiceSelectedId
											? 'animate-[en-pulse-primary_2.4s_ease-out_infinite] border-primary bg-base-300 text-primary'
											: 'border-line bg-base-100 hover:border-primary'}"
										data-content-lang="en"
										dir="ltr"
									>
										{opt.text}
									</button>
								{/each}
							</div>
							{#snippet footer()}
								<Button size="lg" class="w-full">Verificar</Button>
							{/snippet}
						</PlayerQuestionShell>
					</div>
					<p class="mt-3 text-[13px] leading-relaxed text-base-content/60">
						<strong class="text-base-content">listening + escolha.</strong> Sem autoplay. As alternativas
						usam Noto Sans por serem conteúdo do idioma alvo.
					</p>
				</div>

				<!-- Writing · tolerant (cloze) -->
				<div class="max-w-[366px]">
					<div class={phoneFrame}>
						<PlayerQuestionShell index={4} total={8}>
							<div class="mb-3.5 text-xs font-bold tracking-wide text-primary uppercase">
								Writing · tolerant
							</div>
							<h3 class="mb-4.5 font-display text-[26px] leading-tight font-semibold">
								Complete a frase
							</h3>
							<p class="mb-4.5 font-content text-xl" data-content-lang="en" dir="ltr">
								She ______ here since 2019.
							</p>
							<input
								class="input input-error font-content text-[19px]"
								value="has been workin"
								readonly
								data-content-lang="en"
								dir="ltr"
							/>
							<div class="mt-3.5">
								<Alert variant="warning">
									<strong>Quase.</strong> Faltou o <span data-content-lang="en">g</span> no final:
									<span class="font-semibold" data-content-lang="en">has been working</span>.
								</Alert>
							</div>
							<p class="mt-3.5 text-[12.5px] leading-relaxed text-base-content/60">
								Acento e caixa são ignorados pelo normalizador. Erro de uma letra vira parcial, não
								zero.
							</p>
							{#snippet footer()}
								<Button variant="neutral" size="lg">Pular</Button>
								<Button size="lg" class="flex-1">Continuar</Button>
							{/snippet}
						</PlayerQuestionShell>
					</div>
					<p class="mt-3 text-[13px] leading-relaxed text-base-content/60">
						<strong class="text-base-content">digitação tolerante.</strong> Parcial mostra a diferença.
					</p>
				</div>

				<!-- Assemble -->
				<div class="max-w-[366px]">
					<div class={phoneFrame}>
						<PlayerQuestionShell index={5} total={8}>
							<div class="mb-3.5 text-xs font-bold tracking-wide text-primary uppercase">
								Assemble
							</div>
							<h3 class="mb-4.5 font-display text-[26px] leading-tight font-semibold">
								Monte a frase
							</h3>
							<p class="mb-4 text-sm text-base-content/60">Ela trabalha aqui desde 2019.</p>
							<AssembleTokens
								bind:tokens={composeTokens}
								bind:pool={composePool}
								lang="en"
								dir="ltr"
							/>
							<div
								class="mt-5 flex items-center gap-2.5 rounded-field border border-line bg-base-200 p-3.5"
							>
								<svg
									class="size-[18px] shrink-0 text-base-content/60"
									viewBox="0 0 24 24"
									fill="none"
									aria-hidden="true"
								>
									<rect
										x="2.5"
										y="5.5"
										width="19"
										height="13"
										rx="3"
										stroke="currentColor"
										stroke-width="2"
									/>
									<path
										d="M8 14.5h8M7 10h.01M11 10h.01M15 10h.01"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
									/>
								</svg>
								<p class="text-[12.5px] leading-relaxed text-base-content/60">
									Tab seleciona, setas movem, Enter confirma. Tocar também insere.
								</p>
							</div>
							{#snippet footer()}
								<Button variant="neutral" size="lg" class="w-full">Verificar</Button>
							{/snippet}
						</PlayerQuestionShell>
					</div>
					<p class="mt-3 text-[13px] leading-relaxed text-base-content/60">
						<strong class="text-base-content">assemble.</strong>
						<code class="font-mono text-[11px]">svelte-dnd-action</code> + clique. Nunca só mouse.
					</p>
				</div>

				<!-- Speaking -->
				<div class="max-w-[366px]">
					<div class={phoneFrame}>
						<PlayerQuestionShell index={6} total={8}>
							<div class="mb-3.5 text-xs font-bold tracking-wide text-accent uppercase">
								Speaking · ASR
							</div>
							<h3 class="mb-4.5 font-display text-[26px] leading-tight font-semibold">
								Fale a frase
							</h3>
							<p class="mb-2 font-content text-[22px]" data-content-lang="en" dir="ltr">
								She has been working here since 2019.
							</p>
							<p class="mb-6 font-mono text-[13px] text-base-content/60">/ʃi hæz bɪn ˈwɜːkɪŋ/</p>
							<div class="mt-auto mb-6 flex flex-col items-center gap-4.5">
								<Recorder
									recording={speakRecording}
									ontoggle={() => (speakRecording = !speakRecording)}
								/>
							</div>
							{#snippet footer()}
								<Button variant="neutral" size="lg">
									<svg class="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
										<path
											d="M10 7.5h7.5a4.5 4.5 0 010 9H10M14 3.5l-4 4 4 4"
											stroke="currentColor"
											stroke-width="2"
											stroke-linecap="round"
											stroke-linejoin="round"
										/>
									</svg>
									Pular
								</Button>
								<Button size="lg" class="flex-1">Enviar</Button>
							{/snippet}
						</PlayerQuestionShell>
					</div>
					<p class="mt-3 text-[13px] leading-relaxed text-base-content/60">
						<strong class="text-base-content">speak.</strong> Pular está sempre visível — microfone negado
						não trava a atividade.
					</p>
				</div>

				<!-- Reading -->
				<div class="max-w-[366px]">
					<div class={phoneFrame}>
						<PlayerQuestionShell index={1} total={8}>
							<div class="mb-3.5 text-xs font-bold tracking-wide text-primary uppercase">
								Reading
							</div>
							<div class="mb-5 rounded-field border border-line bg-base-200 p-4">
								<p class="font-content leading-relaxed" data-content-lang="en" dir="ltr">
									Maria moved to Lisbon in 2019. She found a job at a small bookshop and has been
									working there ever since. On weekends she teaches Portuguese to newcomers.
								</p>
								<button
									type="button"
									class="mt-3 flex items-center gap-2 text-[13px] font-semibold text-accent"
								>
									<svg class="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
										<path
											d="M8 5.5l10 6.5-10 6.5z"
											stroke="currentColor"
											stroke-width="2"
											stroke-linejoin="round"
										/>
									</svg>
									Ouvir o texto
								</button>
							</div>
							<h3 class="mb-4 font-display text-xl leading-tight font-semibold">
								Onde Maria trabalha?
							</h3>
							<div class="grid gap-2.5">
								{#each ['At a school', 'At a bookshop', 'At a café'] as opt (opt)}
									<button
										type="button"
										class="rounded-field border-[1.5px] border-b-[3px] border-line bg-base-100 px-4 py-3.5 text-start text-lg hover:border-primary"
										data-content-lang="en"
										dir="ltr"
									>
										{opt}
									</button>
								{/each}
							</div>
							{#snippet footer()}
								<Button variant="neutral" size="lg" class="w-full">Verificar</Button>
							{/snippet}
						</PlayerQuestionShell>
					</div>
					<p class="mt-3 text-[13px] leading-relaxed text-base-content/60">
						<strong class="text-base-content">reading.</strong> O texto fica visível junto da pergunta.
					</p>
				</div>

				<!-- Writing longo -->
				<div class="max-w-[366px]">
					<div class={phoneFrame}>
						<PlayerQuestionShell index={8} total={8}>
							<div class="mb-3.5 text-xs font-bold tracking-wide text-primary uppercase">
								Writing longo
							</div>
							<h3 class="mb-2 font-display text-xl leading-tight font-semibold">
								Escreva 3 frases sobre sua rotina
							</h3>
							<p class="mb-4 text-[13.5px] leading-relaxed text-base-content/60">
								Use o present perfect pelo menos uma vez. Correção humana.
							</p>
							<div
								class="flex flex-1 flex-col rounded-field border-[1.5px] border-line bg-base-100 p-3.5"
							>
								<p
									class="flex-1 font-content text-lg leading-relaxed"
									data-content-lang="en"
									dir="ltr"
								>
									I have been studying English for two years. Every morning I read the news<span
										class="ms-0.5 inline-block h-[19px] w-[2px] translate-y-1 caret-blink bg-primary"
									></span>
								</p>
								<div
									class="mt-2.5 flex items-center justify-between border-t border-line pt-2.5 text-xs text-base-content/60"
								>
									<span>Salvo automaticamente</span>
									<span class="font-mono">62 / 400</span>
								</div>
							</div>
							{#snippet footer()}
								<Button size="lg" class="w-full">Entregar atividade</Button>
							{/snippet}
						</PlayerQuestionShell>
					</div>
					<p class="mt-3 text-[13px] leading-relaxed text-base-content/60">
						<strong class="text-base-content">writing longo.</strong> Rascunho local sobrevive a recarregar.
					</p>
				</div>
			</div>
		</section>

		<section id="studio" class="mb-14 scroll-mt-6">
			<h2 class="font-display text-2xl">Studio</h2>
			<p class="mt-1 max-w-2xl text-sm text-base-content/60">
				Desktop, sessão longa, densidade alta. Barra lateral fixa, conteúdo em uma coluna de leitura
				e um painel de contexto à direita quando há geração ou publicação em jogo.
			</p>

			<div class="mt-5 overflow-hidden rounded-box border border-line bg-card">
				<div class="flex items-center gap-2.5 border-b border-line bg-base-200 px-4 py-2.5">
					<span class="size-2.5 rounded-full bg-line"></span>
					<span class="size-2.5 rounded-full bg-line"></span>
					<span class="size-2.5 rounded-full bg-line"></span>
					<span class="ms-3 font-mono text-xs text-base-content/60">/studio/atividades</span>
				</div>
				<div class="grid grid-cols-1 md:grid-cols-[216px_1fr]">
					<div class="border-b border-line bg-base-100 p-4 md:border-e md:border-b-0">
						<div class="mb-5.5 flex items-center gap-2">
							<svg class="size-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
								<rect
									x="1.5"
									y="2.5"
									width="21"
									height="15"
									rx="4"
									stroke="var(--color-primary)"
									stroke-width="2"
								/>
								<path
									d="M7 21.5L11 17.5"
									stroke="var(--color-primary)"
									stroke-width="2"
									stroke-linecap="round"
								/>
							</svg>
							<span class="font-display text-base font-extrabold">entendo</span>
						</div>
						<Button variant="primary" size="sm" class="mb-5 w-full">+ Nova atividade</Button>
						<div class="grid gap-0.5">
							<span
								class="flex items-center gap-2.5 rounded-field bg-base-300 px-3 py-2.5 text-sm font-bold text-primary"
							>
								Atividades
							</span>
							<span
								class="flex items-center gap-2.5 rounded-field px-3 py-2.5 text-sm text-base-content/60"
							>
								Resultados
							</span>
							<span
								class="flex items-center gap-2.5 rounded-field px-3 py-2.5 text-sm text-base-content/60"
							>
								Materiais
							</span>
							<span
								class="flex items-center gap-2.5 rounded-field px-3 py-2.5 text-sm text-base-content/60"
							>
								Assinatura
							</span>
						</div>
						<div class="mt-6 flex items-center gap-2.5 border-t border-line pt-4">
							<span
								class="flex size-[30px] items-center justify-center rounded-full bg-base-300 text-xs font-bold text-primary"
							>
								CS
							</span>
							<div class="text-[12.5px] leading-tight">
								<div class="font-semibold">Carla S.</div>
								<div class="text-base-content/60">Plano Pro</div>
							</div>
						</div>
					</div>
					<div class="p-6.5">
						<div class="mb-5.5 flex flex-wrap items-end justify-between gap-5">
							<div>
								<h3 class="font-display text-[26px] font-semibold">Atividades</h3>
								<div class="mt-1.5 text-[13.5px] text-base-content/60">
									12 atividades · 4 publicadas
								</div>
							</div>
							<div class="flex gap-2">
								<Badge variant="primary" tone="soft">Todas</Badge>
								<span
									class="rounded-selector border border-line bg-base-200 px-3.5 py-1.5 text-[13px] text-base-content/60"
								>
									Publicadas
								</span>
								<span
									class="rounded-selector border border-line bg-base-200 px-3.5 py-1.5 text-[13px] text-base-content/60"
								>
									Rascunhos
								</span>
							</div>
						</div>
						<div class="overflow-hidden rounded-field border border-line">
							<div
								class="grid grid-cols-[2.4fr_1fr_1fr_1.1fr_70px] gap-4 bg-base-200 px-4.5 py-2.5 text-[11px] font-bold tracking-wide text-base-content/60 uppercase"
							>
								<span>Atividade</span><span>Idioma</span><span>Status</span><span>Tentativas</span
								><span></span>
							</div>
							{#each [{ title: 'Present perfect — turma B', meta: '8 itens · listening, reading, writing', lang: 'Inglês', status: 'v3 no ar', tries: '18 / 24' }, { title: 'Saudações e apresentação', meta: '6 itens · speaking, listening', lang: 'Árabe', status: 'rascunho', tries: '—' }, { title: 'Números e horas', meta: '10 itens · listening', lang: 'Japonês', status: 'v1 no ar', tries: '31 / 31' }] as row, i (row.title)}
								<div
									class="grid grid-cols-[2.4fr_1fr_1fr_1.1fr_70px] items-center gap-4 px-4.5 py-3.5 text-sm hover:bg-base-200 {i <
									2
										? 'border-b border-line'
										: ''}"
								>
									<div>
										<div class="font-semibold">{row.title}</div>
										<div class="mt-0.5 text-xs text-base-content/60">{row.meta}</div>
									</div>
									<span class="text-base-content/60">{row.lang}</span>
									<span>
										{#if row.status === 'rascunho'}
											<Badge variant="neutral" tone="outline">rascunho</Badge>
										{:else}
											<Badge variant="primary" tone="solid">{row.status}</Badge>
										{/if}
									</span>
									<span class="font-mono text-[13px]">{row.tries}</span>
									<span class="text-end text-[13px] font-bold text-primary">Abrir</span>
								</div>
							{/each}
						</div>
					</div>
				</div>
			</div>

			<div class="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1.5fr_1fr]">
				<div class="overflow-hidden rounded-box border border-line bg-card">
					<div class="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3.5">
						<span class="font-display text-[17px] font-semibold">Editor · item 4</span>
						<Badge variant="neutral" tone="outline">rascunho v4</Badge>
						<div class="flex-1"></div>
						<Button variant="neutral" size="sm">Pré-visualizar</Button>
						<Button variant="primary" size="sm">Publicar v4</Button>
					</div>
					<div class="grid gap-4 p-5.5">
						<div class="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_180px]">
							<TextField label="Enunciado" value="Complete a frase" />
							<fieldset class="fieldset">
								<legend class="fieldset-legend">Interação</legend>
								<select class="input appearance-none"
									><option>tolerant</option><option>assemble</option></select
								>
							</fieldset>
						</div>
						<TextField label="Frase alvo" value="She has been working here since 2019." />
						<div
							class="flex items-center justify-between rounded-field border border-line bg-base-200 p-3.5"
						>
							<div class="text-[13.5px]">
								<strong>Gabarito no servidor</strong>
								<div class="mt-0.5 text-xs text-base-content/60">
									Nunca vai para o browser do aluno.
								</div>
							</div>
							<span class="flex items-center gap-1.5 text-[12.5px] font-bold text-success">
								<svg class="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
									<path
										d="M5 12.5l4.5 4.5L19 7"
										stroke="currentColor"
										stroke-width="2.4"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
								</svg>
								garantido
							</span>
						</div>
						<div class="flex flex-wrap gap-2.5">
							{#each [{ label: 'Ignorar acentos', on: true }, { label: 'Ignorar caixa', on: false }, { label: 'Feedback ao aluno', on: true }] as t (t.label)}
								<span
									class="flex items-center gap-1.5 rounded-selector border border-line bg-base-200 px-3 py-1.5 text-[12.5px] font-semibold"
								>
									{t.label}
									<span
										class="relative inline-block h-[15px] w-[26px] rounded-selector {t.on
											? 'bg-primary'
											: 'bg-base-300'}"
									>
										<span
											class="absolute top-0.5 size-[11px] rounded-selector bg-white {t.on
												? 'end-0.5'
												: 'start-0.5 !bg-base-content/60'}"
										></span>
									</span>
								</span>
							{/each}
						</div>
					</div>
				</div>

				<div class="overflow-hidden rounded-box border border-line bg-card">
					<div class="border-b border-line px-5 py-3.5 font-display text-[17px] font-semibold">
						Resultados · turma B
					</div>
					<div class="p-5">
						<div class="mb-5.5 flex gap-5.5">
							<div>
								<div class="font-display text-3xl font-extrabold">18</div>
								<div class="mt-1 text-xs text-base-content/60">tentativas</div>
							</div>
							<div>
								<div class="font-display text-3xl font-extrabold text-success">71%</div>
								<div class="mt-1 text-xs text-base-content/60">acerto médio</div>
							</div>
							<div>
								<div class="font-display text-3xl font-extrabold text-warning">3</div>
								<div class="mt-1 text-xs text-base-content/60">writing a corrigir</div>
							</div>
						</div>
						<div class="mb-3 text-[11px] font-bold tracking-wide text-base-content/60 uppercase">
							Itens mais errados
						</div>
						<div class="grid gap-3">
							{#each [{ label: 'Item 4 · tolerant', pct: '38%', ok: 38, part: 30, err: 32 }, { label: 'Item 6 · speak', pct: '52%', ok: 52, part: 34, err: 14 }, { label: 'Item 2 · listening', pct: '83%', ok: 83, part: 9, err: 8 }] as row (row.label)}
								<div>
									<div class="mb-1.5 flex justify-between text-[13px]">
										<span>{row.label}</span>
										<span class="font-mono text-base-content/60">{row.pct}</span>
									</div>
									<div class="flex h-2 gap-[3px]">
										<div class="rounded-selector bg-success" style="width: {row.ok}%"></div>
										<div class="rounded-selector bg-warning" style="width: {row.part}%"></div>
										<div class="rounded-selector bg-error" style="width: {row.err}%"></div>
									</div>
								</div>
							{/each}
						</div>
						<p
							class="mt-4.5 border-t border-line pt-3.5 text-[12.5px] leading-relaxed text-base-content/60"
						>
							Parcial aparece como faixa própria no gráfico. Somar ao erro esconde o que o professor
							precisa ver.
						</p>
					</div>
				</div>
			</div>
		</section>

		<section id="materiais" class="mb-14 scroll-mt-6">
			<h2 class="font-display text-2xl">Materiais</h2>
			<p class="mt-1 max-w-2xl text-sm text-base-content/60">
				<code class="font-mono text-[12px]">MaterialForm</code> é UM formulário para a biblioteca e para
				a etapa 2 do wizard — lá coluna fixa, aqui painel sobre a lista. Os tipos aparecem pelo exercício
				que produzem, o rendimento do conjunto avisa antes de gerar, e "o que o aluno vai ver" monta o
				exercício com o que o professor digitou.
			</p>

			<div class="mt-4 flex flex-wrap gap-2">
				{#each [['wizard', 'Wizard · etapa 2'], ['biblioteca', 'Biblioteca']] as const as [id, label] (id)}
					<button
						type="button"
						onclick={() => (contextoDemo = id)}
						aria-pressed={contextoDemo === id}
						class="rounded-full px-3.5 py-[7px] text-[12.5px] font-semibold transition-colors {contextoDemo ===
						id
							? 'border-[1.5px] border-primary bg-primary text-primary-content'
							: 'border-[1.5px] border-line bg-base-100 hover:border-primary'}">{label}</button
					>
				{/each}
				<button
					type="button"
					onclick={() => formDemo?.editar(materiaisDemo[0])}
					class="btn btn-sm btn-neutral">Editando a 1ª linha</button
				>
				<button type="button" onclick={() => formDemo?.novo()} class="btn btn-sm btn-neutral"
					>Novo</button
				>
			</div>

			<div class="mt-4 grid gap-5 lg:grid-cols-[500px_minmax(0,1fr)]">
				<div class="overflow-hidden rounded-box border border-line bg-card">
					<form class="contents" onsubmit={(e) => e.preventDefault()}>
						<MaterialForm
							bind:this={formDemo}
							bind:modo={modoDemo}
							bind:editando={editandoDemo}
							contexto={contextoDemo}
							conjunto={materiaisDemo}
							contentTag="en-US"
							targetLabel={contextoDemo === 'wizard' ? 'Inglês' : undefined}
							sourceLabel={contextoDemo === 'wizard' ? 'Português' : undefined}
							onfechar={() => formDemo?.limpar()}
							fecharRotulo={contextoDemo === 'wizard' ? 'Ver os 5 materiais' : undefined}
						/>
					</form>
				</div>
				<div>
					<MaterialList
						materiais={materiaisDemo}
						contexto={contextoDemo}
						contentTag="en-US"
						editandoId={editandoDemo?.id ?? null}
						onedit={(m) => formDemo?.editar(m)}
						onremove={() => {}}
					/>
					<p class="mt-3 text-[12.5px] leading-relaxed text-base-content/60">
						A quarta coluna muda com o contexto: "Em uso" na biblioteca, "Origem" no wizard. O ícone
						de remover também — lixeira apaga da biblioteca, X só tira desta atividade.
					</p>
				</div>
			</div>
		</section>

		<section id="bandeja" class="mb-14 scroll-mt-6">
			<h2 class="font-display text-2xl">Bandeja</h2>
			<p class="mt-1 max-w-2xl text-sm text-base-content/60">
				Todo formulário de criar e editar do Studio que não é atividade abre aqui: ~40% da tela,
				cabeçalho com a etiqueta do que se cria, corpo que rola e rodapé com o resumo e as ações.
			</p>
			<div class="mt-6 flex flex-wrap gap-2">
				<button
					type="button"
					onclick={() => {
						bandejaComErro = false;
						bandejaDemo = true;
					}}
					class="btn motion-tap btn-primary font-bold">Abrir a bandeja</button
				>
				<button
					type="button"
					onclick={() => {
						bandejaComErro = true;
						bandejaDemo = true;
					}}
					class="btn motion-tap btn-plain">Com erro do servidor</button
				>
			</div>
		</section>

		<section id="avatar" class="mb-14 scroll-mt-6">
			<h2 class="font-display text-2xl">Avatar</h2>
			<p class="mt-1 max-w-2xl text-sm text-base-content/60">
				Dezoito números, nunca uma imagem. Os quatro tamanhos de uso, o fallback de iniciais, e o
				editor completo.
			</p>

			<div class="mt-6 grid gap-6 lg:grid-cols-[1fr_1fr]">
				<div class="rounded-box border border-line bg-card p-5">
					<p class="mb-3 text-[13px] font-semibold">Tamanhos</p>
					<div class="flex flex-wrap items-end gap-4">
						{#each [64, 46, 40, 32, 26] as px (px)}
							<span class="grid justify-items-center gap-1.5">
								<Avatar codigo={avatarDemo} size={px} radius="rounded-[8px]" />
								<span class="font-mono text-[10.5px] text-base-content/60">{px}</span>
							</span>
						{/each}
					</div>
					<p class="mt-4 mb-3 text-[13px] font-semibold">
						Sem código — cai nas iniciais, e não é erro
					</p>
					<div class="flex flex-wrap items-end gap-4">
						{#each [46, 32] as px (px)}
							<Avatar codigo={null} nome="Juliana Prado" size={px} radius="rounded-[8px]" />
						{/each}
						<Avatar codigo={null} nome="Ana" size={40} radius="rounded-full" />
					</div>
				</div>

				<div class="rounded-box border border-line bg-card p-5">
					<p class="mb-3 text-[13px] font-semibold">Sorteados</p>
					<div class="flex flex-wrap gap-2">
						{#each sorteados as codigo (codigo)}
							<Avatar {codigo} size={44} radius="rounded-[9px]" class="border border-line" />
						{/each}
					</div>
					<div class="mt-4 flex flex-wrap gap-2">
						<button
							type="button"
							onclick={() => (sorteados = Array.from({ length: 12 }, () => sortearCodigo()))}
							class="btn btn-sm motion-tap btn-plain text-xs font-semibold">Sortear de novo</button
						>
						<button
							type="button"
							onclick={() => (editorDemo = true)}
							class="btn btn-sm motion-tap btn-primary text-xs font-bold">Abrir o editor</button
						>
					</div>
					<p class="mt-3 font-mono text-[11px] break-all text-base-content/60">{avatarDemo}</p>
				</div>
			</div>
		</section>

		<section id="planos" class="mb-14 scroll-mt-6">
			<h2 class="font-display text-2xl">Planos</h2>
			<p class="mt-1 max-w-2xl text-sm text-base-content/60">
				A mesma tabela da home e de <code class="font-mono text-[12px]">/planos</code>. Os preços
				são placeholder — vivem em
				<code class="font-mono text-[12px]">$lib/content/planos.ts</code>.
			</p>

			<div class="mt-5 flex flex-wrap gap-2">
				{#each [null, 'basico', 'pro', 'super'] as const as id (id ?? 'nenhum')}
					<button
						type="button"
						onclick={() => (planoDemo = id)}
						aria-pressed={planoDemo === id}
						class="btn btn-sm motion-tap text-xs font-semibold {planoDemo === id
							? 'btn-primary'
							: 'btn-plain'}">{id ?? 'sem plano'}</button
					>
				{/each}
			</div>

			<div class="mt-5">
				<PlanosTabela planoAtual={planoDemo} compacto />
			</div>
		</section>

		<section id="teclado" class="mb-14 scroll-mt-6">
			<h2 class="font-display text-2xl">Teclado virtual</h2>
			<p class="mt-1 max-w-2xl text-sm text-base-content/60">
				O layout vem do <code class="font-mono text-[12px]">LanguageProfile</code>. Grade substitui
				o teclado do aparelho; barra só completa os acentos. Kana e pinyin não escrevem kanji nem
				hanzi: a resposta é aceita porque o servidor põe a leitura da frase no gabarito. No Player a
				grade fica encaixada acima do rodapé; aqui ela aparece solta, como na prévia do professor.
			</p>
			<div class="mt-6 grid gap-6 lg:grid-cols-2" data-surface="player">
				{#each tecladosDemo as t (t.id)}
					<div
						class="rounded-box border border-line bg-card p-4 {t.id === 'kana'
							? 'lg:col-span-2'
							: ''}"
						data-teclado-demo={t.id}
					>
						<p class="mb-2 text-[13px] font-semibold">{t.rotulo}</p>
						<input
							bind:value={textosDemo[t.id]}
							bind:this={camposDemo[t.id]!.elemento}
							onblur={camposDemo[t.id]!.lembrar}
							dir={t.dir}
							inputmode={t.teclado.formato === 'grade' && abertosDemo[t.id] ? 'none' : 'text'}
							class="input w-full font-content text-[19px]"
							aria-label="Campo de {t.rotulo}"
						/>
						<LeituraDoCampo teclado={t.teclado} texto={textosDemo[t.id] ?? ''} />
						<TecladoVirtual
							teclado={t.teclado}
							bind:aberto={abertosDemo[t.id]}
							onacao={(acao) =>
								camposDemo[t.id]!.aplicar(
									textosDemo[t.id] ?? '',
									acao,
									(novo) => (textosDemo[t.id] = novo)
								)}
						/>
					</div>
				{/each}
			</div>
		</section>

		<section id="movimento" class="mb-14 scroll-mt-6">
			<h2 class="font-display text-2xl">Movimento</h2>
			<p class="mt-1 max-w-2xl text-sm text-base-content/60">
				Tudo em CSS: <code class="font-mono text-[12px]">transform</code> e
				<code class="font-mono text-[12px]">opacity</code> apenas, nenhuma biblioteca no bundle do Player.
			</p>

			<div class="mt-5 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
				<div class="rounded-box border border-line bg-card p-5.5">
					<div class="mb-3 font-mono text-xs text-primary">120ms · ease-out</div>
					<div class="mb-1.5 text-[15px] font-bold">Toque</div>
					<div class="mb-4 text-[12.5px] leading-relaxed text-base-content/60">
						Escala 0.97 no press. Resposta imediata mesmo com rede lenta.
					</div>
					<Button variant="primary">Pressione</Button>
				</div>
				<div class="rounded-box border border-line bg-card p-5.5">
					<div class="mb-3 font-mono text-xs text-primary">220ms · ease-out-soft</div>
					<div class="mb-1.5 text-[15px] font-bold">Correção</div>
					<div class="mb-4 text-[12.5px] leading-relaxed text-base-content/60">
						Ícone e texto entram juntos. Nunca pisca em vermelho.
					</div>
					<div class="flex items-center gap-2.5 text-success">
						<svg class="size-[30px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" opacity="0.35" />
							<path
								d="M7.5 12.5l3 3 6-6.5"
								stroke="currentColor"
								stroke-width="2.4"
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-dasharray="34"
								style="animation: en-draw 900ms var(--ease-out-soft) infinite alternate"
							/>
						</svg>
						<span
							class="text-[15px] font-bold"
							style="animation: en-fade-up 900ms var(--ease-out-soft) infinite alternate"
						>
							Correto
						</span>
					</div>
				</div>
				<div class="rounded-box border border-line bg-card p-5.5">
					<div class="mb-3 font-mono text-xs text-primary">1s · ease-out-soft</div>
					<div class="mb-1.5 text-[15px] font-bold">Progresso</div>
					<div class="mb-4 text-[12.5px] leading-relaxed text-base-content/60">
						A barra cresce por <code class="font-mono text-[11px]">scaleX</code>, sem reflow.
					</div>
					<div class="h-2.5 overflow-hidden rounded-selector bg-base-300">
						<div
							class="h-full origin-left rounded-selector bg-primary"
							style="animation: en-grow-x 1.6s var(--ease-out-soft) infinite alternate"
						></div>
					</div>
					<div class="mt-3.5 h-2.5 skeleton"></div>
					<div class="mt-2 text-[11.5px] text-base-content/60">Skeleton de espera de TTS/ASR.</div>
				</div>
				<div class="rounded-box border border-line bg-card p-5.5">
					<div class="mb-3 font-mono text-xs text-primary">infinito · ease-in-out</div>
					<div class="mb-1.5 text-[15px] font-bold">Estado contínuo</div>
					<div class="mb-4 text-[12.5px] leading-relaxed text-base-content/60">
						Só gravação e carregamento repetem para sempre.
					</div>
					<div class="flex items-center gap-4">
						<span
							class="flex size-[46px] shrink-0 animate-[en-pulse-ring_1.9s_ease-out_infinite] items-center justify-center rounded-selector bg-accent text-accent-content"
						>
							<svg class="size-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
						</span>
						<div class="flex h-[26px] flex-1 items-center gap-[3px]">
							{#each [40, 90, 55, 75, 35] as h, i (i)}
								<div
									class="flex-1 rounded-sm bg-accent"
									style="height: {h}%; animation: en-wave {380 +
										i * 40}ms ease-in-out infinite alternate {i * 60}ms"
								></div>
							{/each}
						</div>
					</div>
				</div>
			</div>

			<div class="mt-3.5 grid grid-cols-1 gap-3.5 lg:grid-cols-[1.35fr_1fr]">
				<div class="relative overflow-hidden rounded-box border border-line bg-card p-6.5">
					<div
						class="pointer-events-none absolute inset-y-0 end-0 w-[132px] overflow-hidden border-s border-line"
						aria-hidden="true"
					>
						<AmbientShapes height="70%" />
					</div>
					<div class="relative pe-[148px]">
						<div class="mb-3.5 text-[11px] font-bold tracking-wide text-base-content/60 uppercase">
							Formas de ambiente
						</div>
						<div class="mb-3 font-display text-[22px] leading-snug font-semibold">
							Três a cinco formas, 12 a 24 segundos, opacidade abaixo de 0.35.
						</div>
						<div class="mb-4 flex flex-wrap items-center gap-2.5">
							<span
								title="círculo"
								class="size-[42px] animate-[en-breathe_6s_ease-in-out_infinite] rounded-full bg-primary/30"
							></span>
							<span
								title="triângulo"
								class="size-[42px] animate-[en-drift-spin_20s_ease-in-out_infinite] bg-primary/25"
								style="clip-path: polygon(50% 0%, 100% 100%, 0% 100%)"
							></span>
							<span
								title="hexágono"
								class="size-[42px] animate-[en-float-c_16s_ease-in-out_infinite] bg-accent/25"
								style="clip-path: polygon(25% 3%, 75% 3%, 100% 50%, 75% 97%, 25% 97%, 0% 50%)"
							></span>
							<span
								title="quadrado arredondado"
								class="size-[42px] animate-[en-float-a_13s_ease-in-out_infinite] rounded-[14px] bg-warning/25"
							></span>
							<span
								title="anel tracejado"
								class="size-[42px] animate-spin rounded-full border-[1.5px] border-dashed border-primary/40 [animation-duration:26s]"
							></span>
							<span
								title="arco"
								class="size-[42px] animate-spin rounded-full border-2 border-accent/40
								       border-e-transparent border-t-transparent [animation-duration:12s]"
							></span>
							<span
								title="cruz"
								class="size-[42px] animate-spin bg-warning/30 [animation-duration:18s]"
								style="clip-path: polygon(40% 0,60% 0,60% 40%,100% 40%,100% 60%,60% 60%,60% 100%,40% 100%,40% 60%,0 60%,0 40%,40% 40%)"
							></span>
							<span
								title="cápsula"
								class="h-[26px] w-[62px] animate-[en-float-b_15s_ease-in-out_infinite] rounded-full border-[1.5px] border-primary/35"
							></span>
						</div>
						<div class="text-[13.5px] leading-relaxed text-base-content/60">
							Círculo, triângulo, hexágono, quadrado arredondado, anel tracejado, arco, cruz e
							cápsula — só estes oito. Sempre <code class="font-mono text-xs">aria-hidden</code> e
							<code class="font-mono text-xs">pointer-events: none</code>.
						</div>
					</div>
				</div>
				<div class="rounded-box border border-line bg-card p-6.5">
					<div class="mb-4.5 text-[11px] font-bold tracking-wide text-base-content/60 uppercase">
						Transição entre questões
					</div>
					<div class="mb-2 flex h-[46px] items-center" aria-hidden="true">
						<div
							class="size-[46px] rounded-field bg-primary"
							style="animation: en-travel 2.6s var(--ease-out-soft) infinite"
						></div>
					</div>
					<div class="mb-4.5 text-[13.5px] leading-relaxed text-base-content/60">
						A questão sai para o lado de saída da leitura e a próxima entra do lado oposto — o eixo
						segue o <code class="font-mono text-xs">dir</code> do conteúdo, então em RTL a direção inverte
						sozinha.
					</div>
					<Alert variant="info">
						<code class="font-mono text-xs">prefers-reduced-motion</code> desliga tudo isto. O layout
						não depende de nenhuma animação.
					</Alert>
				</div>
			</div>
		</section>

		<section id="scroll" class="mb-14 scroll-mt-6">
			<h2 class="font-display text-2xl">Entrada em scroll</h2>
			<p class="mt-1 text-sm text-base-content/60">
				Role a página até aqui: os cartões nascem rodando e a action <code class="font-mono text-xs"
					>reveal</code
				>
				só pausa/despausa via <code class="font-mono text-xs">IntersectionObserver</code>.
			</p>
			<div class="mt-5 grid grid-cols-2 gap-3.5 sm:grid-cols-4">
				{#each revealCards as i (i)}
					<div
						class="reveal-row rounded-box border border-line bg-card p-5"
						use:reveal={{ ordem: i }}
					>
						<p class="font-display text-2xl text-primary">{i}</p>
						<p class="text-[13px] text-base-content/60">cartão {i}</p>
					</div>
				{/each}
			</div>
		</section>
	</main>
</div>

<AvatarEditor bind:codigo={avatarDemo} bind:aberto={editorDemo} />

<Bandeja
	aberta={bandejaDemo}
	onfechar={() => (bandejaDemo = false)}
	titulo="Novo módulo"
	descricao="Uma sequência de atividades que você manda para a turma no ritmo que escolher."
	resumo={escolhidasDemo.length
		? `${escolhidasDemo.length} atividades entram no módulo, nesta ordem.`
		: 'As atividades podem entrar depois. As turmas e os envios, no módulo aberto.'}
	erro={bandejaComErro ? 'Não deu para criar agora. Tente de novo em instantes.' : null}
>
	{#snippet marca()}
		<span
			class="grid size-[46px] flex-none place-items-center rounded-[13px] text-[15px] font-bold {CLASSE_DA_ETIQUETA[
				corDemo
			]}"
			aria-hidden="true">{etiquetaDaTurma(nomeDemo || 'NM')}</span
		>
	{/snippet}
	<div class="grid gap-7">
		<div class="grid gap-5">
			<label class="fieldset">
				<span class="fieldset-legend">Nome</span>
				<input bind:value={nomeDemo} class="input w-full text-[15px]" data-autofoco />
				<span class="fieldset-label">Aparece na sua lista e no mapa de fases do aluno.</span>
			</label>
			<label class="fieldset">
				<span class="fieldset-legend"
					>Descrição <span class="font-normal text-base-content/60">· opcional</span></span
				>
				<textarea
					rows="2"
					class="textarea w-full"
					placeholder="O que este módulo cobre, numa linha."></textarea>
			</label>
			<SeletorDeEtiqueta bind:cor={corDemo} sigla={etiquetaDaTurma(nomeDemo || 'NM')} />
		</div>
		<section class="grid gap-3 border-t border-line pt-6">
			<div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
				<h3 class="text-[15px] font-bold">Atividades</h3>
				<span class="text-[12.5px] text-base-content/60"
					>opcional · a ordem do clique é a ordem do módulo</span
				>
			</div>
			<SeletorDeAtividades atividades={atividadesDemo} bind:escolhidas={escolhidasDemo} />
		</section>
	</div>
	{#snippet rodape()}
		<button
			type="button"
			onclick={() => (bandejaDemo = false)}
			class="btn min-h-11 motion-tap btn-plain">Cancelar</button
		>
		<button type="button" class="btn min-h-11 motion-tap btn-primary font-bold">Criar módulo</button
		>
	{/snippet}
</Bandeja>
