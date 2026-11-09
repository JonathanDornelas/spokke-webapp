import type { PageServerLoad } from './$types';
import { requireTeacher } from '$lib/server/auth/guard';
import { prisma } from '$lib/server/db/client';
import { parseContentUnit } from '$lib/kernel/content/parse';
import type { ContentUnitKind } from '$lib/kernel/content/types';
import { idiomaMaisFrequente, idiomaOuNulo } from '$lib/idiomas';
import { KERNEL_TO_KIND, type MaterialRow } from '$lib/components/material-form';
import { estadoDaIa } from '$lib/server/ia/estado';
import { contaProfessor } from '$lib/server/db/repos/teachers';
import { isTraducaoLigada } from '$lib/server/traducao';

/**
 * A biblioteca. Diferente da etapa 2 do wizard, aqui o recorte é TUDO que o
 * professor cadastrou — inclusive o que ele colou dentro de uma atividade, que
 * é o caminho normal de o material entrar (db.md "ContentUnit.activities").
 *
 * Cada material tem a sua TAG DE IDIOMA (`ContentUnit.targetLang`,
 * `$lib/idiomas.ts`): a da atividade, quando nasceu numa, ou a escolhida aqui.
 * Material sem tag aparece como "sem idioma" — nunca com um idioma inventado.
 */
export const load: PageServerLoad = async ({ locals }) => {
	const teacher = requireTeacher(locals);

	// Leitura direta do Prisma, mas SEMPRE escopada (db.md "Repositórios"): o
	// `teacherId` entra no `where` porque é ele que impede o vazamento.
	const rows = await prisma.contentUnit.findMany({
		where: { teacherId: teacher.id },
		orderBy: { createdAt: 'desc' },
		include: { _count: { select: { activities: true } } }
	});

	const materials: MaterialRow[] = rows.map((row) => {
		const kind = row.kind as ContentUnitKind;
		const data = parseContentUnit(kind, row.data);
		const [primary, secondary] =
			'target' in data
				? [data.target, data.source]
				: 'term' in data
					? [data.term, data.translation]
					: 'title' in data
						? [data.title, data.text.slice(0, 90)]
						: [data.lines[0]?.text ?? '', `${data.lines.length} falas`];

		return {
			id: row.id,
			kind: KERNEL_TO_KIND[kind],
			primary,
			secondary,
			idioma: idiomaOuNulo(row.targetLang),
			usedIn: row._count.activities,
			// Os campos crus, para "Editar" reabrir o mesmo formulário preenchido
			// — `secondary` é resumo (o texto vem cortado) e reeditar a partir
			// dele perderia conteúdo. São também o que a tela compara para dizer
			// "você já tem esta frase" enquanto o professor digita.
			target:
				'target' in data
					? data.target
					: 'term' in data
						? data.term
						: 'title' in data
							? data.title
							: '',
			source: 'source' in data ? data.source : 'translation' in data ? data.translation : '',
			raw: 'text' in data ? data.text : '',
			note: 'note' in data ? (data.note ?? '') : '',
			example: 'example' in data ? (data.example ?? '') : '',
			questions: 'questions' in data ? data.questions : [],
			lines: 'lines' in data ? data.lines : []
		};
	});

	// O idioma com que um material NOVO nasce: o que o professor mais usa nas
	// atividades (e, sem atividade nenhuma, o mais comum na biblioteca). A IA
	// escreve no idioma escolhido no formulário; a língua de apoio é a da
	// atividade mais recente.
	const [atividadesDoProfessor, ultima] = await Promise.all([
		prisma.activity.findMany({ where: { teacherId: teacher.id }, select: { targetLang: true } }),
		prisma.activity.findFirst({
			where: { teacherId: teacher.id },
			orderBy: { updatedAt: 'desc' },
			select: { sourceLang: true }
		})
	]);
	// O que ele de fato usa vence; sem nada criado ainda, vale o que ele disse que
	// ensina (Conta) — e só sem isso o seletor nasce em "sem idioma".
	const perfil = await contaProfessor(teacher).perfil();
	const idiomaPadrao =
		idiomaMaisFrequente(atividadesDoProfessor.map((a) => a.targetLang)) ??
		idiomaMaisFrequente(materials.map((m) => m.idioma)) ??
		perfil.idiomas[0] ??
		null;
	const iaIdiomas = {
		alvo: idiomaPadrao ?? 'en-US',
		origem: ultima?.sourceLang ?? perfil.idiomaDosAlunos
	};

	return {
		materials,
		// Quantos estão em uso de verdade — "3 no total, 2 em atividades" é o
		// que o professor quer saber antes de apagar alguma coisa.
		usedInCount: materials.filter((m) => m.usedIn > 0).length,
		idiomaPadrao,
		ia: await estadoDaIa(teacher, iaIdiomas),
		// A mesma língua do aluno (`iaIdiomas.origem`) é o destino da tradução
		// automática do material (adr-006).
		iaIdiomas,
		traducaoAutomatica: isTraducaoLigada()
	};
};
