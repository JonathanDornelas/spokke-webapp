import { normalize } from '$lib/kernel/language/normalize';
import { tokenize } from '$lib/kernel/language/tokenize';
import type { LanguageProfile } from '$lib/kernel/language/profile';

/**
 * Filtra o que veio como `hints` no item, deixando só o que é VOCABULÁRIO.
 *
 * **Item antigo traz a frase inteira ali.** O gerador enchia `hints` com
 * `tokenize(target)` — palavra por palavra — e isso vira o `initial_prompt` do
 * Whisper, uma lista separada por vírgulas. O modelo imita o ESTILO do prompt:
 * a transcrição voltava "Are, you, still, working, on, that, project" e o
 * feedback do aluno saía com vírgula entre cada palavra.
 *
 * O gerador já não faz isso, mas versão publicada é IMUTÁVEL (regra nº 7): as
 * atividades que já estão no ar continuariam com o defeito. Este filtro as
 * conserta sem republicar.
 *
 * A regra é exata, não um palpite: se os hints são exatamente a tokenização do
 * alvo, eles não são vocabulário — são a frase. Um termo incomum de verdade
 * ("Bahnhof") continua passando, mesmo estando dentro da frase, porque a lista
 * inteira não reconstrói o alvo.
 *
 * Mora aqui, e não no endpoint da fala do Player, porque a prévia do professor
 * (`atividades/[id]/previa/fala`) transcreve do mesmo jeito.
 */
export function vocabulario(
	hints: string[] | undefined,
	target: string,
	profile: LanguageProfile
): string[] {
	if (!hints?.length) return [];
	const arrumar = (palavras: string[]) =>
		palavras
			.map((palavra) => normalize(palavra, profile))
			.filter(Boolean)
			.sort()
			.join('\u0000');
	return arrumar(hints) === arrumar(tokenize(target, profile)) ? [] : hints;
}
