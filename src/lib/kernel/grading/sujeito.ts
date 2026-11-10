import type { LanguageProfile } from '../language/profile';
import { tokenize } from '../language/tokenize';

/**
 * O sujeito que a língua deixa omitir (`LanguageProfile.sujeitoOmitivel`) —
 * a peça comum da correção e da geração de variantes. Sem conhecimento de
 * língua aqui: quem diz quais pronomes são é o profile.
 */

/**
 * O pronome omitível com que um texto JÁ NORMALIZADO começa, ou `null`.
 *
 * Duas vezes não: sozinho ele é a resposta inteira, não um sujeito a mais ("eu"
 * como resposta de vocabulário nunca vira resposta vazia); e seguido de uma
 * conjunção ele é parte de um sujeito composto ("eu e meu irmão moramos aqui"),
 * que sem ele vira outra frase.
 */
export function sujeitoNoInicio(normalizado: string, profile: LanguageProfile): string | null {
	const regra = profile.sujeitoOmitivel;
	if (!regra || regra.pronomes.length === 0) return null;
	const palavras = tokenize(normalizado, profile);
	if (palavras.length < 2) return null;
	const [primeira = '', segunda = ''] = palavras;
	if (!regra.pronomes.includes(primeira) || regra.conjuncoes.includes(segunda)) return null;
	return normalizado.startsWith(primeira) ? primeira : null;
}

/** O texto normalizado sem o `pronome` do começo, que `sujeitoNoInicio` achou nele. */
export function semSujeito(normalizado: string, pronome: string): string {
	return normalizado.startsWith(pronome)
		? normalizado.slice(pronome.length).trimStart()
		: normalizado;
}
