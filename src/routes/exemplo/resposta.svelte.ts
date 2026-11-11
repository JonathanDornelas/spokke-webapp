import { untrack } from 'svelte';
import { Gravacao } from '$lib/client/gravacao.svelte';
import { som } from '$lib/client/sons.svelte';
import type {
	AssembleRuntimeItem,
	ChoiceRuntimeItem,
	ClozeFeedback,
	ClozeRuntimeItem,
	Dir,
	MatchPair,
	MatchRuntimeItem,
	SpeakRuntimeItem
} from '$lib/components/interactions/types';
import { corrigirExemplo } from './exemplo.remote';

/**
 * Uma questão da atividade de exemplo como a tela a recebe: o que
 * `buildRuntimeItem` montou no servidor (`$lib/server/exemplo`), mais o id.
 * Espelha o `PlayerItem` de `a/[slug]/q/[n]` — os mesmos campos, porque é o
 * mesmo portão.
 */
interface Comum {
	id: string;
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
	skippable?: boolean;
}
export type QuestaoNaTela = Comum &
	(
		| ({ interaction: 'choice' } & Omit<ChoiceRuntimeItem, 'dir'>)
		| ({ interaction: 'assemble' } & Omit<AssembleRuntimeItem, 'dir'>)
		| ({ interaction: 'type' | 'cloze' } & Omit<ClozeRuntimeItem, 'dir'>)
		| ({ interaction: 'match' } & Omit<MatchRuntimeItem, 'dir'>)
		| ({ interaction: 'speak' } & Omit<SpeakRuntimeItem, 'dir'>)
	);

type Veredito = {
	state: 'correct' | 'partial' | 'incorrect';
	hint?: string;
	marks?: { text: string; ok: boolean }[];
	expected?: string[];
	transcript?: string;
};

/**
 * O estado de UMA questão respondida na hora: o que o visitante marcou, a ida
 * ao servidor e o veredito que voltou. Nada aqui decide certo ou errado — quem
 * corrige é `corrigirExemplo` e `/exemplo/fala` (regra inviolável nº 2).
 *
 * Crie durante a inicialização do componente: o construtor liga um `$effect`
 * que manda a gravação ouvir assim que ela para sozinha.
 */
export class RespostaDoExemplo {
	readonly questao: QuestaoNaTela;

	feedback = $state<ClozeFeedback | null>(null);
	verificando = $state(false);
	/** O que deu errado no caminho até o servidor — nunca um veredito. */
	erro = $state<string | null>(null);

	escolha = $state<string | null>(null);
	montagem = $state<string[]>([]);
	texto = $state('');
	pares = $state<MatchPair[]>([]);
	plays = $state(0);

	readonly gravacao = new Gravacao();
	/** O que o serviço de áudio entendeu, antes de enviar (`modo=ouvir`). */
	ouvido = $state<string | null>(null);
	ouvindo = $state(false);
	#ultimoBlob: Blob | null = null;

	constructor(questao: QuestaoNaTela) {
		this.questao = questao;
		$effect(() => {
			const blob = this.gravacao.blob;
			untrack(() => this.#aoGravar(blob));
		});
	}

	get gravando(): boolean {
		return this.gravacao.estado === 'gravando';
	}

	/** Já tem o que verificar. */
	get pronta(): boolean {
		switch (this.questao.interaction) {
			case 'choice':
				return this.escolha !== null;
			case 'assemble':
				return this.montagem.length > 0;
			case 'type':
			case 'cloze':
				return this.texto.trim().length > 0;
			case 'match':
				return this.pares.length === this.questao.left.length;
			case 'speak':
				// Esperar o "ouvir" terminar faz o "Verificar" reaproveitar a
				// transcrição em vez de pagar o Whisper de novo.
				return this.gravacao.blob !== null && !this.gravando && !this.ouvindo;
		}
	}

	get ocupada(): boolean {
		return this.verificando || this.ouvindo || this.gravando;
	}

	/** Volta ao começo: a questão reaparece em branco, como da primeira vez. */
	zerar() {
		this.feedback = null;
		this.verificando = false;
		this.erro = null;
		this.escolha = null;
		this.montagem = [];
		this.texto = '';
		this.pares = [];
		this.plays = 0;
		this.ouvido = null;
		this.ouvindo = false;
		this.gravacao.descartar();
	}

	async verificar(): Promise<void> {
		if (this.feedback || this.verificando || !this.pronta) return;
		this.verificando = true;
		this.erro = null;
		som.preparar('correct', 'partial', 'incorrect');
		try {
			const v =
				this.questao.interaction === 'speak' ? await this.#enviarFala() : await this.#enviar();
			this.feedback = {
				state: v.state,
				hint: v.hint,
				marks: v.marks,
				expected: v.expected,
				heard: v.transcript
			};
			som.tocar(v.state);
		} catch (e) {
			this.erro = mensagemDoErro(e);
		} finally {
			this.verificando = false;
		}
	}

	/** Liga e desliga o microfone. O `Recorder` é controlado: quem fala com o `MediaRecorder` é aqui. */
	async alternarGravacao(): Promise<void> {
		if (this.feedback || this.verificando) return;
		this.erro = null;
		if (this.gravacao.estado === 'gravando') {
			await this.gravacao.parar();
			return;
		}
		await this.gravacao.iniciar();
	}

	#resposta(): unknown {
		switch (this.questao.interaction) {
			case 'choice':
				return { optionId: this.escolha };
			case 'assemble':
				return { sequence: this.montagem };
			case 'type':
			case 'cloze':
				return { text: this.texto };
			case 'match':
				return { pairs: this.pares };
			case 'speak':
				return { transcript: '' };
		}
	}

	async #enviar(): Promise<Veredito> {
		return corrigirExemplo({ itemId: this.questao.id, answer: this.#resposta() });
	}

	async #enviarFala(): Promise<Veredito> {
		const audio = this.gravacao.blob;
		if (!audio) throw new Error('Grave sua voz antes de verificar.');
		return this.#postarFala(audio, false) as Promise<Veredito>;
	}

	async #postarFala(audio: Blob, somenteOuvir: boolean): Promise<unknown> {
		const corpo = new FormData();
		corpo.append('itemId', this.questao.id);
		if (somenteOuvir) corpo.append('modo', 'ouvir');
		corpo.append('audio', audio, 'fala.webm');
		const resposta = await fetch('/exemplo/fala', { method: 'POST', body: corpo });
		if (!resposta.ok) {
			const detalhe = (await resposta.json().catch(() => ({}))) as { message?: string };
			throw new Error(detalhe.message || 'Não conseguimos enviar sua gravação.');
		}
		return resposta.json();
	}

	/**
	 * A gravação parou (sozinha, no silêncio, ou no toque): sobe na hora para
	 * o visitante ver o que foi entendido antes de enviar — o mesmo retorno do
	 * Player de verdade.
	 */
	async #aoGravar(blob: Blob | null) {
		if (blob === this.#ultimoBlob) return;
		this.#ultimoBlob = blob;
		this.ouvido = null;
		if (!blob || this.feedback) return;

		this.ouvindo = true;
		try {
			const json = (await this.#postarFala(blob, true)) as { transcript?: string };
			// Regravou no meio: o que voltou é da gravação anterior.
			if (this.gravacao.blob === blob) this.ouvido = json.transcript ?? null;
		} catch (e) {
			if (this.gravacao.blob === blob) this.erro = mensagemDoErro(e);
		} finally {
			if (this.gravacao.blob === blob) this.ouvindo = false;
		}
	}
}

function mensagemDoErro(e: unknown): string {
	// O `error()` de uma remote function chega com o corpo em `body.message`.
	if (e && typeof e === 'object' && 'body' in e) {
		const corpo = (e as { body?: { message?: unknown } }).body;
		if (typeof corpo?.message === 'string') return corpo.message;
	}
	if (e instanceof Error && e.message) return e.message;
	return 'Não conseguimos corrigir agora. Tente de novo em instantes.';
}
