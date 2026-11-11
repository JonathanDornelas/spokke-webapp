import { describe, expect, it } from 'vitest';
import { MAXIMO_DE_FALA_S } from '$lib/billing/ia';
import {
	falaDoTrecho,
	formatarDuracao,
	lerWav,
	LIMITE_DO_AUDIO_BYTES,
	normalizarFala,
	problemaDoTrecho,
	reamostrar,
	segundosDoTrecho,
	TAXA_DA_FALA,
	tipoDaImagem,
	wavDaFala
} from './arquivo';

describe('o WAV da fala', () => {
	it('ida e volta: o que o navegador escreve, o servidor lê com a mesma duração', () => {
		const amostras = new Float32Array(TAXA_DA_FALA * 2.5).map((_, i) => Math.sin(i / 10));
		const wav = wavDaFala(amostras);
		expect(lerWav(wav)).toEqual({
			taxa: TAXA_DA_FALA,
			canais: 1,
			bits: 8,
			amostras: amostras.length,
			segundos: 2.5
		});
	});

	it('o silêncio é 128 e os extremos não passam de 0 e 255', () => {
		const wav = wavDaFala(new Float32Array([0, 1, -1, 3, -3]));
		expect([...wav.subarray(44)]).toEqual([128, 255, 1, 255, 1]);
	});

	it('dez minutos de fala cabem no limite do servidor e no BODY_SIZE_LIMIT de produção (10M)', () => {
		const bytes = 44 + TAXA_DA_FALA * MAXIMO_DE_FALA_S;
		expect(bytes).toBeLessThanOrEqual(LIMITE_DO_AUDIO_BYTES);
		expect(LIMITE_DO_AUDIO_BYTES).toBeLessThan(10 * 1024 * 1024);
	});

	it('recusa o que não é WAV PCM bem formado', () => {
		const bom = wavDaFala(new Float32Array(1000));
		expect(lerWav(new Uint8Array(10))).toBeNull();
		expect(
			lerWav(new TextEncoder().encode('não sou um wav, mas tenho mais de quarenta e quatro bytes'))
		).toBeNull();

		const comprimido = bom.slice();
		new DataView(comprimido.buffer).setUint16(20, 3, true); // ponto flutuante, não PCM
		expect(lerWav(comprimido)).toBeNull();

		// Um `data` que promete mais bytes do que chegaram inventaria duração (e cobrança).
		const mentiroso = bom.slice();
		new DataView(mentiroso.buffer).setUint32(40, 10_000_000, true);
		expect(lerWav(mentiroso)).toBeNull();

		const cortado = bom.slice(0, 500);
		expect(lerWav(cortado)).toBeNull();
	});

	it('pula blocos que não são fmt nem data, com o byte de enchimento dos tamanhos ímpares', () => {
		const bom = wavDaFala(new Float32Array(800));
		const extra = new Uint8Array([...new TextEncoder().encode('LIST'), 3, 0, 0, 0, 1, 2, 3, 0]);
		const comExtra = new Uint8Array(bom.length + extra.length);
		comExtra.set(bom.subarray(0, 36));
		comExtra.set(extra, 36);
		comExtra.set(bom.subarray(36), 36 + extra.length);
		expect(lerWav(comExtra)?.amostras).toBe(800);
	});
});

describe('tipoDaImagem, pelos bytes', () => {
	it('reconhece JPEG, PNG e WebP, e nada além deles', () => {
		expect(tipoDaImagem(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0]))).toBe('image/jpeg');
		expect(tipoDaImagem(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe(
			'image/png'
		);
		const webp = new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 ');
		expect(tipoDaImagem(webp)).toBe('image/webp');
		expect(
			tipoDaImagem(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg">'))
		).toBeNull();
		expect(tipoDaImagem(wavDaFala(new Float32Array(10)))).toBeNull();
	});
});

describe('o trecho do vídeo', () => {
	it('lê os formatos que o professor escreve', () => {
		expect(segundosDoTrecho('')).toBeNull();
		expect(segundosDoTrecho('  ')).toBeNull();
		expect(segundosDoTrecho('90')).toBe(90);
		expect(segundosDoTrecho('2:30')).toBe(150);
		expect(segundosDoTrecho('02:30')).toBe(150);
		expect(segundosDoTrecho('1:02:30')).toBe(3750);
	});

	it('recusa o que não é tempo', () => {
		expect(segundosDoTrecho('2:75')).toBe(false);
		expect(segundosDoTrecho('abc')).toBe(false);
		expect(segundosDoTrecho('1:2:3:4')).toBe(false);
		expect(segundosDoTrecho('-5')).toBe(false);
	});

	it('formata a duração como o campo espera', () => {
		expect(formatarDuracao(150)).toBe('2:30');
		expect(formatarDuracao(5)).toBe('0:05');
		expect(formatarDuracao(3723)).toBe('1:02:03');
	});

	it('junta os canais e corta o trecho, sem mexer no original', () => {
		const esquerda = new Float32Array([1, 1, 1, 1]);
		const direita = new Float32Array([0, 0, 0, 0]);
		const trecho = falaDoTrecho([esquerda, direita], 2, 0.5, 1.5);
		expect([...trecho]).toEqual([0.5, 0.5]);
		expect([...esquerda]).toEqual([1, 1, 1, 1]);
		expect(falaDoTrecho([esquerda], 2, 0, null).length).toBe(4);
	});

	it('diz o que impede o trecho, e nada quando ele serve', () => {
		expect(problemaDoTrecho(300, 0, null)).toBeNull();
		expect(problemaDoTrecho(300, 30, 180)).toBeNull();
		expect(problemaDoTrecho(300, 400, null)).toContain('o início passa do fim');
		expect(problemaDoTrecho(300, 100, 50)).toContain('depois do início');
		// Um vídeo de 14 minutos inteiro passa do teto de 10; escolhendo o trecho, cabe.
		expect(problemaDoTrecho(840, 0, null)).toContain('até 10 minutos');
		expect(problemaDoTrecho(840, 0, 600)).toBeNull();
		// O fim depois do fim do vídeo vale como "até o fim".
		expect(problemaDoTrecho(300, 0, 9999)).toBeNull();
	});

	it('reamostra quando o navegador decodifica em outra taxa, com a duração preservada', () => {
		const tres = reamostrar(new Float32Array(48_000 * 2).fill(0.5), 48_000, TAXA_DA_FALA);
		expect(tres.length).toBe(TAXA_DA_FALA * 2);
		expect(tres[100]).toBeCloseTo(0.5, 5);
		// 44,1 kHz não é múltiplo de 16 kHz: a duração ainda fecha.
		expect(reamostrar(new Float32Array(44_100), 44_100, TAXA_DA_FALA).length).toBe(TAXA_DA_FALA);
		// A média da janela corta o agudo que viraria chiado: um sinal alternado vira quase zero.
		const agudo = new Float32Array(48_000).map((_, i) => (i % 2 ? 1 : -1));
		expect(Math.abs(reamostrar(agudo, 48_000, TAXA_DA_FALA)[10])).toBeLessThan(0.34);
		const mesma = new Float32Array([1, 2, 3]);
		expect(reamostrar(mesma, 16_000, 16_000)).toBe(mesma);
	});

	it('normaliza o pico com ganho limitado, e o silêncio continua silêncio', () => {
		expect(Math.max(...normalizarFala(new Float32Array([0.1, -0.5])))).toBeCloseTo(0.19, 5);
		expect(Math.min(...normalizarFala(new Float32Array([0.1, -0.5])))).toBeCloseTo(-0.95, 5);
		// Pico de 0,001 pediria ganho de 950; o teto é 20.
		expect(normalizarFala(new Float32Array([0.001]))[0]).toBeCloseTo(0.02, 5);
		expect([...normalizarFala(new Float32Array([0, 0]))]).toEqual([0, 0]);
	});
});
