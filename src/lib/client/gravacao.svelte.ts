import { browser } from '$app/environment';

/**
 * A captura do microfone para a questão de FALA.
 *
 * Mora aqui, e não dentro do `Recorder.svelte`, porque o componente é
 * controlado por desenho (components.md "Gravação"): ele recebe `recording` e
 * `ontoggle` e não fala com o `MediaRecorder` sozinho. Quem usa é a tela da
 * questão.
 *
 * **A gravação termina sozinha quando o aluno para de falar.** Antes ela
 * dependia de um segundo toque, e isso cobrava dele uma tarefa que não é a do
 * exercício: dizer a frase E lembrar de encerrar. Quem esquecia mandava cinco
 * segundos de sala de aula depois da resposta — e o Whisper transcreve o
 * vizinho junto. O toque continua funcionando como saída manual, para quem
 * quiser cortar antes.
 *
 * **Uma captura por vez, e cada uma com as próprias peças.** Microfone,
 * gravador, medidor e relógio moram juntos numa `Captura`, e os eventos de
 * cada gravador só mexem na captura deles. Antes eram campos soltos da
 * instância, e a trava era conferida DEPOIS do `getUserMedia`: um segundo
 * toque enquanto o microfone abria criava uma segunda captura, a primeira
 * ficava com o microfone aceso e o relógio rodando para sempre, e toda
 * gravação seguinte contava o tempo em dobro — cortava no meio da frase e,
 * para quem lia antes de falar, parava sem nada. Só recarregar a página
 * resolvia (`gravacao.test.ts` guarda o caso).
 *
 * **Nada disto pode travar o exercício.** Microfone negado, aparelho sem
 * entrada, aba sem HTTPS — tudo vira uma mensagem e o botão "Pular" continua
 * no rodapé (design-system.md: em `speak` o pular está sempre visível).
 */

export type EstadoDaGravacao =
	| 'ocioso'
	/** O toque já aconteceu e o navegador está abrindo o microfone. */
	| 'abrindo'
	| 'gravando'
	| 'pronto'
	| 'negado'
	| 'indisponivel';

/**
 * `webm/opus` é o que o Chrome e o Firefox produzem; o Safari só faz `mp4`.
 * A lista é uma ordem de preferência — o serviço de áudio decodifica o que o
 * ffmpeg ler, então qualquer uma serve.
 */
const FORMATOS = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];

function primeiroFormatoSuportado(): string | undefined {
	if (typeof MediaRecorder === 'undefined') return undefined;
	return FORMATOS.find((tipo) => MediaRecorder.isTypeSupported(tipo));
}

/** De quanto em quanto tempo o nível do microfone é medido. */
const INTERVALO_MS = 50;

/**
 * Quanto silêncio encerra a gravação, depois de o aluno ter falado.
 *
 * 1,1 s é mais que a pausa entre palavras de uma frase falada devagar e menos
 * que o tempo que alguém leva para perceber que já acabou. Abaixo de 1 s a
 * gravação corta no meio de quem hesita; acima de 1,5 s ela colhe o barulho da
 * sala depois da resposta.
 */
const SILENCIO_PARA_ENCERRAR_MS = 1100;

/** Quanto se espera pela primeira palavra antes de desistir e mandar o que houver. */
const ESPERA_PELA_FALA_MS = 4000;

/**
 * O nível é medido em relação ao RUÍDO DE FUNDO, não contra um valor fixo.
 *
 * Um limiar absoluto funciona no quarto de quem escreveu o código e falha na
 * sala de aula com trinta pessoas: ali o silêncio já está acima dele e a
 * gravação nunca terminaria. Estes 300 ms iniciais medem o ambiente daquele
 * aluno, naquele aparelho.
 */
const CALIBRAGEM_MS = 300;
/** Quantas vezes acima do ruído de fundo conta como fala. */
const FATOR_ACIMA_DO_RUIDO = 2.5;
/** Piso absoluto: num microfone mudo o ruído é ~0, e 2,5× de zero continua zero. */
const PISO_DE_FALA = 0.012;

/** Por que uma gravação terminou. Vai para o diário da tela, que acompanha o relato de problema. */
type Fim = 'toque' | 'silencio' | 'sem-fala' | 'teto' | 'interrompida';

const DESCRICAO_DO_FIM: Record<Fim, string> = {
	toque: 'o aluno tocou para parar',
	silencio: 'silêncio depois da fala',
	'sem-fala': 'nenhuma fala detectada',
	teto: 'chegou ao teto de tempo',
	interrompida: 'o aparelho interrompeu a captura'
};

/** Tudo o que pertence a UMA gravação. Nada aqui é compartilhado com a próxima. */
interface Captura {
	stream: MediaStream;
	recorder: MediaRecorder;
	tipo: string;
	pedacos: Blob[];
	ctx: AudioContext | null;
	analisador: AnalyserNode | null;
	amostras: Float32Array<ArrayBuffer> | null;
	relogio: ReturnType<typeof setInterval> | undefined;
	decorridoMs: number;
	ruidoDeFundo: number;
	amostrasDeCalibragem: number;
	jaFalou: boolean;
	silencioMs: number;
	/** Já se pediu para parar: um segundo pedido espera o mesmo `stop`, sem perder os últimos pedaços. */
	parando: boolean;
	fim: Fim | null;
}

function soltarMicrofone(stream: MediaStream): void {
	stream.getTracks().forEach((faixa) => faixa.stop());
}

/** RMS do quadro atual, de 0 a ~1. `null` quando não há analisador. */
function nivelDe(captura: Captura): number | null {
	if (!captura.analisador || !captura.amostras) return null;
	captura.analisador.getFloatTimeDomainData(captura.amostras);
	let soma = 0;
	for (const amostra of captura.amostras) soma += amostra * amostra;
	return Math.sqrt(soma / captura.amostras.length);
}

export class Gravacao {
	estado = $state<EstadoDaGravacao>('ocioso');
	/** O que foi gravado, pronto para subir. Gravação vazia não é resposta: fica `null`. */
	blob = $state<Blob | null>(null);
	/** Quanto tempo já dura a gravação, em segundos — o aluno precisa ver isso. */
	segundos = $state(0);
	/** `true` enquanto o nível está acima do limiar. A tela usa para mostrar que está captando. */
	falando = $state(false);

	/**
	 * Teto duro. Dez segundos é mais do que qualquer frase de exercício, e o
	 * limite existe dos dois lados: ASR é cobrado por minuto, e uma gravação
	 * longa é quase sempre um microfone que ficou aberto por engano.
	 */
	readonly maxSegundos = 10;

	#captura: Captura | null = null;
	/**
	 * Conta as aberturas. A resposta do `getUserMedia` que chega depois de um
	 * `descartar()` (o aluno trocou de questão enquanto o microfone abria) é de
	 * uma abertura que não vale mais, e o microfone dela é desligado na hora em
	 * vez de ficar aceso sem dono.
	 */
	#abertura = 0;
	readonly #anotar: ((evento: string) => void) | undefined;

	/**
	 * @param anotar recebe os passos da gravação (abriu, começou, terminou e por
	 *   quê). A tela do Player os manda para o diário que acompanha o relato de
	 *   problema; nenhum deles carrega o que o aluno disse.
	 */
	constructor(anotar?: (evento: string) => void) {
		this.#anotar = anotar;
	}

	get disponivel(): boolean {
		return browser && !!navigator.mediaDevices && typeof MediaRecorder !== 'undefined';
	}

	async iniciar(): Promise<void> {
		// A trava vale DESDE O TOQUE, não depois do `await`: o microfone leva de
		// um instante a mais de um segundo para abrir, e é nesse meio que o
		// segundo toque acontecia.
		if (this.estado === 'abrindo' || this.estado === 'gravando') return;
		if (!this.disponivel) {
			this.estado = 'indisponivel';
			this.#anotar?.('este navegador não grava áudio');
			return;
		}

		const abertura = ++this.#abertura;
		this.estado = 'abrindo';
		// A gravação anterior sai já no toque: quem toca para regravar desistiu
		// dela, e a tela troca o "Entendemos" por "Abrindo o microfone…" na hora.
		// Sem essa resposta imediata o aluno tocava de novo.
		this.blob = null;
		this.segundos = 0;
		this.falando = false;
		this.#anotar?.('abrindo o microfone');

		let stream: MediaStream;
		try {
			stream = await navigator.mediaDevices.getUserMedia({
				// Ganho e ruído automáticos: a gravação é num celular, numa sala com
				// trinta pessoas. Sem isso o Whisper transcreve o vizinho.
				audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
			});
		} catch {
			if (abertura !== this.#abertura) return;
			// `getUserMedia` rejeita tanto para permissão negada quanto para
			// aparelho sem microfone. Para o aluno as duas coisas são a mesma:
			// não dá para gravar agora.
			this.estado = 'negado';
			this.#anotar?.('o microfone foi negado ou não existe');
			return;
		}
		if (abertura !== this.#abertura) {
			soltarMicrofone(stream);
			return;
		}

		const mimeType = primeiroFormatoSuportado();
		let recorder: MediaRecorder;
		try {
			recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
		} catch {
			soltarMicrofone(stream);
			this.estado = 'indisponivel';
			this.#anotar?.('o navegador recusou criar o gravador');
			return;
		}

		const captura: Captura = {
			stream,
			recorder,
			tipo: mimeType ?? 'audio/webm',
			pedacos: [],
			ctx: null,
			analisador: null,
			amostras: null,
			relogio: undefined,
			decorridoMs: 0,
			ruidoDeFundo: 0,
			amostrasDeCalibragem: 0,
			jaFalou: false,
			silencioMs: 0,
			parando: false,
			fim: null
		};
		// Os eventos falam com a captura DELES, nunca com `this.#captura`: o
		// `stop` atrasado de um gravador antigo não pode escrever no blob nem
		// desligar o microfone da gravação de agora.
		recorder.ondataavailable = (evento) => {
			if (evento.data.size > 0) captura.pedacos.push(evento.data);
		};
		recorder.onstop = () => this.#terminou(captura);

		this.#ligarMedidor(captura);
		try {
			recorder.start();
		} catch {
			this.#desligar(captura);
			this.estado = 'indisponivel';
			this.#anotar?.('o gravador não começou');
			return;
		}
		this.#captura = captura;
		this.estado = 'gravando';
		captura.relogio = setInterval(() => this.#tick(captura), INTERVALO_MS);
		this.#anotar?.('a gravação começou');
	}

	/**
	 * Um passo do medidor: mede o nível, decide se é fala, e encerra quando for
	 * o caso. Roda a cada 50 ms — o mesmo relógio que atualiza o contador.
	 */
	#tick(captura: Captura): void {
		// Um relógio que sobreviveu à própria captura para aqui, em vez de somar
		// tempo na gravação de outra.
		if (captura !== this.#captura) {
			clearInterval(captura.relogio);
			return;
		}
		captura.decorridoMs += INTERVALO_MS;
		this.segundos = Math.floor(captura.decorridoMs / 1000);

		if (captura.decorridoMs >= this.maxSegundos * 1000) {
			this.#parar(captura, 'teto');
			return;
		}

		const nivel = nivelDe(captura);
		if (nivel === null) return;

		// Os primeiros 300 ms são o ambiente, não a resposta: mede-se o ruído de
		// fundo daquele aluno naquele aparelho para o limiar fazer sentido.
		if (captura.decorridoMs <= CALIBRAGEM_MS) {
			captura.amostrasDeCalibragem += 1;
			captura.ruidoDeFundo += (nivel - captura.ruidoDeFundo) / captura.amostrasDeCalibragem;
			return;
		}

		const limiar = Math.max(captura.ruidoDeFundo * FATOR_ACIMA_DO_RUIDO, PISO_DE_FALA);
		this.falando = nivel > limiar;

		if (this.falando) {
			captura.jaFalou = true;
			captura.silencioMs = 0;
			return;
		}

		captura.silencioMs += INTERVALO_MS;

		// A contagem de silêncio só encerra DEPOIS de ter havido fala. Antes
		// disso o aluno ainda está se preparando, e cortar aí mandaria um
		// arquivo vazio para o serviço de áudio.
		if (captura.jaFalou && captura.silencioMs >= SILENCIO_PARA_ENCERRAR_MS) {
			this.#parar(captura, 'silencio');
			return;
		}
		if (!captura.jaFalou && captura.decorridoMs >= ESPERA_PELA_FALA_MS) {
			// Ninguém falou. Encerra assim mesmo: o aluno vê "gravado" e decide se
			// regrava ou pula, em vez de ficar olhando um contador que não anda.
			this.#parar(captura, 'sem-fala');
		}
	}

	#ligarMedidor(captura: Captura): void {
		try {
			captura.ctx = new AudioContext();
			const fonte = captura.ctx.createMediaStreamSource(captura.stream);
			captura.analisador = captura.ctx.createAnalyser();
			// 1024 amostras a 48 kHz são ~21 ms — resolução de sobra para medir
			// energia, e barato o bastante para rodar a cada 50 ms num celular.
			captura.analisador.fftSize = 1024;
			captura.amostras = new Float32Array(captura.analisador.fftSize);
			fonte.connect(captura.analisador);
		} catch {
			// Sem Web Audio não há detecção de silêncio; sobra o teto de tempo, e
			// o toque manual continua encerrando. Gravar não deixa de funcionar.
			captura.analisador = null;
			captura.amostras = null;
		}
	}

	/** O toque de parar. A gravação termina quando o gravador entregar os últimos pedaços. */
	async parar(): Promise<void> {
		const captura = this.#captura;
		if (captura) this.#parar(captura, 'toque');
	}

	#parar(captura: Captura, fim: Fim): void {
		if (captura.parando) return;
		captura.parando = true;
		captura.fim = fim;
		clearInterval(captura.relogio);
		captura.relogio = undefined;
		// O `stop` entrega os últimos pedaços e chama `#terminou`. Um gravador que
		// já parou sozinho (o aparelho tirou o microfone) chama também: o evento
		// `stop` sempre vem depois de ele ficar inativo.
		if (captura.recorder.state !== 'inactive') {
			try {
				captura.recorder.stop();
			} catch {
				this.#terminou(captura);
			}
		}
	}

	#terminou(captura: Captura): void {
		this.#desligar(captura);
		// Descartada (troca de questão) ou de uma abertura que já não vale: não
		// escreve nada. O blob e o estado são da gravação de agora.
		if (captura !== this.#captura) return;
		this.#captura = null;
		this.falando = false;

		const blob = new Blob(captura.pedacos, { type: captura.tipo });
		if (blob.size === 0) {
			// Sem nenhum byte não há o que ouvir nem o que enviar: "Verificar"
			// habilitado com um arquivo vazio voltava 400 do servidor.
			this.blob = null;
			this.estado = 'ocioso';
			this.#anotar?.('a gravação saiu vazia');
			return;
		}
		this.blob = blob;
		this.estado = 'pronto';
		const segundos = (captura.decorridoMs / 1000).toLocaleString('pt-BR', {
			maximumFractionDigits: 1
		});
		this.#anotar?.(
			`a gravação terminou: ${DESCRICAO_DO_FIM[captura.fim ?? 'interrompida']} (${segundos} s)`
		);
	}

	/** Zera para a próxima questão. A tela reusa o mesmo componente entre elas. */
	descartar(): void {
		this.#abertura += 1;
		const captura = this.#captura;
		this.#captura = null;
		if (captura) {
			captura.parando = true;
			if (captura.recorder.state !== 'inactive') {
				try {
					captura.recorder.stop();
				} catch {
					// Já estava parando: o `stop` dele chega e é ignorado.
				}
			}
			this.#desligar(captura);
		}
		this.blob = null;
		this.segundos = 0;
		this.falando = false;
		this.estado = 'ocioso';
	}

	/**
	 * Desliga o microfone de verdade e para o relógio. Sem isto o indicador de
	 * gravação do browser fica aceso depois da questão — e, com razão, o aluno
	 * acha que o site continua ouvindo. Pode rodar mais de uma vez.
	 */
	#desligar(captura: Captura): void {
		clearInterval(captura.relogio);
		captura.relogio = undefined;
		soltarMicrofone(captura.stream);
		captura.analisador = null;
		captura.amostras = null;
		void captura.ctx?.close().catch(() => {});
		captura.ctx = null;
	}
}
