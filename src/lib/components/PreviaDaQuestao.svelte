<script lang="ts">
	// UMA questão como o aluno vê: o enunciado, o áudio, o texto de apoio e a
	// interação — pelos MESMOS componentes do Player, a partir do payload de
	// `toRuntime()` (via `buildRuntimeItem`, no servidor). O que aparece aqui é
	// exatamente o que chega no browser do aluno (regra inviolável 1).
	//
	// Usada na prévia da atividade inteira (`atividades/[id]/previa`) e no editor
	// de questão, onde ela acompanha o formulário. Nada é enviado nem corrigido:
	// a resposta é estado local, só para os componentes serem manipuláveis.
	// Quem troca de questão remonta o componente (`{#key}`), e a resposta zera.
	import AudioPlayer from './AudioPlayer.svelte';
	import AssembleInteraction from './interactions/AssembleInteraction.svelte';
	import ChoiceInteraction from './interactions/ChoiceInteraction.svelte';
	import ClozeInteraction from './interactions/ClozeInteraction.svelte';
	import MatchInteraction from './interactions/MatchInteraction.svelte';
	import OrderInteraction from './interactions/OrderInteraction.svelte';
	import SelectInteraction from './interactions/SelectInteraction.svelte';
	import SpeakInteraction from './interactions/SpeakInteraction.svelte';
	import WritingInteraction from './interactions/WritingInteraction.svelte';
	import type {
		AssembleRuntimeItem,
		ChoiceRuntimeItem,
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
		compacta = false
	}: {
		runtime: RuntimeDaQuestao;
		/** Identifica a questão — o rascunho da escrita livre é guardado por ela. */
		chave: string;
		/** Dentro da moldura de celular do editor: enunciado um pouco menor. */
		compacta?: boolean;
	} = $props();

	// Precisa nascer PREENCHIDO: `bind:` num valor `undefined` estoura quando a
	// prop do componente tem valor padrão.
	let texto = $state('');
	let escolha = $state('');
	let montagem = $state<string[]>([]);
	let selecao = $state('');
	let pares = $state<MatchPair[]>([]);
	let ordem = $state<string[]>([]);
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
</script>

<p
	class="mb-3.5 font-display leading-tight font-semibold tracking-[-0.02em] {compacta
		? 'text-[20px]'
		: 'text-xl'}"
>
	{r.prompt}
</p>

{#if r.audio}
	<div class="mb-4"><AudioPlayer src={r.audio} srcSlow={r.audioSlow} /></div>
{/if}

{#if r.passage}
	<div class="mb-4 rounded-box border border-line bg-base-200 p-4">
		<p dir="auto" class="font-content leading-[1.65] {compacta ? 'text-[15px]' : 'text-[17px]'}">
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
		storageKey="entendo:previa:{chave}"
	/>
{:else if r.interaction === 'type' || r.interaction === 'cloze'}
	<ClozeInteraction item={comoCloze(r)} bind:value={texto} />
{:else if r.interaction === 'assemble'}
	<AssembleInteraction item={comoAssemble(r)} bind:chosen={montagem} />
{:else if r.interaction === 'select'}
	<SelectInteraction item={comoSelect(r)} bind:value={selecao} />
{:else if r.interaction === 'match'}
	<MatchInteraction item={comoMatch(r)} bind:pairs={pares} />
{:else if r.interaction === 'order'}
	<OrderInteraction item={comoOrder(r)} bind:order={ordem} />
{:else if r.interaction === 'speak'}
	<SpeakInteraction item={comoSpeak(r)} bind:recording={gravando} />
{/if}
