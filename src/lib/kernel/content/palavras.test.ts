import { describe, expect, it } from 'vitest';
import { palavrasParaAssociar } from './palavras';
import { enUS } from '../language/profiles/en-US';
import { jaJP } from '../language/profiles/ja-JP';
import { ptBR } from '../language/profiles/pt-BR';

/**
 * A metade pura do fecho por palavras: QUAIS palavras das frases valem um
 * "ligue os pares". Sem lista de artigo ou preposição de idioma nenhum — só o
 * que vale em toda língua (`palavras.ts` explica cada regra).
 */
describe('palavrasParaAssociar', () => {
	it('tira número e nome próprio, e põe em minúscula a palavra do começo da frase', () => {
		const palavras = palavrasParaAssociar(['Yesterday Maria visited Paris in 2019.'], enUS);
		expect(palavras).toContain('yesterday');
		expect(palavras).toContain('visited');
		expect(palavras).not.toContain('Maria');
		expect(palavras).not.toContain('Paris');
		expect(palavras.some((p) => /\d/.test(p))).toBe(false);
	});

	it('palavra que aparece em mais da metade das frases é de função e sai', () => {
		const palavras = palavrasParaAssociar(
			[
				'The station is near the hotel.',
				'The thesis was finished in March.',
				'The library opens on Sunday.'
			],
			enUS
		);
		expect(palavras).not.toContain('the');
		// A mais longa primeiro: palavra de conteúdo tende a ser mais longa.
		expect(palavras[0]).toBe('finished');
	});

	it('japonês não tem espaço: as palavras saem do segmentador do idioma', () => {
		const palavras = palavrasParaAssociar(['私は毎朝七時に起きます。'], jaJP);
		expect(palavras.length).toBeGreaterThan(1);
		// Nenhuma "palavra" é a frase inteira — seria o erro do split por espaço.
		expect(palavras).not.toContain('私は毎朝七時に起きます');
		expect(palavras.every((p) => !/[。、]/.test(p))).toBe(true);
	});

	it('acento composto e pré-composto são a MESMA palavra', () => {
		const composto = 'café';
		const precomposto = 'café';
		const palavras = palavrasParaAssociar(
			[`Eu tomei ${composto} quente.`, `O ${precomposto} esfriou rápido.`],
			ptBR
		);
		expect(palavras.filter((p) => p.normalize('NFC') === 'café')).toHaveLength(1);
	});

	it('é determinístico e respeita o limite', () => {
		const frases = ['She has been working on her thesis since March.'];
		expect(palavrasParaAssociar(frases, enUS, 3)).toEqual(palavrasParaAssociar(frases, enUS, 3));
		expect(palavrasParaAssociar(frases, enUS, 3)).toHaveLength(3);
	});
});
