import { z } from 'zod';
import type { LinhaDoTempo } from '$lib/kernel/language/sintese';

/**
 * A linha do tempo de um áudio (`LinhaDoTempo`, kernel) no formato COMPACTO em
 * que ela viaja e é guardada: o mesmo do cabeçalho `X-Phoneme-Times` do serviço
 * de áudio, `{ fala: [início, fim], sons: [["p", 0.03, 0.08], ...] }`, e o mesmo
 * da coluna `MediaAsset.trechos`. Um formato só nas três pontas: o worker guarda
 * o que o serviço mandou, e o repositório lê o que o worker guardou.
 */
const segundos = z.number().finite().min(0);

const linhaCompacta = z.object({
	fala: z.tuple([segundos, segundos]).nullable(),
	sons: z.array(z.tuple([z.string().min(1), segundos, segundos])).min(1)
});

/** Lê a linha compacta (do cabeçalho ou do banco). Fora do formato, `null`. */
export function lerLinha(valor: unknown): LinhaDoTempo | null {
	const lida = linhaCompacta.safeParse(valor);
	if (!lida.success) return null;
	return {
		fala: lida.data.fala,
		sons: lida.data.sons.map(([s, inicio, fim]) => ({ s, inicio, fim }))
	};
}

/** A linha no formato de guardar (a coluna é `Json`). */
export function linhaParaGuardar(linha: LinhaDoTempo): z.infer<typeof linhaCompacta> {
	return {
		fala: linha.fala,
		sons: linha.sons.map((som) => [som.s, som.inicio, som.fim] as [string, number, number])
	};
}
