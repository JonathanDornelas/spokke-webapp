import type { CicloDeCobranca, PlanoPago } from '$lib/billing/catalogo';

/**
 * Interface própria de cobrança — ver .claude/rules/billing.md e
 * docs/adr-002-billing.md. Nenhum código de produto fala com um gateway direto:
 * fala com isto.
 *
 * Dois provedores: o MANUAL (`./manual-provider.ts`), que transforma "assinar"
 * num pedido que a equipe atende pelo painel interno, e o MERCADO PAGO
 * (`./mercadopago/`), o gateway escolhido — pronto, ligado por
 * `BILLING_PROVIDER=mercadopago` quando as credenciais existirem. Os dois
 * escrevem o plano pelo mesmo `./assinaturas.ts`.
 *
 * O resultado é DISCRIMINADO em vez de sempre uma URL: um provedor manual não
 * tem para onde redirecionar, e fingir uma URL faria a tela mandar o professor
 * para lugar nenhum.
 */

export type ResultadoDeAssinatura =
	/** Gateway: o professor segue para o checkout. A confirmação vem pelo webhook, nunca pelo redirect. */
	| { tipo: 'redirecionar'; url: string }
	/** Manual: o pedido foi registrado e a equipe foi avisada. */
	| { tipo: 'pedido'; pedidoId: string };

export type ResultadoDoPortal = { tipo: 'redirecionar'; url: string } | { tipo: 'indisponivel' };

export interface BillingProvider {
	readonly nome: 'manual' | 'mercadopago';
	/**
	 * "Desfazer cancelamento" existe? No manual, sim (a equipe só não renova). No
	 * Mercado Pago, assinatura cancelada não volta: o caminho é assinar de novo.
	 */
	readonly podeDesfazerCancelamento: boolean;
	iniciarAssinatura(
		teacher: { id: string; name: string; email: string },
		plano: PlanoPago,
		ciclo: CicloDeCobranca,
		/** A origem do pedido — é para onde o checkout devolve o professor. */
		contexto: { origem: string }
	): Promise<ResultadoDeAssinatura>;
	abrirPortal(teacherId: string): Promise<ResultadoDoPortal>;
	/**
	 * Para a PRÓXIMA cobrança — o "Cancelar no fim do período" da Conta. Roda antes
	 * de marcar o cancelamento na conta: se o provedor recusar, nada muda aqui, e o
	 * professor não fica achando que cancelou enquanto o cartão continua sendo
	 * cobrado.
	 */
	cancelarRenovacao(teacherId: string): Promise<void>;
}
