<script lang="ts">
	// A atividade de exemplo, na tela do Player. É o destino do "Abrir um
	// exemplo" da home: cinco questões de verdade, corrigidas no servidor pelo
	// mesmo kernel, com o veredito sempre ligado. Nada é gravado — não há
	// tentativa, nome nem professor (`$lib/server/exemplo`).
	//
	// A casca é a de `a/[slug]/+layout.svelte` (a página não rola, a questão
	// rola por dentro) e o miolo é o da `/q/[n]`. Aqui a troca de questão é
	// estado da página, não rota: não há dado novo para buscar entre uma e outra.
	import { tick, untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import { viewport } from '$lib/client/viewport.svelte';
	import { som } from '$lib/client/sons.svelte';
	import AmbientShapes from '$lib/components/AmbientShapes.svelte';
	import Button from '$lib/components/Button.svelte';
	import Loading from '$lib/components/Loading.svelte';
	import Logo from '$lib/components/Logo.svelte';
	import ResultTrack from '$lib/components/ResultTrack.svelte';
	import { DURACAO } from '$lib/movimento';
	import PlanosModal from './PlanosModal.svelte';
	import VolumeControl from '$lib/components/VolumeControl.svelte';
	import EnunciadoDaQuestao from './EnunciadoDaQuestao.svelte';
	import RespostaDaQuestao from './RespostaDaQuestao.svelte';
	import { RespostaDoExemplo, type QuestaoNaTela } from './resposta.svelte';

	let { data }: { data: { questoes: QuestaoNaTela[]; logado: boolean } } = $props();

	let planosAbertos = $state(false);

	const respostas = untrack(() => data.questoes.map((q) => new RespostaDoExemplo(q)));
	const total = respostas.length;

	let etapa = $state<'inicio' | 'questao' | 'fim'>('inicio');
	let indice = $state(0);
	const atual = $derived(respostas[indice]!);
	const ultima = $derived(indice >= total - 1);
	const respondida = $derived(atual.feedback !== null);

	$effect(() => {
		untrack(() => som.sincronizar());
	});

	let area = $state<HTMLElement>();
	// O foco vai para o começo da questão nova, como no Player: sem isso ele
	// ficava no botão de "Próxima" de uma tela que já não existe.
	async function irPara(i: number) {
		indice = i;
		await tick();
		area?.focus({ preventScroll: true });
		area?.scrollTo({ top: 0 });
	}

	function comecar() {
		for (const r of respostas) r.zerar();
		etapa = 'questao';
		void irPara(0);
	}

	function avancar() {
		if (atual.ocupada) return;
		if (ultima) {
			etapa = 'fim';
			som.preparar('finish');
			som.tocar('finish');
			// Os planos abrem por cima do resultado, depois que ele entrou: primeiro
			// a pessoa vê como foi, depois a pergunta de quanto custa levar para a
			// turma. Fechar devolve a tela final, com "Ver os planos" para voltar.
			setTimeout(() => {
				if (etapa === 'fim') planosAbertos = true;
			}, DURACAO.longa + 700);
			return;
		}
		void irPara(indice + 1);
	}

	function verificar(e: SubmitEvent) {
		e.preventDefault();
		void atual.verificar();
	}

	const placar = $derived(
		respostas.map((r) => ({ state: r.feedback?.state ?? ('unanswered' as const) }))
	);
	const contagem = $derived({
		certas: placar.filter((p) => p.state === 'correct').length,
		quase: placar.filter((p) => p.state === 'partial').length,
		erradas: placar.filter((p) => p.state === 'incorrect').length,
		puladas: placar.filter((p) => p.state === 'unanswered').length
	});
	// A legenda da trilha em texto (cor sozinha não conta nada). Só o que
	// aconteceu: "0 para rever" é ruído.
	const legenda = $derived(
		[
			`${contagem.certas} ${contagem.certas === 1 ? 'certa' : 'certas'}`,
			contagem.quase > 0 ? `${contagem.quase} quase` : '',
			contagem.erradas > 0 ? `${contagem.erradas} para rever` : '',
			contagem.puladas > 0
				? `${contagem.puladas} ${contagem.puladas === 1 ? 'pulada' : 'puladas'}`
				: ''
		]
			.filter(Boolean)
			.join(' · ')
	);
	const deslocamento = $derived(atual.questao.dir === 'rtl' ? '-22px' : '22px');
</script>

<svelte:head>
	<title>Atividade de exemplo · entendo</title>
	<meta
		name="description"
		content="Responda a uma atividade de inglês feita no entendo: escuta, escrita, montar frase, fala e associação, com correção na hora."
	/>
</svelte:head>

<div class="flex h-dvh flex-col overflow-hidden bg-base-100 lg:bg-base-200 lg:py-8">
	<div
		data-surface="player"
		class="mx-auto flex min-h-0 w-full flex-1 flex-col overflow-hidden lg:max-w-[1100px] lg:rounded-[20px]
		       lg:border lg:border-line lg:bg-base-100 lg:shadow-[0_24px_56px_-40px_rgb(var(--shadow)/0.4)]"
	>
		{#if etapa === 'inicio'}
			<header
				class="flex items-center gap-3 px-5 pt-4 pb-3 lg:border-b lg:border-line lg:px-10 lg:py-4"
			>
				<Logo size={22} />
				<span class="flex-1"></span>
				<VolumeControl />
			</header>

			<main
				class="relative flex min-h-0 flex-1 flex-col [align-content:safe_center] overflow-y-auto px-5 py-8
				       lg:grid lg:place-items-center lg:px-16"
			>
				<AmbientShapes edges="both" />
				<div class="relative z-1 mx-auto w-full max-w-[34rem] animate-entrada">
					<p
						class="mb-5 inline-flex rounded-full bg-base-300 px-3 py-1.5 text-[12px] font-bold tracking-[0.1em] text-primary uppercase"
					>
						Atividade de exemplo
					</p>
					<h1 class="mb-4 font-display text-title font-semibold tracking-[-0.025em] text-pretty">
						Present perfect em cinco questões
					</h1>
					<p class="mb-6 text-[16.5px] leading-relaxed text-base-content/65">
						É assim que o seu aluno recebe uma atividade: uma questão por tela, correção na hora e o
						quase separado do erro. Responda à vontade. Nada do que você fizer aqui fica salvo.
					</p>
					<ul class="mb-8 grid list-none gap-2.5 p-0 text-[14.5px]">
						{#each ['Ouvir e escolher', 'Completar a frase', 'Montar a frase', 'Falar em voz alta', 'Ligar os pares'] as passo, i (passo)}
							<li class="flex items-center gap-3">
								<span
									class="grid size-7 shrink-0 place-items-center rounded-full bg-base-200 font-mono text-[12px] text-base-content/65"
								>
									{i + 1}
								</span>
								{passo}
							</li>
						{/each}
					</ul>
					<Button size="lg" class="w-full text-[17px] sm:w-auto sm:px-10" onclick={comecar}>
						Começar
					</Button>
					<p class="mt-4 text-[13px] leading-relaxed text-base-content/60">
						A questão de fala pede o microfone. Se não der para gravar agora, é só pular.
					</p>
				</div>
			</main>
		{:else if etapa === 'questao'}
			<header
				class="flex items-center gap-3 px-4 pt-4 pb-3 lg:gap-[18px] lg:border-b lg:border-line lg:px-10 lg:py-4"
			>
				<a
					href={resolve('/')}
					class="grid size-10 shrink-0 place-items-center rounded-full bg-base-200 text-base-content no-underline
					       transition-[background] duration-150 hover:bg-base-300"
					aria-label="Sair do exemplo"
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
				<span class="hidden text-[12.5px] text-base-content/65 lg:inline">Atividade de exemplo</span
				>
			</header>

			<form onsubmit={verificar} class="flex min-h-0 flex-1 flex-col">
				<div
					bind:this={area}
					tabindex="-1"
					class="relative flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-[18px] outline-none
					       lg:grid lg:grid-cols-2 lg:[align-content:safe_center] lg:items-center lg:gap-14 lg:px-16 lg:py-13"
				>
					<AmbientShapes edges="both" />
					{#key indice}
						<div class="relative z-1 min-w-0 q-in" style="--q-shift: {deslocamento}">
							<EnunciadoDaQuestao resposta={atual} />
						</div>
						<div
							class="relative z-1 flex min-w-0 flex-1 q-in flex-col"
							style="--q-shift: {deslocamento}"
						>
							<RespostaDaQuestao resposta={atual} desktop={viewport.desktop} />
						</div>
					{/key}
				</div>

				<footer
					class="flex items-center gap-2.5 border-t border-line px-5 pt-3.5 pb-[22px] lg:gap-4 lg:px-16 lg:pt-5 lg:pb-[26px]"
				>
					{#if atual.questao.skippable && !respondida}
						<button
							type="button"
							onclick={avancar}
							disabled={atual.verificando}
							class="btn min-h-[52px] motion-tap btn-neutral font-semibold lg:px-[18px] lg:text-[15px]"
						>
							<span class="lg:hidden">Pular</span>
							<span class="hidden lg:inline">Pular esta questão</span>
						</button>
					{/if}
					<div class="hidden flex-1 lg:block"></div>
					<button
						type={respondida ? 'button' : 'submit'}
						onclick={respondida ? avancar : undefined}
						disabled={respondida ? false : !atual.pronta || atual.verificando}
						class="btn btn-lg min-h-[52px] flex-1 motion-tap gap-2.5 btn-primary text-[17px] font-bold lg:flex-none lg:px-[30px]"
					>
						{#if atual.verificando}
							<Loading variant="fila" size={13} tone="current" label="Verificando" />
							Verificando…
						{:else if respondida}
							{ultima ? 'Ver o resultado' : 'Próxima questão'}
						{:else}
							Verificar
						{/if}
					</button>
				</footer>
			</form>
		{:else}
			<header
				class="flex items-center gap-3 px-5 pt-4 pb-3 lg:border-b lg:border-line lg:px-10 lg:py-4"
			>
				<Logo size={22} />
				<span class="flex-1"></span>
				<VolumeControl />
			</header>

			<main
				class="relative flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-8 lg:grid lg:place-items-center lg:px-16"
			>
				<AmbientShapes edges="both" tone={contagem.certas >= 3 ? 'success' : 'primary'} />
				<div class="relative z-1 mx-auto w-full max-w-[34rem] animate-entrada">
					<p class="mb-3 text-xs font-bold tracking-[0.14em] text-primary uppercase">
						Fim do exemplo
					</p>
					<h1 class="mb-5 font-display text-title font-semibold tracking-[-0.025em] text-pretty">
						Você terminou o exemplo.
					</h1>

					<div class="mb-3">
						<ResultTrack items={placar} />
					</div>
					<p class="mb-7 text-[14px] text-base-content/65">{legenda}</p>

					<p class="mb-7 text-[16.5px] leading-relaxed text-base-content/65">
						Do seu lado, você vê isso de cada aluno, e as questões que a turma mais errou aparecem
						primeiro. Para montar uma atividade assim, você cola as frases da sua aula e o entendo
						gera as questões.
					</p>

					<div class="flex flex-wrap gap-3">
						<Button size="lg" class="text-[17px]" onclick={() => (planosAbertos = true)}>
							Ver os planos
						</Button>
						<Button variant="outline" size="lg" class="text-[17px]" onclick={comecar}>
							Fazer de novo
						</Button>
					</div>
					<p class="mt-5 text-[13.5px]">
						<a href={resolve('/')} class="font-semibold">Voltar para a página inicial</a>
					</p>
				</div>
			</main>
		{/if}
	</div>
</div>

<PlanosModal bind:aberto={planosAbertos} logado={data.logado} />
