import { z } from 'zod';
import { tolerantScore } from '../grading/compare';
import { normalize } from '../language/normalize';
import { graphemeCount, tokenize } from '../language/tokenize';
import { regra, textoVisivel, vazios } from '../qualidade/comparar';
import type { Problema } from '../qualidade/types';
import { promptSkills } from './skills';
import type { InteractionType, TextRuntime } from './types';

/**
 * Abaixo deste tamanho a palavra da lacuna aparecer no apoio não diz nada: o
 * "a" do inglês e o artigo "a" do português são palavras diferentes que se
 * escrevem igual. A partir dele é o "hotel" e o "chocolate" — a lacuna está
 * resolvida na frase de cima.
 */
const MIN_CARACTERES_PARA_LACUNA_NO_APOIO = 4;

/**
 * Completar a lacuna. É `type` com a frase mascarada visível — a mecânica de
 * correção é a mesma (tolerante, com parcial), o que muda é o que o aluno vê.
 * `masked` é conteúdo público; `accepted` é gabarito e nunca sai do servidor.
 */

export const clozeAuthoringSchema = z.object({
	masked: z.string().min(1), // ex.: "She ___ ___ working here since 2019."
	accepted: z.array(z.string().min(1)).min(1)
});

export const clozeAnswerSchema = z.object({ text: z.string() });

export type ClozePayload = z.infer<typeof clozeAuthoringSchema>;
export type ClozeAnswer = z.infer<typeof clozeAnswerSchema>;

/**
 * A largura de cada lacuna, em caracteres. É o que faz a lacuna ter o tamanho
 * da palavra que falta em vez de um "___" genérico do mesmo tamanho para
 * "a" e para "extraordinariamente".
 *
 * Com mais de uma lacuna a medida é REPARTIDA em partes iguais, não recortada
 * palavra a palavra: dividir a resposta por espaço é a regra inviolável nº 5,
 * e um idioma sem espaço (japonês, chinês, tailandês) devolveria uma lacuna só
 * do tamanho da frase inteira. Aproximar é honesto; tokenizar errado, não.
 */
function blankWidths(payload: ClozePayload): number[] {
	const lacunas = payload.masked.match(/_{2,}/g)?.length ?? 0;
	if (lacunas === 0) return [];
	const total = graphemeCount(payload.accepted[0] ?? '');
	if (total === 0) return [];
	return Array.from({ length: lacunas }, () => Math.max(2, Math.ceil(total / lacunas)));
}

export const cloze: InteractionType<
	typeof clozeAuthoringSchema,
	typeof clozeAnswerSchema,
	TextRuntime
> = {
	id: 'cloze',
	authoringSchema: clozeAuthoringSchema,
	answerSchema: clozeAnswerSchema,

	toRuntime: (payload) => ({ masked: payload.masked, blanks: blankWidths(payload) }),

	grade: (payload, answer, profile) => ({
		ok: true,
		value: tolerantScore(answer.text, payload.accepted, profile)
	}),

	skills: (prompt) => [...promptSkills(prompt), 'writing'],

	conferir: (payload, ctx) => {
		const problemas: Problema[] = [...vazios(payload.accepted, ctx.perfis)];
		if (!/_{2,}/.test(payload.masked)) problemas.push(regra('lacuna-ausente', 'erro'));

		// A palavra da lacuna escrita na frase de apoio: o aluno copia de cima. A
		// comparação é por PALAVRAS (regra nº 5), nas duas línguas — o apoio está na
		// do aluno e a lacuna na alvo, e o cognato é igual pelas duas.
		const apoio = textoVisivel(ctx.prompt);
		const [lacuna] = payload.accepted;
		if (apoio && lacuna && graphemeCount(lacuna.trim()) >= MIN_CARACTERES_PARA_LACUNA_NO_APOIO) {
			const noApoio = [ctx.perfis.alvo, ctx.perfis.origem].some((perfil) => {
				const frase = tokenize(apoio, perfil).map((p) => normalize(p, perfil));
				const trecho = tokenize(lacuna, perfil)
					.map((p) => normalize(p, perfil))
					.filter(Boolean);
				if (trecho.length === 0 || trecho.length > frase.length) return false;
				return frase.some((_, i) => trecho.every((p, j) => frase[i + j] === p));
			});
			if (noApoio) problemas.push(regra('lacuna-no-apoio', 'aviso', lacuna));
		}
		return problemas;
	}
};
