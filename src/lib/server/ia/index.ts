import { env } from '$env/dynamic/private';
import { criarClaude } from './claude-provider';
import { criarGemini } from './gemini-provider';
import type { GeradorDeMateriais } from './provider';
import { comReserva } from './reserva';

/**
 * Quais provedores de IA estão ligados, e em que ORDEM. `LLM_PROVIDER` é uma lista separada por
 * vírgula — `"claude,gemini"` é o Claude primeiro e o Gemini se ele falhar (`reserva.ts`); um
 * nome só é aquele provedor sozinho. Vazio = IA DESLIGADA, como `TTS_PROVIDER` vazio é "sem
 * escuta": o botão "Gerar" fica travado com o motivo escrito, em vez de cobrar crédito por uma
 * geração que não vai existir.
 */
const PROVEDORES = {
	claude: {
		chave: () => env.ANTHROPIC_API_KEY,
		modelo: () => env.CLAUDE_MODEL,
		variaveis: 'ANTHROPIC_API_KEY e CLAUDE_MODEL',
		criar: criarClaude
	},
	gemini: {
		chave: () => env.GEMINI_API_KEY,
		modelo: () => env.GEMINI_MODEL,
		variaveis: 'GEMINI_API_KEY e GEMINI_MODEL',
		criar: criarGemini
	}
} satisfies Record<
	string,
	{
		chave: () => string | undefined;
		modelo: () => string | undefined;
		variaveis: string;
		criar: (config: { apiKey: string; model: string }) => GeradorDeMateriais;
	}
>;

type NomeDoProvedor = keyof typeof PROVEDORES;

function ehProvedor(nome: string): nome is NomeDoProvedor {
	return nome in PROVEDORES;
}

function nomesPedidos(): string[] {
	return (env.LLM_PROVIDER ?? '')
		.split(',')
		.map((nome) => nome.trim())
		.filter(Boolean);
}

/** Os provedores da lista com a configuração COMPLETA, na ordem pedida. */
function completos(): { nome: NomeDoProvedor; apiKey: string; model: string }[] {
	return nomesPedidos().flatMap((nome) => {
		if (!ehProvedor(nome)) return [];
		const apiKey = PROVEDORES[nome].chave();
		const model = PROVEDORES[nome].modelo();
		return apiKey && model ? [{ nome, apiKey, model }] : [];
	});
}

let cache: { chave: string; gerador: GeradorDeMateriais } | null = null;

export function getGerador(): GeradorDeMateriais | null {
	const nomes = nomesPedidos();
	if (nomes.length === 0) return null;
	for (const nome of nomes) {
		if (!ehProvedor(nome)) {
			throw new Error(
				`LLM_PROVIDER: "${nome}" não tem implementação. Use "claude", "gemini" ou os dois em ordem ("claude,gemini").`
			);
		}
		const { chave, modelo, variaveis } = PROVEDORES[nome];
		if (!chave() || !modelo()) {
			// Configuração pela metade fica de FORA da fila, não vira erro: lançar aqui virava 500
			// no clique de "Gerar" de quem pôs o nome antes da chave. O aviso fica no log.
			console.warn(`[ia] "${nome}" está em LLM_PROVIDER sem ${variaveis}: fica de fora.`);
		}
	}
	const prontos = completos();
	if (prontos.length === 0) return null;

	const chave = prontos.map((p) => `${p.nome}:${p.model}:${p.apiKey.slice(-6)}`).join('|');
	if (cache?.chave !== chave) {
		cache = {
			chave,
			gerador: comReserva(
				prontos.map((p) => PROVEDORES[p.nome].criar({ apiKey: p.apiKey, model: p.model }))
			)
		};
	}
	return cache.gerador;
}

/**
 * A IA está ligada quando ao menos um provedor da lista está COMPLETO. Era `!!LLM_PROVIDER`: com
 * o provedor escolhido e a chave ainda por vir, a tela oferecia o botão e o clique quebrava. A
 * tela e o servidor têm de concordar sobre "ligada".
 */
export function isIaConfigurada(): boolean {
	return nomesPedidos().every(ehProvedor) && completos().length > 0;
}
