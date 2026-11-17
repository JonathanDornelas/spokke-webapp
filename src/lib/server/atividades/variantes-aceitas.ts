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
 * na correção. **Sem IA**: quem propõe e quem confere é o tradutor do serviço
 * de áudio (o MADLAD), que roda na nossa máquina.
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
 * Três filtros para as variantes do feixe, na ordem:
 *
 * 1. **O feixe**: o serviço só devolve hipótese perto da melhor na pontuação do
 *    próprio modelo (`MARGEM_DAS_ALTERNATIVAS`, medida no audiotext-service) —
 *    abaixo disso vinha "Nunca desista EM seus sonhos".
 * 2. **O tamanho da diferença** (`variantesProximas`, kernel puro): poucas
 *    palavras trocadas, a mais ou a menos.
 * 3. **O sentido, pela ida e volta**: a variante traduzida de novo para o idioma
 *    alvo tem de dar a frase original — ou o mesmo que a resposta do professor
 *    dá. "Eu quero uma xícara de café" para "I would like a cup of coffee" volta
 *    "I want" e cai. A que não volta na primeira tradução ganha uma SEGUNDA
 *    CHANCE: vale também se a frase estiver entre as outras hipóteses da volta
 *    (as do feixe, perto da melhor). Medido em 32 frases de aula: é o que deixa
 *    entrar "Eu te ligo mais tarde", "Hoje está chovendo muito" e "Já concluíram
 *    o relatório", que voltavam com uma palavra de diferença, sem deixar entrar
 *    "Temos de ir agora" (ir não é sair) nem "com a lição" (não é a tarefa).
 *
 * **E o sujeito explícito** (`candidatasComSujeito`, kernel): o feixe não
 * garante o par "Estou…" / "Eu estou…" — para "I'm looking forward to the
 * weekend" ele só variava gênero e preposição. Quando nenhuma resposta aceita
 * traz o sujeito, cada pronome omitível do idioma é conferido pelo COMEÇO
 * FORÇADO (`Tradutor.comecandoPor`): o modelo traduz a frase original obrigado
 * a começar por "Eu", e o pronome só vale se ele escrever a frase do professor
 * (ou uma variante já aprovada) depois dele.
 *
 * Era a ida e volta que escolhia o pronome, e ela aprovava lixo: o modelo ignora
 * um pronome sobrando, então "Eu onde fica a estação de trem?", "Eu há um gato no
 * jardim" e "Nós está muito frio hoje" voltavam iguais à frase certa e viravam
 * resposta aceita (medido: uma frase em três). Começando pelo pronome, ele
 * escreve o que a frase seria com aquele sujeito — "Eu tenho um gato no jardim",
 * "Nós estamos com muito frio" — e a candidata errada não aparece. Fica no
 * máximo uma, ANTES das do feixe e fora do teto delas: com ela na lista, a
 * correção aceita o pronome em qualquer variante.
 *
 * As variantes entram DEPOIS da resposta do professor, e o editor de item as
 * mostra em "Também aceitas", cada uma com o X de remover. Nunca trava a
 * geração: sem tradutor, com ele fora do ar ou com resposta estranha, os itens
 * voltam como chegaram — e o que um passo já aprovou não se perde porque o
 * seguinte falhou.
 */

/** Quantas alternativas pedir ao serviço por frase — o teto dele. */
const ALTERNATIVAS_PEDIDAS = 4;
/** Quantas hipóteses além da melhor o começo forçado pede: a frase costuma ser a 1ª ou a 2ª. */
const ALTERNATIVAS_DO_SUJEITO = 2;

interface Alvo {
	indice: number;
	/** A frase no idioma alvo, que o aluno lê. */
	original: string;
	/** A resposta do professor. */
	principal: string;
	/** O que a questão já aceita além dela. */
	outras: string[];
}

type Perfis = { alvo: LanguageProfile; origem: LanguageProfile };

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

/**
 * O terceiro filtro: das variantes do feixe, as que fazem a ida e volta. Dois
 * pedidos no máximo — a volta de todas, e a segunda chance das que não voltaram.
 */
async function conferirPelaVolta(
	alvos: Alvo[],
	doFeixe: string[][],
	perfis: Perfis,
	tradutor: Tradutor
): Promise<string[][]> {
	if (doFeixe.every((lista) => lista.length === 0)) return doFeixe;

	// A volta da resposta do professor vai junto: é o segundo gabarito do sentido
	// (o modelo pode não devolver a frase original palavra por palavra nem para a
	// tradução certa: "Never give up your dreams", sem o "on").
	const voltar = alvos.flatMap((a, i) => [a.principal, ...(doFeixe[i] ?? [])]);
	const volta = await tradutor.traduzir(voltar, perfis.origem.tag, perfis.alvo.tag);
	if (volta.length !== voltar.length) return alvos.map(() => []);

	const chave = (texto: string) => normalize(texto, perfis.alvo).trim();
	let cursor = 0;
	const sentidos: Set<string>[] = [];
	const passou = alvos.map((a, i) => {
		const lista = doFeixe[i] ?? [];
		const doAlvo = new Set([chave(a.original), chave(volta[cursor] ?? '')].filter(Boolean));
		sentidos.push(doAlvo);
		const marcas = lista.map((_, n) => doAlvo.has(chave(volta[cursor + 1 + n] ?? '')));
		cursor += 1 + lista.length;
		return marcas;
	});

	// A segunda chance: a frase entre as outras hipóteses da volta.
	const reprovadas = passou.flatMap((marcas, i) =>
		marcas.flatMap((ok, n) => (ok ? [] : [{ i, n, texto: doFeixe[i]![n]! }]))
	);
	if (reprovadas.length > 0 && tradutor.alternativas) {
		const hipoteses = await tradutor
			.alternativas(
				reprovadas.map((r) => r.texto),
				perfis.origem.tag,
				perfis.alvo.tag,
				ALTERNATIVAS_PEDIDAS
			)
			.catch(() => null);
		if (hipoteses?.length === reprovadas.length) {
			reprovadas.forEach(({ i, n }, k) => {
				if ((hipoteses[k] ?? []).some((h) => sentidos[i]!.has(chave(h)))) passou[i]![n] = true;
			});
		}
	}
	return doFeixe.map((lista, i) => lista.filter((_, n) => passou[i]![n]));
}

/**
 * O sujeito explícito de cada frase, quando há um e o modelo o confirma: a
 * resposta do professor com o pronome na frente, ou nulo. Um pedido por pronome
 * do idioma, só com as frases que ainda não têm o seu.
 */
async function sujeitosConfirmados(
	alvos: Alvo[],
	aprovadas: string[][],
	perfis: Perfis,
	tradutor: Tradutor
): Promise<(string | null)[]> {
	const saida: (string | null)[] = alvos.map(() => null);
	const pronomes = perfis.origem.sujeitoOmitivel?.pronomes ?? [];
	if (!tradutor.comecandoPor || pronomes.length === 0) return saida;

	// Uma candidata por pronome, na ordem do profile; vazio quando alguma resposta
	// aceita já traz o sujeito (a correção já o aceita com e sem).
	const candidatas = alvos.map((a, i) =>
		candidatasComSujeito(a.principal, perfis.origem, [...a.outras, ...(aprovadas[i] ?? [])])
	);
	const chave = (texto: string) => normalize(texto, perfis.origem).trim();

	for (const [n, pronome] of pronomes.entries()) {
		const pendentes = alvos.flatMap((_, i) =>
			saida[i] === null && candidatas[i]?.[n] !== undefined ? [i] : []
		);
		if (pendentes.length === 0) continue;
		const comeco = pronome.charAt(0).toLocaleUpperCase(perfis.origem.tag) + pronome.slice(1);
		const hipoteses = await tradutor
			.comecandoPor(
				pendentes.map((i) => alvos[i]!.original),
				perfis.alvo.tag,
				perfis.origem.tag,
				comeco,
				ALTERNATIVAS_DO_SUJEITO
			)
			.catch(() => null);
		if (hipoteses?.length !== pendentes.length) continue;
		pendentes.forEach((i, k) => {
			const a = alvos[i]!;
			// O pronome seguido de qualquer resposta que a questão aceita.
			const esperadas = new Set(
				[a.principal, ...a.outras, ...(aprovadas[i] ?? [])].map((t) => chave(`${comeco} ${t}`))
			);
			if ((hipoteses[k] ?? []).some((h) => esperadas.has(chave(h)))) {
				saida[i] = candidatas[i]![n]!;
			}
		});
	}
	return saida;
}

export async function comVariantesDaTraducao(
	items: Item[],
	perfis: Perfis,
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

		// 3: o sentido, pela ida e volta. Falhou a volta, ficam sem as do feixe — e
		// o sujeito ainda é conferido.
		const aprovadas = await conferirPelaVolta(alvos, doFeixe, perfis, tradutor).catch(() =>
			alvos.map(() => [] as string[])
		);
		const sujeitos = await sujeitosConfirmados(alvos, aprovadas, perfis, tradutor).catch(() =>
			alvos.map(() => null)
		);

		const saida = [...items];
		alvos.forEach((a, i) => {
			const sujeito = sujeitos[i];
			const acrescentar = [...(sujeito ? [sujeito] : []), ...(aprovadas[i] ?? [])];
			if (acrescentar.length === 0) return;
			const item = items[a.indice]!;
			saida[a.indice] = {
				...item,
				interaction: {
					...item.interaction,
					payload: {
						...(item.interaction.payload as Record<string, unknown>),
						accepted: [a.principal, ...a.outras, ...acrescentar]
					}
				}
			};
		});
		return mudou(saida, items) ? saida : items;
	} catch {
		return items;
	}
}

/** Alguma questão mudou? Sem mudança, devolve-se a lista que chegou. */
function mudou(saida: Item[], items: Item[]): boolean {
	return saida.some((item, i) => item !== items[i]);
}

/**
 * As variações de UMA frase, para o formulário de material mostrar junto da
 * tradução sugerida (`sugerirTraducao`) e para o editor de questão sugerir
 * outras respostas (`sugerirRespostas`). É o mesmo funil das questões.
 */
export async function variantesDaFrase(
	original: string,
	principal: string,
	perfis: Perfis,
	tradutor: Tradutor | null,
	jaAceitas: string[] = []
): Promise<string[]> {
	const [variantes] = await variantesDasFrases(
		[{ original, principal, jaAceitas }],
		perfis,
		tradutor
	);
	return variantes ?? [];
}

/**
 * As variações de VÁRIAS frases de uma vez — a lista colada, e a frase que o
 * professor salvou antes de a sugestão chegar: o servidor traduz o que veio em
 * branco e, sem isto, o material entrava sem as variações que a tela teria
 * mostrado. São os mesmos pedidos ao tradutor para a lista inteira, nunca um
 * punhado por frase. Uma lista por frase, na ordem, só com as NOVAS; vazia
 * quando nada passou ou o tradutor não respondeu.
 */
export async function variantesDasFrases(
	frases: { original: string; principal: string; jaAceitas?: string[] }[],
	perfis: Perfis,
	tradutor: Tradutor | null
): Promise<string[][]> {
	const questoes: Item[] = frases.map(({ original, principal, jaAceitas = [] }, i) => ({
		id: `variantes-${i}`,
		sourceContentId: null,
		generatedBy: null,
		prompt: { kind: 'text', text: original, instructionKey: 'translate-to-source' },
		interaction: { type: 'type', payload: { accepted: [principal, ...jaAceitas] } },
		grading: { mode: 'tolerant', tolerance: 0.9, answerLang: 'source' },
		locale: { source: perfis.origem.tag, target: perfis.alvo.tag }
	}));
	const com = await comVariantesDaTraducao(questoes, perfis, tradutor);
	return com.map((questao, i) => {
		const lido = typeAuthoringSchema.safeParse(questao.interaction.payload);
		return lido.success ? lido.data.accepted.slice(1 + (frases[i]?.jaAceitas?.length ?? 0)) : [];
	});
}
