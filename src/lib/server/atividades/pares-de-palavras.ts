import { contentUnitSchemas } from '$lib/kernel/content/types';
import { palavrasParaAssociar } from '$lib/kernel/content/palavras';
import { MAX_PARES, type PalavraTraduzida } from '$lib/kernel/generators/closing-match';
import type { StoredContentUnit } from '$lib/kernel/generators';
import type { LanguageProfile } from '$lib/kernel/language/profile';
import { normalize } from '$lib/kernel/language/normalize';
import type { Tradutor } from '$lib/server/traducao';

/**
 * As palavras das frases da atividade, traduzidas, para o "ligue os pares" que
 * fecha a atividade (`kernel/generators/closing-match.ts`).
 *
 * Só entra em cena quando o vocabulário cadastrado não enche o item: o termo que
 * o professor escreveu, com o sentido que ELE deu, vale mais que uma palavra
 * recortada de uma frase. E nunca trava a geração: sem tradutor, ou com ele fora
 * do ar, volta vazio e a atividade segue sem o fecho por palavras, como antes.
 *
 * **Palavra solta não tem contexto, e o tradutor erra justamente aí.** Medido com
 * o MADLAD: "working" (de "working on her thesis") virou "em funcionamento",
 * "です" virou "Sim, sim", "時に" virou "Às vezes". Por isso só fica o par que
 * FAZ A VOLTA: o sentido, traduzido de novo para o idioma alvo, precisa voltar
 * à mesma palavra. Custa um pedido a mais e derruba alguns pares bons
 * ("livraria" volta como "bookstore") — mas um fecho com três pares certos vale
 * mais que um com cinco e dois errados. O item ainda passa pela revisão da etapa
 * 3, como qualquer outro.
 */
export async function paresDasFrases(
	units: StoredContentUnit[],
	perfis: { alvo: LanguageProfile; origem: LanguageProfile },
	tradutor: Tradutor | null
): Promise<PalavraTraduzida[]> {
	if (!tradutor) return [];
	const vocabulario = units.filter((u) => u.kind === 'VocabItem').length;
	if (vocabulario >= MAX_PARES) return [];

	const frases = units.flatMap((u) => {
		if (u.kind !== 'SentencePair') return [];
		const lido = contentUnitSchemas.SentencePair.safeParse(u.data);
		return lido.success ? [lido.data.target] : [];
	});
	// Bem mais que o teto: a ida e volta derruba parte delas.
	const palavras = palavrasParaAssociar(frases, perfis.alvo, MAX_PARES * 2);
	if (palavras.length < 2) return [];

	try {
		const sentidos = await tradutor.traduzir(palavras, perfis.alvo.tag, perfis.origem.tag);
		const pares = palavras
			.map((termo, i) => ({
				termo,
				sentido: limparSentido(termo, sentidos[i] ?? '', perfis.origem.tag)
			}))
			.filter((p) => p.sentido);
		if (pares.length === 0) return [];

		const volta = await tradutor.traduzir(
			pares.map((p) => p.sentido),
			perfis.origem.tag,
			perfis.alvo.tag
		);
		return pares.filter(
			(p, i) => normalize(volta[i] ?? '', perfis.alvo) === normalize(p.termo, perfis.alvo)
		);
	} catch {
		return [];
	}
}

/**
 * O tradutor devolve FRASE ("Livraria.", "Bom dia."). Para um cartão de palavra
 * sai a pontuação do fim, e a maiúscula inicial vira minúscula quando o termo
 * também é minúsculo — só em escrita que tem caixa, e só a primeira letra, para
 * não estragar um nome no meio do sentido.
 */
function limparSentido(termo: string, sentido: string, tagDaOrigem: string): string {
	// Só a pontuação de FIM de frase, nas escritas do produto (`。` japonês e
	// chinês, `؟` árabe, `।` híndi) — um parêntese que fecha faz parte do sentido.
	let limpo = sentido.trim().replace(/[\s.。．!！?？؟…;；:：,，、।]+$/u, '');
	const termoMinusculo = termo === termo.toLocaleLowerCase() && termo !== termo.toLocaleUpperCase();
	if (termoMinusculo && limpo) {
		const [primeira, ...resto] = limpo;
		limpo = primeira.toLocaleLowerCase(tagDaOrigem) + resto.join('');
	}
	return limpo;
}
