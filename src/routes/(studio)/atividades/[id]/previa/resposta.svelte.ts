import { untrack } from 'svelte';
import { Gravacao } from '$lib/client/gravacao.svelte';
import { som } from '$lib/client/sons.svelte';
import type {
	AssembleRuntimeItem,
	ChoiceRuntimeItem,
	ClozeFeedback,
	ClozeRuntimeItem,
	ContextoNoRuntime,
	Dir,
	MatchPair,
	MatchRuntimeItem,
	OrderRuntimeItem,
	SelectRuntimeItem,
	SpeakRuntimeItem
} from '$lib/components/interactions/types';
import { corrigirResposta } from './previa.remote';

/**
 * Uma questão da prévia como a tela a recebe: o que `buildRuntimeItem` montou —
 * os MESMOS campos do `PlayerItem` de `a/[slug]/q/[n]`, porque é o mesmo portão.
 */
interface Comum {
	dir: Dir;
	sourceDir: Dir;
	prompt: string;
	hint?: string;
	skill: string;
	skillLabel: string;
	sourceLabel: string;
	targetLabel: string;
	gradingLabel?: string;
	audio?: string;
	audioSlow?: string;
	passage?: string;
	/** O trecho ou o diálogo antes da pergunta, e a pergunta (`composite` com contexto). */
	contexto?: ContextoNoRuntime;
	pergunta?: string;
	/** Só na Pronúncia: as sílabas (o veredito grifa por sílaba). */
	silabas?: { leitura: string; tonica: boolean }[];
	gradedLater?: boolean;
	skippable?: boolean;
}
export type ItemDaPrevia = Comum &
	(
		| ({ interaction: 'choice' } & Omit<ChoiceRuntimeItem, 'dir'>)
		| ({ interaction: 'assemble' } & Omit<AssembleRuntimeItem, 'dir'>)
		| ({ interaction: 'type' | 'cloze' } & Omit<ClozeRuntimeItem, 'dir'>)
		| ({ interaction: 'match' } & Omit<MatchRuntimeItem, 'dir'>)
		| ({ interaction: 'order' } & Omit<OrderRuntimeItem, 'dir'>)
		| ({ interaction: 'select' } & Omit<SelectRuntimeItem, 'dir'>)
		| ({ interaction: 'speak' } & Omit<SpeakRuntimeItem, 'dir'>)
	);

export interface QuestaoDaPrevia {
	id: string;
	/** O que o aluno faz nela, como o resultado do Player chama ("montar frase"). */
	rotulo: string;
	/** Nulo quando os campos não formam um exercício (o loader diz qual). */
	item: ItemDaPrevia | null;
}

/** Como a questão terminou, para a tela de resultado. */
export type Desfecho = 'correct' | 'partial' | 'incorrect' | 'pending' | 'skipped';

/** O que a correção da prévia devolve (`corrigirNaPrevia`, no servidor). */
interface Correcao {
	veredito: {
		state: 'correct' | 'partial' | 'incorrect';
		hint?: string;
		marks?: { text: string; ok: boolean }[];
		expected?: string[];
	} | null;
	pendente: boolean;
	dada: string;
	esperada: string;
	transcript?: string;
}

/**
 * O que dizer quando a gravação não passa — as frases do Player, pela situação
 * e não pelo texto do servidor: quem responde precisa saber se grava de novo,
 * espera ou pula.
 */
function mensagemDaFala(status: number | null): string {
	if (status === null) {
		return 'Sem conexão para enviar a gravação. Confira a internet e grave de novo, ou pule esta questão.';
	}
	if (status === 503) {
		return 'Não conseguimos ouvir sua gravação agora. Grave de novo em alguns segundos ou pule esta questão.';
	}
	if (status === 400) return 'A gravação chegou vazia. Toque no microfone e grave de novo.';
	if (status === 413) return 'A gravação ficou longa demais. Grave de novo, só a frase.';
	return 'Não conseguimos enviar sua gravação. Grave de novo ou pule esta questão.';
}

class FalhaNaFala extends Error {
	constructor(status: number | null) {
		super(mensagemDaFala(status));
	}
}

function mensagemDoErro(e: unknown): string {
	// O `error()` de uma remote function chega com o corpo em `body.message`.
	if (e && typeof e === 'object' && 'body' in e) {
		const corpo = (e as { body?: { message?: unknown } }).body;
		if (typeof corpo?.message === 'string') return corpo.message;
	}
	return 'Não deu para corrigir agora. Tente de novo em instantes.';
}

/**
 * O estado de UMA questão da prévia: o que foi marcado, a ida ao servidor, o
 * veredito e o tempo na tela. Nada aqui decide certo ou errado — quem corrige é
 * `corrigirResposta` e `previa/fala` (regra inviolável nº 2). E nada sai daqui
 * para lugar nenhum: a prévia não grava (paginas.md "Prévia do aluno").
 *
 * Crie durante a inicialização do componente: o construtor liga um `$effect`
 * que manda a gravação ser ouvida assim que ela para sozinha.
 */
export class RespostaDaPrevia {
	readonly questao: QuestaoDaPrevia;
	readonly #atividade: string;

	feedback = $state<ClozeFeedback | null>(null);
	/** Escrita por rubrica enviada: ela espera o professor, não tem veredito. */
	enviada = $state(false);
	pulada = $state(false);
	verificando = $state(false);
	/** O que deu errado no caminho até o servidor — nunca um veredito. */
	erro = $state<string | null>(null);

	escolha = $state<string | null>(null);
	montagem = $state<string[]>([]);
	ordem = $state<string[]>([]);
	selecao = $state<string | null>(null);
	pares = $state<MatchPair[]>([]);
	texto = $state('');
	plays = $state(0);

	readonly gravacao = new Gravacao();
	/** O que o serviço de áudio entendeu, antes de enviar (`modo=ouvir`). */
	ouvido = $state<string | null>(null);
	ouvindo = $state(false);
	erroDaFala = $state<string | null>(null);
	#ultimoBlob: Blob | null = null;

	/** Para o resultado: a resposta dada e a certa, em texto, e o tempo na questão. */
	dada = $state('');
	esperada = $state('');
	ms = $state(0);
	#desde = 0;

	constructor(questao: QuestaoDaPrevia, atividade: string) {
		this.questao = questao;
		this.#atividade = atividade;
		this.ordem = this.#ordemInicial();
		$effect(() => {
			const blob = this.gravacao.blob;
			untrack(() => this.#aoGravar(blob));
		});
	}

	/** O "ordenar" começa na ordem em que o servidor mandou as falas (embaralhada pela seed). */
	#ordemInicial(): string[] {
		const item = this.questao.item;
		return item?.interaction === 'order' ? item.lines.map((l) => l.id) : [];
	}

	get gravando(): boolean {
		return this.gravacao.estado === 'gravando';
	}

	/** Já respondida: com veredito, ou enviada para o professor. */
	get respondida(): boolean {
		return this.feedback !== null || this.enviada;
	}

	get desfecho(): Desfecho {
		if (this.feedback) return this.feedback.state;
		if (this.enviada) return 'pending';
		return 'skipped';
	}

	/** Já tem o que verificar — a mesma regra do "Verificar" do Player. */
	get pronta(): boolean {
		const item = this.questao.item;
		if (!item) return false;
		switch (item.interaction) {
			case 'choice':
				return this.escolha !== null;
			case 'assemble':
				return this.montagem.length > 0;
			case 'type':
			case 'cloze':
				return this.texto.trim().length > 0;
			case 'match':
				return this.pares.length === item.left.length;
			case 'order':
				return this.ordem.length > 0;
			case 'select':
				return this.selecao !== null;
			case 'speak':
				// Depois da prévia da fala: o "Verificar" reaproveita a transcrição.
				return this.gravacao.estado === 'pronto' && this.gravacao.blob !== null && !this.ouvindo;
		}
	}

	get ocupada(): boolean {
		return this.verificando || this.ouvindo || this.gravando || this.gravacao.estado === 'abrindo';
	}

	/** A questão apareceu na tela: o relógio dela anda, se ainda não terminou. */
	entrar() {
		if (!this.respondida) this.#desde = Date.now();
	}

	/** A questão saiu da tela sem terminar (voltou para a anterior): guarda o tempo. */
	sair() {
		this.#somarTempo();
	}

	pular() {
		if (this.respondida) return;
		this.#somarTempo();
		this.pulada = true;
	}

	#somarTempo() {
		if (this.#desde > 0) this.ms += Date.now() - this.#desde;
		this.#desde = 0;
	}

	/** Volta ao começo: a questão reaparece em branco, como da primeira vez. */
	zerar() {
		this.feedback = null;
		this.enviada = false;
		this.pulada = false;
		this.verificando = false;
		this.erro = null;
		this.escolha = null;
		this.montagem = [];
		this.ordem = this.#ordemInicial();
		this.selecao = null;
		this.pares = [];
		this.texto = '';
		this.plays = 0;
		this.ouvido = null;
		this.ouvindo = false;
		this.erroDaFala = null;
		this.dada = '';
		this.esperada = '';
		this.ms = 0;
		this.#desde = 0;
		this.gravacao.descartar();
	}

	async verificar(): Promise<void> {
		const item = this.questao.item;
		if (!item || this.respondida || this.verificando || !this.pronta) return;
		this.verificando = true;
		this.erro = null;
		this.erroDaFala = null;
		som.preparar('correct', 'partial', 'incorrect');
		try {
			const r: Correcao =
				item.interaction === 'speak'
					? await this.#enviarFala()
					: await corrigirResposta({
							activityId: this.#atividade,
							itemId: this.questao.id,
							resposta: this.#resposta()
						});
			this.#somarTempo();
			this.pulada = false;
			this.dada = r.dada;
			this.esperada = r.esperada;
			if (r.pendente || !r.veredito) {
				this.enviada = true;
				return;
			}
			this.feedback = { ...r.veredito, heard: r.transcript };
			som.tocar(r.veredito.state);
		} catch (e) {
			if (item.interaction === 'speak') {
				this.erroDaFala = e instanceof FalhaNaFala ? e.message : mensagemDaFala(null);
			} else {
				this.erro = mensagemDoErro(e);
			}
		} finally {
			this.verificando = false;
		}
	}

	/** Liga e desliga o microfone. O `Recorder` é controlado: quem fala com o `MediaRecorder` é aqui. */
	async alternarGravacao(): Promise<void> {
		if (this.respondida || this.verificando) return;
		this.erroDaFala = null;
		if (this.gravacao.estado === 'gravando') {
			await this.gravacao.parar();
			return;
		}
		await this.gravacao.iniciar();
	}

	#resposta(): unknown {
		switch (this.questao.item?.interaction) {
			case 'choice':
				return { optionId: this.escolha };
			case 'assemble':
				return { sequence: this.montagem };
			case 'type':
			case 'cloze':
				return { text: this.texto };
			case 'match':
				return { pairs: this.pares };
			case 'order':
				return { sequence: this.ordem };
			case 'select':
				return { segmentId: this.selecao };
			default:
				return null;
		}
	}

	async #enviarFala(): Promise<Correcao> {
		const audio = this.gravacao.blob;
		if (!audio) throw new FalhaNaFala(400);
		return (await this.#postarFala(audio, false)) as Correcao;
	}

	async #postarFala(audio: Blob, somenteOuvir: boolean): Promise<unknown> {
		const corpo = new FormData();
		corpo.append('itemId', this.questao.id);
		if (somenteOuvir) corpo.append('modo', 'ouvir');
		corpo.append('audio', audio, 'fala.webm');
		let resposta: Response;
		try {
			resposta = await fetch(`/atividades/${this.#atividade}/previa/fala`, {
				method: 'POST',
				body: corpo
			});
		} catch {
			throw new FalhaNaFala(null);
		}
		if (!resposta.ok) throw new FalhaNaFala(resposta.status);
		return resposta.json();
	}

	/**
	 * A gravação parou (sozinha, no silêncio, ou no toque): sobe na hora para
	 * mostrar o que foi entendido antes de enviar — o mesmo retorno do Player.
	 */
	async #aoGravar(blob: Blob | null) {
		if (blob === this.#ultimoBlob) return;
		this.#ultimoBlob = blob;
		this.ouvido = null;
		this.ouvindo = false;
		this.erroDaFala = null;
		if (!blob || this.respondida) return;

		this.ouvindo = true;
		try {
			const json = (await this.#postarFala(blob, true)) as { transcript?: string };
			// Regravou no meio: o que voltou é da gravação anterior. Texto vazio
			// fica vazio: a tela diz que nenhuma palavra foi reconhecida.
			if (this.gravacao.blob === blob) {
				this.ouvido = typeof json.transcript === 'string' ? json.transcript.trim() : null;
			}
		} catch (e) {
			if (this.gravacao.blob === blob) {
				this.erroDaFala = e instanceof FalhaNaFala ? e.message : mensagemDaFala(null);
			}
		} finally {
			if (this.gravacao.blob === blob) this.ouvindo = false;
		}
	}
}
