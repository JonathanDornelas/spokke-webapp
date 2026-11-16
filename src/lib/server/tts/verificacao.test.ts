import { describe, expect, it, vi } from 'vitest';
import { sintetizarConferido, type Ouvinte } from './verificacao';
import type { OpcoesDaSintese, TtsProvider } from './provider';

/**
 * A orquestração da síntese conferida, com provedor e ouvido de MENTIRA: o que
 * se prova aqui é o caminho (quando esticar, quando marcar suspeita, que ouvir
 * nunca trava a fila), não a fonética — essa é `kernel/language/sintese.test.ts`.
 */

const IPA = 'ˌaɪ dˈoʊnt nˈoʊ.';
const LIMPO = [
	{ s: 'aɪ', inicio: 0.06, fim: 0.08 },
	{ s: 'd', inicio: 0.14, fim: 0.16 },
	{ s: 'oʊ', inicio: 0.18, fim: 0.2 },
	{ s: 'n', inicio: 0.24, fim: 0.26 },
	{ s: 't', inicio: 0.28, fim: 0.3 },
	{ s: 'n', inicio: 0.32, fim: 0.34 },
	{ s: 'oʊ', inicio: 0.36, fim: 0.38 }
];
// A versão devagar com a sílaba falsa na frente ("So I don't know").
const COM_SILABA_A_MAIS = [{ s: 'ə', inicio: 0.05, fim: 0.07 }, ...LIMPO];

function provedor(opcoes: { esticaDeVerdade?: boolean; semFonemas?: boolean } = {}) {
	const chamadas: { speed: number; opcoes?: OpcoesDaSintese }[] = [];
	const tts: TtsProvider = {
		async synthesize(_text, _voice, speed, extra) {
			chamadas.push({ speed, opcoes: extra });
			const esticada = !!extra?.esticar && speed < 1 && opcoes.esticaDeVerdade !== false;
			return {
				audio: new Uint8Array([esticada ? 2 : 1]),
				contentType: 'audio/mpeg',
				...(opcoes.semFonemas ? {} : { fonemas: IPA }),
				esticada,
				// Cada versão com a sua linha do tempo: a esticada é mais longa.
				linha: { fala: [0.03, esticada ? 0.5 : 0.4], sons: [{ s: 'aɪ', inicio: 0.03, fim: 0.1 }] }
			};
		}
	};
	return { tts, chamadas };
}

/** O ouvido: o arquivo 1 é a síntese direta, o 2 é a esticada. */
const ouvinte =
	(direta: typeof LIMPO, esticada: typeof LIMPO = LIMPO): Ouvinte =>
	async (audio) => ({ sons: audio[0] === 2 ? esticada : direta, duracao: 0.8 });

describe('sintetizarConferido', () => {
	it('a síntese que disse o que pretendia vai como saiu', async () => {
		const { tts, chamadas } = provedor();
		const r = await sintetizarConferido(
			{ text: "I don't know.", voice: 'en-US', speed: 1 },
			tts,
			ouvinte(LIMPO)
		);
		expect(r.qualidade).toBe('aprovada');
		expect(chamadas).toHaveLength(1);
	});

	it('a versão devagar com um som a mais é trocada pela normal esticada', async () => {
		const { tts, chamadas } = provedor();
		const r = await sintetizarConferido(
			{ text: "I don't know.", voice: 'en-US', speed: 0.75 },
			tts,
			ouvinte(COM_SILABA_A_MAIS)
		);
		expect(r.qualidade).toBe('esticada');
		expect(r.audio[0]).toBe(2);
		expect(r.motivo).toBe('vogal antes da fala');
		expect(chamadas.map((c) => c.opcoes?.esticar ?? false)).toEqual([false, true]);
	});

	it('sem como esticar (serviço antigo), a devagar reprovada fica, marcada como suspeita', async () => {
		const { tts } = provedor({ esticaDeVerdade: false });
		const r = await sintetizarConferido(
			{ text: "I don't know.", voice: 'en-US', speed: 0.75 },
			tts,
			ouvinte(COM_SILABA_A_MAIS)
		);
		expect(r.qualidade).toBe('suspeita');
		expect(r.audio[0]).toBe(1);
	});

	it('a normal reprovada não tem reserva: vai, como suspeita', async () => {
		const { tts, chamadas } = provedor();
		const r = await sintetizarConferido(
			{ text: "I don't know.", voice: 'en-US', speed: 1 },
			tts,
			ouvinte(COM_SILABA_A_MAIS)
		);
		expect(r.qualidade).toBe('suspeita');
		expect(chamadas).toHaveLength(1);
	});

	it('o reconhecedor fora do ar nunca trava a fila: o áudio vai sem verificação', async () => {
		const { tts } = provedor();
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const quebrado: Ouvinte = async () => {
			throw new Error('audiotext 503: o reconhecedor de fonemas está desligado');
		};
		const r = await sintetizarConferido({ text: 'hi', voice: 'en-US', speed: 0.75 }, tts, quebrado);
		expect(r.qualidade).toBe('sem-verificacao');
		expect(r.audio[0]).toBe(1);
	});

	it('o provedor que não diz o que pretendia (o de mentira) nem chega a ser ouvido', async () => {
		const { tts } = provedor({ semFonemas: true });
		const ouvir = vi.fn(ouvinte(LIMPO));
		const r = await sintetizarConferido({ text: 'hi', voice: 'en-US', speed: 1 }, tts, ouvir);
		expect(r.qualidade).toBe('sem-verificacao');
		expect(ouvir).not.toHaveBeenCalled();
	});

	it('a linha do tempo que vai para o bucket é a da versão que foi para o bucket', async () => {
		const { tts } = provedor();
		const direta = await sintetizarConferido(
			{ text: "I don't know.", voice: 'en-US', speed: 1 },
			tts,
			ouvinte(LIMPO)
		);
		expect(direta.linha?.fala).toEqual([0.03, 0.4]);
		const esticada = await sintetizarConferido(
			{ text: "I don't know.", voice: 'en-US', speed: 0.75 },
			tts,
			ouvinte(COM_SILABA_A_MAIS)
		);
		expect(esticada.qualidade).toBe('esticada');
		expect(esticada.linha?.fala).toEqual([0.03, 0.5]);
	});
});
