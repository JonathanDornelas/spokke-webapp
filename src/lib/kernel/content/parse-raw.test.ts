import { describe, expect, it } from 'vitest';
import { parseRawMaterial, previewRawLines } from './parse-raw';
import { parseContentUnit } from './parse';

describe('parseRawMaterial', () => {
	it('lê uma frase por linha no formato que a tela mostra', () => {
		const raw = [
			'She has been working here since 2019. · Ela trabalha aqui desde 2019.',
			'I have already finished the report. · Eu já terminei o relatório.'
		].join('\n');

		const units = parseRawMaterial('SentencePair', raw);

		expect(units).toHaveLength(2);
		expect(parseContentUnit('SentencePair', units[0])).toEqual({
			target: 'She has been working here since 2019.',
			source: 'Ela trabalha aqui desde 2019.'
		});
	});

	it('ignora a linha que não tem o separador em vez de gravar material quebrado', () => {
		const raw = ['bom · good', 'linha sem separador'].join('\n');
		expect(parseRawMaterial('SentencePair', raw)).toHaveLength(1);
	});

	it('trata o bloco inteiro como um texto só', () => {
		const raw = 'A day in Lisbon\nThe tram climbs the hill.\nTourists take photos.';
		const [unit] = parseRawMaterial('Passage', raw);

		expect(parseContentUnit('Passage', unit)).toEqual({
			title: 'A day in Lisbon',
			text: 'The tram climbs the hill.\nTourists take photos.',
			questions: []
		});
	});

	it('lê "Falante: fala" no diálogo e alterna quando o professor não marca', () => {
		const comFalante = parseRawMaterial('Dialogue', 'Ana: Bom dia.\nJoão: Bom dia!');
		expect(parseContentUnit('Dialogue', comFalante[0]).lines[0]).toEqual({
			speaker: 'Ana',
			text: 'Bom dia.'
		});

		const semFalante = parseRawMaterial('Dialogue', 'Bom dia.\nBom dia!');
		expect(parseContentUnit('Dialogue', semFalante[0]).lines.map((l) => l.speaker)).toEqual([
			'A',
			'B'
		]);
	});

	it('não cria diálogo de uma fala só', () => {
		expect(parseRawMaterial('Dialogue', 'Bom dia.')).toEqual([]);
	});
});

describe('previewRawLines', () => {
	it('mostra cada linha com o que virou esquerda e direita, e marca a que não tem separador', () => {
		const raw = ['breakfast · café da manhã', 'afternoon', 'lunch | almoço'].join('\n');

		expect(previewRawLines(raw)).toEqual([
			{ text: 'breakfast · café da manhã', left: 'breakfast', right: 'café da manhã', ok: true },
			{ text: 'afternoon', left: 'afternoon', right: '', ok: false },
			{ text: 'lunch | almoço', left: 'lunch', right: 'almoço', ok: true }
		]);
	});

	it('concorda com o parser de verdade sobre quantas linhas viram material', () => {
		const raw = ['a · b', 'sem separador', 'c - d', '', 'e\tf'].join('\n');
		const ok = previewRawLines(raw).filter((l) => l.ok).length;
		expect(ok).toBe(parseRawMaterial('VocabItem', raw).length);
	});
});

/**
 * Com o tradutor ligado, colar a lista SÓ no idioma alvo é o caminho padrão
 * (docs/adr-006-traducao.md): a linha sem separador entra, com a tradução em
 * branco para o servidor preencher — e a prévia diz isso, linha por linha.
 */
describe('linha sem separador com o tradutor ligado', () => {
	const raw = ['I have a cat. · Eu tenho um gato.', 'She lives in Paris.'].join('\n');

	it('entra com a tradução em branco, e a que o professor escreveu fica', () => {
		expect(parseRawMaterial('SentencePair', raw, { traduzirSemSeparador: true })).toEqual([
			{ target: 'I have a cat.', source: 'Eu tenho um gato.' },
			{ target: 'She lives in Paris.', source: '' }
		]);
		expect(parseRawMaterial('VocabItem', 'bookshop', { traduzirSemSeparador: true })).toEqual([
			{ term: 'bookshop', translation: '' }
		]);
	});

	it('sem a opção, continua de fora — sem tradutor não há tradução', () => {
		expect(parseRawMaterial('SentencePair', raw)).toHaveLength(1);
	});

	it('a prévia marca a linha como automática, não como erro', () => {
		const [comSeparador, semSeparador] = previewRawLines(raw, { traduzirSemSeparador: true });
		expect(comSeparador).toMatchObject({ ok: true, right: 'Eu tenho um gato.' });
		expect(comSeparador.automatica).toBeUndefined();
		expect(semSeparador).toEqual({
			text: 'She lives in Paris.',
			left: 'She lives in Paris.',
			right: '',
			ok: true,
			automatica: true
		});
		expect(previewRawLines(raw)[1].ok).toBe(false);
	});

	it('texto e diálogo não mudam: lá não existe tradução por linha', () => {
		const bloco = 'Título\nUma frase.';
		expect(parseRawMaterial('Passage', bloco, { traduzirSemSeparador: true })).toEqual(
			parseRawMaterial('Passage', bloco)
		);
	});
});
