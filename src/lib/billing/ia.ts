import { CUSTO_IA } from './catalogo';
import type { MotivoDoBloqueio } from './motivos';

/**
 * Os tipos da geração por IA que atravessam servidor → página → componente
 * (docs/adr-003-ia-gemini.md). Isomórfico: `MaterialForm.svelte` tipa contra
 * isto sem importar nada de `$lib/server`.
 */

/** De onde a IA parte: o pedido escrito, a foto de uma página ou a fala de um vídeo. */
export type FonteDaIa = 'prompt' | 'imagem' | 'video';

/** O teto de fala que um vídeo manda por geração (10 minutos), o mesmo no navegador e no servidor. */
export const MAXIMO_DE_FALA_S = 600;

/** Se dá para gerar e por quê não — a MESMA decisão de `can(estado, 'usar_ia')`, calculada no servidor. */
export interface EstadoDaIa {
	/** Existe provedor ligado (`LLM_PROVIDER`). */
	configurada: boolean;
	pode: boolean;
	motivo: MotivoDoBloqueio | null;
	saldo: number;
	custoPorProposta: number;
	/**
	 * As fontes que a IA ligada LÊ. O prompt é sempre lido; imagem e vídeo dependem de um provedor
	 * que leia o arquivo (o Claude lê imagem e não lê áudio; o Gemini lê os dois).
	 */
	fontes: { imagem: boolean; video: boolean };
	/** Os idiomas em que a IA vai escrever, por extenso — a biblioteca não tem idioma próprio. */
	idiomas: string | null;
}

/** Uma proposta da IA como a página a recebe — já validada pelo servidor. */
export interface PropostaIa {
	id: string;
	dados: Record<string, unknown>;
	resumo: { esq: string; dir: string };
	reused: boolean;
}

export type RespostaDaGeracao =
	| { ok: true; propostas: PropostaIa[]; saldo: number }
	| { ok: false; error: string; motivo?: MotivoDoBloqueio | null };

/** Quanto custa uma geração, em créditos, separado no que o professor paga por quê. */
export interface CustoDaGeracao {
	/** As propostas pedidas. O que não servir volta. */
	propostas: number;
	/** Ler o arquivo: a foto, ou os minutos de fala do vídeo. Zero no prompt. */
	leitura: number;
	/** Os minutos cobrados na leitura do vídeo (por minuto começado). Zero fora dele. */
	minutos: number;
	total: number;
}

/**
 * A conta dos créditos de uma geração — UMA função, usada pelo botão da tela ("Gerar 10 propostas ·
 * 13 créditos") e pelo débito do servidor (`gerarPropostas`). O que o professor vê antes de clicar é
 * o que sai do saldo dele. Os valores e o porquê deles estão em `CUSTO_IA` (catálogo).
 *
 * No vídeo, os segundos são os da FALA que vai para a IA (o trecho escolhido), contados pelo servidor
 * no arquivo que chegou; o minuto começado conta inteiro.
 */
export function custoDaGeracao(pedido: {
	quantos: number;
	fonte: FonteDaIa;
	segundos?: number | null;
}): CustoDaGeracao {
	const propostas = pedido.quantos * CUSTO_IA.porProposta;
	if (pedido.fonte === 'imagem') {
		return {
			propostas,
			leitura: CUSTO_IA.porImagem,
			minutos: 0,
			total: propostas + CUSTO_IA.porImagem
		};
	}
	if (pedido.fonte === 'video') {
		const minutos = Math.max(1, Math.ceil((pedido.segundos ?? 0) / 60 - 1e-9));
		const leitura = minutos * CUSTO_IA.porMinutoDeFala;
		return { propostas, leitura, minutos, total: propostas + leitura };
	}
	return { propostas, leitura: 0, minutos: 0, total: propostas };
}
