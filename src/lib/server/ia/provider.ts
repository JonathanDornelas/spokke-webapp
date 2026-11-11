import type { PedidoDeMateriais } from './prompt';

/**
 * Interface própria de geração por IA — nenhum código de produto fala com o SDK
 * de um provedor direto (CLAUDE.md "Pendências", docs/adr-003-ia-gemini.md).
 * Trocar de provedor é escrever outra implementação disto.
 *
 * Devolve o JSON CRU (`unknown`): quem chama valida com Zod — o provedor não é
 * confiável para dizer que o que devolveu está no formato (regra inviolável nº 9).
 */
export interface GeradorDeMateriais {
	readonly nome: string;
	propor(
		pedido: PedidoDeMateriais,
		opcoes: { schema: unknown; timeoutMs: number }
	): Promise<RespostaDoModelo>;
}

export interface RespostaDoModelo {
	dados: unknown;
	/** O que o PROVEDOR informou ter gastado; nulo quando ele não informa. */
	uso: UsoDoModelo | null;
	/**
	 * Quem respondeu de fato, quando não é o `nome` do gerador: com a reserva (`reserva.ts`) é um
	 * dos provedores da fila, e o Claude pode ter passado a outro modelo numa recusa. É o que vai
	 * para `AiUsage.model` — a conta dos preços precisa saber qual modelo gastou o quê.
	 */
	modelo?: string;
}

/**
 * Tokens de uma chamada, como o provedor contou — é o que vai para `AiUsage` e
 * substitui a estimativa por trás dos preços (docs/adr-002-billing.md "Preços").
 */
export interface UsoDoModelo {
	entrada: number | null;
	saida: number | null;
	/** O raciocínio do modelo, cobrado como saída. */
	raciocinio: number | null;
}

/** O provedor recusou ou caiu — a geração é estornada e a tela diz para tentar de novo. */
export class FalhaDoProvedor extends Error {}
