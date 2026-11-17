import type { Item } from '../item';
import { getInteraction } from '../interactions/registry';
import type { PerfisDaConferencia, Problema } from './types';

export type {
	CodigoDoProblema,
	ContextoDaConferencia,
	GravidadeDoProblema,
	PerfisDaConferencia,
	Problema
} from './types';
export { CODIGOS_DAS_REGRAS } from './types';

/**
 * As REGRAS da conferência sobre uma questão (kernel.md "Conferência de
 * qualidade"): a interação confere a si mesma, pelo registry — não existe um
 * `switch` por formato aqui, como não existe na correção.
 *
 * Pura e barata: roda na geração (a reprovada vai para as "de fora"), na
 * revisão (os avisos de cada linha) e no editor (enquanto o professor escreve).
 */
export function conferirItem(
	item: Pick<Item, 'prompt' | 'interaction' | 'grading'>,
	perfis: PerfisDaConferencia
): Problema[] {
	return getInteraction(item.interaction.type).conferir(item.interaction.payload, {
		prompt: item.prompt,
		answerLang: item.grading.answerLang ?? 'target',
		modo: item.grading.mode,
		perfis
	});
}

/** A questão corrige errado ou não testa nada: na geração, ela não entra sozinha. */
export function temErro(problemas: readonly Problema[]): boolean {
	return problemas.some((p) => p.gravidade === 'erro');
}

/**
 * Os problemas na ordem em que a tela os mostra: erro antes de aviso, e o mesmo
 * problema (código e trecho) uma vez só.
 */
export function ordenarProblemas(problemas: readonly Problema[]): Problema[] {
	const vistos = new Set<string>();
	const unicos = problemas.filter((p) => {
		const chave = `${p.codigo}|${p.trecho ?? ''}`;
		if (vistos.has(chave)) return false;
		vistos.add(chave);
		return true;
	});
	return [
		...unicos.filter((p) => p.gravidade === 'erro'),
		...unicos.filter((p) => p.gravidade !== 'erro')
	];
}
