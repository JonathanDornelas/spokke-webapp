/**
 * Os passos da geração das questões, como a tela "Gerando" os mostra. O
 * servidor (`$lib/server/atividades/geracao.ts`) manda os ids e os números; o
 * texto mora aqui, para a tela e o teste falarem a mesma língua.
 */

export const PASSOS_DA_GERACAO = [
	'lendo',
	'pares',
	'montando',
	'separando',
	'variantes',
	'salvando'
] as const;
export type PassoDaGeracao = (typeof PASSOS_DA_GERACAO)[number];

export type EstadoDoPasso = 'esperando' | 'andando' | 'feito';

export interface PassoComEstado {
	id: PassoDaGeracao;
	estado: EstadoDoPasso;
	/** O número que o passo descobriu (materiais lidos, questões montadas…). */
	numero?: number;
	/** O segundo número, quando há (as que ficam de fora). */
	outro?: number;
	/** O terceiro, quando há: das de fora, as que a conferência reprovou. */
	terceiro?: number;
}

export interface ProgressoDaGeracao {
	estado: 'andando' | 'pronta' | 'falhou';
	passos: PassoComEstado[];
	erro?: string;
	/** Quando terminou: quantas entraram, quantas ficaram de fora. */
	resultado?: { dentro: number; fora: number };
}

function plural(n: number, um: string, varios: string) {
	return `${n} ${n === 1 ? um : varios}`;
}

/** A frase do passo, no estado em que ele está. */
export function textoDoPasso(passo: PassoComEstado): string {
	const n = passo.numero ?? 0;
	switch (passo.id) {
		case 'lendo':
			return passo.estado === 'feito'
				? `${plural(n, 'material lido', 'materiais lidos')}`
				: 'Lendo os materiais';
		case 'pares':
			return passo.estado === 'feito'
				? n > 0
					? `${plural(n, 'palavra traduzida', 'palavras traduzidas')} para o associar`
					: 'Associar sem palavras das frases desta vez'
				: 'Traduzindo palavras para o associar';
		case 'montando':
			return passo.estado === 'feito'
				? `${plural(n, 'questão montada', 'questões montadas')}`
				: 'Montando as questões de cada material';
		case 'separando':
			if (passo.estado !== 'feito') return 'Separando pela quantidade pedida';
			return [
				`${plural(n, 'entra', 'entram')} na atividade, ${plural(passo.outro ?? 0, 'fica de fora', 'ficam de fora')}`,
				// As reprovadas pela conferência vão para as de fora, com o motivo na revisão.
				passo.terceiro ? `${passo.terceiro} com problema` : ''
			]
				.filter(Boolean)
				.join(', ');
		case 'variantes':
			return passo.estado === 'feito'
				? n > 0
					? `${plural(n, 'outra tradução certa aceita', 'outras traduções certas aceitas')}`
					: 'Traduções conferidas'
				: 'Conferindo outras traduções certas';
		case 'salvando':
			return passo.estado === 'feito' ? 'Questões salvas' : 'Salvando e pedindo o áudio';
	}
}
