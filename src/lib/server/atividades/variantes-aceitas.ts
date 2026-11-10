import type { Item } from '$lib/kernel/item';
import type { LanguageProfile } from '$lib/kernel/language/profile';
import { normalize } from '$lib/kernel/language/normalize';
import { typeAuthoringSchema } from '$lib/kernel/interactions/type';
import { MAX_VARIANTES, variantesProximas } from '$lib/kernel/grading/variantes';
import type { Tradutor } from '$lib/server/traducao';

/**
 * As variantes que uma questão de TRADUÇÃO também aceita, propostas pelo
 * tradutor quando os itens são gerados (kernel.md "Respostas aceitas").
 *
 * O caso que trouxe isto: "Never give up on your dreams", a resposta esperada
 * "Nunca desista de seus sonhos", e o aluno que escreveu outra tradução certa
 * recebia "quase". O pedido do dono do repositório foi: variações que o aluno
 * pode digitar, com o mesmo sentido, pequenas diferenças — e na CRIAÇÃO, não
 * na correção.
 *
 * **Na correção, não.** Medido com o MADLAD: traduzir a resposta do aluno de
 * volta e comparar aceitaria o erro que o exercício cobra — "She have been
 * working here" e "Never gives up on you dreams" voltam idênticas às certas,
 * porque o modelo conserta antes de traduzir. E cada correção custaria um
 * segundo de CPU na fila que também transcreve a fala da turma.
 *
 * **Só onde o aluno responde na LÍNGUA DELE** (`answerLang: 'source'`, o
 * "traduza para o português"). Ali o que se cobra é o sentido. No idioma alvo o
 * que se ensina é a FORMA, e uma alternativa do tradutor trocaria justamente o
 * que a lição treina: para "Ela trabalha aqui há dois anos" ele propõe "She has
 * been working", "She's worked" e "She works" — numa aula de present perfect
 * continuous, as duas últimas não podem virar certas.
 *
 * Três filtros, na ordem:
 *
 * 1. **O feixe**: o serviço só devolve hipótese perto da melhor na pontuação do
 *    próprio modelo (`MARGEM_DAS_ALTERNATIVAS`, medida no audiotext-service) —
 *    abaixo disso vinha "Nunca desista EM seus sonhos".
 * 2. **O tamanho da diferença** (`variantesProximas`, kernel puro): poucas
 *    palavras trocadas, a mais ou a menos.
 * 3. **O sentido, pela ida e volta**: a variante traduzida de novo para o idioma
 *    alvo tem de dar a frase original — ou o mesmo que a resposta do professor
 *    dá. "Eu realmente adoro ler" para "me gusta mucho leer" volta como "me
 *    encanta" e cai.
 *
 * As variantes entram DEPOIS da resposta do professor, e o editor de item as
 * mostra em "Também aceitas", cada uma com o X de remover. Nunca trava a
 * geração: sem tradutor, com ele fora do ar ou com resposta estranha, os itens
 * voltam como chegaram.
 */

/** Quantas alternativas pedir ao serviço por frase — o teto dele. */
const ALTERNATIVAS_PEDIDAS = 4;

interface Alvo {
	indice: number;
	/** A frase no idioma alvo, que o aluno lê. */
	original: string;
	/** A resposta do professor. */
	principal: string;
	/** O que a questão já aceita além dela. */
	outras: string[];
}

/** A questão "traduza para a sua língua" — e só ela. */
function alvoDe(item: Item, indice: number): Alvo | null {
	if (item.interaction.type !== 'type') return null;
	if (item.grading.answerLang !== 'source' || item.grading.mode !== 'tolerant') return null;
	if (item.prompt.kind !== 'text' || !item.prompt.text?.trim()) return null;
	const lido = typeAuthoringSchema.safeParse(item.interaction.payload);
	if (!lido.success) return null;
	const [principal, ...outras] = lido.data.accepted;
	if (!principal) return null;
	return { indice, original: item.prompt.text.trim(), principal, outras };
}

export async function comVariantesDaTraducao(
	items: Item[],
	perfis: { alvo: LanguageProfile; origem: LanguageProfile },
	tradutor: Tradutor | null
): Promise<Item[]> {
	if (!tradutor?.alternativas) return items;
	const alvos = items.map(alvoDe).filter((a): a is Alvo => a !== null);
	if (alvos.length === 0) return items;

	try {
		// 1 e 2: as alternativas do feixe, filtradas pelo tamanho da diferença.
		const candidatas = await tradutor.alternativas(
			alvos.map((a) => a.original),
			perfis.alvo.tag,
			perfis.origem.tag,
			ALTERNATIVAS_PEDIDAS
		);
		if (candidatas.length !== alvos.length) return items;
		const propostas = alvos.map((a, i) =>
			variantesProximas(a.principal, candidatas[i] ?? [], perfis.origem, a.outras, MAX_VARIANTES)
		);
		if (propostas.every((p) => p.length === 0)) return items;

		// 3: a ida e volta. Um pedido só, com as variantes e as respostas do
		// professor juntas — a volta da resposta dele é o segundo gabarito do
		// sentido (o modelo pode não devolver a frase original palavra por palavra
		// nem para a tradução certa: "Never give up your dreams", sem o "on").
		const voltar = alvos.flatMap((a, i) => [a.principal, ...(propostas[i] ?? [])]);
		const volta = await tradutor.traduzir(voltar, perfis.origem.tag, perfis.alvo.tag);
		if (volta.length !== voltar.length) return items;

		const chave = (texto: string) => normalize(texto, perfis.alvo).trim();
		const saida = [...items];
		let cursor = 0;
		alvos.forEach((a, i) => {
			const lista = propostas[i] ?? [];
			const voltaDaPrincipal = chave(volta[cursor] ?? '');
			const sentidos = new Set([chave(a.original), voltaDaPrincipal].filter(Boolean));
			const aprovadas = lista.filter((_, n) => sentidos.has(chave(volta[cursor + 1 + n] ?? '')));
			cursor += 1 + lista.length;
			if (aprovadas.length === 0) return;

			const item = items[a.indice]!;
			saida[a.indice] = {
				...item,
				interaction: {
					...item.interaction,
					payload: {
						...(item.interaction.payload as Record<string, unknown>),
						accepted: [a.principal, ...a.outras, ...aprovadas]
					}
				}
			};
		});
		return saida;
	} catch {
		return items;
	}
}
