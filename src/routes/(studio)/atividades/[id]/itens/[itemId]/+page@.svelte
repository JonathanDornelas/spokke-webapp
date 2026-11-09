<script lang="ts">
	// Editor de questão — nível 3 (kernel.md). `+page@.svelte` reseta para o
	// layout raiz: é tarefa única, como o wizard.
	//
	// A tela pergunta na ordem em que a questão é lida pelo aluno: o que ele
	// FAZ, o enunciado, o que ele VÊ (ou ouve), e só então o que é certo — o
	// gabarito, numa moldura âmbar com cadeado, porque ele nunca vai para o
	// browser do aluno (regra inviolável 1). Por último, como é corrigida.
	//
	// **O que dá para mudar é decidido em `$lib/atividades/editor-item.ts`**, o
	// mesmo módulo que o servidor usa para aceitar ou recusar: a tela não
	// oferece o que o servidor recusaria. Antes havia seis tipos de questão
	// "clicáveis" que falhavam sempre ao salvar, um seletor de prompt que
	// deixava escolher "Imagem" sem haver imagem, e seis modos de correção dos
	// quais só um mudava a nota.
	//
	// **A prévia é a de verdade**: `previaDoItem` monta a questão com o que está
	// no formulário e passa pelo mesmo `buildRuntimeItem` do Player, e quem
	// desenha são os componentes do Player (`PreviaDaQuestao`).
	import { untrack } from 'svelte';
	import { beforeNavigate, goto, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import AmbientShapes from '$lib/components/AmbientShapes.svelte';
	import Alternador from '$lib/components/Alternador.svelte';
	import Loading from '$lib/components/Loading.svelte';
	import PreviaDaQuestao from '$lib/components/PreviaDaQuestao.svelte';
	import {
		chaveDoEnunciado,
		comoECorrigida,
		DETALHE_DO_MODO,
		modoInicial,
		modosDeCorrecao,
		podeAlternar,
		ROTULO_DA_INTERACAO,
		textoEditavel
	} from '$lib/atividades/editor-item';
	import type { GradingMode, InteractionKind } from '$lib/kernel/interactions/types';
	import { descartarItem, previaDoItem, salvarItem } from '../../../atividades.remote';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// ── o formulário ── Os campos são reiniciados sempre que o dado do servidor
	// muda: "Próxima questão" é a MESMA rota (sem isto o formulário da anterior
	// sobrevivia à navegação), e salvar recarrega o loader com o que foi gravado.
	const padraoDe = (chave: string | null | undefined) => (chave ? (data.padroes[chave] ?? '') : '');
	/** O retrato do que está gravado — é contra ele que "há mudanças" é medido. */
	function gravado() {
		const item = data.item;
		return {
			interaction: item.interaction,
			gradingMode: modoInicial(item.interaction, item.gradingMode),
			instruction: item.instruction || padraoDe(item.instructionKey),
			texto: item.texto,
			masked: item.masked,
			answer: item.answer,
			variants: [...item.variants]
		};
	}
	// Nascem PREENCHIDOS (senão a primeira prévia saía de um formulário vazio);
	// o efeito abaixo é quem os acompanha quando o dado muda.
	const inicial = untrack(gravado);
	let interaction = $state<InteractionKind>(inicial.interaction);
	let gradingMode = $state<GradingMode>(inicial.gradingMode);
	let instruction = $state(inicial.instruction);
	let texto = $state(inicial.texto);
	let masked = $state(inicial.masked);
	let answer = $state(inicial.answer);
	let variants = $state<string[]>(inicial.variants);
	let novaVariante = $state('');

	/** A chave do enunciado padrão do tipo ESCOLHIDO (`chaveDoEnunciado`). */
	const chaveAtual = $derived(
		chaveDoEnunciado(
			{
				interacao: data.item.interaction,
				chave: data.item.instructionKey ?? undefined,
				prompt: data.item.promptKind
			},
			interaction
		)
	);
	const padrao = $derived(padraoDe(chaveAtual));
	$effect(() => {
		const g = gravado();
		interaction = g.interaction;
		gradingMode = g.gradingMode;
		instruction = g.instruction;
		texto = g.texto;
		masked = g.masked;
		answer = g.answer;
		variants = g.variants;
		novaVariante = '';
	});

	const retrato = (x: ReturnType<typeof gravado>) => JSON.stringify(x);
	const alterado = $derived(
		retrato({ interaction, gradingMode, instruction, texto, masked, answer, variants }) !==
			retrato(gravado())
	);

	// ── o que dá para mudar ──
	const alterna = $derived(podeAlternar(data.item.interaction, data.item.lingua));
	const editaTexto = $derived(textoEditavel(interaction, data.item.promptKind));
	const modos = $derived(modosDeCorrecao(interaction, data.item.gradingMode));
	const audio = $derived(data.item.promptKind === 'audio');

	function trocarInteracao(nova: InteractionKind) {
		const anterior = interaction;
		// O enunciado que era o PADRÃO acompanha o tipo; o escrito pelo professor fica.
		const eraPadrao = instruction.trim() === padrao;
		interaction = nova;
		if (eraPadrao)
			instruction = padraoDe(
				chaveDoEnunciado(
					{
						interacao: data.item.interaction,
						chave: data.item.instructionKey ?? undefined,
						prompt: data.item.promptKind
					},
					nova
				)
			);
		// Lacuna → digitar: o aluno passa a escrever a frase INTEIRA, então a
		// resposta (e cada variante) é a frase com o buraco preenchido — ficar só
		// com a palavra da lacuna reprovaria quem escrevesse a frase certa.
		if (anterior === 'cloze' && nova === 'type' && /_{2,}/.test(masked) && answer.trim()) {
			const encher = (palavra: string) => masked.replace(/_{2,}/, palavra.trim());
			variants = variants.map(encher);
			answer = encher(answer);
		}
		// Digitar → lacuna: a frase nasce inteira, e o professor seleciona a
		// palavra que vira o buraco ("Lacuna na seleção").
		if (nova === 'cloze' && !masked.trim()) masked = answer.trim();
		if (!modosDeCorrecao(nova, data.item.gradingMode).includes(gradingMode)) {
			gradingMode = modosDeCorrecao(nova, data.item.gradingMode)[0];
		}
	}

	// ── a lacuna pela SELEÇÃO ── Escrever ___ na frase e a palavra no gabarito
	// são duas edições que precisam bater; selecionar a palavra faz as duas.
	let campoLacuna = $state<HTMLInputElement | null>(null);
	let temSelecao = $state(false);
	function acompanharSelecao() {
		const el = campoLacuna;
		temSelecao = !!el && (el.selectionEnd ?? 0) > (el.selectionStart ?? 0);
	}
	function lacunaNaSelecao() {
		const el = campoLacuna;
		if (!el) return;
		let frase = masked;
		let ini = el.selectionStart ?? 0;
		let fim = el.selectionEnd ?? 0;
		// Já havia uma lacuna: a palavra dela volta para a frase antes de abrir a
		// nova (uma lacuna por questão), e a seleção depois dela anda junto.
		const atual = /_{2,}/.exec(frase);
		if (atual && answer.trim()) {
			const depoisDaAtual = atual.index + atual[0].length;
			if (fim > atual.index && ini < depoisDaAtual) return;
			if (ini >= depoisDaAtual) {
				const delta = answer.trim().length - atual[0].length;
				ini += delta;
				fim += delta;
			}
			frase = frase.slice(0, atual.index) + answer.trim() + frase.slice(depoisDaAtual);
		}
		const trecho = frase.slice(ini, fim);
		const palavra = trecho.trim();
		if (!palavra) return;
		const antes = trecho.length - trecho.trimStart().length;
		const depois = trecho.length - trecho.trimEnd().length;
		masked = frase.slice(0, ini + antes) + '___' + frase.slice(fim - depois);
		answer = palavra;
		variants = [];
		temSelecao = false;
	}

	function adicionarVariante() {
		const v = novaVariante.trim();
		if (!v || v === answer.trim() || variants.includes(v)) {
			novaVariante = '';
			return;
		}
		variants = [...variants, v];
		novaVariante = '';
	}

	// O gabarito no formato do `authoringSchema` do tipo, nos tipos que o editor
	// monta; nos outros o campo não vai e o servidor mantém o que o gerador fez.
	const payload = $derived.by(() => {
		if (!data.item.gabaritoEditavel) return undefined;
		const aceitas = [...new Set([answer, ...variants].map((v) => v.trim()).filter(Boolean))];
		return JSON.stringify(
			interaction === 'cloze' ? { masked, accepted: aceitas } : { accepted: aceitas }
		);
	});

	/** O que ainda falta para salvar — em texto, não num botão cinza sem motivo. */
	const impedimento = $derived.by(() => {
		if (!instruction.trim() && !padrao)
			return 'Escreva o enunciado: este tipo de questão não tem um padrão.';
		if (audio && editaTexto && !texto.trim()) return 'Escreva o que o aluno vai ouvir.';
		if (data.item.texto && editaTexto && !texto.trim()) return 'Escreva o texto que o aluno lê.';
		if (!data.item.gabaritoEditavel) return '';
		if (interaction === 'cloze' && !/_{2,}/.test(masked)) {
			return 'Marque a lacuna na frase com ___ (três sublinhados).';
		}
		if (!answer.trim()) return 'Preencha a resposta esperada.';
		return '';
	});

	/** No áudio de "digitar", o que o aluno ouve É o que ele tem de escrever. */
	const desencontro = $derived(
		audio &&
			interaction === 'type' &&
			data.item.lingua === 'target' &&
			texto.trim() !== '' &&
			answer.trim() !== '' &&
			texto.trim().toLocaleLowerCase() !== answer.trim().toLocaleLowerCase()
	);

	// ── salvar ──
	let formulario = $state<HTMLFormElement | null>(null);
	let salvando = $state(false);
	let salvoAgora = $state(false);
	let erroAoSalvar = $state<string | null>(null);
	/** Para onde ir depois de salvar, quando a saída foi barrada por mudanças. */
	let destino = $state<URL | null>(null);
	let liberado = false;

	const enviar = salvarItem.enhance(async ({ submit }) => {
		salvando = true;
		erroAoSalvar = null;
		try {
			await submit();
			const r = salvarItem.result;
			if (r?.ok) {
				salvoAgora = true;
				if (destino) {
					const ir = destino;
					destino = null;
					liberado = true;
					// O destino é a URL da navegação que o guarda barrou — já resolvida.
					// eslint-disable-next-line svelte/no-navigation-without-resolve
					await goto(ir);
				}
			} else {
				erroAoSalvar = r?.error ?? 'Não deu para salvar agora.';
			}
		} catch {
			erroAoSalvar = 'Não deu para salvar agora. Tente de novo em instantes.';
		} finally {
			salvando = false;
		}
	});

	// "Salvo" é do salvamento de AGORA: mexer de novo ou trocar de questão apaga.
	$effect(() => {
		if (alterado) salvoAgora = false;
	});
	// Pelo ID, num derived: salvar recarrega `data` inteiro (mesma questão), e
	// preso ao objeto este efeito apagava o "Salvo" no instante em que aparecia.
	const idDaQuestao = $derived(data.item.id);
	$effect(() => {
		void idDaQuestao;
		salvoAgora = false;
		erroAoSalvar = null;
		destino = null;
		liberado = false;
	});

	// **Sair com mudanças não some com elas em silêncio.** "Próxima questão" é um
	// link: antes, o que estava digitado se perdia sem aviso.
	beforeNavigate((nav) => {
		if (!alterado || liberado) return;
		nav.cancel();
		if (nav.type !== 'leave' && nav.to) destino = nav.to.url;
	});
	function descartarESair() {
		const ir = destino;
		destino = null;
		liberado = true;
		// O destino é a URL da navegação que o guarda barrou — já resolvida.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		if (ir) void goto(ir);
	}
	function salvarESair() {
		formulario?.requestSubmit();
	}

	// ── questão descartada ──
	let restaurando = $state(false);
	async function restaurar() {
		restaurando = true;
		try {
			await descartarItem({
				activityId: data.activity.id,
				itemId: data.item.id,
				descartado: false
			});
			await invalidateAll();
		} finally {
			restaurando = false;
		}
	}

	// ── a prévia ── Pedida depois de uma pausa na digitação, e a anterior fica
	// na tela enquanto a nova não chega — senão o celular piscava a cada letra.
	const pedido = $derived({
		activityId: data.activity.id,
		itemId: data.item.id,
		interaction,
		payload,
		promptText: texto,
		instruction,
		gradingMode
	});
	let pedidoDaPrevia = $state.raw(untrack(() => pedido));
	$effect(() => {
		const p = pedido;
		const t = setTimeout(() => (pedidoDaPrevia = p), 350);
		return () => clearTimeout(t);
	});
	const consulta = $derived(previaDoItem(pedidoDaPrevia));
	type Previa = Awaited<ReturnType<typeof previaDoItem>>;
	let previa = $state.raw<Previa | null>(null);
	$effect(() => {
		if (consulta.ready) previa = consulta.current;
	});

	function href(itemId: string) {
		return resolve('/(studio)/atividades/[id]/itens/[itemId]', {
			id: data.activity.id,
			itemId
		});
	}

	const naoAceitaVariacao = $derived(
		[
			data.resposta.ignoraCaixa ? 'maiúscula' : '',
			data.resposta.ignoraPontuacao ? 'pontuação' : '',
			data.resposta.ignoraAcento ? 'acento' : ''
		].filter(Boolean)
	);
	/** "Inglês (EUA)" no meio da frase: só a primeira letra baixa — a sigla fica. */
	const noMeio = (rotulo: string) => rotulo.charAt(0).toLocaleLowerCase('pt-BR') + rotulo.slice(1);
	const juntar = (partes: string[]) =>
		partes.length <= 1
			? (partes[0] ?? '')
			: `${partes.slice(0, -1).join(', ')} nem de ${partes.at(-1)}`;
</script>

<svelte:head><title>Questão {data.item.index} — Spokke</title></svelte:head>

{#snippet icone(d: string, classe = 'size-4')}
	<svg class="{classe} flex-none" viewBox="0 0 24 24" fill="none" aria-hidden="true"
		><path
			{d}
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
		/></svg
	>
{/snippet}

<div class="min-h-screen bg-base-200 py-6 lg:py-8">
	<div class="mx-auto max-w-[1180px] overflow-hidden rounded-box border border-line bg-base-100">
		<!-- a barra: de onde veio, onde está, e as setas -->
		<div
			class="flex flex-wrap items-center gap-x-3.5 gap-y-2.5 border-b border-line bg-base-200 px-5 py-3.5 lg:px-[26px]"
		>
			<a
				href={resolve('/(studio)/atividades/[id]/revisar', { id: data.activity.id })}
				class="flex items-center gap-2 py-2 text-[13.5px] font-semibold text-base-content/65 no-underline transition-transform hover:-translate-x-0.5"
			>
				{@render icone('M15 5l-7 7 7 7')}
				Revisão
			</a>
			<span class="font-display text-[20px] font-semibold"
				>Questão {data.item.index} de {data.itemCount}</span
			>
			{#if alterado}
				<span
					class="flex items-center gap-1.5 text-[12.5px] font-semibold text-base-content/70"
					role="status"
				>
					<span class="size-2 rounded-full bg-primary" aria-hidden="true"></span>
					mudanças não salvas
				</span>
			{:else if salvoAgora}
				<span
					class="flex items-center gap-1.5 text-[12.5px] font-semibold text-primary"
					role="status"
				>
					{@render icone('M5 12.5l4.5 4.5L19 7', 'size-3.5')}
					Salvo
				</span>
			{/if}
			<div class="flex-1"></div>
			<!-- Na ponta da lista o botão fica visível e desabilitado: escondê-lo
			     faria a barra mudar de largura de uma questão para a outra. -->
			{#if data.prevId}
				<a
					href={href(data.prevId)}
					class="btn btn-sm motion-tap btn-neutral font-semibold no-underline">Anterior</a
				>
			{:else}
				<span class="btn-disabled btn btn-sm btn-neutral font-semibold">Anterior</span>
			{/if}
			{#if data.nextId}
				<a href={href(data.nextId)} class="btn btn-sm motion-tap btn-primary font-bold no-underline"
					>Próxima</a
				>
			{:else}
				<span class="btn-disabled btn btn-sm btn-primary font-bold">Próxima</span>
			{/if}
		</div>

		{#if destino}
			<!-- A saída foi barrada: as mudanças não somem sem o professor dizer. -->
			<div
				class="flex flex-wrap items-center gap-x-3 gap-y-2.5 border-b border-line bg-base-100 px-5 py-3 lg:px-[26px]"
				role="alert"
			>
				<p class="min-w-[14rem] flex-1 text-[13.5px] font-semibold">
					Esta questão tem mudanças que ainda não foram salvas.
				</p>
				<button
					type="button"
					onclick={() => (destino = null)}
					class="btn btn-sm motion-tap btn-plain">Continuar editando</button
				>
				<button
					type="button"
					onclick={descartarESair}
					class="btn btn-sm motion-tap btn-outline-error font-semibold">Descartar e sair</button
				>
				<button
					type="button"
					onclick={salvarESair}
					disabled={!!impedimento || salvando}
					class="btn btn-sm motion-tap btn-primary font-bold">Salvar e sair</button
				>
			</div>
		{/if}

		{#if data.item.descartado}
			<div
				class="flex flex-wrap items-center gap-x-3 gap-y-2.5 border-b border-line bg-base-100 px-5 py-3 lg:px-[26px]"
			>
				<p class="min-w-[14rem] flex-1 text-[13.5px]">
					<strong class="font-semibold">Esta questão está descartada</strong> — ela não vai para o aluno.
					Dá para editar e restaurar.
				</p>
				<button
					type="button"
					onclick={restaurar}
					disabled={restaurando}
					class="btn btn-sm motion-tap gap-2 btn-outline font-bold"
				>
					{#if restaurando}<Loading
							variant="fila"
							size={9}
							tone="current"
							label="Restaurando"
						/>{/if}
					Restaurar
				</button>
			</div>
		{/if}

		<div class="grid lg:grid-cols-[minmax(0,1fr)_420px]">
			<form bind:this={formulario} {...enviar} class="grid min-w-0 content-start gap-8 p-5 lg:p-8">
				<input type="hidden" name="activityId" value={data.activity.id} />
				<input type="hidden" name="itemId" value={data.item.id} />
				<input type="hidden" name="interaction" value={interaction} />
				<input type="hidden" name="gradingMode" value={gradingMode} />
				{#if payload !== undefined}<input type="hidden" name="payload" value={payload} />{/if}

				<!-- 1. o que o aluno faz -->
				<section class="grid gap-3" aria-labelledby="titulo-faz">
					<h2 id="titulo-faz" class="text-[15px] font-bold">O que o aluno faz</h2>
					{#if alterna}
						<Alternador
							opcoes={[
								{ id: 'type' as const, label: ROTULO_DA_INTERACAO.type },
								{ id: 'cloze' as const, label: ROTULO_DA_INTERACAO.cloze }
							]}
							valor={interaction === 'cloze' ? 'cloze' : 'type'}
							onmudar={trocarInteracao}
							rotulo="O que o aluno faz"
							largura="cheia"
						/>
						<p class="text-[12.5px] leading-snug text-base-content/65">
							{interaction === 'cloze'
								? 'O aluno vê a frase com um buraco e escreve só o que falta.'
								: 'O aluno escreve a resposta inteira.'}
							Treina {data.item.habilidades.join(' e ').toLocaleLowerCase('pt-BR')}.
						</p>
					{:else}
						<p class="flex flex-wrap items-center gap-2.5">
							<span
								class="rounded-full border-[1.5px] border-primary bg-base-300 px-3.5 py-1.5 text-[13px] font-bold text-primary"
							>
								{ROTULO_DA_INTERACAO[interaction]}
							</span>
							<span class="text-[12.5px] text-base-content/65">
								treina {data.item.habilidades.join(' e ').toLocaleLowerCase('pt-BR')}
							</span>
						</p>
						<p class="text-[12.5px] leading-snug text-base-content/65">
							{#if data.item.gabaritoEditavel}
								O aluno responde em {noMeio(data.resposta.idioma)}, por isso esta questão não vira
								lacuna: o buraco ficaria na frase de um idioma e a resposta, no outro.
							{:else}
								As peças desta questão foram montadas a partir do material. Para trocá-las, edite o
								material e gere as questões de novo; aqui dá para mudar o enunciado
								{data.item.promptKind === 'text' ? 'e o texto que o aluno lê' : ''}.
							{/if}
						</p>
					{/if}
				</section>

				<!-- 2. o enunciado -->
				<section class="grid gap-1.5">
					<label for="enunciado" class="text-[15px] font-bold">Enunciado</label>
					<input
						id="enunciado"
						name="instruction"
						bind:value={instruction}
						placeholder={padrao || 'Ex.: Escreva a frase em inglês.'}
						class="input w-full text-[15px]"
					/>
					<p class="text-[12.5px] leading-snug text-base-content/65">
						{#if !padrao}
							Este tipo de questão não tem um enunciado padrão: escreva o seu.
						{:else if instruction.trim() === padrao}
							É o enunciado padrão deste tipo.
						{:else}
							Personalizado.
							<button
								type="button"
								onclick={() => (instruction = padrao)}
								class="font-semibold text-primary">Voltar ao padrão ("{padrao}")</button
							>
						{/if}
					</p>
				</section>

				<!-- 3. o que o aluno vê ou ouve -->
				<section class="grid gap-4">
					<div class="grid gap-1.5">
						<label for="texto-questao" class="text-[15px] font-bold">
							{audio ? 'O que o aluno ouve' : 'O que o aluno lê'}
							<!-- Opcional só na questão criada sem texto: numa "traduza" ou "monte
							     a frase" o texto é a própria questão. -->
							{#if !audio && !data.item.texto}<span
									class="text-[12.5px] font-normal text-base-content/60">· opcional</span
								>{/if}
						</label>
						<input
							id="texto-questao"
							name="promptText"
							bind:value={texto}
							readonly={!editaTexto}
							dir="auto"
							class="input w-full font-content text-[15px] read-only:bg-base-200 read-only:text-base-content/70"
						/>
						<p class="text-[12.5px] leading-snug text-base-content/65">
							{#if audio && !editaTexto}
								É o texto do áudio, e as peças da questão saíram dele: mudá-lo aqui faria o aluno
								ouvir uma frase e responder sobre outra.
							{:else if audio}
								Nunca aparece escrito: o aluno só ouve. Mudou o texto, o áudio é gerado de novo ao
								salvar.
							{:else}
								Aparece na questão, acima da resposta.
							{/if}
						</p>
						{#if desencontro}
							<p
								class="flex items-start gap-2 text-[12.5px] leading-snug font-semibold text-base-content/80"
							>
								{@render icone(
									'M12 7.5v6M12 16.5h.01M12 3l9.5 17H2.5z',
									'mt-px size-3.5 text-primary'
								)}
								O aluno ouve uma frase e a resposta esperada é outra. Confira se as duas batem.
							</p>
						{/if}
					</div>

					{#if interaction === 'cloze'}
						<div class="grid gap-1.5">
							<label for="frase-lacuna" class="text-[15px] font-bold">Frase com a lacuna</label>
							<input
								id="frase-lacuna"
								bind:this={campoLacuna}
								bind:value={masked}
								onselect={acompanharSelecao}
								onkeyup={acompanharSelecao}
								onmouseup={acompanharSelecao}
								onblur={() => setTimeout(acompanharSelecao, 150)}
								dir={data.resposta.dir}
								placeholder="She ___ been working here since 2019."
								class="input w-full font-content text-[15px]"
							/>
							<p class="text-[12.5px] leading-snug text-base-content/65">
								Selecione a palavra que vira o buraco e use "Lacuna na seleção" — ou escreva
								<span class="font-mono">___</span> no lugar dela. O aluno vê o buraco do tamanho da resposta:
								o comprimento ele vê, as letras nunca.
							</p>
							<button
								type="button"
								onmousedown={(e) => e.preventDefault()}
								onclick={lacunaNaSelecao}
								disabled={!temSelecao}
								class="btn btn-sm w-fit motion-tap btn-neutral font-semibold"
								>Lacuna na seleção</button
							>
						</div>
					{/if}
				</section>

				<!-- 4. o gabarito: só o professor vê -->
				<fieldset class="overflow-hidden rounded-box border-[1.5px] border-warning p-0">
					<legend class="sr-only">Resposta certa</legend>
					<div
						class="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-warning/30 bg-warning/12 px-4 py-[11px]"
					>
						{@render icone(
							'M6.5 10.5V7.5a5.5 5.5 0 0111 0v3M5 10.5h14v10H5z',
							'size-[17px] text-warning'
						)}
						<span class="text-[13.5px] font-bold text-warning">Resposta certa</span>
						<span class="text-[12px] text-base-content/65">só você vê — nunca vai para o aluno</span
						>
					</div>
					<div class="grid gap-4 bg-warning/5 p-[18px]">
						{#if data.item.gabaritoEditavel}
							<label class="grid gap-1.5">
								<span class="text-[13px] font-semibold">
									Resposta esperada
									{#if data.item.lingua === 'source'}<span class="font-normal text-base-content/60"
											>· em {noMeio(data.resposta.idioma)}</span
										>{/if}
								</span>
								<input
									bind:value={answer}
									dir={data.resposta.dir}
									class="w-full rounded-field border border-warning/40 bg-base-100 px-3.5 py-2.5 font-content text-[15px]"
								/>
							</label>

							<div class="grid gap-2">
								<p class="text-[13px] font-semibold">Também aceitas</p>
								{#if variants.length > 0}
									<ul class="flex list-none flex-wrap gap-1.5 p-0">
										{#each variants as v (v)}
											<li
												class="flex items-center gap-1.5 rounded-full border border-line bg-base-100 py-1.5 ps-3 pe-2 font-content text-[13.5px]"
												dir="auto"
											>
												{v}
												<button
													type="button"
													onclick={() => (variants = variants.filter((x) => x !== v))}
													class="grid size-[22px] place-items-center rounded-full text-base-content/65 hover:bg-base-200 hover:text-error"
													aria-label="Remover {v}"
												>
													{@render icone('M6 6l12 12M18 6L6 18', 'size-[11px]')}
												</button>
											</li>
										{/each}
									</ul>
								{/if}
								<div class="flex gap-2">
									<input
										bind:value={novaVariante}
										onkeydown={(e) => {
											if (e.key === 'Enter') {
												e.preventDefault();
												adicionarVariante();
											}
										}}
										dir={data.resposta.dir}
										placeholder="Outra resposta que também está certa"
										aria-label="Outra resposta aceita"
										class="min-w-0 flex-1 rounded-field border border-warning/40 bg-base-100 px-3.5 py-2 font-content text-[14px]"
									/>
									<button
										type="button"
										onclick={adicionarVariante}
										disabled={!novaVariante.trim()}
										class="btn btn-sm motion-tap btn-neutral font-semibold">Adicionar</button
									>
								</div>
								{#if naoAceitaVariacao.length > 0}
									<p class="text-[12.5px] leading-snug text-base-content/65">
										Não precisa cadastrar variação só de {juntar(naoAceitaVariacao)}: em
										{noMeio(data.resposta.idioma)}, a correção já ignora.
									</p>
								{/if}
								{#if gradingMode === 'rubric'}
									<p class="text-[12.5px] leading-snug text-base-content/65">
										Na escrita livre, a resposta esperada serve só de referência para você ao
										corrigir.
									</p>
								{/if}
							</div>
						{:else}
							<div class="grid gap-1.5">
								<span class="text-[13px] font-semibold">Resposta</span>
								<p
									class="rounded-field border border-warning/30 bg-base-100 px-3.5 py-2.5 font-content text-[15px]"
									dir="auto"
								>
									{data.item.answer || '—'}
								</p>
								{#if data.item.variants.length > 0}
									<p class="text-[12.5px] text-base-content/65">
										Também aceitas: <span class="font-content"
											>{data.item.variants.join(' · ')}</span
										>
									</p>
								{/if}
							</div>
						{/if}
					</div>
				</fieldset>

				<!-- 5. a correção -->
				<section class="grid gap-2.5" aria-labelledby="titulo-correcao">
					<h2 id="titulo-correcao" class="text-[15px] font-bold">Como é corrigida</h2>
					{#if modos.length > 1}
						<div class="grid gap-2 sm:grid-cols-2">
							{#each modos as modo (modo)}
								<label
									class="flex cursor-pointer items-start gap-3 rounded-box border-[1.5px] border-line bg-base-100 px-3.5 py-3 transition-colors hover:border-primary/60 has-[:checked]:border-primary has-[:checked]:bg-primary/6"
								>
									<input type="radio" value={modo} bind:group={gradingMode} class="mt-0.5 radio" />
									<span class="min-w-0">
										<span class="block text-[14px] font-bold"
											>{modo === 'rubric' ? 'Você corrige' : 'Automática'}</span
										>
										<span class="block text-[12.5px] leading-snug text-base-content/65"
											>{DETALHE_DO_MODO[modo] ?? comoECorrigida(interaction, modo)}</span
										>
									</span>
								</label>
							{/each}
						</div>
					{:else}
						<p class="text-[13px] leading-snug text-base-content/70">
							{comoECorrigida(interaction, gradingMode)}
						</p>
					{/if}
				</section>

				<!-- salvar -->
				<div class="grid gap-3 border-t border-line pt-6">
					{#if impedimento}
						<p
							class="flex items-center gap-2 rounded-field border-s-[3px] border-primary bg-base-200 px-3 py-2.5 text-[13px]"
							role="status"
						>
							{@render icone(
								'M12 7.5v5.5M12 16.5h.01M12 3a9 9 0 100 18 9 9 0 000-18z',
								'size-4 text-primary'
							)}
							{impedimento}
						</p>
					{/if}
					{#if erroAoSalvar}
						<p class="text-[13px] font-semibold text-error" role="alert">{erroAoSalvar}</p>
					{/if}
					<div class="flex flex-wrap items-center gap-3">
						<button
							type="submit"
							disabled={!!impedimento || salvando || !alterado}
							class="btn h-[46px] motion-tap gap-2.5 btn-primary font-bold"
						>
							{#if salvando}
								<Loading variant="fila" size={12} tone="current" label="Salvando" />
								Salvando…
							{:else}
								Salvar questão
							{/if}
						</button>
						<p class="min-w-[14rem] flex-1 text-[12.5px] leading-snug text-base-content/65">
							{alterado ? '' : 'Nada mudou ainda. '}Vale para o aluno quando você publicar.{data.jaNoAr
								? ' O que está no ar não muda até lá.'
								: ''}
						</p>
					</div>
				</div>
			</form>

			<!-- A prévia: as formas vivem no PAINEL, nunca dentro do celular (lá
			     ficariam atrás do enunciado e da resposta — design-system.md). -->
			<aside
				class="relative overflow-hidden border-t border-line bg-base-200 px-5 py-6 lg:border-s lg:border-t-0 lg:px-6"
			>
				<AmbientShapes height="190px" edges="bottom" scale={0.62} />

				<div class="relative z-1 mb-1.5 flex items-center gap-2.5">
					<h2 class="text-[15px] font-bold">O que o aluno vê</h2>
					{#if consulta.loading}<Loading
							variant="fila"
							size={8}
							label="Atualizando a prévia"
						/>{/if}
				</div>
				<p class="relative z-1 mb-4 text-[12.5px] leading-snug text-base-content/65">
					Montada pelo mesmo caminho do link, com o que está no formulário — mesmo antes de salvar.
				</p>

				<div
					class="relative z-1 mx-auto flex min-h-[560px] w-full max-w-[340px] flex-col overflow-hidden rounded-[30px] border-8 border-bezel bg-base-100"
				>
					<div
						class="flex shrink-0 items-center gap-2.5 px-[15px] pt-3.5 pb-2.5"
						aria-hidden="true"
					>
						<span class="size-7 shrink-0 rounded-full bg-base-200"></span>
						<div class="h-2 flex-1 overflow-hidden rounded-full bg-base-300">
							<div
								class="h-full origin-left bg-primary"
								style="width: {(data.item.index / data.itemCount) * 100}%"
							></div>
						</div>
						<span class="font-mono text-[11px] text-base-content/60"
							>{data.item.index}/{data.itemCount}</span
						>
					</div>
					<div
						class="flex min-h-0 flex-1 flex-col overflow-y-auto px-[17px] pt-3.5 pb-5"
						data-surface="player"
					>
						{#if previa?.ok}
							<p class="mb-2.5 text-[11px] font-bold text-primary">{previa.runtime.skillLabel}</p>
							{#key previa.runtime}
								<PreviaDaQuestao runtime={previa.runtime} chave={data.item.id} compacta />
							{/key}
							{#if previa.audioPendente}
								<p class="mt-3 text-[12px] leading-snug text-base-content/65">
									O áudio desta frase é gerado quando você salvar.
								</p>
							{/if}
							<div class="min-h-3.5 flex-1"></div>
							<p
								class="mt-4 rounded-field bg-primary py-3 text-center text-[15px] font-bold text-primary-content"
								aria-hidden="true"
							>
								{previa.runtime.gradedLater ? 'Enviar' : 'Verificar'}
							</p>
						{:else if previa && !previa.ok}
							<p
								class="m-auto max-w-[24ch] text-center text-[13px] leading-snug text-base-content/65"
							>
								{previa.error}
							</p>
						{:else if consulta.error}
							<p
								class="m-auto max-w-[24ch] text-center text-[13px] leading-snug text-base-content/65"
							>
								Não deu para montar a prévia agora.
							</p>
						{:else}
							<div class="grid gap-3">
								<div class="h-6 w-3/4 skeleton"></div>
								<div class="h-12 skeleton"></div>
								<div class="h-12 skeleton"></div>
							</div>
						{/if}
					</div>
				</div>
			</aside>
		</div>
	</div>
</div>
