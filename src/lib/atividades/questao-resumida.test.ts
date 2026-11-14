import { describe, expect, it } from 'vitest';
import { umaPorHabilidade, type QuestaoResumida } from './questao-resumida';

const questao = (
	id: string,
	habilidade: QuestaoResumida['habilidade'],
	entra = true
): QuestaoResumida => ({
	id,
	habilidade,
	legenda: id,
	corpo: { forma: 'falar', frase: id },
	entra
});

describe('umaPorHabilidade', () => {
	it('um exemplo de cada tipo, na ordem do desenho', () => {
		const previa = umaPorHabilidade([
			questao('montar', 'leitura'),
			questao('digitar', 'escrita'),
			questao('ouvir-montar', 'escuta'),
			questao('ouvir-digitar', 'escuta'),
			questao('ouvir-escolher', 'escuta'),
			questao('lacuna', 'escrita'),
			questao('falar', 'fala')
		]);
		expect(previa.map((q) => q.id)).toEqual(['ouvir-montar', 'falar', 'montar', 'digitar']);
	});

	it('entre as da mesma habilidade, fica a que entra com os tipos de agora', () => {
		const previa = umaPorHabilidade([
			questao('digitar', 'escrita', false),
			questao('lacuna', 'escrita', true)
		]);
		expect(previa.map((q) => q.id)).toEqual(['lacuna']);
	});

	it('o tipo desligado continua à vista, apagado; o que o material não rende, não', () => {
		const previa = umaPorHabilidade([
			questao('montar', 'leitura'),
			questao('ouvir-montar', 'escuta', false)
		]);
		expect(previa.map((q) => [q.id, q.entra])).toEqual([
			['ouvir-montar', false],
			['montar', true]
		]);
	});
});
