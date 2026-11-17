import { TETO_POR_HABILIDADE } from '$lib/kernel/generators/select';
import { skillLabels } from '$lib/kernel/interactions/skill-schema';
import type { Skill } from '$lib/kernel/interactions/types';
import { TIPOS } from './tipos-por-material';

/**
 * Por que as questões ficaram de fora, em português — a revisão diz isso acima
 * da lista, e a etapa de materiais avisa antes de gerar.
 *
 * O caso que trouxe isto: sete vocabulários, só Fala ligada, 10 questões
 * pedidas. Entraram 5 (o teto de fala de então, `TETO_POR_HABILIDADE`) e a revisão dizia
 * que as outras duas "passaram da quantidade pedida (10)" — o professor via 5
 * questões no roteiro e uma frase que não fechava com elas.
 */

/** "A geração põe no máximo 10 questões de fala por atividade." Nulo sem tipo de teto. */
export function fraseDoTeto(habilidades: readonly Skill[]): string | null {
	const comTeto = TIPOS.filter(
		(tipo) => habilidades.includes(tipo) && TETO_POR_HABILIDADE[tipo] !== undefined
	);
	if (comTeto.length === 0) return null;
	const partes = comTeto.map(
		(tipo, i) =>
			`${TETO_POR_HABILIDADE[tipo]} ${i === 0 ? 'questões de ' : 'de '}${skillLabels[tipo].toLocaleLowerCase('pt-BR')}`
	);
	const lista =
		partes.length === 1 ? partes[0] : `${partes.slice(0, -1).join(', ')} e ${partes.at(-1)}`;
	return `A geração põe no máximo ${lista} por atividade.`;
}

/** O que a revisão sabe de cada questão de fora. */
export interface QuestaoDeFora {
	/** A habilidade com teto que já estava cheia quando ela ficou de fora (`tetoCheio`). */
	teto: Skill | null;
	/** A conferência a reprovou (algum problema de gravidade `erro`). */
	erro: boolean;
}

/**
 * A frase acima de "Ficaram de fora": cada motivo que existe na lista, na ordem em
 * que pesa, e o que fazer. Os motivos se distinguem pelo estado de agora:
 *
 * - **o teto**: a habilidade da questão já tem o máximo dentro do roteiro;
 * - **a conferência**: a questão tem problema, e a linha dela diz qual;
 * - **o resto**: com o roteiro cheio, passou da quantidade pedida (ou o professor
 *   a descartou, que não dá para separar); com vaga sobrando, só pode ter sido
 *   descartada — a geração a teria posto dentro.
 */
export function motivoDasDeFora(
	fora: readonly QuestaoDeFora[],
	contexto: { dentro: number; alvo: number }
): string {
	const frases: string[] = [];
	const doTeto = fora.filter((q) => q.teto && !q.erro);
	const comErro = fora.filter((q) => q.erro);
	const resto = fora.filter((q) => !q.teto && !q.erro);

	const teto = fraseDoTeto(doTeto.flatMap((q) => (q.teto ? [q.teto] : [])));
	if (teto) frases.push(teto);
	if (resto.length > 0) {
		const outras = frases.length > 0 ? 'As outras' : '';
		if (contexto.dentro >= contexto.alvo) {
			frases.push(
				`${outras ? `${outras} passaram` : 'Passaram'} da quantidade pedida (${contexto.alvo}) ou você descartou.`
			);
		} else {
			frases.push(outras ? `${outras} você descartou.` : 'Você descartou estas.');
		}
	}
	if (comErro.length > 0) {
		frases.push(
			comErro.length === 1
				? 'A que tem problema fica no fim, com o motivo.'
				: 'As que têm problema ficam no fim, com o motivo.'
		);
	}
	frases.push('Aceite uma para ela entrar no fim do roteiro.');
	return frases.join(' ');
}
