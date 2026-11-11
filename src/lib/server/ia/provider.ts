import type { TipoDeImagem } from '$lib/ia/arquivo';
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
	/**
	 * O que o provedor lê ALÉM do texto do pedido (adr-003 "Imagem e vídeo"). A fila de reserva só
	 * passa um pedido com arquivo a quem o lê, e `gerarPropostas` recusa ANTES de cobrar quando
	 * ninguém lê: o Claude lê imagem e não lê áudio.
	 */
	readonly le: ReadonlySet<TipoDeAnexo>;
	propor(
		pedido: PedidoDeMateriais,
		opcoes: { schema: unknown; timeoutMs: number }
	): Promise<RespostaDoModelo>;
}

/**
 * O arquivo que vai junto do pedido: a foto de uma página ou a fala de um vídeo. Vive só na memória
 * da requisição — não é gravado em lugar nenhum, nem no bucket, nem no banco.
 */
export type AnexoDaIa =
	| { tipo: 'imagem'; mime: TipoDeImagem; dados: Uint8Array }
	| { tipo: 'audio'; mime: 'audio/wav'; dados: Uint8Array; segundos: number };

export type TipoDeAnexo = AnexoDaIa['tipo'];

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

/** Os bytes do anexo em base64, como os dois provedores pedem o arquivo inline. */
export function base64DoAnexo(anexo: AnexoDaIa): string {
	return Buffer.from(anexo.dados.buffer, anexo.dados.byteOffset, anexo.dados.byteLength).toString(
		'base64'
	);
}
