import { browser } from '$app/environment';

/**
 * O som do Player: um retorno a mais no momento da correção, nunca o único.
 *
 * **Som jamais substitui o veredito visível.** `AnswerFeedback` continua
 * mostrando ícone e texto (design-system.md "Estado de correção") — o áudio é
 * reforço, e quem estuda no ônibus sem fone, com o volume no zero, ou usando
 * leitor de tela não perde nada.
 *
 * **Web Audio, e não `<audio>`.** A versão anterior guardava um
 * `HTMLAudioElement` por som e, a cada acerto, fazia `currentTime = 0` seguido
 * de `play()`. Isso ESTALA: reposicionar um MP3 obriga o decodificador a
 * recomeçar no quadro mais próximo, e o que sai antes de ele estabilizar é
 * ruído — o chiado que se ouvia no início e no fim de cada efeito. Trocar de
 * arquivo não resolveria; os quatro estão limpos (medidos: silêncio digital nas
 * duas pontas, 192 kbps).
 *
 * Decodificando uma vez para PCM e tocando de um `AudioBufferSourceNode` novo a
 * cada vez, não existe reposicionamento: cada toque começa do zero por
 * construção. O ganho entra e sai por rampa de poucos milissegundos, que é o
 * que garante ausência de estalo mesmo se um arquivo trocado no futuro não
 * começar no silêncio.
 *
 * Os arquivos vivem em `static/sons/` e chegam ao browser como `/sons/*.mp3`.
 */

export type Som = 'correct' | 'partial' | 'incorrect' | 'finish';

const ARQUIVO: Record<Som, string> = {
	correct: '/sons/correct.mp3',
	partial: '/sons/almost.mp3',
	incorrect: '/sons/incorrect.mp3',
	finish: '/sons/finish.mp3'
};

export const CHAVE_VOLUME = 'spokke-volume';

/**
 * Volume inicial. Não é 1: o Player é usado em sala de aula, e trinta
 * aparelhos no máximo ao mesmo tempo é barulho, não retorno. Também não é 0 —
 * um recurso que nasce mudo é um recurso que ninguém descobre.
 */
const PADRAO = 0.6;

/** Rampa de ganho, em segundos. Curta demais para se ouvir, longa o bastante para não estalar. */
const RAMPA = 0.004;

/**
 * Quanto o veredito ainda espera pelo som que está chegando, em ms. Na PRIMEIRA questão nada
 * está em cache: os arquivos começam a baixar no "Verificar", junto com a correção, e a correção
 * costuma ganhar por frações de segundo — o som era descartado e a primeira resposta certa saía
 * calada (o bug relatado pelo dono). Até aqui, um retorno ainda lê como resposta; depois disso
 * leria como engano, e é descartado como antes.
 */
const ESPERA_PELO_SOM_MS = 800;

class EstadoSom {
	/** 0 a 1. `0` é mudo. */
	volume = $state(PADRAO);
	/** O último volume audível, para o botão de mudo saber ao que voltar. */
	#anterior = PADRAO;
	#sincronizado = false;

	#ctx: AudioContext | null = null;
	/** O PCM já decodificado, um por som. */
	#buffers = new Map<Som, AudioBuffer>();
	/** As decodificações em andamento, para dois pedidos do mesmo som não baixarem duas vezes. */
	#carregando = new Map<Som, Promise<void>>();
	/**
	 * A fonte que está tocando de cada som, para o toque seguinte CORTAR o
	 * anterior em vez de somar a ele.
	 *
	 * Sem isto, dois pedidos seguidos do mesmo efeito viram duas fontes soando
	 * juntas — e o resultado não é o som duas vezes, é ruído: as ondas se
	 * somam e estouram. Um `<audio>` reusado nunca fazia isso, porque só existe
	 * um; com Web Audio a proteção precisa ser explícita.
	 */
	#tocando = new Map<Som, AudioBufferSourceNode>();

	/** Lê a preferência guardada. Chame uma vez, quando o Player montar. */
	sincronizar() {
		// Idempotente: a tela chama de dentro de um $effect, e sem esta guarda a
		// leitura de `volume` no fim do método reagendaria o próprio efeito.
		if (!browser || this.#sincronizado) return;
		this.#sincronizado = true;
		try {
			const guardado = Number.parseFloat(localStorage.getItem(CHAVE_VOLUME) ?? '');
			if (Number.isFinite(guardado)) this.volume = Math.min(Math.max(guardado, 0), 1);
		} catch {
			// Aba anônima, cookies bloqueados: fica o padrão. Nunca derruba a tela.
		}
		if (this.volume > 0) this.#anterior = this.volume;
	}

	definir(valor: number) {
		this.volume = Math.min(Math.max(valor, 0), 1);
		if (this.volume > 0) this.#anterior = this.volume;
		if (!browser) return;
		try {
			localStorage.setItem(CHAVE_VOLUME, String(this.volume));
		} catch {
			// Sem persistência a escolha vale só para esta sessão — não é erro.
		}
	}

	alternarMudo() {
		this.definir(this.volume > 0 ? 0 : this.#anterior || PADRAO);
	}

	/**
	 * O contexto de áudio, criado na primeira necessidade.
	 *
	 * Nunca na montagem da tela: sem um gesto do usuário o browser cria o
	 * contexto `suspended`, e um contexto suspenso que ninguém retoma é um
	 * recurso aberto sem uso. Aqui ele nasce no clique de "Verificar".
	 */
	#contexto(): AudioContext | null {
		if (!browser) return null;
		if (this.#ctx) return this.#ctx;
		try {
			this.#ctx = new AudioContext();
		} catch {
			// Browser sem Web Audio (ou com ele bloqueado): o exercício segue calado.
			return null;
		}
		return this.#ctx;
	}

	/**
	 * Baixa e DECODIFICA os arquivos antes de eles serem necessários.
	 *
	 * A tela chama isto no instante em que manda a resposta para o servidor: a
	 * correção acontece lá (regra inviolável nº 2), então o áudio viaja em
	 * paralelo com a ida ao servidor e já está pronto quando o veredito chega.
	 * Sem isso, o som chegava depois do texto e lia como falha; baixando os
	 * quatro na montagem da tela, seriam 160 kB adiantados numa superfície cujo
	 * orçamento é 4G e celular fraco (design-system.md "Dois contextos").
	 *
	 * Decodificar aqui e não no toque também importa: `decodeAudioData` de um
	 * MP3 leva dezenas de milissegundos, e pagá-los depois do veredito é o
	 * atraso que fazia o som parecer atrasado.
	 */
	preparar(...sons: Som[]) {
		if (!browser || this.volume === 0) return;
		// Quem chama está DENTRO do clique de "Verificar": é o momento de destravar o contexto.
		// No iPhone, um contexto suspenso só retoma dentro de um gesto — o `resume` de `tocar`
		// acontece depois da ida ao servidor, já fora dele.
		const ctx = this.#contexto();
		if (ctx?.state === 'suspended') void ctx.resume().catch(() => {});
		for (const som of sons) void this.#carregar(som);
	}

	#carregar(som: Som): Promise<void> {
		const emCurso = this.#carregando.get(som);
		if (emCurso) return emCurso;
		if (this.#buffers.has(som)) return Promise.resolve();

		const ctx = this.#contexto();
		if (!ctx) return Promise.resolve();

		const promessa = fetch(ARQUIVO[som])
			.then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
			.then((bytes) => ctx.decodeAudioData(bytes))
			.then((buffer) => {
				this.#buffers.set(som, buffer);
			})
			.catch(() => {
				// Arquivo fora do ar ou formato que este browser não decodifica: o
				// exercício continua, sem som. Nunca derruba a tela.
			})
			.finally(() => {
				this.#carregando.delete(som);
			});

		this.#carregando.set(som, promessa);
		return promessa;
	}

	/**
	 * Toca, e **nunca deixa o áudio derrubar a tela**. Fora de um gesto do
	 * usuário o browser mantém o contexto suspenso — abrir `/resultado` direto
	 * pelo endereço é exatamente esse caso —, e aí o exercício segue calado.
	 *
	 * Espera o carregamento só um pouco (`ESPERA_PELO_SOM_MS`): o som que chega
	 * logo depois do veredito ainda toca — era o caso da primeira questão, com nada
	 * em cache. Passou disso, é perdido de propósito: tocar o retorno de "correto"
	 * segundos depois de a tela já ter dito "Correto." confunde mais do que ajuda.
	 */
	tocar(som: Som) {
		if (!browser || this.volume === 0) return;
		if (!this.#contexto()) return;

		const buffer = this.#buffers.get(som);
		if (buffer) {
			this.#tocarAgora(som, buffer);
			return;
		}
		// Ainda chegando (ou nem pedido): espera um instante; e fica carregado para a próxima.
		const pedidoEm = performance.now();
		void this.#carregar(som).then(() => {
			const chegou = this.#buffers.get(som);
			if (chegou && performance.now() - pedidoEm <= ESPERA_PELO_SOM_MS) {
				this.#tocarAgora(som, chegou);
			}
		});
	}

	#tocarAgora(som: Som, buffer: AudioBuffer) {
		const ctx = this.#contexto();
		if (!ctx || this.volume === 0) return;

		// O contexto nasce suspenso quando é criado fora de um gesto; retomar é
		// barato e resolve o caso de a primeira correção acontecer pelo teclado.
		if (ctx.state === 'suspended') void ctx.resume().catch(() => {});

		// **Um som de cada vez, por som.** Se o mesmo efeito ainda está tocando,
		// ele é cortado — que é o que o aluno espera de um retorno de interface, e
		// o que impede duas fontes de se somarem.
		this.#parar(som);

		const fonte = ctx.createBufferSource();
		fonte.buffer = buffer;

		// A rampa é o que garante silêncio nas bordas independentemente do
		// arquivo: começa em zero, sobe, e desce de novo antes do fim.
		const ganho = ctx.createGain();
		const agora = ctx.currentTime;
		const fim = agora + buffer.duration;
		ganho.gain.setValueAtTime(0, agora);
		ganho.gain.linearRampToValueAtTime(this.volume, agora + RAMPA);
		ganho.gain.setValueAtTime(this.volume, Math.max(agora + RAMPA, fim - RAMPA));
		ganho.gain.linearRampToValueAtTime(0, fim);

		fonte.connect(ganho).connect(ctx.destination);
		// Sem `disconnect` o grafo acumula um nó por questão respondida.
		fonte.onended = () => {
			ganho.disconnect();
			if (this.#tocando.get(som) === fonte) this.#tocando.delete(som);
		};
		this.#tocando.set(som, fonte);
		fonte.start();
	}

	/** Corta o que estiver tocando deste som. Silencioso se não houver nada. */
	#parar(som: Som): void {
		const anterior = this.#tocando.get(som);
		if (!anterior) return;
		this.#tocando.delete(som);
		anterior.onended = null;
		try {
			anterior.stop();
		} catch {
			// Já terminou sozinha entre o `get` e o `stop`. Não é erro.
		}
		anterior.disconnect();
	}
}

export const som = new EstadoSom();
