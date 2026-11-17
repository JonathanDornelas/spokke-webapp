import { describe, expect, it } from 'vitest';
import { MAX_VARIACOES_DA_IA, validarProposta } from './schemas';
import { instrucoesDoSistema } from './prompt';

/**
 * O que a IA propõe passa pela MESMA conferência do resto (kernel.md
 * "Conferência de qualidade"): a proposta que "traduz" repetindo o original é
 * descartada (e estornada, em `gerarPropostas`), e as variações da tradução
 * entram limpas.
 */

const tags = { alvo: 'es-ES', origem: 'pt-BR' };

describe('validarProposta — a tradução que repete o original', () => {
	it('descarta o vocabulário com o sentido igual ao termo (a "la cometa")', () => {
		expect(
			validarProposta('VocabItem', { term: 'la cometa', translation: 'La cometa' }, tags)
		).toBeNull();
		expect(
			validarProposta('VocabItem', { term: 'la cometa', translation: 'a pipa' }, tags)
		).toEqual({
			term: 'la cometa',
			translation: 'a pipa'
		});
	});

	it('descarta o par de frases com a tradução igual à frase', () => {
		expect(
			validarProposta('SentencePair', { target: 'Me gusta leer.', source: 'Me gusta leer' }, tags)
		).toBeNull();
	});

	it('sem os idiomas (a biblioteca "sem idioma"), compara pela forma Unicode', () => {
		const semIdioma = { alvo: 'und', origem: 'und' };
		expect(
			// As duas formas do mesmo acento: a pré-composta e a decomposta (e + acento).
			validarProposta(
				'SentencePair',
				{ target: 'café'.normalize('NFC'), source: 'café'.normalize('NFD') },
				semIdioma
			)
		).toBeNull();
		expect(
			validarProposta('SentencePair', { target: 'café', source: 'coffee' }, semIdioma)
		).not.toBeNull();
	});

	it('atividade de um idioma só não tem o que traduzir: a regra não vale', () => {
		const umSo = { alvo: 'pt-BR', origem: 'pt-BR' };
		expect(
			validarProposta('VocabItem', { term: 'casa', translation: 'casa' }, umSo)
		).not.toBeNull();
	});
});

describe('validarProposta — as variações da tradução', () => {
	const proposta = (variants: unknown) => ({
		target: 'She will call you later.',
		source: 'Ela vai ligar para você mais tarde.',
		variants
	});
	const ingles = { alvo: 'en-US', origem: 'pt-BR' };

	it('entram limpas: aparadas, sem vazias, sem repetir a tradução nem a frase original', () => {
		expect(
			validarProposta(
				'SentencePair',
				proposta([
					'  Ela vai te ligar mais tarde. ',
					'',
					'Ela vai ligar para você mais tarde.',
					'She will call you later.',
					'Ela te liga mais tarde.'
				]),
				ingles
			)
		).toEqual({
			target: 'She will call you later.',
			source: 'Ela vai ligar para você mais tarde.',
			variants: ['Ela vai te ligar mais tarde.', 'Ela te liga mais tarde.']
		});
	});

	it('têm teto', () => {
		const muitas = Array.from({ length: 9 }, (_, i) => `variação ${i}`);
		const dados = validarProposta('SentencePair', proposta(muitas), ingles) as {
			variants: string[];
		};
		expect(dados.variants).toHaveLength(MAX_VARIACOES_DA_IA);
	});

	it('sem nenhuma, a chave nem é gravada: o material fica igual ao digitado sem variações', () => {
		for (const variants of [[], undefined, ['Ela vai ligar para você mais tarde.']]) {
			expect(validarProposta('SentencePair', proposta(variants), ingles)).toEqual({
				target: 'She will call you later.',
				source: 'Ela vai ligar para você mais tarde.'
			});
		}
	});

	it('uma variação vazia não derruba a proposta inteira', () => {
		expect(validarProposta('SentencePair', proposta(['', '   ']), ingles)).not.toBeNull();
	});

	it('o pedido à IA diz para mandar as variações', () => {
		const sistema = instrucoesDoSistema({
			kind: 'SentencePair',
			quantos: 5,
			pedido: 'frases de viagem',
			idiomaAlvo: 'Inglês (EUA)',
			idiomaOrigem: 'Português (Brasil)'
		});
		expect(sistema).toContain('"variants"');
		expect(sistema).toContain(`até ${MAX_VARIACOES_DA_IA} outras traduções`);
	});
});
