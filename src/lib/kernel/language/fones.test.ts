import { describe, expect, it } from 'vitest';
import { distanciaEntreFones, ehVogalCurta, ehVogalReduzida, segmentar, tracosDe } from './fones';

describe('segmentar: um símbolo do reconhecedor em sons', () => {
	it('separa o que o reconhecedor escreve junto', () => {
		expect(segmentar('ɔːɹ')).toEqual(['ɔː', 'ɹ']);
		expect(segmentar('əl')).toEqual(['ə', 'l']);
		expect(segmentar('aɪɚ')).toEqual(['aɪ', 'ɚ']);
	});

	it('mantém num som só o ditongo e a africada', () => {
		expect(segmentar('aɪ')).toEqual(['aɪ']);
		expect(segmentar('oʊ')).toEqual(['oʊ']);
		expect(segmentar('tʃ')).toEqual(['tʃ']);
		expect(segmentar('dʒ')).toEqual(['dʒ']);
	});

	it('tira o que não é som: tom, marca de sílaba, aspiração; e lê o X-SAMPA', () => {
		expect(segmentar('ɑu5')).toEqual(['ɑu']);
		expect(segmentar('s.')).toEqual(['s']);
		expect(segmentar('kʰ')).toEqual(['k']);
		expect(segmentar('l̩')).toEqual(['l']);
		expect(segmentar('dZ')).toEqual(['dʒ']);
		expect(segmentar('??')).toEqual([]);
	});

	it('guarda comprimento e nasalidade, que são traços', () => {
		expect(segmentar('iː')).toEqual(['iː']);
		expect(segmentar('ɑ̃')).toEqual(['ɑ̃']);
		const nasal = tracosDe('ɑ̃');
		expect(nasal?.tipo === 'vogal' && nasal.nasal).toBe(true);
	});
});

describe('distanciaEntreFones', () => {
	it('o mesmo som é 0, e som desconhecido está a 1 de tudo', () => {
		expect(distanciaEntreFones('ɹ', 'ɹ')).toBe(0);
		expect(distanciaEntreFones('ɹ', '??')).toBe(1);
	});

	it('ship e sheep são vizinhos; ship e "shep" estão mais longe', () => {
		const sheep = distanciaEntreFones('ɪ', 'iː');
		expect(sheep).toBeGreaterThan(0.12);
		expect(sheep).toBeLessThanOrEqual(0.35);
		expect(distanciaEntreFones('ɪ', 'ɛ')).toBeGreaterThan(sheep);
		// Só o comprimento é quase nada.
		expect(distanciaEntreFones('i', 'iː')).toBeLessThanOrEqual(0.06);
	});

	it('"fink" é vizinho de "think"; "tink" e o "r" de "rato" não', () => {
		expect(distanciaEntreFones('θ', 'f')).toBeLessThanOrEqual(0.35);
		expect(distanciaEntreFones('θ', 't')).toBeGreaterThan(0.35);
		expect(distanciaEntreFones('ɹ', 'h')).toBe(1);
		expect(distanciaEntreFones('ɹ', 'x')).toBeGreaterThan(0.9);
		// O tepe e a vibrante, o "r" do espanhol, ficam perto do [ɹ].
		expect(distanciaEntreFones('ɹ', 'ɾ')).toBeLessThanOrEqual(0.35);
	});

	it('vozeamento sozinho é a menor troca de consoante', () => {
		expect(distanciaEntreFones('s', 'z')).toBe(0.12);
		expect(distanciaEntreFones('θ', 'ð')).toBe(0.12);
		expect(distanciaEntreFones('v', 'b')).toBeGreaterThan(0.35);
	});

	it('o ditongo dito como vogal simples perde o deslize', () => {
		expect(distanciaEntreFones('eɪ', 'e')).toBe(0.25);
		expect(distanciaEntreFones('aɪ', 'iː')).toBeGreaterThan(0.35);
	});

	it('a semivogal fica perto da vogal dela, e longe do resto', () => {
		expect(distanciaEntreFones('j', 'i')).toBe(0.35);
		expect(distanciaEntreFones('w', 'u')).toBe(0.35);
		expect(distanciaEntreFones('j', 'a')).toBe(1);
	});
});

describe('as vogais curtas e as reduzidas', () => {
	it('reduzida é a central curta: o [ə] e os vizinhos dele', () => {
		expect(['ə', 'ᵻ', 'ɨ', 'ɐ', 'ɚ'].every(ehVogalReduzida)).toBe(true);
		expect(['i', 'ʌ', 'ɑː', 't'].some(ehVogalReduzida)).toBe(false);
	});

	it('curta é a vogal sem comprimento', () => {
		expect(ehVogalCurta('i')).toBe(true);
		expect(ehVogalCurta('iː')).toBe(false);
		expect(ehVogalCurta('aɪ')).toBe(false);
	});
});
