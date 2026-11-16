import { z } from 'zod';
import { command, getRequestEvent } from '$app/server';
import { error } from '@sveltejs/kit';
import { requireTeacher } from '$lib/server/auth/guard';
import { atividades } from '$lib/server/db/repos/activities';
import { gerarPropostas } from '$lib/server/ia/gerar';
import { validarProposta } from '$lib/server/ia/schemas';
import { avisoDeLimite, gravarMateriais } from '$lib/server/atividades/gravar-materiais';
import { contentUnitKinds } from '$lib/kernel/content/types';
import { labelForTag, languageLabels } from '$lib/kernel/language/profiles';
import { campoIdioma } from '$lib/idiomas';

/**
 * "Gerar com IA" — o terceiro modo de entrada de material, ao lado de digitar
 * e colar (paginas.md "Studio"), servindo a etapa 2 do wizard E a biblioteca.
 * Ver docs/adr-003-ia-gemini.md.
 *
 * Toda remote function é endpoint público (regra nº 3): abre pelo guard, e a
 * atividade (quando há) é resolvida pelo repositório escopado — nunca um
 * idioma ou id de atividade aceito do corpo sem conferir de quem é.
 */

function teacherOf() {
	return requireTeacher(getRequestEvent().locals);
}

const tagValida = z.string().refine((tag) => Object.values(languageLabels).includes(tag), {
	message: 'Idioma desconhecido.'
});

/**
 * Pede propostas. Os idiomas vêm da ATIVIDADE quando há uma (etapa 2); na
 * biblioteca, que não tem idioma, o professor escolhe e eles chegam como tag.
 */
export const gerarPropostasIa = command(
	z.object({
		requestId: z.string().uuid(),
		kind: z.enum(contentUnitKinds),
		pedido: z.string().trim().min(3, 'Descreva o que você quer gerar.').max(1_000),
		quantos: z.union([z.literal(5), z.literal(10), z.literal(20)]),
		activityId: z.string().optional(),
		sourceLang: tagValida.optional(),
		targetLang: tagValida.optional()
	}),
	async ({ requestId, kind, pedido, quantos, activityId, sourceLang, targetLang }) => {
		const teacher = teacherOf();
		let idiomas: { alvo: string; origem: string };
		if (activityId) {
			const atividade = await atividades(teacher).byId(activityId);
			if (!atividade) error(404, 'Atividade não encontrada');
			idiomas = { alvo: atividade.targetLang, origem: atividade.sourceLang };
		} else {
			if (!sourceLang || !targetLang) {
				return { ok: false as const, error: 'Escolha o idioma alvo e o do aluno.' };
			}
			idiomas = { alvo: targetLang, origem: sourceLang };
		}
		return gerarPropostas(teacher, {
			requestId,
			kind,
			pedido,
			quantos,
			idiomaAlvo: labelForTag(idiomas.alvo),
			idiomaOrigem: labelForTag(idiomas.origem),
			tags: idiomas
		});
	}
);

/**
 * Grava as propostas MARCADAS. Elas voltam do browser — então são revalidadas
 * aqui contra o schema do kernel, exatamente como se o professor as tivesse
 * digitado (e é o que elas são: conteúdo dele, aprovado por ele). Entram pela
 * mesma porta da autoria manual: reaproveitam o igual e respeitam o estoque do
 * plano (`gravarMateriais`).
 */
export const aceitarPropostasIa = command(
	z.object({
		kind: z.enum(contentUnitKinds),
		propostas: z.array(z.record(z.string(), z.unknown())).min(1).max(20),
		activityId: z.string().optional(),
		/** Biblioteca: a tag de idioma das propostas (o idioma alvo pedido à IA). */
		idioma: campoIdioma
	}),
	async ({ kind, propostas, activityId, idioma }) => {
		const teacher = teacherOf();
		const atividade = activityId ? await atividades(teacher).byId(activityId) : null;
		if (activityId && !atividade) error(404, 'Atividade não encontrada');
		// A mesma regra do vocabulário da geração: a proposta volta do browser.
		const tags = atividade
			? { alvo: atividade.targetLang, origem: atividade.sourceLang }
			: { alvo: idioma ?? 'und', origem: 'und' };
		const unidades = propostas
			.map((p) => validarProposta(kind, p, tags))
			.filter((d): d is NonNullable<typeof d> => d !== null);
		if (unidades.length === 0) {
			return { ok: false as const, error: 'Nenhuma proposta marcada está completa.' };
		}

		const r = await gravarMateriais(teacher, { kind, unidades, activityId, idioma });
		if (r.criados === 0 && r.reaproveitados === 0) {
			return {
				ok: false as const,
				error: avisoDeLimite(r) ?? 'Nada coube no plano.',
				motivo: r.motivo
			};
		}
		return {
			ok: true as const,
			added: activityId ? r.criados + r.reaproveitados : r.criados,
			reused: r.reaproveitados,
			ignored: propostas.length - unidades.length,
			foraDoLimite: r.foraDoLimite,
			aviso: avisoDeLimite(r),
			motivo: r.motivo
		};
	}
);
