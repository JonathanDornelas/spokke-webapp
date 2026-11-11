import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * O bug: na PRIMEIRA questão a resposta certa saía calada, e nas seguintes não. Os arquivos
 * começam a baixar no "Verificar", junto com a correção, e a correção chegava antes — o som era
 * descartado. Agora o veredito espera o som um instante (`ESPERA_PELO_SOM_MS`) e só descarta o
 * que chega tarde demais. O Web Audio do navegador é simulado: o que importa é se `start` roda.
 */

vi.mock('$app/environment', () => ({ browser: true }));

let agora = 0;
let liberarDownload: () => void = () => {};
let iniciados = 0;
let retomadas = 0;

class ContextoFalso {
	state: 'suspended' | 'running' = 'suspended';
	currentTime = 0;
	destination = {};
	resume() {
		retomadas += 1;
		this.state = 'running';
		return Promise.resolve();
	}
	decodeAudioData() {
		return Promise.resolve({ duration: 0.5 });
	}
	createGain() {
		const gain = { setValueAtTime() {}, linearRampToValueAtTime() {} };
		return { gain, connect: (n: unknown) => n, disconnect() {} };
	}
	createBufferSource() {
		return {
			buffer: null as unknown,
			onended: null as unknown,
			connect: (n: unknown) => n,
			disconnect() {},
			stop() {},
			start() {
				iniciados += 1;
			}
		};
	}
}

beforeEach(() => {
	vi.resetModules();
	agora = 0;
	iniciados = 0;
	retomadas = 0;
	vi.stubGlobal('AudioContext', ContextoFalso);
	vi.spyOn(performance, 'now').mockImplementation(() => agora);
	// O download só termina quando o teste manda — é assim que se controla quem chega antes.
	vi.stubGlobal(
		'fetch',
		() =>
			new Promise((resolver) => {
				liberarDownload = () => resolver({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
			})
	);
	vi.stubGlobal('localStorage', { getItem: () => null, setItem() {} });
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

const esperarPromessas = () => new Promise((r) => setTimeout(r, 0));

describe('o som da primeira questão', () => {
	it('chega logo depois do veredito: toca', async () => {
		const { som } = await import('./sons.svelte');
		som.preparar('correct');
		som.tocar('correct'); // o veredito chegou antes do arquivo
		expect(iniciados).toBe(0);
		agora = 300; // o arquivo chega 300 ms depois
		liberarDownload();
		await esperarPromessas();
		expect(iniciados).toBe(1);
	});

	it('chega tarde demais: é descartado, e fica pronto para a próxima', async () => {
		const { som } = await import('./sons.svelte');
		som.preparar('correct');
		som.tocar('correct');
		agora = 2_500;
		liberarDownload();
		await esperarPromessas();
		expect(iniciados).toBe(0);
		som.tocar('correct'); // a questão seguinte: já em cache, toca na hora
		expect(iniciados).toBe(1);
	});

	it('preparar, dentro do clique, destrava o contexto suspenso (o caso do iPhone)', async () => {
		const { som } = await import('./sons.svelte');
		som.preparar('correct');
		expect(retomadas).toBe(1);
	});

	it('no volume zero nada é baixado nem tocado', async () => {
		const { som } = await import('./sons.svelte');
		som.definir(0);
		som.preparar('correct');
		som.tocar('correct');
		liberarDownload();
		await esperarPromessas();
		expect(iniciados).toBe(0);
	});
});
