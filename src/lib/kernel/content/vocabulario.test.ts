import { describe, expect, it } from 'vitest';
import { MAX_PALAVRAS_DO_TERMO, problemaDoVocabulario } from './vocabulario';
import { parseRawMaterial, previewRawLines } from './parse-raw';

const EN = { alvo: 'en-US', origem: 'pt-BR' };
const problema = (term: string, translation = 'sentido', tags = EN) =>
	problemaDoVocabulario({ term, translation }, tags);

describe('problemaDoVocabulario: palavra ou expressão curta, nunca frase', () => {
	it('aceita a palavra e a expressão de até três palavras', () => {
		expect(MAX_PALAVRAS_DO_TERMO).toBe(3);
		for (const termo of ['bread', 'ice cream', 'look forward to', "don't", 'Mr.', 'e.g.']) {
			expect(problema(termo), termo).toBeNull();
		}
	});

	it('recusa a frase: mais de três palavras, ou a pontuação de frase', () => {
		expect(problema('I look forward to it')).toMatch(/até 3 palavras/);
		expect(problema('How are you?')).toMatch(/pontuação de frase/);
		expect(problema('Thank you!')).toMatch(/pontuação de frase/);
		// Ponto final em duas palavras ou mais é frase; numa abreviação, não.
		expect(problema('I agree.')).toMatch(/pontuação de frase/);
	});

	it('conta palavras pelo segmentador do idioma, não pelo espaço (regra nº 5)', () => {
		const JA = { alvo: 'ja-JP', origem: 'pt-BR' };
		expect(problema('図書館', 'biblioteca', JA)).toBeNull();
		// "私は学生です。" não tem espaço nenhum, e são quatro palavras.
		expect(problema('私は学生です。', 'eu sou estudante', JA)).not.toBeNull();
		expect(problema('你好吗？', 'como vai?', { alvo: 'zh-CN', origem: 'pt-BR' })).not.toBeNull();
		expect(problema('كيف حالك؟', 'como vai?', { alvo: 'ar-SA', origem: 'pt-BR' })).not.toBeNull();
	});

	it('o sentido também não leva pontuação de frase, e pode ter mais palavras', () => {
		expect(problema('breakfast', 'café da manhã')).toBeNull();
		expect(problema('bread', 'o pão.')).toMatch(/sentido/);
		expect(problema('bread', 'pão?')).toMatch(/sentido/);
	});
});

describe('a lista colada de vocabulário', () => {
	const lista = 'bread · pão\nHow are you? · Como vai?\nkitchen · cozinha';

	it('a prévia risca a frase com o motivo, e o parser a deixa de fora', () => {
		const linhas = previewRawLines(lista, { vocabulario: EN });
		expect(linhas.map((l) => l.ok)).toEqual([true, false, true]);
		expect(linhas[1]!.motivo).toMatch(/pontuação de frase/);
		const unidades = parseRawMaterial('VocabItem', lista, { vocabulario: EN });
		expect(unidades).toEqual([
			{ term: 'bread', translation: 'pão' },
			{ term: 'kitchen', translation: 'cozinha' }
		]);
	});

	it('sem as tags (o par de frases, e quem não pediu a regra) nada muda', () => {
		expect(previewRawLines(lista).every((l) => l.ok)).toBe(true);
		expect(parseRawMaterial('VocabItem', lista)).toHaveLength(3);
	});
});
