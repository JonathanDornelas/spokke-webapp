import type { PassoDaBoca } from '$lib/kernel/language/pronuncia';
import type { Trecho } from '$lib/kernel/language/sintese';

/**
 * O ÁUDIO DA PRONÚNCIA, tocado pelo Web Audio: a palavra inteira, ou só o
 * trecho de uma sílaba, com a boca andando no tempo de cada som.
 *
 * Pelo Web Audio, e não pelo `<audio>`, porque o `<audio>` não acerta o momento:
 * posicionar dentro de um MP3 cai perto, não em cima, e parar dependia de um
 * quadro de animação conferir a hora (até 16 ms depois) e cortar seco, no meio
 * do som — era o "corte abrupto". Aqui o trecho começa e termina na amostra
 * certa, agendado pelo relógio do áudio, com uma rampa de poucos milissegundos
 * em cada ponta: curta demais para soar como fade, longa o bastante para o
 * degrau não estalar.
 *
 * Dois cuidados de navegador:
 *
 * - **O decodificador de MP3 pode atrasar o áudio** (há os que deixam o
 *   enchimento do codificador na frente). A linha do tempo diz onde a fala
 *   começa (`fala`); medindo o mesmo no que foi decodificado, a diferença é o
 *   atraso, e todo trecho anda junto (`atrasoDoDecodificador`).
 * - **No iPhone o Web Audio obedece à chave de silencioso**, e o `<audio>` não:
 *   com a chave ligada, "Ouvir" ficaria mudo e o resto da atividade tocaria.
 *   Com a Audio Session API (Safari 17) o áudio vira "reprodução", como o
 *   `<audio>`; sem ela, no iPhone, a tela usa o `<audio>` (`disponivel`).
 *
 * Quem decide o que tocar é a tela (`PronunciaDaPalavra`); aqui é só tocar.
 */

/** A rampa de entrada e a de saída de um trecho, em segundos. */
const RAMPA_DE_ENTRADA = 0.006;
const RAMPA_DE_SAIDA = 0.012;
/** O mesmo envelope do serviço de áudio (`tempos.py`): RMS de 10 ms a cada 2 ms. */
const JANELA_S = 0.01;
const PASSO_S = 0.002;
const PISO_DA_FALA = 0.02;
/** Atraso maior que isto não é o decodificador: é medida errada, e fica zero. */
const ATRASO_MAXIMO = 0.15;
/** Antes da primeira sílaba toca um respiro da margem: cortar rente come o começo do som. */
export const RESPIRO_DA_PRIMEIRA = 0.02;

interface Decodificado {
	buffer: AudioBuffer;
	atraso: number;
}

interface Tocando {
	fonte: AudioBufferSourceNode;
	ganho: GainNode;
	/** Quando, no relógio do contexto, o trecho começou a tocar. */
	inicio: number;
	/** De que ponto da linha do tempo ele começou. */
	de: number;
}

/** Onde a fala começa nas amostras, em segundos: o mesmo critério do serviço de áudio. */
export function comecoDaFala(amostras: Float32Array, taxa: number): number | null {
	const janela = Math.max(1, Math.round(JANELA_S * taxa));
	const passo = Math.max(1, Math.round(PASSO_S * taxa));
	const metade = Math.floor(janela / 2);
	// A soma dos quadrados acumulada: a média de qualquer janela sai em O(1).
	const acumulada = new Float64Array(amostras.length + 1);
	for (let i = 0; i < amostras.length; i++) {
		acumulada[i + 1] = acumulada[i]! + amostras[i]! * amostras[i]!;
	}
	const rms: number[] = [];
	for (let centro = 0; centro < amostras.length; centro += passo) {
		const a = Math.max(0, centro - metade);
		const b = Math.min(amostras.length, centro + janela - metade);
		rms.push(Math.sqrt((acumulada[b]! - acumulada[a]!) / janela));
	}
	const pico = Math.max(0, ...rms);
	if (pico <= 0) return null;
	const primeiro = rms.findIndex((v) => v > PISO_DA_FALA * pico);
	return primeiro < 0 ? null : (primeiro * passo) / taxa;
}

/**
 * Quanto o decodificador atrasou o áudio: onde a fala começa no que ele
 * entregou, menos onde o serviço disse que ela começa.
 */
export function atrasoDoDecodificador(
	amostras: Float32Array,
	taxa: number,
	fala: Trecho | null
): number {
	if (!fala) return 0;
	const comeco = comecoDaFala(amostras, taxa);
	if (comeco === null) return 0;
	const atraso = comeco - fala[0];
	return Math.abs(atraso) > ATRASO_MAXIMO ? 0 : Math.round(atraso * 1000) / 1000;
}

/**
 * O passo da boca no instante `t` da linha do tempo: o fonema que está soando
 * e, no ditongo (dois passos), qual metade. Fora de todo fonema, `null` (a boca
 * em repouso).
 */
export function passoNoTempo(
	passos: PassoDaBoca[],
	fones: Trecho[],
	t: number
): PassoDaBoca | null {
	const f = fones.findIndex(([a, b]) => t >= a && t < b);
	if (f < 0) return null;
	const doFonema = passos.filter((p) => p.fonema === f);
	if (doFonema.length === 0) return null;
	const [a, b] = fones[f]!;
	const k = Math.floor(((t - a) / Math.max(1e-6, b - a)) * doFonema.length);
	return doFonema[Math.min(doFonema.length - 1, Math.max(0, k))]!;
}

/** O trecho de uma sílaba: do começo do primeiro fonema dela ao fim do último. */
export function trechoDaSilaba(
	passos: PassoDaBoca[],
	fones: Trecho[],
	silaba: number
): Trecho | null {
	const indices = [...new Set(passos.filter((p) => p.silaba === silaba).map((p) => p.fonema))];
	const trechos = indices.map((i) => fones[i]).filter((t): t is Trecho => !!t);
	if (trechos.length === 0) return null;
	return [Math.min(...trechos.map((t) => t[0])), Math.max(...trechos.map((t) => t[1]))];
}

interface NavegadorComSessao {
	audioSession?: { type: string };
}

function iPhoneSemSessaoDeAudio(): boolean {
	const ua = navigator.userAgent;
	const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
	return ios && !(navigator as NavegadorComSessao).audioSession;
}

export class AudioDaPronuncia {
	#ctx: AudioContext | null = null;
	#arquivos = new Map<string, Promise<Decodificado | null>>();
	#tocando: Tocando | null = null;

	/** Dá para tocar por aqui? Sem isto a tela usa o `<audio>`. */
	get disponivel(): boolean {
		return (
			typeof window !== 'undefined' &&
			typeof AudioContext !== 'undefined' &&
			typeof fetch === 'function' &&
			!iPhoneSemSessaoDeAudio()
		);
	}

	#contexto(): AudioContext | null {
		if (!this.disponivel) return null;
		if (!this.#ctx || this.#ctx.state === 'closed') {
			try {
				this.#ctx = new AudioContext();
			} catch {
				this.#ctx = null;
			}
		}
		return this.#ctx;
	}

	/**
	 * Baixa e decodifica, sem tocar. Pode rodar fora de um toque (o contexto
	 * suspenso decodifica igual), e é o que a tela faz ao abrir a questão: o
	 * primeiro toque já sai na hora. Falhou (sem CORS no bucket, arquivo que não
	 * veio), `null`, e a tela cai no `<audio>`.
	 */
	carregar(url: string, fala: Trecho | null): Promise<Decodificado | null> {
		const ja = this.#arquivos.get(url);
		if (ja) return ja;
		const ctx = this.#contexto();
		if (!ctx) return Promise.resolve(null);
		const promessa = fetch(url, { mode: 'cors', credentials: 'omit' })
			.then((resposta) => {
				if (!resposta.ok) throw new Error(`áudio ${resposta.status}`);
				return resposta.arrayBuffer();
			})
			.then((bytes) => ctx.decodeAudioData(bytes))
			.then((buffer) => ({
				buffer,
				atraso: atrasoDoDecodificador(buffer.getChannelData(0), buffer.sampleRate, fala)
			}))
			.catch(() => {
				this.#arquivos.delete(url);
				return null;
			});
		this.#arquivos.set(url, promessa);
		return promessa;
	}

	/**
	 * DENTRO do toque, antes de qualquer `await`: o Safari só destrava o áudio num
	 * gesto. E, no iPhone, põe a sessão em "reprodução" (ver o topo).
	 */
	destravar(): void {
		const sessao = (navigator as NavegadorComSessao).audioSession;
		if (sessao) {
			try {
				sessao.type = 'playback';
			} catch {
				// Navegador que recusa o tipo: segue com o que tem.
			}
		}
		const ctx = this.#contexto();
		if (ctx && ctx.state !== 'running') void ctx.resume().catch(() => {});
	}

	/** Duração do arquivo, quando já decodificado. */
	async duracao(url: string): Promise<number | null> {
		const arquivo = await this.#arquivos.get(url);
		return arquivo ? arquivo.buffer.duration : null;
	}

	/**
	 * Toca de `de` a `ate` (segundos da linha do tempo; `ate` nulo é até o fim).
	 * Devolve `false` quando não deu para tocar por aqui, e a tela usa o `<audio>`.
	 */
	async tocar(
		url: string,
		fala: Trecho | null,
		de: number,
		ate: number | null,
		aoTerminar: () => void
	): Promise<boolean> {
		this.parar();
		const arquivo = await this.carregar(url, fala);
		// O contexto pode ter sido fechado (a tela saiu e voltou); o arquivo
		// decodificado não depende dele.
		const ctx = this.#contexto();
		if (!arquivo || !ctx) return false;
		if (ctx.state !== 'running') {
			await ctx.resume().catch(() => {});
			if ((ctx.state as AudioContextState) !== 'running') return false;
		}

		const { buffer, atraso } = arquivo;
		const ini = Math.min(Math.max(0, de + atraso), buffer.duration);
		const fim =
			ate === null ? buffer.duration : Math.min(Math.max(ini, ate + atraso), buffer.duration);
		if (fim - ini <= 0.005) return false;

		const fonte = ctx.createBufferSource();
		fonte.buffer = buffer;
		const ganho = ctx.createGain();
		fonte.connect(ganho).connect(ctx.destination);

		// Um instante no futuro: as rampas são agendadas no relógio do áudio, e o
		// que é agendado para o passado vale como "já".
		const t0 = ctx.currentTime + 0.01;
		const duracao = fim - ini;
		const g = ganho.gain;
		if (ini > 0.001) {
			g.setValueAtTime(0, t0);
			g.linearRampToValueAtTime(1, t0 + Math.min(RAMPA_DE_ENTRADA, duracao / 3));
		} else {
			g.setValueAtTime(1, t0);
		}
		if (fim < buffer.duration - 0.001) {
			// A rampa termina EXATAMENTE no limite: nada da sílaba seguinte entra.
			const rampa = Math.min(RAMPA_DE_SAIDA, duracao / 3);
			g.setValueAtTime(1, t0 + duracao - rampa);
			g.linearRampToValueAtTime(0, t0 + duracao);
		}
		fonte.start(t0, ini, duracao);
		const tocando: Tocando = { fonte, ganho, inicio: t0, de: ini - atraso };
		fonte.onended = () => {
			if (this.#tocando !== tocando) return;
			this.#tocando = null;
			aoTerminar();
		};
		this.#tocando = tocando;
		return true;
	}

	/**
	 * O ponto da linha do tempo que se OUVE agora: o relógio do áudio menos a
	 * latência da saída (fone Bluetooth chega a 200 ms). É por ele que a boca anda.
	 */
	posicao(): number | null {
		const ctx = this.#ctx;
		const tocando = this.#tocando;
		if (!ctx || !tocando) return null;
		const latencia = ctx.outputLatency || ctx.baseLatency || 0;
		return tocando.de + Math.max(0, ctx.currentTime - tocando.inicio - latencia);
	}

	/** Para o que estiver tocando, com uma rampa curta (parar seco também estala). */
	parar(): void {
		const tocando = this.#tocando;
		const ctx = this.#ctx;
		this.#tocando = null;
		if (!tocando || !ctx) return;
		const agora = ctx.currentTime;
		try {
			tocando.ganho.gain.cancelScheduledValues(agora);
			tocando.ganho.gain.setValueAtTime(tocando.ganho.gain.value, agora);
			tocando.ganho.gain.linearRampToValueAtTime(0, agora + 0.008);
			tocando.fonte.stop(agora + 0.01);
		} catch {
			// Já tinha parado.
		}
	}

	/** Ao sair da questão: solta o contexto (o iPhone tem poucos). Os arquivos ficam. */
	fechar(): void {
		this.parar();
		const ctx = this.#ctx;
		this.#ctx = null;
		void ctx?.close().catch(() => {});
	}
}
