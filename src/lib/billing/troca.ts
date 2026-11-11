import type { CicloDeCobranca, PlanoPago } from './catalogo';

/**
 * A troca de plano com o gateway ligado (billing.md "Troca de plano"; decisão do
 * dono em 2026-11-11). O Mercado Pago não troca o plano de uma assinatura nem
 * cobra proporcional, então TROCAR é assinar de novo: um checkout com o valor
 * cheio do plano escolhido, um ciclo novo a partir dele, a assinatura antiga
 * cancelada lá e a parte não usada do último pagamento dela devolvida ao cartão
 * (`server/billing/mercadopago/troca.ts`). Vale igual para subir, descer e
 * trocar de ciclo.
 *
 * Isomórfico de propósito: a tela de planos e `solicitarPlano` decidem pela
 * MESMA regra — a tela não oferece o que o servidor recusaria.
 */

/** O plano pago em vigor quando quem pagou por ele foi o gateway. */
export interface PlanoEmVigor {
	plano: PlanoPago;
	ciclo: CicloDeCobranca;
	/**
	 * A assinatura está ativa no gateway e vai renovar sozinha. Falso quando o
	 * professor cancelou a renovação: o plano vale até o fim do período, e
	 * escolher o mesmo plano é assinar de novo.
	 */
	renovaSozinha: boolean;
}

/**
 * Escolher o plano e o ciclo que já renovam sozinhos não abre checkout: seria
 * uma segunda assinatura igual, cobrada de novo por inteiro.
 */
export function ehOPlanoEmVigor(
	emVigor: PlanoEmVigor | null,
	plano: PlanoPago,
	ciclo: CicloDeCobranca
): boolean {
	return !!emVigor && emVigor.renovaSozinha && emVigor.plano === plano && emVigor.ciclo === ciclo;
}
