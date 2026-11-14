<script lang="ts">
	// Etapa 3 — a REVISÃO, no desenho do Claude Design: à esquerda um palco com o
	// celular (as medidas do celular da home) mostrando a questão escolhida como
	// o aluno a vê; à direita o ROTEIRO do aluno, as questões na ordem em que ele
	// responde — arrastar muda a sequência — e, embaixo, as que ficaram de fora
	// pela quantidade pedida. A linha escolhida abre a resposta (só o professor
	// vê), mover, editar e aceitar ou descartar. `+page@.svelte` reseta para o
	// layout raiz.
	//
	// Enquanto a geração anda no servidor (`gerarItens` só a começa), a tela
	// mostra o "Gerando" com cada passo, e o editor de questão abre em modal
	// (`?questao=<id>` abre direto nele).
	import { resolve } from '$app/paths';
	import { invalidateAll, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { untrack } from 'svelte';
	import { flip } from 'svelte/animate';
	import { dragHandle, dragHandleZone, type DndEvent } from 'svelte-dnd-action';
	import WizardShell from '$lib/components/WizardShell.svelte';
	import Loading from '$lib/components/Loading.svelte';
	import AmbientShapes from '$lib/components/AmbientShapes.svelte';
	import CelularDoAluno from '$lib/components/CelularDoAluno.svelte';
	import {
		ICONE_DO_CELULAR,
		SETA_SOB_O_CELULAR,
		VER_NO_CELULAR,
		rolarAtePalco
	} from '$lib/components/celular-do-aluno';
	import PreviaDaQuestao from '$lib/components/PreviaDaQuestao.svelte';
	import { textoDoPasso, type ProgressoDaGeracao } from '$lib/atividades/geracao';
	import {
		ICONE_DA_HABILIDADE,
		ROTULO_DA_HABILIDADE,
		type HabilidadeDaResumida
	} from '$lib/atividades/questao-resumida';
	import EditorDeQuestao from './EditorDeQuestao.svelte';
	import { KERNEL_TO_KIND, PILL_TONE, tipoDe } from '$lib/components/material-form';
	import {
		aceitarTodosItens,
		descartarItem,
		gerarItens,
		corrigirNaRevisao,
		progressoDaGeracao,
		reordenarQuestoes
	} from '../../atividades.remote';
	import type { ClozeFeedback, RuntimeDaQuestao } from '$lib/components/interactions/types';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	type Questao = (typeof data.questoes)[number];

	const ICONE = ICONE_DA_HABILIDADE;
	const HABILIDADES: HabilidadeDaResumida[] = ['escuta', 'fala', 'leitura', 'escrita'];

	// ── o roteiro ───────────────────────────────────────────────────────────
	// As de dentro na ordem do roteiro (a lista que se arrasta: um $derived que
	// aceita escrita, e volta ao que o servidor diz a cada recarga) e as de fora.
	let roteiro = $derived(data.questoes.filter((q) => q.dentro));
	const fora = $derived(data.questoes.filter((q) => !q.dentro));
	const total = $derived(data.questoes.length);
	const cheia = $derived(roteiro.length >= data.maxItens);
	const navegacao = $derived([...roteiro, ...fora]);

	let erro = $state<string | null>(null);

	// ── a questão escolhida (o celular) ─────────────────────────────────────
	let escolhidaId = $state<string | null>(
		untrack(() => page.url.searchParams.get('questao') ?? data.questoes[0]?.id ?? null)
	);
	const escolhida = $derived(navegacao.find((q) => q.id === escolhidaId) ?? navegacao[0] ?? null);
	const posicaoNoRoteiro = (q: Questao) => roteiro.findIndex((r) => r.id === q.id) + 1;
	// A questão NOVA entra no fim do roteiro, antes do associar que fecha quando ele
	// é a última — e o celular do editor já mostra esse lugar, não "fora".
	const posicaoDaNova = $derived(roteiro.at(-1)?.fecho ? roteiro.length : roteiro.length + 1);
	// ── responder no palco ──────────────────────────────────────────────────
	// A questão do celular RESPONDE: o "Verificar" manda a resposta ao servidor,
	// que corrige pelo mesmo kernel e com a mesma seed do runtime do palco
	// (`corrigirNaRevisao`). Nada é gravado. Trocar de questão zera tudo.
	let previaDoPalco = $state<PreviaDaQuestao | null>(null);
	let veredito = $state<ClozeFeedback | null>(null);
	let verificando = $state(false);
	let rodada = $state(0);
	let avisoDaCorrecao = $state<string | null>(null);
	const idEscolhida = $derived(escolhida?.id ?? null);
	$effect(() => {
		void idEscolhida;
		untrack(() => {
			veredito = null;
			avisoDaCorrecao = null;
		});
	});
	/** Fala e escrita livre não se corrigem aqui: uma pede o microfone, a outra é sua. */
	const respondivel = (rt: RuntimeDaQuestao) => rt.interaction !== 'speak' && !rt.gradedLater;
	async function verificar() {
		if (!escolhida) return;
		const resposta = previaDoPalco?.resposta();
		if (!resposta) {
			avisoDaCorrecao = 'Responda a questão antes de verificar.';
			return;
		}
		verificando = true;
		avisoDaCorrecao = null;
		try {
			const r = await corrigirNaRevisao({
				activityId: data.activity.id,
				itemId: escolhida.id,
				resposta
			});
			if (r.ok) veredito = r.veredito;
			else avisoDaCorrecao = r.erro;
		} catch {
			avisoDaCorrecao = 'Não deu para corrigir agora. Tente de novo.';
		} finally {
			verificando = false;
		}
	}
	function tentarDeNovo() {
		veredito = null;
		avisoDaCorrecao = null;
		rodada++;
	}

	function andar(passo: number) {
		if (!escolhida || navegacao.length === 0) return;
		const i = navegacao.findIndex((q) => q.id === escolhida.id);
		escolhidaId = navegacao[(i + passo + navegacao.length) % navegacao.length]?.id ?? null;
	}
	/** O palco, para o "Ver no celular" da linha escolhida (no celular ele fica acima da lista). */
	let palco = $state<HTMLElement>();
	const verNoCelular = () => rolarAtePalco(palco);

	// ── arrastar ────────────────────────────────────────────────────────────
	// `svelte-dnd-action`, pela alça: tem teclado (espaço pega, setas movem) e o
	// toque do celular. As setas da linha escolhida fazem o mesmo, visíveis. As
	// outras linhas abrem espaço deslizando (`flip`, só `transform`), e sem
	// movimento quando o sistema pede (a Web Animations API não lê o app.css).
	const DESLIZE =
		typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
			? 0
			: 220;
	function aoConsiderar(e: CustomEvent<DndEvent<Questao>>) {
		roteiro = e.detail.items;
	}
	async function aoSoltar(e: CustomEvent<DndEvent<Questao>>) {
		roteiro = e.detail.items;
		await salvarOrdem();
	}
	async function mover(id: string, passo: number) {
		const i = roteiro.findIndex((q) => q.id === id);
		const j = i + passo;
		if (i < 0 || j < 0 || j >= roteiro.length) return;
		const copia = [...roteiro];
		[copia[i], copia[j]] = [copia[j] as Questao, copia[i] as Questao];
		roteiro = copia;
		await salvarOrdem();
	}
	async function salvarOrdem() {
		erro = null;
		try {
			const r = await reordenarQuestoes({
				activityId: data.activity.id,
				ordem: roteiro.map((q) => q.id)
			});
			if (!r.ok) erro = r.error;
		} catch {
			erro = 'Não deu para salvar a nova ordem. Tente de novo.';
		}
		await invalidateAll();
	}

	// ── aceitar e descartar ─────────────────────────────────────────────────
	// Descartar MARCA a questão do rascunho; ela continua lá para voltar na
	// mesma tela, e só some na publicação. O pendente é um id, nunca um booleano.
	let marcandoId = $state<string | null>(null);
	async function marcar(itemId: string, descartado: boolean): Promise<string | null> {
		marcandoId = itemId;
		erro = null;
		try {
			const r = await descartarItem({ activityId: data.activity.id, itemId, descartado });
			if ('error' in r && r.error) {
				erro = r.error;
				return r.error;
			}
			await invalidateAll();
			return null;
		} finally {
			marcandoId = null;
		}
	}
	let aceitando = $state(false);
	async function aceitarTodas() {
		aceitando = true;
		erro = null;
		try {
			const r = await aceitarTodosItens({ activityId: data.activity.id });
			if (!r.ok) erro = r.error;
			await invalidateAll();
		} finally {
			aceitando = false;
		}
	}

	// ── a geração ───────────────────────────────────────────────────────────
	let progresso = $state.raw<ProgressoDaGeracao | null>(untrack(() => data.geracao));
	let acompanhando = $state(untrack(() => data.geracao?.estado === 'andando'));
	const consulta = progressoDaGeracao({ activityId: untrack(() => data.activity.id) });

	// Pergunta o andamento enquanto a geração anda — uma pergunta por vez.
	$effect(() => {
		if (!acompanhando) return;
		let parado = false;
		const rodar = async () => {
			while (!parado) {
				await new Promise((r) => setTimeout(r, 700));
				if (parado) return;
				try {
					await consulta.refresh();
				} catch {
					continue;
				}
				const atual = consulta.current;
				if (!atual || parado) continue;
				progresso = atual;
				if (atual.estado !== 'andando') {
					acompanhando = false;
					if (atual.estado === 'pronta') await invalidateAll();
				}
			}
		};
		void rodar();
		return () => {
			parado = true;
		};
	});
	const gerandoAgora = $derived(acompanhando || progresso?.estado === 'andando');
	const falhou = $derived(progresso?.estado === 'falhou' ? (progresso.erro ?? null) : null);

	let regenerando = $state(false);
	async function regerar() {
		regenerando = true;
		erro = null;
		try {
			const r = await gerarItens({ activityId: data.activity.id });
			if (!r.ok) {
				erro = r.error;
				return;
			}
			progresso = { estado: 'andando', passos: [{ id: 'lendo', estado: 'andando' }] };
			acompanhando = true;
		} catch {
			erro = 'Não deu para começar a geração agora. Tente de novo.';
		} finally {
			regenerando = false;
		}
	}

	// ── o editor ────────────────────────────────────────────────────────────
	let editor = $state<{ itemId: string | null } | null>(
		untrack(() => {
			const id = page.url.searchParams.get('questao');
			return id ? { itemId: id } : null;
		})
	);
	function abrirEditor(itemId: string | null) {
		editor = { itemId };
	}
	function fecharEditor() {
		editor = null;
		// O `?questao=` de quem chegou pelo link do detalhe sai da barra: recarregar
		// não reabre o editor de uma questão que ele já fechou.
		if (page.url.searchParams.has('questao')) {
			replaceState(
				resolve('/(studio)/atividades/[id]/revisar', { id: data.activity.id }),
				page.state
			);
		}
	}
	const aberta = $derived(
		editor?.itemId ? data.questoes.find((q) => q.id === editor?.itemId) : undefined
	);
	const proximaAberta = $derived.by(() => {
		if (!editor?.itemId) return null;
		const i = navegacao.findIndex((q) => q.id === editor?.itemId);
		return i >= 0 ? (navegacao[i + 1]?.id ?? null) : null;
	});
	async function aoSalvar(itemId: string, irPara: string | null) {
		await invalidateAll();
		escolhidaId = irPara ?? itemId;
		if (irPara) editor = { itemId: irPara };
		else fecharEditor();
	}

	const materiaisHref = $derived(
		resolve('/(studio)/atividades/[id]/materiais', { id: data.activity.id })
	);
	const palavra = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
	const contagem = $derived(
		HABILIDADES.map((h) => ({ h, n: roteiro.filter((q) => q.habilidade === h).length })).filter(
			(c) => c.n > 0
		)
	);
	const statusTexto = $derived(
		gerandoAgora ? 'Gerando as questões' : `${roteiro.length} de ${total} aceitas`
	);
	const hintTexto = $derived(
		erro ??
			(gerandoAgora
				? 'Continuar fica liberado quando a geração terminar.'
				: roteiro.length === 0
					? 'Aceite ao menos uma questão para continuar.'
					: `${palavra(roteiro.length, 'questão entrará', 'questões entrarão')} na atividade.`)
	);
</script>

<svelte:head><title>Revisar questões · {data.activity.title} · Spokke</title></svelte:head>

{#snippet icone(d: string, classe = 'size-4')}
	<svg class="{classe} flex-none" viewBox="0 0 24 24" fill="none" aria-hidden="true">
		<path
			{d}
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
		/>
	</svg>
{/snippet}

<!-- Uma linha do roteiro (ou das de fora). A escolhida abre a resposta e as ações. -->
{#snippet linha(q: Questao, posicao: number | null)}
	{@const ativa = escolhida?.id === q.id}
	<div class="flex items-stretch">
		{#if posicao}
			<span
				use:dragHandle
				aria-label="Arrastar a questão {posicao} para mudar a ordem"
				title="Arraste para mudar a ordem"
				class="grid w-[26px] shrink-0 cursor-grab place-items-center rounded-lg text-base-content/55 active:cursor-grabbing"
			>
				<svg class="h-4 w-3" viewBox="0 0 12 16" fill="currentColor" aria-hidden="true">
					<circle cx="3" cy="3" r="1.5" /><circle cx="9" cy="3" r="1.5" /><circle
						cx="3"
						cy="8"
						r="1.5"
					/><circle cx="9" cy="8" r="1.5" /><circle cx="3" cy="13" r="1.5" /><circle
						cx="9"
						cy="13"
						r="1.5"
					/>
				</svg>
			</span>
		{:else}
			<span class="w-[26px] shrink-0" aria-hidden="true"></span>
		{/if}
		<button
			type="button"
			onclick={() => (escolhidaId = q.id)}
			aria-pressed={ativa}
			class="flex min-h-[54px] min-w-0 flex-1 items-center gap-[11px] rounded-xl py-1.5 ps-1 pe-3 text-start transition-colors duration-200 hover:bg-primary/8"
		>
			<span
				class="grid size-[34px] shrink-0 place-items-center rounded-full
				       {ativa
					? 'bg-primary text-primary-content'
					: q.dentro
						? 'bg-base-300 text-primary ring-[3px] ring-base-100'
						: 'border-[1.5px] border-dashed border-base-content/35 bg-base-100 text-base-content/65'}"
			>
				{@render icone(ICONE[q.habilidade])}
			</span>
			<span class="min-w-5 shrink-0 font-mono text-[12px] text-base-content/65"
				>{posicao ?? ''}</span
			>
			<span class="min-w-0 flex-1">
				<span
					class="block truncate text-[14px] font-semibold {q.dentro ? '' : 'text-base-content/65'}"
					>{q.titulo}</span
				>
				<span class="mt-[3px] flex min-w-0 items-center gap-[7px]">
					<!-- A etiqueta na cor do TIPO do material, a mesma da lista de materiais. -->
					<span
						class="shrink-0 rounded-full px-[7px] py-0.5 text-[10px] font-bold tracking-[0.05em] whitespace-nowrap uppercase {q
							.material?.kind
							? PILL_TONE[tipoDe(KERNEL_TO_KIND[q.material.kind]).tone]
							: 'bg-base-300 text-base-content/65'}">{q.material?.tipo ?? 'criada por você'}</span
					>
					{#if q.material?.trecho}
						<span
							class="min-w-0 truncate font-content text-[12px] text-base-content/65"
							dir={data.activity.dir}>{q.material.trecho}</span
						>
					{/if}
				</span>
			</span>
			<span
				class="hidden shrink-0 text-[12px] font-semibold whitespace-nowrap text-base-content/65 sm:inline"
				>{ROTULO_DA_HABILIDADE[q.habilidade]}</span
			>
			{#if q.dentro}
				<svg
					class="size-4 shrink-0 text-primary"
					viewBox="0 0 24 24"
					fill="none"
					role="img"
					aria-label="aceita"
				>
					<path
						d="M4 12.5l5 5L20 6.5"
						stroke="currentColor"
						stroke-width="2.6"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
			{:else}
				<span class="shrink-0 text-[12px] font-semibold text-base-content/65">de fora</span>
			{/if}
		</button>
	</div>
	{#if ativa}
		<!-- No celular o painel começa depois da bolha (64px): a 10px da borda, o
		     fio do roteiro, que passa por trás da linha escolhida, cortava a
		     palavra "Resposta". -->
		<div class="flex flex-wrap items-center gap-2 px-2.5 ps-16 pt-0.5 pb-2.5 lg:ps-[106px]">
			<span class="flex min-w-0 flex-[1_1_200px] items-center gap-[7px] text-[12.5px]">
				<svg
					class="size-3.5 shrink-0 text-warning"
					viewBox="0 0 24 24"
					fill="none"
					aria-hidden="true"
				>
					<rect
						x="4"
						y="10.5"
						width="16"
						height="10"
						rx="2.5"
						stroke="currentColor"
						stroke-width="2"
					/>
					<path
						d="M8 10.5V7.5a4 4 0 118 0v3"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
					/>
				</svg>
				<span class="shrink-0">Resposta</span>
				<span class="min-w-0 truncate font-content font-semibold" dir="auto">{q.resposta}</span>
			</span>
			{#if posicao}
				<!-- As duas setas quebram JUNTAS: soltas, no celular a de subir ficava
				     ao lado da resposta e a de descer ia para a linha de baixo. -->
				<span class="flex shrink-0 gap-2">
					<button
						type="button"
						onclick={() => mover(q.id, -1)}
						disabled={posicao === 1}
						aria-label="Mover para cima"
						class="grid size-10 shrink-0 place-items-center rounded-[9px] border border-line bg-base-100 transition-colors hover:border-primary disabled:cursor-not-allowed disabled:opacity-45"
					>
						{@render icone('M12 19V5M6 11l6-6 6 6', 'size-[15px]')}
					</button>
					<button
						type="button"
						onclick={() => mover(q.id, 1)}
						disabled={posicao === roteiro.length}
						aria-label="Mover para baixo"
						class="grid size-10 shrink-0 place-items-center rounded-[9px] border border-line bg-base-100 transition-colors hover:border-primary disabled:cursor-not-allowed disabled:opacity-45"
					>
						{@render icone('M12 5v14M6 13l6 6 6-6', 'size-[15px]')}
					</button>
				</span>
			{/if}
			<button
				type="button"
				onclick={() => abrirEditor(q.id)}
				class="flex min-h-10 shrink-0 items-center rounded-[9px] border border-line bg-base-100 px-[13px] text-[12.5px] font-semibold transition-colors hover:border-primary"
			>
				Editar
			</button>
			<button
				type="button"
				onclick={() => marcar(q.id, q.dentro)}
				disabled={marcandoId !== null || (!q.dentro && cheia)}
				title={!q.dentro && cheia
					? `No máximo ${data.maxItens} questões: descarte uma antes.`
					: undefined}
				class="flex min-h-10 shrink-0 items-center gap-2 rounded-[9px] border-[1.5px] border-primary bg-base-100 px-[13px] text-[12.5px] font-bold whitespace-nowrap text-primary transition-colors hover:bg-base-300 disabled:cursor-not-allowed disabled:opacity-50"
			>
				{#if marcandoId === q.id}<Loading
						variant="fila"
						size={10}
						tone="current"
						label="Salvando"
					/>{/if}
				{q.dentro ? 'Descartar' : 'Aceitar'}
			</button>
			<!-- No celular o aparelho fica lá em cima, e escolher uma linha o troca
			     longe da vista: isto leva até ele. -->
			<button type="button" onclick={verNoCelular} class={VER_NO_CELULAR}>
				{@render icone(ICONE_DO_CELULAR, 'size-[15px]')}
				Ver no celular
			</button>
		</div>
	{/if}
{/snippet}

<WizardShell
	step={3}
	backHref={materiaisHref}
	backLabel="Materiais"
	status={statusTexto}
	hint={hintTexto}
	rolagem="colunas"
>
	{#if gerandoAgora && progresso}
		<!-- GERANDO: cada passo marcado quando termina. Os que ainda não começaram
		     são esqueleto; o que anda tem a `fila` e o texto, sem prazo. -->
		<!-- A faixa de formas fica POR TRÁS, ancorada embaixo, e não no fluxo: ocupando
		     os 190px de baixo, ela fazia o conteúdo centralizar só no espaço de cima, e
		     a coluna parecia alta. O invólucro cresce com o conteúdo, para a faixa
		     acompanhar o fim dele quando a tela é baixa e a coluna rola. -->
		<div class="flex min-h-0 flex-1 flex-col overflow-y-auto">
			<div class="relative flex shrink-0 grow flex-col">
				<div class="pointer-events-none absolute inset-x-0 bottom-0 h-[150px] lg:h-[190px]">
					<AmbientShapes height="100%" edges="bottom" />
				</div>
				<div class="relative z-1 mx-auto my-auto w-full max-w-[560px] px-4 py-8">
					<div class="mb-6 flex items-start gap-4">
						<Loading variant="orbita" size={44} pace="devagar" label="Gerando as questões" />
						<div class="min-w-0 flex-1">
							<h1 class="mb-1.5 font-display text-section font-semibold tracking-[-0.02em]">
								Gerando as questões
							</h1>
							<p class="text-[14px] leading-relaxed text-base-content/65">
								Pode sair desta tela: o trabalho continua no servidor, e as questões estão aqui
								quando você voltar.
							</p>
						</div>
					</div>
					<ol class="grid list-none gap-2 p-0" aria-live="polite">
						{#each progresso.passos as passo, i (passo.id)}
							{#if passo.estado === 'esperando'}
								<li class="h-[52px] skeleton" style="animation-delay: {i * 160}ms">
									<span class="sr-only">{textoDoPasso(passo)}: ainda não começou</span>
								</li>
							{:else}
								<li
									class="flex animate-entrada-curta items-center gap-3 rounded-box border px-4 py-3.5
								       {passo.estado === 'andando' ? 'border-primary bg-base-100' : 'border-line bg-base-200'}"
								>
									{#if passo.estado === 'andando'}
										<Loading variant="fila" size={12} label="Em andamento" />
									{:else}
										<span
											class="grid size-5 place-items-center rounded-full bg-primary text-primary-content"
										>
											{@render icone('M4 12.5l5 5L20 6.5', 'size-[12px]')}
										</span>
									{/if}
									<span
										class="flex-1 text-[14px] {passo.estado === 'andando'
											? 'font-bold'
											: 'font-semibold'}"
										>{textoDoPasso(passo)}{passo.estado === 'andando' ? '…' : ''}</span
									>
									{#if passo.estado === 'feito'}<span class="sr-only">concluído</span>{/if}
								</li>
							{/if}
						{/each}
					</ol>
					<p class="mt-4 text-[12.5px] leading-relaxed text-base-content/65">
						Sem prazo estimado: o tempo depende do tamanho do material e do que o tradutor tem para
						conferir.
					</p>
				</div>
			</div>
		</div>
	{:else}
		<!-- No desktop são duas colunas que rolam cada uma por dentro. O palco tem 30%
		     da largura (pedido do dono do repositório), com piso de 480px — o celular
		     da home e as duas setas — e teto de 720px num monitor muito largo; no
		     celular, uma rolagem só, com o palco em cima. O celular tem
		     altura FIXA: numa tela baixa o palco rola, e o `safe center` impede que o
		     topo do aparelho fique fora do alcance da rolagem. -->
		<div class="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
			<!-- O PALCO: a questão escolhida, no celular de tamanho fixo. No celular as
			     setas não cabem dos lados do aparelho e descem para baixo dele. -->
			<section
				bind:this={palco}
				aria-label="A questão escolhida, como o aluno vê"
				class="flex shrink-0 flex-col items-center gap-3 border-b border-line bg-base-200 px-4 py-6 lg:w-[clamp(30rem,30%,45rem)] lg:flex-row lg:[align-items:safe_center] lg:justify-center lg:gap-2.5 lg:overflow-y-auto lg:border-e lg:border-b-0 lg:px-3.5"
			>
				<button
					type="button"
					onclick={() => andar(-1)}
					aria-label="Questão anterior"
					class="hidden size-[38px] shrink-0 place-items-center rounded-full border border-line bg-base-100 transition-[translate,border-color] duration-200 hover:-translate-x-0.5 hover:border-primary active:scale-95 lg:grid"
				>
					{@render icone('M15 5l-7 7 7 7', 'size-[15px]')}
				</button>
				{#if escolhida}
					<CelularDoAluno
						rotulo="Prévia da questão {escolhida.dentro
							? posicaoNoRoteiro(escolhida)
							: 'de fora'}: {escolhida.titulo}"
						posicao={escolhida.dentro ? posicaoNoRoteiro(escolhida) : null}
						total={roteiro.length}
						apagado={!escolhida.dentro}
					>
						{#if escolhida.runtime}
							<p class="mb-2.5 text-[11px] font-bold text-primary">
								{escolhida.runtime.skillLabel}
							</p>
							{#key `${escolhida.id}:${rodada}`}
								<PreviaDaQuestao
									bind:this={previaDoPalco}
									runtime={escolhida.runtime}
									chave={escolhida.id}
									compacta
									{veredito}
								/>
							{/key}
							{#if avisoDaCorrecao}
								<p class="mt-3 text-[12px] leading-snug text-base-content/65" role="status">
									{avisoDaCorrecao}
								</p>
							{/if}
							{#if escolhida.audioPendente}
								<p class="mt-3 text-[12px] leading-snug text-base-content/65">
									O áudio desta frase ainda está sendo gerado.
								</p>
							{/if}
						{:else}
							<p
								class="m-auto max-w-[24ch] text-center text-[13px] leading-snug text-base-content/65"
							>
								Os campos desta questão não formam um exercício ainda. Abra no editor.
							</p>
						{/if}
						{#snippet rodape()}
							{#if escolhida?.runtime && respondivel(escolhida.runtime)}
								<button
									type="button"
									onclick={veredito ? tentarDeNovo : verificar}
									disabled={verificando}
									class="btn h-12 w-full motion-tap gap-2 btn-primary text-base font-bold"
								>
									{#if verificando}
										<Loading variant="fila" size={11} tone="current" label="Verificando" />
										Verificando…
									{:else}
										{veredito ? 'Tentar de novo' : 'Verificar'}
									{/if}
								</button>
							{:else if escolhida?.runtime}
								<p
									class="rounded-field bg-base-300 px-3 py-3 text-center text-[13px] leading-snug font-semibold text-base-content/65"
								>
									{escolhida.runtime.interaction === 'speak'
										? 'A fala se confere no Player, com o microfone.'
										: 'Esta resposta você corrige depois, na tela da tentativa.'}
								</p>
							{/if}
						{/snippet}
					</CelularDoAluno>
				{:else}
					<p class="max-w-[30ch] text-center text-[13.5px] text-base-content/65">
						Nenhuma questão ainda. Gere a partir dos materiais ou crie uma do zero.
					</p>
				{/if}
				<button
					type="button"
					onclick={() => andar(1)}
					aria-label="Próxima questão"
					class="hidden size-[38px] shrink-0 place-items-center rounded-full border border-line bg-base-100 transition-[translate,border-color] duration-200 hover:translate-x-0.5 hover:border-primary active:scale-95 lg:grid"
				>
					{@render icone('M9 5l7 7-7 7', 'size-[15px]')}
				</button>
				{#if escolhida && navegacao.length > 1}
					<div class="flex gap-2.5 lg:hidden">
						<button type="button" onclick={() => andar(-1)} class={SETA_SOB_O_CELULAR}>
							{@render icone('M15 5l-7 7 7 7', 'size-[15px]')}
							Anterior
						</button>
						<button type="button" onclick={() => andar(1)} class={SETA_SOB_O_CELULAR}>
							Próxima
							{@render icone('M9 5l7 7-7 7', 'size-[15px]')}
						</button>
					</div>
				{/if}
			</section>

			<!-- O ROTEIRO -->
			<div class="flex min-w-0 flex-col lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
				<div class="relative z-1 px-4 py-5 lg:px-[34px] lg:pt-8 lg:pb-[34px]">
					{#if falhou}
						<div
							class="mb-5 flex flex-wrap items-center gap-3 rounded-box border border-s-[3px] border-line border-s-error bg-base-200 px-4 py-3.5"
							role="alert"
						>
							<p class="min-w-[14rem] flex-1 text-[13.5px] leading-snug">
								<span class="font-bold">A geração não terminou.</span>
								{falhou}
							</p>
							<button
								type="button"
								onclick={regerar}
								disabled={regenerando}
								class="btn btn-sm motion-tap gap-2 btn-primary"
							>
								{#if regenerando}<Loading
										variant="fila"
										size={10}
										tone="current"
										label="Começando"
									/>{/if}
								Gerar de novo
							</button>
							<a href={materiaisHref} class="btn btn-sm btn-plain no-underline"
								>Voltar aos materiais</a
							>
						</div>
					{/if}

					<div class="mb-1.5 flex flex-wrap items-center gap-x-4 gap-y-2.5">
						<h1
							class="min-w-0 flex-[1_1_220px] font-display text-[23px] leading-[1.16] font-semibold tracking-[-0.022em] lg:text-[28px] lg:leading-[1.12]"
						>
							{palavra(total, 'questão gerada', 'questões geradas')}
						</h1>
						<div class="flex shrink-0 gap-2">
							<button
								type="button"
								onclick={regerar}
								disabled={regenerando}
								class="flex min-h-10 items-center gap-2 rounded-[9px] border border-line bg-base-100 px-[13px] text-[13px] font-semibold whitespace-nowrap transition-[translate,border-color] duration-200 hover:-translate-y-0.5 hover:border-primary active:translate-y-0.5"
							>
								{#if regenerando}<Loading
										variant="fila"
										size={10}
										tone="current"
										label="Começando"
									/>{/if}
								Gerar novamente
							</button>
							{#if fora.length > 0 && total <= data.maxItens}
								<button
									type="button"
									onclick={aceitarTodas}
									disabled={aceitando}
									class="flex min-h-10 items-center gap-2 rounded-[9px] border-[1.5px] border-primary px-[13px] text-[13px] font-bold whitespace-nowrap text-primary transition-[translate,background-color] duration-200 hover:-translate-y-0.5 hover:bg-base-300 active:translate-y-0.5"
								>
									{#if aceitando}<Loading
											variant="fila"
											size={10}
											tone="current"
											label="Aceitando"
										/>{/if}
									Aceitar todas
								</button>
							{/if}
						</div>
					</div>
					<p class="mb-4 max-w-[64ch] text-[13.5px] leading-normal text-base-content/65">
						O roteiro do aluno, na ordem em que ele responde. Arraste uma questão para mudar a
						ordem.
					</p>

					<div class="mb-5 flex flex-wrap items-center gap-1.5">
						{#each contagem as c (c.h)}
							<span
								class="flex items-center gap-1.5 rounded-full border border-line bg-base-200 py-[5px] ps-[9px] pe-[11px] text-[12px] font-semibold"
							>
								<span class="text-primary">{@render icone(ICONE[c.h], 'size-[13px]')}</span>
								{ROTULO_DA_HABILIDADE[c.h]}
								{c.n}
							</span>
						{/each}
						<span class="min-w-1 flex-1"></span>
						<span class="text-[13px] font-semibold whitespace-nowrap text-base-content/65"
							>{roteiro.length} de {total} aceitas</span
						>
					</div>

					{#if roteiro.length > 0}
						<div class="relative">
							<!-- O fio do roteiro, ligando as bolhas de cima a baixo. -->
							<span aria-hidden="true" class="absolute inset-y-7 start-[46px] w-0.5 bg-line"></span>
							<ol
								class="relative grid list-none gap-0.5 p-0"
								aria-label="O roteiro do aluno"
								use:dragHandleZone={{
									items: roteiro,
									flipDurationMs: DESLIZE,
									dropTargetStyle: {}
								}}
								onconsider={aoConsiderar}
								onfinalize={aoSoltar}
							>
								{#each roteiro as q, i (q.id)}
									<li
										animate:flip={{ duration: DESLIZE }}
										class="overflow-hidden rounded-xl transition-colors duration-200
										       {escolhida?.id === q.id ? 'bg-primary/10 ring-[1.5px] ring-primary ring-inset' : ''}"
									>
										{@render linha(q, i + 1)}
									</li>
								{/each}
							</ol>
						</div>
					{:else}
						<p
							class="rounded-box border-[1.5px] border-dashed border-line px-4 py-5 text-[13.5px] text-base-content/65"
						>
							Nenhuma questão aceita ainda. Aceite as que você quer da lista abaixo.
						</p>
					{/if}

					{#if fora.length > 0}
						<div class="mt-7 mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
							<h2 class="text-[15px] font-bold">Ficaram de fora · {fora.length}</h2>
							<p class="text-[12.5px] text-base-content/65">
								Passaram da quantidade pedida ({data.alvo}) ou você descartou. Aceite uma para ela
								entrar no fim do roteiro.
							</p>
						</div>
						<ol class="grid list-none gap-0.5 p-0" aria-label="Questões de fora">
							{#each fora as q (q.id)}
								<li
									class="overflow-hidden rounded-xl transition-colors duration-200
									       {escolhida?.id === q.id ? 'bg-primary/10 ring-[1.5px] ring-primary ring-inset' : ''}"
								>
									{@render linha(q, null)}
								</li>
							{/each}
						</ol>
					{/if}

					{#if data.semQuestao.length > 0}
						<div
							class="mt-6 flex gap-3 rounded-box border border-s-[3px] border-line border-s-warning bg-base-200 px-4 py-3.5"
						>
							<span class="text-warning">
								{@render icone('M12 3.5l9.5 16.5H2.5zM12 9.5v4.5M12 17h.01', 'size-[18px]')}
							</span>
							<div class="min-w-0 flex-1 text-[13px] leading-snug">
								<p class="mb-1 font-semibold">
									{palavra(data.semQuestao.length, 'material não rendeu', 'materiais não renderam')}
									questão
								</p>
								<ul class="grid list-none gap-0.5 p-0 text-base-content/65">
									{#each data.semQuestao as m (m.id)}
										<li class="truncate">
											<span class="font-content" dir={data.activity.dir}>"{m.trecho}"</span>: {m.motivo}.
										</li>
									{/each}
								</ul>
							</div>
							<a
								href={materiaisHref}
								class="self-center p-1 text-[13px] font-bold whitespace-nowrap text-primary no-underline"
								>Ver os materiais</a
							>
						</div>
					{/if}
				</div>
				<div class="pointer-events-none relative mt-auto h-[150px] shrink-0 lg:h-[190px]">
					<AmbientShapes height="100%" edges="bottom" />
				</div>
			</div>
		</div>
	{/if}

	{#snippet actions()}
		{#if gerandoAgora}
			<button
				type="button"
				disabled
				class="btn h-[46px] flex-1 gap-2.5 btn-primary font-bold lg:flex-none"
			>
				<span class="lg:hidden">Aguardando…</span>
				<span class="hidden lg:inline">Aguardando as questões</span>
			</button>
		{:else}
			<button
				type="button"
				onclick={() => abrirEditor(null)}
				disabled={cheia}
				title={cheia ? `No máximo ${data.maxItens} questões: descarte uma antes.` : undefined}
				class="btn h-[46px] flex-1 motion-tap btn-neutral font-semibold lg:flex-none"
			>
				<span class="lg:hidden">Do zero</span>
				<span class="hidden lg:inline">Criar questão do zero</span>
			</button>
			{#if roteiro.length > 0}
				<a
					href={resolve('/(studio)/atividades/[id]/publicar', { id: data.activity.id })}
					class="btn h-[46px] flex-1 motion-tap gap-2.5 btn-primary font-bold no-underline lg:flex-none"
				>
					<span class="lg:hidden">Continuar</span>
					<span class="hidden lg:inline">Continuar para publicar</span>
					{@render icone('M5 12h13M13 6l6 6-6 6')}
				</a>
			{:else}
				<button
					type="button"
					disabled
					class="btn h-[46px] flex-1 gap-2.5 btn-primary font-bold lg:flex-none"
				>
					<span class="lg:hidden">Continuar</span>
					<span class="hidden lg:inline">Continuar para publicar</span>
				</button>
			{/if}
		{/if}
	{/snippet}
</WizardShell>

<EditorDeQuestao
	alvo={editor}
	activityId={data.activity.id}
	numero={editor?.itemId === null
		? posicaoDaNova
		: aberta?.dentro
			? posicaoNoRoteiro(aberta)
			: null}
	total={editor?.itemId === null ? roteiro.length + 1 : roteiro.length}
	proximoId={proximaAberta}
	fora={aberta ? !aberta.dentro : false}
	idioma={{
		tag: data.activity.tag,
		dir: data.activity.dir,
		alvo: data.activity.targetLabel,
		aluno: data.activity.sourceLabel
	}}
	capacidades={data.capacidades}
	onfechar={fecharEditor}
	onsalvo={aoSalvar}
	onalternarFora={(itemId, ficaFora) => marcar(itemId, ficaFora)}
/>
