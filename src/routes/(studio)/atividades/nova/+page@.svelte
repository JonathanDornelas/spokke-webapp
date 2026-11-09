<script lang="ts">
	// Etapa 1 do wizard. O professor NUNCA escolhe a habilidade: ela é derivada de
	// material × interação × correção e só aparece em Publicar. `+page@.svelte`
	// reseta para o layout raiz — o wizard não usa a barra lateral do Studio
	// (paginas.md "Studio": "durante a criação o professor tem uma tarefa só").
	import { resolve } from '$app/paths';
	import WizardShell from '$lib/components/WizardShell.svelte';
	import { MAX_ITENS, TETO_POR_HABILIDADE } from '$lib/kernel/generators/select';
	import { skillLabels, skills as TODAS } from '$lib/kernel/interactions/skill-schema';
	import { languageLabels } from '$lib/kernel/language/profiles';
	import type { Skill } from '$lib/kernel/interactions/types';
	import { criarAtividade } from '../atividades.remote';
	import { NIVEIS, rotuloDoNivel, type NivelId } from '$lib/atividades/nivel';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	/**
	 * Por que não dá para criar — do estado do plano (antes de digitar) ou da
	 * resposta do servidor (a trava de cota pode recusar mesmo com a tela
	 * dizendo que cabia, se outra aba criou no meio).
	 */
	const bloqueio = $derived.by(() => {
		const r = criarAtividade.result;
		if (r && !r.ok) return { motivo: r.motivo, texto: r.error };
		const motivo = data.acesso.motivo.criarAtividade;
		if (!motivo) return null;
		const { uso, limites } = data.acesso;
		const texto =
			motivo === 'criar'
				? `Seu plano permite ${limites.atividades} atividades ao mesmo tempo, e você já tem ${uso.atividades}. Arquive uma que já foi usada — os resultados dela ficam — ou escolha um plano com mais espaço.`
				: motivo === 'trial'
					? 'O período de teste acabou. Nada foi apagado, e os links já publicados seguem abrindo — para criar de novo, escolha um plano.'
					: 'Seu plano não permite criar atividades agora. Os links já publicados seguem abrindo.';
		return { motivo, texto };
	});

	/** Os idiomas cadastrados, na ordem do profile — nunca escritos aqui. */
	const idiomas = Object.keys(languageLabels);

	let quantidade = $state(12);
	let nivel = $state<NivelId | null>(null);
	let escolhidas = $state<Skill[]>([...TODAS]);

	// A lista vai num campo SÓ, separada por vírgula — mesmo padrão das
	// perguntas e das falas da etapa 2: o componente monta, o servidor valida.
	const skillsField = $derived(escolhidas.join(','));

	function alternar(skill: Skill) {
		// Desmarcar tudo geraria uma atividade vazia, então a última marcada não
		// desmarca — melhor do que deixar o professor cair num erro na etapa 3.
		if (escolhidas.includes(skill)) {
			if (escolhidas.length === 1) return;
			escolhidas = escolhidas.filter((s) => s !== skill);
			return;
		}
		escolhidas = [...escolhidas, skill];
	}

	/** As que têm teto próprio, para a tela dizer o número em vez de escondê-lo. */
	const teto = (skill: Skill) => TETO_POR_HABILIDADE[skill];
</script>

<svelte:head><title>Nova atividade — Spokke</title></svelte:head>

<form {...criarAtividade}>
	<WizardShell
		step={1}
		backHref={resolve('/(studio)/atividades')}
		backLabel="Atividades"
		status="Rascunho salvo"
		hint="Nada aqui é definitivo — o rascunho só vira atividade quando você publicar."
	>
		<div class="mx-auto max-w-[620px] px-4 py-8 lg:px-10 lg:py-12">
			<h1 class="mb-2 font-display text-title font-semibold tracking-[-0.022em] lg:text-[28px]">
				Sobre a atividade
			</h1>
			<p class="mb-7 text-[14.5px] leading-relaxed text-base-content/65">
				Só o essencial para começar. Tudo aqui pode mudar até você publicar.
			</p>

			{#if bloqueio}
				<!-- O bloqueio vem ANTES dos campos: preencher tudo para descobrir no
				     "Continuar" que não cabia é jogar o trabalho fora. -->
				<div
					class="mb-6 rounded-box border border-s-[3px] border-line border-s-error bg-base-200 px-4 py-3.5 text-[13.5px] leading-relaxed"
					role="alert"
				>
					<p class="mb-2 font-bold">Não dá para criar uma atividade nova agora</p>
					<p class="text-base-content/70">{bloqueio.texto}</p>
					<p class="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
						{#if bloqueio.motivo === 'criar'}
							<a href={resolve('/(studio)/atividades')} class="font-bold">Ver minhas atividades</a>
						{/if}
						{#if bloqueio.motivo}
							<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- rota resolvida mais a query do motivo; a regra não enxerga a concatenação. -->
							<a href={resolve('/(site)/planos') + '?motivo=' + bloqueio.motivo} class="font-bold"
								>Ver os planos</a
							>
						{/if}
					</p>
				</div>
			{/if}

			<div class="grid gap-[18px]">
				<label class="block">
					<span class="mb-1.5 block text-[13px] font-semibold">Título</span>
					<input
						name="title"
						required
						class="input h-[52px] w-full border-[1.5px] border-primary text-[15.5px]"
						placeholder="Present perfect — turma B"
					/>
					<span class="mt-1.5 block text-[12.5px] text-base-content/65">
						Só você vê. O aluno vê o título só se você quiser mostrá-lo na capa.
					</span>
				</label>

				<div class="grid gap-[18px] sm:grid-cols-2">
					<!-- Os dois selects ITERAM `languageLabels`, e é o mesmo objeto nos
					     dois: um idioma cadastrado serve de alvo e de origem, e escolher
					     quais podem ser o quê seria uma regra a mais para manter.
					     Escritos à mão, eles ficaram para trás — o alvo oferecia três
					     dos cinco idiomas, e não havia como criar atividade de espanhol. -->
					<label class="block">
						<span class="mb-1.5 block text-[13px] font-semibold">Idioma alvo</span>
						<select name="targetLang" class="select h-[52px] w-full text-[15px]">
							{#each idiomas as rotulo (rotulo)}
								<option selected={rotulo === data.padrao.alvo}>{rotulo}</option>
							{/each}
						</select>
						<span class="mt-1.5 block text-[12.5px] text-base-content/65">
							Define fonte, direção do texto e tokenização.
						</span>
					</label>
					<label class="block">
						<span class="mb-1.5 block text-[13px] font-semibold">Idioma do aluno</span>
						<select name="sourceLang" class="select h-[52px] w-full text-[15px]">
							{#each idiomas as rotulo (rotulo)}
								<option selected={rotulo === data.padrao.aluno}>{rotulo}</option>
							{/each}
						</select>
						<span class="mt-1.5 block text-[12.5px] text-base-content/65">
							Usado nas traduções e nos enunciados.
						</span>
					</label>
				</div>

				<!-- O nível é um RÓTULO (CEFR): organiza a lista, filtra e aparece para o
				     aluno — não muda os exercícios gerados (adr-004-modulos-e-nivel.md).
				     Opcional: "Sem nível" é o padrão e é uma resposta legítima. -->
				<fieldset class="block border-0 p-0">
					<legend class="mb-1.5 block text-[13px] font-semibold">
						Nível <span class="font-normal text-base-content/65">(opcional)</span>
					</legend>
					<div class="flex flex-wrap gap-1.5">
						{#each [null, ...NIVEIS.map((n) => n.id)] as id (id ?? 'sem')}
							<button
								type="button"
								onclick={() => (nivel = id)}
								aria-pressed={nivel === id}
								title={id ? rotuloDoNivel(id) : 'Sem nível'}
								class="rounded-full px-3.5 py-2 text-[13px] transition-[border-color,transform,translate,scale] duration-150 hover:-translate-y-0.5
								       {nivel === id
									? 'border-[1.5px] border-primary bg-base-300 font-bold text-primary'
									: 'border border-line bg-base-200 font-semibold text-base-content/65'}"
							>
								{id ?? 'Sem nível'}
							</button>
						{/each}
					</div>
					<input type="hidden" name="level" value={nivel ?? ''} />
					<span class="mt-1.5 block text-[12.5px] text-base-content/65">
						{nivel ? rotuloDoNivel(nivel) : 'Um rótulo para você organizar e o aluno ver.'}
					</span>
				</fieldset>

				<label class="block">
					<span class="mb-1.5 block text-[13px] font-semibold">
						Quantas questões gerar
						<span class="ms-1 font-mono text-primary">{quantidade}</span>
					</span>
					<!-- Deslizante MAIS número: o deslizante dá a noção de onde 12 cai
					     entre 1 e 15, e o campo deixa digitar o valor exato. Os dois
					     escrevem o mesmo estado. -->
					<div class="flex items-center gap-3.5">
						<input
							type="range"
							min="1"
							max={MAX_ITENS}
							bind:value={quantidade}
							class="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-base-300 accent-primary"
							aria-label="Quantas questões gerar"
						/>
						<input
							type="number"
							min="1"
							max={MAX_ITENS}
							bind:value={quantidade}
							class="input h-[42px] w-[76px] text-center font-mono text-[15px]"
							aria-label="Número de questões"
						/>
					</div>
					<input type="hidden" name="itemTarget" value={quantidade} />
					<span class="mt-1.5 block text-[12.5px] text-base-content/65">
						No máximo {MAX_ITENS}. É um alvo, não um contrato: material curto rende menos, e você
						ainda descarta o que não quiser na revisão.
					</span>
				</label>

				<fieldset class="block border-0 p-0">
					<legend class="mb-1.5 block text-[13px] font-semibold">O que esta atividade treina</legend
					>
					<div class="flex flex-wrap gap-1.5">
						{#each TODAS as skill (skill)}
							{@const marcada = escolhidas.includes(skill)}
							<button
								type="button"
								onclick={() => alternar(skill)}
								aria-pressed={marcada}
								class="flex items-center gap-2 rounded-full px-3.5 py-2 text-[13px] transition-[border-color,transform,translate,scale] duration-150 hover:-translate-y-0.5
								       {marcada
									? 'border-[1.5px] border-primary bg-base-300 font-bold text-primary'
									: 'border border-line bg-base-200 font-semibold text-base-content/65'}"
							>
								{skillLabels[skill]}
								{#if teto(skill)}
									<span class="font-mono text-[11px] opacity-75">máx {teto(skill)}</span>
								{/if}
							</button>
						{/each}
					</div>
					<input type="hidden" name="skills" value={skillsField} />
					<span class="mt-1.5 block text-[12.5px] leading-relaxed text-base-content/65">
						Você não marca a habilidade de cada exercício — ela é derivada. Isto é o filtro do que
						vai ser gerado. Fala e escuta entram no máximo {TETO_POR_HABILIDADE.speaking} vezes cada:
						cada item de escuta é um áudio a sintetizar, e cada um de fala é uma gravação que o aluno
						precisa de silêncio para fazer.
					</span>
				</fieldset>
			</div>
		</div>

		{#snippet aside()}
			<div class="relative z-1 px-4 py-7 lg:px-[30px] lg:py-11">
				<p
					class="mb-3.5 flex items-center gap-2 text-[11px] font-bold tracking-[0.09em] text-primary uppercase"
				>
					<svg class="size-[15px] shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
						<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" />
						<path
							d="M12 11v5.5M12 7.5h.01"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
						/>
					</svg>
					Por que não escolho a habilidade?
				</p>
				<p class="mb-[18px] text-[13.5px] leading-relaxed text-base-content/65">
					Escuta, fala, leitura e escrita não são um campo desta tela. Elas saem da combinação entre
					o material que você cola, a interação gerada e a forma de correção. Você vê quais
					habilidades a atividade treina na etapa de publicar, já derivadas.
				</p>
				<!-- Cada operador fica AGRUPADO com o chip seguinte (`shrink-0`): sem
				     isso, o "×" quebra sozinho no fim da linha nesta coluna estreita. -->
				<div class="hidden flex-wrap items-center gap-1.5 text-xs lg:flex">
					<span
						class="rounded-full border border-line bg-base-100 px-[11px] py-1.5 font-semibold text-base-content/65"
						>Material</span
					>
					<span class="flex shrink-0 items-center gap-1.5">
						<span class="text-base-content/65">×</span>
						<span
							class="rounded-full border border-line bg-base-100 px-[11px] py-1.5 font-semibold text-base-content/65"
							>Interação</span
						>
					</span>
					<span class="flex shrink-0 items-center gap-1.5">
						<span class="text-base-content/65">×</span>
						<span
							class="rounded-full border border-line bg-base-100 px-[11px] py-1.5 font-semibold text-base-content/65"
							>Correção</span
						>
					</span>
					<span class="flex shrink-0 items-center gap-1.5">
						<span class="text-base-content/65">=</span>
						<span class="rounded-full bg-base-300 px-[11px] py-1.5 font-bold text-primary"
							>Habilidade</span
						>
					</span>
				</div>
			</div>
		{/snippet}

		{#snippet actions()}
			<!-- O "Cancelar" agora é da casca (vale nas quatro etapas) — aqui ele
			     duplicaria. -->
			<button
				type="submit"
				disabled={!!bloqueio || !!criarAtividade.pending}
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
</form>
