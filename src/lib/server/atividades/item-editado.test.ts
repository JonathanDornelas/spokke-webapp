import { describe, expect, it } from 'vitest';
import { montarItemEditado, type EdicaoDoItem } from './item-editado';
import { readableAnswerKey } from '$lib/server/studio/answer-key';

/** "Traduza a frase": lê em inglês, escreve em PORTUGUÊS (`answerLang: 'source'`). */
const traduza = {
	prompt: { kind: 'text', text: 'She is late.', instructionKey: 'translate-to-source' },
	interaction: { type: 'type', payload: { accepted: ['Ela está atrasada.'] } },
	grading: { mode: 'tolerant', tolerance: 0.9, answerLang: 'source' }
};

/** "Ouça e escreva": o texto do áudio é a resposta. */
const ouca = {
	prompt: {
		kind: 'audio',
		text: 'She is late.',
		mediaId: 'med_1',
		instructionKey: 'listen-and-type'
	},
	interaction: { type: 'type', payload: { accepted: ['She is late.'] } },
	grading: { mode: 'tolerant', tolerance: 0.9 }
};

/** "Ouça e monte": as peças saíram do texto do áudio. */
const monte = {
	prompt: { kind: 'audio', text: 'She is late', instructionKey: 'listen-and-assemble' },
	interaction: {
		type: 'assemble',
		payload: { tokens: ['She', 'is', 'late'], distractors: [], accepted: [['She', 'is', 'late']] }
	},
	grading: { mode: 'sequence' }
};

const sem = (base: Partial<EdicaoDoItem>): EdicaoDoItem => ({
	interaction: 'type',
	gradingMode: 'tolerant',
	...base
});

describe('montarItemEditado', () => {
	it('salvar sem mudar nada PRESERVA a língua da resposta e o resto da correção', () => {
		const r = montarItemEditado(
			traduza,
			sem({
				payload: JSON.stringify({ accepted: ['Ela está atrasada.'] }),
				promptText: 'She is late.',
				instruction: 'Traduza a frase.'
			})
		);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		// O bug: gravava `{ mode }` e a resposta em português passava a ser
		// corrigida com as regras do inglês (e ganhava o teclado do inglês).
		expect(r.grading).toEqual({ mode: 'tolerant', tolerance: 0.9, answerLang: 'source' });
	});

	it('o enunciado igual ao padrão não é gravado como texto do professor', () => {
		const r = montarItemEditado(
			traduza,
			sem({
				payload: JSON.stringify({ accepted: ['x'] }),
				promptText: 'She is late.',
				instruction: 'Traduza a frase.'
			})
		);
		expect(r.ok && r.prompt.instruction).toBe(undefined);
		const p = montarItemEditado(
			traduza,
			sem({
				payload: JSON.stringify({ accepted: ['x'] }),
				promptText: 'She is late.',
				instruction: 'Traduza para o português.'
			})
		);
		expect(p.ok && p.prompt.instruction).toBe('Traduza para o português.');
	});

	it('o texto que é a própria questão não pode ser apagado', () => {
		const r = montarItemEditado(
			traduza,
			sem({ payload: JSON.stringify({ accepted: ['x'] }), promptText: '  ' })
		);
		expect(r.ok).toBe(false);
	});

	it('o que o formulário não edita no prompt fica (o mediaId)', () => {
		const r = montarItemEditado(
			ouca,
			sem({ payload: JSON.stringify({ accepted: ['She is late.'] }), promptText: 'She is late.' })
		);
		expect(r.ok && r.prompt.mediaId).toBe('med_1');
		expect(r.ok && r.audioMudou).toBe(false);
	});

	it('mudar o texto de um áudio avisa que o arquivo antigo não serve mais', () => {
		const r = montarItemEditado(
			ouca,
			sem({ payload: JSON.stringify({ accepted: ['She was late.'] }), promptText: 'She was late.' })
		);
		expect(r.ok && r.audioMudou).toBe(true);
	});

	it('áudio sem texto é recusado — é dele que o áudio sai', () => {
		const r = montarItemEditado(
			ouca,
			sem({ payload: JSON.stringify({ accepted: ['x'] }), promptText: ' ' })
		);
		expect(r.ok).toBe(false);
	});

	it('"digitar" em inglês vira lacuna, com o enunciado padrão da lacuna', () => {
		const r = montarItemEditado(
			ouca,
			sem({
				interaction: 'cloze',
				payload: JSON.stringify({ masked: 'She ___ late.', accepted: ['is'] }),
				promptText: 'She is late.',
				instruction: 'Ouça e escreva o que você ouviu.'
			})
		);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.interaction.type).toBe('cloze');
		expect(r.prompt.instructionKey).toBe('fill-the-blank');
		// O enunciado do tipo antigo, escrito à mão, fica — é texto do professor.
		expect(r.prompt.instruction).toBe('Ouça e escreva o que você ouviu.');
	});

	it('"traduza para o português" não vira lacuna', () => {
		const r = montarItemEditado(
			traduza,
			sem({
				interaction: 'cloze',
				payload: JSON.stringify({ masked: '___ late', accepted: ['x'] })
			})
		);
		expect(r.ok).toBe(false);
	});

	it('lacuna sem ___ é recusada', () => {
		const r = montarItemEditado(
			ouca,
			sem({
				interaction: 'cloze',
				payload: JSON.stringify({ masked: 'She is late.', accepted: ['is'] })
			})
		);
		expect(r.ok).toBe(false);
	});

	it('correção que não vale para o tipo é recusada', () => {
		const pl = JSON.stringify({ accepted: ['She is late.'] });
		expect(
			montarItemEditado(ouca, sem({ payload: pl, promptText: 'She is late.', gradingMode: 'asr' }))
				.ok
		).toBe(false);
		expect(
			montarItemEditado(
				ouca,
				sem({ payload: pl, promptText: 'She is late.', gradingMode: 'rubric' })
			).ok
		).toBe(true);
		const lacuna = JSON.stringify({ masked: 'She ___ late.', accepted: ['is'] });
		expect(
			montarItemEditado(
				ouca,
				sem({ interaction: 'cloze', payload: lacuna, promptText: 'x', gradingMode: 'rubric' })
			).ok
		).toBe(false);
	});

	it('em "monte a frase" o gabarito e o texto do áudio ficam como o gerador fez', () => {
		const r = montarItemEditado(monte, {
			interaction: 'assemble',
			gradingMode: 'sequence',
			payload: JSON.stringify({ tokens: ['x'], distractors: [], accepted: [['x']] }),
			promptText: 'Outra frase qualquer'
		});
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.interaction.payload).toEqual(monte.interaction.payload);
		expect(r.prompt.text).toBe('She is late');
	});

	it('não deixa virar um tipo cujo gabarito o editor não monta', () => {
		const r = montarItemEditado(ouca, sem({ interaction: 'choice', promptText: 'She is late.' }));
		expect(r.ok).toBe(false);
	});

	it('gabarito que não é JSON vira erro escrito, não 500', () => {
		const r = montarItemEditado(ouca, sem({ payload: '{quebrado', promptText: 'She is late.' }));
		expect(r).toEqual({ ok: false, error: expect.any(String) });
	});
});

describe('readableAnswerKey', () => {
	it('as variantes são o que é aceito ALÉM da resposta principal', () => {
		// Com a principal repetida nas variantes, corrigir "teh" para "the" no
		// editor deixava "teh" aceito.
		expect(readableAnswerKey('type', { accepted: ['the', 'thee'] })).toEqual({
			answer: 'the',
			variants: ['thee']
		});
		expect(readableAnswerKey('choice', { options: ['a', 'b'], correctIndex: 1 })).toEqual({
			answer: 'b',
			variants: []
		});
	});
});
