import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	FalhaDoProvedor,
	type GeradorDeMateriais,
	type RespostaDoModelo,
	type TipoDeAnexo
} from './provider';
import { comReserva } from './reserva';
import type { PedidoDeMateriais } from './prompt';

/**
 * A fila "Claude primeiro, Gemini se ele falhar": o seguinte tenta o MESMO pedido quando o
 * anterior falha, e o uso é registrado em nome de quem respondeu.
 */

const PEDIDO: PedidoDeMateriais = {
	kind: 'SentencePair',
	quantos: 3,
	pedido: 'frases de restaurante',
	idiomaAlvo: 'Inglês (EUA)',
	idiomaOrigem: 'Português (Brasil)'
};
const OPCOES = { schema: {}, timeoutMs: 1_000 };

type Comportamento = 'responde' | 'falha' | 'quebra';

function provedor(nome: string, comportamento: Comportamento, le: TipoDeAnexo[] = ['imagem']) {
	const registro = { chamadas: 0 };
	const gerador: GeradorDeMateriais = {
		nome,
		le: new Set(le),
		async propor(): Promise<RespostaDoModelo> {
			registro.chamadas += 1;
			if (comportamento === 'falha') throw new FalhaDoProvedor(`${nome} sem créditos`);
			if (comportamento === 'quebra') throw new TypeError('defeito no código');
			return { dados: { propostas: [] }, uso: { entrada: 1, saida: 1, raciocinio: null } };
		}
	};
	return { gerador, registro };
}

beforeEach(() => {
	vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('comReserva', () => {
	it('o primeiro responde: o segundo nem é chamado', async () => {
		const claude = provedor('claude', 'responde');
		const gemini = provedor('gemini', 'responde');
		const r = await comReserva([claude.gerador, gemini.gerador]).propor(PEDIDO, OPCOES);
		expect(r.modelo).toBe('claude');
		expect(gemini.registro.chamadas).toBe(0);
	});

	it('o primeiro falha (sem créditos): o segundo responde, e é ele que fica no registro', async () => {
		const claude = provedor('claude', 'falha');
		const gemini = provedor('gemini', 'responde');
		const r = await comReserva([claude.gerador, gemini.gerador]).propor(PEDIDO, OPCOES);
		expect(r.modelo).toBe('gemini');
		expect(claude.registro.chamadas).toBe(1);
		expect(gemini.registro.chamadas).toBe(1);
	});

	it('todos falham: a falha do último sobe, para a geração ser estornada', async () => {
		const fila = comReserva([
			provedor('claude', 'falha').gerador,
			provedor('gemini', 'falha').gerador
		]);
		await expect(fila.propor(PEDIDO, OPCOES)).rejects.toThrow('gemini sem créditos');
	});

	it('defeito de código não passa a vez: sobe na hora', async () => {
		const gemini = provedor('gemini', 'responde');
		const fila = comReserva([provedor('claude', 'quebra').gerador, gemini.gerador]);
		await expect(fila.propor(PEDIDO, OPCOES)).rejects.toThrow(TypeError);
		expect(gemini.registro.chamadas).toBe(0);
	});

	it('um provedor só é ele mesmo, sem embrulho', () => {
		const claude = provedor('claude', 'responde');
		expect(comReserva([claude.gerador])).toBe(claude.gerador);
	});

	it('a fala de um vídeo pula quem não lê áudio e vai direto a quem lê', async () => {
		const claude = provedor('claude', 'responde', ['imagem']);
		const gemini = provedor('gemini', 'responde', ['imagem', 'audio']);
		const fila = comReserva([claude.gerador, gemini.gerador]);
		expect([...fila.le].sort()).toEqual(['audio', 'imagem']);
		const comAudio: PedidoDeMateriais = {
			...PEDIDO,
			anexo: { tipo: 'audio', mime: 'audio/wav', dados: new Uint8Array(4), segundos: 1 }
		};
		const r = await fila.propor(comAudio, OPCOES);
		expect(r.modelo).toBe('gemini');
		expect(claude.registro.chamadas).toBe(0);
	});

	it('ninguém da fila lê o arquivo: falha de provedor, para a geração ser estornada', async () => {
		const fila = comReserva(
			[provedor('claude', 'responde', ['imagem']), provedor('outro', 'responde', [])].map(
				(p) => p.gerador
			)
		);
		const comAudio: PedidoDeMateriais = {
			...PEDIDO,
			anexo: { tipo: 'audio', mime: 'audio/wav', dados: new Uint8Array(4), segundos: 1 }
		};
		await expect(fila.propor(comAudio, OPCOES)).rejects.toBeInstanceOf(FalhaDoProvedor);
	});
});
