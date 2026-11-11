import type { InteractionKind } from '$lib/kernel/interactions/types';
import { ROTULO_DA_INTERACAO } from '$lib/atividades/editor-item';

/**
 * O resumo LEGÍVEL de um item gerado — a frase que a etapa de revisão e a
 * tela de detalhes mostram no lugar do payload.
 *
 * **O professor nunca vê JSON** (paginas.md). Estas três tabelas são o que
 * traduz "o gerador `listen-type` produziu um item" para "digitar a frase ao
 * ouvir o áudio", e moram aqui porque duas telas precisam da mesma frase — um
 * `+page.server.ts` não pode exportá-las (só `load`, `actions` e as opções de
 * rota passam pela validação do build).
 */
const RESUMO_POR_GERADOR: Record<string, string> = {
	'translate-assemble': 'Montar a frase a partir da tradução',
	'translate-type': 'Digitar a tradução da frase',
	'listen-assemble': 'Ouvir e montar a frase',
	'listen-type': 'Digitar a frase ao ouvir o áudio',
	'listen-choice': 'Ouvir e escolher entre as opções',
	'cloze-target': 'Completar a lacuna na frase',
	'speak-target': 'Falar a frase em voz alta',
	'vocab-choice': 'Escolher a tradução do termo',
	'passage-comprehension': 'Responder uma pergunta sobre o texto',
	'order-lines': 'Colocar as falas do diálogo na ordem',
	'closing-match': 'Associar os pares — revisão do que apareceu na atividade'
};

/**
 * Item sem `generatedBy` é autoria manual (nível 3 de kernel.md): o resumo é o
 * tipo de questão, porque não há gerador que diga mais — e a chave do kernel
 * ("type", "cloze") nunca vai para a tela.
 */
export function resumoDoItem(generatedBy: string | null, interacao?: InteractionKind): string {
	if (!generatedBy) {
		return interacao
			? `${ROTULO_DA_INTERACAO[interacao]} · criada por você`
			: 'Questão criada por você';
	}
	return RESUMO_POR_GERADOR[generatedBy] ?? 'Questão gerada do material';
}

/**
 * O ícone é por FAMÍLIA de interação, não um por tipo: oito ícones diferentes
 * numa lista viram ruído, e o que o professor precisa distinguir de relance é
 * "escrever", "escolher", "montar", "ouvir".
 */
export type ItemIcon = 'assemble' | 'choice' | 'reading' | 'select' | 'writing';

const ICONE_POR_INTERACAO: Record<InteractionKind, ItemIcon> = {
	assemble: 'assemble',
	choice: 'choice',
	type: 'writing',
	cloze: 'writing',
	match: 'select',
	order: 'select',
	select: 'select',
	speak: 'reading'
};

export function iconeDoItem(interaction: InteractionKind): ItemIcon {
	return ICONE_POR_INTERACAO[interaction];
}

export const ROTULO_DO_MATERIAL = {
	SentencePair: 'par de frases',
	VocabItem: 'item de vocabulário',
	Passage: 'texto',
	Dialogue: 'diálogo'
} as const;

/**
 * O TIPO que a tela de detalhes mostra numa pílula ao lado de cada questão:
 * o que o aluno FAZ, numa palavra — ouvir, falar, escrever, escolher, montar.
 * Sai do prompt e da interação juntos: "digitar" com prompt de áudio é escuta
 * antes de ser escrita, e é isso que o professor quer distinguir de relance.
 */
export type TipoDoItem = 'escuta' | 'fala' | 'escrita' | 'escolha' | 'montar';

export function tipoDoItem(
	prompt: 'text' | 'audio' | 'image' | 'composite',
	interaction: InteractionKind
): TipoDoItem {
	if (prompt === 'audio') return 'escuta';
	switch (interaction) {
		case 'speak':
			return 'fala';
		case 'type':
		case 'cloze':
			return 'escrita';
		case 'choice':
		case 'select':
			return 'escolha';
		case 'assemble':
		case 'match':
		case 'order':
			return 'montar';
	}
}
