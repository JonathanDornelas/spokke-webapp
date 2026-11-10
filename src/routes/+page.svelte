<script lang="ts">
	import Metadados from '$lib/components/Metadados.svelte';
	/**
	 * Home — Spokke. Tema, tipografia e movimento vêm de src/app.css.
	 * Regras: .claude/rules/design-system.md + home.md
	 */
	import { untrack } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import Avatar from '$lib/components/Avatar.svelte';
	import Button from '$lib/components/Button.svelte';
	import SiteHeader from '$lib/components/SiteHeader.svelte';
	import SiteFooter from '$lib/components/SiteFooter.svelte';
	import PlanosTabela from '$lib/components/PlanosTabela.svelte';
	import Loading from '$lib/components/Loading.svelte';
	import { reveal } from '$lib/actions/reveal';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import { resolve } from '$app/paths';
	import EnunciadoDaQuestao from './exemplo/EnunciadoDaQuestao.svelte';
	import RespostaDaQuestao from './exemplo/RespostaDaQuestao.svelte';
	import { RespostaDoExemplo, type QuestaoNaTela } from './exemplo/resposta.svelte';

	let { data }: { data: { exemplo: QuestaoNaTela[] } } = $props();

	// O celular do hero é a atividade de exemplo de verdade (`/exemplo`): as
	// mesmas questões, os mesmos componentes do Player e a correção do servidor.
	const respostas = untrack(() => data.exemplo.map((q) => new RespostaDoExemplo(q)));
	const rotulos = ['Escuta', 'Escrita', 'Montar', 'Fala'];

	/**
	 * O ritmo do ciclo. Sozinho, ele troca de tela a cada 9 s — tempo de ler a
	 * questão inteira, não só de bater o olho. Quem escolheu uma pastilha ou
	 * mexeu no celular ganha 24 s por tela: está lendo, e a tela não pode trocar
	 * no meio da leitura.
	 */
	const RITMO = 9000;
	const RITMO_DEPOIS_DE_MEXER = 24000;

	let demo = $state(0);
	let mexeu = $state(false);
	let ultimoToque = $state(0);
	let ponteiroDentro = $state(false);
	let focoDentro = $state(false);
	const atual = $derived(respostas[demo]!);

	// O tema é do produto inteiro, não desta página: quem guarda a escolha,
	// sincroniza e alterna é ThemeToggle + $lib/client/theme.

	$effect(() => {
		if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		// Parado enquanto a pessoa está ali: com o ponteiro ou o foco dentro do
		// celular, gravando, esperando a correção, ou com uma resposta ainda não
		// verificada. Trocar a tela nessas horas apagaria o que ela estava fazendo.
		if (ponteiroDentro || focoDentro || atual.ocupada) return;
		if (atual.pronta && !atual.feedback) return;
		void ultimoToque;
		const espera = mexeu ? RITMO_DEPOIS_DE_MEXER : RITMO;
		const t = setTimeout(() => irPara((demo + 1) % respostas.length), espera);
		return () => clearTimeout(t);
	});

	/** Cada toque recomeça a contagem, já no ritmo lento. */
	function mexer() {
		mexeu = true;
		ultimoToque = Date.now();
	}

	function irPara(i: number) {
		// A tela que entra começa em branco, como da primeira vez.
		if (i !== demo) respostas[i]!.zerar();
		demo = i;
	}

	function escolher(i: number) {
		irPara(i);
		mexer();
	}

	function proxima() {
		irPara((demo + 1) % respostas.length);
		mexer();
	}

	function verificarNoCelular(e: SubmitEvent) {
		e.preventDefault();
		mexer();
		void atual.verificar();
	}

	/**
	 * Quem está usando o celular. Não são controles (os controles são os botões
	 * lá dentro), são vigias que pausam e desaceleram o ciclo, e por isso entram
	 * por attachment, não como `onkeydown` num elemento que não é interativo.
	 */
	const vigiarUso: Attachment<HTMLElement> = (el) => {
		const ouvintes: [string, (e: Event) => void][] = [
			['pointerenter', (e) => (ponteiroDentro = (e as PointerEvent).pointerType === 'mouse')],
			['pointerleave', () => (ponteiroDentro = false)],
			['pointerdown', mexer],
			['keydown', mexer],
			['focusin', () => (focoDentro = true)],
			[
				'focusout',
				(e) => {
					const alvo = (e as FocusEvent).relatedTarget;
					focoDentro = alvo instanceof Node && el.contains(alvo);
				}
			]
		];
		for (const [tipo, fn] of ouvintes) el.addEventListener(tipo, fn);
		return () => {
			for (const [tipo, fn] of ouvintes) el.removeEventListener(tipo, fn);
		};
	};

	type Skill = {
		name: string;
		tone: string;
		body: string;
		icon: 'headphones' | 'mic' | 'book' | 'pencil';
	};
	const skills: Skill[] = [
		{
			name: 'Escuta',
			tone: 'text-accent',
			body: 'Você digita a frase e o áudio sai pronto. O aluno repete quantas vezes precisar e diminui a velocidade quando a frase embola.',
			icon: 'headphones'
		},
		{
			name: 'Fala',
			tone: 'text-accent',
			body: 'O aluno grava, vê o que entendemos e decide se manda ou grava de novo. Se o microfone falhar, ele pula e segue a atividade.',
			icon: 'mic'
		},
		{
			name: 'Leitura',
			tone: 'text-primary',
			body: 'Texto e pergunta ficam na mesma tela, sem subir e descer para reler. Serve para compreensão, tradução e vocabulário.',
			icon: 'book'
		},
		{
			name: 'Escrita',
			tone: 'text-primary',
			body: 'Da lacuna de uma palavra ao parágrafo inteiro. Uma letra a menos conta como quase, e a resposta livre você corrige com comentário, em cima do que o aluno escreveu.',
			icon: 'pencil'
		}
	];

	/**
	 * "Tudo que vem junto" (o desenho "Home Funcionalidades" do Claude Design).
	 * Cada item é um recorte de `docs/funcionalidades.md`, que só lista o que
	 * existe no código: o desenho original prometia código de seis letras,
	 * áudio próprio e fila de correção, e nenhum dos três existe.
	 */
	type GrupoDeFuncionalidades = {
		titulo: string;
		icone: string;
		itens: { nome: string; detalhe: string }[];
	};
	const funcionalidades: GrupoDeFuncionalidades[] = [
		{
			titulo: 'Criar',
			icone: 'M4 20h4l11-11a2.83 2.83 0 10-4-4L4 16z',
			itens: [
				{
					nome: 'Questões geradas',
					detalhe: 'do material que você cola'
				},
				{ nome: 'Material com IA', detalhe: 'a partir de um tema seu (Pro e Super)' },
				{
					nome: 'Editor de questão',
					detalhe: 'para mudar enunciado, respostas aceitas e correção'
				},
				{ nome: 'Prévia como aluno', detalhe: 'da atividade inteira antes de publicar' },
				{ nome: 'Áudio do texto', detalhe: 'em duas velocidades, sem gravar nada' },
				{ nome: 'Biblioteca', detalhe: 'a frase da aula passada, pronta para reusar' }
			]
		},
		{
			titulo: 'Enviar',
			icone: 'M5 12h13M13 6l6 6-6 6',
			itens: [
				{ nome: 'Link, QR e código', detalhe: 'para o grupo, o projetor e o ditado' },
				{ nome: 'Turmas com convite', detalhe: 'cada aluno chega com o nome certo no relatório' },
				{
					nome: 'Módulos programados',
					detalhe: 'uma por semana, sem você lembrar de mandar'
				},
				{ nome: 'Calendário de envios', detalhe: 'o que sai nos próximos dias, por turma' },
				{ nome: 'Aviso de problema', detalhe: 'se um envio não sai ou um e-mail volta' },
				{ nome: 'Editar sem quebrar', detalhe: 'quem já respondeu não perde nada' }
			]
		},
		{
			titulo: 'Para o aluno',
			icone: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z',
			itens: [
				{ nome: 'Correção na hora', detalhe: 'com o quase separado do erro' },
				{ nome: 'Teclado do idioma', detalhe: 'kana, pinyin, árabe, híndi e acentos' },
				{ nome: 'Fala com retorno', detalhe: 'ele vê o que entendemos antes de enviar' },
				{ nome: 'Retoma de onde parou', detalhe: 'se a internet cair no meio' },
				{ nome: 'Mapa do módulo', detalhe: 'as fases que faltam, num jogo de 8 bits' },
				{ nome: 'Conta opcional', detalhe: 'para ver o histórico em qualquer aparelho' }
			]
		},
		{
			titulo: 'Acompanhar',
			icone: 'M4 19.5h16M7 16V11M12 16V6M17 16v-3',
			itens: [
				{ nome: 'Painel da semana', detalhe: 'envios, tentativas e acerto numa tela' },
				{ nome: 'O que a turma errou', detalhe: 'as questões mais difíceis no topo' },
				{ nome: 'Ficha de cada aluno', detalhe: 'com todas as tentativas, em ordem' },
				{ nome: 'Comentário na resposta', detalhe: 'e nota de rubrica na escrita livre' },
				{
					nome: 'A voz do aluno',
					detalhe: 'para ouvir a pronúncia, com autorização dele, por 7 dias'
				},
				{ nome: 'Exportar em CSV', detalhe: 'resultados e chamada para a sua planilha' }
			]
		}
	];
	const paraEscolas = [
		{ nome: 'Coordenação com números', detalhe: 'uso por professor e por turma' },
		{ nome: 'Aluno protegido', detalhe: 'a coordenação não vê nome nem resposta' },
		{
			nome: 'Professores por convite',
			detalhe: 'cada um com conta e material próprios'
		},
		{ nome: 'Um contrato só', detalhe: 'vale para todos os professores da escola' }
	];

	const steps = [
		{
			n: '1',
			title: 'Cole o seu material',
			body: 'Frases, vocabulário, um texto ou um diálogo. O Spokke propõe as questões e você fica só com as que servem.'
		},
		{
			n: '2',
			title: 'Publique e mande o link',
			body: 'Mande no grupo da turma, projete o QR na sala ou dite o código. Se editar depois, quem já respondeu não perde nada.'
		},
		{
			n: '3',
			title: 'Veja o que a turma errou',
			body: 'Questão por questão, aluno por aluno. As que mais derrubaram a turma aparecem no topo, e a próxima aula começa por elas.'
		}
	];

	const states = [
		{
			state: 'correct',
			border: 'border-s-success',
			tone: 'text-success',
			label: 'Correto',
			answer: 'has been working'
		},
		{
			state: 'partial',
			border: 'border-s-warning',
			tone: 'text-warning',
			label: 'Quase. Faltou o g no final',
			answer: 'has been workin'
		},
		{
			state: 'incorrect',
			border: 'border-s-error',
			tone: 'text-error',
			label: 'Não foi dessa vez',
			answer: 'is working'
		}
	] as const;

	// Só os idiomas que têm LanguageProfile — o carrossel não promete o que o
	// produto não corrige. A lista por extenso está no parágrafo acima dele.
	const languages = [
		'English',
		'Español',
		'Français',
		'Italiano',
		'Português',
		'日本語',
		'中文',
		'हिन्दी',
		'العربية'
	];
</script>

<Metadados
	titulo="Exercícios de idioma com o material da sua aula"
	descricao="Exercícios de idiomas feitos com o material da sua aula. O aluno responde pelo link, sem criar conta, e você vê o que a turma errou. Para professores e escolas."
	tituloDaAba="Spokke · Exercícios de idiomas com o material da sua aula"
/>

<SiteHeader>
	{#snippet extra()}
		<ThemeToggle />
	{/snippet}
</SiteHeader>

<!-- `overflow-x-clip` na largura INTEIRA, não no contêiner de 1200px: as formas
     do hero passam da coluna do celular de propósito, e só não podem passar da
     tela — no celular elas faziam a página rolar de lado. `clip`, e não
     `hidden`, porque não cria um contêiner de rolagem. -->
<div class="overflow-x-clip">
	<div class="mx-auto max-w-[1200px] px-7">
		<!-- 1 · Hero -->
		<section class="grid items-center gap-14 py-[84px] pb-[72px] lg:grid-cols-[1.08fr_0.92fr]">
			<div class="relative z-2">
				<p
					class="mb-6 inline-flex animate-entrada rounded-full
				       bg-base-300 px-3.5 py-2 text-[12.5px] font-bold tracking-[0.1em] text-primary uppercase"
				>
					Para professores e escolas
				</p>
				<h1
					style="--i: 1"
					class="mb-6 animate-entrada font-display text-display leading-[0.99]
				       font-extrabold tracking-[-0.035em] text-balance em-sequencia"
				>
					<!-- `text-balance` e não `pretty`: com quatro linhas, o `pretty` deixava
					     o "a" de "para a" sozinho no fim de uma delas. -->
					Monte exercícios de idioma com a cara da sua aula e mande para a turma num link.
				</h1>
				<p
					style="--i: 2"
					class="mb-[30px] max-w-[50ch] animate-entrada text-lg
				       leading-relaxed text-pretty text-base-content/65 em-sequencia"
				>
					Cole as frases, o vocabulário ou o texto que você já usa em aula. As questões de escuta,
					fala, leitura e escrita saem dele, e você revisa antes de publicar. Quem recebe o link
					abre no celular e responde ali mesmo.
				</p>
				<div style="--i: 3" class="mb-6 flex animate-entrada flex-wrap gap-3 em-sequencia">
					<Button
						href={resolve('/(studio)/atividades/nova')}
						size="lg"
						class="text-[17px] no-underline shadow-[0_12px_30px_-16px_color-mix(in_oklab,var(--color-primary)_65%,transparent)]"
					>
						Criar uma atividade
					</Button>
					<Button
						href={resolve('/exemplo')}
						variant="outline"
						size="lg"
						class="gap-2.5 text-[17px] no-underline"
					>
						<svg class="size-[18px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<path
								d="M8 5.5l10 6.5-10 6.5z"
								stroke="currentColor"
								stroke-width="2"
								stroke-linejoin="round"
							/>
						</svg>
						Responder um exemplo
					</Button>
				</div>
				<!-- <p
					style="--i: 4"
					class="flex animate-entrada items-center gap-2.5 text-sm
				       text-base-content/65 em-sequencia"
				>
					<svg
						class="size-[17px] shrink-0 text-success"
						viewBox="0 0 24 24"
						fill="none"
						aria-hidden="true"
					>
						<path
							d="M4 12.5l5 5L20 6.5"
							stroke="currentColor"
							stroke-width="2.4"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
					O aluno não cria conta. Você vê a resposta de cada um.
				</p> -->
			</div>

			<!-- celular ao vivo: as questões respondem de verdade -->
			<div class="relative flex min-h-[760px] items-center justify-center">
				<!-- As formas passam da coluna do celular para os lados, e no desktop a
				     borda esquerda delas cai DENTRO da coluna do texto. Com o recorte
				     (`overflow-hidden`) o triângulo, ao girar e andar para a esquerda,
				     era cortado numa linha reta ali — parecia que o bloco da esquerda o
				     engolia. No desktop a camada não recorta e fica ACIMA da coluna do
				     texto (`z-3`, o celular em `z-4` acima dela); nada mudou de lugar, e
				     o `pointer-events-none` deixa os botões de baixo clicáveis. No
				     celular o texto vem EM CIMA do aparelho, e lá o recorte continua:
				     sem ele as formas de cima passariam por cima dos botões. -->
				<div
					aria-hidden="true"
					class="pointer-events-none absolute -inset-x-[18%] -inset-y-[10%] overflow-hidden lg:z-3 lg:overflow-visible"
				>
					<div
						class="absolute top-[8%] left-[6%] size-[190px] animate-[en-float-a_17s_ease-in-out_infinite]
					       rounded-full bg-primary/30 blur-sm"
					></div>
					<div
						class="absolute top-[4%] right-[4%] size-30 animate-[en-float-c_21s_ease-in-out_infinite]
					       rounded-[40px] border-[1.5px] border-accent/45"
					></div>
					<div
						class="absolute bottom-[12%] left-0 h-[92px] w-[104px] animate-[en-drift-spin_26s_ease-in-out_infinite]
					       bg-primary/25 [clip-path:polygon(50%_0%,100%_100%,0%_100%)]"
					></div>
					<div
						class="absolute right-[6%] bottom-[8%] size-[84px] animate-[en-float-b_15s_ease-in-out_infinite]
					       bg-accent/20 [clip-path:polygon(25%_3%,75%_3%,100%_50%,75%_97%,25%_97%,0%_50%)]"
					></div>
					<div
						class="absolute right-[20%] bottom-[30%] size-[62px] animate-[en-spin_14s_linear_infinite]
					       rounded-full border-2 border-accent/40 border-e-transparent border-t-transparent"
					></div>
					<div
						class="absolute top-[52%] left-[14%] size-[26px] animate-[en-breathe_6s_ease-in-out_infinite]
					       rounded-full bg-warning/35"
					></div>
				</div>

				<!-- O ciclo para enquanto o ponteiro ou o foco estão aqui dentro: é o
			     jeito de pausar um conteúdo que troca sozinho sem pôr mais um botão
			     no hero. -->
				<section
					aria-label="Exemplo para responder como aluno"
					class="relative z-1 flex flex-col items-center lg:z-4"
					{@attach vigiarUso}
				>
					<!-- 700 px de altura: com 600 a área útil era de 437 px e escuta,
					     montar e fala passavam dela, rolando dentro do aparelho. Com 700
					     cada questão cabe inteira antes de responder, e o celular fica na
					     proporção de um de verdade (~2:1). A medida está em
					     e2e/home.spec.ts. -->
					<div
						style="--i: 3"
						class="flex h-[700px] w-[344px] animate-entrada flex-col overflow-hidden rounded-[40px]
					       border-[9px] border-bezel bg-base-100 shadow-[0_30px_70px_-34px_rgb(var(--shadow)/0.55)]
					       em-sequencia"
					>
						<div class="flex items-center gap-3 p-4 pb-3">
							<Avatar nome="Júlia" size={34} radius="rounded-full" />
							<div class="h-2.5 flex-1 overflow-hidden rounded-full bg-base-300">
								<div
									class="h-full origin-left rounded-full bg-primary transition-transform duration-500"
									style="transform: scaleX({(demo + 1) / respostas.length})"
								></div>
							</div>
							<span class="font-mono text-xs text-base-content/60"
								>{demo + 1}/{respostas.length}</span
							>
						</div>

						<form onsubmit={verificarNoCelular} class="flex min-h-0 flex-1 flex-col">
							<div class="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pt-2 pb-4">
								{#key demo}
									<div class="flex flex-1 animate-entrada flex-col">
										<EnunciadoDaQuestao resposta={atual} compacto />
										<RespostaDaQuestao resposta={atual} compacto />
									</div>
								{/key}
							</div>

							<div class="flex gap-2.5 border-t border-line px-5 pt-3 pb-5">
								{#if atual.questao.skippable && !atual.feedback}
									<button
										type="button"
										onclick={proxima}
										disabled={atual.verificando}
										class="btn min-h-[50px] motion-tap btn-neutral font-semibold"
									>
										Pular
									</button>
								{/if}
								<button
									type={atual.feedback ? 'button' : 'submit'}
									onclick={atual.feedback ? proxima : undefined}
									disabled={atual.feedback ? false : !atual.pronta || atual.verificando}
									class="btn min-h-[50px] flex-1 motion-tap gap-2 btn-primary text-base font-bold"
								>
									{#if atual.verificando}
										<Loading variant="fila" size={12} tone="current" label="Verificando" />
										Verificando…
									{:else if atual.feedback}
										Próxima
									{:else}
										Verificar
									{/if}
								</button>
							</div>
						</form>
					</div>

					<div
						class="relative z-2 -mt-6 flex gap-2 rounded-full border border-line bg-base-100 p-2
					       shadow-[0_12px_30px_-18px_rgb(var(--shadow)/0.4)]"
					>
						{#each rotulos as rotulo, i (rotulo)}
							<button
								type="button"
								class="rounded-full px-3.5 py-2.5 text-[12.5px] font-bold transition-colors"
								class:bg-base-300={demo === i}
								class:text-primary={demo === i}
								class:text-base-content={demo !== i}
								aria-pressed={demo === i}
								onclick={() => escolher(i)}
							>
								{rotulo}
							</button>
						{/each}
					</div>
					<p class="mt-3 text-center text-[12.5px] text-base-content/65">
						Responda aqui mesmo. A correção é a de verdade.
					</p>
				</section>
			</div>
		</section>

		<!-- 2 · Quatro habilidades -->
		<section id="habilidades" class="pt-[72px]">
			<div class="mb-9 max-w-[62ch] reveal-row" use:reveal>
				<p class="mb-4 text-xs font-bold tracking-[0.14em] text-primary uppercase">
					Quatro habilidades
				</p>
				<h2
					class="mb-3.5 font-display text-[40px] leading-[1.08] font-semibold tracking-[-0.025em] text-pretty"
				>
					Ninguém aprende a falar marcando alternativa.
				</h2>
				<p class="text-[17px] leading-relaxed text-base-content/65">
					Por isso cada atividade mistura escuta, fala, leitura e escrita. Você escolhe o que a
					turma precisa treinar nesta semana e as questões se dividem entre essas habilidades.
				</p>
			</div>

			<div class="grid gap-3.5 md:grid-cols-2 lg:grid-cols-4">
				{#each skills as skill, i (skill.name)}
					<article
						class="cartao-interativo reveal-row rounded-box border border-line bg-base-100 p-6"
						use:reveal={{ ordem: i }}
					>
						<span
							class="mb-[18px] grid size-[46px] place-items-center rounded-box bg-base-300 {skill.tone}"
						>
							{#if skill.icon === 'headphones'}
								<svg class="size-6" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
							{:else if skill.icon === 'mic'}
								<svg class="size-6" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
							{:else if skill.icon === 'book'}
								<svg class="size-6" viewBox="0 0 24 24" fill="none" aria-hidden="true">
									<path
										d="M3 5.5h6a3 3 0 013 3v10a2.5 2.5 0 00-2.5-2.5H3zM21 5.5h-6a3 3 0 00-3 3v10a2.5 2.5 0 012.5-2.5H21z"
										stroke="currentColor"
										stroke-width="2"
										stroke-linejoin="round"
									/>
								</svg>
							{:else}
								<svg class="size-6" viewBox="0 0 24 24" fill="none" aria-hidden="true">
									<path
										d="M4 20h4l11-11a2.83 2.83 0 10-4-4L4 16z"
										stroke="currentColor"
										stroke-width="2"
										stroke-linejoin="round"
									/>
								</svg>
							{/if}
						</span>
						<h3 class="mb-2 font-display text-[21px] font-semibold">{skill.name}</h3>
						<p class="text-sm leading-relaxed text-base-content/65">{skill.body}</p>
					</article>
				{/each}
			</div>
		</section>

		<!-- 3 · Tudo que vem junto (o desenho "Home Funcionalidades"). As cores do
		     desenho eram verde e âmbar nos ícones e nos checks; aqui ficam no
		     azul, porque verde e âmbar são só da correção (home.md). -->
		<section id="funcionalidades" class="pt-[72px]">
			<div class="reveal-row rounded-[20px] border border-line bg-card p-7 lg:p-11" use:reveal>
				<div class="mb-[34px] max-w-[58ch]">
					<p class="mb-4 text-xs font-bold tracking-[0.14em] text-primary uppercase">
						Tudo que vem junto
					</p>
					<h2
						class="mb-3.5 font-display text-[40px] leading-[1.08] font-semibold tracking-[-0.025em] text-pretty"
					>
						Do material da aula ao relatório da turma, sem trocar de ferramenta.
					</h2>
					<p class="text-[17px] leading-relaxed text-pretty text-base-content/65">
						Montar, mandar e acompanhar ficam no mesmo lugar. Serve para quem dá aula particular e
						para a escola com vários professores.
					</p>
				</div>

				<div class="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
					{#each funcionalidades as grupo, i (grupo.titulo)}
						<article
							class="min-w-0 cartao-interativo reveal-row rounded-[16px] border border-line bg-base-200 p-[22px]"
							use:reveal={{ ordem: i }}
						>
							<div class="mb-4 flex items-center gap-3">
								<span
									class="grid size-[38px] shrink-0 place-items-center rounded-[12px] bg-primary text-primary-content"
								>
									<svg class="size-[19px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
										<path
											d={grupo.icone}
											stroke="currentColor"
											stroke-width="2"
											stroke-linecap="round"
											stroke-linejoin="round"
										/>
									</svg>
								</span>
								<h3 class="font-display text-[20px] font-semibold">{grupo.titulo}</h3>
							</div>
							<ul class="grid list-none gap-[11px] p-0">
								{#each grupo.itens as item (item.nome)}
									<li class="flex gap-2.5 text-sm leading-normal">
										<svg
											class="mt-0.5 size-4 shrink-0 text-primary"
											viewBox="0 0 24 24"
											fill="none"
											aria-hidden="true"
										>
											<path
												d="M4 12.5l5 5L20 6.5"
												stroke="currentColor"
												stroke-width="2.6"
												stroke-linecap="round"
												stroke-linejoin="round"
											/>
										</svg>
										<span>
											<strong class="font-semibold">{item.nome}</strong>
											<span class="text-base-content/65">{item.detalhe}</span>
										</span>
									</li>
								{/each}
							</ul>
						</article>
					{/each}
				</div>

				<!-- A escola tem a sua faixa, na largura inteira: é o mesmo produto com
				     uma camada a mais, não um quinto passo da aula. -->
				<article
					class="mt-3.5 reveal-row rounded-[16px] border border-line bg-base-200 p-[22px] lg:flex lg:items-start lg:gap-8"
					use:reveal={{ ordem: 4 }}
				>
					<div class="mb-4 flex shrink-0 items-center gap-3 lg:mb-0 lg:w-[236px]">
						<span
							class="grid size-[38px] shrink-0 place-items-center rounded-[12px] bg-primary text-primary-content"
						>
							<svg class="size-[19px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
								<path
									d="M12 3.5l9 4.5-9 4.5-9-4.5zM6 11v5.5c0 1.7 2.7 3 6 3s6-1.3 6-3V11"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
								/>
							</svg>
						</span>
						<div>
							<h3 class="font-display text-[20px] leading-tight font-semibold">Para escolas</h3>
							<p class="text-[12.5px] whitespace-nowrap text-base-content/65">
								plano Scholar, por contrato
							</p>
						</div>
					</div>
					<ul class="grid flex-1 list-none gap-[11px] p-0 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
						{#each paraEscolas as item (item.nome)}
							<li class="flex gap-2.5 text-sm leading-normal">
								<svg
									class="mt-0.5 size-4 shrink-0 text-primary"
									viewBox="0 0 24 24"
									fill="none"
									aria-hidden="true"
								>
									<path
										d="M4 12.5l5 5L20 6.5"
										stroke="currentColor"
										stroke-width="2.6"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
								</svg>
								<span>
									<strong class="font-semibold">{item.nome}</strong>
									<span class="text-base-content/65">{item.detalhe}</span>
								</span>
							</li>
						{/each}
					</ul>
				</article>

				<div
					class="mt-[30px] flex flex-wrap items-center gap-x-6 gap-y-3.5 border-t border-line pt-6"
				>
					<p
						class="min-w-[240px] flex-1 text-[15px] leading-relaxed text-pretty text-base-content/65"
					>
						O aluno nunca paga nem cria conta.
						<strong class="text-base-content">Você testa tudo grátis por 14 dias.</strong>
					</p>
					<Button
						href={resolve('/(auth)/cadastro')}
						class="min-h-12 shrink-0 px-[22px] no-underline"
					>
						Começar o teste
					</Button>
				</div>
			</div>
		</section>

		<!-- 4 · Para o aluno (o Player) -->
		<section id="player" class="pt-[72px]">
			<div
				class="relative grid reveal-row items-center gap-8 overflow-hidden rounded-[20px]
			       bg-panel p-11 lg:grid-cols-[1fr_260px]"
				use:reveal
			>
				<div class="relative z-1">
					<p class="mb-4 text-xs font-bold tracking-[0.14em] text-panel-dim uppercase">
						Para o aluno
					</p>
					<h2
						class="mb-4 max-w-[30ch] font-display text-[38px] leading-[1.1] font-semibold tracking-[-0.025em]
					       text-pretty text-panel-content"
					>
						Seu aluno aprende com cada resposta, inclusive com as que errou.
					</h2>
					<!-- O que o aluno GANHA no aprendizado, não como a tela funciona. A
					     correção e o "porquê" só aparecem com o resultado liberado pelo
					     professor (`showResult`), e o texto diz isso. -->
					<p
						class="mb-6 max-w-[54ch] text-[16.5px] leading-relaxed text-[color-mix(in_oklab,var(--color-panel-content)_82%,var(--color-panel))]"
					>
						Com o resultado liberado, a correção chega na hora: ele vê o que faltou e como deveria
						ficar, sem esperar a próxima aula. Na fala, confere o que entendemos antes de enviar e
						grava de novo até sair. No fim, revê a atividade questão por questão, com o porquê de
						cada erro.
					</p>
					<ul class="flex list-none flex-wrap gap-2.5 p-0">
						{#each ['Correção na hora', 'O porquê de cada erro', 'Pronúncia com retorno', 'Escrita no alfabeto do idioma'] as chip (chip)}
							<li
								class="rounded-full border border-panel-line px-3.5 py-2 text-[13px] font-semibold text-panel-content"
							>
								{chip}
							</li>
						{/each}
					</ul>
				</div>
				<div aria-hidden="true" class="relative h-[200px]">
					<div
						class="absolute end-0 top-0 size-[150px] animate-[en-float-a_16s_ease-in-out_infinite]
					       rounded-full bg-primary/45 blur-[2px]"
					></div>
					<div
						class="absolute start-[6%] bottom-[4%] h-[84px] w-[96px] animate-[en-drift-spin_24s_ease-in-out_infinite]
					       bg-accent/25 [clip-path:polygon(50%_0%,100%_100%,0%_100%)]"
					></div>
					<div
						class="absolute end-[22%] bottom-[12%] size-[58px] animate-[en-spin_13s_linear_infinite]
					       rounded-full border-2 border-accent/50 border-e-transparent border-t-transparent"
					></div>
					<div
						class="absolute start-[44%] top-[8%] size-10 animate-[en-breathe_7s_ease-in-out_infinite] rounded-full bg-warning/40"
					></div>
				</div>
			</div>
		</section>

		<!-- 4 · Correção -->
		<section id="correcao" class="pt-[72px]">
			<div class="grid items-center gap-11 lg:grid-cols-[0.92fr_1.08fr]">
				<div class="reveal-row" use:reveal>
					<p class="mb-4 text-xs font-bold tracking-[0.14em] text-primary uppercase">Correção</p>
					<h2
						class="mb-4 font-display text-[40px] leading-[1.08] font-semibold tracking-[-0.025em] text-pretty"
					>
						Entre o certo e o errado existe o quase.
					</h2>
					<p class="mb-4 text-[17px] leading-relaxed text-base-content/65">
						Escrever “workin” não é o mesmo que não saber o present perfect. O aluno vê o que faltou
						e, no seu relatório, quem chegou perto fica separado de quem errou de vez.
					</p>
					<p class="text-[17px] leading-relaxed text-base-content/65">
						Você decide se o aluno vê a resposta certa no fim. E o resultado nunca depende só da
						cor: vem sempre com ícone e texto.
					</p>
				</div>

				<div class="grid gap-3">
					{#each states as s, i (s.state)}
						<div
							class="flex reveal-row items-center gap-4 rounded-box border border-s-4 border-line {s.border}
						       bg-base-100 px-[22px] py-5 transition-transform duration-200 hover:translate-x-1"
							use:reveal={{ ordem: i + 1 }}
						>
							<span class="shrink-0 {s.tone}">
								{#if s.state === 'correct'}
									<svg class="size-7" viewBox="0 0 24 24" fill="none" aria-hidden="true">
										<circle
											cx="12"
											cy="12"
											r="9"
											stroke="currentColor"
											stroke-width="2"
											opacity="0.4"
										/>
										<path
											d="M7.5 12.5l3 3 6-6.5"
											stroke="currentColor"
											stroke-width="2.4"
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-dasharray="34"
											class="animate-[en-draw_1.4s_var(--ease-out-soft)_infinite_alternate]"
										/>
									</svg>
								{:else if s.state === 'partial'}
									<svg class="size-7" viewBox="0 0 24 24" fill="none" aria-hidden="true">
										<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" />
										<path d="M12 3a9 9 0 010 18z" fill="currentColor" />
									</svg>
								{:else}
									<svg class="size-7" viewBox="0 0 24 24" fill="none" aria-hidden="true">
										<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" />
										<path
											d="M8.5 8.5l7 7M15.5 8.5l-7 7"
											stroke="currentColor"
											stroke-width="2"
											stroke-linecap="round"
										/>
									</svg>
								{/if}
							</span>
							<div>
								<p class="mb-1 text-base font-bold">{s.label}</p>
								<p
									class="font-content text-[15px] text-base-content/65"
									data-content-lang="en"
									dir="ltr"
								>
									{s.answer}
								</p>
							</div>
						</div>
					{/each}
				</div>
			</div>
		</section>

		<!-- 5 · Do rascunho ao link -->
		<section class="pt-[72px]">
			<div class="mb-9 max-w-[62ch] reveal-row" use:reveal>
				<p class="mb-4 text-xs font-bold tracking-[0.14em] text-primary uppercase">
					Do rascunho ao link
				</p>
				<h2 class="font-display text-[40px] leading-[1.08] font-semibold tracking-[-0.025em]">
					Da sua aula ao celular da turma em três passos.
				</h2>
			</div>
			<div class="grid gap-3.5 md:grid-cols-3">
				{#each steps as step, i (step.n)}
					<article
						class="cartao-interativo reveal-row rounded-box border border-line bg-base-100 p-[26px]"
						use:reveal={{ ordem: i }}
					>
						<p
							class="mb-4 font-display text-[44px] leading-none font-extrabold tracking-[-0.03em] text-primary"
						>
							{step.n}
						</p>
						<h3 class="mb-2 font-display text-[21px] font-semibold">{step.title}</h3>
						<p class="text-[14.5px] leading-relaxed text-base-content/65">{step.body}</p>
					</article>
				{/each}
			</div>
		</section>

		<!-- 6 · Idiomas -->
		<section id="idiomas" class="pt-[72px]">
			<div
				class="reveal-row overflow-hidden rounded-[20px] border border-line bg-base-100"
				use:reveal
			>
				<div class="max-w-[66ch] px-11 pt-10 pb-7">
					<p class="mb-4 text-xs font-bold tracking-[0.14em] text-primary uppercase">Idiomas</p>
					<h2
						class="mb-3.5 font-display text-[38px] leading-[1.1] font-semibold tracking-[-0.025em] text-pretty"
					>
						Cada idioma é corrigido com as regras dele.
					</h2>
					<p class="mb-3.5 text-[16.5px] leading-relaxed text-base-content/65">
						Em japonês e chinês não há espaço entre as palavras, e a correção sabe disso. O árabe
						corre da direita para a esquerda sem bagunçar a tela. E quem estuda japonês, chinês,
						árabe ou híndi ganha um teclado do próprio alfabeto na hora de escrever.
					</p>
					<p class="text-[16.5px] leading-relaxed text-base-content/65">
						Hoje são dez: inglês americano e britânico, espanhol, francês, italiano, português,
						japonês, chinês, híndi e árabe.
					</p>
				</div>

				<div
					aria-hidden="true"
					class="relative [mask-image:linear-gradient(to_right,transparent,#000_12%,#000_88%,transparent)] pt-2
				       pb-8"
				>
					<div class="flex w-max animate-[en-marquee_34s_linear_infinite] gap-3.5">
						{#each [...languages, ...languages] as lang, i (i)}
							<span
								class="rounded-full border border-line bg-base-200 px-[22px] py-3 font-content text-[21px]"
							>
								{lang}
							</span>
						{/each}
					</div>
				</div>
			</div>
		</section>

		<!-- 7 · Planos — a MESMA tabela de `/planos` (`PlanosTabela.svelte`), lendo os
	     mesmos preços de `$lib/content/planos.ts`. Duas cópias divergiriam no
	     primeiro ajuste de preço, e a home é onde a divergência aparece primeiro.
	     Os PREÇOS SÃO PLACEHOLDER — ver o cabeçalho daquele arquivo. -->
		<section id="planos" class="pt-[72px]">
			<div class="reveal-row" use:reveal>
				<PlanosTabela titulo="Um preço por professor. Para a escola, um contrato." />
			</div>
			<p class="mt-5 text-center text-[13px] text-base-content/65">
				<a href={resolve('/(site)/planos')} class="font-semibold">Comparar os planos em detalhe</a>
			</p>
		</section>

		<!-- 8 · CTA -->
		<section class="pt-[72px] pb-24">
			<div
				class="relative grid reveal-row items-center gap-8 overflow-hidden rounded-[20px] bg-primary
			       px-11 py-13 lg:grid-cols-[1fr_220px]"
				use:reveal
			>
				<div class="relative z-1">
					<h2
						class="mb-3.5 max-w-[28ch] font-display text-[42px] leading-[1.04] font-extrabold tracking-[-0.03em]
					       text-pretty text-primary-content"
					>
						Monte hoje a atividade da próxima aula.
					</h2>
					<p
						class="mb-6 max-w-[46ch] text-[17px] leading-relaxed text-[color-mix(in_oklab,var(--color-primary-content)_84%,var(--color-primary))]"
					>
						Você precisa de uma conta. Seus alunos, não. Teste grátis por 14 dias ou fale com a
						gente para levar à escola inteira.
					</p>
					<div class="flex flex-wrap gap-3">
						<Button
							href={resolve('/(auth)/cadastro')}
							size="lg"
							class="border-none bg-primary-content text-[17px] text-primary no-underline"
						>
							Criar minha conta
						</Button>
						<!-- A porta da escola: o contato já chega com o assunto escolhido. -->
						<Button
							href={resolve('/(site)/contato') + '?assunto=escolas'}
							variant="outline"
							size="lg"
							class="border-[1.5px] border-primary-content/60 text-[17px] text-primary-content no-underline hover:bg-primary-content/15"
						>
							Levar para a minha escola
						</Button>
					</div>
				</div>
				<div aria-hidden="true" class="relative h-[180px]">
					<div
						class="absolute end-[4%] top-0 size-[130px] animate-[en-spin_30s_linear_infinite]
					       rounded-full border-2 border-dashed border-primary-content/45"
					></div>
					<div
						class="absolute start-0 bottom-[6%] h-[82px] w-[92px] animate-[en-drift-spin_22s_ease-in-out_infinite]
					       bg-primary-content/25 [clip-path:polygon(50%_0%,100%_100%,0%_100%)]"
					></div>
					<div
						class="absolute end-[34%] bottom-[14%] size-[46px] animate-[en-breathe_7s_ease-in-out_infinite]
					       bg-primary-content/30 [clip-path:polygon(25%_3%,75%_3%,100%_50%,75%_97%,25%_97%,0%_50%)]"
					></div>
				</div>
			</div>
		</section>
	</div>
</div>

<SiteFooter />
