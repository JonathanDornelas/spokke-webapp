import type { CicloDeCobranca, PlanoPago } from './catalogo';

/**
 * O PREÇO de cada plano, em centavos — o número que o checkout COBRA e o que a
 * vitrine MOSTRA (`$lib/content/planos.ts` escreve o texto a partir daqui). Um
 * lugar só, porque cobrar um valor e anunciar outro é o erro de cobrança que o
 * professor descobre na fatura do cartão.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ OS VALORES SÃO PLACEHOLDER — pendência de produto (CLAUDE.md         │
 * │ "Pendências"). Com o gateway ligado, ESTE é o valor da assinatura:   │
 * │ troque antes de pôr o token de produção.                             │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * O anual é cobrado de uma vez, a cada doze meses (`frequency: 12` no
 * Mercado Pago), e vale dez mensalidades.
 */
export const PRECO_EM_CENTAVOS: Readonly<Record<PlanoPago, Record<CicloDeCobranca, number>>> = {
	basico: { mensal: 2_900, anual: 29_000 },
	pro: { mensal: 4_900, anual: 49_000 },
	super: { mensal: 8_900, anual: 89_000 }
};

/** Marca para o desenvolvedor: nenhum preço deste arquivo foi aprovado. */
export const PRECOS_SAO_PLACEHOLDER = true;

/** Quantos meses cada cobrança cobre. */
export const MESES_DO_CICLO: Readonly<Record<CicloDeCobranca, number>> = { mensal: 1, anual: 12 };

/** "R$ 29", "R$ 290" — sem centavos quando o valor é redondo, com eles quando não é. */
export function reais(centavos: number): string {
	const redondo = centavos % 100 === 0;
	return (centavos / 100)
		.toLocaleString('pt-BR', {
			style: 'currency',
			currency: 'BRL',
			minimumFractionDigits: redondo ? 0 : 2,
			maximumFractionDigits: redondo ? 0 : 2
		})
		.replace(/[\u00a0\u202f]/g, ' ');
}

/** O preço por MÊS que a vitrine mostra: no anual, o total dividido por doze, arredondado. */
export function porMes(plano: PlanoPago, ciclo: CicloDeCobranca): number {
	const total = PRECO_EM_CENTAVOS[plano][ciclo];
	return Math.round(total / MESES_DO_CICLO[ciclo] / 100) * 100;
}
