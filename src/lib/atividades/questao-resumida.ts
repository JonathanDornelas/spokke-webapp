/**
 * A QUESTÃO RESUMIDA: o cartão pequeno que mostra uma questão do jeito que o
 * aluno a vê, sem ser a questão inteira — o rótulo da habilidade, o miolo (o
 * áudio e as alternativas, a frase com a lacuna, as peças) e uma legenda do que
 * ele faz. É o desenho do Claude Design ("O que sai daqui" e a prévia de cada
 * material), e o mesmo componente serve os dois lugares
 * (`QuestaoResumida.svelte`).
 *
 * É DADO serializável: na prévia de um material quem o monta é o servidor, a
 * partir da questão gerada (`$lib/server/atividades/questao-resumida.ts`); na
 * etapa 1, as amostras (`amostras.ts`). Tela do professor — a resposta certa
 * aparece marcada, como no design.
 */

export type HabilidadeDaResumida = 'escuta' | 'fala' | 'leitura' | 'escrita';

export type CorpoDaResumida =
	| { forma: 'ouvir-escolher'; certa: string; outra?: string }
	| { forma: 'ouvir-montar'; pecas: string[] }
	| { forma: 'ouvir-digitar'; resposta: string }
	| { forma: 'falar'; frase: string }
	| { forma: 'ler-escolher'; texto: string; pergunta?: string; certa: string; outra?: string }
	| { forma: 'lacuna'; antes: string; resposta: string; depois: string; apoio?: string }
	| { forma: 'montar'; apoio: string; pecas: string[] }
	| { forma: 'digitar'; texto: string; resposta: string }
	| { forma: 'ordenar'; falas: string[] }
	| { forma: 'associar'; pares: { esquerda: string; direita: string }[] }
	| { forma: 'tocar'; antes: string; palavra: string; depois: string };

export interface QuestaoResumida {
	id: string;
	habilidade: HabilidadeDaResumida;
	/** O que o aluno faz, numa linha: "Ouve e escolhe a frase". */
	legenda: string;
	corpo: CorpoDaResumida;
	/** Falso = um tipo desligado deixa esta questão de fora: o cartão aparece apagado. */
	entra: boolean;
}

export const ROTULO_DA_HABILIDADE: Record<HabilidadeDaResumida, string> = {
	escuta: 'Escuta',
	fala: 'Fala',
	leitura: 'Leitura',
	escrita: 'Escrita'
};

/**
 * O ícone de cada habilidade na bolha do ROTEIRO — a revisão e a tela da
 * atividade desenham a mesma linha (paginas.md "A revisão é o ROTEIRO").
 */
export const ICONE_DA_HABILIDADE: Record<HabilidadeDaResumida, string> = {
	escuta:
		'M4 12.5V11a8 8 0 1116 0v1.5M2.5 14.5a2 2 0 012-2H7v7H4.5a2 2 0 01-2-2zM21.5 14.5a2 2 0 00-2-2H17v7h2.5a2 2 0 002-2z',
	fala: 'M12 2.5a3 3 0 00-3 3v5a3 3 0 006 0v-5a3 3 0 00-3-3zM5.5 11.5a6.5 6.5 0 0013 0M12 18v3.5',
	leitura:
		'M3 5.5h6a3 3 0 013 3v10a2.5 2.5 0 00-2.5-2.5H3zM21 5.5h-6a3 3 0 00-3 3v10a2.5 2.5 0 012.5-2.5H21z',
	escrita: 'M4 20h4l11-11a2.83 2.83 0 10-4-4L4 16z'
};

/** A ordem dos cartões: a do desenho. */
export const ORDEM_DAS_HABILIDADES: readonly HabilidadeDaResumida[] = [
	'escuta',
	'fala',
	'leitura',
	'escrita'
];

/**
 * UMA questão por habilidade, na ordem do desenho: a prévia de um material é um
 * exemplo de cada tipo, não a lista de tudo o que ele rende (pedido do dono do
 * repositório — três cartões "Escuta" lado a lado confundiam). Entre as da mesma
 * habilidade fica a primeira que ENTRA com os tipos de agora; a apagada só
 * aparece quando nenhuma entra, para o tipo desligado continuar à vista.
 */
export function umaPorHabilidade(questoes: readonly QuestaoResumida[]): QuestaoResumida[] {
	return ORDEM_DAS_HABILIDADES.flatMap((habilidade) => {
		const daHabilidade = questoes.filter((q) => q.habilidade === habilidade);
		const escolhida = daHabilidade.find((q) => q.entra) ?? daHabilidade[0];
		return escolhida ? [escolhida] : [];
	});
}
