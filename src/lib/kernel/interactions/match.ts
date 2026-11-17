import { z } from 'zod';
import { setScore } from '../grading/compare';
import { assignRuntimeIds } from '../random';
import { mesmoTexto, regra, repetidos, vazios } from '../qualidade/comparar';
import type { Problema } from '../qualidade/types';
import { promptSkills } from './skills';
import type { InteractionType, MatchRuntime } from './types';

/**
 * Parear duas colunas. Correção por CONJUNTO — a ordem em que o aluno faz os
 * pares não importa, e acertar parte deles vale parcial (design-system.md:
 * parcial nunca é somado ao erro).
 *
 * As duas colunas são embaralhadas com seeds diferentes de propósito: se o
 * id do esquerdo e o do direito viessem do mesmo índice de autoria, o par
 * certo seria `l2 → r2` e o exercício se resolveria lendo o payload.
 */

export const matchAuthoringSchema = z.object({
	pairs: z.array(z.object({ left: z.string().min(1), right: z.string().min(1) })).min(2)
});

export const matchAnswerSchema = z.object({
	pairs: z.array(z.object({ left: z.string(), right: z.string() }))
});

export type MatchPayload = z.infer<typeof matchAuthoringSchema>;
export type MatchAnswer = z.infer<typeof matchAnswerSchema>;

function columns(payload: MatchPayload, seed: string) {
	const indexed = payload.pairs.map((pair, originalIndex) => ({ ...pair, originalIndex }));
	return {
		left: assignRuntimeIds(indexed, `${seed}:left`, 'l'),
		right: assignRuntimeIds(indexed, `${seed}:right`, 'r')
	};
}

export const match: InteractionType<
	typeof matchAuthoringSchema,
	typeof matchAnswerSchema,
	MatchRuntime
> = {
	id: 'match',
	authoringSchema: matchAuthoringSchema,
	answerSchema: matchAnswerSchema,

	toRuntime: (payload, seed) => {
		const { left, right } = columns(payload, seed);
		return {
			left: left.map((l) => ({ id: l.id, text: l.text.left })),
			right: right.map((r) => ({ id: r.id, text: r.text.right }))
		};
	},

	grade: (payload, answer, _profile, seed) => {
		const { left, right } = columns(payload, seed);
		const leftIndex = new Map(left.map((l) => [l.id, l.text]));
		const rightIndex = new Map(right.map((r) => [r.id, r.text]));

		let correct = 0;
		// Uma marca por par que o aluno FEZ, para a tela mostrar quais ligações
		// não fecharam — "2 de 4 pares certos" não diz quais são os dois.
		const marks: { text: string; ok: boolean }[] = [];
		for (const pair of answer.pairs) {
			const esquerdo = leftIndex.get(pair.left);
			const direito = rightIndex.get(pair.right);
			if (esquerdo === undefined || direito === undefined) {
				return { ok: false, error: 'par com id desconhecido' };
			}
			const acertou = esquerdo.originalIndex === direito.originalIndex;
			if (acertou) correct++;
			marks.push({ text: `${esquerdo.left} → ${direito.right}`, ok: acertou });
		}

		const score = setScore(correct, payload.pairs.length);
		if (score.value >= 1) return { ok: true, value: score };

		// Aqui as marcas NÃO viram lista escrita no veredito, como em `assemble`:
		// os cartões estão na tela, então quem mostra o erro são eles mesmos,
		// pintados. Repetir "bookshop → relatório" embaixo seria dizer duas vezes
		// a mesma coisa, e a segunda pior — sem as colunas ao lado.
		//
		// Por isso também não vai o `expected`: entregar o pareamento certo por
		// escrito é entregar o exercício inteiro resolvido, e diferente de uma
		// frase o aluno não tem como reconstruí-lo de memória.
		//
		// A ordem importa: uma marca por par RESPONDIDO, na ordem em que o aluno
		// mandou — é assim que o componente sabe qual cartão pintar.
		return { ok: true, value: { ...score, feedback: '', marks } };
	},

	skills: promptSkills,

	conferir: (payload, ctx) => {
		const esquerdos = payload.pairs.map((p) => p.left);
		const direitos = payload.pairs.map((p) => p.right);
		const problemas: Problema[] = [...vazios([...esquerdos, ...direitos], ctx.perfis)];
		// Dois "livro" à direita: duas ligações ficam igualmente certas, e a correção
		// (pelo par de origem) dá uma delas como errada.
		for (const texto of [...repetidos(esquerdos, ctx.perfis), ...repetidos(direitos, ctx.perfis)]) {
			problemas.push(regra('pares-repetidos', 'erro', texto));
		}
		// "hotel" ↔ "hotel": o par se liga sozinho. Um em cinco não estraga a
		// questão, mas não testa nada.
		for (const par of payload.pairs) {
			if (mesmoTexto(par.left, par.right, ctx.perfis)) {
				problemas.push(regra('par-igual-nos-dois-lados', 'aviso', par.left));
			}
		}
		return problemas;
	}
};
