import type { LanguageProfile } from '../language/profile';
import { graphemeCount, segmentosDePalavra } from '../language/tokenize';
import { normalize } from '../language/normalize';

/**
 * As palavras das frases de uma atividade que valem um "ligue os pares".
 *
 * É a metade PURA do fecho por palavras (`closing-match.ts`): este módulo
 * escolhe as palavras, e quem as traduz é o servidor, com o tradutor
 * (server.md "Tradução do material"). O kernel não sabe traduzir e continua
 * sem saber — e também não sabe o que é artigo ou preposição em idioma nenhum.
 * Por isso a escolha só usa o que vale em toda língua:
 *
 * - **a fronteira de palavra do `Intl.Segmenter`** do idioma (regra nº 5): em
 *   japonês e chinês não há espaço, e é ele que acha `毎朝` dentro da frase;
 * - **número não é vocabulário** (`7`, `2019`);
 * - **maiúscula no MEIO da frase é nome próprio** (Paris, Maria) — só em escrita
 *   que tem caixa; no começo da frase a maiúscula é da frase, e a palavra entra
 *   em minúscula;
 * - **a palavra que aparece em mais da metade das frases é de função** (the,
 *   de, que): com três frases ou mais, ela sai;
 * - **a mais longa primeiro**, porque palavra de conteúdo tende a ser mais longa
 *   que palavra de função — um palpite agnóstico, e o professor revisa o item.
 *
 * Determinístico: mesmas frases, mesmas palavras, na mesma ordem.
 */
export function palavrasParaAssociar(
	frases: string[],
	profile: Pick<LanguageProfile, 'tag' | 'normalizers' | 'diacritics' | 'equivalences'>,
	limite = 8
): string[] {
	interface Candidata {
		forma: string;
		frases: Set<number>;
		tamanho: number;
		ordem: number;
	}
	const porChave = new Map<string, Candidata>();

	frases.forEach((frase, indice) => {
		let primeira = true;
		for (const segmento of segmentosDePalavra(frase, profile)) {
			if (!segmento.palavra) continue;
			const noInicio = primeira;
			primeira = false;

			const texto = segmento.texto;
			if (/\p{N}/u.test(texto)) continue;
			const minuscula = texto.toLocaleLowerCase(profile.tag);
			const temMaiuscula = minuscula !== texto;
			if (temMaiuscula && !noInicio) continue;
			const forma = temMaiuscula ? minuscula : texto;
			const tamanho = graphemeCount(forma);
			if (tamanho < 2) continue;

			const chave = normalize(forma, profile);
			if (!chave) continue;
			const atual = porChave.get(chave);
			if (atual) {
				atual.frases.add(indice);
			} else {
				porChave.set(chave, { forma, frases: new Set([indice]), tamanho, ordem: porChave.size });
			}
		}
	});

	const teto = frases.length >= 3 ? frases.length / 2 : Infinity;
	return [...porChave.values()]
		.filter((c) => c.frases.size <= teto)
		.sort((a, b) => b.tamanho - a.tamanho || a.ordem - b.ordem)
		.slice(0, limite)
		.map((c) => c.forma);
}
