import type { Item } from '../item';
import { getInteraction } from '../interactions/registry';
import type { Skill } from '../interactions/types';
import type { GenerationGroup } from './index';

/**
 * O que o professor pediu na etapa 1: quantas questões e quais habilidades.
 *
 * Ele continua NÃO marcando a habilidade de cada exercício — ela é derivada de
 * material × interação × correção (kernel.md). Isto é um filtro aplicado
 * DEPOIS, sobre o que os geradores produziram: "quero uma atividade de leitura
 * e escrita, com 10 questões", não "este item é de leitura".
 */
export interface GenerationPlan {
	/** Quantas questões manter no rascunho. */
	target: number;
	/** Habilidades desejadas. Vazio = todas. */
	skills: Skill[];
	/**
	 * Os tipos de CADA material, escolhidos na etapa de materiais
	 * (`{ [contentId]: Skill[] }`). Material ausente segue `skills`; presente e
	 * vazio não gera nada — o professor desligou todos os tipos dele.
	 */
	skillsPorMaterial?: Record<string, Skill[]>;
}

/** Os itens que o professor quer de cada material, na ordem do gerador. */
function filasDo(groups: GenerationGroup[], plan: GenerationPlan): Item[][] {
	const geral = new Set(plan.skills);
	return groups.map((group) => {
		const doMaterial = plan.skillsPorMaterial?.[group.contentId];
		if (doMaterial && doMaterial.length === 0) return [];
		const desejadas = doMaterial ? new Set(doMaterial) : geral;
		return group.items.filter((item) => querido(item, desejadas));
	});
}

/**
 * Teto por habilidade. Fala e escuta custam caro dos dois lados: cada item de
 * escuta é um par de arquivos de TTS a sintetizar e esperar, e cada item de
 * fala é uma gravação que o aluno precisa de silêncio para fazer. Uma
 * atividade inteira de qualquer um dos dois não é o que o professor quer, e é
 * o que sai por acidente quando o material é todo do mesmo tipo.
 */
export const TETO_POR_HABILIDADE: Partial<Record<Skill, number>> = {
	speaking: 5,
	listening: 5
};

/** O teto duro de questões por atividade — acima disso o aluno abandona no meio. */
export const MAX_ITENS = 15;

function skillsOf(item: Item): Skill[] {
	return getInteraction(item.interaction.type).skills(item.prompt);
}

/**
 * Um item entra se todas as habilidades que ele EXIGE foram pedidas, não se
 * alguma foi.
 *
 * "Ouça e escreva" é listening + writing: quem desmarcou escrita não quer
 * digitar, mesmo que o exercício também treine escuta. A regra frouxa ("alguma
 * bate") devolveria exatamente os exercícios que ele acabou de tirar da mesa.
 *
 * **`reading` vinda do enunciado não exige nada, e por isso não veta.** Ela sai
 * de `prompt.kind === 'text'` (kernel.md "Habilidade é derivada"), ou seja: de
 * quase todo item que não é de áudio. Um exercício de FALA mostra a frase em
 * português e pede que o aluno diga em inglês — logo ele é
 * `[reading, speaking]`, e com a regra literal o professor que marcava só
 * "fala" recebia uma atividade VAZIA: não existe exercício em que não se leia
 * nada. O mesmo acontecia em "escuta + fala", que só sobrevivia como escuta.
 *
 * Ler continua sendo uma habilidade de verdade: um item cuja ÚNICA habilidade é
 * leitura (montar a frase a partir da tradução) exige que ela tenha sido pedida.
 */
function querido(item: Item, desejadas: Set<Skill>): boolean {
	if (desejadas.size === 0) return true;
	const exigidas = skillsOf(item).filter((skill) => skill !== 'reading');
	if (exigidas.length === 0) return desejadas.has('reading');
	return exigidas.every((skill) => desejadas.has(skill));
}

/**
 * A mesma regra para quem mostra ANTES de gerar o que um material daria com
 * estes tipos (a prévia da etapa de materiais). Lista vazia não vale como
 * "todos" aqui: material com todos os tipos desligados não gera nada.
 */
export function entraComOsTipos(item: Item, tipos: readonly Skill[]): boolean {
	return tipos.length > 0 && querido(item, new Set(tipos));
}

/** Ordem estável para a passada de cobertura quando o professor não escolheu nada. */
const TODAS_AS_HABILIDADES: Skill[] = ['listening', 'speaking', 'reading', 'writing'];

/**
 * Escolhe quais itens gerados viram o rascunho.
 *
 * Percorre os grupos em RODÍZIO — um item de cada material por volta — em vez
 * de esgotar o primeiro: com 20 materiais e alvo de 12, pegar em sequência
 * daria uma atividade inteira sobre as duas primeiras frases. Determinístico
 * de ponta a ponta: a mesma entrada devolve sempre a mesma seleção.
 */
export function selectItems(
	groups: GenerationGroup[],
	plan: GenerationPlan,
	/**
	 * O exercício de associação que fecha a atividade. Fica FORA do rodízio e
	 * entra por último: ele revisa o que apareceu no caminho, então no meio da
	 * lista não teria o que revisar. Também reserva a própria vaga — sem isso
	 * ele era o primeiro a cair quando o alvo era apertado.
	 */
	closing: Item | null = null
): Item[] {
	const desejadas = new Set(plan.skills);
	const alvo = Math.max(1, Math.min(plan.target, MAX_ITENS));
	const fecho = closing && querido(closing, desejadas) ? closing : null;
	const alvoDosDemais = fecho ? Math.max(1, alvo - 1) : alvo;

	const filas = filasDo(groups, plan);
	const maiorFila = filas.reduce((max, fila) => Math.max(max, fila.length), 0);

	const escolhidos: Item[] = [];
	const dentro = new Set<string>();
	const usados: Partial<Record<Skill, number>> = {};
	/**
	 * Quantos itens cada MATERIAL já deu. É o que torna o rodízio justo: um
	 * material só ganha o segundo item depois de todos terem o primeiro —
	 * contando o que a passada de cobertura já tirou dele.
	 */
	const porMaterial = filas.map(() => 0);

	/** Aceita o item se ele couber nos tetos. Devolve se entrou. */
	function aceitar(item: Item | undefined, material: number): boolean {
		if (!item || dentro.has(item.id)) return false;

		// O teto vale por habilidade do item, e um item de escuta+escrita
		// consome a cota de escuta — é a escuta que custa o TTS.
		const skills = skillsOf(item);
		const estouraria = skills.some((skill) => {
			const teto = TETO_POR_HABILIDADE[skill];
			return teto !== undefined && (usados[skill] ?? 0) >= teto;
		});
		if (estouraria) return false;

		for (const skill of skills) usados[skill] = (usados[skill] ?? 0) + 1;
		dentro.add(item.id);
		escolhidos.push(item);
		porMaterial[material] = (porMaterial[material] ?? 0) + 1;
		return true;
	}

	/** Os materiais na ordem de quem menos deu — estável para o resto. */
	function materiaisMenosUsados(): number[] {
		return filas
			.map((_, indice) => indice)
			.sort((a, b) => (porMaterial[a] ?? 0) - (porMaterial[b] ?? 0) || a - b);
	}

	// **Passada 1 — cobertura: uma questão de cada habilidade pedida, antes de
	// tudo.** O professor marcou "escuta e fala" e recebia cinco exercícios de
	// escuta e nenhum de fala: o rodízio abaixo anda por POSIÇÃO na fila, e as
	// filas saem na ordem dos geradores, com `speak-target` sempre no fim. Com
	// mais materiais do que vagas, o alvo era atingido antes de a vez dele
	// chegar. Reservar uma vaga por habilidade é o que faz o plano da etapa 1
	// valer alguma coisa.
	//
	// A vaga de cada habilidade sai do material que MENOS deu até ali: pegar as
	// quatro do primeiro material gastava quatro das vagas numa frase só, e as
	// últimas frases da lista ficavam de fora.
	const aCobrir = desejadas.size > 0 ? plan.skills : TODAS_AS_HABILIDADES;
	for (const habilidade of aCobrir) {
		if (escolhidos.length >= alvoDosDemais) break;
		if (escolhidos.some((item) => skillsOf(item).includes(habilidade))) continue;
		buscando: for (const indice of materiaisMenosUsados()) {
			for (const item of filas[indice] ?? []) {
				if (skillsOf(item).includes(habilidade) && aceitar(item, indice)) break buscando;
			}
		}
	}

	// **Passada 2 — rodízio JUSTO entre os materiais, com deslocamento.**
	//
	// Justo: a rodada N só serve material que ainda não deu N+1 itens. Um material
	// só ganha o segundo exercício depois de TODOS terem o primeiro — o professor
	// que cola vinte frases quer as vinte na atividade, não sete variações das
	// mesmas três. Antes, o que a cobertura tirava de um material não contava, e
	// ele voltava a ser servido na primeira rodada enquanto as frases do fim da
	// lista ficavam sem vaga.
	//
	// Deslocamento: cada material começa num gerador diferente (`+ indice`) —
	// sem isso, todo material entrega primeiro o MESMO exercício, e uma
	// atividade de dez questões saía com as dez do mesmo tipo, uma por frase.
	// Continua determinístico: a mesma entrada devolve sempre a mesma seleção.
	for (let rodada = 0; rodada < maiorFila && escolhidos.length < alvoDosDemais; rodada++) {
		for (const [indice, fila] of filas.entries()) {
			if (escolhidos.length >= alvoDosDemais) break;
			if ((porMaterial[indice] ?? 0) > rodada) continue;
			// O próximo item ainda não usado deste material, a partir do deslocamento.
			for (let passo = 0; passo < fila.length; passo++) {
				if (aceitar(fila[(rodada + indice + passo) % fila.length], indice)) break;
			}
		}
	}

	return fecho ? [...escolhidos, fecho] : escolhidos;
}

/**
 * Gera para TODOS e separa pela quantidade — pedido do dono do repositório: a
 * etapa de materiais não deixa questão de fora, a revisão é que deixa. `dentro`
 * é a escolha de `selectItems` (o número pedido, os tetos, o rodízio justo);
 * `fora` é todo o resto que o professor quis, na ordem do rodízio (o primeiro
 * de cada material, depois o segundo…), para ele trocar na revisão o que entra.
 */
export function separarPelaQuantidade(
	groups: GenerationGroup[],
	plan: GenerationPlan,
	closing: Item | null = null
): { dentro: Item[]; fora: Item[] } {
	const dentro = selectItems(groups, plan, closing);
	const ja = new Set(dentro.map((item) => item.id));
	const filas = filasDo(groups, plan).map((fila) => fila.filter((item) => !ja.has(item.id)));
	const maior = filas.reduce((max, fila) => Math.max(max, fila.length), 0);
	const fora: Item[] = [];
	for (let rodada = 0; rodada < maior; rodada++) {
		for (const fila of filas) {
			const item = fila[rodada];
			if (item) fora.push(item);
		}
	}
	return { dentro, fora };
}
