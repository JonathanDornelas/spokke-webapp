<script lang="ts">
	// O formulário do editor de questão — UMA abertura do modal. Pergunta na ordem
	// em que a questão se monta: o TIPO (o que o aluno faz), o FORMATO (o tipo
	// filtra os possíveis), o enunciado e o que o aluno lê ou ouve, e a resposta
	// certa na moldura âmbar (só o professor vê). Ao lado, a prévia de VERDADE:
	// `previaDaQuestao` monta a questão com o que está no formulário pelo mesmo
	// caminho do Player, e quem desenha são os componentes do Player.
	//
	// Os campos são legíveis (alternativas, a frase na ordem certa, os pares); quem
	// os transforma no payload do kernel é o servidor (`montarQuestao`), o MESMO
	// para a prévia e para salvar — a tela não oferece o que o servidor recusaria.
	import { onMount, tick, untrack } from 'svelte';
	import Loading from '$lib/components/Loading.svelte';
	import AmbientShapes from '$lib/components/AmbientShapes.svelte';
	import PreviaDaQuestao from '$lib/components/PreviaDaQuestao.svelte';
	import CelularDoAluno from '$lib/components/CelularDoAluno.svelte';
	import ProblemasDaQuestao from './ProblemasDaQuestao.svelte';
	import { rotuloDaMarca } from '$lib/atividades/qualidade';
	import { tokenize } from '$lib/kernel/language/tokenize';
	import type { InteractionKind } from '$lib/kernel/interactions/types';
	import {
		DESCRICAO_DO_TIPO,
		DICA_DO_FORMATO,
		FORMATOS_DO_TIPO,
		MAX_ALTERNATIVAS_DA_QUESTAO,
		MAX_PARES_DA_QUESTAO,
		ROTULO_DO_FORMATO,
		ROTULO_DO_TIPO,
		ROTULO_DO_MOSTRA,
		RIGOR_NO_EDITOR,
		TIPOS_DE_QUESTAO,
		camposIniciais,
		chaveDoContexto,
		comoECorrigida,
		enunciadoPadrao,
		formatoUsaContexto,
		fraseDaQuestao,
		type CamposDaQuestao,
		type ContextoNaQuestao,
		type Questao,
		type QuestaoGravada,
		type TipoDeQuestao
	} from '$lib/atividades/questao';
	import { instructionText } from '$lib/atividades/enunciados';
	import { RIGORES, type RigorDaPronuncia } from '$lib/kernel/language/pronuncia';
	import {
		dialogosDaAtividade,
		previaDaQuestao,
		questaoParaEditar,
		salvarQuestao,
		sugerirRespostas
	} from '../../atividades.remote';

	let {
		activityId,
		itemId,
		numero,
		total,
		proximoId,
		fora,
		idioma,
		capacidades,
		onfechar,
		onsalvo,
		onalternarFora
	}: {
		activityId: string;
		itemId: string | null;
		numero: number | null;
		total: number;
		proximoId: string | null;
		fora: boolean;
		idioma: { tag: string; dir: 'ltr' | 'rtl'; alvo: string; aluno: string };
		capacidades: { tts: boolean; asr: boolean; traducao?: boolean };
		onfechar: () => void;
		onsalvo: (itemId: string, irPara: string | null) => void;
		onalternarFora: (itemId: string, fora: boolean) => Promise<string | null>;
	} = $props();

	const nova = untrack(() => itemId === null);

	// ── o estado da questão ─────────────────────────────────────────────────
	// Um estado por campo de formato, e não um objeto de união: o formulário liga
	// cada campo direto (`bind:value`), e trocar de formato só remonta os campos.
	let tipo = $state<TipoDeQuestao | null>(null);
	let interacao = $state<InteractionKind | null>(null);
	let enunciado = $state('');
	let texto = $state('');
	let opcoes = $state<string[]>(['', '']);
	let certa = $state(0);
	let frase = $state('');
	let distratores = $state<string[]>([]);
	let aceitas = $state<string[]>(['']);
	let corrigeVoce = $state(false);
	let pares = $state<{ esquerda: string; direita: string }[]>([]);
	let falas = $state<string[]>(['', '']);
	let palavraCerta = $state('');
	/** Só na questão de Pronúncia: o rigor da correção. Nulo nas outras falas. */
	let rigor = $state<RigorDaPronuncia | null>(null);
	/**
	 * O trecho ou o diálogo da questão (`Prompt.contexto`). Atravessa a edição:
	 * salvar uma questão de diálogo não pode perder o diálogo. No formato que não o
	 * usa, ele sai ao salvar (`formatoUsaContexto`).
	 */
	let contexto = $state<ContextoNaQuestao | undefined>(undefined);
	const usaContexto = $derived(formatoUsaContexto(contexto, interacao));
	/** Na próxima fala, o texto do campo "o que o aluno lê" não é usado. */
	const proximaFala = $derived(
		usaContexto && contexto?.tipo === 'dialogo' && contexto.ate !== null
	);

	let gravada = $state<QuestaoGravada | undefined>(undefined);
	/**
	 * A resposta é na língua do ALUNO ("traduza para o português") só quando o
	 * formato de agora é o "digitar" gravado com essa língua — a mesma regra do
	 * servidor (`gradingDe`). Trocar de formato e voltar refaz a pergunta.
	 */
	const respondeNaLinguaDoAluno = $derived(
		interacao === 'type' && gravada?.interacao === 'type' && gravada.answerLang === 'source'
	);
	let carregando = $state(!nova);
	let erroAoCarregar = $state<string | null>(null);
	let original = $state('');
	/** A frase gravada: o áudio que falta é "na fila" se ela não mudou, "ao salvar" se mudou. */
	let textoGravado = $state<string | null>(null);
	const avisoDoAudio = $derived.by(() => {
		// O diálogo avisa do áudio das falas nele mesmo, no celular ao lado.
		if (tipo !== 'escuta' || usaContexto || !previa?.ok || !previa.audioPendente) return null;
		const mudou = gravada?.tipo !== 'escuta' || texto.trim() !== (textoGravado ?? '').trim();
		return mudou
			? 'O áudio desta frase é gerado quando você salvar.'
			: 'O áudio desta frase ainda está sendo gerado.';
	});

	const campos = $derived.by((): CamposDaQuestao | null => {
		switch (interacao) {
			case 'choice':
				// Na escuta a certa é a frase do áudio, sempre a de agora (no diálogo, não:
				// o áudio sai das falas).
				return {
					interacao,
					opcoes:
						tipo === 'escuta' && !usaContexto
							? opcoes.map((o, i) => (i === certa ? texto : o))
							: opcoes,
					certa
				};
			case 'assemble':
				return { interacao, frase, distratores };
			case 'type':
				// Na escuta, a principal é a frase do áudio de agora: a da abertura ficava
				// escondida na lista e, trocada a frase, a antiga continuava valendo.
				return {
					interacao,
					aceitas: tipo === 'escuta' ? [texto, ...aceitas.slice(1)] : aceitas,
					corrigeVoce
				};
			case 'cloze':
				return { interacao, frase, aceitas };
			case 'match':
				return { interacao, pares };
			case 'order':
				return { interacao, falas };
			case 'select':
				return { interacao, frase, certa: palavraCerta };
			case 'speak':
				return { interacao, frase, ...(rigor ? { rigor } : {}) };
			default:
				return null;
		}
	});
	const questao = $derived<Questao | null>(
		tipo && campos ? { tipo, enunciado, texto, campos, ...(contexto ? { contexto } : {}) } : null
	);
	const alterada = $derived(nova ? tipo !== null : JSON.stringify(questao) !== original);

	function aplicarCampos(c: CamposDaQuestao) {
		interacao = c.interacao;
		switch (c.interacao) {
			case 'choice':
				opcoes = c.opcoes.length >= 2 ? [...c.opcoes] : [...c.opcoes, ''];
				certa = c.certa;
				break;
			case 'assemble':
				frase = c.frase;
				distratores = [...c.distratores];
				break;
			case 'type':
				aceitas = c.aceitas.length > 0 ? [...c.aceitas] : [''];
				corrigeVoce = c.corrigeVoce;
				break;
			case 'cloze':
				frase = c.frase;
				aceitas = c.aceitas.length > 0 ? [...c.aceitas] : [''];
				break;
			case 'match':
				pares = c.pares.map((p) => ({ ...p }));
				break;
			case 'order':
				falas = c.falas.length >= 2 ? [...c.falas] : [...c.falas, ''];
				break;
			case 'select':
				frase = c.frase;
				palavraCerta = c.certa;
				break;
			case 'speak':
				frase = c.frase;
				rigor = c.rigor ?? null;
				break;
		}
	}

	onMount(async () => {
		if (nova || !itemId) return;
		try {
			// A questão pode ter mudado desde a última abertura (salvou, reabriu):
			// pede de novo em vez de confiar no que a página já tinha.
			const consulta = questaoParaEditar({ activityId, itemId });
			if (consulta.current) await consulta.refresh();
			const r = consulta.current ?? (await consulta);
			tipo = r.questao.tipo;
			enunciado = r.questao.enunciado;
			texto = r.questao.texto;
			textoGravado = r.questao.texto;
			contexto = r.questao.contexto;
			aplicarCampos(r.questao.campos);
			gravada = r.gravada;
			original = JSON.stringify(questao);
		} catch {
			erroAoCarregar = 'Não deu para abrir esta questão agora.';
		} finally {
			carregando = false;
		}
	});

	// ── tipo e formato ──────────────────────────────────────────────────────
	/**
	 * As DUAS frases que atravessam a troca: a do idioma alvo e a tradução. Cada
	 * formato guarda cada uma num campo diferente (na escuta a frase alvo é o áudio;
	 * na lacuna e no montar a tradução é o apoio; no "traduza para o português" a
	 * tradução é a resposta), e levar só "a frase" fazia a tradução em português
	 * virar o áudio de uma escuta, ou a resposta em português virar a frase de
	 * uma lacuna em inglês.
	 */
	function frasesAtuais(): { alvo: string; traducao: string } {
		if (!campos) return { alvo: '', traducao: '' };
		if (tipo === 'escuta') return { alvo: texto, traducao: '' };
		switch (campos.interacao) {
			case 'type':
				return respondeNaLinguaDoAluno
					? { alvo: texto, traducao: aceitas[0] ?? '' }
					: { alvo: aceitas[0] ?? '', traducao: texto };
			case 'choice':
				// "Escolha a tradução": o aluno lê o termo e escolhe o sentido.
				return { alvo: texto, traducao: opcoes[certa] ?? '' };
			case 'cloze':
				return { alvo: fraseDaQuestao(campos), traducao: texto };
			case 'assemble':
			case 'speak':
				return { alvo: frase, traducao: texto };
			case 'select':
				return { alvo: frase, traducao: '' };
			default:
				return { alvo: '', traducao: '' };
		}
	}

	/** Os campos de um formato com as duas frases cada uma no lugar dela. */
	function comAsFrases(
		novoTipo: TipoDeQuestao,
		formato: InteractionKind,
		f: { alvo: string; traducao: string }
	): { campos: CamposDaQuestao; texto: string } {
		if (novoTipo === 'escuta') return { campos: camposIniciais(formato, f.alvo), texto: f.alvo };
		switch (formato) {
			case 'type':
				// Volta ao "traduza para o português" gravado: a resposta é a tradução.
				return gravada?.interacao === 'type' && gravada.answerLang === 'source'
					? { campos: camposIniciais('type', f.traducao), texto: f.alvo }
					: { campos: camposIniciais('type', f.alvo), texto: f.traducao };
			case 'choice':
				return {
					campos: { interacao: 'choice', opcoes: [f.traducao, ''], certa: 0 },
					texto: f.alvo
				};
			case 'cloze':
			case 'assemble':
			case 'speak':
				return { campos: camposIniciais(formato, f.alvo), texto: f.traducao };
			case 'select':
				return { campos: camposIniciais('select', f.alvo), texto: '' };
			default:
				return { campos: camposIniciais(formato), texto: '' };
		}
	}

	/** O enunciado acompanha o padrão, a não ser que o professor tenha escrito o dele. */
	function trocarEnunciado(antes: string, depois: string) {
		if (!enunciado.trim() || enunciado === antes) enunciado = depois;
	}

	/** O enunciado padrão: o da questão com contexto, quando o formato o usa; senão o do tipo. */
	function padraoDe(t: TipoDeQuestao | null, f: InteractionKind | null): string {
		if (!t || !f) return '';
		if (contexto && formatoUsaContexto(contexto, f))
			return instructionText(chaveDoContexto(contexto, f));
		return enunciadoPadrao(t, f, gravada);
	}

	/** Na próxima fala, a resposta é a fala da vez: o campo da resposta a traz. */
	function preencherDaFala() {
		if (contexto?.tipo !== 'dialogo' || contexto.ate === null || !usaContexto) return;
		const fala = contexto.falas[contexto.ate]?.texto ?? '';
		if (interacao === 'choice') opcoes = opcoes.map((o, i) => (i === certa ? fala : o));
		else if (interacao === 'assemble' || interacao === 'speak') frase = fala;
	}

	function trocarPara(novoTipo: TipoDeQuestao, formato: InteractionKind) {
		const frases = frasesAtuais();
		const padraoAntes = padraoDe(tipo, interacao);
		const novo = comAsFrases(novoTipo, formato, frases);
		tipo = novoTipo;
		texto = novo.texto;
		aplicarCampos(novo.campos);
		preencherDaFala();
		trocarEnunciado(padraoAntes, padraoDe(novoTipo, formato));
	}

	// ── o diálogo ───────────────────────────────────────────────────────────
	/**
	 * No diálogo, ESCUTA e LEITURA são o mesmo formato com as falas ouvidas ou
	 * lidas — o nome que o roteiro e o celular dão (`habilidadePrincipal`): só
	 * texto é leitura; com áudio, escuta. Trocar um troca o outro, e nenhum campo
	 * da resposta é refeito.
	 */
	const trocaSoOMostra = (t: TipoDeQuestao | null) =>
		contexto?.tipo === 'dialogo' &&
		usaContexto &&
		(t === 'escuta' || t === 'leitura') &&
		(interacao === 'choice' || interacao === 'assemble');

	/** Como o aluno recebe o diálogo: texto e áudio, só áudio, só texto. */
	function mudarMostra(mostra: 'ambos' | 'audio' | 'texto') {
		if (contexto?.tipo !== 'dialogo') return;
		contexto = { ...contexto, mostra };
		if (trocaSoOMostra(tipo)) tipo = mostra === 'texto' ? 'leitura' : 'escuta';
	}
	/** Qual fala é a vez do aluno (nunca a primeira: sem nada antes não há conversa). */
	function escolherVez(i: number) {
		if (contexto?.tipo !== 'dialogo' || i < 1) return;
		contexto = { ...contexto, ate: i };
		preencherDaFala();
	}
	/** A escolha pede uma pergunta sobre o diálogo inteiro, ou a próxima fala. */
	function pedir(oQue: 'pergunta' | 'proxima') {
		if (contexto?.tipo !== 'dialogo') return;
		const antes = padraoDe(tipo, interacao);
		contexto = { ...contexto, ate: oQue === 'pergunta' ? null : contexto.falas.length - 1 };
		preencherDaFala();
		trocarEnunciado(antes, padraoDe(tipo, interacao));
	}

	/**
	 * Questão NOVA sobre um diálogo da atividade: o editor oferece os diálogos dela
	 * e, escolhido um, a questão nasce com ele — na escolha, uma pergunta; no
	 * montar e no dizer, a próxima fala (a última). Como o aluno recebe sai do
	 * nível da atividade, como na geração; o professor troca no painel.
	 */
	const dialogos = $derived(nova ? dialogosDaAtividade({ activityId }) : null);
	function usarDialogo(id: string) {
		const lista = dialogos?.current;
		const escolhido = lista?.dialogos.find((d) => d.id === id);
		if (!lista || !escolhido || !interacao) return;
		const antes = padraoDe(tipo, interacao);
		// Quem escolheu Leitura quer o diálogo LIDO; nos outros tipos vale o padrão
		// do nível, como na geração (na escuta, com áudio).
		const padrao = lista.mostraPadrao;
		const mostra =
			tipo === 'leitura' && interacao !== 'speak'
				? 'texto'
				: tipo === 'escuta' && padrao === 'texto'
					? 'ambos'
					: padrao;
		contexto = {
			tipo: 'dialogo',
			falas: escolhido.falas,
			ate: interacao === 'choice' ? null : escolhido.falas.length - 1,
			mostra
		};
		preencherDaFala();
		trocarEnunciado(antes, padraoDe(tipo, interacao));
	}
	function largarDialogo() {
		const antes = padraoDe(tipo, interacao);
		contexto = undefined;
		trocarEnunciado(antes, padraoDe(tipo, interacao));
	}

	function escolherTipo(novo: TipoDeQuestao) {
		if (novo === tipo) return;
		if (contexto?.tipo === 'dialogo' && trocaSoOMostra(tipo) && trocaSoOMostra(novo)) {
			tipo = novo;
			const mostra =
				novo === 'leitura' ? 'texto' : contexto.mostra === 'texto' ? 'ambos' : contexto.mostra;
			contexto = { ...contexto, mostra };
			return;
		}
		const formato =
			interacao && FORMATOS_DO_TIPO[novo].includes(interacao)
				? interacao
				: FORMATOS_DO_TIPO[novo][0];
		trocarPara(novo, formato);
	}

	function escolherFormato(novo: InteractionKind) {
		if (!tipo || novo === interacao) return;
		trocarPara(tipo, novo);
	}

	const padrao = $derived(padraoDe(tipo, interacao));
	// No diálogo, escuta ⇄ leitura é só como o aluno recebe as falas: nenhum campo
	// é refeito, e o aviso de que "trocar refaz os campos" mentiria.
	const tipoMudou = $derived(
		!nova &&
			!!gravada &&
			(interacao !== gravada.interacao ||
				(tipo !== gravada.tipo && !(trocaSoOMostra(tipo) && trocaSoOMostra(gravada.tipo))))
	);

	/** O tipo que o servidor não entrega hoje fica desligado, a não ser que já seja o da questão. */
	function motivoDoTipo(t: TipoDeQuestao): string | null {
		if (gravada?.tipo === t) return null;
		if (t === 'escuta' && !capacidades.tts) return 'Sem voz para este idioma agora.';
		if (t === 'fala' && !capacidades.asr) return 'A transcrição de fala está desligada.';
		return null;
	}

	const ICONE_DO_TIPO: Record<TipoDeQuestao, string> = {
		escuta:
			'M4 12.5V11a8 8 0 1116 0v1.5M2.5 14.5a2 2 0 012-2H7v7H4.5a2 2 0 01-2-2zM21.5 14.5a2 2 0 00-2-2H17v7h2.5a2 2 0 002-2z',
		fala: 'M12 2.5a3 3 0 00-3 3v5a3 3 0 006 0v-5a3 3 0 00-3-3zM5.5 11.5a6.5 6.5 0 0013 0M12 18v3.5',
		leitura:
			'M3 5.5h6a3 3 0 013 3v10a2.5 2.5 0 00-2.5-2.5H3zM21 5.5h-6a3 3 0 00-3 3v10a2.5 2.5 0 012.5-2.5H21z',
		escrita: 'M4 20h4l11-11a2.83 2.83 0 10-4-4L4 16z'
	};

	// ── rótulos que dependem do idioma ──────────────────────────────────────
	/** "Inglês (EUA)" no meio da frase: só a primeira letra baixa. */
	const noMeio = (rotulo: string) => rotulo.charAt(0).toLocaleLowerCase('pt-BR') + rotulo.slice(1);
	const emAlvo = $derived(`em ${noMeio(idioma.alvo)}`);
	const emAluno = $derived(`em ${noMeio(idioma.aluno)}`);

	const rotuloDoTexto = $derived.by(() => {
		if (usaContexto && contexto && (contexto.tipo === 'texto' || contexto.ate === null))
			return {
				rotulo: 'A pergunta',
				nota:
					contexto.tipo === 'texto' ? `sobre o texto · ${emAlvo}` : `sobre o diálogo · ${emAlvo}`
			};
		if (tipo === 'escuta')
			return { rotulo: 'Frase que o aluno ouve', nota: `${emAlvo} · o áudio sai dela` };
		if (tipo === 'fala')
			return { rotulo: 'O que o aluno lê', nota: 'opcional · por exemplo, a tradução' };
		if (interacao === 'type')
			return {
				rotulo: 'O que o aluno lê',
				nota: respondeNaLinguaDoAluno ? `a frase ${emAlvo}` : 'a frase ou a pergunta'
			};
		if (interacao === 'assemble')
			return { rotulo: 'Frase que o aluno traduz', nota: `${emAluno} · opcional` };
		if (interacao === 'cloze')
			return { rotulo: 'Tradução de apoio', nota: `opcional · ${emAluno}` };
		if (interacao === 'select')
			return {
				rotulo: 'Pista para o aluno',
				nota: 'qual palavra procurar, por exemplo a tradução dela'
			};
		if (interacao === 'choice')
			return { rotulo: 'O que o aluno lê', nota: 'a frase, o termo ou a pergunta' };
		return { rotulo: 'Texto de apoio', nota: 'opcional' };
	});
	const textoNoAlvo = $derived(
		tipo === 'escuta' || (interacao === 'type' && respondeNaLinguaDoAluno)
	);

	// ── listas ──────────────────────────────────────────────────────────────
	const pecas = $derived(
		interacao === 'assemble' || interacao === 'select'
			? tokenize(tipo === 'escuta' && interacao === 'assemble' ? texto : frase, { tag: idioma.tag })
			: []
	);
	let campoFrase = $state<HTMLInputElement | null>(null);
	/** Lacuna: a palavra selecionada na frase vira o trecho que falta. */
	function lacunaNaSelecao() {
		const el = campoFrase;
		if (!el || el.selectionStart === null || el.selectionEnd === null) return;
		const escolhido = frase.slice(el.selectionStart, el.selectionEnd).trim();
		if (escolhido) aceitas = [escolhido, ...aceitas.slice(1)];
	}
	function mover<T>(lista: T[], i: number, delta: number): T[] {
		const j = i + delta;
		if (j < 0 || j >= lista.length) return lista;
		const copia = [...lista];
		[copia[i], copia[j]] = [copia[j] as T, copia[i] as T];
		return copia;
	}
	function removerOpcao(i: number) {
		opcoes = opcoes.filter((_, j) => j !== i);
		if (certa === i) certa = 0;
		else if (certa > i) certa -= 1;
		if (opcoes.length < 2) opcoes = [...opcoes, ''];
	}

	// ── a prévia ── pedida depois de uma pausa na digitação; a anterior fica na
	// tela enquanto a nova não chega, senão o celular piscava a cada letra.
	let pedidoDaPrevia = $state.raw<Questao | null>(null);
	$effect(() => {
		const q = questao ? $state.snapshot(questao) : null;
		const t = setTimeout(() => (pedidoDaPrevia = q), 380);
		return () => clearTimeout(t);
	});
	const consulta = $derived(
		pedidoDaPrevia
			? previaDaQuestao({ activityId, itemId: itemId ?? undefined, questao: pedidoDaPrevia })
			: null
	);
	type Previa = Awaited<ReturnType<typeof previaDaQuestao>>;
	let previa = $state.raw<Previa | null>(null);
	$effect(() => {
		if (consulta?.ready) previa = consulta.current ?? null;
	});

	// ── a conferência ── o que as regras do kernel dizem do que está no
	// formulário AGORA (vem junto da prévia).
	const problemas = $derived(previa?.ok ? previa.problemas : []);
	const marcaDaConferencia = $derived(rotuloDaMarca(problemas));
	let blocoDaConferencia = $state<HTMLElement>();
	/**
	 * Leva até os avisos (no celular eles ficam na aba de editar, não na da prévia).
	 * Rola SÓ a coluna do formulário: `scrollIntoView` rola todo ancestral, inclusive
	 * a moldura do modal, que é `overflow-hidden` — o cabeçalho subia para fora da
	 * vista e sobrava um vão no pé do modal.
	 */
	async function verConferencia() {
		aba = 'editar';
		await tick();
		const bloco = blocoDaConferencia;
		const coluna = bloco?.closest<HTMLElement>('.overflow-y-auto');
		if (!bloco || !coluna) return;
		const distancia = bloco.getBoundingClientRect().top - coluna.getBoundingClientRect().top;
		const reduzido = matchMedia('(prefers-reduced-motion: reduce)').matches;
		coluna.scrollTo({
			top: coluna.scrollTop + distancia - (coluna.clientHeight - bloco.offsetHeight) / 2,
			behavior: reduzido ? 'auto' : 'smooth'
		});
	}
	// "Sugerir outras traduções": o tradutor propõe as outras formas certas da
	// resposta, pelo mesmo funil da geração, e elas entram em "Também aceitas" —
	// cada uma com o X de remover. É um pedido do professor, nunca automático: no
	// editor, o que ele escreveu, ele decide.
	let sugerindo = $state(false);
	let notaDaSugestao = $state<string | null>(null);
	const SEM_RESPOSTA_DO_TRADUTOR =
		'O tradutor não respondeu agora. Escreva as outras formas que você aceita.';
	async function sugerirOutras() {
		if (!questao || sugerindo) return;
		sugerindo = true;
		notaDaSugestao = null;
		try {
			const r = await sugerirRespostas({
				activityId,
				itemId: itemId ?? undefined,
				questao: $state.snapshot(questao)
			});
			if (!r.ok) {
				notaDaSugestao =
					r.motivo === 'limite'
						? 'Muitos pedidos seguidos. Tente de novo em alguns minutos.'
						: SEM_RESPOSTA_DO_TRADUTOR;
				return;
			}
			const ja = new Set(aceitas.map((a) => a.trim()));
			const novas = r.respostas.map((t) => t.trim()).filter((t) => t && !ja.has(t));
			if (novas.length > 0) aceitas = [...aceitas, ...novas];
			else {
				notaDaSugestao =
					'O tradutor não achou outra forma segura para esta frase. Escreva as que você aceita.';
			}
		} catch {
			notaDaSugestao = SEM_RESPOSTA_DO_TRADUTOR;
		} finally {
			sugerindo = false;
		}
	}

	// ── salvar e fechar ─────────────────────────────────────────────────────
	let salvando = $state<'so' | 'proxima' | null>(null);
	let erro = $state<string | null>(null);
	let confirmarSaida = $state(false);
	let aba = $state<'editar' | 'previa'>('editar');

	async function salvar(irPara: string | null) {
		if (!questao) return;
		salvando = irPara ? 'proxima' : 'so';
		erro = null;
		try {
			const r = await salvarQuestao({
				activityId,
				itemId: itemId ?? undefined,
				questao: $state.snapshot(questao)
			});
			if (!r.ok) {
				erro = r.error;
				return;
			}
			original = JSON.stringify(questao);
			onsalvo(r.itemId, irPara);
		} catch {
			erro = 'Não deu para salvar agora. Tente de novo.';
		} finally {
			salvando = null;
		}
	}

	let trocandoFora = $state(false);
	async function alternarFora() {
		if (!itemId) return;
		trocandoFora = true;
		erro = null;
		try {
			erro = await onalternarFora(itemId, !fora);
		} finally {
			trocandoFora = false;
		}
	}

	/** Chamado pela casca (X, Esc, véu): mudança não salva pergunta antes. */
	export function podeFechar(): boolean {
		if (!alterada || confirmarSaida) return true;
		confirmarSaida = true;
		return false;
	}
</script>

{#snippet icone(d: string, classe = 'size-4')}
	<svg class="{classe} flex-none" viewBox="0 0 24 24" fill="none" aria-hidden="true">
		<path
			{d}
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
		/>
	</svg>
{/snippet}

{#snippet botaoRemover(rotulo: string, acao: () => void)}
	<button
		type="button"
		onclick={acao}
		aria-label={rotulo}
		class="grid size-[38px] shrink-0 place-items-center rounded-field border border-line text-base-content/65 transition-colors hover:border-error hover:text-error"
	>
		{@render icone('M6 6l12 12M18 6L6 18', 'size-[14px]')}
	</button>
{/snippet}

{#snippet adicionar(rotulo: string, acao: () => void)}
	<button
		type="button"
		onclick={acao}
		class="inline-flex items-center gap-1.5 py-1 text-[12.5px] font-semibold text-primary"
	>
		{@render icone('M12 5v14M5 12h14', 'size-[14px]')}
		{rotulo}
	</button>
{/snippet}

{#snippet tambemAceitas()}
	<div>
		<p class="mb-1.5 text-[12.5px] font-bold">
			Também aceitas <span class="font-medium text-base-content/65">opcional</span>
		</p>
		{#if aceitas.length > 1}
			<ul class="mb-1.5 grid list-none gap-1.5 p-0">
				{#each aceitas.slice(1), j}
					<li class="flex items-center gap-1.5">
						<input
							bind:value={aceitas[j + 1]}
							aria-label="Outra resposta aceita {j + 1}"
							class="input min-w-0 flex-1 font-content text-[14px]"
							dir={respondeNaLinguaDoAluno && interacao === 'type' ? 'auto' : idioma.dir}
						/>
						{@render botaoRemover(`Remover a resposta ${j + 1}`, () => {
							aceitas = aceitas.filter((_, k) => k !== j + 1);
						})}
					</li>
				{/each}
			</ul>
		{/if}
		{@render adicionar('Aceitar outra resposta', () => (aceitas = [...aceitas, '']))}
	</div>
{/snippet}

<!-- cabeçalho -->
<header class="flex flex-none items-center gap-3 border-b border-line px-4 py-3 lg:px-7 lg:py-4">
	<div class="min-w-0 flex-1">
		<h2
			id="editor-titulo"
			class="font-display text-[20px] leading-tight font-semibold tracking-[-0.02em] lg:text-[22px]"
		>
			{nova ? 'Nova questão' : 'Editar questão'}
		</h2>
		<p class="truncate text-[12.5px] text-base-content/65">
			{#if nova}
				Criada do zero · entra na atividade depois das outras
			{:else if fora}
				Fora da atividade · não vai para o aluno
			{:else if numero}
				Questão {numero} de {total}
			{/if}
		</p>
	</div>
	<!-- No celular, formulário e prévia não cabem juntos: duas abas. -->
	<div
		class="flex rounded-full bg-base-200 p-0.5 lg:hidden"
		role="group"
		aria-label="O que mostrar"
	>
		{#each [['editar', 'Editar'], ['previa', 'Prévia']] as [id, rotulo] (id)}
			<button
				type="button"
				onclick={() => (aba = id === 'editar' ? 'editar' : 'previa')}
				aria-pressed={aba === id}
				class="rounded-full px-3.5 py-2 text-[13px] font-semibold {aba === id
					? 'bg-primary text-primary-content'
					: 'text-base-content/65'}">{rotulo}</button
			>
		{/each}
	</div>
	<button
		type="button"
		onclick={onfechar}
		aria-label="Fechar o editor"
		class="grid size-11 shrink-0 place-items-center rounded-field text-base-content/65 transition-colors hover:bg-base-200 hover:text-base-content lg:size-[38px]"
	>
		{@render icone('M6 6l12 12M18 6L6 18', 'size-[17px]')}
	</button>
</header>

<!-- corpo -->
<div class="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_404px]">
	<div
		class="min-h-0 overflow-y-auto overscroll-contain px-4 pt-5 pb-7 lg:block lg:px-7 lg:pt-6 {aba ===
		'editar'
			? 'block'
			: 'hidden'}"
	>
		{#if carregando}
			<div class="grid gap-3" role="status" aria-label="Abrindo a questão">
				<div class="h-[86px] skeleton"></div>
				<div class="h-11 w-2/3 skeleton"></div>
				<div class="h-24 skeleton"></div>
			</div>
		{:else if erroAoCarregar}
			<p
				class="rounded-box border border-s-[3px] border-line border-s-error bg-base-200 px-4 py-3 text-[13.5px]"
			>
				{erroAoCarregar}
			</p>
		{:else}
			<!-- 1. o tipo de questão -->
			<div role="group" aria-labelledby="editor-tipo">
				<p class="mb-2 flex items-baseline gap-2">
					<span id="editor-tipo" class="text-[13px] font-bold">Tipo de questão</span>
					<span class="text-[12px] text-base-content/65">
						{nova ? 'comece por aqui' : 'define os formatos possíveis'}
					</span>
				</p>
				<div class="grid grid-cols-2 gap-2 lg:grid-cols-4">
					{#each TIPOS_DE_QUESTAO as t (t)}
						{@const motivo = motivoDoTipo(t)}
						{@const escolhido = tipo === t}
						<button
							type="button"
							onclick={() => escolherTipo(t)}
							disabled={!!motivo}
							title={motivo ?? undefined}
							aria-pressed={escolhido}
							class="relative flex flex-col items-start gap-1 rounded-box px-3 py-3 text-start transition-[border-color,translate] duration-150 enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50
							       {escolhido
								? 'border-[1.5px] border-primary bg-primary/8'
								: 'border border-line bg-base-100 enabled:hover:border-primary'}"
						>
							<span
								class="mb-1 grid size-8 place-items-center rounded-field {escolhido
									? 'bg-primary text-primary-content'
									: 'bg-base-200 text-base-content/65'}"
							>
								{@render icone(ICONE_DO_TIPO[t])}
							</span>
							<span class="text-[14px] font-bold {escolhido ? 'text-primary' : ''}"
								>{ROTULO_DO_TIPO[t]}</span
							>
							<span class="text-[12px] leading-snug text-base-content/65"
								>{motivo ?? DESCRICAO_DO_TIPO[t]}</span
							>
							{#if escolhido}
								<span
									class="absolute end-2.5 top-2.5 grid size-[18px] place-items-center rounded-full bg-primary text-primary-content"
								>
									{@render icone('M4 12.5l5 5L20 6.5', 'size-[11px]')}
								</span>
							{/if}
						</button>
					{/each}
				</div>
				{#if tipoMudou}
					<p role="status" class="mt-2 text-[12.5px] text-base-content/65">
						Trocar o tipo ou o formato refaz os campos de resposta. A frase alvo fica.
					</p>
				{/if}
			</div>

			{#if !tipo || !interacao}
				<div
					class="mt-6 flex items-center gap-3 rounded-box border-[1.5px] border-dashed border-line px-4 py-5 text-base-content/65"
				>
					{@render icone('M12 19V5M6 11l6-6 6 6', 'size-5')}
					<p class="text-[13.5px] leading-snug">
						Escolha o tipo de questão para abrir o formato, os campos e a resposta certa.
					</p>
				</div>
			{:else}
				<!-- 2. o formato -->
				<div class="mt-6" role="group" aria-labelledby="editor-formato">
					<p class="mb-2 flex items-baseline gap-2">
						<span id="editor-formato" class="text-[13px] font-bold">Formato</span>
						<span class="text-[12px] text-base-content/65">define os campos abaixo</span>
					</p>
					<div class="flex flex-wrap gap-1.5">
						{#each FORMATOS_DO_TIPO[tipo] as f (f)}
							<button
								type="button"
								onclick={() => escolherFormato(f)}
								aria-pressed={interacao === f}
								class="rounded-full px-3.5 py-2 text-[13px] transition-[border-color,translate] duration-150 hover:-translate-y-0.5
								       {interacao === f
									? 'border-[1.5px] border-primary bg-base-300 font-bold text-primary'
									: 'border border-line bg-base-200 font-semibold text-base-content/65'}"
							>
								{ROTULO_DO_FORMATO[f]}
							</button>
						{/each}
					</div>
					<p class="mt-1.5 text-[12.5px] text-base-content/65">{DICA_DO_FORMATO[interacao]}</p>
				</div>

				<!-- 2b. o diálogo (ou o trecho) da questão. Na questão nova, um diálogo da
				     atividade pode entrar: na escolha, para uma pergunta; no montar e no
				     dizer, para a próxima fala. -->
				{#if nova && !contexto && (interacao === 'choice' || interacao === 'assemble' || interacao === 'speak') && (dialogos?.current?.dialogos.length ?? 0) > 0}
					<label class="mt-6 block">
						<span class="mb-1.5 flex items-baseline gap-2 text-[12.5px] font-bold">
							Usar um diálogo desta atividade
							<span class="text-[11.5px] font-medium text-base-content/65">opcional</span>
						</span>
						<select
							class="select w-full text-[14px]"
							onchange={(e) => {
								if (e.currentTarget.value) usarDialogo(e.currentTarget.value);
							}}
						>
							<option value="">Sem diálogo</option>
							{#each dialogos?.current?.dialogos ?? [] as d (d.id)}
								<option value={d.id}>{d.falas[0]?.falante}: {d.falas[0]?.texto}</option>
							{/each}
						</select>
					</label>
				{/if}

				{#if contexto?.tipo === 'dialogo'}
					<section
						class="mt-6 rounded-box border border-line bg-base-200 p-4"
						aria-labelledby="editor-dialogo"
					>
						<div class="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
							<span id="editor-dialogo" class="text-[13px] font-bold">O diálogo</span>
							<span class="text-[12px] text-base-content/65">
								{#if !usaContexto}
									este formato não usa o diálogo: ele sai ao salvar
								{:else if contexto.ate === null}
									o aluno responde sobre ele inteiro
								{:else}
									a fala marcada é a vez do aluno
								{/if}
							</span>
							{#if nova}
								<button
									type="button"
									onclick={largarDialogo}
									class="ms-auto text-[12px] font-semibold text-primary underline-offset-2 hover:underline"
									>Não usar diálogo</button
								>
							{/if}
						</div>
						{#if usaContexto}
							<div
								role="group"
								aria-label="Como o aluno recebe o diálogo"
								class="mb-3 flex flex-wrap items-center gap-1.5"
							>
								<span class="me-1 text-[12px] font-semibold text-base-content/65"
									>O aluno recebe</span
								>
								{#each ['ambos', 'audio', 'texto'] as const as m (m)}
									{@const semVoz = m !== 'texto' && !capacidades.tts}
									<button
										type="button"
										onclick={() => mudarMostra(m)}
										disabled={semVoz}
										title={semVoz ? 'Sem voz para este idioma agora.' : undefined}
										aria-pressed={contexto.mostra === m}
										class="rounded-full px-3 py-1.5 text-[12.5px] transition-colors disabled:cursor-not-allowed disabled:opacity-50
										       {contexto.mostra === m
											? 'border-[1.5px] border-primary bg-base-300 font-bold text-primary'
											: 'border border-line bg-base-100 font-semibold text-base-content/65'}"
									>
										{ROTULO_DO_MOSTRA[m]}
									</button>
								{/each}
							</div>
							{#if interacao === 'choice'}
								<div
									role="group"
									aria-label="O que a questão pede"
									class="mb-3 flex flex-wrap items-center gap-1.5"
								>
									<span class="me-1 text-[12px] font-semibold text-base-content/65"
										>A questão pede</span
									>
									{#each [['pergunta', 'Uma pergunta sobre o diálogo'], ['proxima', 'A próxima fala']] as const as [chave, rotulo] (chave)}
										{@const ativa =
											chave === 'pergunta' ? contexto.ate === null : contexto.ate !== null}
										<button
											type="button"
											onclick={() => pedir(chave)}
											aria-pressed={ativa}
											class="rounded-full px-3 py-1.5 text-[12.5px] transition-colors
											       {ativa
												? 'border-[1.5px] border-primary bg-base-300 font-bold text-primary'
												: 'border border-line bg-base-100 font-semibold text-base-content/65'}"
										>
											{rotulo}
										</button>
									{/each}
								</div>
							{/if}
							<ol class="grid list-none gap-1.5 p-0" aria-label="As falas do diálogo">
								{#each contexto.falas as fala, i (i)}
									{@const vez = contexto.ate === i}
									<li class="flex items-start gap-2.5">
										{#if contexto.ate !== null}
											<input
												type="radio"
												name="vez-do-aluno"
												class="mt-1 radio"
												checked={vez}
												disabled={i === 0}
												onchange={() => escolherVez(i)}
												aria-label="A vez do aluno é a fala {i + 1}, de {fala.falante}"
											/>
										{/if}
										<span
											class="mt-0.5 w-14 shrink-0 truncate text-[11.5px] font-bold tracking-[0.04em] text-base-content/65 uppercase"
											>{fala.falante}</span
										>
										<span
											dir={idioma.dir}
											lang={idioma.tag}
											class="min-w-0 flex-1 rounded-field px-2 py-1 font-content text-[14px] leading-snug
											       {vez
												? 'border-[1.5px] border-dashed border-primary bg-base-100 font-semibold text-primary'
												: ''}">{fala.texto}</span
										>
									</li>
								{/each}
							</ol>
							{#if contexto.ate !== null}
								<p class="mt-2.5 text-[12px] leading-snug text-base-content/65">
									A fala marcada é a resposta: o que você escrever na resposta certa vira o texto
									dela.
								</p>
							{/if}
						{/if}
					</section>
				{:else if contexto?.tipo === 'texto'}
					<section class="mt-6 rounded-box border border-line bg-base-200 p-4">
						<p class="mb-2 flex flex-wrap items-baseline gap-x-2 text-[13px] font-bold">
							O trecho
							<span class="text-[12px] font-medium text-base-content/65">
								{usaContexto
									? 'do material, antes da pergunta'
									: 'este formato não usa o trecho: ele sai ao salvar'}
							</span>
						</p>
						<p
							dir={idioma.dir}
							lang={idioma.tag}
							class="font-content text-[14px] leading-relaxed whitespace-pre-line"
						>
							{contexto.texto}
						</p>
					</section>
				{/if}

				<!-- 3. o que o aluno lê -->
				<div class="mt-6 grid gap-4">
					<label class="block">
						<span class="mb-1.5 flex items-baseline gap-2 text-[12.5px] font-bold">
							Enunciado
							{#if padrao && enunciado !== padrao}
								<button
									type="button"
									onclick={() => (enunciado = padrao)}
									class="text-[12px] font-semibold text-primary underline-offset-2 hover:underline"
									>Voltar ao padrão</button
								>
							{:else if !padrao}
								<span class="text-[11.5px] font-medium text-base-content/65"
									>este formato não tem um padrão</span
								>
							{/if}
						</span>
						<input
							bind:value={enunciado}
							placeholder="O que o aluno deve fazer"
							class="input w-full text-[14.5px]"
						/>
					</label>
					<!-- Na próxima fala o aluno não lê nada além do diálogo: o campo sai. -->
					{#if !proximaFala}
						<label class="block">
							<span class="mb-1.5 flex items-baseline gap-2 text-[12.5px] font-bold">
								{rotuloDoTexto.rotulo}
								<span class="text-[11.5px] font-medium text-base-content/65"
									>{rotuloDoTexto.nota}</span
								>
							</span>
							<input
								bind:value={texto}
								dir={textoNoAlvo || usaContexto ? idioma.dir : 'auto'}
								lang={textoNoAlvo || usaContexto ? idioma.tag : undefined}
								class="input w-full text-[14.5px] {textoNoAlvo || usaContexto
									? 'font-content'
									: ''}"
							/>
							{#if avisoDoAudio}
								<span class="mt-1.5 block text-[12px] text-base-content/65">{avisoDoAudio}</span>
							{/if}
						</label>
					{/if}
				</div>

				<!-- 4. a resposta certa, só para o professor -->
				<section
					class="mt-6 rounded-box border-[1.5px] border-warning/60 bg-warning/6"
					aria-labelledby="editor-gabarito"
				>
					<div class="flex flex-wrap items-center gap-2 border-b border-warning/30 px-4 py-2.5">
						<svg
							class="size-[17px] flex-none text-warning"
							viewBox="0 0 24 24"
							fill="none"
							aria-hidden="true"
						>
							<rect
								x="4"
								y="10.5"
								width="16"
								height="10"
								rx="2.5"
								stroke="currentColor"
								stroke-width="2"
							/>
							<path
								d="M8 10.5V7.5a4 4 0 118 0v3"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
							/>
						</svg>
						<h3 id="editor-gabarito" class="text-[13px] font-bold">Resposta certa · só você vê</h3>
						<span class="flex-1"></span>
						<span class="text-[11.5px] text-base-content/65">nunca vai para a tela do aluno</span>
					</div>

					<div class="grid gap-4 px-4 py-4">
						{#if interacao === 'choice'}
							<div role="group" aria-labelledby="editor-alternativas">
								<p id="editor-alternativas" class="mb-1.5 text-[12.5px] font-bold">
									Alternativas
									<span class="font-medium text-base-content/65"
										>{tipo === 'escuta' ? 'a certa é a frase do áudio' : 'marque a certa'}</span
									>
								</p>
								<ul class="mb-1.5 grid list-none gap-1.5 p-0">
									{#each opcoes, i}
										{@const travada = tipo === 'escuta' && i === certa}
										<li class="flex items-center gap-2">
											{#if tipo !== 'escuta'}
												<input
													type="radio"
													name="editor-certa"
													class="radio shrink-0"
													checked={certa === i}
													onchange={() => (certa = i)}
													aria-label="Alternativa {i + 1} é a certa"
												/>
											{/if}
											{#if travada}
												<span
													class="input flex min-w-0 flex-1 items-center truncate bg-base-200 font-content text-[14px] text-base-content/80"
													dir={idioma.dir}>{texto || 'a frase do áudio'}</span
												>
											{:else}
												<input
													bind:value={opcoes[i]}
													aria-label="Alternativa {i + 1}"
													placeholder={i === certa
														? 'A alternativa certa'
														: 'Uma alternativa errada'}
													class="input min-w-0 flex-1 font-content text-[14px]"
													dir="auto"
												/>
											{/if}
											{#if opcoes.length > 2 && !travada}
												{@render botaoRemover(`Remover a alternativa ${i + 1}`, () =>
													removerOpcao(i)
												)}
											{/if}
										</li>
									{/each}
								</ul>
								{#if opcoes.length < MAX_ALTERNATIVAS_DA_QUESTAO}
									{@render adicionar('Adicionar alternativa', () => (opcoes = [...opcoes, '']))}
								{/if}
							</div>
						{:else if interacao === 'type'}
							<label class="block">
								<span class="mb-1.5 flex items-baseline gap-2 text-[12.5px] font-bold">
									{corrigeVoce ? 'Resposta modelo' : 'Resposta esperada'}
									{#if respondeNaLinguaDoAluno}
										<span class="text-[11.5px] font-medium text-base-content/65">{emAluno}</span>
									{/if}
								</span>
								{#if tipo === 'escuta'}
									<span
										class="input flex items-center bg-base-200 font-content text-[14px] text-base-content/80"
										dir={idioma.dir}>{texto || 'a frase do áudio'}</span
									>
								{:else}
									<input
										bind:value={aceitas[0]}
										class="input w-full font-content text-[14.5px]"
										dir={respondeNaLinguaDoAluno ? 'auto' : idioma.dir}
										placeholder="A resposta completa"
									/>
								{/if}
							</label>
							{@render tambemAceitas()}
							<label class="flex items-start gap-2.5 text-[13px]">
								<input
									type="checkbox"
									bind:checked={corrigeVoce}
									class="toggle mt-0.5 shrink-0 toggle-primary"
								/>
								<span>
									<span class="font-semibold">Você corrige</span>
									<span class="block text-[12px] text-base-content/65">
										Escrita livre: a resposta fica "a comentar" na tela da tentativa.
									</span>
								</span>
							</label>
						{:else if interacao === 'cloze'}
							<label class="block">
								<span class="mb-1.5 flex items-baseline gap-2 text-[12.5px] font-bold">
									Frase inteira <span class="text-[11.5px] font-medium text-base-content/65"
										>{emAlvo}</span
									>
								</span>
								<input
									bind:this={campoFrase}
									bind:value={frase}
									dir={idioma.dir}
									lang={idioma.tag}
									class="input w-full font-content text-[14.5px]"
								/>
							</label>
							<div>
								<span class="mb-1.5 flex flex-wrap items-baseline gap-2 text-[12.5px] font-bold">
									<label for="editor-lacuna">Trecho que falta</label>
									<button
										type="button"
										onmousedown={(e) => e.preventDefault()}
										onclick={lacunaNaSelecao}
										class="text-[12px] font-semibold text-primary underline-offset-2 hover:underline"
										>Usar o que está selecionado na frase</button
									>
								</span>
								<input
									id="editor-lacuna"
									bind:value={aceitas[0]}
									dir={idioma.dir}
									lang={idioma.tag}
									class="input w-full font-content text-[14.5px]"
									placeholder="As palavras que o aluno digita"
								/>
							</div>
							{@render tambemAceitas()}
						{:else if interacao === 'assemble'}
							<label class="block">
								<span class="mb-1.5 flex items-baseline gap-2 text-[12.5px] font-bold">
									Frase na ordem certa <span class="text-[11.5px] font-medium text-base-content/65"
										>{emAlvo}</span
									>
								</span>
								{#if tipo === 'escuta'}
									<span
										class="input flex items-center bg-base-200 font-content text-[14px] text-base-content/80"
										dir={idioma.dir}>{texto || 'a frase do áudio'}</span
									>
								{:else}
									<input
										bind:value={frase}
										dir={idioma.dir}
										lang={idioma.tag}
										class="input w-full font-content text-[14.5px]"
										placeholder={nova ? '' : 'Em branco, as peças de agora continuam'}
									/>
								{/if}
							</label>
							{#if pecas.length > 0}
								<div>
									<p class="mb-1.5 text-[12px] text-base-content/65">As peças, na ordem certa:</p>
									<div class="flex flex-wrap gap-1.5" dir={idioma.dir} lang={idioma.tag}>
										{#each pecas as p, i (i)}
											<span
												class="rounded-field border border-line bg-base-100 px-2.5 py-1 font-content text-[13.5px]"
												>{p}</span
											>
										{/each}
									</div>
								</div>
							{/if}
							<div>
								<p class="mb-1.5 text-[12.5px] font-bold">
									Peças a mais <span class="font-medium text-base-content/65"
										>opcional · para confundir</span
									>
								</p>
								{#if distratores.length > 0}
									<ul class="mb-1.5 grid list-none gap-1.5 p-0">
										{#each distratores, i}
											<li class="flex items-center gap-1.5">
												<input
													bind:value={distratores[i]}
													aria-label="Peça a mais {i + 1}"
													dir={idioma.dir}
													lang={idioma.tag}
													class="input min-w-0 flex-1 font-content text-[14px]"
												/>
												{@render botaoRemover(`Remover a peça ${i + 1}`, () => {
													distratores = distratores.filter((_, j) => j !== i);
												})}
											</li>
										{/each}
									</ul>
								{/if}
								{#if distratores.length < 10}
									{@render adicionar('Adicionar peça', () => (distratores = [...distratores, '']))}
								{/if}
							</div>
						{:else if interacao === 'match'}
							<div role="group" aria-labelledby="editor-pares">
								<p id="editor-pares" class="mb-1.5 text-[12.5px] font-bold">
									Os pares <span class="font-medium text-base-content/65"
										>de 2 a {MAX_PARES_DA_QUESTAO}</span
									>
								</p>
								<div
									class="mb-1 hidden grid-cols-[minmax(0,1fr)_minmax(0,1fr)_38px] gap-1.5 text-[11.5px] font-semibold text-base-content/65 sm:grid"
								>
									<span>{idioma.alvo}</span>
									<span>{idioma.aluno}</span>
								</div>
								<ul class="mb-1.5 grid list-none gap-1.5 p-0">
									{#each pares as par, i (i)}
										<li
											class="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_38px] items-center gap-1.5"
										>
											<input
												bind:value={par.esquerda}
												aria-label="Par {i + 1}, {idioma.alvo}"
												dir={idioma.dir}
												lang={idioma.tag}
												class="input min-w-0 font-content text-[14px]"
											/>
											<input
												bind:value={par.direita}
												aria-label="Par {i + 1}, {idioma.aluno}"
												dir="auto"
												class="input min-w-0 text-[14px]"
											/>
											{#if pares.length > 2}
												{@render botaoRemover(`Remover o par ${i + 1}`, () => {
													pares = pares.filter((_, j) => j !== i);
												})}
											{/if}
										</li>
									{/each}
								</ul>
								{#if pares.length < MAX_PARES_DA_QUESTAO}
									{@render adicionar(
										'Adicionar par',
										() => (pares = [...pares, { esquerda: '', direita: '' }])
									)}
								{/if}
							</div>
						{:else if interacao === 'order'}
							<div role="group" aria-labelledby="editor-falas">
								<p id="editor-falas" class="mb-1.5 text-[12.5px] font-bold">
									As falas, na ordem certa <span class="font-medium text-base-content/65"
										>o aluno recebe embaralhadas</span
									>
								</p>
								<ol class="mb-1.5 grid list-none gap-1.5 p-0">
									{#each falas, i}
										<li class="flex items-center gap-1.5">
											<span class="w-5 shrink-0 text-end font-mono text-[12px] text-base-content/65"
												>{i + 1}</span
											>
											<input
												bind:value={falas[i]}
												aria-label="Fala {i + 1}"
												dir={idioma.dir}
												lang={idioma.tag}
												class="input min-w-0 flex-1 font-content text-[14px]"
											/>
											<button
												type="button"
												onclick={() => (falas = mover(falas, i, -1))}
												disabled={i === 0}
												aria-label="Subir a fala {i + 1}"
												class="grid size-[38px] shrink-0 place-items-center rounded-field border border-line text-base-content/65 disabled:opacity-40"
											>
												{@render icone('M6 15l6-6 6 6', 'size-[14px]')}
											</button>
											<button
												type="button"
												onclick={() => (falas = mover(falas, i, 1))}
												disabled={i === falas.length - 1}
												aria-label="Descer a fala {i + 1}"
												class="grid size-[38px] shrink-0 place-items-center rounded-field border border-line text-base-content/65 disabled:opacity-40"
											>
												{@render icone('M6 9l6 6 6-6', 'size-[14px]')}
											</button>
											{#if falas.length > 2}
												{@render botaoRemover(`Remover a fala ${i + 1}`, () => {
													falas = falas.filter((_, j) => j !== i);
												})}
											{/if}
										</li>
									{/each}
								</ol>
								{#if falas.length < 12}
									{@render adicionar('Adicionar fala', () => (falas = [...falas, '']))}
								{/if}
							</div>
						{:else if interacao === 'select'}
							<label class="block">
								<span class="mb-1.5 flex items-baseline gap-2 text-[12.5px] font-bold">
									Frase <span class="text-[11.5px] font-medium text-base-content/65">{emAlvo}</span>
								</span>
								<input
									bind:value={frase}
									dir={idioma.dir}
									lang={idioma.tag}
									class="input w-full font-content text-[14.5px]"
								/>
							</label>
							{#if pecas.length > 0}
								<div role="group" aria-labelledby="editor-palavra">
									<p id="editor-palavra" class="mb-1.5 text-[12.5px] font-bold">
										Palavra que o aluno toca
									</p>
									<div class="flex flex-wrap gap-1.5" dir={idioma.dir} lang={idioma.tag}>
										{#each pecas as p, i (i)}
											<button
												type="button"
												onclick={() => (palavraCerta = p)}
												aria-pressed={palavraCerta === p}
												class="rounded-field px-2.5 py-1 font-content text-[13.5px] transition-colors
												       {palavraCerta === p
													? 'border-[1.5px] border-warning bg-warning/12 font-semibold'
													: 'border border-line bg-base-100 hover:border-warning'}">{p}</button
											>
										{/each}
									</div>
								</div>
							{/if}
						{:else if interacao === 'speak'}
							<label class="block">
								<span class="mb-1.5 flex items-baseline gap-2 text-[12.5px] font-bold">
									{rigor ? 'Palavra que o aluno pronuncia' : 'Frase que o aluno fala'}
									<span class="text-[11.5px] font-medium text-base-content/65">{emAlvo}</span>
								</span>
								<input
									bind:value={frase}
									dir={idioma.dir}
									lang={idioma.tag}
									class="input w-full font-content text-[14.5px]"
								/>
							</label>
							{#if rigor}
								<!-- O rigor da Pronúncia (`TOLERANCIA`): o nível da atividade escolheu
								     o padrão na geração, e é aqui que o professor troca. -->
								<fieldset class="mt-3.5">
									<legend class="mb-1.5 text-[12.5px] font-bold">Rigor da correção</legend>
									<div class="grid gap-1.5">
										{#each RIGORES as opcao (opcao)}
											<label
												class="flex cursor-pointer items-start gap-2.5 rounded-field border border-line bg-base-100 px-3 py-2.5 transition-[border-color] has-[:checked]:border-primary"
											>
												<input
													type="radio"
													name="editor-rigor"
													class="mt-0.5 radio shrink-0"
													value={opcao}
													checked={rigor === opcao}
													onchange={() => (rigor = opcao)}
												/>
												<span class="min-w-0">
													<span class="block text-[13.5px] font-semibold"
														>{RIGOR_NO_EDITOR[opcao].rotulo}</span
													>
													<span class="block text-[12.5px] leading-snug text-base-content/65"
														>{RIGOR_NO_EDITOR[opcao].descricao}</span
													>
												</span>
											</label>
										{/each}
									</div>
								</fieldset>
							{/if}
						{/if}

						{#if campos}
							<p
								class="flex items-start gap-2 border-t border-warning/30 pt-3 text-[12.5px] leading-snug text-base-content/65"
							>
								{@render icone(
									'M12 8v4.5M12 16h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
									'size-[15px] mt-px'
								)}
								{comoECorrigida(campos)}
							</p>
						{/if}
					</div>
				</section>
				<!-- A conferência, logo depois da resposta certa: é sobre ela que os
				     avisos falam. Sem problema, não aparece nada. -->
				{#if problemas.length > 0}
					<div class="mt-4" bind:this={blocoDaConferencia}>
						<ProblemasDaQuestao
							{problemas}
							onsugerir={capacidades.traducao && interacao === 'type' ? sugerirOutras : undefined}
							{sugerindo}
							{notaDaSugestao}
						/>
					</div>
				{/if}
			{/if}
		{/if}
	</div>

	<!-- a prévia: as formas vivem no PAINEL, nunca dentro do celular (lá ficariam
	     atrás do enunciado e da resposta — design-system.md). -->
	<aside
		class="relative min-h-0 overflow-y-auto border-line bg-base-200 px-4 py-5 lg:block lg:border-s lg:px-6 {aba ===
		'previa'
			? 'block'
			: 'hidden'}"
	>
		<AmbientShapes height="190px" edges="bottom" scale={0.62} />
		<div class="relative z-1 mb-1.5 flex items-center gap-2.5">
			<h3 class="text-[14px] font-bold">O que o aluno vê</h3>
			{#if consulta?.loading}<Loading variant="fila" size={8} label="Atualizando a prévia" />{/if}
		</div>
		<!-- O celular é o da home (`CelularDoAluno`): 344 × 600, a tela em zoom. A
		     questão rola por dentro, e o aparelho nunca estica com ela. -->
		<div class="relative z-1 mt-3 flex justify-center">
			<CelularDoAluno
				rotulo="Prévia da questão, como o aluno vê"
				posicao={numero}
				{total}
				apagado={fora}
			>
				{#if !questao}
					<p class="m-auto max-w-[22ch] text-center text-[13px] leading-snug text-base-content/65">
						A prévia aparece quando você escolher o tipo de questão.
					</p>
				{:else if previa?.ok}
					<p class="mb-2.5 text-[11px] font-bold text-primary">{previa.runtime.skillLabel}</p>
					{#key previa.runtime}
						<PreviaDaQuestao runtime={previa.runtime} chave={itemId ?? 'nova'} compacta />
					{/key}
					{#if avisoDoAudio}
						<p class="mt-3 text-[12px] leading-snug text-base-content/65">{avisoDoAudio}</p>
					{/if}
				{:else if previa && !previa.ok}
					<p class="m-auto max-w-[24ch] text-center text-[13px] leading-snug text-base-content/65">
						{previa.error}
					</p>
				{:else if consulta?.error}
					<p class="m-auto max-w-[24ch] text-center text-[13px] leading-snug text-base-content/65">
						Não deu para montar a prévia agora.
					</p>
				{:else}
					<div class="grid gap-3">
						<div class="h-6 w-3/4 skeleton"></div>
						<div class="h-12 skeleton"></div>
						<div class="h-12 skeleton"></div>
					</div>
				{/if}
				{#snippet rodape()}
					<p
						class="rounded-field bg-primary py-3 text-center text-base font-bold text-primary-content"
						aria-hidden="true"
					>
						{previa?.ok && previa.runtime.gradedLater ? 'Enviar' : 'Verificar'}
					</p>
				{/snippet}
			</CelularDoAluno>
		</div>
	</aside>
</div>

<!-- rodapé -->
<footer
	class="flex flex-none flex-wrap items-center gap-x-3 gap-y-2.5 border-t border-line bg-base-200 px-4 py-3 lg:px-7 lg:py-3.5"
>
	{#if confirmarSaida && alterada}
		<p role="alert" class="w-full text-[13px] font-semibold lg:w-auto lg:flex-1">
			Há mudanças não salvas. Fechar agora joga fora o que você mudou.
		</p>
		<button
			type="button"
			onclick={() => (confirmarSaida = false)}
			class="btn h-[42px] flex-1 btn-plain lg:flex-none"
		>
			Continuar editando
		</button>
		<button
			type="button"
			onclick={onfechar}
			class="btn h-[42px] flex-1 btn-outline-error lg:flex-none"
		>
			Fechar sem salvar
		</button>
	{:else}
		{#if erro}
			<p
				role="alert"
				class="flex w-full items-center gap-2 text-[13px] font-semibold text-error lg:w-auto lg:flex-1"
			>
				{@render icone('M12 7.5v6M12 16.5h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z', 'size-[15px]')}
				{erro}
			</p>
		{:else if marcaDaConferencia}
			<!-- A conferência mora depois da resposta certa, e numa tela baixa fica fora
			     da vista enquanto o professor digita: esta linha diz que há algo e leva
			     até lá. Não trava o salvar. -->
			<button
				type="button"
				onclick={verConferencia}
				class="flex w-full items-center gap-2 text-start text-[12.5px] font-semibold lg:w-auto lg:flex-1"
			>
				<span class={problemas.some((p) => p.gravidade === 'erro') ? 'text-error' : 'text-warning'}>
					{@render icone('M12 3.5l9.5 16.5H2.5zM12 9.5v4.5M12 17h.01', 'size-[15px]')}
				</span>
				<span>{marcaDaConferencia} nesta questão.</span>
				<span class="text-primary">Ver</span>
			</button>
		{:else}
			<p class="hidden text-[12.5px] text-base-content/65 lg:block lg:flex-1">
				{nova
					? 'A questão nova entra na atividade depois das outras.'
					: 'Vale para o aluno quando você publicar. O que está no ar não muda até lá.'}
			</p>
		{/if}
		{#if nova}
			<button type="button" onclick={onfechar} class="btn h-[42px] flex-1 btn-plain lg:flex-none"
				>Cancelar</button
			>
		{:else}
			<button
				type="button"
				onclick={alternarFora}
				disabled={trocandoFora || carregando}
				class="btn h-[42px] flex-1 gap-2 btn-plain lg:flex-none"
			>
				{#if trocandoFora}<Loading variant="fila" size={10} tone="current" label="Trocando" />{/if}
				<!-- As mesmas palavras do roteiro da revisão. -->
				{fora ? 'Aceitar' : 'Descartar'}
			</button>
		{/if}
		{#if !nova && proximoId}
			<button
				type="button"
				onclick={() => salvar(proximoId)}
				disabled={!questao || salvando !== null}
				class="btn hidden h-[42px] gap-2 btn-outline lg:inline-flex"
			>
				{#if salvando === 'proxima'}<Loading
						variant="fila"
						size={10}
						tone="current"
						label="Salvando"
					/>{/if}
				Salvar e ir para a próxima
			</button>
		{/if}
		<button
			type="button"
			onclick={() => salvar(null)}
			disabled={!questao || salvando !== null || carregando}
			class="btn h-[42px] flex-1 gap-2 btn-primary font-bold lg:flex-none lg:px-5"
		>
			{#if salvando === 'so'}<Loading
					variant="fila"
					size={11}
					tone="current"
					label="Salvando"
				/>{/if}
			{nova ? (tipo ? 'Adicionar questão' : 'Escolha um tipo') : 'Salvar'}
		</button>
	{/if}
</footer>
