import { normalize } from '../language/normalize';
import { tokenize } from '../language/tokenize';
import type { LanguageProfile } from '../language/profile';
import { levenshtein, similarity } from './levenshtein';
import type { Score } from './result';
import { semSujeito, sujeitoNoInicio } from './sujeito';

/**
 * Toda comparação de resposta do kernel passa por aqui — nunca `===` entre
 * strings cruas (regra inviolável nº 6). Um só lugar decide o texto "quase
 * certo" que sustenta o estado `partial` do design-system.
 */

function norm(text: string, profile: LanguageProfile): string {
	return normalize(text, profile).trim();
}

export function exactScore(answer: string, accepted: string[], profile: LanguageProfile): Score {
	const value = norm(answer, profile);
	const ok = accepted.some((acc) => norm(acc, profile) === value);
	return { value: ok ? 1 : 0 };
}

// Abaixo disso a resposta é só "incorreto", não "quase" — evita marcar como
// parcial algo que não tem relação nenhuma com a resposta certa.
const TOLERANT_THRESHOLD = 0.82;

/**
 * Quantos erros de digitação uma resposta deste tamanho ainda pode ter e
 * continuar sendo "quase".
 *
 * A razão sozinha (o `TOLERANT_THRESHOLD`) pune quem responde CURTO: uma letra
 * a menos em "lives" dá 0,8 e caía em errado seco, enquanto a mesma letra numa
 * frase de trinta caracteres passava tranquila. É o mesmo deslize do aluno com
 * dois pesos.
 *
 * Abaixo de quatro caracteres não há margem: em "a" contra "o", um caractere de
 * diferença é a palavra inteira, não um dedo torto.
 */
function errosPermitidos(comprimento: number): number {
	if (comprimento < 4) return 0;
	return 1 + Math.floor((comprimento - 4) / 10);
}

/**
 * Acima disto, duas frases dizem QUASE a mesma coisa com quase as mesmas
 * palavras. 0,65 põe "ela vai te ligar mais tarde" contra "ela vai ligar para
 * você mais tarde" (0,77) dentro, e deixa "eles comem pão" contra "ela mora
 * aqui" (0,00) fora.
 */
const LIMIAR_PALAVRAS = 0.65;

/**
 * E a régua de palavras só vale para FRASE, não para resposta curta.
 *
 * Ela existe porque uma tradução válida reescreve a frase com outras palavras.
 * Numa resposta de três ou quatro palavras não há reescrita: "I have a pen"
 * contra "I have a book" dá 0,75 e a palavra trocada é exatamente o que a
 * questão testava — chamar isso de "quase" é premiar o erro. Aí quem manda são
 * as réguas de caractere, que tratam disso como o que é: outra resposta.
 */
const MIN_PALAVRAS_PARA_A_REGUA = 5;

/**
 * Quanto duas respostas se parecem CONTANDO PALAVRAS, não caracteres.
 *
 * É a régua que faltava. Levenshtein mede toques de tecla, então uma tradução
 * igualmente válida com outras palavras — "ela vai te ligar mais tarde" no
 * lugar de "ela vai ligar para você mais tarde" — explodia em treze edições e
 * caía como resposta aleatória, mesmo com cinco das sete palavras no lugar.
 * Trocar uma palavra custa o comprimento dela em caracteres; aqui custa 1.
 *
 * Coeficiente de Dice sobre os MULTICONJUNTOS de palavras: repetição conta
 * (duas ocorrências de "the" não casam com uma), e a ordem não — quem cuida de
 * ordem é o `sequenceScore`, e uma tradução válida costuma reordenar.
 *
 * Tokeniza pelo `Intl.Segmenter` do profile (regra inviolável nº 5): japonês,
 * chinês e tailandês não separam palavras por espaço, e um `split(' ')` aqui
 * devolveria a frase inteira como um token só — a régua nunca sairia de 0 ou 1.
 */
export function wordSimilarity(a: string, b: string, profile: LanguageProfile): number {
	const desA = tokenize(norm(a, profile), profile);
	const desB = tokenize(norm(b, profile), profile);
	if (desA.length === 0 || desB.length === 0) return 0;

	const restantes = new Map<string, number>();
	for (const palavra of desB) restantes.set(palavra, (restantes.get(palavra) ?? 0) + 1);

	let comuns = 0;
	for (const palavra of desA) {
		const quantas = restantes.get(palavra) ?? 0;
		if (quantas > 0) {
			comuns++;
			restantes.set(palavra, quantas - 1);
		}
	}

	return (2 * comuns) / (desA.length + desB.length);
}

export function tolerantScore(answer: string, accepted: string[], profile: LanguageProfile): Score {
	const value = norm(answer, profile);
	const alvos = accepted.map((acc) => ({ acc, target: norm(acc, profile) }));

	// **O sujeito que a língua omite** (`LanguageProfile.sujeitoOmitivel`):
	// se alguma aceita começa com ele, a questão aceita com e sem ele, em
	// qualquer variante — "Eu estou ansiosa pelo fim de semana" contra "Estou
	// ansiosa pelo fim de semana". Só o pronome que alguma aceita TRAZ, porque
	// é ela que diz que ele é o sujeito certo da frase: "nós estou" não vira
	// "estou". Quem propõe a forma com o pronome, quando o professor não a
	// escreveu, é a geração (`server/atividades/variantes-aceitas.ts`).
	const sujeitos = new Set(
		alvos.map(({ target }) => sujeitoNoInicio(target, profile)).filter((s) => s !== null)
	);
	const tirarSujeito = (texto: string): string => {
		const sujeito = sujeitoNoInicio(texto, profile);
		return sujeito && sujeitos.has(sujeito) ? semSujeito(texto, sujeito) : texto;
	};
	const valueSemSujeito = tirarSujeito(value);

	let best = 0;
	let closest = accepted[0] ?? '';
	/** Se ALGUMA das aceitas está a poucos toques de distância. */
	let perto = false;
	/** Ou se alguma delas diz quase o mesmo, com quase as mesmas palavras. */
	let parecida = false;

	for (const { acc, target } of alvos) {
		const pares: [string, string][] = [[value, target]];
		if (sujeitos.size > 0) pares.push([valueSemSujeito, tirarSujeito(target)]);
		for (const [v, t] of pares) {
			const sim = v === t ? 1 : similarity(v, t);
			if (sim > best) {
				best = sim;
				closest = acc;
			}
			// TRÊS réguas, e vale a mais generosa. A razão cobre a resposta longa com
			// vários deslizes; a distância cobre a curta com um só; a de palavras
			// cobre o que as duas primeiras não veem — a tradução válida escrita com
			// outras palavras, que em caracteres parece resposta aleatória.
			const distancia = levenshtein(v, t);
			if (distancia <= errosPermitidos(Math.max(v.length, t.length))) perto = true;
			if (
				tokenize(t, profile).length >= MIN_PALAVRAS_PARA_A_REGUA &&
				wordSimilarity(v, t, profile) >= LIMIAR_PALAVRAS
			) {
				parecida = true;
			}
		}
	}

	// A mensagem NÃO repete o veredito: quem escreve "Quase." é a tela
	// (`AnswerFeedback`), e o resultado saía "Quase. Quase — a resposta...".
	// Aqui vai só o que a tela não tem como saber.
	if (best >= 1) return { value: 1 };
	if (perto || parecida || best >= TOLERANT_THRESHOLD) {
		return { value: 0.5, feedback: `A resposta esperada era "${closest}".` };
	}
	return { value: 0, feedback: `A resposta esperada era "${closest}".` };
}

/**
 * `accepted` é uma lista de sequências válidas (a principal + variantes de ordem).
 *
 * `rotulos` é a resposta do aluno em TEXTO, posição a posição. Com ela o
 * resultado sai marcado — a tela grifa o que saiu do lugar dentro da própria
 * frase que ele montou. Sem ela, sobra a nota: contar posições ("8 de 9; a
 * primeira fora de lugar é a 5ª") obrigava o aluno a recontar a frase na mão
 * para descobrir qual era a 5ª.
 *
 * Os rótulos são as palavras que ELE escolheu, já visíveis na tela dele —
 * nenhuma vem do gabarito.
 */
export function sequenceScore<T>(
	answer: T[],
	accepted: T[][],
	rotulos?: string[],
	/** A sequência certa em texto, na ordem certa — o que a tela mostra como "o certo era". */
	esperado?: string[]
): Score {
	const exact = accepted.some(
		(acc) => acc.length === answer.length && acc.every((v, i) => v === answer[i])
	);
	if (exact) return { value: 1 };

	// A sequência aceita MAIS PARECIDA é a que gera a nota e as marcas — medir
	// contra a primeira puniria quem acertou uma variante de ordem.
	let bestRatio = 0;
	let melhor: T[] = accepted[0] ?? [];
	for (const acc of accepted) {
		const iguais = acc.filter((v, i) => v === answer[i]).length;
		const ratio = acc.length > 0 ? iguais / acc.length : 0;
		if (ratio > bestRatio || bestRatio === 0) {
			bestRatio = ratio;
			melhor = acc;
		}
	}

	// Uma marca por pedaço da RESPOSTA DELE, na ordem em que ele montou.
	const marks = rotulos?.map((text, i) => ({ text, ok: melhor[i] === answer[i] }));

	return {
		value: bestRatio > 0 ? Math.min(bestRatio, 0.9) : 0,
		// Sem os rótulos não há o que grifar, então resta dizer em texto que a
		// ordem é o problema — nunca devolver a nota sozinha, que era o bug.
		feedback: marks ? 'Confira o que está fora de lugar:' : 'A ordem não está certa.',
		marks,
		expected: esperado
	};
}

/** Correção por conjunto (`match`) — ordem dos pares não importa. */
export function setScore(correct: number, total: number): Score {
	if (total <= 0) return { value: 0 };
	if (correct >= total) return { value: 1 };
	return {
		value: Math.min(correct / total, 1),
		feedback: `${correct} de ${total} ${total === 1 ? 'par certo' : 'pares certos'}.`
	};
}
