import { describe, expect, it } from 'vitest';
import { tolerantScore, wordSimilarity } from './compare';
import { ptBR } from '../language/profiles/pt-BR';
import { enUS } from '../language/profiles/en-US';
import { jaJP } from '../language/profiles/ja-JP';

/**
 * A correção tolerante — a que decide se o aluno errou ou só escorregou.
 *
 * O que estes testes fixam é a REGRA DE PROXIMIDADE: espaço e pontuação não são
 * erro de idioma, e um deslize numa palavra curta pesa o mesmo que um deslize
 * numa frase longa.
 */

const estado = (valor: number) => (valor >= 1 ? 'certo' : valor > 0 ? 'quase' : 'errado');

describe('tolerantScore', () => {
	it('aceita a resposta exata', () => {
		expect(tolerantScore('lives', ['lives'], enUS).value).toBe(1);
	});

	// Dois toques na barra, ou o espaço que sobra depois de `strip-punct` comer
	// uma vírgula. Nada disso é erro de língua.
	it('ignora espaço a mais, a menos e nas pontas', () => {
		for (const resposta of [
			'She has  been working',
			'  She has been working',
			'She has been working  ',
			'She\thas been working'
		]) {
			expect(estado(tolerantScore(resposta, ['She has been working'], enUS).value)).toBe('certo');
		}
	});

	// `strip-punct` já cuidava disto; o teste existe para não voltar atrás.
	it('ignora pontuação onde o profile pede', () => {
		expect(estado(tolerantScore('Ela mora aqui.', ['Ela mora aqui'], ptBR).value)).toBe('certo');
	});

	// A razão sozinha punia quem responde CURTO: uma letra a menos em "lives"
	// dava 0,8 e caía em errado seco, enquanto a mesma letra numa frase de
	// trinta caracteres passava tranquila.
	it('dá parcial para um deslize em palavra curta', () => {
		expect(estado(tolerantScore('live', ['lives'], enUS).value)).toBe('quase');
		expect(estado(tolerantScore('reports', ['report'], enUS).value)).toBe('quase');
	});

	// pt-BR é `significant`: acento conta. Mas faltar UM acento é escorregão,
	// não desconhecimento — e o feedback já diz qual era a resposta.
	it('dá parcial para acento faltando onde o acento é significativo', () => {
		const r = tolerantScore('voce', ['você'], ptBR);
		expect(estado(r.value)).toBe('quase');
		expect(r.feedback).toContain('você');
	});

	// O limite existe: sem ele "quase" viraria sinônimo de "respondeu alguma
	// coisa", e a nota parcial perderia o sentido.
	it('não chama de "quase" o que não tem relação com a resposta', () => {
		expect(estado(tolerantScore('banana', ['lives'], enUS).value)).toBe('errado');
		expect(estado(tolerantScore('', ['lives'], enUS).value)).toBe('errado');
	});

	// Abaixo de quatro caracteres não há margem: um caractere de diferença é a
	// palavra inteira, não um dedo torto.
	it('não perdoa nada em resposta de uma letra', () => {
		expect(estado(tolerantScore('a', ['o'], enUS).value)).toBe('errado');
	});

	it('vale a MAIS generosa das duas réguas', () => {
		// Três deslizes numa frase de 25 caracteres: passa pela distância.
		expect(
			estado(tolerantScore('Eu ja termineu o relatoro', ['Eu já terminei o relatório'], ptBR).value)
		).toBe('quase');
	});

	// Idioma sem espaço entre palavras não tem o que colapsar — e a regra de
	// proximidade continua valendo igual (testing.md exige o caso).
	it('funciona em japonês', () => {
		expect(estado(tolerantScore('駅はどこですか', ['駅はどこですか'], jaJP).value)).toBe('certo');
		expect(estado(tolerantScore('駅はどこです', ['駅はどこですか'], jaJP).value)).toBe('quase');
		expect(estado(tolerantScore('こんにちは', ['駅はどこですか'], jaJP).value)).toBe('errado');
	});

	// Forma composta e pré-composta do mesmo caractere são o MESMO texto
	// (testing.md, item 4).
	it('trata "é" decomposto e pré-composto como iguais', () => {
		const precomposto = 'café'; // o "é" num code point só
		const decomposto = 'café'; // "e" + acento agudo combinante
		// A guarda existe porque um editor que normalize o arquivo tornaria os
		// dois literais iguais — e o teste passaria a não provar nada, calado.
		expect(precomposto).not.toBe(decomposto);
		expect(tolerantScore(decomposto, [precomposto], ptBR).value).toBe(1);
		expect(tolerantScore(precomposto, [decomposto], ptBR).value).toBe(1);
	});

	// ---- a régua de PALAVRAS ----
	//
	// Levenshtein mede toques de tecla. Uma tradução igualmente válida escrita
	// com outras palavras explode em edições e caía como resposta aleatória,
	// mesmo com cinco das sete palavras no lugar. Foi o caso relatado.
	describe('proximidade por palavra', () => {
		const esperada = 'Ela vai ligar para você mais tarde';

		it('aceita como "quase" a tradução válida com outras palavras', () => {
			expect(estado(tolerantScore('ela vai te ligar mais tarde', [esperada], ptBR).value)).toBe(
				'quase'
			);
		});

		// A ordem não entra na conta: quem cuida de ordem é o `sequenceScore`, e
		// uma tradução válida costuma reordenar.
		it('não se importa com a ordem das palavras', () => {
			expect(estado(tolerantScore('Mais tarde ela vai te ligar', [esperada], ptBR).value)).toBe(
				'quase'
			);
		});

		it('aceita uma palavra a menos como quase', () => {
			expect(estado(tolerantScore('Ela vai ligar mais tarde', [esperada], ptBR).value)).toBe(
				'quase'
			);
		});

		// "irá" e "vai" são o MESMO futuro (`LanguageProfile.equivalences`): não é
		// sinônimo que o kernel adivinhou, é o profile do português dizendo que
		// as duas formas não se distinguem. Antes isto era "quase".
		it('aceita o futuro simples no lugar do perifrástico como certo', () => {
			expect(
				estado(tolerantScore('Ela irá ligar para você mais tarde', [esperada], ptBR).value)
			).toBe('certo');
		});

		it('continua recusando frase de outro assunto', () => {
			for (const resposta of ['Eles comem pão todo dia', 'Ela dorme', 'banana', '']) {
				expect(estado(tolerantScore(resposta, [esperada], ptBR).value)).toBe('errado');
			}
		});

		// A régua é para FRASE. Em resposta curta não há reescrita, e a palavra
		// trocada costuma ser exatamente o que a questão testava.
		it('NÃO vale para resposta curta, onde a palavra trocada é o erro', () => {
			expect(estado(tolerantScore('I have a pen', ['I have a book'], enUS).value)).toBe('errado');
			expect(estado(tolerantScore('Ela mora aqui', ['Ela come pão'], ptBR).value)).toBe('errado');
		});

		// Repetição conta: duas ocorrências de "the" não casam com uma só.
		it('compara multiconjunto, não conjunto', () => {
			expect(wordSimilarity('the the the the the', 'the cat sat on the mat', enUS)).toBeLessThan(
				0.65
			);
		});

		// Sem `Intl.Segmenter`, um `split(' ')` devolveria a frase japonesa
		// inteira como um token só e a régua nunca sairia de 0 ou 1.
		it('segmenta japonês por palavra, não por espaço', () => {
			const frase = '駅はどこですか';
			expect(wordSimilarity(frase, frase, jaJP)).toBe(1);
			expect(wordSimilarity('こんにちは', frase, jaJP)).toBeLessThan(0.65);
		});
	});

	it('escolhe a variante aceita mais próxima', () => {
		const r = tolerantScore("she's been", ['has been', "she's been"], enUS);
		expect(r.value).toBe(1);
	});
});

/**
 * O sujeito que a língua omite (`LanguageProfile.sujeitoOmitivel`). O caso que
 * trouxe isto: "I'm looking forward to the weekend", a resposta "Estou ansioso
 * para o fim de semana", e o aluno que escreveu "Eu estou ansioso…" recebia
 * "quase".
 */
describe('sujeito omitível', () => {
	const aceitas = [
		'Estou ansioso para o fim de semana',
		'Eu estou ansioso para o fim de semana',
		'Estou ansiosa para o fim de semana.'
	];

	it('com uma aceita que traz o "eu", a questão aceita com e sem ele, em qualquer variante', () => {
		expect(tolerantScore('Eu estou ansioso para o fim de semana', aceitas, ptBR).value).toBe(1);
		expect(tolerantScore('Eu estou ansiosa para o fim de semana', aceitas, ptBR).value).toBe(1);
		expect(tolerantScore('estou ansiosa para o fim de semana', aceitas, ptBR).value).toBe(1);
	});

	it('o professor escreveu com o pronome: sem ele também vale', () => {
		expect(tolerantScore('Não gosto de café', ['Eu não gosto de café'], ptBR).value).toBe(1);
	});

	it('nunca um pronome que nenhuma aceita traz', () => {
		expect(tolerantScore('Nós estou ansioso para o fim de semana', aceitas, ptBR).value).toBe(0.5);
		// Sem aceita com sujeito, o "eu" a mais continua "quase": quem propõe a
		// forma com o pronome é a geração, conferida pela ida e volta do tradutor.
		expect(
			tolerantScore(
				'Eu estou ansioso para o fim de semana',
				['Estou ansioso para o fim de semana'],
				ptBR
			).value
		).toBe(0.5);
	});

	it('sujeito composto e pronome sozinho ficam como estão', () => {
		const composto = ['Eu e meu irmão moramos em São Paulo'];
		expect(tolerantScore('E meu irmão moramos em São Paulo', composto, ptBR).value).toBe(0.5);
		expect(tolerantScore('eu', ['eu'], ptBR).value).toBe(1);
		expect(tolerantScore('nós', ['eu'], ptBR).value).toBe(0);
	});

	it('língua que não omite o sujeito não muda nada', () => {
		const r = tolerantScore(
			'Am looking forward to the weekend',
			["I'm looking forward to the weekend"],
			enUS
		);
		expect(r.value).toBe(0.5);
	});
});
