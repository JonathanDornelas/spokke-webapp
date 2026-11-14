<script lang="ts">
	// UMA questão como o aluno vê: o enunciado, o áudio, o texto de apoio e a
	// interação — pelos MESMOS componentes do Player, a partir do payload de
	// `toRuntime()` (via `buildRuntimeItem`, no servidor). O que aparece aqui é
	// exatamente o que chega no browser do aluno (regra inviolável 1).
	//
	// Usada no palco da revisão (onde a questão responde: `resposta()` e
	// `veredito`) e no editor de questão, onde ela acompanha o formulário. A
	// prévia da atividade inteira (`atividades/[id]/previa`) é a tela do Player e
	// monta as interações ela mesma. Quem troca de questão remonta o componente
	// (`{#key}`), e a resposta zera.
	import { untrack } from 'svelte';
	import AudioPlayer from './AudioPlayer.svelte';
	import AssembleInteraction from './interactions/AssembleInteraction.svelte';
	import ChoiceInteraction from './interactions/ChoiceInteraction.svelte';
	import ClozeInteraction from './interactions/ClozeInteraction.svelte';
	import MatchInteraction from './interactions/MatchInteraction.svelte';
	import OrderInteraction from './interactions/OrderInteraction.svelte';
	import SelectInteraction from './interactions/SelectInteraction.svelte';
	import SpeakInteraction from './interactions/SpeakInteraction.svelte';
	import WritingInteraction from './interactions/WritingInteraction.svelte';
	import AnswerFeedback from './interactions/AnswerFeedback.svelte';
	import type {
		AssembleRuntimeItem,
		ChoiceRuntimeItem,
		ClozeFeedback,
		ClozeRuntimeItem,
		MatchPair,
		MatchRuntimeItem,
		OrderRuntimeItem,
		RuntimeDaQuestao,
		SelectRuntimeItem,
		SpeakRuntimeItem,
		WritingRuntimeItem
	} from './interactions/types';

	let {
		runtime: r,
		chave,
		compacta = false,
		veredito = null
	}: {
		runtime: RuntimeDaQuestao;
		/** Identifica a questão — o rascunho da escrita livre é guardado por ela. */
		chave: string;
		/** Dentro da moldura de celular do editor: enunciado um pouco menor. */
		compacta?: boolean;
		/**
		 * O veredito do SERVIDOR para a resposta dada aqui (a revisão responde a
		 * questão). Aparece embaixo, como no Player, e a lacuna e o associar o usam
		 * para pintar a própria resposta.
		 */
		veredito?: ClozeFeedback | null;
	} = $props();

	// Precisa nascer PREENCHIDO: `bind:` num valor `undefined` estoura quando a
	// prop do componente tem valor padrão.
	let texto = $state('');
	let escolha = $state('');
	let montagem = $state<string[]>([]);
	let selecao = $state('');
	let pares = $state<MatchPair[]>([]);
	// O "ordenar" começa na ordem em que o servidor mandou as falas (já embaralhada
	// pela seed), como no Player: com a lista vazia, a questão aparecia sem nenhuma
	// fala para arrastar.
	let ordem = $state<string[]>(
		untrack(() => ((r as { lines?: { id: string }[] }).lines ?? []).map((l) => l.id))
	);
	let gravando = $state(false);

	// `as` explícito por interação: o runtime é um índice aberto e cada
	// componente exige a sua forma.
	const comoChoice = (x: RuntimeDaQuestao) => x as unknown as ChoiceRuntimeItem;
	const comoAssemble = (x: RuntimeDaQuestao) => x as unknown as AssembleRuntimeItem;
	const comoCloze = (x: RuntimeDaQuestao) => x as unknown as ClozeRuntimeItem;
	const comoMatch = (x: RuntimeDaQuestao) => x as unknown as MatchRuntimeItem;
	const comoOrder = (x: RuntimeDaQuestao) => x as unknown as OrderRuntimeItem;
	const comoSelect = (x: RuntimeDaQuestao) => x as unknown as SelectRuntimeItem;
	const comoSpeak = (x: RuntimeDaQuestao) => x as unknown as SpeakRuntimeItem;

	/** Os rótulos de idioma que o Player usa (as colunas do associar, a frase do montar). */
	const comoTexto = (valor: unknown) => (typeof valor === 'string' ? valor : '');
	const rotuloAlvo = $derived(comoTexto(r.targetLabel));
	const rotuloAluno = $derived(comoTexto(r.sourceLabel));
	const dirDoAluno = $derived<'ltr' | 'rtl'>(r.sourceDir === 'rtl' ? 'rtl' : 'ltr');

	/**
	 * A resposta dada aqui no formato do \`answerSchema\` da interação — o mesmo que
	 * o Player manda para o servidor corrigir. Nula quando ainda não há o que
	 * corrigir; a fala e a escrita livre não se corrigem fora do Player.
	 */
	export function resposta(): unknown | null {
		switch (r.interaction) {
			case 'choice':
				return escolha ? { optionId: escolha } : null;
			case 'assemble':
				return montagem.length > 0 ? { sequence: montagem } : null;
			case 'type':
			case 'cloze':
				return !r.gradedLater && texto.trim() ? { text: texto } : null;
			case 'match':
				return pares.length > 0 ? { pairs: pares } : null;
			case 'order':
				return ordem.length > 0 ? { sequence: ordem } : null;
			case 'select':
				return selecao ? { segmentId: selecao } : null;
			default:
				return null;
		}
	}
</script>

<p
	class="mb-3.5 font-display leading-tight font-semibold tracking-[-0.02em] {compacta
		? 'text-[20px]'
		: 'text-xl'}"
>
	{r.prompt}
</p>

{#if r.audio}
	<!-- Na moldura de celular, numa linha só — como no celular da home. -->
	<div class="mb-4"><AudioPlayer src={r.audio} srcSlow={r.audioSlow} emLinha={compacta} /></div>
{/if}

{#if r.passage}
	<!-- Como no Player: no "montar" a frase de apoio é a da língua do ALUNO (é dela
	     que ele traduz), e leva o nome do idioma. -->
	{#if r.interaction === 'assemble' && rotuloAluno}
		<p class="mb-2 text-[11px] font-bold tracking-[0.09em] text-base-content/65 uppercase">
			Em {rotuloAluno}
		</p>
	{/if}
	<div class="mb-4 rounded-box border border-line bg-base-200 p-4">
		<p
			dir={r.interaction === 'assemble' ? dirDoAluno : 'auto'}
			class="font-content leading-[1.65] {compacta ? 'text-[15px]' : 'text-[17px]'}"
		>
			{r.passage}
		</p>
	</div>
{/if}

{#if r.interaction === 'choice'}
	<ChoiceInteraction item={comoChoice(r)} bind:value={escolha} />
{:else if r.interaction === 'type' && r.gradedLater}
	<WritingInteraction
		item={{ dir: r.dir, instructions: r.prompt, maxLength: 600 } satisfies WritingRuntimeItem}
		bind:value={texto}
		storageKey="spokke:previa:{chave}"
	/>
{:else if r.interaction === 'type' || r.interaction === 'cloze'}
	<ClozeInteraction item={comoCloze(r)} bind:value={texto} feedback={veredito} />
{:else if r.interaction === 'assemble'}
	<AssembleInteraction item={comoAssemble(r)} bind:chosen={montagem} />
{:else if r.interaction === 'select'}
	<SelectInteraction item={comoSelect(r)} bind:value={selecao} />
{:else if r.interaction === 'match'}
	<MatchInteraction
		item={comoMatch(r)}
		bind:pairs={pares}
		leftLabel={rotuloAlvo}
		rightLabel={rotuloAluno}
		feedback={veredito}
	/>
{:else if r.interaction === 'order'}
	<OrderInteraction item={comoOrder(r)} bind:order={ordem} />
{:else if r.interaction === 'speak'}
	<SpeakInteraction item={comoSpeak(r)} bind:recording={gravando} />
{/if}

<!-- O veredito fica FORA da interação, como no Player. No associar ele vem só
     com a linha de estado: as ligações erradas já estão pintadas nos cartões. -->
{#if veredito}
	<div class="mt-4">
		<AnswerFeedback
			state={veredito.state}
			hint={veredito.hint}
			marks={r.interaction === 'match' ? undefined : veredito.marks}
			expected={r.interaction === 'match' ? undefined : veredito.expected}
			dir={r.dir}
		/>
	</div>
{/if}
