import { relatosRepo } from '../db/repos/relatos';

/**
 * Quanto um relato de problema fica guardado. Ele carrega a resposta do aluno
 * naquela questão e os dados do aparelho (auth.md "Dados do aluno e LGPD":
 * retenção explícita, aplicada por job) — seis meses bastam para a equipe achar
 * e corrigir o erro, e para um relato velho ainda servir de comparação.
 *
 * Quem aplica é o worker, uma vez por hora (`worker/index.ts`). Apagar a
 * tentativa leva os relatos dela antes disso (`onDelete: Cascade`).
 */
export const RETENCAO_DOS_RELATOS_DIAS = 180;

export function limiteDaRetencao(agora: Date = new Date()): Date {
	return new Date(agora.getTime() - RETENCAO_DOS_RELATOS_DIAS * 24 * 60 * 60 * 1000);
}

export async function purgarRelatosVencidos(agora: Date = new Date()): Promise<number> {
	return relatosRepo.purgarAntigos(limiteDaRetencao(agora));
}
