<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { DURACAO } from '$lib/movimento';
	import Avatar from '$lib/components/Avatar.svelte';
	// Uma questão. A correção acontece NO SERVIDOR (regra inviolável 2) — o estado
	// "Verificando…" existe de verdade, nada de veredito otimista no cliente.
	//
	// Layout: uma coluna no celular; a partir de lg, mídia à esquerda e resposta à
	// direita. Atalhos de teclado SÓ no desktop, e sempre como legenda — nunca a
	// única forma de responder (paginas.md "Player").
	//
	// `interaction` é um dos 8 tipos de kernel.md — não existe um 9º tipo "write":
	// escrita longa é `type` com `gradedLater` true (grading.mode === 'rubric').
	import { goto, preloadData } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { withMock } from '$lib/dev/with-mock';
	import { viewport } from '$lib/client/viewport.svelte';
	import { som } from '$lib/client/sons.svelte';
	import { Gravacao } from '$lib/client/gravacao.svelte';
	import { finalizarTentativa, responderItem } from '../../player.remote';
	import AmbientShapes from '$lib/components/AmbientShapes.svelte';
	import AnswerFeedback from '$lib/components/interactions/AnswerFeedback.svelte';
	import Loading from '$lib/components/Loading.svelte';
	import VolumeControl from '$lib/components/VolumeControl.svelte';
	import AudioPlayer from '$lib/components/AudioPlayer.svelte';
	import ChoiceInteraction from '$lib/components/interactions/ChoiceInteraction.svelte';
	import ClozeInteraction from '$lib/components/interactions/ClozeInteraction.svelte';
	import AssembleInteraction from '$lib/components/interactions/AssembleInteraction.svelte';
	import SelectInteraction from '$lib/components/interactions/SelectInteraction.svelte';
	import MatchInteraction from '$lib/components/interactions/MatchInteraction.svelte';
	import OrderInteraction from '$lib/components/interactions/OrderInteraction.svelte';
	import SpeakInteraction from '$lib/components/interactions/SpeakInteraction.svelte';
	import WritingInteraction from '$lib/components/interactions/WritingInteraction.svelte';
	import TecladoVirtual from '$lib/components/TecladoVirtual.svelte';
	import { CampoComTeclado } from '$lib/components/campo-com-teclado.svelte';
	import type {
		ChoiceRuntimeItem,
		ClozeFeedback,
		ClozeRuntimeItem,
		Dir,
		MatchRuntimeItem,
		OrderRuntimeItem,
		SelectRuntimeItem,
		SpeakRuntimeItem,
		WritingRuntimeItem
	} from '$lib/components/interactions/types';
	import type { InteractionKind } from '$lib/kernel/interactions/types';

	interface Common {
		dir: Dir;
		sourceDir: Dir;
		prompt: string;
		/** A regra da questão em uma linha — vem do item, não da tela. */
		hint?: string;
		skill: string;
		skillLabel: string;
		sourceLabel: string;
		targetLabel: string;
		gradingLabel?: string;
		audio?: string;
		audioSlow?: string;
		audioDuration?: string;
		passage?: string;
		gradedLater?: boolean;
		skippable?: boolean;
	}
	type PlayerItem = Common &
		(
			| ({ interaction: 'choice' } & ChoiceRuntimeItem)
			| ({ interaction: 'assemble' } & Omit<
					import('$lib/components/interactions/types').AssembleRuntimeItem,
					'dir'
			  >)
			| ({ interaction: 'type' | 'cloze' } & Omit<ClozeRuntimeItem, 'dir'>)
			| ({ interaction: 'match' } & Omit<MatchRuntimeItem, 'dir'>)
			| ({ interaction: 'order' } & Omit<OrderRuntimeItem, 'dir'>)
			| ({ interaction: 'select' } & Omit<SelectRuntimeItem, 'dir'>)
			| ({ interaction: 'speak' } & Omit<SpeakRuntimeItem, 'dir'>)
		);

	interface PageData {
		index: number;
		activity: { slug: string; title: string; itemCount: number };
		student: { name: string; initials: string; avatar: string | null };
		attemptId: string;
		itemId: string;
		item: PlayerItem;
		/**
		 * O que já foi respondido AQUI, quando o aluno voltou para esta questão.
		 * `state` nulo é feedback desligado pelo professor — a resposta volta,
		 * o veredito não.
		 */
		answered: { answer: unknown; state: 'correct' | 'partial' | 'incorrect' | null } | null;
	}

	const MOCK: PageData = {
		index: Number(page.params.n) || 4,
		activity: {
			slug: page.params.slug ?? 'present-perfect-b',
			title: 'Present perfect — turma B',
			itemCount: 24
		},
		student: { name: 'João M.', initials: 'JM', avatar: null },
		attemptId: 'att_demo',
		itemId: 'itm_demo',
		item: {
			dir: 'ltr',
			sourceDir: 'ltr',
			interaction: 'cloze',
			skill: 'writing',
			skillLabel: 'Escrita',
			sourceLabel: 'Português',
			targetLabel: 'Inglês',
			gradingLabel: 'tolerante',
			prompt: 'Complete a frase',
			hint: 'Acento e caixa são ignorados nesta questão.',
			masked: 'She ___ ___ working here since 2019.'
		} as PlayerItem,
		answered: null
	};

	let { data: dataProp }: { data?: Partial<PageData> } = $props();
	const data = $derived(withMock(dataProp, MOCK));

	// O volume guardado é lido uma vez, na montagem — não a cada questão. O
	// `untrack` mantém isso verdade: `sincronizar` lê `som.volume`, e sem ele o
	// efeito passaria a reagir a cada passo do regulador.
	$effect(() => {
		untrack(() => som.sincronizar());
	});

	// O feedback vem da correção NO SERVIDOR (regra inviolável nº 2) — nada
	// aqui decide certo/errado, nem otimisticamente.
	let feedback = $state<ClozeFeedback | null>(null);
	let startedAt = $state(Date.now());

	let choiceValue = $state<string | null>(null);
	let assembleChosen = $state<string[]>([]);
	let orderSequence = $state<string[]>([]);
	let selectValue = $state<string | null>(null);
	let pairs = $state<{ left: string; right: string }[]>([]);
	let text = $state('');

	// O teclado virtual do idioma alvo. Na GRADE (kana, pinyin, árabe,
	// devanágari) quem o desenha é esta tela, encaixado acima do rodapé como o
	// teclado de um celular: a questão rola por cima e ele não sai do lugar. Por
	// isso o campo (que sabe onde está o cursor) é daqui, e a interação só o
	// recebe.
	//
	// **Toda questão começa com ele OCULTO** — pedido do dono do repositório.
	// Aberto, ele tomava metade do celular antes de o aluno ler a pergunta; quem
	// o chama é o aluno, pelo "Teclado" do rodapé (`abrirTeclado`).
	const campo = new CampoComTeclado();
	let tecladoAberto = $state(false);

	/**
	 * Abre a grade e deixa o campo pronto para ela: com o foco (o cursor aparece
	 * e as teclas caem nele) e à vista, acima do teclado que acabou de subir.
	 *
	 * O `blur` antes do `focus` é o que FECHA o teclado do aparelho no
	 * celular: trocar o `inputmode` para `none` num campo já focado não o
	 * recolhe — só um foco novo lê o valor novo.
	 */
	async function abrirTeclado() {
		tecladoAberto = true;
		await tick();
		const el = campo.elemento;
		if (!el) return;
		if (document.activeElement === el) el.blur();
		el.focus({ preventScroll: true });
		el.scrollIntoView({ block: 'nearest', behavior: reduzMovimento() ? 'auto' : 'smooth' });
	}

	/** Ocultar a grade tira o foco: senão o teclado do aparelho saltava no lugar dela. */
	function aoOcultarTeclado() {
		campo.elemento?.blur();
	}

	function reduzMovimento() {
		return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	}
	const gradeNaTela = $derived(
		(data.item.interaction === 'type' || data.item.interaction === 'cloze') &&
			data.item.teclado?.formato === 'grade'
			? data.item.teclado
			: null
	);
	let recording = $state(false);
	let plays = $state(0);
	// A captura do microfone. O `Recorder` é controlado (components.md): quem
	// fala com o `MediaRecorder` é a tela.
	const gravacao = new Gravacao();
	let checking = $state(false);

	/**
	 * O que o serviço ENTENDEU da gravação, antes de o aluno enviar. A gravação
	 * para sozinha; o áudio sobe na hora (`modo=ouvir`) e a frase volta em um
	 * ou dois segundos. Ele lê, e decide: envia ou grava de novo. Sem isto ele
	 * só descobria o que foi ouvido junto com o veredito — tarde demais para
	 * repetir.
	 *
	 * Não é transcrição ao vivo, palavra por palavra: o Whisper trabalha sobre o
	 * áudio inteiro, no servidor. É o que dá para fazer com o motor que corrige —
	 * mostrar outro motor (o do browser) enquanto ele fala mostraria uma coisa e
	 * corrigiria outra.
	 */
	let ouvido = $state<string | null>(null);
	let ouvindo = $state(false);
	let ultimoBlob: Blob | null = null;

	$effect(() => {
		const blob = gravacao.blob;
		if (blob === ultimoBlob) return;
		ultimoBlob = blob;
		ouvido = null;
		if (blob && !untrack(() => jaRespondida)) void ouvir(blob);
	});

	async function ouvir(blob: Blob) {
		ouvindo = true;
		try {
			const corpo = new FormData();
			corpo.append('attemptId', data.attemptId);
			corpo.append('itemId', data.itemId);
			corpo.append('modo', 'ouvir');
			corpo.append('audio', blob, 'fala.webm');
			const resposta = await fetch(`/a/${data.activity.slug}/fala`, {
				method: 'POST',
				body: corpo
			});
			if (!resposta.ok) return;
			const json = (await resposta.json()) as { transcript?: string };
			// Regravou no meio: o que voltou é da gravação anterior.
			if (gravacao.blob !== blob) return;
			ouvido = json.transcript ?? null;
		} catch {
			// Sem a prévia o exercício segue igual: "Verificar" transcreve na hora.
			ouvido = null;
		} finally {
			if (gravacao.blob === blob) ouvindo = false;
		}
	}

	const interaction: InteractionKind = $derived(data.item.interaction);
	const answered = $derived(
		interaction === 'type' || interaction === 'cloze'
			? text.trim().length > 0
			: interaction === 'match'
				? pairs.length === (data.item as { left: { id: string }[] }).left?.length
				: interaction === 'assemble'
					? assembleChosen.length > 0
					: interaction === 'order'
						? orderSequence.length > 0
						: interaction === 'select'
							? selectValue !== null
							: interaction === 'speak'
								? // Era `recording || true`, ou seja: sempre habilitado, porque
									// não havia gravação nenhuma para esperar. Agora só vale com
									// áudio na mão — quem não consegue gravar usa o "Pular" do
									// rodapé, que em `speak` está sempre visível.
									gravacao.blob !== null
								: choiceValue !== null
	);

	/**
	 * A resposta já gravada desta questão, quando o aluno VOLTOU para ela.
	 *
	 * Chega como JSON do banco, então cada campo é conferido antes de virar
	 * estado — nada de `any`, e o que não bater com o formato simplesmente não
	 * é restaurado.
	 */
	function restaurar(resposta: unknown) {
		if (!resposta || typeof resposta !== 'object') return;
		const r = resposta as Record<string, unknown>;

		if (typeof r.text === 'string') text = r.text;
		if (typeof r.optionId === 'string') choiceValue = r.optionId;
		if (typeof r.segmentId === 'string') selectValue = r.segmentId;
		if (Array.isArray(r.sequence) && r.sequence.every((v) => typeof v === 'string')) {
			const ids = r.sequence as string[];
			if (interaction === 'order') orderSequence = ids;
			else assembleChosen = ids;
		}
		if (Array.isArray(r.pairs)) {
			pairs = r.pairs.filter(
				(par): par is { left: string; right: string } =>
					!!par &&
					typeof par === 'object' &&
					typeof (par as { left?: unknown }).left === 'string' &&
					typeof (par as { right?: unknown }).right === 'string'
			);
		}
	}

	// Navegar entre /q/1 e /q/2 REUSA este componente (mesma rota), então o
	// estado da resposta anterior sobreviveria — inclusive o feedback, que
	// deixa o campo desabilitado. Zera tudo quando o índice muda, e então
	// RESTAURA o que já foi respondido NESTA questão: voltar mostra o que o
	// aluno escreveu, não um formulário em branco.
	let indiceMontado = -1;
	$effect(() => {
		if (data.index === indiceMontado) return;
		indiceMontado = data.index;

		feedback = null;
		checking = false;
		choiceValue = null;
		assembleChosen = [];
		selectValue = null;
		pairs = [];
		text = '';
		tecladoAberto = false;
		recording = false;
		gravacao.descartar();
		plays = 0;
		startedAt = Date.now();

		// `order` começa na ordem em que o servidor mandou as linhas — ela já
		// vem embaralhada pela seed da tentativa e não reembaralha a cada
		// render (regra inviolável nº 8).
		const lines = (data.item as { lines?: { id: string }[] }).lines ?? [];
		orderSequence = lines.map((l) => l.id);

		if (data.answered) {
			restaurar(data.answered.answer);
			// Sem `showResult` o `state` vem nulo: a resposta reaparece, o
			// veredito não. Voltar não pode ser a porta dos fundos para
			// descobrir se acertou.
			if (data.answered.state) feedback = { state: data.answered.state };
		}
	});

	function answerPayload(): unknown {
		switch (interaction) {
			case 'choice':
				return { optionId: choiceValue };
			case 'assemble':
				return { sequence: assembleChosen };
			case 'type':
			case 'cloze':
				return { text };
			case 'match':
				return { pairs };
			case 'order':
				return { sequence: orderSequence };
			case 'select':
				return { segmentId: selectValue };
			case 'speak':
				// Sem provedor de ASR o servidor nem gera item de fala — quando
				// existir, a transcrição é feita no servidor antes de corrigir.
				return { transcript: '' };
		}
	}

	/**
	 * A troca de questão em três tempos: a atual sai, a próxima entra, e nada
	 * pisca no meio.
	 *
	 * O ponto que fazia a transição parecer travada era o meio: a questão saía
	 * em 190 ms e só ENTÃO o `goto` ia buscar o dado da próxima, deixando o
	 * cartão vazio pelo tempo do request. `preloadData` dispara a busca ANTES
	 * da animação e as duas correm juntas, então quando a saída termina o dado
	 * já está em memória e a entrada começa no quadro seguinte.
	 *
	 * Com `prefers-reduced-motion` não existe espera nenhuma — segurar a
	 * navegação para animar o que não vai animar seria só atraso.
	 */
	/**
	 * Guarda o CAMINHO de onde se está saindo, não um booleano nem o índice.
	 *
	 * Booleano não serve: o efeito que o zeraria só roda depois do render, e a
	 * questão nova entrava um quadro com a animação de saída. O índice também
	 * não: VOLTAR devolve o mesmo índice de onde a gente saiu, e a questão
	 * anterior reaparecia transparente e deslocada — a animação de saída rodando
	 * na chegada.
	 *
	 * Com o caminho, o valor velho sempre aponta para a página que acabou de
	 * ficar para trás — que, por definição, não é a que está na tela. Isso só
	 * fecha porque TODA troca de questão passa por `trocarPara`, inclusive o
	 * "Anterior".
	 */
	let saindoDe = $state<string | null>(null);
	const saindo = $derived(saindoDe !== null && saindoDe === page.url.pathname);
	const semMovimento = () =>
		typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

	/* eslint-disable svelte/no-navigation-without-resolve -- `href` é parâmetro:
	   quem chama já passou por resolve(), que exige literal no call site (mesma
	   regra do backHref de WizardShell.svelte). */
	async function trocarPara(href: string) {
		if (semMovimento()) {
			await goto(href);
			return;
		}
		saindoDe = page.url.pathname;
		// A busca do dado e a animação de saída correm JUNTAS. `preloadData`
		// pode falhar (offline, 404) — o `goto` abaixo trata isso do jeito
		// normal, então aqui o erro é ignorado de propósito. A espera é a duração
		// do `q-out` — o mesmo token, `$lib/movimento.ts` ↔ `app.css`.
		await Promise.all([
			preloadData(href).catch(() => {}),
			new Promise((r) => setTimeout(r, DURACAO.curta))
		]);
		await goto(href);
	}
	/* eslint-enable svelte/no-navigation-without-resolve */

	async function avancar() {
		if (data.index >= data.activity.itemCount) {
			await finalizarTentativa({ attemptId: data.attemptId });
			await trocarPara(resolve('/a/[slug]/resultado', { slug: data.activity.slug }));
			return;
		}
		await trocarPara(
			resolve('/a/[slug]/q/[n]', { slug: data.activity.slug, n: String(data.index + 1) })
		);
	}

	async function verificar(event: SubmitEvent) {
		event.preventDefault();
		if (ocupado || jaRespondida) return;

		checking = true;
		// Os arquivos viajam em paralelo com a correção, que acontece no
		// servidor: quando o veredito chega, o som já está pronto. Baixá-los na
		// montagem seriam 160 kB adiantados numa tela de 4G.
		som.preparar('correct', 'partial', 'incorrect');
		if (ultima) som.preparar('finish');
		try {
			// A fala é o único caminho que sobe BINÁRIO, e por isso não passa por
			// remote function: áudio em base64 dentro de JSON infla 33%. Quem
			// transcreve é o servidor — o browser manda som, não veredito.
			const result =
				interaction === 'speak'
					? await responderFalando()
					: await responderItem({
							attemptId: data.attemptId,
							itemId: data.itemId,
							answer: answerPayload(),
							ms: Date.now() - startedAt
						});

			if (
				result.state === 'correct' ||
				result.state === 'partial' ||
				result.state === 'incorrect'
			) {
				// A tela PARA aqui. Quem decide quando avançar é o aluno: um
				// cronômetro dava o mesmo tempo para "Correto." e para um "Quase,
				// faltou o acento" de três linhas, e quem lê devagar perdia a
				// explicação justamente na questão que errou.
				feedback = {
					state: result.state,
					hint: result.hint,
					marks: result.marks,
					expected: result.expected,
					// Numa questão de fala, o que o ASR ENTENDEU é metade do
					// retorno: "quase" sem dizer o que se ouviu não ensina nada.
					heard: 'transcript' in result ? result.transcript : undefined
				};
				// Reforço do veredito, nunca o veredito em si: quem está no zero,
				// sem fone ou com leitor de tela continua vendo ícone e texto.
				som.tocar(result.state);
				return;
			}
			// Sem veredito (escrita por rubrica, ou feedback desligado pelo
			// professor) não há o que ler: segue direto.
			await avancar();
		} finally {
			checking = false;
		}
	}

	/**
	 * Liga e desliga o microfone. Fica AQUI porque o `Recorder` é controlado
	 * por desenho (components.md "Gravação"): ele não fala com o
	 * `MediaRecorder` sozinho.
	 */
	async function alternarGravacao() {
		if (jaRespondida || ocupado) return;
		// A leitura vai para uma variável antes do `await`: comparar
		// `gravacao.estado` de novo depois dele faz o TypeScript achar que o valor
		// não mudou (ele não sabe que `iniciar()` escreve nesse campo) e reclamar
		// de comparação sem sobreposição.
		const antes = gravacao.estado;
		if (antes === 'gravando') {
			await gravacao.parar();
			recording = false;
			return;
		}
		recording = true;
		await gravacao.iniciar();
		// Microfone negado ou aparelho sem entrada: a onda não pode continuar
		// animando como se estivesse captando.
		if (gravacao.estado !== 'gravando') recording = false;
	}

	/**
	 * Sobe a gravação e recebe o veredito já corrigido. Devolve a MESMA forma de
	 * `responderItem`, para o resto de `verificar` não precisar saber de onde a
	 * resposta veio.
	 */
	async function responderFalando(): Promise<{
		state: 'correct' | 'partial' | 'incorrect' | 'hidden' | 'pending';
		hint?: string;
		marks?: { text: string; ok: boolean }[];
		expected?: string[];
		transcript?: string;
	}> {
		const audio = gravacao.blob;
		if (!audio) return { state: 'hidden' as const };

		const corpo = new FormData();
		corpo.append('attemptId', data.attemptId);
		corpo.append('itemId', data.itemId);
		corpo.append('ms', String(Date.now() - startedAt));
		corpo.append('audio', audio, 'fala.webm');

		const resposta = await fetch(`/a/${data.activity.slug}/fala`, {
			method: 'POST',
			body: corpo
		});
		if (!resposta.ok) {
			const detalhe = (await resposta.json().catch(() => ({}))) as { message?: string };
			throw new Error(detalhe.message || 'não conseguimos enviar sua gravação');
		}
		return resposta.json();
	}

	async function pular() {
		if (ocupado) return;
		await avancar();
	}

	/**
	 * Voltar para a questão anterior. Nada é apagado: a resposta já está gravada
	 * em `AttemptItem`, e o loader a devolve — a tela anterior reaparece com o
	 * que o aluno tinha preenchido, e com o veredito dela.
	 */
	async function voltar() {
		if (data.index <= 1 || ocupado) return;
		await trocarPara(
			resolve('/a/[slug]/q/[n]', { slug: data.activity.slug, n: String(data.index - 1) })
		);
	}

	// O eixo da transição segue o `dir` do CONTEÚDO, não o da interface: um
	// brasileiro estudando árabe vê interface LTR com conteúdo RTL, e a questão
	// tem que sair para o lado de onde a leitura dele veio.
	const deslocamento = $derived(data.item.dir === 'rtl' ? '-22px' : '22px');
	const movimento = $derived(saindo ? 'q-out' : 'q-in');

	/**
	 * Há uma requisição ou uma transição em curso. Trava TUDO — verificar, pular,
	 * voltar, atalho de teclado — porque enquanto isso a tela não é confiável.
	 * É diferente de "já respondida": ocupado é temporário.
	 */
	const ocupado = $derived(checking || saindo);

	/**
	 * A questão já tem resposta: ou o aluno acabou de responder (`feedback`), ou
	 * ele voltou para uma que já tinha respondido (`data.answered`). Nos dois
	 * casos não há o que verificar de novo, e a ação passa a ser seguir em
	 * frente — quando o ALUNO quiser.
	 */
	const jaRespondida = $derived(feedback !== null || data.answered !== null);
	const ultima = $derived(data.index >= data.activity.itemCount);

	const kbd =
		'rounded-md border border-line border-b-2 bg-base-200 px-2 py-1 font-mono text-[11.5px] font-medium text-base-content';

	// Ícone da habilidade. Todo ícone que carrega significado vem com texto ao
	// lado (design-system.md) — aqui o texto é o próprio rótulo da habilidade.
	const SKILL_ICON: Record<string, string> = {
		listening:
			'M4 12.5V11a8 8 0 1116 0v1.5M2.5 14.5a2 2 0 012-2h2.5v7H4.5a2 2 0 01-2-2zM21.5 14.5a2 2 0 00-2-2H17v7h2.5a2 2 0 002-2z',
		speaking: 'M9 5.5a3 3 0 016 0v6a3 3 0 01-6 0zM5.5 11.5a6.5 6.5 0 0013 0M12 18v3.5',
		reading:
			'M3 5.5h6a3 3 0 013 3v10a2.5 2.5 0 00-2.5-2.5H3zM21 5.5h-6a3 3 0 00-3 3v10a2.5 2.5 0 012.5-2.5H21z',
		writing: 'M4 20h4l11-11a2.83 2.83 0 10-4-4L4 16z'
	};
	const skillIcon = $derived(SKILL_ICON[data.item.skill] ?? SKILL_ICON.reading);

	/**
	 * O aluno está DIGITANDO: nenhum atalho vale. O Espaço que repete o áudio
	 * engolia o espaço entre as palavras de "Ouça e escreva" — dava para digitar
	 * qualquer coisa, menos uma frase.
	 */
	function digitando(alvo: EventTarget | null): boolean {
		return (
			alvo instanceof HTMLInputElement ||
			alvo instanceof HTMLTextAreaElement ||
			(alvo instanceof HTMLElement && alvo.isContentEditable)
		);
	}

	function onKey(e: KeyboardEvent) {
		if (ocupado || !viewport.desktop) return;
		if (digitando(e.target) && e.key !== 'Enter') return;

		// Com a questão já respondida, o Enter faz o que o botão faz: avança.
		// Ele é o atalho da AÇÃO PRINCIPAL, e ela mudou de "verificar" para
		// "próxima" — deixá-lo preso na anterior seria prometer outra coisa.
		if (e.key === 'Enter' && jaRespondida) {
			e.preventDefault();
			void avancar();
			return;
		}

		if (e.key === ' ' && data.item.audio) {
			e.preventDefault();
			plays++;
		}
		if (interaction === 'choice' && /^[1-9]$/.test(e.key)) {
			const item = data.item as ChoiceRuntimeItem & Common;
			choiceValue = item.options[Number(e.key) - 1]?.id ?? choiceValue;
		}
		// A legenda promete "Enter verificar". Num campo de texto o próprio
		// form já faz isso; em escolher/montar/ordenar não há campo focado, e
		// sem este ramo o atalho anunciado não existiria.
		if (e.key === 'Enter' && answered && !(e.target instanceof HTMLTextAreaElement)) {
			e.preventDefault();
			void verificar(new SubmitEvent('submit'));
		}
	}
</script>

<svelte:head><title>Questão {data.index} — {data.activity.title}</title></svelte:head>
<svelte:window onkeydown={onKey} />

<header
	class="flex items-center gap-3 px-4 pt-4 pb-3 lg:gap-[18px] lg:border-b lg:border-line lg:px-10 lg:py-4"
>
	{#if data.index > 1}
		<!-- Botão e não link: voltar passa pelo MESMO `trocarPara` da ida, e é
		     isso que mantém o `saindoDe` sempre apontando para a página que
		     ficou para trás. Com um `<a>` cru, a volta chegava sem passar por
		     ali e a questão anterior reaparecia com a animação de SAÍDA. -->
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
			class="h-full origin-left animate-progresso rounded-full bg-primary"
			style="width: {(data.index / data.activity.itemCount) * 100}%"
		></div>
	</div>
	<span class="font-mono text-xs text-base-content/60 lg:text-[12.5px]">
		{data.index}<span class="lg:hidden">/</span><span class="hidden lg:inline">&nbsp;de&nbsp;</span
		>{data.activity.itemCount}
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
		<Avatar codigo={data.student.avatar} nome={data.student.name} size={26} radius="rounded-full" />
		{data.student.name}
	</span>
</header>

<form onsubmit={verificar} class="flex min-h-0 flex-1 flex-col">
	<!-- `relative` para as faixas decorativas; `content-center` porque no
	     desktop a questão fica no meio do cartão, não colada no topo. -->
	<!-- É ESTE o container que rola. `safe center` e não `center`: com a
	     centralização normal, conteúdo mais alto que a área transborda para os
	     DOIS lados e o topo da questão fica inalcançável — o `safe` desiste de
	     centralizar exatamente quando não cabe. -->
	<div
		class="relative flex min-h-0 flex-1 flex-col gap-0 overflow-y-auto px-5 py-[18px]
		       lg:grid lg:grid-cols-2 lg:[align-content:safe_center] lg:items-center lg:gap-14 lg:px-16
		       {gradeNaTela && tecladoAberto ? 'lg:py-6' : 'lg:py-13'}"
	>
		<!-- As faixas decorativas ficam FORA do `{#key}`: elas são o fundo do
		     cartão, não a questão, e reiniciar as formas a cada troca faria o
		     ambiente piscar junto. -->
		<AmbientShapes edges="both" />

		{#key data.index}
			<div class="relative z-1 min-w-0 {movimento}" style="--q-shift: {deslocamento}">
				<p
					class="mb-3 flex items-center gap-[9px] text-[11.5px] font-bold tracking-[0.08em] uppercase lg:mb-[15px] lg:text-xs
				       {data.item.skill === 'listening' || data.item.skill === 'speaking'
						? 'text-accent'
						: 'text-primary'}"
				>
					<svg class="size-[17px] shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
						<path
							d={skillIcon}
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
					{data.item.skillLabel}{data.item.gradingLabel ? ` · ${data.item.gradingLabel}` : ''}
				</p>
				<h1
					class="mb-3.5 font-display text-title font-semibold tracking-[-0.025em] text-pretty lg:mb-3.5"
				>
					{data.item.prompt}
				</h1>

				<!-- A regra da questão. No celular ela dá lugar ao conteúdo: a tela é
			     uma só e a informação reaparece no feedback da correção. -->
				{#if data.item.hint}
					<p class="mb-7 hidden text-[15px] leading-[1.6] text-base-content/65 lg:block">
						{data.item.hint}
					</p>
				{/if}

				{#if data.item.audio}
					<div class="mb-[18px] lg:mt-7 lg:mb-0">
						<AudioPlayer
							src={data.item.audio}
							srcSlow={data.item.audioSlow}
							duration={data.item.audioDuration}
							{plays}
							onplay={() => plays++}
						/>
						{#if viewport.desktop}
							<p class="mt-5 flex items-center gap-2.5 text-[12.5px] text-base-content/65">
								<span class={kbd}>Espaço</span> tocar de novo
							</p>
						{/if}
					</div>
				{/if}

				{#if data.item.passage}
					<!-- Em `assemble` a frase de apoio é sempre a da língua do ALUNO (é
				     dela que ele traduz), então vale nomear o idioma. Nas outras a
				     origem varia por gerador e um rótulo errado seria pior que
				     nenhum. -->
					{#if data.item.interaction === 'assemble'}
						<p class="mb-2 text-[11px] font-bold tracking-[0.09em] text-base-content/65 uppercase">
							Em {data.item.sourceLabel}
						</p>
					{/if}
					<div class="mb-5 rounded-box border border-line bg-base-200 p-4">
						<p
							dir={data.item.interaction === 'assemble' ? data.item.sourceDir : data.item.dir}
							class="font-content text-[17px] leading-[1.65]"
						>
							{data.item.passage}
						</p>
					</div>
				{/if}
			</div>
		{/key}

		{#key data.index}
			<div
				class="relative z-1 flex min-w-0 flex-1 flex-col {movimento}"
				style="--q-shift: {deslocamento}"
			>
				{#if data.item.interaction === 'choice'}
					<ChoiceInteraction item={data.item} bind:value={choiceValue} desktop={viewport.desktop} />
					{#if viewport.desktop}
						<p class="mt-3.5 flex items-center gap-2.5 text-[12.5px] text-base-content/65">
							{#each data.item.options as opt, i (opt.id)}<span class={kbd}>{i + 1}</span>{/each} escolher
							pelo número
						</p>
					{/if}
				{:else if data.item.interaction === 'type' && data.item.gradedLater}
					<WritingInteraction
						item={{
							dir: data.item.dir,
							// Repassado à mão porque este objeto é montado aqui, e não
							// o item inteiro: sem esta linha a escrita longa em árabe
							// ficava sem teclado, com o campo curto do lado tendo um.
							teclado: data.item.teclado,
							instructions: data.item.prompt,
							maxLength: 600
						} satisfies WritingRuntimeItem}
						bind:value={text}
						storageKey="entendo:draft:{data.attemptId}:{data.index}"
						{campo}
						bind:tecladoAberto
						tecladoNaTela
					/>
				{:else if data.item.interaction === 'type' || data.item.interaction === 'cloze'}
					<ClozeInteraction
						item={data.item}
						bind:value={text}
						{feedback}
						{campo}
						bind:tecladoAberto
						tecladoNaTela
					/>
				{:else if data.item.interaction === 'assemble'}
					<AssembleInteraction item={data.item} bind:chosen={assembleChosen} />
				{:else if data.item.interaction === 'select'}
					<SelectInteraction item={data.item} bind:value={selectValue} />
				{:else if data.item.interaction === 'match'}
					<MatchInteraction
						item={data.item}
						bind:pairs
						leftLabel={data.item.targetLabel}
						rightLabel={data.item.sourceLabel}
						{feedback}
					/>
				{:else if data.item.interaction === 'order'}
					<OrderInteraction item={data.item} bind:order={orderSequence} />
				{:else if data.item.interaction === 'speak'}
					<SpeakInteraction
						item={data.item}
						{recording}
						ontoggle={alternarGravacao}
						estado={gravacao.estado}
						segundos={gravacao.segundos}
						maxSegundos={gravacao.maxSegundos}
						{ouvido}
						{ouvindo}
					/>
				{/if}

				<!-- O veredito fica AQUI, fora da interação, e por isso vale para as
				     oito. Ele morava dentro do ClozeInteraction, então quem errava
				     um "Monte a frase" não via feedback nenhum: a tela esperava os
				     2,2 s de leitura e passava para a próxima questão. -->
				{#if feedback}
					<!-- No `match` o veredito vem SÓ com a linha de estado: as marcas
					     pintam os cartões dentro da própria interação, e repetir
					     "bookshop → relatório" aqui embaixo diria a mesma coisa duas
					     vezes — a segunda sem as colunas ao lado. -->
					<AnswerFeedback
						state={feedback.state}
						hint={feedback.hint}
						marks={interaction === 'match' ? undefined : feedback.marks}
						expected={interaction === 'match' ? undefined : feedback.expected}
						heard={feedback.heard}
						dir={data.item.dir}
					/>
				{/if}

				<!-- A correção acontece NO SERVIDOR (regra inviolável 2), então esta
			     espera é real. `traco` é a variante de sobreposição: fica por
			     cima da resposta que o aluno acabou de dar, sem tirá-la da tela. -->
				{#if checking}
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

	{#if gradeNaTela && !jaRespondida}
		<TecladoVirtual
			teclado={gradeNaTela}
			bind:aberto={tecladoAberto}
			docado
			desativado={ocupado}
			onocultar={aoOcultarTeclado}
			onacao={(acao) =>
				campo.aplicar(
					text,
					acao,
					(novo) => (text = novo),
					data.item.interaction === 'type' && data.item.gradedLater ? 600 : undefined
				)}
		/>
	{/if}

	<footer
		class="flex items-center gap-2.5 border-t border-line px-5 pt-3.5 pb-[22px] lg:gap-4 lg:px-16 lg:pt-5 lg:pb-[26px]"
	>
		{#if gradeNaTela && !jaRespondida && !tecladoAberto}
			<!-- Oculto, o teclado volta por aqui — o mesmo lugar do "Pular", porque
			     é no rodapé que o polegar está. -->
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
		{#if data.item.skippable && !jaRespondida}
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
		{#if viewport.desktop}
			<span class="hidden items-center gap-2.5 text-[12.5px] text-base-content/65 lg:flex">
				<span class={kbd}>Enter</span>
				{jaRespondida ? 'continuar' : 'verificar'}
			</span>
		{/if}
		<!-- Respondida, a ação vira AVANÇAR e o aluno decide quando. Havia um
		     cronômetro aqui (0,9 s para acerto, 2,2 s para erro) que dava o mesmo
		     tempo para "Correto." e para uma explicação de três linhas — e quem
		     lê devagar perdia justamente a da questão que errou. -->
		<button
			type={jaRespondida ? 'button' : 'submit'}
			onclick={jaRespondida ? avancar : undefined}
			disabled={jaRespondida ? ocupado : !answered || ocupado}
			class="btn btn-lg min-h-[52px] flex-1 motion-tap gap-2.5 btn-primary text-[17px] font-bold lg:flex-none lg:px-[30px]"
		>
			{#if jaRespondida && !ocupado}
				{ultima ? 'Ver o resultado' : 'Próxima questão'}
				<svg
					class="hidden size-[18px] animate-[en-nudge_2.4s_ease-in-out_infinite] lg:block"
					viewBox="0 0 24 24"
					fill="none"
					aria-hidden="true"
				>
					<path
						d="M5 12h13M13 6l6 6-6 6"
						stroke="currentColor"
						stroke-width="2.2"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
			{:else if ocupado}
				<Loading variant="fila" size={13} tone="current" label="Verificando" />
				{checking ? 'Verificando…' : 'Só um instante…'}
			{:else}
				{data.item.gradedLater ? 'Enviar' : 'Verificar'}
				<svg
					class="hidden size-[18px] animate-[en-nudge_2.4s_ease-in-out_infinite] lg:block"
					viewBox="0 0 24 24"
					fill="none"
					aria-hidden="true"
				>
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
	</footer>
</form>
