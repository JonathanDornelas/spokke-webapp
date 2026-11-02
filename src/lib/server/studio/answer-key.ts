import type { InteractionKind } from '$lib/kernel/interactions/types';

/**
 * O gabarito em texto legível, para o editor de item (nível 3). Cada
 * interação guarda o gabarito numa forma diferente — `accepted` de strings
 * em `type`/`cloze`, sequências de tokens em `assemble`, um índice em
 * `choice`/`select` — e o professor precisa ver todas elas do mesmo jeito:
 * uma resposta principal mais as variantes aceitas.
 *
 * Roda SÓ no servidor, atrás do guard: isto é gabarito (regra inviolável
 * nº 1). Quem monta o payload do aluno é `server/player/runtime.ts`.
 */
export interface AnswerKey {
	answer: string;
	/**
	 * O que é aceito ALÉM da resposta principal — nunca ela de novo. Quando a
	 * principal vinha repetida aqui, o editor a mostrava como variante, e
	 * corrigir uma resposta errada ("teh" → "the") deixava a errada aceita.
	 */
	variants: string[];
}

const vazio: AnswerKey = { answer: '', variants: [] };

function textos(valor: unknown): string[] {
	return Array.isArray(valor) ? valor.filter((v): v is string => typeof v === 'string') : [];
}

export function readableAnswerKey(kind: InteractionKind, payload: unknown): AnswerKey {
	if (typeof payload !== 'object' || payload === null) return vazio;
	const p = payload as Record<string, unknown>;

	switch (kind) {
		case 'type':
		case 'cloze': {
			const aceitas = textos(p.accepted);
			return { answer: aceitas[0] ?? '', variants: aceitas.slice(1) };
		}

		// A sequência certa (e as variantes de ordem) viram frase de novo.
		case 'assemble': {
			const sequencias = Array.isArray(p.accepted)
				? p.accepted.map((seq) => textos(seq).join(' ')).filter(Boolean)
				: [];
			return { answer: sequencias[0] ?? '', variants: sequencias.slice(1) };
		}

		case 'choice': {
			const opcoes = textos(p.options);
			const certa = typeof p.correctIndex === 'number' ? opcoes[p.correctIndex] : undefined;
			return { answer: certa ?? '', variants: [] };
		}

		case 'select': {
			const segmentos = Array.isArray(p.segments) ? p.segments : [];
			const certo =
				typeof p.correctIndex === 'number'
					? (segmentos[p.correctIndex] as { text?: unknown } | undefined)
					: undefined;
			const texto = typeof certo?.text === 'string' ? certo.text : '';
			return { answer: texto, variants: [] };
		}

		case 'order': {
			const linhas = textos(p.lines);
			return { answer: linhas.join(' → '), variants: [] };
		}

		case 'match': {
			const pares = Array.isArray(p.pairs) ? p.pairs : [];
			const legiveis = pares
				.map((par) => {
					const { left, right } = (par ?? {}) as { left?: unknown; right?: unknown };
					return typeof left === 'string' && typeof right === 'string' ? `${left} → ${right}` : '';
				})
				.filter(Boolean);
			return { answer: legiveis.join(' · '), variants: [] };
		}

		case 'speak': {
			const alvo = typeof p.target === 'string' ? p.target : '';
			return { answer: alvo, variants: [] };
		}
	}
}
