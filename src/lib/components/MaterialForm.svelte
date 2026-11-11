<script lang="ts">
	// O formulário de material — UM só, para a biblioteca e para a etapa 2 do
	// wizard. Lá ele é coluna fixa; na biblioteca é painel sobre a lista. É o
	// mesmo bloco, e por isso mora aqui: as duas telas divergiam no primeiro
	// ajuste de layout enquanto cada uma tinha a sua cópia.
	//
	// Quem é dono do `<form>` é a PÁGINA: ela escolhe a remote function (criar,
	// lote ou editar, conforme `modo` e `editando`) e o que fazer no sucesso.
	// Este componente só desenha os campos com os `name` que
	// `camposMaterial` espera, mais tudo que se calcula no cliente: a prévia
	// do lote, o rendimento do conjunto, o aviso de repetido e "o que o aluno
	// vai ver".
	import { untrack } from 'svelte';
	import Alternador from './Alternador.svelte';
	import Loading from './Loading.svelte';
	import IdiomaTag from './IdiomaTag.svelte';
	import { IDIOMAS, idiomaDe } from '$lib/idiomas';
	import { getProfile } from '$lib/kernel/language/profiles';
	import { resolve } from '$app/paths';
	import type { MotivoDoBloqueio } from '$lib/billing/motivos';
	import type { ContentUnitKind } from '$lib/kernel/content/types';
	import {
		custoDaGeracao,
		MAXIMO_DE_FALA_S,
		type EstadoDaIa,
		type RespostaDaGeracao
	} from '$lib/billing/ia';
	import {
		decodificarFala,
		falaParaEnviar,
		prepararImagem,
		type FalaDecodificada
	} from '$lib/client/arquivo-ia';
	import { formatarDuracao, problemaDoTrecho, segundosDoTrecho } from '$lib/ia/arquivo';
	import { tokenize } from '$lib/kernel/language/tokenize';
	import { shuffleWithSeed } from '$lib/kernel/random';
	import { previewRawLines, RAW_SEPARATORS } from '$lib/kernel/content/parse-raw';
	import { estimarRendimento, MINIMO_PARA_DISTRATOR } from '$lib/kernel/content/rendimento';
	import {
		FALAS_INICIAIS,
		KIND_TO_KERNEL,
		TIPOS,
		type Fala,
		type MaterialKind,
		type MaterialRow,
		type Pergunta
	} from './material-form';

	export type Modo = 'um' | 'lista' | 'ia';
	/** O bastante para dizer "você já tem esta frase" — os campos que o servidor compara. */
	export type MaterialRef = Pick<
		MaterialRow,
		'id' | 'kind' | 'target' | 'source' | 'note' | 'example'
	>;
	/**
	 * O que as remote functions devolvem, nas três formas: erro, um material
	 * (com `reused` dizendo se já existia) e o lote (com as contagens).
	 */
	/**
	 * `motivo`: a porta fechou por PLANO (limite de materiais, teste encerrado) —
	 * a tela oferece `/planos?motivo=` em vez de "tente de novo".
	 * `foraDoLimite`: num lote, as linhas novas que não couberam no estoque.
	 */
	export type ResultadoMaterial =
		| { ok: false; error: string; motivo?: MotivoDoBloqueio | null }
		| { ok: true; reused?: boolean }
		| {
				ok: true;
				added: number;
				reused: number;
				ignored: number;
				/** Linhas cuja tradução veio do tradutor automático. */
				traduzidas?: number;
				foraDoLimite?: number;
				aviso?: string | null;
				motivo?: MotivoDoBloqueio | null;
		  };

	let {
		contexto,
		conjunto,
		biblioteca = conjunto,
		contentTag = 'und',
		dir = 'ltr',
		targetLabel,
		sourceLabel,
		modo = $bindable('um'),
		editando = $bindable(null),
		resultado,
		salvando = false,
		onfechar,
		fecharRotulo,
		fecharSoNoCelular = false,
		ia,
		ongerarIa,
		onaceitarIa,
		idioma = $bindable(null),
		idiomaPadrao = null,
		traducaoAutomatica = false,
		linguaDoAluno = null,
		onsugerirTraducao
	}: {
		/** Muda o título, o rendimento e o rótulo de salvar — nunca os campos. */
		contexto: 'biblioteca' | 'wizard';
		/** O conjunto que o rendimento conta: a biblioteca inteira, ou o da atividade. */
		conjunto: MaterialRow[];
		/** Onde procurar repetido — a biblioteca inteira, quando `conjunto` é só uma atividade. */
		biblioteca?: MaterialRef[];
		/** Tag do idioma alvo, para tokenizar a prévia. `und` na biblioteca, que não tem idioma. */
		contentTag?: string;
		dir?: 'ltr' | 'rtl';
		/** "Inglês" → "Frase em inglês". Sem ele, "Frase no idioma alvo". */
		targetLabel?: string;
		sourceLabel?: string;
		modo?: Modo;
		editando?: MaterialRow | null;
		resultado?: ResultadoMaterial;
		salvando?: boolean;
		/** Com ele, o cabeçalho ganha o botão de fechar. */
		onfechar?: () => void;
		/** Texto ao lado do X — no wizard do celular é "Ver os N materiais". */
		fecharRotulo?: string;
		/** No wizard o formulário é coluna fixa no desktop: o X só faz sentido no celular. */
		fecharSoNoCelular?: boolean;
		/** Estado da geração por IA. Sem ele, o modo IA fica travado. */
		ia?: EstadoDaIa;
		/**
		 * A PÁGINA fala com o servidor — o componente não conhece nenhuma remote function nem endpoint
		 * (Convenções). Com `arquivo`, a foto já reduzida ou o WAV do trecho do vídeo, prontos aqui.
		 */
		ongerarIa?: (pedido: {
			kind: ContentUnitKind;
			texto: string;
			quantos: 5 | 10 | 20;
			arquivo?: { fonte: 'imagem' | 'video'; blob: Blob };
		}) => Promise<RespostaDaGeracao>;
		/** Grava as marcadas. Devolve se deu certo — aí a lista de propostas se esvazia. */
		onaceitarIa?: (kind: ContentUnitKind, dados: Record<string, unknown>[]) => Promise<boolean>;
		/**
		 * BIBLIOTECA: a tag de idioma do material (`$lib/idiomas.ts`). Vale para a
		 * prévia (tokenizar e direção), para os rótulos ("Frase em japonês") e para
		 * a IA. No wizard não existe: o material é da atividade e fala o idioma dela.
		 */
		idioma?: string | null;
		/** O idioma com que um material NOVO nasce na biblioteca — o que o professor mais usa. */
		idiomaPadrao?: string | null;
		/**
		 * O servidor tem tradutor (`TRANSLATE_PROVIDER`). Ligado, a tradução de par
		 * de frases e de vocabulário sai sozinha: sugerida enquanto o professor
		 * digita, e feita no servidor para o que chegar em branco (adr-006).
		 */
		traducaoAutomatica?: boolean;
		/** Para onde a tradução vai: a língua do aluno (da atividade, ou a da biblioteca). */
		linguaDoAluno?: string | null;
		/** Pede a sugestão — a PÁGINA chama a remote function. `null` é "não deu agora". */
		onsugerirTraducao?: (texto: string, de: string, para: string) => Promise<string | null>;
	} = $props();

	const wiz = $derived(contexto === 'wizard');
	const editing = $derived(editando !== null);

	// No wizard, a língua do conteúdo é a da atividade (props); na biblioteca, a
	// tag escolhida aqui. `und` (sem idioma) cai no segmentador raiz, e a prévia
	// continua obedecendo à regra nº 5.
	const escolhido = $derived(wiz ? null : idiomaDe(idioma));
	const tagConteudo = $derived(wiz ? contentTag : (escolhido?.tag ?? 'und'));
	const direcao = $derived<'ltr' | 'rtl'>(
		wiz ? dir : escolhido ? getProfile(escolhido.tag).direction : 'ltr'
	);
	const rotuloDoIdioma = $derived(wiz ? targetLabel : escolhido?.rotulo);
	/**
	 * Material que já está em atividade tem o idioma DELA: trocar na biblioteca
	 * etiquetaria uma frase de inglês como espanhol numa atividade de inglês. O
	 * servidor recusa também; aqui a tela diz por quê.
	 */
	const idiomaTravado = $derived(editing && (editando?.usedIn ?? 0) > 0);

	// ── campos ──────────────────────────────────────────────────────────────
	let kind = $state<MaterialKind>('pair');
	let alvo = $state('');
	let traducao = $state('');
	let raw = $state('');
	let nota = $state('');
	let exemplo = $state('');
	let perguntas = $state<Pergunta[]>([{ question: '', answer: '' }]);
	let falas = $state<Fala[]>(FALAS_INICIAIS.map((f) => ({ ...f })));
	let lote = $state('');
	let textareaLote = $state<HTMLTextAreaElement | null>(null);
	let primeiroCampo = $state<HTMLInputElement | null>(null);

	const kernelKind = $derived(KIND_TO_KERNEL[kind]);
	const podeColar = $derived((kind === 'pair' || kind === 'vocab') && !editing);
	// Texto e diálogo não têm "um por linha"; editar é sempre um de cada vez.
	const modoEfetivo = $derived<Modo>(editing ? 'um' : modo === 'lista' && !podeColar ? 'um' : modo);

	// ── tradução automática ─────────────────────────────────────────────────
	// O campo da tradução vem preenchido enquanto o professor escreve a frase, e
	// ele confere. A regra que segura tudo: **o que ELE escreveu nunca é
	// sobrescrito.** `traducaoAuto` é o último texto que veio do tradutor; se o
	// campo é diferente dele (e não está vazio), o campo é do professor.
	const podeTraduzir = $derived(
		traducaoAutomatica &&
			!!linguaDoAluno &&
			tagConteudo !== 'und' &&
			tagConteudo !== linguaDoAluno &&
			(kind === 'pair' || kind === 'vocab')
	);
	let traducaoAuto = $state<string | null>(null);
	let traduzindo = $state(false);
	let semTradutor = $state(false);
	/** Cada pedido ganha um número; resposta de pedido velho é descartada. */
	let pedidoDaTraducao = 0;
	const traducaoEhAutomatica = $derived(!!traducaoAuto && traducao === traducaoAuto);

	async function pedirTraducao(texto: string, forcar = false) {
		if (!onsugerirTraducao || !linguaDoAluno) return;
		const meu = ++pedidoDaTraducao;
		traduzindo = true;
		const sugestao = await onsugerirTraducao(texto, tagConteudo, linguaDoAluno);
		if (meu !== pedidoDaTraducao) return;
		traduzindo = false;
		semTradutor = sugestao === null;
		if (sugestao === null || alvo.trim() !== texto) return;
		// O professor pode ter começado a escrever a tradução enquanto esperava.
		const doProfessor = traducao.trim() !== '' && traducao !== traducaoAuto;
		if (doProfessor && !forcar) return;
		traducao = sugestao;
		traducaoAuto = sugestao;
	}

	/** "Traduzir de novo": troca a tradução atual pela do tradutor, a pedido. */
	function traduzirDeNovo() {
		const texto = alvo.trim();
		if (texto) void pedirTraducao(texto, true);
	}

	// Depende SÓ da frase (e de a tradução estar ligada): ler `traducao` aqui
	// faria a própria sugestão disparar outra, em laço.
	$effect(() => {
		const texto = alvo.trim();
		if (!podeTraduzir || modoEfetivo !== 'um') return;
		return untrack(() => {
			const doProfessor = traducao.trim() !== '' && traducao !== traducaoAuto;
			if (doProfessor) return;
			if (!texto) {
				// Apagou a frase: a tradução automática dela sai junto.
				pedidoDaTraducao++;
				traduzindo = false;
				if (traducaoEhAutomatica) traducao = '';
				traducaoAuto = null;
				return;
			}
			// Uma pausa na digitação, não uma tecla: cada pedido é CPU do serviço
			// que também transcreve a fala dos alunos.
			const espera = setTimeout(() => void pedirTraducao(texto), 650);
			return () => clearTimeout(espera);
		});
	});

	export function limpar() {
		editando = null;
		alvo = '';
		traducao = '';
		traducaoAuto = null;
		semTradutor = false;
		pedidoDaTraducao++;
		traduzindo = false;
		raw = '';
		nota = '';
		exemplo = '';
		perguntas = [{ question: '', answer: '' }];
		falas = FALAS_INICIAIS.map((f) => ({ ...f }));
		lote = '';
	}

	export function novo() {
		limpar();
		modo = 'um';
		if (!wiz) idioma = idiomaPadrao ?? '';
		primeiroCampo?.focus();
	}

	/** Reabre o formulário com os campos CRUS da linha — nunca com o resumo. */
	export function editar(m: MaterialRow) {
		editando = m;
		kind = m.kind;
		if (!wiz) idioma = m.idioma ?? '';
		modo = 'um';
		alvo = m.target;
		traducao = m.source;
		// A tradução gravada é do professor (ou ele já a conferiu): editar a frase
		// não a troca sozinha — "Traduzir de novo" está ali se ele quiser.
		traducaoAuto = null;
		semTradutor = false;
		raw = m.raw;
		nota = m.note;
		exemplo = m.example;
		perguntas =
			m.questions.length > 0 ? m.questions.map((q) => ({ ...q })) : [{ question: '', answer: '' }];
		falas =
			m.lines.length > 0 ? m.lines.map((l) => ({ ...l })) : FALAS_INICIAIS.map((f) => ({ ...f }));
	}

	function escolherTipo(id: MaterialKind) {
		if (editing) return;
		kind = id;
		// `modo` é o que a página lê para escolher a remote function, então ele
		// precisa dizer a verdade: texto e diálogo não têm lote.
		if (modo === 'lista' && id !== 'pair' && id !== 'vocab') modo = 'um';
	}

	// ── perguntas e falas ───────────────────────────────────────────────────
	function adicionarPergunta() {
		perguntas = [...perguntas, { question: '', answer: '' }];
	}
	function removerPergunta(i: number) {
		perguntas = perguntas.filter((_, j) => j !== i);
		if (perguntas.length === 0) perguntas = [{ question: '', answer: '' }];
	}
	function adicionarFala() {
		// Alterna o falante da última: diálogo é conversa, não monólogo.
		const ultima = falas.at(-1)?.speaker ?? 'B';
		falas = [...falas, { speaker: ultima === 'A' ? 'B' : 'A', text: '' }];
	}
	function removerFala(i: number) {
		falas = falas.filter((_, j) => j !== i);
	}
	function moverFala(i: number, delta: number) {
		const j = i + delta;
		if (j < 0 || j >= falas.length) return;
		const proximas = [...falas];
		[proximas[i], proximas[j]] = [proximas[j], proximas[i]];
		falas = proximas;
	}
	const proximoFalante = $derived((falas.at(-1)?.speaker ?? 'B') === 'A' ? 'B' : 'A');

	// ── repetido, dito enquanto digita ──────────────────────────────────────
	// O servidor reaproveita material IGUAL (igualdade de jsonb, `findEquivalent`),
	// então a comparação aqui espelha essa: os campos como vão ser gravados,
	// só com as pontas aparadas. Não passa pelo normalizador de propósito —
	// "café" e "cafe" são DOIS materiais para o servidor, e dizer "você já tem"
	// para depois gravar outro seria mentir.
	const repetido = $derived.by(() => {
		if (editing || modoEfetivo !== 'um' || (kind !== 'pair' && kind !== 'vocab')) return null;
		const a = alvo.trim();
		const b = traducao.trim();
		if (!a || !b) return null;
		const extra = (kind === 'pair' ? nota : exemplo).trim();
		const igual = biblioteca.find(
			(m) =>
				m.kind === kind &&
				m.target === a &&
				m.source === b &&
				(kind === 'pair' ? m.note : m.example) === extra
		);
		if (!igual) return null;
		return { row: igual, noConjunto: conjunto.some((m) => m.id === igual.id) };
	});

	// ── rendimento do conjunto ──────────────────────────────────────────────
	const rendimento = $derived(
		estimarRendimento(
			conjunto.map((m) => ({ kind: KIND_TO_KERNEL[m.kind], questions: m.questions.length }))
		)
	);
	const onde = $derived(wiz ? 'nesta atividade' : 'na sua biblioteca');
	const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
	const yieldInfo = $derived.by(() => {
		const r = rendimento;
		switch (kind) {
			case 'pair':
				return {
					warn: false,
					title: `${plural(r.frases, 'frase', 'frases')} ${onde}`,
					body: 'Cada frase rende 3 exercícios — montar, traduzir e completar a lacuna —, e mais ouvir e falar quando há áudio.'
				};
			case 'vocab': {
				const falta = wiz && r.termos < MINIMO_PARA_DISTRATOR;
				return {
					warn: falta,
					title: falta
						? `${r.termos} de ${MINIMO_PARA_DISTRATOR} termos`
						: `${plural(r.termos, 'termo', 'termos')} ${onde}`,
					body: falta
						? 'A alternativa errada sai de OUTRO termo seu. Com um só, nada é gerado — adicione ao menos um segundo termo.'
						: 'A alternativa errada sai de outro termo do mesmo conjunto, e um item de associação fecha a atividade.'
				};
			}
			case 'text': {
				const falta = wiz && r.perguntas < MINIMO_PARA_DISTRATOR;
				return {
					warn: falta,
					title: falta
						? `${r.perguntas} de ${MINIMO_PARA_DISTRATOR} perguntas no conjunto`
						: `${plural(r.textos, 'texto', 'textos')} ${onde}`,
					body: falta
						? 'A alternativa errada de uma pergunta sai da resposta de outra pergunta sua. Com uma só, nada é gerado.'
						: 'Cada pergunta vira uma questão de escolha. Texto sem pergunta não gera nada.'
				};
			}
			case 'dialogue':
				return {
					warn: false,
					title: `${plural(r.dialogos, 'diálogo', 'diálogos')} ${onde}`,
					body: 'Cada diálogo vira um exercício de colocar as falas na ordem. Não precisa de par: ele se resolve sozinho.'
				};
		}
	});

	// ── colar uma lista ─────────────────────────────────────────────────────
	// Com o tradutor ligado a linha sem separador ENTRA — o mesmo parser do
	// servidor, com a mesma opção, então a prévia continua sendo o que é gravado.
	const linhasLote = $derived(
		modoEfetivo === 'lista' ? previewRawLines(lote, { traduzirSemSeparador: podeTraduzir }) : []
	);
	const loteOk = $derived(linhasLote.filter((l) => l.ok).length);
	const loteAutomatico = $derived(linhasLote.filter((l) => l.automatica).length);
	const loteRuim = $derived(linhasLote.length - loteOk);

	/** Leva o cursor até a linha sem separador — é onde o conserto acontece. */
	function corrigirLinha(n: number) {
		const ta = textareaLote;
		if (!ta) return;
		const brutas = lote.split('\n');
		let inicio = 0;
		let vistas = 0;
		for (let i = 0; i < brutas.length; i++) {
			if (brutas[i].trim()) {
				vistas++;
				if (vistas === n) {
					ta.focus();
					ta.setSelectionRange(inicio, inicio + brutas[i].length);
					return;
				}
			}
			inicio += brutas[i].length + 1;
		}
	}

	// ── gerar com IA ── A página pede ao servidor (`ia.remote.ts`, ou o endpoint do
	// arquivo), que debita os créditos, chama o provedor e devolve as propostas já
	// validadas. Nada entra na biblioteca antes de o professor marcar e confirmar
	// (paginas.md "Studio"). A foto e o vídeo são preparados AQUI, no navegador: a foto
	// reduzida, e do vídeo só a fala do trecho (`$lib/client/arquivo-ia.ts`).
	type Fonte = 'prompt' | 'imagem' | 'video';
	let fonte = $state<Fonte>('prompt');
	let promptIa = $state('');
	let quantos = $state<5 | 10 | 20>(10);

	// O arquivo escolhido e o que já foi lido dele. `$state.raw`: são blobs e um
	// Float32Array de minutos de áudio, que não precisam de proxy profundo.
	let nomeDoArquivo = $state<string | null>(null);
	let fotoIa = $state.raw<Blob | null>(null);
	let previaDaFoto = $state<string | null>(null);
	let falaIa = $state.raw<FalaDecodificada | null>(null);
	let lendoArquivo = $state(false);
	let erroArquivo = $state<string | null>(null);
	let inicioTrecho = $state('');
	let fimTrecho = $state('');
	let arrastando = $state(false);
	/** Cada escolha de arquivo ganha um número: a leitura que terminar depois de outra escolha é descartada. */
	let leitura = 0;
	// O que o seletor do aparelho oferece. HEIC (a foto do iPhone) só abre no Safari; nos
	// outros, a mensagem de erro de `prepararImagem` pede um JPEG.
	const ACEITA_IMAGEM = 'image/jpeg,image/png,image/webp,image/heic,image/heif';
	const ACEITA_VIDEO = 'video/mp4,video/quicktime,video/*,audio/*,.mp4,.mov,.m4a,.mp3';

	// A miniatura da foto é um endereço local; ele é liberado quando a foto muda ou a tela sai.
	$effect(() => {
		const url = previaDaFoto;
		return () => {
			if (url) URL.revokeObjectURL(url);
		};
	});

	function esquecerArquivo() {
		leitura++;
		nomeDoArquivo = null;
		fotoIa = null;
		previaDaFoto = null;
		falaIa = null;
		erroArquivo = null;
		lendoArquivo = false;
		inicioTrecho = '';
		fimTrecho = '';
	}

	function escolherFonte(f: Fonte) {
		if (f === fonte) return;
		// A foto não serve ao vídeo, nem o vídeo à foto: trocar de fonte começa do zero.
		esquecerArquivo();
		fonte = f;
	}

	async function escolherArquivo(arquivo: File | null | undefined) {
		if (!arquivo || fonte === 'prompt') return;
		esquecerArquivo();
		const minha = leitura;
		nomeDoArquivo = arquivo.name;
		lendoArquivo = true;
		try {
			if (fonte === 'imagem') {
				const foto = await prepararImagem(arquivo);
				if (minha !== leitura) return;
				fotoIa = foto;
				previaDaFoto = URL.createObjectURL(foto);
			} else {
				const fala = await decodificarFala(arquivo);
				if (minha !== leitura) return;
				falaIa = fala;
			}
		} catch (e) {
			if (minha !== leitura) return;
			erroArquivo = e instanceof Error ? e.message : 'Não deu para ler este arquivo.';
			nomeDoArquivo = null;
		} finally {
			if (minha === leitura) lendoArquivo = false;
		}
	}

	function soltarArquivo(e: DragEvent) {
		e.preventDefault();
		void escolherArquivo(e.dataTransfer?.files?.[0]);
	}

	// O trecho do vídeo: em branco é o vídeo inteiro; `false` é o que não deu para ler.
	const inicioS = $derived(segundosDoTrecho(inicioTrecho));
	const fimS = $derived(segundosDoTrecho(fimTrecho));
	const trechoIlegivel = $derived(inicioS === false || fimS === false);
	const inicioNum = $derived(typeof inicioS === 'number' ? inicioS : 0);
	const fimNum = $derived(typeof fimS === 'number' ? fimS : null);
	const problemaNoTrecho = $derived.by(() => {
		if (!falaIa) return null;
		if (trechoIlegivel) return 'Escreva o tempo como 2:30 (minutos e segundos).';
		return problemaDoTrecho(falaIa.duracao, inicioNum, fimNum);
	});
	/** Os segundos de fala que vão para a IA: é deles que sai o custo da leitura. */
	const segundosDeFala = $derived.by(() => {
		if (!falaIa || problemaNoTrecho) return null;
		return Math.min(fimNum ?? falaIa.duracao, falaIa.duracao) - inicioNum;
	});

	const fonteLida = $derived(
		fonte === 'prompt' || (fonte === 'imagem' ? !!ia?.fontes?.imagem : !!ia?.fontes?.video)
	);
	const arquivoPronto = $derived(
		fonte === 'imagem' ? !!fotoIa : fonte === 'video' ? !!falaIa && !problemaNoTrecho : true
	);
	interface Proposta {
		id: string;
		esq: string;
		dir: string;
		reused: boolean;
		on: boolean;
		dados: Record<string, unknown>;
	}
	let propostas = $state<Proposta[]>([]);
	let gerandoIa = $state(false);
	let aceitandoIa = $state(false);
	let erroIa = $state<{ texto: string; motivo: MotivoDoBloqueio | null } | null>(null);
	/** O saldo depois da última geração; antes dela, o que a página mandou. */
	let saldoIa = $state<number | null>(null);
	const saldoAgora = $derived(saldoIa ?? ia?.saldo ?? 0);
	// A MESMA conta que o servidor debita (`custoDaGeracao`, $lib/billing/ia.ts): o que
	// o botão diz é o que sai do saldo.
	const custo = $derived(custoDaGeracao({ quantos, fonte, segundos: segundosDeFala }));
	const podeGerar = $derived(
		!!ia?.configurada &&
			!!ia.pode &&
			!!ongerarIa &&
			fonteLida &&
			(fonte === 'prompt' ? promptIa.trim().length >= 3 : arquivoPronto) &&
			saldoAgora >= custo.total &&
			!gerandoIa &&
			!lendoArquivo
	);

	async function gerarComIa() {
		if (!podeGerar || !ongerarIa) return;
		gerandoIa = true;
		erroIa = null;
		try {
			let arquivo: { fonte: 'imagem' | 'video'; blob: Blob } | undefined;
			if (fonte === 'imagem' && fotoIa) arquivo = { fonte: 'imagem', blob: fotoIa };
			if (fonte === 'video' && falaIa) {
				const fala = falaParaEnviar(falaIa, inicioNum, fimNum);
				if ('erro' in fala) {
					erroIa = { texto: fala.erro, motivo: null };
					return;
				}
				arquivo = { fonte: 'video', blob: fala.blob };
			}
			const r = await ongerarIa({ kind: KIND_TO_KERNEL[kind], texto: promptIa, quantos, arquivo });
			if (!r.ok) {
				erroIa = { texto: r.error, motivo: r.motivo ?? null };
				return;
			}
			saldoIa = r.saldo;
			// O que ele já tem nasce DESMARCADO: reaproveitar é o padrão do servidor,
			// mas marcar de novo o que já está na biblioteca não acrescenta nada.
			propostas = r.propostas.map((pr) => ({
				id: pr.id,
				esq: pr.resumo.esq,
				dir: pr.resumo.dir,
				reused: pr.reused,
				on: !pr.reused,
				dados: pr.dados
			}));
			if (r.propostas.length === 0) {
				erroIa = {
					texto: 'A IA não devolveu nenhuma proposta que servisse. Os créditos voltaram.',
					motivo: null
				};
			}
		} catch {
			erroIa = { texto: 'Não deu para gerar agora. Tente de novo em instantes.', motivo: null };
		} finally {
			gerandoIa = false;
		}
	}

	async function aceitarPropostas() {
		if (!onaceitarIa || nMarcadas === 0) return;
		aceitandoIa = true;
		try {
			const ok = await onaceitarIa(
				KIND_TO_KERNEL[kind],
				propostas.filter((pr) => pr.on).map((pr) => pr.dados)
			);
			if (ok) propostas = [];
		} finally {
			aceitandoIa = false;
		}
	}
	const nMarcadas = $derived(propostas.filter((p) => p.on).length);
	const nJaTem = $derived(propostas.filter((p) => p.on && p.reused).length);
	const FONTES: { id: Fonte; label: string; hint: string; icon: string }[] = [
		{
			id: 'prompt',
			label: 'Prompt',
			hint: 'você descreve',
			icon: 'M5 6.5h14M5 11h14M5 15.5h8M5 20h5'
		},
		{
			id: 'imagem',
			label: 'Imagem',
			hint: 'foto de página',
			icon: 'M3 7.5a3 3 0 013-3h12a3 3 0 013 3v9a3 3 0 01-3 3H6a3 3 0 01-3-3zM4 16l4.5-4.5 3.5 3.5 3-3L20 16'
		},
		{
			id: 'video',
			label: 'Vídeo',
			hint: 'com fala',
			icon: 'M3.5 7a2.5 2.5 0 012.5-2.5h6A2.5 2.5 0 0114.5 7v10a2.5 2.5 0 01-2.5 2.5H6A2.5 2.5 0 013.5 17zM14.5 10l6-3.5v11l-6-3.5z'
		}
	];
	const promptPlaceholder = $derived(
		{
			pair: 'Frases sobre rotina no presente simples, nível de 7º ano, com horas.',
			vocab: 'Vocabulário de café da manhã e horários do dia.',
			text: 'Um texto curto sobre a rotina de manhã de uma pessoa, com 4 perguntas.',
			dialogue: 'Um diálogo de duas pessoas numa padaria, 6 falas.'
		}[kind]
	);
	const atalhos = $derived(
		{
			pair: ['do meu último texto', 'mais fáceis', 'com negativa'],
			vocab: ['do meu último texto', '+ frase de exemplo', 'só substantivos'],
			text: ['mais curto', 'nível iniciante', '+ perguntas'],
			dialogue: ['mais falas', 'linguagem informal', 'em loja']
		}[kind]
	);
	function usarAtalho(a: string) {
		promptIa = promptIa.trim() ? `${promptIa.trim()}, ${a}` : a;
	}
	function marcarTodas() {
		const todas = nMarcadas === propostas.length;
		propostas = propostas.map((p) => ({ ...p, on: !todas }));
	}

	// ── o que o aluno vai ver ───────────────────────────────────────────────
	const EXEMPLO = {
		pair: { alvo: 'She leaves home at eight.', trad: 'Ela sai de casa às oito.' },
		vocab: { alvo: 'breakfast', trad: 'café da manhã' },
		text: { pergunta: 'What time does Ana leave home?', resposta: 'At eight.' },
		dialogue: ['What do you have for breakfast?', 'I have coffee and bread.', 'And you?']
	};
	const previa = $derived.by(() => {
		const outros = conjunto.filter((m) => m.id !== editando?.id);
		switch (kind) {
			case 'pair': {
				const frase = alvo.trim() || EXEMPLO.pair.alvo;
				// Regra inviolável nº 5: nunca `split(' ')`. O segmentador do idioma
				// alvo é o que separa palavra em japonês e em tailandês.
				const tokens = tokenize(frase, { tag: tagConteudo });
				return {
					kind: 'Montar a frase',
					note: '1 dos 3 exercícios desta frase',
					prompt: traducao.trim() || EXEMPLO.pair.trad,
					chips: shuffleWithSeed(tokens, frase),
					opts: [] as { label: string; right: boolean }[],
					falas: [] as string[],
					foot: ''
				};
			}
			case 'vocab': {
				const certa = traducao.trim() || EXEMPLO.vocab.trad;
				const erradas = outros
					.filter((m) => m.kind === 'vocab' && m.source && m.source !== certa)
					.map((m) => m.source)
					.slice(0, 2);
				const opts = shuffleWithSeed(
					[{ label: certa, right: true }, ...erradas.map((label) => ({ label, right: false }))],
					certa
				);
				return {
					kind: 'Escolher a tradução',
					note: 'a errada vem de outro termo seu',
					prompt: alvo.trim() || EXEMPLO.vocab.alvo,
					chips: [] as string[],
					opts,
					falas: [] as string[],
					foot:
						erradas.length === 0
							? 'As alternativas erradas seriam sentidos de outros termos seus — por isso um termo sozinho não gera nada.'
							: 'As erradas são sentidos de outros termos da sua lista.'
				};
			}
			case 'text': {
				const feitas = perguntas.filter((p) => p.question.trim() && p.answer.trim());
				const primeira = feitas[0] ?? {
					question: EXEMPLO.text.pergunta,
					answer: EXEMPLO.text.resposta
				};
				const outrasRespostas = [
					...feitas.slice(1).map((p) => p.answer.trim()),
					...outros
						.filter((m) => m.kind === 'text')
						.flatMap((m) => m.questions.map((q) => q.answer))
				]
					.filter((r) => r && r !== primeira.answer)
					.slice(0, 2);
				const opts = shuffleWithSeed(
					[
						{ label: primeira.answer, right: true },
						...outrasRespostas.map((label) => ({ label, right: false }))
					],
					primeira.question
				);
				return {
					kind: 'Responder sobre o texto',
					note: 'uma questão por pergunta sua',
					prompt: primeira.question,
					chips: [] as string[],
					opts,
					falas: [] as string[],
					foot:
						outrasRespostas.length === 0
							? 'A alternativa errada seria a resposta de outra pergunta — com uma só, nada é gerado.'
							: 'A alternativa errada é a resposta de outra pergunta sua.'
				};
			}
			case 'dialogue': {
				const ditas = falas.map((f) => f.text.trim()).filter(Boolean);
				const linhas = ditas.length >= 2 ? ditas : EXEMPLO.dialogue;
				return {
					kind: 'Colocar na ordem',
					note: 'as falas chegam embaralhadas',
					prompt: 'Arraste as falas para a ordem certa.',
					chips: [] as string[],
					opts: [] as { label: string; right: boolean }[],
					falas: shuffleWithSeed(linhas, linhas.join('\n')),
					foot: ''
				};
			}
		}
	});

	// ── salvar ──────────────────────────────────────────────────────────────
	const podeSalvar = $derived.by(() => {
		if (salvando) return false;
		switch (modoEfetivo) {
			case 'lista':
				return loteOk > 0;
			case 'ia':
				return nMarcadas > 0 && !aceitandoIa && !!onaceitarIa;
			default:
				return kind === 'text'
					? alvo.trim().length > 0 && raw.trim().length > 0
					: kind === 'dialogue'
						? falas.filter((f) => f.text.trim()).length >= 2
						: // Com o tradutor ligado, a tradução em branco é feita ao salvar.
							alvo.trim().length > 0 && (traducao.trim().length > 0 || podeTraduzir);
		}
	});
	const saveLabel = $derived(
		editing
			? 'Salvar alterações'
			: modoEfetivo === 'ia'
				? `Adicionar ${plural(nMarcadas, 'material', 'materiais')}`
				: modoEfetivo === 'lista'
					? `Adicionar ${plural(loteOk, 'material', 'materiais')}`
					: wiz
						? 'Adicionar à atividade'
						: 'Adicionar à biblioteca'
	);
	const footNote = $derived(
		modoEfetivo === 'ia'
			? nJaTem > 0
				? `${nJaTem} das marcadas você já tem — essas são reaproveitadas, não duplicadas.`
				: 'Só o que está marcado é gravado. Nada é salvo enquanto você não confirmar.'
			: wiz
				? 'Todo material adicionado aqui também entra na sua biblioteca e pode ser reusado em outra atividade.'
				: 'Material igual ao que você já tem é reaproveitado, nunca duplicado.'
	);

	const rotuloAlvo = $derived(
		kind === 'pair'
			? rotuloDoIdioma
				? `Frase em ${rotuloDoIdioma.toLocaleLowerCase('pt-BR')}`
				: 'Frase no idioma alvo'
			: rotuloDoIdioma
				? `Termo em ${rotuloDoIdioma.toLocaleLowerCase('pt-BR')}`
				: 'Termo no idioma alvo'
	);
	const rotuloTraducao = $derived(
		kind === 'pair'
			? sourceLabel
				? `Tradução em ${sourceLabel.toLocaleLowerCase('pt-BR')}`
				: 'Tradução'
			: sourceLabel
				? `Sentido em ${sourceLabel.toLocaleLowerCase('pt-BR')}`
				: 'Sentido'
	);

	// Os chips de quantidade da IA. O "Como adicionar" é o `Alternador`.
	const segmentoOn = 'bg-primary text-primary-content';
	const segmentoOff = 'text-base-content/65 hover:text-base-content';
</script>

<div class="flex h-full min-h-0 flex-col bg-base-100">
	<!-- cabeçalho -->
	<div class="flex shrink-0 items-start gap-3 border-b border-line px-5 py-4 lg:px-6 lg:py-5">
		<div class="min-w-0 flex-1">
			<p
				class="mb-1 font-display text-[20px] leading-tight font-semibold tracking-[-0.02em] lg:text-[22px]"
			>
				{editing ? 'Editar material' : wiz ? 'Adicionar material' : 'Novo material'}
			</p>
			<p class="text-[12.5px] leading-normal text-pretty text-base-content/65">
				{#if editing}
					O tipo não muda — ele define a forma do dado que os exercícios já gerados apontam.
				{:else if wiz}
					Cole o que você usa em aula. Tudo que entra aqui também vai para a sua biblioteca.
				{:else}
					Você cadastra o conteúdo; os exercícios são gerados a partir dele.
				{/if}
			</p>
		</div>
		{#if onfechar}
			<button
				type="button"
				onclick={onfechar}
				class="btn shrink-0 gap-2 btn-neutral {fecharRotulo
					? 'btn-sm'
					: 'size-10 min-h-10 p-0'} {fecharSoNoCelular ? 'lg:hidden' : ''}"
				aria-label={fecharRotulo ?? (wiz ? 'Voltar para os materiais desta atividade' : 'Fechar')}
			>
				<svg class="size-[15px] shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<path
						d="M6 6l12 12M18 6L6 18"
						stroke="currentColor"
						stroke-width="2.2"
						stroke-linecap="round"
					/>
				</svg>
				{#if fecharRotulo}<span>{fecharRotulo}</span>{/if}
			</button>
		{/if}
	</div>

	<!-- corpo -->
	<div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 lg:px-6 lg:py-6">
		<!-- tipo: cartões que dizem o que o aluno faz -->
		<h3 class="mb-2.5 text-[15px] font-bold">
			{editing ? 'O que o aluno faz' : 'O que o aluno vai fazer'}
			{#if editing}<span class="text-[12.5px] font-normal text-base-content/60">· travado</span
				>{/if}
		</h3>
		<input type="hidden" name="kind" value={kernelKind} />
		{#if !wiz}
			<!-- Para onde vai a tradução automática na biblioteca; no wizard o
			     servidor usa a língua do aluno da própria atividade. -->
			<input type="hidden" name="linguaDoAluno" value={linguaDoAluno ?? ''} />
		{/if}
		<div class="mb-2.5 grid gap-2 sm:grid-cols-2">
			{#each TIPOS as t (t.id)}
				{@const sel = t.id === kind}
				{@const locked = editing && !sel}
				<button
					type="button"
					onclick={() => escolherTipo(t.id)}
					disabled={locked}
					aria-pressed={sel}
					title={locked ? 'O tipo de um material não muda depois de criado' : t.title}
					class="flex items-start gap-2.5 rounded-box border-[1.5px] p-3.5 text-start transition-[border-color,background-color,transform,translate,scale] duration-150 enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45
					       {sel
						? 'border-primary bg-primary/6'
						: 'border-line bg-base-100 enabled:hover:border-primary'}"
				>
					<span
						class="grid size-[30px] shrink-0 place-items-center rounded-field {sel
							? 'bg-primary text-primary-content'
							: 'bg-base-300 text-primary'}"
					>
						<svg class="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<path
								d={t.icon}
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						</svg>
					</span>
					<span class="min-w-0">
						<span class="mb-0.5 block text-[13.5px] font-bold">{t.label}</span>
						<span class="block text-[12px] leading-snug text-base-content/65">{t.does}</span>
					</span>
				</button>
			{/each}
		</div>
		<!-- A dica "escolha pelo exercício, não pelo arquivo" repetia o título dos
		     cartões; sobrou só a da edição, que diz algo novo. -->
		{#if editing}
			<p class="mb-2.5 text-[12px] leading-normal text-base-content/65">
				Para usar outro tipo, crie um material novo.
			</p>
		{/if}

		<!-- rendimento: o que o conjunto já dá para gerar. Uma linha neutra quando
		     está tudo certo; caixa de aviso só quando falta algo — é aí que ele pede
		     ação. (O verde do ícone antigo é a cor da correção.) -->
		{#if yieldInfo.warn}
			<div class="mb-[18px] flex gap-2.5 rounded-box border border-warning/35 bg-warning/6 p-3.5">
				<svg
					class="mt-px size-[17px] shrink-0 text-warning"
					viewBox="0 0 24 24"
					fill="none"
					aria-hidden="true"
				>
					<path
						d="M12 4.5l8 14.5H4z"
						stroke="currentColor"
						stroke-width="2"
						stroke-linejoin="round"
					/>
					<path
						d="M12 10v3.4M12 16.3v.1"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
					/>
				</svg>
				<div class="min-w-0">
					<p class="mb-0.5 text-[13px] font-bold text-warning">{yieldInfo.title}</p>
					<p class="text-[12.5px] leading-normal text-pretty text-base-content/65">
						{yieldInfo.body}
					</p>
				</div>
			</div>
		{:else}
			<p class="mb-[18px] text-[12.5px] leading-normal text-pretty text-base-content/65">
				<strong class="font-semibold text-base-content">{yieldInfo.title}.</strong>
				{yieldInfo.body}
			</p>
		{/if}

		<!-- idioma e modo: os dois mudam o que os campos abaixo pedem ("Frase em
		     japonês", um campo ou uma lista), então ficam logo antes deles. -->
		<div class="mb-5 grid gap-4 border-t border-line pt-5">
			{#if !wiz}
				<!-- idioma: a tag do material na biblioteca. No wizard ele é o da atividade. -->
				<div class="fieldset">
					<label for="material-idioma" class="fieldset-legend">Idioma</label>
					{#if idiomaTravado}
						<input type="hidden" name="idioma" value={idioma ?? ''} />
						<div class="flex flex-wrap items-center gap-x-3 gap-y-1.5">
							<IdiomaTag tag={idioma} />
							<span class="text-[12.5px] text-base-content/65"
								>travado: está em {editando?.usedIn}
								{editando?.usedIn === 1 ? 'atividade' : 'atividades'} desse idioma</span
							>
						</div>
					{:else}
						<select
							id="material-idioma"
							name="idioma"
							bind:value={() => idioma ?? '', (v) => (idioma = v || null)}
							class="select w-full sm:max-w-[18rem]"
						>
							<option value="">Sem idioma</option>
							{#each IDIOMAS as i (i.tag)}
								<option value={i.tag}>{i.rotulo}</option>
							{/each}
						</select>
						<span class="fieldset-label"
							>A língua que o aluno vai aprender. Define a direção do texto e como a frase é
							dividida.</span
						>
					{/if}
				</div>
			{/if}

			{#if !editing}
				<div class="fieldset">
					<span class="fieldset-legend">Como adicionar</span>
					<Alternador
						opcoes={podeColar
							? [
									{ id: 'um' as const, label: 'Um de cada vez' },
									{ id: 'lista' as const, label: 'Colar uma lista' },
									{ id: 'ia' as const, label: 'Gerar com IA' }
								]
							: [
									{ id: 'um' as const, label: 'Um de cada vez' },
									{ id: 'ia' as const, label: 'Gerar com IA' }
								]}
						valor={modoEfetivo}
						onmudar={(m) => (modo = m)}
						rotulo="Como adicionar"
						largura="cheia"
					/>
				</div>
			{/if}
		</div>

		<!-- aviso de edição compartilhada -->
		{#if editing && editando && editando.usedIn > 0}
			{@const outras = wiz ? editando.usedIn - 1 : editando.usedIn}
			<div class="mb-4 flex gap-2.5 rounded-box border border-warning/35 bg-warning/6 p-3.5">
				<svg
					class="mt-px size-[17px] shrink-0 text-warning"
					viewBox="0 0 24 24"
					fill="none"
					aria-hidden="true"
				>
					<path
						d="M12 4.5l8 14.5H4z"
						stroke="currentColor"
						stroke-width="2"
						stroke-linejoin="round"
					/>
					<path
						d="M12 10v3.4M12 16.3v.1"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
					/>
				</svg>
				<div class="min-w-0">
					<p class="mb-0.5 text-[13px] font-bold">
						{#if wiz && outras > 0}
							Este material também está em {plural(outras, 'outra atividade', 'outras atividades')}
						{:else if wiz}
							Este material só está nesta atividade
						{:else}
							Este material está em {plural(editando.usedIn, 'atividade', 'atividades')}
						{/if}
					</p>
					<p class="text-[12.5px] leading-normal text-pretty text-base-content/65">
						Salvar muda o que os rascunhos veem. O que já está no ar não muda — a atividade
						publicada guarda uma cópia congelada.
					</p>
				</div>
			</div>
		{/if}

		<!-- ══ um de cada vez ══ -->
		{#if modoEfetivo === 'um'}
			<div class="grid gap-3.5">
				{#if kind === 'pair' || kind === 'vocab'}
					<div>
						<label for="mf-alvo" class="mb-1.5 flex items-baseline gap-2 text-[12.5px] font-bold">
							{rotuloAlvo}
							{#if kind === 'pair'}
								<span class="text-[11.5px] font-medium text-base-content/65"
									>o que o aluno vai treinar</span
								>
							{/if}
						</label>
						<input
							id="mf-alvo"
							name="target"
							bind:value={alvo}
							bind:this={primeiroCampo}
							dir={direcao}
							data-content-lang={tagConteudo}
							class="input w-full font-content text-[15px]"
							placeholder={kind === 'pair' ? EXEMPLO.pair.alvo : EXEMPLO.vocab.alvo}
						/>
						{#if repetido}
							<div
								class="mt-2 flex feedback-in flex-wrap items-center gap-x-3 gap-y-1.5 rounded-field border border-line bg-base-200 px-3 py-2.5"
								role="status"
							>
								<svg
									class="size-[15px] shrink-0 text-accent"
									viewBox="0 0 24 24"
									fill="none"
									aria-hidden="true"
								>
									<path
										d="M5 12.5l4.5 4.5L19 7"
										stroke="currentColor"
										stroke-width="2.4"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
								</svg>
								<span
									class="min-w-[160px] flex-1 text-[12.5px] leading-normal text-base-content/65"
								>
									{#if repetido.noConjunto && wiz}
										{kind === 'pair' ? 'Esta frase' : 'Este termo'} já está nesta atividade.
									{:else}
										Você já tem {kind === 'pair' ? 'esta frase' : 'este termo'}. {kind === 'pair'
											? 'Ela'
											: 'Ele'} vai ser {kind === 'pair' ? 'reaproveitada' : 'reaproveitado'}, não {kind ===
										'pair'
											? 'duplicada'
											: 'duplicado'}.
									{/if}
								</span>
							</div>
						{/if}
					</div>
					<div>
						<label for="mf-trad" class="mb-1.5 flex items-baseline gap-2 text-[12.5px] font-bold">
							{rotuloTraducao}
							{#if podeTraduzir}
								<span class="text-[11.5px] font-medium text-base-content/65"
									>sai sozinha, você confere</span
								>
							{/if}
						</label>
						<input
							id="mf-trad"
							name="source"
							bind:value={traducao}
							aria-describedby={podeTraduzir ? 'mf-trad-status' : undefined}
							class="input w-full font-content text-[14.5px]"
							placeholder={podeTraduzir
								? 'A tradução aparece aqui'
								: kind === 'pair'
									? EXEMPLO.pair.trad
									: EXEMPLO.vocab.trad}
						/>
						{#if podeTraduzir}
							<!-- O estado da tradução em TEXTO: quem usa leitor de tela ouve
							     "traduzindo", e o "Traduzir de novo" só aparece quando a
							     tradução do campo é do professor, não a sugerida. -->
							<div
								id="mf-trad-status"
								class="mt-1.5 flex min-h-5 flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-base-content/65"
								role="status"
							>
								{#if traduzindo}
									<Loading variant="fila" size={10} label="Traduzindo" />
									<span>Traduzindo…</span>
								{:else if semTradutor && !traducao.trim()}
									<span>O tradutor não respondeu agora. Escreva a tradução.</span>
								{:else if traducaoEhAutomatica}
									<span>Tradução automática. Confira e ajuste se precisar.</span>
								{:else if !traducao.trim()}
									<span>Ela aparece quando você terminar de escrever.</span>
								{/if}
								{#if alvo.trim() && !traduzindo && traducao.trim() && !traducaoEhAutomatica}
									<button
										type="button"
										onclick={traduzirDeNovo}
										class="font-semibold text-primary underline-offset-2 hover:underline"
										>Traduzir de novo</button
									>
								{/if}
							</div>
						{/if}
					</div>
					{#if kind === 'pair'}
						<div>
							<label for="mf-nota" class="mb-1.5 flex items-baseline gap-2 text-[12.5px] font-bold">
								Sua nota
								<span class="text-[11.5px] font-medium text-base-content/65"
									>opcional · o aluno nunca vê</span
								>
							</label>
							<input
								id="mf-nota"
								name="note"
								bind:value={nota}
								class="input w-full bg-base-200 text-[14px]"
								placeholder="Usar depois de ensinar horas"
							/>
						</div>
					{:else}
						<div>
							<label
								for="mf-exemplo"
								class="mb-1.5 flex items-baseline gap-2 text-[12.5px] font-bold"
							>
								Frase de exemplo
								<span class="text-[11.5px] font-medium text-base-content/65"
									>opcional · fica guardada para depois</span
								>
							</label>
							<input
								id="mf-exemplo"
								name="example"
								bind:value={exemplo}
								dir={direcao}
								data-content-lang={tagConteudo}
								class="input w-full bg-base-200 font-content text-[14px]"
								placeholder="I have breakfast at seven."
							/>
						</div>
					{/if}
				{:else if kind === 'text'}
					<div>
						<label for="mf-titulo" class="mb-1.5 block text-[12.5px] font-bold"
							>Título do texto</label
						>
						<input
							id="mf-titulo"
							name="target"
							bind:value={alvo}
							bind:this={primeiroCampo}
							class="input w-full text-[14.5px]"
							placeholder="Ana's morning"
						/>
					</div>
					<div>
						<label for="mf-texto" class="mb-1.5 block text-[12.5px] font-bold">O texto</label>
						<textarea
							id="mf-texto"
							name="raw"
							bind:value={raw}
							rows="5"
							dir={direcao}
							data-content-lang={tagConteudo}
							class="textarea w-full font-content text-[14.5px] leading-[1.65]"
							placeholder="Cole o trecho que você usa em aula"></textarea>
					</div>
					<!-- Sem pergunta, `passage-comprehension` devolve zero itens: o texto
					     entra na lista e não gera nada. -->
					<input type="hidden" name="questions" value={JSON.stringify(perguntas)} />
					<div>
						<div class="mb-2 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
							<span class="text-[12.5px] font-bold">Perguntas de compreensão</span>
							<span class="text-[11.5px] text-base-content/65"
								>cada pergunta vira uma questão de escolha</span
							>
						</div>
						<div class="grid gap-2">
							{#each perguntas as pergunta, i (i)}
								<div class="flex items-center gap-2">
									<span
										class="grid size-6 shrink-0 place-items-center rounded-field bg-base-300 font-mono text-[11.5px] text-primary"
										aria-hidden="true">{i + 1}</span
									>
									<div class="grid min-w-0 flex-1 gap-1.5 sm:grid-cols-2">
										<input
											bind:value={pergunta.question}
											dir={direcao}
											data-content-lang={tagConteudo}
											class="input min-w-0 font-content text-[13.5px]"
											placeholder="Pergunta"
											aria-label="Pergunta {i + 1}"
										/>
										<input
											bind:value={pergunta.answer}
											dir={direcao}
											data-content-lang={tagConteudo}
											class="input min-w-0 font-content text-[13.5px]"
											placeholder="Resposta certa"
											aria-label="Resposta da pergunta {i + 1}"
										/>
									</div>
									<button
										type="button"
										onclick={() => removerPergunta(i)}
										class="grid size-[34px] shrink-0 place-items-center rounded-field border border-line text-base-content/65 transition-colors hover:border-error hover:text-error"
										aria-label="Remover pergunta {i + 1}"
									>
										<svg class="size-3.5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
											<path
												d="M6 6l12 12M18 6L6 18"
												stroke="currentColor"
												stroke-width="2.2"
												stroke-linecap="round"
											/>
										</svg>
									</button>
								</div>
							{/each}
						</div>
						<button
							type="button"
							onclick={adicionarPergunta}
							class="mt-2 flex min-h-[44px] items-center gap-2 rounded-field border border-dashed border-line px-3.5 text-[13px] font-bold text-primary transition-colors hover:border-primary hover:bg-base-200"
						>
							<svg class="size-[15px] shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
								<path
									d="M12 5v14M5 12h14"
									stroke="currentColor"
									stroke-width="2.2"
									stroke-linecap="round"
								/>
							</svg>
							Adicionar pergunta
						</button>
					</div>
				{:else}
					<!-- Falante e fala em campos separados. Colado num bloco só, uma linha
					     sem "Nome:" caía em A/B alternado sem o professor saber. -->
					<input type="hidden" name="lines" value={JSON.stringify(falas)} />
					<div>
						<div class="mb-2 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
							<span class="text-[12.5px] font-bold">As falas, na ordem certa</span>
							<span class="text-[11.5px] text-base-content/65"
								>o aluno vai receber embaralhadas</span
							>
						</div>
						<div class="grid gap-2">
							{#each falas as fala, i (i)}
								<div class="flex items-center gap-2">
									<input
										bind:value={fala.speaker}
										maxlength="14"
										class="w-[52px] shrink-0 rounded-field border border-line bg-base-200 px-1 py-2 text-center text-[12px] font-bold text-primary outline-none focus-visible:border-primary"
										aria-label="Falante da linha {i + 1}"
									/>
									<input
										bind:value={fala.text}
										dir={direcao}
										data-content-lang={tagConteudo}
										class="input min-w-0 flex-1 font-content text-[14px]"
										placeholder="O que essa pessoa diz"
										aria-label="Fala {i + 1}"
									/>
									<span class="flex shrink-0 gap-1">
										<button
											type="button"
											onclick={() => moverFala(i, -1)}
											disabled={i === 0}
											class="grid h-[34px] w-8 place-items-center rounded-field border border-line text-base-content/65 transition-colors hover:text-primary disabled:opacity-30"
											aria-label="Subir a fala {i + 1}"
										>
											<svg class="size-[13px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
												<path
													d="M6 14l6-6 6 6"
													stroke="currentColor"
													stroke-width="2.2"
													stroke-linecap="round"
													stroke-linejoin="round"
												/>
											</svg>
										</button>
										<button
											type="button"
											onclick={() => moverFala(i, 1)}
											disabled={i === falas.length - 1}
											class="grid h-[34px] w-8 place-items-center rounded-field border border-line text-base-content/65 transition-colors hover:text-primary disabled:opacity-30"
											aria-label="Descer a fala {i + 1}"
										>
											<svg class="size-[13px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
												<path
													d="M6 10l6 6 6-6"
													stroke="currentColor"
													stroke-width="2.2"
													stroke-linecap="round"
													stroke-linejoin="round"
												/>
											</svg>
										</button>
										<button
											type="button"
											onclick={() => removerFala(i)}
											disabled={falas.length <= 2}
											class="grid h-[34px] w-8 place-items-center rounded-field border border-line text-base-content/65 transition-colors hover:border-error hover:text-error disabled:opacity-30"
											aria-label="Remover a fala {i + 1}"
										>
											<svg class="size-[13px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
												<path
													d="M6 6l12 12M18 6L6 18"
													stroke="currentColor"
													stroke-width="2.2"
													stroke-linecap="round"
												/>
											</svg>
										</button>
									</span>
								</div>
							{/each}
						</div>
						<button
							type="button"
							onclick={adicionarFala}
							class="mt-2 flex min-h-[44px] items-center gap-2 rounded-field border border-dashed border-line px-3.5 text-[13px] font-bold text-primary transition-colors hover:border-primary hover:bg-base-200"
						>
							<svg class="size-[15px] shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
								<path
									d="M12 5v14M5 12h14"
									stroke="currentColor"
									stroke-width="2.2"
									stroke-linecap="round"
								/>
							</svg>
							Adicionar fala de {proximoFalante}
						</button>
					</div>
				{/if}
			</div>

			<!-- ══ colar uma lista ══ -->
		{:else if modoEfetivo === 'lista'}
			<div>
				<label
					for="mf-lote"
					class="mb-1.5 flex flex-wrap items-baseline gap-x-2 text-[12.5px] font-bold"
				>
					{kind === 'vocab' ? 'Um termo por linha' : 'Uma frase por linha'}
					{#if podeTraduzir}
						<span class="text-[11.5px] font-medium text-base-content/65"
							>a tradução depois do separador é opcional: sem ela, sai sozinha</span
						>
					{/if}
				</label>
				<textarea
					id="mf-lote"
					name="raw"
					bind:value={lote}
					bind:this={textareaLote}
					rows="6"
					dir={direcao}
					data-content-lang={tagConteudo}
					class="textarea w-full font-content text-[14px] leading-[1.7]"
					placeholder={kind === 'vocab'
						? `${EXEMPLO.vocab.alvo} · ${EXEMPLO.vocab.trad}`
						: `${EXEMPLO.pair.alvo} · ${EXEMPLO.pair.trad}`}></textarea>
				<div class="mt-2 flex flex-wrap gap-1.5">
					{#each RAW_SEPARATORS as s (s.mark)}
						<span
							class="inline-flex items-center gap-1.5 rounded-full border border-line bg-base-200 px-2.5 py-1 text-[12px] text-base-content/65"
						>
							<span class="font-mono text-[12.5px] text-base-content">{s.mark}</span>
							{s.name}
						</span>
					{/each}
				</div>

				<!-- A prévia sai do MESMO parser do servidor: o que está na tela é
				     o que vai ser gravado, linha por linha. -->
				{#if linhasLote.length > 0}
					<div class="mt-3.5 overflow-hidden rounded-box border border-line">
						<div
							class="flex flex-wrap items-center gap-x-3.5 gap-y-2 border-b border-line bg-base-200 px-3.5 py-2.5"
						>
							<span class="text-[12.5px] font-bold">
								{plural(linhasLote.length, 'linha', 'linhas')} · {loteOk}
								{loteOk === 1 ? 'vira' : 'viram'} material
							</span>
							{#if loteAutomatico > 0}
								<span class="text-[12px] text-base-content/65">
									{loteAutomatico}
									{loteAutomatico === 1 ? 'ganha' : 'ganham'} tradução automática ao adicionar
								</span>
							{/if}
							<div class="min-w-1 flex-1"></div>
							{#if loteRuim > 0}
								<span
									class="inline-flex items-center gap-1.5 rounded-full bg-warning/14 px-2.5 py-1 text-[12px] font-bold text-warning"
								>
									<svg class="size-[13px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
										<path
											d="M12 4.5l8 14.5H4z"
											stroke="currentColor"
											stroke-width="2"
											stroke-linejoin="round"
										/>
										<path
											d="M12 10v3.2M12 16.2v.1"
											stroke="currentColor"
											stroke-width="2"
											stroke-linecap="round"
										/>
									</svg>
									{loteRuim} sem separador
								</span>
							{/if}
						</div>
						<!-- As linhas rolam DENTRO da prévia, com o resumo parado em cima: uma
						     lista de cinquenta frases empurrava "O que o aluno vai ver" e o
						     resto do formulário para longe. Sem `overscroll-contain` de
						     propósito — chegando ao fim da lista, a rolagem segue para o
						     formulário em vez de travar. Focável para quem rola pelo teclado. -->
						<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
						<div
							role="region"
							aria-label="Prévia das linhas coladas"
							tabindex="0"
							class="max-h-[min(18rem,40dvh)] overflow-y-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
						>
							{#each linhasLote as l, i (i)}
								<div
									class="flex items-center gap-2.5 border-b border-line px-3.5 py-2.5 last:border-0 {l.ok
										? ''
										: 'bg-warning/6'}"
								>
									<span class="w-4 shrink-0 font-mono text-[11.5px] text-base-content/65"
										>{i + 1}</span
									>
									{#if l.ok}
										<span class="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2.5 gap-y-1">
											<span
												class="font-content text-[13.5px] font-semibold"
												dir={direcao}
												data-content-lang={tagConteudo}>{l.left}</span
											>
											{#if l.automatica}
												<span class="text-[12.5px] text-base-content/65 italic"
													>tradução automática</span
												>
											{:else}
												<span class="text-[12.5px] text-base-content/65">{l.right}</span>
											{/if}
										</span>
										<svg
											class="size-[15px] shrink-0 text-success"
											viewBox="0 0 24 24"
											fill="none"
											aria-hidden="true"
										>
											<path
												d="M5 12.5l4.5 4.5L19 7"
												stroke="currentColor"
												stroke-width="2.4"
												stroke-linecap="round"
												stroke-linejoin="round"
											/>
										</svg>
									{:else}
										<span class="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2.5 gap-y-1">
											<span class="font-content text-[13.5px] text-base-content/65 line-through"
												>{l.left}</span
											>
											<span class="text-[12px] font-bold text-warning">sem separador</span>
										</span>
										<button
											type="button"
											onclick={() => corrigirLinha(i + 1)}
											class="btn btn-sm shrink-0 btn-plain text-[12px] text-primary"
											>Corrigir</button
										>
									{/if}
								</div>
							{/each}
						</div>
					</div>
				{/if}
			</div>

			<!-- ══ gerar com IA ══ -->
		{:else}
			<div>
				<div class="mb-3.5 flex flex-wrap gap-2" role="group" aria-label="De onde a IA parte">
					{#each FONTES as f (f.id)}
						{@const sel = f.id === fonte}
						<button
							type="button"
							onclick={() => escolherFonte(f.id)}
							aria-pressed={sel}
							class="flex min-w-[104px] flex-1 items-center gap-2 rounded-field border-[1.5px] px-3 py-2.5 text-start transition-[border-color,background-color,transform,translate,scale] duration-150 hover:-translate-y-0.5
							       {sel ? 'border-primary bg-primary/6' : 'border-line bg-base-100 hover:border-primary'}"
						>
							<span
								class="grid size-7 shrink-0 place-items-center rounded-field {sel
									? 'bg-primary text-primary-content'
									: 'bg-base-300 text-primary'}"
							>
								<svg class="size-[15px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
									<path
										d={f.icon}
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
								</svg>
							</span>
							<span class="min-w-0">
								<span class="block text-[13px] font-bold">{f.label}</span>
								<span class="block text-[11.5px] text-base-content/65">{f.hint}</span>
							</span>
						</button>
					{/each}
				</div>

				{#if fonte === 'prompt'}
					<label for="mf-prompt" class="mb-1.5 block text-[12.5px] font-bold"
						>O que você quer treinar</label
					>
					{#if ia?.idiomas}
						<!-- A biblioteca não tem idioma: dizer em qual a IA vai escrever evita
						     gastar crédito com propostas no idioma errado. -->
						<p class="-mt-1 mb-1.5 text-[12px] text-base-content/65">{ia.idiomas}</p>
					{/if}
					<textarea
						id="mf-prompt"
						bind:value={promptIa}
						rows="3"
						class="textarea w-full text-[14px] leading-relaxed"
						placeholder={promptPlaceholder}></textarea>
					<div class="mt-2 flex flex-wrap gap-1.5">
						{#each atalhos as a (a)}
							<button
								type="button"
								onclick={() => usarAtalho(a)}
								class="min-h-9 rounded-full border border-line bg-base-200 px-3 text-[12px] transition-colors hover:border-primary"
								>{a}</button
							>
						{/each}
					</div>
				{:else}
					{@const ehVideo = fonte === 'video'}
					<!-- A área inteira é o seletor: tocar abre o do aparelho, e arrastar o arquivo
					     para cima dela também serve. O input fica escondido mas focável, então o
					     teclado chega aqui pelo Tab e abre o seletor com Espaço. -->
					<label
						class="grid cursor-pointer place-items-center gap-2 rounded-box border-[1.5px] border-dashed px-4 py-6 text-center transition-colors has-[:focus-visible]:border-primary has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/30
						       {arrastando ? 'border-primary bg-primary/6' : 'border-line hover:border-primary'}"
						ondragover={(e) => {
							e.preventDefault();
							arrastando = true;
						}}
						ondragleave={() => (arrastando = false)}
						ondrop={(e) => {
							arrastando = false;
							soltarArquivo(e);
						}}
					>
						<input
							type="file"
							class="sr-only"
							accept={ehVideo ? ACEITA_VIDEO : ACEITA_IMAGEM}
							onchange={(e) => {
								const campo = e.currentTarget;
								void escolherArquivo(campo.files?.[0]);
								// Esvaziar deixa escolher o MESMO arquivo de novo depois de um erro.
								campo.value = '';
							}}
						/>
						{#if previaDaFoto && !ehVideo}
							<img
								src={previaDaFoto}
								alt="A foto escolhida"
								class="max-h-40 rounded-field border border-line object-contain"
							/>
						{:else}
							<span
								class="grid size-[38px] place-items-center rounded-field bg-accent/12 text-accent"
							>
								<svg class="size-[19px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
									<path
										d={FONTES.find((f) => f.id === fonte)?.icon}
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
								</svg>
							</span>
						{/if}
						<span class="flex max-w-full items-center gap-2 text-[14px] font-bold">
							{#if lendoArquivo}
								<Loading variant="fila" size={12} label="Lendo o arquivo" />
								{ehVideo ? 'Lendo o áudio do vídeo…' : 'Preparando a foto…'}
							{:else if nomeDoArquivo}
								<span class="truncate">{nomeDoArquivo}</span>
							{:else}
								{ehVideo
									? 'Arraste um vídeo ou toque para escolher'
									: 'Arraste uma foto ou toque para escolher'}
							{/if}
						</span>
						<span
							class="max-w-[46ch] text-[12.5px] leading-normal text-pretty text-base-content/65"
						>
							{#if falaIa}
								Vídeo de {formatarDuracao(falaIa.duracao)}. Toque para trocar.
							{:else if fotoIa}
								Pronta para a IA ler. Toque para trocar.
							{:else if ehVideo}
								mp4 ou mov, ou só o áudio (mp3, m4a). A fala vira a base das frases, até {MAXIMO_DE_FALA_S /
									60} minutos por geração.
							{:else}
								Foto da página do livro, da lousa ou do caderno. A IA lê o texto da imagem.
							{/if}
						</span>
					</label>
					{#if erroArquivo}
						<p class="mt-2 text-[12.5px] font-semibold text-error" role="alert">{erroArquivo}</p>
					{/if}

					{#if ehVideo}
						<div class="mt-2.5 rounded-field border border-line bg-base-200 px-3.5 py-3">
							<div class="flex flex-wrap items-center gap-x-3 gap-y-2.5">
								<span
									class="min-w-[150px] flex-1 text-[12.5px] leading-normal text-base-content/65"
								>
									Trecho a usar. Em branco, o vídeo inteiro.
								</span>
								<span class="flex shrink-0 items-center gap-1.5">
									<input
										type="text"
										bind:value={inicioTrecho}
										placeholder="0:00"
										class="input h-10 w-[74px] px-2 text-center font-mono text-[13px]"
										aria-label="Início do trecho"
										aria-describedby="mf-trecho"
									/>
									<span class="text-[12.5px] text-base-content/65">até</span>
									<input
										type="text"
										bind:value={fimTrecho}
										placeholder={falaIa
											? formatarDuracao(Math.min(falaIa.duracao, MAXIMO_DE_FALA_S))
											: '2:30'}
										class="input h-10 w-[74px] px-2 text-center font-mono text-[13px]"
										aria-label="Fim do trecho"
										aria-describedby="mf-trecho"
									/>
								</span>
							</div>
							{#if falaIa}
								<p id="mf-trecho" class="mt-2 text-[12px] text-base-content/65" role="status">
									{#if problemaNoTrecho}
										<span class="font-semibold text-error">{problemaNoTrecho}</span>
									{:else if segundosDeFala !== null}
										{formatarDuracao(segundosDeFala)} de fala vão para a IA.
									{/if}
								</p>
							{/if}
						</div>
					{/if}

					<label for="mf-foco" class="mt-3 mb-1.5 block text-[12.5px] font-bold"
						>Foco do material <span class="font-normal text-base-content/65">· opcional</span
						></label
					>
					{#if ia?.idiomas}
						<p class="-mt-1 mb-1.5 text-[12px] text-base-content/65">{ia.idiomas}</p>
					{/if}
					<input
						id="mf-foco"
						bind:value={promptIa}
						maxlength="1000"
						class="input w-full text-[14px]"
						placeholder={ehVideo
							? 'Só as frases com verbos no passado'
							: 'Só o vocabulário da lousa'}
					/>

					<div class="mt-2.5 flex gap-2.5 rounded-field border border-line bg-base-200 px-3.5 py-3">
						<svg
							class="mt-px size-4 shrink-0 text-accent"
							viewBox="0 0 24 24"
							fill="none"
							aria-hidden="true"
						>
							<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" />
							<path
								d="M12 11v5.5M12 7.6v.1"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
							/>
						</svg>
						<p class="text-[12.5px] leading-normal text-pretty text-base-content/65">
							{ehVideo
								? 'O vídeo não sai do seu computador. Só a fala do trecho vai para a IA, que a lê uma vez para propor o material, e nada fica guardado. Use um vídeo seu ou de material didático, sem gravação de aluno.'
								: 'A foto vai para a IA, que a lê uma vez para propor o material, e nada fica guardado. O aluno nunca vê a foto.'}
						</p>
					</div>
				{/if}

				<div class="mt-3.5 flex flex-wrap items-center gap-x-3.5 gap-y-2.5">
					<span class="text-[12.5px] font-bold">Quantos gerar</span>
					<div
						class="flex gap-[3px] rounded-full border border-line bg-base-200 p-[3px]"
						role="group"
						aria-label="Quantas propostas"
					>
						{#each [5, 10, 20] as const as n (n)}
							<button
								type="button"
								onclick={() => (quantos = n)}
								aria-pressed={quantos === n}
								class="rounded-full px-3.5 py-1.5 font-mono text-[12.5px] transition-colors {quantos ===
								n
									? segmentoOn
									: segmentoOff}">{n}</button
							>
						{/each}
					</div>
					<span class="text-[12px] text-base-content/65"
						>você revisa um por um antes de qualquer coisa ser salva</span
					>
				</div>

				<button
					type="button"
					onclick={gerarComIa}
					disabled={!podeGerar}
					class="mt-3.5 btn h-12 w-full gap-2 btn-primary text-[14.5px]"
				>
					{#if gerandoIa}
						<Loading variant="fila" size={12} tone="current" label="Gerando propostas" />
						Gerando…
					{:else}
						<svg class="size-4 shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<path
								d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9z"
								stroke="currentColor"
								stroke-width="1.8"
								stroke-linejoin="round"
							/>
						</svg>
						Gerar {quantos} propostas · {custo.total} créditos
					{/if}
				</button>
				<!-- Botão travado SEMPRE diz por quê (paginas.md): um botão cinza sem
				     explicação faz o professor achar que a tela quebrou. -->
				<p class="mt-2 text-center text-[12px] text-base-content/65">
					{#if !ia?.configurada}
						A geração por IA ainda não está ligada neste servidor.
					{:else if !ia.pode}
						{ia.motivo === 'ia'
							? 'Gerar com IA é dos planos Pro e Super.'
							: ia.motivo === 'creditos'
								? 'Os créditos de IA deste ciclo acabaram.'
								: 'Seu plano não permite gerar agora.'}
						{#if ia.motivo}
							<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- rota resolvida mais a query do motivo; a regra não enxerga a concatenação. -->
							<a href={resolve('/(site)/planos') + '?motivo=' + ia.motivo} class="font-bold"
								>Ver os planos</a
							>
						{/if}
					{:else if !fonteLida}
						{fonte === 'imagem'
							? 'A IA ligada neste servidor não lê imagem.'
							: 'A IA ligada neste servidor não lê a fala de vídeo.'} Descreva o que quer no prompt.
					{:else if fonte !== 'prompt' && lendoArquivo}
						Lendo o arquivo…
					{:else if fonte !== 'prompt' && !fotoIa && !falaIa}
						{fonte === 'imagem'
							? 'Escolha a foto que a IA vai ler.'
							: 'Escolha o vídeo que a IA vai ouvir.'}
					{:else if fonte === 'video' && problemaNoTrecho}
						Ajuste o trecho do vídeo.
					{:else if saldoAgora < custo.total}
						Saldo de {saldoAgora} créditos: escolha menos propostas{fonte === 'video'
							? ' ou um trecho menor'
							: ''}.
					{:else if fonte === 'prompt'}
						Saldo: {saldoAgora} créditos. Cada proposta custa {ia.custoPorProposta}; a que não
						servir é devolvida.
					{:else}
						Saldo: {saldoAgora} créditos. São {custo.propostas} das propostas e {custo.leitura}
						{fonte === 'imagem'
							? 'da leitura da foto'
							: `da leitura de ${custo.minutos} min de fala`}. A proposta que não servir é
						devolvida.
					{/if}
				</p>
				{#if erroIa}
					<p class="mt-2 text-center text-[12.5px] font-semibold text-error" role="alert">
						{erroIa.texto}
						{#if erroIa.motivo}
							<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- rota resolvida mais a query do motivo; a regra não enxerga a concatenação. -->
							<a href={resolve('/(site)/planos') + '?motivo=' + erroIa.motivo} class="font-bold"
								>Ver os planos</a
							>
						{/if}
					</p>
				{/if}

				{#if propostas.length > 0}
					<div class="mt-4 overflow-hidden rounded-box border border-line">
						<div
							class="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-base-200 px-3.5 py-2.5"
						>
							<span class="text-[12.5px] font-bold"
								>{propostas.length} propostas · {nMarcadas} marcadas</span
							>
							<div class="min-w-1 flex-1"></div>
							<button
								type="button"
								onclick={marcarTodas}
								class="p-1 text-[12px] font-bold text-primary"
							>
								{nMarcadas === propostas.length ? 'Desmarcar todas' : 'Marcar todas'}
							</button>
						</div>
						{#each propostas as p (p.id)}
							<div
								class="flex items-stretch gap-1.5 border-b border-line pe-2.5 {p.on
									? ''
									: 'opacity-50'}"
							>
								<button
									type="button"
									onclick={() => (p.on = !p.on)}
									aria-pressed={p.on}
									class="flex min-h-12 min-w-0 flex-1 items-center gap-2.5 ps-3.5 pe-1.5 text-start transition-colors hover:bg-base-200"
								>
									<span
										class="grid size-[22px] shrink-0 place-items-center rounded-[7px] {p.on
											? 'bg-primary text-primary-content'
											: 'border-[1.5px] border-line'}"
									>
										{#if p.on}
											<svg class="size-[13px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
												<path
													d="M5 12.5l4.5 4.5L19 7"
													stroke="currentColor"
													stroke-width="3"
													stroke-linecap="round"
													stroke-linejoin="round"
												/>
											</svg>
										{/if}
									</span>
									<span class="min-w-0 flex-1">
										<span
											class="mb-0.5 block font-content text-[13.5px] font-semibold"
											dir={direcao}
											data-content-lang={tagConteudo}>{p.esq}</span
										>
										<span class="block text-[12.5px] text-base-content/65">{p.dir}</span>
									</span>
									{#if p.reused}
										<span
											class="shrink-0 rounded-full bg-accent/14 px-2.5 py-1 text-[11.5px] font-bold whitespace-nowrap text-accent"
											>você já tem</span
										>
									{/if}
								</button>
							</div>
						{/each}
						<p class="bg-base-200 px-3.5 py-2.5 text-[12px] leading-normal text-base-content/65">
							A IA propõe; quem decide é você. Nada entra na biblioteca antes de você marcar e
							confirmar — e o que você já tem é reaproveitado, não duplicado.
						</p>
					</div>
				{/if}
			</div>
		{/if}

		<!-- resultado do envio -->
		{#if resultado && !resultado.ok}
			<p
				class="mt-4 flex items-center gap-2 rounded-field border-s-[3px] border-error bg-base-200 px-3 py-2.5 text-[13px]"
				role="alert"
			>
				<svg class="size-4 shrink-0 text-error" viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" />
					<path
						d="M12 7.5v6M12 16.5h.01"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
					/>
				</svg>
				<span>
					{resultado.error}
					{#if resultado.motivo}
						<!-- Porta fechada por plano tem saída, e ela não é "tente de novo". -->
						<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- rota resolvida mais a query do motivo; a regra não enxerga a concatenação. -->
						<a href={resolve('/(site)/planos') + '?motivo=' + resultado.motivo} class="font-bold"
							>Ver os planos</a
						>
					{/if}
				</span>
			</p>
		{:else if resultado?.ok && 'ignored' in resultado}
			<!-- Quantas linhas ficaram de fora é a informação que faltava: colar uma
			     lista e ver o contador subir menos do que devia, sem saber por
			     quê, foi o que travou a etapa antes. -->
			<p
				class="mt-4 flex items-center gap-2 rounded-field border-s-[3px] border-success bg-base-200 px-3 py-2.5 text-[13px]"
				role="status"
			>
				<svg
					class="size-4 shrink-0 text-success"
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
				{resultado.added} adicionados{resultado.ignored
					? `, ${resultado.ignored} sem separador ${resultado.ignored === 1 ? 'ignorada' : 'ignoradas'}`
					: ''}{resultado.reused ? `, ${resultado.reused} você já tinha` : ''}.
				{#if resultado.traduzidas}
					{resultado.traduzidas === 1
						? 'Uma tradução veio do tradutor automático: confira na lista.'
						: `${resultado.traduzidas} traduções vieram do tradutor automático: confira na lista.`}
				{/if}
			</p>
			{#if resultado.aviso}
				<!-- As linhas que não couberam no estoque do plano: dizer QUANTAS, e o
				     caminho, em vez de deixar o contador subir menos sem explicação. -->
				<p
					class="mt-2 flex items-center gap-2 rounded-field border-s-[3px] border-warning bg-base-200 px-3 py-2.5 text-[13px]"
					role="status"
				>
					<span>
						{resultado.aviso}
						{#if resultado.motivo}
							<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- rota resolvida mais a query do motivo; a regra não enxerga a concatenação. -->
							<a href={resolve('/(site)/planos') + '?motivo=' + resultado.motivo} class="font-bold"
								>Ver os planos</a
							>
						{/if}
					</span>
				</p>
			{/if}
		{:else if resultado?.ok && resultado.reused === true}
			<!-- Reaproveitar em silêncio parecia falha: o contador não subia e o
			     professor reenviava a mesma frase. -->
			<p
				class="mt-4 flex items-center gap-2 rounded-field border-s-[3px] border-primary bg-base-200 px-3 py-2.5 text-[13px]"
				role="status"
			>
				<svg
					class="size-4 shrink-0 text-primary"
					viewBox="0 0 24 24"
					fill="none"
					aria-hidden="true"
				>
					<path
						d="M3 5.5h6a3 3 0 013 3v10a2.5 2.5 0 00-2.5-2.5H3zM21 5.5h-6a3 3 0 00-3 3v10a2.5 2.5 0 012.5-2.5H21z"
						stroke="currentColor"
						stroke-width="2"
						stroke-linejoin="round"
					/>
				</svg>
				Você já tinha este material — ele foi reaproveitado da sua biblioteca, não duplicado.
			</p>
		{/if}

		<!-- o que o aluno vai ver -->
		<div class="mt-7 border-t border-line pt-5">
			<h3 class="mb-2.5 text-[15px] font-bold">O que o aluno vai ver</h3>
			<div class="overflow-hidden rounded-box border border-line">
				<div
					class="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-base-200 px-3.5 py-2.5"
				>
					<span class="rounded-full bg-base-300 px-2.5 py-1 text-[12px] font-bold text-primary"
						>{previa.kind}</span
					>
					<span class="text-[12px] text-base-content/65">{previa.note}</span>
				</div>
				<div class="px-4 py-[15px]">
					<p class="mb-2.5 text-[13px] text-base-content/65">{previa.prompt}</p>
					{#if kind === 'pair'}
						<div class="flex flex-wrap gap-1.5" dir={direcao} data-content-lang={tagConteudo}>
							{#each previa.chips as c, i (i)}
								<span
									class="rounded-field border border-line bg-base-200 px-3 py-2 font-content text-[14px]"
									>{c}</span
								>
							{/each}
						</div>
					{:else if kind === 'dialogue'}
						<div class="grid gap-1.5" dir={direcao} data-content-lang={tagConteudo}>
							{#each previa.falas as f, i (i)}
								<span
									class="flex items-center gap-2.5 rounded-field border border-line bg-base-200 px-3 py-2.5"
								>
									<svg
										class="size-[15px] shrink-0 text-base-content/65"
										viewBox="0 0 24 24"
										fill="none"
										aria-hidden="true"
									>
										<path
											d="M4 8h16M4 12h16M4 16h16"
											stroke="currentColor"
											stroke-width="2"
											stroke-linecap="round"
										/>
									</svg>
									<span class="min-w-0 flex-1 font-content text-[13.5px]">{f}</span>
								</span>
							{/each}
						</div>
					{:else}
						<div class="grid gap-1.5">
							{#each previa.opts as o, i (i)}
								<span
									class="flex items-center gap-2.5 rounded-field border px-3 py-2.5 text-[14px] {kind ===
									'text'
										? 'font-content'
										: ''} {o.right ? 'border-success/40 bg-success/10' : 'border-line bg-base-200'}"
								>
									<span
										class="grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold {o.right
											? 'bg-success text-success-content'
											: 'bg-base-300 text-base-content/65'}">{String.fromCharCode(65 + i)}</span
									>
									{o.label}
								</span>
							{/each}
						</div>
						{#if previa.foot}
							<p class="mt-2.5 text-[12px] leading-normal text-base-content/65">{previa.foot}</p>
						{/if}
					{/if}
				</div>
			</div>
		</div>
	</div>

	<!-- rodapé -->
	<div
		class="flex shrink-0 flex-wrap items-center gap-2.5 border-t border-line bg-base-200 px-5 py-3.5 lg:px-6"
	>
		<span
			class="hidden min-w-[180px] flex-1 text-[12px] leading-normal text-base-content/65 lg:block"
			>{footNote}</span
		>
		{#if editing}
			<!-- Na biblioteca a bandeja FECHA; no wizard a coluna volta a "Adicionar". -->
			<button
				type="button"
				onclick={!wiz && onfechar ? onfechar : limpar}
				class="btn min-h-11 motion-tap btn-plain">Cancelar</button
			>
		{/if}
		<button
			type={modoEfetivo === 'ia' ? 'button' : 'submit'}
			onclick={modoEfetivo === 'ia' ? aceitarPropostas : undefined}
			disabled={!podeSalvar}
			class="btn h-[46px] flex-1 motion-tap gap-2.5 btn-primary text-[14.5px] lg:flex-none lg:px-5"
		>
			{#if salvando || aceitandoIa}
				<Loading variant="fila" size={12} tone="current" label="Salvando" />
				Salvando…
			{:else}
				{saveLabel}
			{/if}
		</button>
	</div>
</div>
