import { normalize } from '../language/normalize';
import { tokenize } from '../language/tokenize';
import type { LanguageProfile } from '../language/profile';
import { pickWithSeed } from '../random';

/**
 * Distrator SEMPRE sai do próprio conjunto de conteúdo do professor —
 * kernel.md "Distratores: a regra que mantém tudo agnóstico". Isso resolve
 * dois problemas de uma vez: os distratores ficam plausíveis (mesmo tema,
 * mesmo nível) e o gerador nunca precisa saber alemão.
 *
 * Se o conjunto não tem material suficiente, estas funções devolvem MENOS —
 * quem chama decide se ainda dá para gerar o item ou se devolve nenhum.
 * Nunca invente distrator.
 */

export function distractorPhrases(
	candidates: string[],
	exclude: string,
	count: number,
	profile: LanguageProfile,
	seed: string
): string[] {
	const excluded = normalize(exclude, profile);
	// Uma por forma NORMALIZADA, não por texto: "a casa" e "A casa." são a mesma
	// alternativa para a correção, e as duas na mesma questão são duas alternativas
	// iguais — quem escolhe a segunda leva errado (kernel.md "Conferência de
	// qualidade"). Fica a primeira, como foi escrita.
	const vistas = new Set([excluded]);
	const pool = candidates.filter((c) => {
		const chave = normalize(c, profile);
		if (!chave || vistas.has(chave)) return false;
		vistas.add(chave);
		return true;
	});
	return pickWithSeed(pool, count, seed);
}

export function distractorTokens(
	candidates: string[],
	exclude: string,
	count: number,
	profile: LanguageProfile,
	seed: string
): string[] {
	const used = new Set(tokenize(exclude, profile).map((t) => normalize(t, profile)));
	const pool = [
		...new Set(
			candidates
				.flatMap((phrase) => tokenize(phrase, profile))
				.filter((token) => !used.has(normalize(token, profile)))
		)
	];
	return pickWithSeed(pool, count, seed);
}
