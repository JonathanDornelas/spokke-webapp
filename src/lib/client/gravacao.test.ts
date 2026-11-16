import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * O bug: na questão de fala, tentar falar de novo não captava o áudio, o botão
 * parecia morto e só recarregar a página resolvia. Um segundo toque enquanto o
 * microfone abria criava uma segunda captura; a primeira ficava com o microfone
 * aceso e o relógio rodando para sempre, e toda gravação seguinte contava o
 * tempo em dobro — cortava numa respirada e parava em 2 s sem fala.
 *
 * O navegador é simulado: o `getUserMedia` só responde quando o teste manda, o
 * gravador entrega um pedaço no `stop` e o medidor devolve o nível que o teste
 * escolhe. O que importa é quantos microfones ficam abertos, quantos relógios
 * rodam e quando a gravação para.
 */

vi.mock('$app/environment', () => ({ browser: true }));

let faixasVivas = 0;
let pedidos: { responder: (s: unknown) => void; recusar: (e: unknown) => void }[] = [];
let nivel = 0;

function microfoneFalso() {
	faixasVivas += 1;
	let viva = true;
	const faixa = {
		stop() {
			if (viva) {
				viva = false;
				faixasVivas -= 1;
			}
		}
	};
	return { getTracks: () => [faixa] };
}

class GravadorFalso {
	static todos: GravadorFalso[] = [];
	/** Quanto o evento `stop` demora a chegar depois de `stop()`. */
	static atraso = 0;
	/** O gravador entrega um arquivo sem nenhum byte. */
	static vazio = false;
	static isTypeSupported() {
		return true;
	}
	state: 'inactive' | 'recording' = 'inactive';
	ondataavailable: ((e: { data: Blob }) => void) | null = null;
	onstop: (() => void) | null = null;
	constructor(readonly stream: unknown) {
		GravadorFalso.todos.push(this);
	}
	start() {
		this.state = 'recording';
	}
	stop() {
		this.state = 'inactive';
		setTimeout(() => {
			this.ondataavailable?.({ data: new Blob(GravadorFalso.vazio ? [] : ['fala']) });
			this.onstop?.();
		}, GravadorFalso.atraso);
	}
}

class ContextoFalso {
	static criados = 0;
	/** O estado com que o contexto nasce (o do iPhone fora do toque é `suspended`). */
	static estadoInicial: AudioContextState = 'running';
	/** `resume()` destrava? No Safari, fora de um gesto, não. */
	static destrava = true;
	state: AudioContextState = ContextoFalso.estadoInicial;
	constructor() {
		ContextoFalso.criados += 1;
	}
	resume() {
		if (ContextoFalso.destrava) this.state = 'running';
		return Promise.resolve();
	}
	createMediaStreamSource() {
		return { connect() {} };
	}
	createAnalyser() {
		return {
			fftSize: 1024,
			getFloatTimeDomainData(amostras: Float32Array) {
				amostras.fill(nivel);
			}
		};
	}
	close() {
		this.state = 'closed';
		return Promise.resolve();
	}
}

/** Uma recusa do `getUserMedia` como o navegador a manda. */
const recusa = (nome: string, mensagem = '') => new DOMException(mensagem, nome);

beforeEach(() => {
	vi.resetModules();
	vi.useFakeTimers();
	faixasVivas = 0;
	pedidos = [];
	nivel = 0;
	GravadorFalso.todos = [];
	GravadorFalso.atraso = 0;
	GravadorFalso.vazio = false;
	ContextoFalso.criados = 0;
	ContextoFalso.estadoInicial = 'running';
	ContextoFalso.destrava = true;
	vi.stubGlobal('navigator', {
		mediaDevices: {
			getUserMedia: () => new Promise((responder, recusar) => pedidos.push({ responder, recusar }))
		}
	});
	vi.stubGlobal('MediaRecorder', GravadorFalso);
	vi.stubGlobal('AudioContext', ContextoFalso);
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

/** O navegador abre o microfone de todos os pedidos pendentes. */
async function abrirMicrofone() {
	const pendentes = pedidos;
	pedidos = [];
	for (const p of pendentes) p.responder(microfoneFalso());
	await vi.advanceTimersByTimeAsync(0);
}

async function novaGravacao(anotar?: (evento: string) => void) {
	const { Gravacao } = await import('$lib/client/gravacao.svelte');
	return new Gravacao(anotar);
}

describe('Gravacao', () => {
	it('um toque: o tempo corre normal e, sem fala, para em 4 s sem deixar nada aberto', async () => {
		const g = await novaGravacao();
		const inicio = g.iniciar();
		expect(g.estado).toBe('abrindo');
		await abrirMicrofone();
		await inicio;
		expect(g.estado).toBe('gravando');

		await vi.advanceTimersByTimeAsync(1000);
		expect(g.segundos).toBe(1);
		await vi.advanceTimersByTimeAsync(3050);
		expect(g.estado).toBe('pronto');
		expect(g.blob).not.toBeNull();
		expect(faixasVivas).toBe(0);
		expect(vi.getTimerCount()).toBe(0);
	});

	it('dois toques enquanto o microfone abre: uma captura só, e nada fica aberto depois', async () => {
		const g = await novaGravacao();
		const primeiro = g.iniciar();
		const segundo = g.iniciar();
		expect(pedidos).toHaveLength(1);
		await abrirMicrofone();
		await Promise.all([primeiro, segundo]);
		expect(faixasVivas).toBe(1);
		expect(GravadorFalso.todos).toHaveLength(1);

		await g.parar();
		await vi.advanceTimersByTimeAsync(0);
		expect(g.estado).toBe('pronto');
		expect(faixasVivas).toBe(0);
		expect(vi.getTimerCount()).toBe(0);
	});

	it('a gravação seguinte corre em tempo real e aguenta uma pausa de 0,6 s no meio da frase', async () => {
		const g = await novaGravacao();
		const a = g.iniciar();
		const b = g.iniciar();
		await abrirMicrofone();
		await Promise.all([a, b]);
		await g.parar();
		await vi.advanceTimersByTimeAsync(0);

		// "Tentar falar de novo".
		const c = g.iniciar();
		await abrirMicrofone();
		await c;
		nivel = 0.001; // o ambiente, na calibragem
		await vi.advanceTimersByTimeAsync(400);
		nivel = 0.2; // começou a falar
		await vi.advanceTimersByTimeAsync(600);
		expect(g.segundos).toBe(1);
		nivel = 0.001; // respirou entre duas palavras
		await vi.advanceTimersByTimeAsync(600);
		expect(g.estado).toBe('gravando');

		// O silêncio de verdade, depois da frase, encerra.
		await vi.advanceTimersByTimeAsync(600);
		expect(g.estado).toBe('pronto');
	});

	it('o stop atrasado de uma gravação descartada não mexe na gravação nova', async () => {
		GravadorFalso.atraso = 500;
		const g = await novaGravacao();
		const a = g.iniciar();
		await abrirMicrofone();
		await a;
		g.descartar(); // trocou de questão; o stop desta chega daqui a 500 ms

		const b = g.iniciar();
		await abrirMicrofone();
		await b;
		expect(g.estado).toBe('gravando');

		await vi.advanceTimersByTimeAsync(500);
		expect(g.estado).toBe('gravando');
		expect(g.blob).toBeNull();
		expect(faixasVivas).toBe(1); // o microfone da gravação de agora continua aberto
	});

	it('trocar de questão enquanto o microfone abre desliga o microfone que chega depois', async () => {
		const g = await novaGravacao();
		const inicio = g.iniciar();
		g.descartar();
		await abrirMicrofone();
		await inicio;
		expect(g.estado).toBe('ocioso');
		expect(faixasVivas).toBe(0);
		expect(vi.getTimerCount()).toBe(0);
	});

	it('gravação vazia não vira resposta', async () => {
		GravadorFalso.vazio = true;
		const g = await novaGravacao();
		const inicio = g.iniciar();
		await abrirMicrofone();
		await inicio;
		await g.parar();
		await vi.advanceTimersByTimeAsync(0);
		expect(g.blob).toBeNull();
		expect(g.estado).toBe('ocioso');
	});

	it('microfone negado: o estado diz, e o toque seguinte tenta de novo', async () => {
		const g = await novaGravacao();
		const negado = g.iniciar();
		pedidos.shift()?.recusar(new Error('NotAllowedError'));
		await negado;
		expect(g.estado).toBe('negado');

		const deNovo = g.iniciar();
		expect(g.estado).toBe('abrindo');
		await abrirMicrofone();
		await deNovo;
		expect(g.estado).toBe('gravando');
	});

	it('o gravador que para sozinho termina a gravação e para o relógio', async () => {
		const g = await novaGravacao();
		const inicio = g.iniciar();
		await abrirMicrofone();
		await inicio;
		GravadorFalso.todos[0]!.stop(); // o aparelho tirou o microfone
		await vi.advanceTimersByTimeAsync(0);
		expect(g.estado).toBe('pronto');
		expect(faixasVivas).toBe(0);
		expect(vi.getTimerCount()).toBe(0);
	});

	it('regravar tira a gravação anterior já no toque', async () => {
		const g = await novaGravacao();
		const a = g.iniciar();
		await abrirMicrofone();
		await a;
		await g.parar();
		await vi.advanceTimersByTimeAsync(0);
		expect(g.blob).not.toBeNull();

		void g.iniciar();
		expect(g.estado).toBe('abrindo');
		expect(g.blob).toBeNull();
	});

	it('anota os passos e o motivo de cada fim, sem nada do que foi dito', async () => {
		const passos: string[] = [];
		const g = await novaGravacao((evento) => passos.push(evento));
		const inicio = g.iniciar();
		await abrirMicrofone();
		await inicio;
		nivel = 0.001;
		await vi.advanceTimersByTimeAsync(400);
		nivel = 0.2;
		await vi.advanceTimersByTimeAsync(500);
		nivel = 0.001;
		await vi.advanceTimersByTimeAsync(1200);
		expect(passos[0]).toBe('abrindo o microfone');
		expect(passos).toContain('a gravação começou');
		expect(passos.at(-1)).toMatch(/^a gravação terminou: silêncio depois da fala/);
	});
});

/**
 * O que muda de um navegador e de um aparelho para outro. Cada caso é uma
 * reclamação possível: "no iPhone cortou no meio da frase", "no Firefox ficou
 * abrindo para sempre", "diz que não tenho permissão e eu dei".
 */
describe('Gravacao em cada navegador', () => {
	it('cada recusa do microfone vira o seu estado, e o diário guarda o nome do erro', async () => {
		const casos: [DOMException, string][] = [
			[recusa('NotAllowedError', 'Permission denied'), 'negado'],
			[recusa('NotAllowedError', 'Permission dismissed'), 'dispensado'],
			[recusa('NotAllowedError', 'Permission denied by system'), 'negado-sistema'],
			[recusa('NotFoundError', 'Requested device not found'), 'sem-microfone'],
			[recusa('NotReadableError', 'Could not start audio source'), 'ocupado']
		];
		for (const [erro, estado] of casos) {
			const passos: string[] = [];
			const g = await novaGravacao((p) => passos.push(p));
			const inicio = g.iniciar();
			pedidos.shift()?.recusar(erro);
			await inicio;
			expect(g.estado).toBe(estado);
			expect(passos.at(-1)).toContain(erro.name);
		}
		// Nada fica para trás: nem o medidor do toque, nem a espera da permissão.
		expect(vi.getTimerCount()).toBe(0);
	});

	it('o medidor nasce no toque, antes de o microfone abrir (o iPhone exige o gesto)', async () => {
		const g = await novaGravacao();
		void g.iniciar();
		// O microfone ainda não abriu e o contexto já existe: foi criado no toque.
		expect(ContextoFalso.criados).toBe(1);
		await abrirMicrofone();
		expect(ContextoFalso.criados).toBe(1);
	});

	it('com o medidor suspenso, ninguém corta por silêncio: a gravação vai até o toque ou o teto', async () => {
		ContextoFalso.estadoInicial = 'suspended';
		ContextoFalso.destrava = false;
		const passos: string[] = [];
		const g = await novaGravacao((p) => passos.push(p));
		const inicio = g.iniciar();
		await abrirMicrofone();
		await inicio;
		nivel = 0; // o que um contexto suspenso entrega, com o aluno falando
		await vi.advanceTimersByTimeAsync(6000);
		expect(g.estado).toBe('gravando'); // antes, cortava aos 4 s
		await vi.advanceTimersByTimeAsync(4100);
		expect(g.estado).toBe('pronto');
		// Sem medidor, não se afirma que veio sem som.
		expect(g.semSom).toBe(false);
		expect(passos.at(-1)).toContain('teto');
		expect(passos.at(-1)).toContain('sem medidor de silêncio');
	});

	it('o pedido de permissão parado (Firefox) vira instrução, e o toque seguinte abre de novo', async () => {
		const g = await novaGravacao();
		const primeiro = g.iniciar();
		await vi.advanceTimersByTimeAsync(2900);
		expect(g.esperandoPermissao).toBe(false);
		await vi.advanceTimersByTimeAsync(200);
		expect(g.estado).toBe('abrindo');
		expect(g.esperandoPermissao).toBe(true);

		// O toque de novo pede outra vez; o pedido antigo, se um dia responder, não vale.
		const segundo = g.iniciar();
		expect(pedidos).toHaveLength(2);
		expect(g.esperandoPermissao).toBe(false);
		await abrirMicrofone();
		await Promise.all([primeiro, segundo]);
		expect(g.estado).toBe('gravando');
		expect(faixasVivas).toBe(1);
		expect(GravadorFalso.todos).toHaveLength(1);
	});

	it('microfone mudo: a gravação termina e diz que não chegou som', async () => {
		const g = await novaGravacao();
		const inicio = g.iniciar();
		await abrirMicrofone();
		await inicio;
		nivel = 0;
		await vi.advanceTimersByTimeAsync(4100);
		expect(g.estado).toBe('pronto');
		expect(g.blob).not.toBeNull(); // o arquivo continua: se o serviço ouvir algo, vale
		expect(g.semSom).toBe(true);

		// Regravar zera o aviso já no toque, e uma gravação com fala não o tem.
		const deNovo = g.iniciar();
		expect(g.semSom).toBe(false);
		await abrirMicrofone();
		await deNovo;
		nivel = 0.001;
		await vi.advanceTimersByTimeAsync(400);
		nivel = 0.2;
		await vi.advanceTimersByTimeAsync(500);
		nivel = 0.001;
		await vi.advanceTimersByTimeAsync(1200);
		expect(g.estado).toBe('pronto');
		expect(g.semSom).toBe(false);
	});

	it('uma sala silenciosa não é microfone mudo', async () => {
		const g = await novaGravacao();
		const inicio = g.iniciar();
		await abrirMicrofone();
		await inicio;
		nivel = 0.003; // o chiado de um microfone ligado, ninguém falando
		await vi.advanceTimersByTimeAsync(4100);
		expect(g.estado).toBe('pronto');
		expect(g.semSom).toBe(false);
	});

	it('o microfone já bloqueado aparece antes do toque, e sai sozinho quando é liberado', async () => {
		const ouvintes: (() => void)[] = [];
		const status = {
			state: 'denied' as PermissionState,
			addEventListener: (_: string, f: () => void) => ouvintes.push(f)
		};
		vi.stubGlobal('navigator', {
			mediaDevices: {
				getUserMedia: () =>
					new Promise((responder, recusar) => pedidos.push({ responder, recusar }))
			},
			permissions: { query: () => Promise.resolve(status) }
		});
		const g = await novaGravacao();
		await vi.advanceTimersByTimeAsync(0);
		expect(g.estado).toBe('negado');

		// Trocar de questão não esquece o bloqueio.
		g.descartar();
		expect(g.estado).toBe('negado');

		// O aluno liberou nas configurações: a mensagem sai sem recarregar.
		status.state = 'granted';
		ouvintes.forEach((f) => f());
		expect(g.estado).toBe('ocioso');
	});

	it('fora do https o estado é "inseguro", não "este navegador não grava"', async () => {
		vi.stubGlobal('navigator', {});
		vi.stubGlobal('isSecureContext', false);
		const g = await novaGravacao();
		await g.iniciar();
		expect(g.estado).toBe('inseguro');

		vi.stubGlobal('isSecureContext', true);
		await g.iniciar();
		expect(g.estado).toBe('indisponivel');
	});
});
