import { NOME_DO_PLANO, type Limites, type PlanoId } from './catalogo';
import type { MotivoDoBloqueio } from './motivos';

/**
 * O estado de acesso como a TELA o recebe — um DTO, nunca a linha do professor
 * (auth.md "Serialização"). Isomórfico: o componente tipa contra isto sem
 * importar nada de `$lib/server`.
 *
 * A DECISÃO não mora aqui. `podeCriarAtividade`, `podePublicar` e afins são o
 * resultado de `can()` (`$lib/server/billing/entitlements.ts`) calculado no
 * servidor e copiado para cá — a tela mostra a mesma decisão que barra o botão,
 * nunca uma cópia da regra.
 */
export interface ResumoDoAcesso {
	plano: PlanoId | null;
	/** "Básico", "Pro", "Período de teste", "Plano da escola" — já em português. */
	rotulo: string;
	origem: 'trial' | 'assinatura' | 'escola' | 'equipe' | 'nenhum';
	situacao: 'trial' | 'ativa' | 'atrasada' | 'cancelada' | 'expirada';
	limites: Limites;
	uso: { atividades: number; materiais: number };
	creditos: { saldo: number; renovamEm: Date | null };
	trialEndsAt: Date | null;
	/** Dias inteiros de trial que faltam, arredondados para cima. Nulo fora do trial. */
	diasDeTrial: number | null;
	currentPeriodEnd: Date | null;
	cancelAtPeriodEnd: boolean;
	escola: { id: string; nome: string } | null;
	pode: {
		publicar: boolean;
		criarAtividade: boolean;
		criarMaterial: boolean;
		usarIa: boolean;
	};
	/** Por que cada porta está fechada — nulo quando está aberta. */
	motivo: {
		publicar: MotivoDoBloqueio | null;
		criarAtividade: MotivoDoBloqueio | null;
		criarMaterial: MotivoDoBloqueio | null;
		usarIa: MotivoDoBloqueio | null;
	};
}

export function rotuloDoPlano(
	plano: PlanoId | null,
	origem: ResumoDoAcesso['origem'],
	situacao: ResumoDoAcesso['situacao']
): string {
	if (origem === 'trial') return 'Período de teste';
	if (origem === 'escola') return 'Plano da escola';
	if (origem === 'equipe') return 'Equipe Spokke';
	if (situacao === 'expirada' && plano === null) return 'Teste encerrado';
	if (!plano) return 'Sem plano';
	return NOME_DO_PLANO[plano];
}

/** "3 de 10" sem passar de 100% na barra — quem rebaixou pode estar acima do limite. */
export function fracaoDeUso(usado: number, limite: number): number {
	if (limite <= 0) return 1;
	return Math.min(1, usado / limite);
}
