<script lang="ts">
	// A PRÉVIA DO ALUNO: a atividade na tela do Player, do jeito que o aluno a
	// recebe — direto na primeira questão (sem nome, sem código, sem conta) e, no
	// fim, o resultado. Pedido do dono do repositório: "Pré-visualizar" era uma
	// lista de cartões que não respondia, e não mostrava a experiência de verdade.
	//
	// A casca é a de `a/[slug]/+layout.svelte` e o miolo é o da `a/[slug]/q/[n]`:
	// o mesmo cabeçalho, as mesmas colunas no desktop, o mesmo rodapé, o teclado do
	// idioma encaixado, os mesmos componentes de interação e de veredito. Quem
	// corrige é o servidor, pelo mesmo kernel (`previa.remote.ts`, `previa/fala`),
	// e NADA é gravado. Em cima do cartão, uma faixa diz isso e tem o X de sair.
	//
	// A troca de questão é estado da página, não rota: o loader já trouxe todas.
	// `+page@.svelte` reseta para o layout raiz (sem barra lateral do Studio).
	import { tick, untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { DURACAO } from '$lib/movimento';
	import { viewport } from '$lib/client/viewport.svelte';
	import { som } from '$lib/client/sons.svelte';
	import AmbientShapes from '$lib/components/AmbientShapes.svelte';
	import AnswerFeedback from '$lib/components/interactions/AnswerFeedback.svelte';
	import AudioPlayer from '$lib/components/AudioPlayer.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import Loading from '$lib/components/Loading.svelte';
	import TecladoVirtual from '$lib/components/TecladoVirtual.svelte';
	import VolumeControl from '$lib/components/VolumeControl.svelte';
	import { CampoComTeclado } from '$lib/components/campo-com-teclado.svelte';
	import AssembleInteraction from '$lib/components/interactions/AssembleInteraction.svelte';
	import ChoiceInteraction from '$lib/components/interactions/ChoiceInteraction.svelte';
	import ClozeInteraction from '$lib/components/interactions/ClozeInteraction.svelte';
	import MatchInteraction from '$lib/components/interactions/MatchInteraction.svelte';
	import OrderInteraction from '$lib/components/interactions/OrderInteraction.svelte';
	import SelectInteraction from '$lib/components/interactions/SelectInteraction.svelte';
	import SpeakInteraction from '$lib/components/interactions/SpeakInteraction.svelte';
	import WritingInteraction from '$lib/components/interactions/WritingInteraction.svelte';
	import type { WritingRuntimeItem } from '$lib/components/interactions/types';
	import ResultadoDaPrevia from './ResultadoDaPrevia.svelte';
	import { RespostaDaPrevia, type QuestaoDaPrevia } from './resposta.svelte';

	interface DadosDaPrevia {
		activity: { id: string; title: string; dir: 'ltr' | 'rtl' };
		rascunho: boolean;
		quem: { nome: string; avatar: string | null };
		/** Para onde o X volta — token de lista fechada, nunca uma URL. */
		voltarPara: 'detalhe' | 'publicar';
		questoes: QuestaoDaPrevia[];
	}
	let { data }: { data: DadosDaPrevia } = $props();

	const respostas = untrack(() =>
		data.questoes.map((q) => new RespostaDaPrevia(q, data.activity.id))
	);
	const total = respostas.length;

	let etapa = $state<'questao' | 'fim'>('questao');
	let indice = $state(0);
	const atual = $derived(respostas[indice] ?? null);
	const item = $derived(atual?.questao.item ?? null);
	const ultima = $derived(indice >= total - 1);
	let comecouEm = $state(0);
	let terminouEm = $state(0);

	// O volume guardado é lido uma vez, na montagem; e o relógio da primeira
	// questão começa quando ela aparece.
	$effect(() => {
		untrack(() => {
			som.sincronizar();
			comecouEm = Date.now();
			respostas[0]?.entrar();
		});
	});

	/**
	 * A prévia é uma tela FECHADA sobre de onde veio: o X (ou Esc) volta para lá.
	 * Os dois destinos são literais — `resolve()` exige literal no call site, e a
	 * lista fechada é o que impede um `?voltar=` virar redirecionamento aberto.
	 */
	const fechar = $derived(
		data.voltarPara === 'detalhe'
			? resolve('/(studio)/atividades/[id]', { id: data.activity.id })
			: resolve('/(studio)/atividades/[id]/publicar', { id: data.activity.id })
	);

	// ── o teclado do idioma, encaixado acima do rodapé, como no Player ──
	const campo = new CampoComTeclado();
	let tecladoAberto = $state(false);
	const gradeNaTela = $derived(
		item &&
			(item.interaction === 'type' || item.interaction === 'cloze') &&
			item.teclado?.formato === 'grade'
			? item.teclado
			: null
	);
	async function abrirTeclado() {
		tecladoAberto = true;
		await tick();
		const el = campo.elemento;
		if (!el) return;
		if (document.activeElement === el) el.blur();
		el.focus({ preventScroll: true });
		el.scrollIntoView({ block: 'nearest', behavior: semMovimento() ? 'auto' : 'smooth' });
	}
	function aoOcultarTeclado() {
		campo.elemento?.blur();
	}

	// ── a troca de questão: a atual sai, a próxima entra ──
	let saindo = $state(false);
	let area = $state<HTMLElement>();
	const semMovimento = () =>
		typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
	const ocupado = $derived(saindo || (atual?.verificando ?? false));

	async function sairDaAtual() {
		if (!semMovimento()) {
			saindo = true;
			await new Promise((r) => setTimeout(r, DURACAO.curta));
		}
		// Gravando ao sair, a captura para: o microfone não fica aceso numa
		// questão que já não está na tela.
		const g = atual?.gravacao;
		if (g && (g.estado === 'gravando' || g.estado === 'abrindo')) g.descartar();
		atual?.sair();
	}

	async function irPara(i: number) {
		if (saindo) return;
		await sairDaAtual();
		indice = i;
		tecladoAberto = false;
		saindo = false;
		respostas[i]?.entrar();
		await tick();
		area?.focus({ preventScroll: true });
		area?.scrollTo({ top: 0 });
	}

	async function avancar() {
		if (!atual || saindo) return;
		if (!ultima) {
			await irPara(indice + 1);
			return;
		}
		await sairDaAtual();
		terminouEm = Date.now();
		saindo = false;
		etapa = 'fim';
		som.preparar('finish');
		som.tocar('finish');
	}

	async function voltar() {
		if (indice <= 0 || ocupado) return;
		await irPara(indice - 1);
	}

	async function pular() {
		if (!atual || ocupado) return;
		atual.pular();
		await avancar();
	}

	async function verificar(e: SubmitEvent) {
		e.preventDefault();
		if (!atual || ocupado || atual.respondida) return;
		if (ultima) som.preparar('finish');
		await atual.verificar();
		// Escrita por rubrica não tem veredito para ler: segue direto, como no Player.
		if (atual.enviada) await avancar();
	}

	function refazer() {
		for (const r of respostas) r.zerar();
		indice = 0;
		tecladoAberto = false;
		etapa = 'questao';
		comecouEm = Date.now();
		respostas[0]?.entrar();
		void tick().then(() => area?.focus({ preventScroll: true }));
	}

	function digitando(alvo: EventTarget | null): boolean {
		return (
			alvo instanceof HTMLInputElement ||
			alvo instanceof HTMLTextAreaElement ||
			(alvo instanceof HTMLElement && alvo.isContentEditable)
		);
	}

	// Os atalhos do Player no desktop (Enter verifica e continua, os números
	// escolhem) e o Esc da prévia, que fecha — menos digitando, onde Esc é do campo.
	function aoTeclar(e: KeyboardEvent) {
		if (e.key === 'Escape' && !digitando(e.target)) {
			void goto(fechar);
			return;
		}
		if (etapa !== 'questao' || !atual || !item || ocupado || !viewport.desktop) return;
		if (digitando(e.target) && e.key !== 'Enter') return;
		if (e.key === 'Enter' && atual.respondida) {
			e.preventDefault();
			void avancar();
			return;
		}
		if (e.key === ' ' && item.audio) {
			e.preventDefault();
			atual.plays++;
		}
		if (item.interaction === 'choice' && /^[1-9]$/.test(e.key)) {
			atual.escolha = item.options[Number(e.key) - 1]?.id ?? atual.escolha;
		}
		if (e.key === 'Enter' && atual.pronta && !(e.target instanceof HTMLTextAreaElement)) {
			e.preventDefault();
			void verificar(new SubmitEvent('submit'));
		}
	}

	const deslocamento = $derived(item?.dir === 'rtl' ? '-22px' : '22px');
	const movimento = $derived(saindo ? 'q-out' : 'q-in');

	const kbd =
		'rounded-md border border-line border-b-2 bg-base-200 px-2 py-1 font-mono text-[11.5px] font-medium text-base-content';

	// Ícone da habilidade, o mesmo do Player — sempre com o rótulo ao lado.
	const SKILL_ICON: Record<string, string> = {
		listening:
			'M4 12.5V11a8 8 0 1116 0v1.5M2.5 14.5a2 2 0 012-2h2.5v7H4.5a2 2 0 01-2-2zM21.5 14.5a2 2 0 00-2-2H17v7h2.5a2 2 0 002-2z',
		speaking: 'M9 5.5a3 3 0 016 0v6a3 3 0 01-6 0zM5.5 11.5a6.5 6.5 0 0013 0M12 18v3.5',
		reading:
			'M3 5.5h6a3 3 0 013 3v10a2.5 2.5 0 00-2.5-2.5H3zM21 5.5h-6a3 3 0 00-3 3v10a2.5 2.5 0 012.5-2.5H21z',
		writing: 'M4 20h4l11-11a2.83 2.83 0 10-4-4L4 16z'
	};
	const seta = 'M5 12h13M13 6l6 6-6 6';
</script>

<svelte:head>
	<title>Prévia · {data.activity.title} · Spokke</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<svelte:window onkeydown={aoTeclar} />

<div class="flex h-dvh flex-col overflow-hidden bg-base-100 lg:bg-base-200">
	<!-- A faixa da prévia fica FORA do cartão do Player: o que está dentro dele é o
	     que o aluno vê, e o que está fora é do professor — sair, e saber que nada
	     do que ele responder aqui fica salvo. -->
	<div
		class="flex shrink-0 items-center gap-3 border-b border-line bg-base-200 px-4 py-2 lg:border-0 lg:px-8 lg:pt-4 lg:pb-3"
	>
		<a
			href={fechar}
			class="grid size-9 shrink-0 place-items-center rounded-full bg-base-100 text-base-content no-underline transition-[background,transform,translate,scale] hover:bg-base-300 active:scale-90"
			aria-label="Fechar a prévia"
			title="Fechar (Esc)"
		>
			<svg class="size-[17px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
				<path
					d="M6 6l12 12M18 6L6 18"
					stroke="currentColor"
					stroke-width="2.2"
					stroke-linecap="round"
				/>
			</svg>
		</a>
		<p class="min-w-0 flex-1 truncate text-[13px]">
			<strong class="font-bold">Prévia do aluno</strong>
			<span class="text-base-content/65">· nada do que você responder fica salvo</span>
		</p>
		<!-- Qual versão está na tela: com rascunho, é ele (o que vai ao ar ao
		     publicar); sem rascunho, a que já está no ar. -->
		<span
			class="hidden shrink-0 rounded-full border border-line px-2.5 py-1 text-xs font-bold whitespace-nowrap text-base-content/65 sm:inline"
		>
			{data.rascunho ? 'rascunho' : 'versão no ar'}
		</span>
	</div>

	<div
		class="mx-auto flex min-h-0 w-full flex-1 flex-col overflow-hidden lg:mb-8 lg:max-w-[1100px] lg:rounded-[20px]
		       lg:border lg:border-line lg:bg-base-100 lg:shadow-[0_24px_56px_-40px_rgb(var(--shadow)/0.4)]"
	>
		{#if etapa === 'fim'}
			<ResultadoDaPrevia
				{respostas}
				titulo={data.activity.title}
				dir={data.activity.dir}
				quem={data.quem}
				msTotal={terminouEm - comecouEm}
				activityId={data.activity.id}
				voltarPara={data.voltarPara}
				onrefazer={refazer}
			/>
		{:else if atual}
			<header
				class="flex items-center gap-3 px-4 pt-4 pb-3 lg:gap-[18px] lg:border-b lg:border-line lg:px-10 lg:py-4"
			>
				{#if indice > 0}
					<button
						type="button"
						onclick={voltar}
						disabled={ocupado}
						class="grid size-10 shrink-0 place-items-center rounded-full bg-base-200 text-base-content no-underline
						       transition-[background,transform,translate,scale] duration-150 hover:-translate-x-0.5 hover:bg-base-300 active:scale-90
						       lg:size-auto lg:gap-2 lg:rounded-field lg:px-3 lg:py-2.5 lg:text-[13.5px] lg:font-semibold"
						aria-label="Questão anterior"
					>
						<svg class="size-[17px] lg:size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<path
								d="M15 5l-7 7 7 7"
								stroke="currentColor"
								stroke-width="2.2"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						</svg>
						<span class="hidden lg:inline">Anterior</span>
					</button>
				{:else}
					<span class="size-10 shrink-0 lg:hidden"></span>
				{/if}

				<div class="h-[9px] flex-1 overflow-hidden rounded-full bg-base-300 lg:max-w-[480px]">
					<div
						class="h-full origin-left rounded-full bg-primary transition-transform duration-500"
						style="transform: scaleX({(indice + 1) / total})"
					></div>
				</div>
				<span class="font-mono text-xs text-base-content/60 lg:text-[12.5px]">
					{indice + 1}<span class="lg:hidden">/</span><span class="hidden lg:inline"
						>&nbsp;de&nbsp;</span
					>{total}
				</span>

				<VolumeControl class="lg:order-last" />

				<div class="hidden flex-1 lg:block"></div>
				<span class="hidden min-w-0 truncate text-[12.5px] text-base-content/65 lg:inline"
					>{data.activity.title}</span
				>
				<span class="hidden h-5 w-px shrink-0 bg-line lg:block"></span>
				<span
					class="hidden items-center gap-2 text-[12.5px] whitespace-nowrap text-base-content/65 lg:flex"
				>
					<Avatar codigo={data.quem.avatar} nome={data.quem.nome} size={26} radius="rounded-full" />
					{data.quem.nome}
				</span>
			</header>

			<form onsubmit={verificar} class="flex min-h-0 flex-1 flex-col">
				<!-- É ESTE o container que rola, com `safe center` (design-system.md
				     "Dois contextos"): o mesmo da `/q/[n]`. -->
				<div
					bind:this={area}
					tabindex="-1"
					class="relative flex min-h-0 flex-1 flex-col gap-0 overflow-y-auto px-5 py-[18px] outline-none
					       lg:grid lg:grid-cols-2 lg:[align-content:safe_center] lg:items-center lg:gap-14 lg:px-16
					       {gradeNaTela && tecladoAberto ? 'lg:py-6' : 'lg:py-13'}"
				>
					<AmbientShapes edges="both" />

					{#key indice}
						<div class="relative z-1 min-w-0 {movimento}" style="--q-shift: {deslocamento}">
							{#if item}
								<p
									class="mb-3 flex items-center gap-[9px] text-[11.5px] font-bold tracking-[0.08em] uppercase lg:mb-[15px] lg:text-xs
								       {item.skill === 'listening' || item.skill === 'speaking' ? 'text-accent' : 'text-primary'}"
								>
									<svg
										class="size-[17px] shrink-0"
										viewBox="0 0 24 24"
										fill="none"
										aria-hidden="true"
									>
										<path
											d={SKILL_ICON[item.skill] ?? SKILL_ICON.reading}
											stroke="currentColor"
											stroke-width="2"
											stroke-linecap="round"
											stroke-linejoin="round"
										/>
									</svg>
									{item.skillLabel}{item.gradingLabel ? ` · ${item.gradingLabel}` : ''}
								</p>
								<h1
									class="mb-3.5 font-display text-title font-semibold tracking-[-0.025em] text-pretty lg:mb-3.5"
								>
									{item.prompt}
								</h1>

								{#if item.hint}
									<p class="mb-7 hidden text-[15px] leading-[1.6] text-base-content/65 lg:block">
										{item.hint}
									</p>
								{/if}

								{#if item.audio}
									<div class="mb-[18px] lg:mt-7 lg:mb-0">
										<AudioPlayer
											src={item.audio}
											srcSlow={item.audioSlow}
											plays={atual.plays}
											onplay={() => atual && atual.plays++}
										/>
										{#if viewport.desktop}
											<p class="mt-5 flex items-center gap-2.5 text-[12.5px] text-base-content/65">
												<span class={kbd}>Espaço</span> tocar de novo
											</p>
										{/if}
									</div>
								{:else if item.skill === 'listening'}
									<!-- Só a prévia vê isto: com áudio faltando, o link nem abre para o
									     aluno (server.md "TTS"). -->
									<p
										class="mb-[18px] flex items-start gap-2.5 rounded-box border border-line bg-base-200 px-4 py-3 text-[13.5px] leading-snug text-base-content/70 lg:mt-7 lg:mb-0"
									>
										<svg
											class="mt-px size-4 shrink-0 text-accent"
											viewBox="0 0 24 24"
											fill="none"
											aria-hidden="true"
										>
											<path
												d="M12 7.5V12l3 2M12 20.5a8.5 8.5 0 100-17 8.5 8.5 0 000 17z"
												stroke="currentColor"
												stroke-width="2"
												stroke-linecap="round"
												stroke-linejoin="round"
											/>
										</svg>
										O áudio desta frase ainda está sendo gerado. O link só abre para o aluno quando todos
										os áudios estiverem prontos.
									</p>
								{/if}

								{#if item.passage}
									{#if item.interaction === 'assemble'}
										<p
											class="mb-2 text-[11px] font-bold tracking-[0.09em] text-base-content/65 uppercase"
										>
											Em {item.sourceLabel}
										</p>
									{/if}
									<div class="mb-5 rounded-box border border-line bg-base-200 p-4">
										<p
											dir={item.interaction === 'assemble' ? item.sourceDir : item.dir}
											class="font-content text-[17px] leading-[1.65]"
										>
											{item.passage}
										</p>
									</div>
								{/if}
							{:else}
								<!-- A questão cujos campos não formam um exercício: o aluno não a
								     receberia assim, e a publicação a recusa. -->
								<p
									class="mb-3 text-[11.5px] font-bold tracking-[0.08em] text-warning uppercase lg:mb-[15px] lg:text-xs"
								>
									Questão incompleta
								</p>
								<h1
									class="mb-3.5 font-display text-title font-semibold tracking-[-0.025em] text-pretty"
								>
									Esta questão não abre para o aluno
								</h1>
								<p class="text-[15px] leading-[1.6] text-base-content/65">
									Os campos dela não formam um exercício, e a publicação não deixa ela ir assim.
									Corrija no editor e veja de novo.
								</p>
							{/if}
						</div>
					{/key}

					{#key indice}
						<div
							class="relative z-1 flex min-w-0 flex-1 flex-col {movimento}"
							style="--q-shift: {deslocamento}"
						>
							{#if !item}
								<a
									href={resolve('/(studio)/atividades/[id]/itens/[itemId]', {
										id: data.activity.id,
										itemId: atual.questao.id
									})}
									class="btn btn-lg w-full motion-tap btn-outline font-bold no-underline lg:w-auto"
									>Abrir no editor</a
								>
							{:else if item.interaction === 'choice'}
								<ChoiceInteraction {item} bind:value={atual.escolha} desktop={viewport.desktop} />
								{#if viewport.desktop}
									<p class="mt-3.5 flex items-center gap-2.5 text-[12.5px] text-base-content/65">
										{#each item.options as opt, i (opt.id)}<span class={kbd}>{i + 1}</span>{/each} escolher
										pelo número
									</p>
								{/if}
							{:else if item.interaction === 'type' && item.gradedLater}
								<WritingInteraction
									item={{
										dir: item.dir,
										teclado: item.teclado,
										instructions: item.prompt,
										maxLength: 600
									} satisfies WritingRuntimeItem}
									bind:value={atual.texto}
									storageKey="spokke:previa:{data.activity.id}:{atual.questao.id}"
									{campo}
									bind:tecladoAberto
									tecladoNaTela
								/>
							{:else if item.interaction === 'type' || item.interaction === 'cloze'}
								<ClozeInteraction
									{item}
									bind:value={atual.texto}
									feedback={atual.feedback}
									{campo}
									bind:tecladoAberto
									tecladoNaTela
								/>
							{:else if item.interaction === 'assemble'}
								<AssembleInteraction {item} bind:chosen={atual.montagem} />
							{:else if item.interaction === 'select'}
								<SelectInteraction {item} bind:value={atual.selecao} />
							{:else if item.interaction === 'match'}
								<MatchInteraction
									{item}
									bind:pairs={atual.pares}
									leftLabel={item.targetLabel}
									rightLabel={item.sourceLabel}
									feedback={atual.feedback}
								/>
							{:else if item.interaction === 'order'}
								<OrderInteraction {item} bind:order={atual.ordem} />
							{:else if item.interaction === 'speak'}
								<SpeakInteraction
									{item}
									recording={atual.gravando}
									ontoggle={() => atual?.alternarGravacao()}
									estado={atual.gravacao.estado}
									segundos={atual.gravacao.segundos}
									maxSegundos={atual.gravacao.maxSegundos}
									ouvido={atual.ouvido}
									ouvindo={atual.ouvindo}
									erro={atual.erroDaFala}
									corrigida={atual.respondida}
								/>
							{/if}

							{#if atual.feedback && item}
								<AnswerFeedback
									state={atual.feedback.state}
									hint={atual.feedback.hint}
									marks={item.interaction === 'match' ? undefined : atual.feedback.marks}
									expected={item.interaction === 'match' ? undefined : atual.feedback.expected}
									heard={atual.feedback.heard}
									dir={item.dir}
								/>
							{/if}
							{#if atual.erro}
								<p
									class="mt-3 text-[13px] leading-snug font-semibold text-base-content/70"
									role="alert"
								>
									{atual.erro}
								</p>
							{/if}

							{#if atual.verificando}
								<div
									class="absolute inset-0 z-2 -m-2 flex flex-col items-center justify-center gap-3 rounded-box
								       bg-base-100/62 backdrop-blur-[1.5px]"
								>
									<Loading variant="traco" size={42} label="Verificando sua resposta" />
									<span class="text-[13px] font-semibold">Verificando sua resposta</span>
								</div>
							{/if}
						</div>
					{/key}
				</div>

				{#if gradeNaTela && !atual.respondida}
					<TecladoVirtual
						teclado={gradeNaTela}
						bind:aberto={tecladoAberto}
						docado
						desativado={ocupado}
						onocultar={aoOcultarTeclado}
						onacao={(acao) =>
							atual &&
							campo.aplicar(
								atual.texto,
								acao,
								(novo) => atual && (atual.texto = novo),
								item?.interaction === 'type' && item.gradedLater ? 600 : undefined
							)}
					/>
				{/if}

				<footer
					class="flex items-center gap-2.5 border-t border-line px-5 pt-3.5 pb-[22px] lg:gap-4 lg:px-16 lg:pt-5 lg:pb-[26px]"
				>
					{#if gradeNaTela && !atual.respondida && !tecladoAberto}
						<button
							type="button"
							onclick={abrirTeclado}
							aria-expanded="false"
							class="btn min-h-[52px] motion-tap btn-neutral font-semibold lg:px-[18px] lg:text-[15px]"
						>
							<svg class="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
								<rect
									x="2.5"
									y="6"
									width="19"
									height="12"
									rx="3"
									stroke="currentColor"
									stroke-width="2"
								/>
								<path d="M8 14h8" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
							</svg>
							Teclado
						</button>
					{/if}
					{#if item?.skippable && !atual.respondida}
						<button
							type="button"
							onclick={pular}
							class="btn min-h-[52px] motion-tap btn-neutral font-semibold lg:px-[18px] lg:text-[15px]"
						>
							<svg class="size-4 lg:hidden" viewBox="0 0 24 24" fill="none" aria-hidden="true">
								<path
									d="M10 7.5h7.5a4.5 4.5 0 010 9H10M14 3.5l-4 4 4 4"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
								/>
							</svg>
							<span class="lg:hidden">Pular</span>
							<span class="hidden lg:inline">Pular esta questão</span>
						</button>
					{/if}
					<div class="hidden flex-1 lg:block"></div>
					{#if viewport.desktop && item}
						<span class="hidden items-center gap-2.5 text-[12.5px] text-base-content/65 lg:flex">
							<span class={kbd}>Enter</span>
							{atual.respondida ? 'continuar' : 'verificar'}
						</span>
					{/if}
					{#if !item}
						<button
							type="button"
							onclick={pular}
							disabled={ocupado}
							class="btn btn-lg min-h-[52px] flex-1 motion-tap gap-2.5 btn-primary text-[17px] font-bold lg:flex-none lg:px-[30px]"
						>
							{ultima ? 'Ver o resultado' : 'Próxima questão'}
						</button>
					{:else}
						<button
							type={atual.respondida ? 'button' : 'submit'}
							onclick={atual.respondida ? avancar : undefined}
							disabled={atual.respondida ? ocupado : !atual.pronta || ocupado}
							class="btn btn-lg min-h-[52px] flex-1 motion-tap gap-2.5 btn-primary text-[17px] font-bold lg:flex-none lg:px-[30px]"
						>
							{#if atual.respondida && !ocupado}
								{ultima ? 'Ver o resultado' : 'Próxima questão'}
								<svg
									class="hidden size-[18px] animate-[en-nudge_2.4s_ease-in-out_infinite] lg:block"
									viewBox="0 0 24 24"
									fill="none"
									aria-hidden="true"
								>
									<path
										d={seta}
										stroke="currentColor"
										stroke-width="2.2"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
								</svg>
							{:else if ocupado}
								<Loading variant="fila" size={13} tone="current" label="Verificando" />
								{atual.verificando ? 'Verificando…' : 'Só um instante…'}
							{:else}
								{item.gradedLater ? 'Enviar' : 'Verificar'}
								<svg
									class="hidden size-[18px] animate-[en-nudge_2.4s_ease-in-out_infinite] lg:block"
									viewBox="0 0 24 24"
									fill="none"
									aria-hidden="true"
								>
									<path
										d={seta}
										stroke="currentColor"
										stroke-width="2.2"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
								</svg>
							{/if}
						</button>
					{/if}
				</footer>
			</form>
		{:else}
			<main
				class="relative flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-8 lg:grid lg:place-items-center"
			>
				<AmbientShapes edges="both" />
				<div class="relative z-1 mx-auto w-full max-w-[34rem] text-center">
					<h1 class="mb-3 font-display text-title font-semibold tracking-[-0.025em]">
						Nenhuma questão para ver ainda
					</h1>
					<p class="mb-6 text-[15px] leading-relaxed text-base-content/65">
						Volte para a revisão e gere as questões da atividade.
					</p>
					<a
						href={resolve('/(studio)/atividades/[id]/revisar', { id: data.activity.id })}
						class="btn btn-lg motion-tap btn-primary font-bold no-underline">Ir para a revisão</a
					>
				</div>
			</main>
		{/if}
	</div>
</div>
