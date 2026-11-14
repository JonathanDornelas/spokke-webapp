import type { InteractionKind } from '$lib/kernel/interactions/types';

/**
 * O que o aluno FAZ em cada tipo de interação, por extenso — o professor nunca
 * vê a chave do kernel ("cloze"). Usado na revisão, nos resultados e no relato de
 * problema. As regras do editor de questão moram em `$lib/atividades/questao.ts`.
 */
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
