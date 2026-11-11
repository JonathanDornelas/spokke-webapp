/**
 * O catálogo de planos — os LIMITES, num lugar só. Isomórfico e puro: o servidor
 * decide acesso a partir daqui (`$lib/server/billing/entitlements.ts`) e a tela
 * de planos desenha os mesmos números (`$lib/content/planos.ts`), então o que a
 * tabela PROMETE e o que a conta PODE fazer nunca divergem.
 *
 * Preço NÃO mora aqui: está em `./precos.ts`, que a vitrine e o checkout leem —
 * ver docs/adr-002-billing.md "Preços".
 *
 * **Os limites são de ESTOQUE** (decisão do dono do repositório): contam o que
 * o professor TEM agora, não o que ele criou no mês. Arquivar uma atividade ou
 * apagar um material libera a vaga. Créditos de IA são a exceção: renovam a
 * cada ciclo mensal e não acumulam.
 */

/** Os planos que se assinam. `scholar` não está aqui: ele vem da ESCOLA, nunca de `Teacher.plan`. */
export const PLANOS_PAGOS = ['basico', 'pro', 'super'] as const;
export type PlanoPago = (typeof PLANOS_PAGOS)[number];

/** Todo plano que uma conta pode ter em vigor, incluindo o da escola. */
export type PlanoId = PlanoPago | 'scholar';

export const CICLOS = ['mensal', 'anual'] as const;
export type CicloDeCobranca = (typeof CICLOS)[number];

export interface Limites {
	/** Atividades que existem ao mesmo tempo (rascunho ou no ar), sem contar as arquivadas. */
	atividades: number;
	/** Materiais na biblioteca. Material reaproveitado não ocupa vaga nova. */
	materiais: number;
	/** Créditos de IA por ciclo mensal. Não acumulam. */
	creditosPorCiclo: number;
	/** O plano dá acesso à geração por IA. Crédito sem isto não serve para nada. */
	ia: boolean;
}

export const LIMITES: Readonly<Record<PlanoPago, Limites>> = {
	basico: { atividades: 10, materiais: 60, creditosPorCiclo: 0, ia: false },
	pro: { atividades: 30, materiais: 300, creditosPorCiclo: 300, ia: true },
	super: { atividades: 80, materiais: 1000, creditosPorCiclo: 1000, ia: true }
};

export const NOME_DO_PLANO: Readonly<Record<PlanoId, string>> = {
	basico: 'Básico',
	pro: 'Pro',
	super: 'Super',
	scholar: 'Scholar'
};

/**
 * O trial: quem se cadastra entra nele com os limites do básico. Acabou sem
 * plano, perde criar e publicar — os links continuam no ar (billing.md
 * "Degradação, não desligamento").
 */
export const TRIAL = { dias: 14, plano: 'basico' } as const satisfies {
	dias: number;
	plano: PlanoPago;
};

/**
 * A conta de quem OPERA a plataforma (`PLATFORM_ADMIN_IDS`): o maior plano, sempre ativo, sem
 * vencimento — para a equipe testar tudo, inclusive a IA, sem uma assinatura de mentira no
 * banco nem um "plano concedido" que um dia alguém encerra. Quem aplica é `estadoDaEquipe`
 * (`$lib/server/billing/entitlements.ts`), na leitura; nada é gravado na conta.
 */
export const EQUIPE = { plano: 'super' } as const satisfies { plano: PlanoPago };

/**
 * Dias depois do fim do período em que a assinatura ainda conta como em dia
 * ("atrasada", mas liberada). Passou disso, vira "expirada".
 */
export const CARENCIA_DIAS = 7;

/** Quanto custa, em créditos, cada material que a IA PROPÕE. Estornado se a proposta não serve. */
export const CUSTO_IA = { porProposta: 1 } as const;

export function ehPlanoPago(valor: unknown): valor is PlanoPago {
	return typeof valor === 'string' && (PLANOS_PAGOS as readonly string[]).includes(valor);
}

export function ehCiclo(valor: unknown): valor is CicloDeCobranca {
	return typeof valor === 'string' && (CICLOS as readonly string[]).includes(valor);
}
