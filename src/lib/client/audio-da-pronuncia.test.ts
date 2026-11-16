import { describe, expect, it } from 'vitest';
import {
	atrasoDoDecodificador,
	comecoDaFala,
	passoNoTempo,
	trechoDaSilaba
} from './audio-da-pronuncia';
import { passosDaBoca, pronunciaDe } from '$lib/kernel/language/pronuncia';
import { enUS } from '$lib/kernel/language/profiles/en-US';
import type { Trecho } from '$lib/kernel/language/sintese';

/**
 * A boca e a sílaba no tempo do áudio: "priority" com a linha do tempo que o
 * serviço de áudio devolveu (um trecho por fonema do dicionário).
 */
const PRIORITY = pronunciaDe('P R AY0 AO1 R AH0 T IY0'.split(' '), enUS.pronuncia!);
const PASSOS = passosDaBoca(PRIORITY, enUS.pronuncia!);
const FONES: Trecho[] = [
	[0, 0.041],
	[0.041, 0.116],
	[0.116, 0.191],
	[0.191, 0.291],
	[0.291, 0.341],
	[0.341, 0.416],
	[0.416, 0.491],
	[0.491, 0.674]
];

describe('passoNoTempo: a boca mostra o som que está tocando', () => {
	it('cada instante cai no fonema dele', () => {
		expect(passoNoTempo(PASSOS, FONES, 0.02)?.fonema).toBe(0); // p
		expect(passoNoTempo(PASSOS, FONES, 0.25)?.fonema).toBe(3); // ɔ
		expect(passoNoTempo(PASSOS, FONES, 0.6)?.fonema).toBe(7); // i
	});

	it('o ditongo anda pelos dois formatos, cada um na sua metade', () => {
		// "aɪ" (0,116–0,191) tem dois passos.
		const doAi = PASSOS.filter((p) => p.fonema === 2);
		expect(doAi).toHaveLength(2);
		expect(passoNoTempo(PASSOS, FONES, 0.12)).toBe(doAi[0]);
		expect(passoNoTempo(PASSOS, FONES, 0.18)).toBe(doAi[1]);
	});

	it('antes da fala e depois dela, a boca descansa', () => {
		expect(passoNoTempo(PASSOS, FONES, 0.7)).toBeNull();
		expect(passoNoTempo(PASSOS, FONES, -0.01)).toBeNull();
	});
});

describe('trechoDaSilaba: do começo do primeiro fonema ao fim do último', () => {
	it('"prai · aw · ruh · tee"', () => {
		expect(trechoDaSilaba(PASSOS, FONES, 0)).toEqual([0, 0.191]);
		expect(trechoDaSilaba(PASSOS, FONES, 1)).toEqual([0.191, 0.291]);
		expect(trechoDaSilaba(PASSOS, FONES, 2)).toEqual([0.291, 0.416]);
		expect(trechoDaSilaba(PASSOS, FONES, 3)).toEqual([0.416, 0.674]);
		expect(trechoDaSilaba(PASSOS, FONES, 4)).toBeNull();
	});
});

describe('o atraso do decodificador de MP3', () => {
	const taxa = 48_000;
	/** Silêncio até `comeco` segundos, e uma vogal depois. */
	function audio(comeco: number, total = 0.5): Float32Array {
		const amostras = new Float32Array(Math.round(total * taxa));
		for (let i = Math.round(comeco * taxa); i < amostras.length; i++) {
			amostras[i] = 0.4 * Math.sin((2 * Math.PI * 220 * i) / taxa);
		}
		return amostras;
	}

	it('acha onde a fala começa pelo mesmo critério do serviço', () => {
		expect(comecoDaFala(audio(0.03), taxa)).toBeCloseTo(0.026, 2);
		expect(comecoDaFala(new Float32Array(4800), taxa)).toBeNull();
	});

	it('o enchimento que o decodificador deixou na frente vira o atraso de todos os trechos', () => {
		// O serviço disse que a fala começa em 0,03 s; decodificado, ela começa em 0,076.
		const atraso = atrasoDoDecodificador(audio(0.076), taxa, [0.03, 0.4]);
		expect(atraso).toBeCloseTo(0.046, 2);
		// Sem enchimento, nada a corrigir.
		expect(Math.abs(atrasoDoDecodificador(audio(0.03), taxa, [0.026, 0.4]))).toBeLessThan(0.004);
	});

	it('sem a fala da linha, ou com uma diferença absurda, não corrige nada', () => {
		expect(atrasoDoDecodificador(audio(0.076), taxa, null)).toBe(0);
		expect(atrasoDoDecodificador(audio(0.4), taxa, [0.03, 0.45])).toBe(0);
	});
});
