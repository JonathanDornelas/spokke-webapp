import { normalize } from '../language/normalize';
import type { LanguageProfile } from '../language/profile';
import type { Prompt } from '../interactions/types';
import type { ContextoDaConferencia, PerfisDaConferencia, Problema } from './types';

/**
 * As réguas da conferência. Toda comparação passa pelo normalizador do kernel
 * (regra nº 6) — e pelos DOIS perfis da atividade, porque a conferência nem
 * sempre sabe em que língua está cada texto (as alternativas de "escolha a
 * tradução" estão na língua do aluno; as de "ouça e escolha", na alvo).
 * Igual por qualquer um dos dois é igual: é o lado seguro para dizer "estas duas
 * alternativas são a mesma coisa".
 */

function chaves(texto: string, perfis: PerfisDaConferencia): string[] {
	return [perfis.alvo, perfis.origem].map((p) => normalize(texto, p));
}

/** Os dois textos são o mesmo, por qualquer um dos perfis. Vazio nunca é igual a nada. */
export function mesmoTexto(a: string, b: string, perfis: PerfisDaConferencia): boolean {
	const ka = chaves(a, perfis);
	const kb = chaves(b, perfis);
	return ka.some((k, i) => k !== '' && k === kb[i]);
}

/** O texto some no normalizador (só pontuação, só espaço). */
export function vazioNormalizado(texto: string, perfil: LanguageProfile): boolean {
	return normalize(texto, perfil) === '';
}

/** Os textos que somem no normalizador dos dois perfis: não há o que comparar com eles. */
export function vazios(textos: string[], perfis: PerfisDaConferencia): Problema[] {
	return textos
		.filter((t) => vazioNormalizado(t, perfis.alvo) && vazioNormalizado(t, perfis.origem))
		.map((t) => regra('texto-vazio', 'erro', t));
}

/**
 * Os textos que aparecem mais de uma vez na lista — o primeiro de cada grupo,
 * como foi escrito. Na ordem em que aparecem.
 */
export function repetidos(textos: string[], perfis: PerfisDaConferencia): string[] {
	const saida: string[] = [];
	textos.forEach((texto, i) => {
		const antes = textos.slice(0, i).some((outro) => mesmoTexto(outro, texto, perfis));
		if (antes) return;
		const depois = textos.slice(i + 1).some((outro) => mesmoTexto(outro, texto, perfis));
		if (depois) saida.push(texto);
	});
	return saida;
}

/**
 * O texto que o aluno LÊ no enunciado, quando há um. No prompt de áudio o
 * `text` é o que ele OUVE (e é gabarito — kernel.md "Registry"): ele não conta
 * como "a resposta está escrita na tela".
 */
export function textoVisivel(prompt: Prompt): string | null {
	if (prompt.kind !== 'text' && prompt.kind !== 'composite') return null;
	const texto = prompt.text?.trim();
	return texto ? texto : null;
}

/** O perfil da língua em que o aluno responde. */
export function perfilDaResposta(ctx: ContextoDaConferencia): LanguageProfile {
	return ctx.answerLang === 'source' ? ctx.perfis.origem : ctx.perfis.alvo;
}

/** Um problema achado por regra. */
export function regra(
	codigo: Problema['codigo'],
	gravidade: Problema['gravidade'],
	trecho?: string
): Problema {
	return trecho === undefined ? { codigo, gravidade } : { codigo, gravidade, trecho };
}

/**
 * "A resposta é o enunciado": a resposta certa igual ao texto que o aluno lê.
 * É o caso da "la cometa" — o tradutor devolveu a palavra sem traduzir, e a
 * questão mostrava a resposta.
 */
export function respostaNoEnunciado(resposta: string, ctx: ContextoDaConferencia): Problema | null {
	const visivel = textoVisivel(ctx.prompt);
	if (!visivel || !mesmoTexto(resposta, visivel, ctx.perfis)) return null;
	return regra('resposta-igual-ao-enunciado', 'erro', resposta);
}
