import type { GradingMode, InteractionKind } from '$lib/kernel/interactions/types';

/**
 * As regras do EDITOR DE QUESTÃO (`atividades/[id]/itens/[itemId]`), num lugar
 * só e isomórfico: a tela usa para decidir o que mostrar, e o servidor
 * (`$lib/server/atividades/item-editado.ts`) usa as MESMAS para decidir o que
 * aceita gravar. Se as duas pontas tivessem cada uma a sua lista, a tela
 * ofereceria o que o servidor recusa — foi exatamente o que acontecia com os
 * seis tipos de questão "clicáveis" que falhavam sempre ao salvar.
 */

/** O que o aluno FAZ em cada tipo — o professor nunca vê a chave do kernel ("cloze"). */
export const ROTULO_DA_INTERACAO: Record<InteractionKind, string> = {
	type: 'Digitar a resposta',
	cloze: 'Completar a lacuna',
	choice: 'Escolher a alternativa',
	assemble: 'Montar a frase',
	match: 'Associar os pares',
	order: 'Ordenar',
	select: 'Marcar no texto',
	speak: 'Falar'
};

/**
 * Os tipos cujo gabarito é uma LISTA DE TEXTOS — os únicos que este editor
 * sabe montar. Nos outros (alternativas, tokens, pares) o gabarito foi montado
 * pelo gerador a partir do material, e o formulário campo a campo derivado do
 * `authoringSchema` continua pendente (kernel.md "Nível 3").
 */
export function gabaritoEditavel(interacao: InteractionKind): boolean {
	return interacao === 'type' || interacao === 'cloze';
}

/**
 * Digitar ↔ completar a lacuna: as duas guardam o gabarito do mesmo jeito.
 * Só quando o aluno responde no idioma ALVO — numa "traduza para o português"
 * a resposta é a tradução, e uma lacuna na frase em inglês com a tradução de
 * gabarito não seria exercício nenhum.
 */
export function podeAlternar(interacao: InteractionKind, lingua: 'source' | 'target'): boolean {
	return gabaritoEditavel(interacao) && lingua === 'target';
}

/**
 * O texto da questão pode mudar sem descolar do gabarito?
 *
 * Num prompt de ÁUDIO de "montar" ou "escolher", o texto é o que o aluno ouve
 * e as peças ou alternativas foram tiradas dele: mudar só o texto faria o
 * aluno ouvir uma frase e ter de montar outra. Texto escrito é o que ele lê,
 * e corrigir um erro de digitação ali não desmonta nada.
 */
export function textoEditavel(interacao: InteractionKind, prompt: string): boolean {
	return gabaritoEditavel(interacao) || prompt === 'text';
}

/**
 * A chave do enunciado padrão para o tipo escolhido. Voltar ao tipo gravado
 * devolve a chave gravada; virar lacuna é "Complete a frase"; virar digitar,
 * só em áudio tem padrão ("Ouça e escreva") — no texto não há um enunciado
 * que sirva a toda frase, e o professor escreve o dele.
 */
export function chaveDoEnunciado(
	gravado: { interacao: InteractionKind; chave?: string; prompt: string },
	escolhida: InteractionKind
): string | undefined {
	if (escolhida === gravado.interacao) return gravado.chave;
	if (escolhida === 'cloze') return 'fill-the-blank';
	if (escolhida === 'type') return gravado.prompt === 'audio' ? 'listen-and-type' : undefined;
	return gravado.chave;
}

/**
 * As correções que fazem sentido para o tipo. **O corretor de digitar e de
 * lacuna é sempre o tolerante** (`tolerantScore`): "exata" não mudava nada na
 * nota, e "sequência", "conjunto" e "ASR" não sabem ler uma lista de textos.
 * A escolha real é UMA: corrigir automaticamente ou o professor corrigir
 * (rubrica) — e só em digitar, que vira escrita livre. Nos outros tipos o
 * corretor é o do tipo, e não há o que escolher.
 */
export function modosDeCorrecao(interacao: InteractionKind, gravado: GradingMode): GradingMode[] {
	if (interacao === 'type') return ['tolerant', 'rubric'];
	if (interacao === 'cloze') return ['tolerant'];
	return [gravado];
}

/** O modo que a tela mostra marcado: um gravado que não vale mais cai no primeiro que vale. */
export function modoInicial(interacao: InteractionKind, gravado: GradingMode): GradingMode {
	const modos = modosDeCorrecao(interacao, gravado);
	return modos.includes(gravado) ? gravado : modos[0];
}

/** O detalhe de cada escolha, nos cartões de "Como é corrigida" (o título já diz qual é). */
export const DETALHE_DO_MODO: Partial<Record<GradingMode, string>> = {
	tolerant: 'Uma letra trocada vira "quase", não erro.',
	rubric: 'O aluno escreve um texto livre, e a resposta fica "a comentar" na tela da tentativa.'
};

/** Como cada tipo é corrigido, numa frase para o professor. */
export function comoECorrigida(interacao: InteractionKind, modo: GradingMode): string {
	if (modo === 'rubric') {
		return 'Você corrige: o aluno escreve um texto livre e a resposta fica "a comentar" na tela da tentativa. Nada é corrigido automaticamente.';
	}
	switch (interacao) {
		case 'type':
		case 'cloze':
			return 'Automática e tolerante: uma letra trocada vira "quase", não erro.';
		case 'choice':
			return 'Automática: certo ou errado, pela alternativa escolhida.';
		case 'assemble':
			return 'Automática, pela ordem das palavras: o que sair do lugar aparece grifado para o aluno.';
		case 'order':
			return 'Automática, pela sequência: o que sair do lugar aparece grifado para o aluno.';
		case 'match':
			return 'Automática, par a par.';
		case 'select':
			return 'Automática, pelo trecho marcado.';
		case 'speak':
			return 'Automática, pela transcrição da fala. Sotaque não reprova: o resultado mais duro é "quase".';
	}
}
