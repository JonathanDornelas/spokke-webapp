<script lang="ts">
	// Etapa 2 — Nível 1 de autoria (kernel.md): colar conteúdo. Nada de configurar
	// interação aqui. `+page@.svelte` reseta para o layout raiz, sem a barra
	// lateral do Studio.
	//
	// O formulário é o MESMO da biblioteca (`MaterialForm.svelte`): lá ele é
	// painel sobre a lista, aqui é coluna fixa à esquerda. No celular ele cobre a
	// lista e "Ver os N materiais" alterna entre os dois.
	import { resolve } from '$app/paths';
	import IdiomaTag from '$lib/components/IdiomaTag.svelte';
	import FiltroIdioma from '$lib/components/FiltroIdioma.svelte';
	import { casaComFiltro } from '$lib/idiomas';
	import Loading from '$lib/components/Loading.svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import MaterialForm, {
		type MaterialRef,
		type Modo,
		type SugestaoDeTraducao
	} from '$lib/components/MaterialForm.svelte';
	import MaterialList from '$lib/components/MaterialList.svelte';
	import WizardShell from '$lib/components/WizardShell.svelte';
	import AmbientShapes from '$lib/components/AmbientShapes.svelte';
	import {
		PILL_TONE,
		TIPOS,
		tipoDe,
		type MaterialKind,
		type MaterialRow
	} from '$lib/components/material-form';
	import { withMock } from '$lib/dev/with-mock';
	import { aceitarPropostasIa, gerarPropostasIa } from '../../../materiais/ia.remote';
	import { gerarComArquivo } from '$lib/client/arquivo-ia';
	import { sugerirTraducao } from '../../../materiais/traducao.remote';
	import type { ResultadoMaterial } from '$lib/components/MaterialForm.svelte';
	import type { EstadoDaIa, RespostaDaGeracao } from '$lib/billing/ia';
	import type { ContentUnitKind } from '$lib/kernel/content/types';
	import { untrack } from 'svelte';
	import { DURACAO } from '$lib/movimento';
	import type { Skill } from '$lib/kernel/interactions/types';
	import { maximoPelosTetos } from '$lib/kernel/generators/select';
	import {
		alternarNoGeral,
		alternarNoMaterial,
		montarPlano,
		type PlanoDeTipos,
		type TiposPorMaterial
	} from '$lib/atividades/tipos-por-material';
	import BlocoDeGeracao from './BlocoDeGeracao.svelte';
	import TiposDoMaterial from './TiposDoMaterial.svelte';
	import {
		adicionarMaterial,
		adicionarMateriaisEmLote,
		editarMaterial,
		gerarItens,
		materiaisDisponiveis,
		removerMaterial,
		salvarPlanoDeGeracao,
		usarDaBiblioteca
	} from '../../atividades.remote';

	interface PageData {
		activity: {
			id: string;
			title: string;
			dir: 'ltr' | 'rtl';
			tag: string;
			targetLabel: string;
			sourceLabel: string;
			sourceTag: string;
		};
		materials: MaterialRow[];
		ia: EstadoDaIa;
		traducaoAutomatica: boolean;
		plano: { itemTarget: number; geral: Skill[]; porMaterial: TiposPorMaterial };
		capacidades: { tts: boolean; asr: boolean };
	}

	const MOCK: PageData = {
		activity: {
			id: page.params.id ?? 'atv_01',
			title: 'Present perfect — turma B',
			dir: 'ltr',
			tag: 'en-US',
			targetLabel: 'Inglês',
			sourceLabel: 'Português',
			sourceTag: 'pt-BR'
		},
		materials: [
			{
				id: 'mat_01',
				kind: 'pair',
				primary: 'She has been working here since 2019.',
				secondary: 'Ela trabalha aqui desde 2019.',
				idioma: 'en-US',
				usedIn: 2,
				daBiblioteca: true,
				target: 'She has been working here since 2019.',
				source: 'Ela trabalha aqui desde 2019.',
				raw: '',
				note: '',
				example: '',
				questions: [],
				lines: []
			},
			{
				id: 'mat_02',
				kind: 'pair',
				primary: 'I have already finished the report.',
				secondary: 'Eu já terminei o relatório.',
				idioma: 'en-US',
				usedIn: 1,
				daBiblioteca: false,
				target: 'I have already finished the report.',
				source: 'Eu já terminei o relatório.',
				raw: '',
				note: '',
				example: '',
				questions: [],
				lines: []
			}
		],
		ia: {
			configurada: false,
			pode: false,
			motivo: 'ia',
			saldo: 0,
			custoPorProposta: 1,
			fontes: { imagem: false, video: false },
			idiomas: null
		},
		traducaoAutomatica: false,
		plano: {
			itemTarget: 8,
			geral: ['listening', 'speaking', 'reading', 'writing'],
			porMaterial: {}
		},
		capacidades: { tts: true, asr: true }
	};

	let { data: dataProp }: { data?: Partial<PageData> } = $props();
	const data = $derived(withMock(dataProp, MOCK));

	// ── o formulário ────────────────────────────────────────────────────────
	let formulario = $state<MaterialForm | null>(null);
	let modo = $state<Modo>('um');
	let editando = $state<MaterialRow | null>(null);
	let salvando = $state(false);
	/**
	 * No celular só um dos dois cabe: o formulário ou a lista. Abre no formulário
	 * só quando ainda não há material — quem volta da revisão quer ver o que já
	 * está aqui, e caía em "Adicionar material".
	 */
	let formAberto = $state(untrack(() => data.materials.length === 0));

	// Uma remote function por modo. Os campos são os mesmos, e duplicar o
	// markup faria as duas telas divergirem no primeiro ajuste de layout.
	const acao = $derived(
		editando ? editarMaterial : modo === 'lista' ? adicionarMateriaisEmLote : adicionarMaterial
	);
	const resultado = $derived(acao.result);

	// ── gerar com IA ── nos idiomas DESTA atividade (o servidor os lê dela, não do
	// browser). O `requestId` torna o débito idempotente: clique duplo não paga duas vezes.
	let resultadoIa = $state<ResultadoMaterial | undefined>(undefined);

	async function gerarIa(pedido: {
		kind: ContentUnitKind;
		texto: string;
		quantos: 5 | 10 | 20;
		arquivo?: { fonte: 'imagem' | 'video'; blob: Blob };
	}): Promise<RespostaDaGeracao> {
		// Com arquivo (a foto, ou a fala do trecho do vídeo), o pedido vai pelo endpoint que
		// recebe binário; sem, pela remote function de sempre. Os idiomas, nos dois, o servidor
		// lê da atividade.
		if (pedido.arquivo) {
			return gerarComArquivo({
				requestId: crypto.randomUUID(),
				kind: pedido.kind,
				fonte: pedido.arquivo.fonte,
				quantos: pedido.quantos,
				pedido: pedido.texto,
				arquivo: pedido.arquivo.blob,
				activityId: data.activity.id
			});
		}
		const r = await gerarPropostasIa({
			requestId: crypto.randomUUID(),
			kind: pedido.kind,
			pedido: pedido.texto,
			quantos: pedido.quantos,
			activityId: data.activity.id
		});
		return r.ok ? { ok: true, propostas: r.propostas, saldo: r.saldo } : r;
	}

	// A sugestão de tradução enquanto o professor digita. Falhar é normal (o
	// tradutor pode estar carregando): a tela diz e o servidor traduz ao salvar.
	async function sugerir(
		texto: string,
		de: string,
		para: string,
		palavra: boolean
	): Promise<SugestaoDeTraducao | null> {
		try {
			const r = await sugerirTraducao({ texto, de, para, palavra });
			return r.ok ? { traducao: r.traducao, alternativas: r.alternativas } : null;
		} catch {
			return null;
		}
	}

	async function aceitarIa(kind: ContentUnitKind, dados: Record<string, unknown>[]) {
		const r = await aceitarPropostasIa({ kind, propostas: dados, activityId: data.activity.id });
		resultadoIa = r;
		if (r.ok) await invalidateAll();
		void formulario?.mostrarResultado();
		return r.ok;
	}
	const enviar = $derived(
		acao.enhance(async ({ submit }) => {
			const alvo = acao;
			salvando = true;
			try {
				await submit();
				if (alvo.result?.ok) formulario?.limpar();
			} finally {
				salvando = false;
			}
			// O resultado fica no fim do corpo do formulário: no celular, fora da vista.
			void formulario?.mostrarResultado();
		})
	);

	function editar(m: MaterialRow) {
		formulario?.editar(m);
		formAberto = true;
	}

	// ── a biblioteca ────────────────────────────────────────────────────────
	// O que está na biblioteca e ainda não está aqui. Serve ao painel de trazer
	// E ao aviso de repetido do formulário: o servidor reaproveita o que o
	// professor já tem, e a tela diz isso enquanto ele digita, não depois.
	const disponiveis = $derived(materiaisDisponiveis({ activityId: data.activity.id }));
	const conhecidos = $derived<MaterialRef[]>([
		...data.materials,
		...(disponiveis.current ?? []).map((m) => ({
			id: m.id,
			kind: m.kind,
			target: m.primary,
			source: m.secondary,
			note: m.note,
			example: m.example,
			variants: m.variants
		}))
	]);

	/**
	 * Trazer da biblioteca é uma ESCOLHA, não um clique por linha: o professor
	 * marca o que quer da aula passada, filtra por tipo ou por busca, e traz
	 * tudo de uma vez.
	 */
	let mostrarBiblioteca = $state(false);
	let escolhidos = $state<string[]>([]);
	let buscaBiblioteca = $state('');
	let filtroBiblioteca = $state<MaterialKind | 'todos'>('todos');
	/**
	 * O filtro de idioma nasce no idioma DA ATIVIDADE: trazer uma frase de
	 * espanhol para uma atividade de inglês é quase sempre engano — mas não é
	 * proibido, e o professor tira o filtro se quiser.
	 */
	let filtroIdiomaBib = $state('');
	let trazendo = $state(false);
	let removendoId = $state<string | null>(null);

	function alternarEscolha(contentId: string) {
		escolhidos = escolhidos.includes(contentId)
			? escolhidos.filter((id) => id !== contentId)
			: [...escolhidos, contentId];
	}

	function filtrar<
		T extends { kind: MaterialKind; primary: string; secondary: string; idioma: string | null }
	>(lista: T[]) {
		const termo = buscaBiblioteca.trim().toLowerCase();
		return lista.filter(
			(m) =>
				(filtroBiblioteca === 'todos' || m.kind === filtroBiblioteca) &&
				casaComFiltro(m.idioma, filtroIdiomaBib) &&
				(termo === '' ||
					m.primary.toLowerCase().includes(termo) ||
					m.secondary.toLowerCase().includes(termo))
		);
	}

	/** Adicionar FECHA o modal: o que entrou aparece na lista, atrás dele. */
	async function trazerDaBiblioteca() {
		if (escolhidos.length === 0) return;
		trazendo = true;
		try {
			await usarDaBiblioteca({ activityId: data.activity.id, contentIds: escolhidos });
			escolhidos = [];
			mostrarBiblioteca = false;
			await disponiveis.refresh();
			await invalidateAll();
		} finally {
			trazendo = false;
		}
	}

	function abrirBiblioteca() {
		mostrarBiblioteca = true;
		escolhidos = [];
		buscaBiblioteca = '';
		filtroBiblioteca = 'todos';
		filtroIdiomaBib = (disponiveis.current ?? []).some((m) => m.idioma === data.activity.tag)
			? data.activity.tag
			: '';
	}

	// O modal da biblioteca é um `<dialog>` de verdade (foco preso, Esc e véu vêm
	// do elemento), no molde do `PlanosModal`: a saída anima com ele ainda aberto
	// e o `close()` vem no fim dela.
	let dialogoBib = $state<HTMLDialogElement>();
	let fechandoBib = $state(false);
	$effect(() => {
		if (!dialogoBib) return;
		if (mostrarBiblioteca && !dialogoBib.open) {
			fechandoBib = false;
			dialogoBib.showModal();
		} else if (!mostrarBiblioteca && dialogoBib.open && !fechandoBib) {
			fechandoBib = true;
			const el = dialogoBib;
			const terminar = () => {
				if (!fechandoBib) return;
				fechandoBib = false;
				if (!mostrarBiblioteca && el.open) el.close();
			};
			el.addEventListener('animationend', terminar, { once: true });
			setTimeout(terminar, DURACAO.curta + 60);
		}
	});

	async function remover(m: MaterialRow) {
		removendoId = m.id;
		try {
			await removerMaterial({ activityId: data.activity.id, contentId: m.id });
			if (editando?.id === m.id) formulario?.limpar();
			await disponiveis.refresh();
			await invalidateAll();
		} finally {
			removendoId = null;
		}
	}

	// ── o que gerar ─────────────────────────────────────────────────────────
	// Quantas questões entram e os tipos de cada material. O estado é da TELA
	// (o professor mexe e vê na hora) e vai para o servidor sozinho, depois de
	// uma pausa, para voltar à etapa e encontrar o que ele deixou.
	let quantidade = $state(untrack(() => data.plano.itemTarget));
	let planoLocal = $state<PlanoDeTipos>(
		untrack(() => ({ geral: data.plano.geral, porMaterial: data.plano.porMaterial }))
	);
	const ids = $derived(data.materials.map((m) => m.id));
	// Material que entra nasce com o bloco de cima; o que sai, sai do plano.
	const plano = $derived(montarPlano(planoLocal.geral, planoLocal.porMaterial, ids));

	const indisponiveis = $derived(
		new Map<Skill, string>([
			...(data.capacidades.tts ? [] : [['listening', 'sem voz para este idioma agora'] as const]),
			...(data.capacidades.asr
				? []
				: [['speaking', 'a transcrição de fala está desligada'] as const])
		])
	);

	const planoParaEnviar = () => ({
		itemTarget: quantidade,
		geral: plano.geral,
		tiposPorMaterial: plano.porMaterial
	});
	let salvarEm: ReturnType<typeof setTimeout> | undefined;
	function agendarSalvar() {
		clearTimeout(salvarEm);
		salvarEm = setTimeout(() => {
			void salvarPlanoDeGeracao({ activityId: data.activity.id, plano: planoParaEnviar() }).catch(
				() => {}
			);
		}, 700);
	}
	// O clique que deixaria um material sem tipo nenhum volta o mesmo plano
	// (`tipos-por-material.ts`): aí não há o que salvar.
	function alternarGeral(tipo: Skill) {
		const novo = alternarNoGeral(plano, tipo, ids, indisponiveis);
		if (novo === plano) return;
		planoLocal = novo;
		agendarSalvar();
	}
	function alternarMaterial(material: string, tipo: Skill) {
		const novo = alternarNoMaterial(plano, material, tipo, ids, indisponiveis);
		if (novo === plano) return;
		planoLocal = novo;
		agendarSalvar();
	}

	// ── gerar ───────────────────────────────────────────────────────────────
	// `gerarItens` só COMEÇA o trabalho: a tela "Gerando", na revisão, mostra
	// cada passo enquanto ele anda no servidor.
	let gerando = $state(false);
	let erroAoGerar = $state<string | null>(null);
	async function onGerarItens() {
		clearTimeout(salvarEm);
		gerando = true;
		erroAoGerar = null;
		try {
			const r = await gerarItens({ activityId: data.activity.id, plano: planoParaEnviar() });
			if (!r.ok) {
				erroAoGerar = r.error;
				return;
			}
			await goto(resolve('/(studio)/atividades/[id]/revisar', { id: data.activity.id }));
		} catch {
			erroAoGerar = 'Não deu para começar a geração agora. Tente de novo.';
		} finally {
			gerando = false;
		}
	}

	const total = $derived(data.materials.length);
	const daBiblioteca = $derived(data.materials.filter((m) => m.daBiblioteca).length);
	const podeGerar = $derived(total > 0 && plano.geral.length > 0);
	// Com só tipos de teto ligados (só fala, só escuta), entram no máximo os tetos:
	// o botão diz o número que vai entrar, não o pedido (`maximoPelosTetos`).
	const maximo = $derived(maximoPelosTetos(plano.geral));
	const entram = $derived(maximo === null ? quantidade : Math.min(quantidade, maximo));
	const palavraQuestoes = $derived(entram === 1 ? 'questão' : 'questões');
	const statusTexto = $derived(`${total} ${total === 1 ? 'material' : 'materiais'}`);
	// O X do formulário no celular. "Ver os 0 materiais" e "Ver os 1 material" não
	// eram português.
	const rotuloDaLista = $derived(
		total === 0 ? 'Ver a lista' : total === 1 ? 'Ver o material' : `Ver os ${statusTexto}`
	);
	const hintTexto = $derived(
		erroAoGerar ??
			(total === 0
				? 'Precisa de ao menos 1 material para avançar.'
				: plano.geral.length === 0
					? 'Ligue ao menos um tipo de questão para gerar.'
					: total === 1
						? `${entram} ${palavraQuestoes} deste material. O resto fica de fora na revisão, para você trocar.`
						: `${entram} ${palavraQuestoes} em rodízio entre os ${statusTexto}: nenhum repete antes de todos entrarem. O resto fica de fora na revisão, para você trocar.`)
	);
</script>

<svelte:head><title>Materiais · {data.activity.title} · Spokke</title></svelte:head>

<WizardShell
	step={2}
	backHref={resolve('/(studio)/atividades/[id]/detalhes', { id: data.activity.id })}
	backLabel="Detalhes"
	status={statusTexto}
	hint={hintTexto}
	rolagem="colunas"
	cancelarNoCelular={!formAberto}
>
	<div class="flex min-h-0 flex-1 flex-col lg:flex-row">
		<!-- O formulário é coluna fixa no desktop; no celular cobre a lista até o
		     professor pedir para ver os materiais. `min-w-0` nas duas colunas: item
		     de flex nasce com `min-width: auto`, então uma frase longa esticava a
		     coluna e a página ganhava rolagem horizontal. A coluna tem a altura da
		     tela (`rolagem="colunas"`), e quem rola é o corpo do formulário: o
		     cabeçalho e o botão de adicionar ficam sempre à vista. -->
		<form
			{...enviar}
			class="min-h-0 min-w-0 flex-1 flex-col border-b border-line lg:flex lg:w-[500px] lg:flex-none lg:border-e lg:border-b-0 {formAberto
				? 'flex'
				: 'hidden'}"
		>
			<input type="hidden" name="activityId" value={data.activity.id} />
			{#if editando}<input type="hidden" name="contentId" value={editando.id} />{/if}
			<MaterialForm
				bind:this={formulario}
				bind:modo
				bind:editando
				contexto="wizard"
				conjunto={data.materials}
				biblioteca={conhecidos}
				contentTag={data.activity.tag}
				dir={data.activity.dir}
				targetLabel={data.activity.targetLabel}
				sourceLabel={data.activity.sourceLabel}
				resultado={modo === 'ia' ? resultadoIa : resultado}
				{salvando}
				ia={data.ia}
				ongerarIa={gerarIa}
				onaceitarIa={aceitarIa}
				traducaoAutomatica={data.traducaoAutomatica}
				linguaDoAluno={data.activity.sourceTag}
				onsugerirTraducao={sugerir}
				onfechar={() => (formAberto = false)}
				fecharRotulo={rotuloDaLista}
				fecharSoNoCelular
			/>
		</form>

		<!-- A lista é a outra coluna que rola por dentro, com a faixa de formas no
		     FIM dela: com poucos materiais a faixa fica embaixo, no vazio; com
		     muitos, vem depois do último — o texto nunca passa por cima das formas. -->
		<div
			class="min-h-0 min-w-0 flex-1 flex-col overflow-y-auto lg:flex {formAberto
				? 'hidden'
				: 'flex'}"
		>
			<div class="flex-1 px-4 py-5 lg:px-7 lg:py-6">
				<div class="mb-4 flex flex-wrap items-end gap-x-4 gap-y-3">
					<div class="min-w-[180px] flex-1">
						<h2
							class="mb-1 font-display text-[22px] font-semibold tracking-[-0.024em] lg:text-[26px]"
						>
							Materiais desta atividade
						</h2>
						<p class="text-[13px] text-base-content/65">
							{statusTexto}{daBiblioteca > 0
								? ` · ${daBiblioteca} ${daBiblioteca === 1 ? 'vindo' : 'vindos'} da biblioteca`
								: ''}
						</p>
					</div>
					<div class="flex flex-wrap gap-2">
						<button
							type="button"
							onclick={() => (formAberto = true)}
							class="btn btn-sm motion-tap gap-2 btn-primary lg:hidden"
						>
							<svg class="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
								<path
									d="M12 5v14M5 12h14"
									stroke="currentColor"
									stroke-width="2.2"
									stroke-linecap="round"
								/>
							</svg>
							Adicionar
						</button>
						<button
							type="button"
							onclick={abrirBiblioteca}
							class="btn btn-sm motion-tap gap-2 btn-outline"
						>
							<svg class="size-[15px] shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
								<path
									d="M3 5.5h6a3 3 0 013 3v10a2.5 2.5 0 00-2.5-2.5H3zM21 5.5h-6a3 3 0 00-3 3v10a2.5 2.5 0 012.5-2.5H21z"
									stroke="currentColor"
									stroke-width="2"
									stroke-linejoin="round"
								/>
							</svg>
							Usar da biblioteca
						</button>
					</div>
				</div>

				{#if total === 0}
					<div
						class="rounded-box border-[1.5px] border-dashed border-line bg-base-200 p-[26px] text-center"
					>
						<p class="mb-1.5 font-display text-[20px] font-semibold">Nenhum material ainda</p>
						<p class="text-[13px] leading-snug text-base-content/65">
							Cole uma lista de frases ao lado, ou traga algo que você já cadastrou.
						</p>
					</div>
				{:else}
					<BlocoDeGeracao
						bind:quantidade
						{plano}
						materiais={ids}
						{indisponiveis}
						onquantidade={agendarSalvar}
						onalternar={alternarGeral}
					/>
					<MaterialList
						materiais={data.materials}
						contexto="wizard"
						contentTag={data.activity.tag}
						dir={data.activity.dir}
						editandoId={editando?.id ?? null}
						{removendoId}
						onedit={editar}
						onremove={remover}
					>
						{#snippet detalhe(m)}
							<TiposDoMaterial
								activityId={data.activity.id}
								materialId={m.id}
								tipos={plano.porMaterial[m.id] ?? plano.geral}
								{indisponiveis}
								dir={data.activity.dir}
								lang={data.activity.tag}
								onalternar={(tipo) => alternarMaterial(m.id, tipo)}
							/>
						{/snippet}
					</MaterialList>
					<p class="mt-3.5 text-[12.5px] leading-relaxed text-pretty text-base-content/65">
						Remover tira o material desta atividade. Ele continua na sua biblioteca e em outras
						atividades que o usem.
					</p>
				{/if}
			</div>
			<div class="pointer-events-none relative h-[150px] shrink-0 lg:h-[190px]">
				<AmbientShapes height="100%" edges="bottom" />
			</div>
		</div>
	</div>

	{#snippet actions()}
		<!-- No celular o rodapé cabe SEMPRE numa linha, até em 320px: com o
		     formulário aberto são "Biblioteca" e "Gerar" (o "Cancelar" sai, pela casca);
		     na lista, "Gerar" e "Cancelar" — a biblioteca ali já é o botão do topo da
		     lista. Com as três ações, o "Cancelar" descia para uma segunda linha quase
		     vazia, logo abaixo do botão de adicionar. -->
		<button
			type="button"
			onclick={abrirBiblioteca}
			class="btn h-[46px] flex-1 motion-tap btn-neutral lg:inline-flex lg:flex-none {formAberto
				? ''
				: 'hidden'}"
		>
			<span class="lg:hidden">Biblioteca</span>
			<span class="hidden lg:inline">Usar da biblioteca</span>
		</button>
		<button
			type="button"
			onclick={onGerarItens}
			disabled={!podeGerar || gerando}
			class="btn h-[46px] flex-1 motion-tap gap-2.5 btn-primary lg:flex-none lg:px-5"
		>
			{#if gerando}
				<Loading variant="fila" size={13} tone="current" label="Começando a geração" />
				Começando…
			{:else if total > 0 && plano.geral.length === 0}
				Ligue um tipo
			{:else}
				<span class="lg:hidden">Gerar {entram}</span>
				<span class="hidden lg:inline">Gerar {entram} {palavraQuestoes}</span>
				<svg class="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<path
						d="M5 12h13M13 6l6 6-6 6"
						stroke="currentColor"
						stroke-width="2.2"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
			{/if}
		</button>
	{/snippet}
</WizardShell>

<!-- A BIBLIOTECA num modal: a biblioteca é do professor, não da atividade, e
     trazer daqui LIGA o material às duas, não copia (paginas.md "Materiais").
     Escolher é marcar várias linhas e adicionar de uma vez; adicionar fecha. -->
<dialog
	bind:this={dialogoBib}
	onclose={() => (mostrarBiblioteca = false)}
	oncancel={(e) => {
		e.preventDefault();
		mostrarBiblioteca = false;
	}}
	onclick={(e) => {
		if (e.target === dialogoBib) mostrarBiblioteca = false;
	}}
	aria-labelledby="biblioteca-titulo"
	class="m-auto max-h-[calc(100dvh-1.75rem)] w-[calc(100vw-1.75rem)] max-w-[760px] overflow-hidden rounded-box border border-line bg-base-100 p-0 text-base-content
	       shadow-[0_34px_70px_-34px_rgba(15,20,32,0.55)] backdrop:bg-overlay backdrop:backdrop-blur-[3px]
	       {fechandoBib
		? 'animate-modal-saida backdrop:animate-veu-saida'
		: 'backdrop:animate-veu open:animate-entrada-curta'} lg:max-h-[calc(100dvh-3.75rem)]"
>
	<div class="flex max-h-[inherit] flex-col">
		<header class="flex shrink-0 items-start gap-3 border-b border-line px-5 py-4 lg:px-6">
			<div class="min-w-0 flex-1">
				<h2
					id="biblioteca-titulo"
					class="font-display text-[20px] font-semibold tracking-[-0.02em]"
				>
					Da sua biblioteca
				</h2>
				<p class="mt-0.5 text-[12.5px] text-base-content/65">
					O que você marcar entra nesta atividade e continua na biblioteca.
				</p>
			</div>
			<button
				type="button"
				onclick={() => (mostrarBiblioteca = false)}
				aria-label="Fechar a biblioteca"
				class="btn btn-circle size-[38px] shrink-0 motion-tap btn-plain"
			>
				<svg class="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<path
						d="M6 6l12 12M18 6L6 18"
						stroke="currentColor"
						stroke-width="2.2"
						stroke-linecap="round"
					/>
				</svg>
			</button>
		</header>

		{#await disponiveis}
			<div class="px-5 py-5 lg:px-6"><div class="h-[3.25rem] skeleton"></div></div>
		{:then lista}
			{@const visiveis = filtrar(lista)}
			<!-- O MESMO material que já está na atividade (outro registro, o mesmo
			     texto) aparece travado: trazê-lo de novo repetiria as questões. -->
			{@const selecionaveis = visiveis.filter((m) => !m.jaNaAtividade)}
			<div class="min-h-0 flex-1 overflow-y-auto px-5 py-4 lg:px-6">
				{#if lista.length === 0}
					<p class="text-[13.5px] leading-snug text-base-content/65">
						Tudo que você já cadastrou já está nesta atividade.
					</p>
				{:else}
					<!-- Busca e filtro por tipo: a biblioteca cresce a cada atividade, e
					     rolar uma lista de 200 frases para achar as três da aula passada
					     não é escolher, é procurar. -->
					<div class="mb-3 flex flex-wrap items-center gap-2">
						<input
							bind:value={buscaBiblioteca}
							placeholder="Buscar…"
							class="input h-auto min-w-[9rem] flex-1 py-2 text-[13.5px]"
							aria-label="Buscar na biblioteca"
						/>
						<div class="flex flex-wrap gap-1.5">
							{#each [{ id: 'todos' as const, label: 'Todos' }, ...TIPOS] as f (f.id)}
								<button
									type="button"
									onclick={() => (filtroBiblioteca = f.id)}
									aria-pressed={filtroBiblioteca === f.id}
									class="rounded-full px-3 py-1.5 text-[12px] transition-colors
									       {filtroBiblioteca === f.id
										? 'border-[1.5px] border-primary bg-base-300 font-bold text-primary'
										: 'border border-line bg-base-100 font-semibold text-base-content/65'}"
									>{f.label}</button
								>
							{/each}
						</div>
						<FiltroIdioma
							tags={lista.map((m) => m.idioma)}
							bind:valor={filtroIdiomaBib}
							formato="chips"
						/>
					</div>

					{#if visiveis.length === 0}
						<p class="text-[13px] leading-snug text-base-content/65">Nada aqui com esse filtro.</p>
					{:else}
						<ul class="grid list-none gap-2 p-0">
							{#each visiveis as m (m.id)}
								{@const marcado = escolhidos.includes(m.id)}
								{@const tipo = tipoDe(m.kind)}
								<li>
									<!-- A linha INTEIRA alterna a escolha: um alvo de 2px no fim da
									     linha é o pior jeito de marcar quinze itens. -->
									<button
										type="button"
										onclick={() => alternarEscolha(m.id)}
										disabled={m.jaNaAtividade}
										aria-pressed={marcado}
										class="flex w-full min-w-0 items-center gap-3 rounded-field border px-3.5 py-2.5 text-start
										       transition-[border-color,background-color] disabled:cursor-not-allowed disabled:opacity-60
										       {marcado ? 'border-primary bg-base-300' : 'border-line bg-base-100 hover:border-primary'}"
									>
										<span
											class="grid size-[18px] shrink-0 place-items-center rounded-[5px] border-[1.5px]
											       {marcado ? 'border-primary bg-primary text-primary-content' : 'border-line'}"
										>
											{#if marcado}
												<svg class="size-[11px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
													<path
														d="M4 12.5l5 5L20 6.5"
														stroke="currentColor"
														stroke-width="3"
														stroke-linecap="round"
														stroke-linejoin="round"
													/>
												</svg>
											{/if}
										</span>
										<span
											class="shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-bold whitespace-nowrap {PILL_TONE[
												tipo.tone
											]}">{tipo.label}</span
										>
										<span class="min-w-0 flex-1">
											<span
												class="block truncate font-content text-[14px]"
												dir={data.activity.dir}
												data-content-lang={m.idioma ?? data.activity.tag}>{m.primary}</span
											>
											<span class="block truncate text-[12px] text-base-content/65"
												>{m.secondary}</span
											>
										</span>
										{#if m.jaNaAtividade}
											<span
												class="shrink-0 rounded-full border border-line bg-base-200 px-2.5 py-1 text-[11.5px] font-semibold whitespace-nowrap text-base-content/65"
												>já está nesta atividade</span
											>
										{/if}
										<IdiomaTag tag={m.idioma} compacta />
									</button>
								</li>
							{/each}
						</ul>
					{/if}
				{/if}
			</div>
			<footer
				class="flex shrink-0 flex-wrap items-center gap-2.5 border-t border-line bg-base-200 px-5 py-3.5 lg:px-6"
			>
				{#if selecionaveis.length > 0}
					<button
						type="button"
						onclick={() =>
							(escolhidos =
								escolhidos.length === selecionaveis.length ? [] : selecionaveis.map((m) => m.id))}
						class="p-1 text-[12.5px] font-semibold text-base-content/65 hover:text-base-content"
						>{escolhidos.length === selecionaveis.length
							? 'Limpar seleção'
							: `Selecionar os ${selecionaveis.length}`}</button
					>
				{/if}
				<div class="flex-1"></div>
				<button
					type="button"
					onclick={() => (mostrarBiblioteca = false)}
					class="btn h-[42px] flex-1 motion-tap btn-plain font-semibold sm:flex-none sm:px-5"
					>Cancelar</button
				>
				{#if lista.length > 0}
					<button
						type="button"
						onclick={trazerDaBiblioteca}
						disabled={escolhidos.length === 0 || trazendo}
						class="btn h-[42px] flex-1 motion-tap gap-2 btn-primary font-bold sm:flex-none sm:px-5"
					>
						{#if trazendo}
							<Loading variant="fila" size={11} tone="current" label="Adicionando" />
							Adicionando…
						{:else if escolhidos.length === 0}
							Adicionar
						{:else}
							Adicionar {escolhidos.length}
						{/if}
					</button>
				{/if}
			</footer>
		{/await}
	</div>
</dialog>
