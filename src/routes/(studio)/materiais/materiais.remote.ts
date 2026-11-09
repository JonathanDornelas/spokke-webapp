import { z } from 'zod';
import { command, form, getRequestEvent } from '$app/server';
import { error } from '@sveltejs/kit';
import { requireTeacher } from '$lib/server/auth/guard';
import { materiais } from '$lib/server/db/repos/content-units';
import {
	camposMaterial,
	montarMaterial,
	preencherTraducao,
	traduzirLote
} from '$lib/server/atividades/material-form';
import { parseRawMaterial } from '$lib/kernel/content/parse-raw';
import { campoIdioma } from '$lib/idiomas';
import { getTradutor, type ParDeIdiomas } from '$lib/server/traducao';
import {
	MAX_LINHAS_POR_LOTE,
	avisoDeLimite,
	gravarMateriais
} from '$lib/server/atividades/gravar-materiais';

/**
 * A biblioteca avulsa — material que existe fora de qualquer atividade.
 *
 * **Toda remote function é um endpoint HTTP público** (regra inviolável nº 3):
 * cada uma começa pelo guard, e nenhuma toca o Prisma cru — só o repositório,
 * que injeta o `teacherId` (regra nº 4).
 *
 * É o mesmo `montarMaterial` da etapa 2 do wizard: cadastrar uma frase aqui e
 * cadastrá-la lá tem que produzir exatamente o mesmo `ContentUnit`, senão o
 * "trazer da biblioteca" traria um dado de outra forma.
 */

function teacherOf() {
	return requireTeacher(getRequestEvent().locals);
}

/**
 * Na biblioteca a tradução vai do idioma DO MATERIAL para a língua do aluno
 * que a página manda (a mesma que ela usa para a IA). Material sem idioma não
 * tem de onde traduzir.
 */
function parDaBiblioteca(idioma: string | null, linguaDoAluno: string | null): ParDeIdiomas | null {
	return idioma && linguaDoAluno ? { de: idioma, para: linguaDoAluno } : null;
}

export const criarMaterial = form(z.object(camposMaterial), async (campos) => {
	const teacher = teacherOf();
	const comTraducao = await preencherTraducao(
		campos,
		parDaBiblioteca(campos.idioma, campos.linguaDoAluno),
		getTradutor()
	);
	if ('error' in comTraducao) return { ok: false as const, error: comTraducao.error };
	const montado = montarMaterial(comTraducao.campos);
	if ('error' in montado) return { ok: false as const, error: montado.error };

	// Igual ao que já existe? Reaproveita — a biblioteca é do professor, e duas
	// linhas com a mesma frase são duas coisas para ele manter em dia sem
	// ganhar nada. O novo respeita o estoque do plano (`gravarMateriais`).
	const r = await gravarMateriais(teacher, {
		kind: campos.kind,
		unidades: [montado.dados],
		idioma: campos.idioma
	});
	if (r.foraDoLimite > 0) {
		return {
			ok: false as const,
			error: avisoDeLimite(r) ?? 'Não coube no plano.',
			motivo: r.motivo
		};
	}
	return { ok: true as const, id: r.ids[0], reused: r.reaproveitados > 0 };
});

/** Colar uma lista direto na biblioteca — mesmo parser da etapa 2. */
export const criarMateriaisEmLote = form(
	z.object({
		kind: z.enum(['SentencePair', 'VocabItem']),
		raw: z.string(),
		idioma: campoIdioma,
		linguaDoAluno: campoIdioma
	}),
	async ({ kind, raw, idioma, linguaDoAluno }) => {
		const teacher = teacherOf();
		const par = parDaBiblioteca(idioma, linguaDoAluno);
		// Sem idioma no material não há de onde traduzir: a linha sem separador
		// volta a ficar de fora, como antes do tradutor.
		const tradutor = par ? getTradutor() : null;

		const linhas = raw.split('\n').filter((linha) => linha.trim()).length;
		const lidas = parseRawMaterial(kind, raw, { traduzirSemSeparador: !!tradutor });
		if (lidas.length === 0) {
			return {
				ok: false as const,
				error: 'Nenhuma linha tem o separador. Use "alvo · tradução", um por linha.'
			};
		}

		if (lidas.length > MAX_LINHAS_POR_LOTE) {
			return { ok: false as const, error: `Cole até ${MAX_LINHAS_POR_LOTE} linhas por vez.` };
		}

		const traduzido = await traduzirLote(kind, lidas, par, tradutor);
		if ('error' in traduzido) return { ok: false as const, error: traduzido.error };
		const unidades = traduzido.unidades;

		const r = await gravarMateriais(teacher, { kind, unidades, idioma });
		if (r.criados === 0 && r.reaproveitados === 0) {
			return {
				ok: false as const,
				error: avisoDeLimite(r) ?? 'Nada coube no plano.',
				motivo: r.motivo
			};
		}
		return {
			ok: true as const,
			added: r.criados,
			reused: r.reaproveitados,
			ignored: linhas - unidades.length,
			traduzidas: traduzido.traduzidas,
			foraDoLimite: r.foraDoLimite,
			aviso: avisoDeLimite(r),
			motivo: r.motivo
		};
	}
);

export const atualizarMaterial = form(
	z.object({ contentId: z.string(), ...camposMaterial }),
	async ({ contentId, ...campos }) => {
		const teacher = teacherOf();
		const comTraducao = await preencherTraducao(
			campos,
			parDaBiblioteca(campos.idioma, campos.linguaDoAluno),
			getTradutor()
		);
		if ('error' in comTraducao) return { ok: false as const, error: comTraducao.error };
		const montado = montarMaterial(comTraducao.campos);
		if ('error' in montado) return { ok: false as const, error: montado.error };

		const atualizado = await materiais(teacher).update(
			contentId,
			campos.kind,
			montado.dados,
			campos.idioma
		);
		if (!atualizado) error(404, 'Material não encontrado');
		return { ok: true as const };
	}
);

/**
 * Apagar da BIBLIOTECA. Some dos rascunhos junto (o vínculo é N:N e cai com
 * ele), mas o que está no ar continua intacto: a versão publicada guarda uma
 * cópia congelada (regra nº 7). A tela diz isso antes de perguntar.
 */
export const apagarMaterial = command(
	z.object({ contentId: z.string() }),
	async ({ contentId }) => {
		const teacher = teacherOf();
		return { removed: await materiais(teacher).remove(contentId) };
	}
);
