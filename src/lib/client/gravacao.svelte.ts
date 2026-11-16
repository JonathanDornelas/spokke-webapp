import { browser } from '$app/environment';
import {
	DESCRICAO_DO_IMPEDIMENTO,
	impedimentoDoErro,
	nomeDoErro,
	type ImpedimentoDoMicrofone
} from './microfone';

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
 * no rodapé (design-system.md: em `speak` o pular está sempre visível). Cada
 * recusa tem o seu estado (`microfone.ts`), porque cada uma pede outra coisa
 * do aluno.
 *
 * **O que muda de um navegador para outro**, e por isso está aqui:
 *
 * - O medidor de silêncio (Web Audio) nasce DENTRO do toque, antes do
 *   `await`. No Safari do iPhone um `AudioContext` criado depois da espera do
 *   microfone nasce suspenso: o medidor lia zero, ninguém "falava", e a
 *   gravação cortava aos 4 s no meio da frase. Se mesmo assim ele não estiver
 *   rodando, a detecção fica desligada e a gravação para pelo toque ou no teto,
 *   nunca por um silêncio que ninguém mediu.
 * - O Firefox não recusa quando o aluno fecha o pedido de permissão: a
 *   promessa fica pendente para sempre, e o botão ficava em "Abrindo o
 *   microfone…" sem saída. Passados alguns segundos, a tela pede que ele
 *   permita no aviso do navegador e o toque volta a valer.
 * - Microfone mudo (a tecla de mudo do notebook, o sistema que entrega
 *   silêncio) grava um arquivo perfeito de nada. O pico do medidor diz isso
 *   (`semSom`), e a tela troca o "fale mais perto" por "confira o microfone".
 */

export type EstadoDaGravacao =
	| 'ocioso'
	/** O toque já aconteceu e o navegador está abrindo o microfone. */
	| 'abrindo'
	| 'gravando'
	| 'pronto'
	/** Não deu para gravar, e o motivo (`microfone.ts` diz o que fazer em cada um). */
	| ImpedimentoDoMicrofone;

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

/**
 * Abaixo disto, do começo ao fim, não chegou som nenhum: o microfone está mudo.
 * Qualquer microfone ligado, numa sala silenciosa, passa disso com folga só com
 * o próprio chiado; a fala chega a 0,02 ou mais.
 */
const PISO_DE_SINAL = 0.0015;
/** Quanto o medidor precisa ter ouvido para afirmar que não chegou som. */
const MEDIDO_PARA_AFIRMAR_SILENCIO_MS = 500;

/**
 * Quanto se espera o microfone abrir antes de dizer ao aluno que o navegador
 * está pedindo permissão. Com a permissão já dada ele abre em menos de um
 * segundo; acima disto há um pedido na tela, ou um fechado sem resposta.
 */
const ESPERA_PELA_PERMISSAO_MS = 3000;

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
	/** O tempo que o medidor de fato ouviu (com o `AudioContext` rodando). */
	medidoMs: number;
	/** O maior nível medido na gravação inteira. */
	pico: number;
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

/** O sistema avisou que a faixa não está entregando som (`muted`, não o mudo do site). */
function faixaMuda(stream: MediaStream): boolean {
	return stream.getTracks().some((faixa) => faixa.muted === true);
}

/**
 * O `AudioContext` do medidor, criado DENTRO do toque. Fora de um gesto o
 * Safari o cria suspenso, e o `resume()` também só vale dentro de um.
 */
function contextoNoToque(): AudioContext | null {
	try {
		const ctx = new AudioContext();
		if (ctx.state !== 'running') void ctx.resume().catch(() => {});
		return ctx;
	} catch {
		return null;
	}
}

function fecharContexto(ctx: AudioContext | null): void {
	void ctx?.close().catch(() => {});
}

/**
 * RMS do quadro atual, de 0 a ~1. `null` quando não há analisador, ou quando o
 * `AudioContext` não está rodando: suspenso, ele entrega zeros que pareceriam
 * silêncio.
 */
function nivelDe(captura: Captura): number | null {
	if (!captura.analisador || !captura.amostras) return null;
	if (captura.ctx?.state !== 'running') return null;
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
	 * O microfone está demorando a abrir: há um pedido de permissão na tela (ou
	 * um que o aluno fechou). A tela diz para permitir, e o toque volta a valer.
	 */
	esperandoPermissao = $state(false);
	/**
	 * A gravação terminou sem nenhum som do microfone (mudo, coberto, o sistema
	 * entregando silêncio). Só a mensagem muda: o arquivo continua sendo a
	 * gravação, e se o serviço entender alguma palavra vale o que ele entendeu.
	 */
	semSom = $state(false);

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
	/** O medidor criado no toque, à espera do microfone. Passa para a captura quando ele abre. */
	#contextoDoToque: AudioContext | null = null;
	#esperaDaPermissao: ReturnType<typeof setTimeout> | undefined;
	/** O que a Permissions API diz do microfone neste site, quando o navegador a tem. */
	#permissaoNegada = false;
	readonly #anotar: ((evento: string) => void) | undefined;

	/**
	 * @param anotar recebe os passos da gravação (abriu, começou, terminou e por
	 *   quê). A tela do Player os manda para o diário que acompanha o relato de
	 *   problema; nenhum deles carrega o que o aluno disse.
	 */
	constructor(anotar?: (evento: string) => void) {
		this.#anotar = anotar;
		this.#vigiarPermissao();
	}

	/**
	 * O microfone já bloqueado para o site aparece ANTES do toque, e a mensagem
	 * sai sozinha quando o aluno libera nas configurações (o `change` da
	 * Permissions API), sem recarregar a página. Navegador sem a API (o Firefox
	 * antigo, o Safari antes do 16) só descobre no toque, como antes.
	 */
	#vigiarPermissao(): void {
		if (!browser || typeof navigator.permissions?.query !== 'function') return;
		navigator.permissions
			.query({ name: 'microphone' as PermissionName })
			.then((status) => {
				const aplicar = () => {
					this.#permissaoNegada = status.state === 'denied';
					if (this.#permissaoNegada && this.estado === 'ocioso') this.estado = 'negado';
					if (!this.#permissaoNegada && this.estado === 'negado') {
						this.estado = 'ocioso';
						this.#anotar?.('o microfone foi liberado nas configurações');
					}
				};
				aplicar();
				status.addEventListener?.('change', aplicar);
			})
			.catch(() => {});
	}

	get disponivel(): boolean {
		return (
			browser &&
			typeof navigator.mediaDevices?.getUserMedia === 'function' &&
			typeof MediaRecorder !== 'undefined'
		);
	}

	async iniciar(): Promise<void> {
		// A trava vale DESDE O TOQUE, não depois do `await`: o microfone leva de
		// um instante a mais de um segundo para abrir, e é nesse meio que o
		// segundo toque acontecia. A exceção é o pedido de permissão parado (ver
		// `esperandoPermissao`): ali tocar de novo é a saída, e a abertura antiga
		// vira uma que não vale mais.
		if (this.estado === 'gravando') return;
		if (this.estado === 'abrindo' && !this.esperandoPermissao) return;
		if (!this.disponivel) {
			// Fora do https o navegador nem oferece o microfone, e "este navegador
			// não grava" mandaria o aluno trocar de navegador à toa.
			this.estado = globalThis.isSecureContext === false ? 'inseguro' : 'indisponivel';
			this.#anotar?.(DESCRICAO_DO_IMPEDIMENTO[this.estado]);
			return;
		}

		const abertura = ++this.#abertura;
		this.estado = 'abrindo';
		this.esperandoPermissao = false;
		// A gravação anterior sai já no toque: quem toca para regravar desistiu
		// dela, e a tela troca o "Entendemos" por "Abrindo o microfone…" na hora.
		// Sem essa resposta imediata o aluno tocava de novo.
		this.blob = null;
		this.semSom = false;
		this.segundos = 0;
		this.falando = false;
		this.#anotar?.('abrindo o microfone');

		// Ainda dentro do toque: o medidor nasce aqui (ver o comentário do topo).
		fecharContexto(this.#contextoDoToque);
		const ctx = contextoNoToque();
		this.#contextoDoToque = ctx;
		clearTimeout(this.#esperaDaPermissao);
		this.#esperaDaPermissao = setTimeout(() => {
			if (abertura !== this.#abertura || this.estado !== 'abrindo') return;
			this.esperandoPermissao = true;
			this.#anotar?.('o microfone não abriu em 3 s: esperando a permissão');
		}, ESPERA_PELA_PERMISSAO_MS);

		let stream: MediaStream;
		try {
			stream = await navigator.mediaDevices.getUserMedia({
				// Ganho e ruído automáticos: a gravação é num celular, numa sala com
				// trinta pessoas. Sem isso o Whisper transcreve o vizinho.
				audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
			});
		} catch (erro) {
			if (abertura !== this.#abertura) {
				fecharContexto(ctx);
				return;
			}
			this.#encerrarAbertura();
			const impedimento = impedimentoDoErro(erro);
			this.estado = impedimento;
			this.#anotar?.(
				`o microfone não abriu: ${DESCRICAO_DO_IMPEDIMENTO[impedimento]} (${nomeDoErro(erro)})`
			);
			return;
		}
		if (abertura !== this.#abertura) {
			soltarMicrofone(stream);
			fecharContexto(ctx);
			return;
		}
		// O medidor do toque passa para a captura; a espera da permissão acabou.
		this.#contextoDoToque = null;
		clearTimeout(this.#esperaDaPermissao);
		this.#esperaDaPermissao = undefined;
		this.esperandoPermissao = false;

		const mimeType = primeiroFormatoSuportado();
		let recorder: MediaRecorder;
		try {
			recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
		} catch {
			soltarMicrofone(stream);
			fecharContexto(ctx);
			this.estado = 'indisponivel';
			this.#anotar?.('o navegador recusou criar o gravador');
			return;
		}

		const captura: Captura = {
			stream,
			recorder,
			tipo: mimeType ?? 'audio/webm',
			pedacos: [],
			ctx,
			analisador: null,
			amostras: null,
			relogio: undefined,
			decorridoMs: 0,
			medidoMs: 0,
			pico: 0,
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

		// Sem medidor rodando não há silêncio que se possa afirmar: a gravação
		// para pelo toque ou no teto. E a espera pela fala só conta o tempo que
		// ele de fato ouviu.
		const nivel = nivelDe(captura);
		if (nivel === null) return;
		captura.medidoMs += INTERVALO_MS;
		captura.pico = Math.max(captura.pico, nivel);

		// Os primeiros 300 ms são o ambiente, não a resposta: mede-se o ruído de
		// fundo daquele aluno naquele aparelho para o limiar fazer sentido.
		if (captura.medidoMs <= CALIBRAGEM_MS) {
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
		if (!captura.jaFalou && captura.medidoMs >= ESPERA_PELA_FALA_MS) {
			// Ninguém falou. Encerra assim mesmo: o aluno vê "gravado" e decide se
			// regrava ou pula, em vez de ficar olhando um contador que não anda.
			this.#parar(captura, 'sem-fala');
		}
	}

	#ligarMedidor(captura: Captura): void {
		try {
			// O do toque, quase sempre; criar aqui é a reserva de quem não pôde lá.
			captura.ctx ??= new AudioContext();
			// O Safari põe o contexto em `interrupted` quando o microfone abre: o
			// toque já o destravou, então retomar aqui vale.
			if (captura.ctx.state !== 'running') void captura.ctx.resume().catch(() => {});
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
		// Antes de desligar: depois do `stop()` da faixa o `muted` não diz mais nada.
		const mudo =
			faixaMuda(captura.stream) ||
			(captura.medidoMs >= MEDIDO_PARA_AFIRMAR_SILENCIO_MS && captura.pico < PISO_DE_SINAL);
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
		this.semSom = mudo;
		this.estado = 'pronto';
		const segundos = (captura.decorridoMs / 1000).toLocaleString('pt-BR', {
			maximumFractionDigits: 1
		});
		this.#anotar?.(
			`a gravação terminou: ${DESCRICAO_DO_FIM[captura.fim ?? 'interrompida']} (${segundos} s)` +
				(mudo ? ', sem som do microfone' : '') +
				(captura.medidoMs === 0 ? ', sem medidor de silêncio' : '')
		);
	}

	/** Fecha o que a abertura de agora deixou pendente: o medidor do toque e a espera. */
	#encerrarAbertura(): void {
		fecharContexto(this.#contextoDoToque);
		this.#contextoDoToque = null;
		clearTimeout(this.#esperaDaPermissao);
		this.#esperaDaPermissao = undefined;
		this.esperandoPermissao = false;
	}

	/** Zera para a próxima questão. A tela reusa o mesmo componente entre elas. */
	descartar(): void {
		this.#abertura += 1;
		this.#encerrarAbertura();
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
		this.semSom = false;
		this.segundos = 0;
		this.falando = false;
		// O bloqueio do site continua valendo na próxima questão de fala.
		this.estado = this.#permissaoNegada ? 'negado' : 'ocioso';
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
