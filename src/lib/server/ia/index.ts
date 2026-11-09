import { env } from '$env/dynamic/private';
import { criarGemini } from './gemini-provider';
import type { GeradorDeMateriais } from './provider';

/**
 * Qual provedor de IA está ligado. `LLM_PROVIDER` vazio = IA DESLIGADA, como
 * `TTS_PROVIDER` vazio é "sem escuta": o botão "Gerar" fica travado com o
 * motivo escrito, em vez de cobrar crédito por uma geração que não vai existir.
 */
let cache: { chave: string; gerador: GeradorDeMateriais } | null = null;

export function getGerador(): GeradorDeMateriais | null {
	const nome = env.LLM_PROVIDER;
	if (!nome) return null;
	if (nome !== 'gemini') {
		throw new Error(`LLM_PROVIDER="${nome}" não tem implementação. Use "gemini" ou deixe vazio.`);
	}
	const apiKey = env.GEMINI_API_KEY;
	const model = env.GEMINI_MODEL;
	if (!apiKey || !model) {
		// Configuração pela metade conta como DESLIGADA, não como erro: lançar
		// aqui virava 500 no clique de "Gerar" de quem pôs `LLM_PROVIDER` antes da
		// chave. O aviso fica no log, para quem configura ver o que falta.
		console.warn('[ia] LLM_PROVIDER="gemini" sem GEMINI_API_KEY ou GEMINI_MODEL: IA desligada.');
		return null;
	}
	const chave = `${model}:${apiKey.slice(-6)}`;
	if (cache?.chave !== chave) cache = { chave, gerador: criarGemini({ apiKey, model }) };
	return cache.gerador;
}

/**
 * A IA está ligada só com a configuração COMPLETA. Era `!!LLM_PROVIDER`: com o
 * provedor escolhido e a chave ainda por vir, a tela oferecia o botão e o
 * clique quebrava. A tela e o servidor têm de concordar sobre "ligada".
 */
export function isIaConfigurada(): boolean {
	return env.LLM_PROVIDER === 'gemini' && !!env.GEMINI_API_KEY && !!env.GEMINI_MODEL;
}
