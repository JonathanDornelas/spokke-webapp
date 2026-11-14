import type { Item } from '$lib/kernel/item';
import type { LanguageProfile } from '$lib/kernel/language/profile';
import { normalize } from '$lib/kernel/language/normalize';
import { typeAuthoringSchema } from '$lib/kernel/interactions/type';
import {
	MAX_VARIANTES,
	candidatasComSujeito,
	variantesProximas
} from '$lib/kernel/grading/variantes';
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
 * **E o sujeito explícito** (`candidatasComSujeito`, kernel): o feixe não
 * garante o par "Estou…" / "Eu estou…" — para "I'm looking forward to the
 * weekend" ele só variava gênero e preposição. Quando a resposta do professor
 * não traz o sujeito, cada pronome omitível do idioma vai na frente dela e
 * passa pela MESMA ida e volta, que escolhe o certo ("Nós estou…" volta como
 * "We're…" e cai). Fica no máximo uma, ANTES das do feixe e fora do teto delas:
 * com ela na lista, a correção aceita o pronome em qualquer variante.
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
		const doFeixe = alvos.map((a, i) =>
			variantesProximas(a.principal, candidatas[i] ?? [], perfis.origem, a.outras, MAX_VARIANTES)
		);
		const comSujeito = alvos.map((a, i) =>
			candidatasComSujeito(a.principal, perfis.origem, [...a.outras, ...(doFeixe[i] ?? [])])
		);
		const propostas = alvos.map((_, i) => [...(comSujeito[i] ?? []), ...(doFeixe[i] ?? [])]);
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
			const passou = lista.map((_, n) => sentidos.has(chave(volta[cursor + 1 + n] ?? '')));
			cursor += 1 + lista.length;
			// Do sujeito, só a primeira que passou: a frase tem um sujeito só.
			const nSujeito = comSujeito[i]?.length ?? 0;
			const sujeito = lista.slice(0, nSujeito).find((_, n) => passou[n]);
			const aprovadas = [
				...(sujeito ? [sujeito] : []),
				...lista.slice(nSujeito).filter((_, n) => passou[nSujeito + n])
			];
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

/**
 * As variações de UMA frase, para o formulário de material mostrar junto da
 * tradução sugerida (`sugerirTraducao`). É o mesmo funil das questões.
 */
export async function variantesDaFrase(
	original: string,
	principal: string,
	perfis: { alvo: LanguageProfile; origem: LanguageProfile },
	tradutor: Tradutor | null
): Promise<string[]> {
	const [variantes] = await variantesDasFrases([{ original, principal }], perfis, tradutor);
	return variantes ?? [];
}

/**
 * As variações de VÁRIAS frases de uma vez — a lista colada, e a frase que o
 * professor salvou antes de a sugestão chegar: o servidor traduz o que veio em
 * branco e, sem isto, o material entrava sem as variações que a tela teria
 * mostrado. São os mesmos dois pedidos ao tradutor para a lista inteira (as
 * alternativas e a ida e volta), nunca dois por frase. Uma lista por frase, na
 * ordem; vazia quando nada passou ou o tradutor não respondeu.
 */
export async function variantesDasFrases(
	frases: { original: string; principal: string }[],
	perfis: { alvo: LanguageProfile; origem: LanguageProfile },
	tradutor: Tradutor | null
): Promise<string[][]> {
	const questoes: Item[] = frases.map(({ original, principal }, i) => ({
		id: `variantes-${i}`,
		sourceContentId: null,
		generatedBy: null,
		prompt: { kind: 'text', text: original, instructionKey: 'translate-to-source' },
		interaction: { type: 'type', payload: { accepted: [principal] } },
		grading: { mode: 'tolerant', tolerance: 0.9, answerLang: 'source' },
		locale: { source: perfis.origem.tag, target: perfis.alvo.tag }
	}));
	const com = await comVariantesDaTraducao(questoes, perfis, tradutor);
	return com.map((questao) => {
		const lido = typeAuthoringSchema.safeParse(questao.interaction.payload);
		return lido.success ? lido.data.accepted.slice(1) : [];
	});
}
