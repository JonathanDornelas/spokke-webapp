import type { CicloDeCobranca, PlanoPago } from './catalogo';

/**
 * O PREÇO de cada plano, em centavos — o número que o checkout COBRA e o que a
 * vitrine MOSTRA (`$lib/content/planos.ts` escreve o texto a partir daqui). Um
 * lugar só, porque cobrar um valor e anunciar outro é o erro de cobrança que o
 * professor descobre na fatura do cartão.
 *
 * **Como os valores saíram** (decisão do dono, 2026-11-11, docs/adr-002-billing.md
 * "Preços"): o servidor é custo FIXO e se paga com cinco assinantes do Básico;
 * o que separa um plano do outro é o Gemini no PIOR caso — todos os créditos do
 * ciclo gastos em textos com perguntas. A regra é que, nesse caso, nenhum plano
 * deixe menos que o Básico depois do Mercado Pago (4,49%) e do imposto (6%).
 * Mexer em `creditosPorCiclo` (`catalogo.ts`) ou no raciocínio do modelo
 * (`gemini-provider.ts`) é refazer essa conta.
 *
 * O anual é cobrado de uma vez, a cada doze meses (`frequency: 12` no
 * Mercado Pago), e vale dez mensalidades. O Scholar não tem preço aqui: é
 * orçado por escola (ADR-005).
 */
export const PRECO_EM_CENTAVOS: Readonly<Record<PlanoPago, Record<CicloDeCobranca, number>>> = {
	basico: { mensal: 2_900, anual: 29_000 },
	pro: { mensal: 5_900, anual: 59_000 },
	super: { mensal: 9_900, anual: 99_000 }
};

/** Marca para o desenvolvedor: verdadeiro enquanto nenhum preço deste arquivo foi aprovado. */
export const PRECOS_SAO_PLACEHOLDER = false;

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
