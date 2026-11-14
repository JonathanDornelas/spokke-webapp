<script lang="ts">
	// A etapa 1 do wizard: título, idiomas e nível. A MESMA tela para criar
	// (`nova`) e para voltar a uma atividade que já existe (`[id]/detalhes`) — o
	// "voltar" da etapa de materiais não pode criar outra atividade. A página é
	// dona do `<form>` (cada uma com a sua remote function); aqui ficam os campos.
	//
	// O desenho é o do Claude Design: o formulário à esquerda e, à direita, em 42%
	// da largura, "O que sai daqui" — uma questão resumida de cada tipo, no idioma
	// e no nível escolhidos. As duas colunas ficam centralizadas na vertical.
	// Quantas questões e de quais tipos é a etapa de materiais.
	import type { Snippet } from 'svelte';
	import WizardShell from '$lib/components/WizardShell.svelte';
	import QuestaoResumida from '$lib/components/QuestaoResumida.svelte';
	import { getProfile, languageLabels, tagForLabel } from '$lib/kernel/language/profiles';
	import { NIVEIS, type NivelId } from '$lib/atividades/nivel';
	import { amostrasDaEtapa1 } from '$lib/atividades/amostras';

	let {
		valores,
		idiomasTravados = null,
		backHref,
		backLabel,
		enviando = false,
		bloqueado = false,
		aviso,
		extra
	}: {
		valores: { title: string; alvo: string; aluno: string; nivel: NivelId | null };
		/** Por que os idiomas não mudam mais (há material ou questão). Nulo = livres. */
		idiomasTravados?: string | null;
		backHref: string;
		backLabel: string;
		enviando?: boolean;
		bloqueado?: boolean;
		/** O bloqueio do plano, antes dos campos. */
		aviso?: Snippet;
		/** Campos escondidos da página (o id da atividade). */
		extra?: Snippet;
	} = $props();

	/** Os idiomas cadastrados, na ordem do profile — nunca escritos aqui. */
	const idiomas = Object.keys(languageLabels);

	// Nascem no que está gravado e mudam com o professor (um $derived que aceita
	// escrita). Os campos são LIGADOS: com `value=` solto, o que foi digitado antes
	// de a página hidratar voltava ao valor inicial.
	let titulo = $derived(valores.title);
	let alvo = $derived(valores.alvo);
	let aluno = $derived(valores.aluno);
	let nivel = $derived<NivelId | null>(valores.nivel);

	// O nível é opcional: clicar no escolhido de novo o tira.
	function escolherNivel(id: NivelId) {
		nivel = nivel === id ? null : id;
	}
	const nomeDoNivel = $derived(NIVEIS.find((n) => n.id === nivel)?.nome ?? null);

	// "O que sai daqui" acompanha o idioma escolhido: amostra em inglês numa
	// atividade de japonês seria mentira. Idioma sem voz apaga a escuta.
	const perfil = $derived(getProfile(tagForLabel(alvo)));
	const amostras = $derived(
		amostrasDaEtapa1(perfil.tag, nivel, { semEscuta: perfil.tts.voices.length === 0 })
	);
	// O chip do desenho é "inglês · B1": o nome do idioma, sem a região (o
	// seletor ao lado já diz qual). O nível é mono e tem sempre duas letras, e o
	// chip RESERVA esse lugar mesmo sem nível — crescendo ao escolher um, ele
	// apertava o título ao lado, que quebrava em mais uma linha e empurrava os
	// cartões.
	const idiomaDoChip = $derived(alvo.replace(/\s*\(.*\)\s*$/, '').toLocaleLowerCase('pt-BR'));
	const INCLINACAO = [-1.1, 0.9, 0.8, -0.9];
</script>

<WizardShell
	step={1}
	{backHref}
	{backLabel}
	status="Rascunho salvo"
	hint="Nada aqui é definitivo: o rascunho só vira atividade quando você publicar."
	larguraAside="larga"
>
	{@render extra?.()}
	<!-- O bloco fica no MEIO da coluna, nos dois eixos, e nada nele muda de altura
	     com o que se escolhe: a coluna é centralizada, e qualquer linha a mais
	     moveria o bloco inteiro. -->
	<div class="mx-auto my-auto w-full max-w-[608px] px-4 py-8 lg:px-[34px] lg:py-[34px]">
		<h1
			class="mb-[9px] font-display text-[23px] leading-[1.16] font-semibold tracking-[-0.022em] lg:text-[28px] lg:leading-[1.12]"
		>
			Sobre a atividade
		</h1>
		<p class="mb-7 max-w-[52ch] text-[14px] leading-relaxed text-base-content/65 lg:text-[15px]">
			Só o essencial para começar. Tudo aqui pode mudar até você publicar.
		</p>

		{@render aviso?.()}

		<div class="grid gap-[18px]">
			<label class="block">
				<span class="mb-[7px] block text-[13px] font-semibold">Título</span>
				<input
					name="title"
					required
					bind:value={titulo}
					class="input min-h-12 w-full border-[1.5px] border-primary text-[15px]"
					placeholder="Present perfect, turma B"
				/>
				<span class="mt-[7px] block text-[12.5px] leading-normal text-base-content/65">
					Só você vê. O aluno vê o título só se você quiser mostrá-lo na capa.
				</span>
			</label>

			<div class="grid gap-[18px] sm:grid-cols-2 sm:gap-3.5">
				<!-- Os dois selects ITERAM `languageLabels`: um idioma cadastrado serve
				     de alvo e de origem, e escritos à mão eles ficavam para trás. -->
				<label class="block min-w-0">
					<span class="mb-[7px] block text-[13px] font-semibold">Idioma alvo</span>
					<select
						name="targetLang"
						bind:value={alvo}
						disabled={!!idiomasTravados}
						class="select min-h-12 w-full text-[15px]"
					>
						{#each idiomas as rotulo (rotulo)}
							<option value={rotulo}>{rotulo}</option>
						{/each}
					</select>
				</label>
				<label class="block min-w-0">
					<span class="mb-[7px] block text-[13px] font-semibold">Idioma do aluno</span>
					<select
						name="sourceLang"
						bind:value={aluno}
						disabled={!!idiomasTravados}
						class="select min-h-12 w-full text-[15px]"
					>
						{#each idiomas as rotulo (rotulo)}
							<option value={rotulo}>{rotulo}</option>
						{/each}
					</select>
				</label>
			</div>
			{#if idiomasTravados}
				<p class="-mt-2 text-[12.5px] leading-snug text-base-content/65">{idiomasTravados}</p>
			{/if}

			<!-- O nível é um RÓTULO (CEFR): organiza a lista, filtra e aparece para o
			     aluno. Não muda os exercícios gerados (adr-004-modulos-e-nivel.md). -->
			<div role="group" aria-labelledby="nivel-rotulo" class="min-w-0">
				<!-- O nome do nível escolhido vai na linha do rótulo, numa linha só: na
				     frase de baixo ele fazia "Intermediário superior" quebrar em três
				     linhas e o bloco inteiro andar. -->
				<p
					id="nivel-rotulo"
					class="mb-[7px] flex items-baseline justify-between gap-2.5 text-[13px] font-semibold"
				>
					Nível
					{#if nomeDoNivel}
						<span class="min-w-0 truncate text-[12px] font-semibold text-base-content"
							>{nivel} · {nomeDoNivel}</span
						>
					{:else}
						<span class="min-w-0 truncate text-[12px] font-normal text-base-content/65"
							>escala CEFR · opcional</span
						>
					{/if}
				</p>
				<div class="grid grid-cols-6 gap-1.5">
					{#each NIVEIS as n (n.id)}
						<button
							type="button"
							onclick={() => escolherNivel(n.id)}
							aria-pressed={nivel === n.id}
							title="{n.id} · {n.nome}"
							class="min-h-12 rounded-[11px] p-0 text-[14.5px] font-bold transition-[translate,border-color,background-color] duration-150 hover:-translate-y-0.5 hover:border-primary active:translate-y-0.5
							       {nivel === n.id
								? 'border-[1.5px] border-primary bg-base-300 text-primary'
								: 'border border-line bg-base-100 text-base-content'}"
						>
							{n.id}
						</button>
					{/each}
				</div>
				<input type="hidden" name="level" value={nivel ?? ''} />
				<p class="mt-[7px] text-[12.5px] leading-normal text-base-content/65">
					Um rótulo para você organizar e o aluno ver. Não muda as questões.
				</p>
			</div>
		</div>
	</div>

	{#snippet aside()}
		<div class="relative z-1 my-auto w-full min-w-0 px-[18px] py-6 lg:px-[34px] lg:py-7">
			<p
				class="mb-3 flex items-center gap-[9px] text-[11px] font-bold tracking-[0.09em] text-primary uppercase"
			>
				<svg class="size-[15px] shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<rect
						x="3.5"
						y="3.5"
						width="7"
						height="7"
						rx="2"
						stroke="currentColor"
						stroke-width="2"
					/>
					<rect
						x="13.5"
						y="3.5"
						width="7"
						height="7"
						rx="2"
						stroke="currentColor"
						stroke-width="2"
					/>
					<rect
						x="3.5"
						y="13.5"
						width="7"
						height="7"
						rx="2"
						stroke="currentColor"
						stroke-width="2"
					/>
					<rect
						x="13.5"
						y="13.5"
						width="7"
						height="7"
						rx="2"
						stroke="currentColor"
						stroke-width="2"
					/>
				</svg>
				O que sai daqui
			</p>
			<div class="mb-4 flex items-start gap-3">
				<h2
					class="min-w-0 flex-1 font-display text-[21px] leading-[1.2] font-semibold tracking-[-0.018em] text-pretty"
				>
					Do material que você colar saem exercícios assim
				</h2>
				<span
					class="mt-0.5 grid shrink-0 rounded-full bg-base-300 px-2.5 py-[5px] text-center font-mono text-[12px] font-medium whitespace-nowrap text-primary"
				>
					<span class="invisible col-start-1 row-start-1" aria-hidden="true"
						>{idiomaDoChip} · B1</span
					>
					<span class="col-start-1 row-start-1">{idiomaDoChip}{nivel ? ` · ${nivel}` : ''}</span>
				</span>
			</div>
			<!-- No desktop os cartões têm altura FIXA: a frase de exemplo muda com o
			     idioma e o nível, e com a linha da grade acompanhando o conteúdo o
			     bloco (centralizado) subia e descia a cada clique. -->
			<div class="grid auto-rows-fr grid-cols-2 gap-2 lg:auto-rows-[13.5rem] lg:gap-3">
				{#each amostras as amostra, i (amostra.id)}
					<QuestaoResumida
						questao={amostra}
						dir={perfil.direction}
						lang={perfil.tag}
						inclinacao={INCLINACAO[i]}
					/>
				{/each}
			</div>
			<p class="mt-4 text-[12.5px] leading-[1.55] text-pretty text-base-content/65">
				Na próxima etapa você escolhe quantas questões gerar e de quais tipos, no geral ou por
				material.
			</p>
		</div>
	{/snippet}

	{#snippet actions()}
		<button
			type="submit"
			disabled={bloqueado || enviando}
			class="btn h-[46px] flex-1 motion-tap gap-2.5 btn-primary font-bold lg:flex-none"
		>
			<span class="lg:hidden">Continuar</span>
			<span class="hidden lg:inline">Continuar para materiais</span>
			<svg class="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
				<path
					d="M5 12h13M13 6l6 6-6 6"
					stroke="currentColor"
					stroke-width="2.2"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			</svg>
		</button>
	{/snippet}
</WizardShell>
