import { z } from 'zod';
import { error } from '@sveltejs/kit';
import { command, getRequestEvent, query } from '$app/server';
import { requireTeacher } from '$lib/server/auth/guard';
import { prisma } from '$lib/server/db/client';
import { contaProfessor } from '$lib/server/db/repos/teachers';
import { codigoDeAvatarSchema } from '$lib/avatar/schema';
import { parseContentUnit } from '$lib/kernel/content/parse';
import type { ContentUnitKind } from '$lib/kernel/content/types';
import { idiomaOuNulo } from '$lib/idiomas';
import { notificacoes } from '$lib/server/db/repos/notificacoes';

/**
 * A busca do cabeçalho do Studio: atividades, materiais e turmas numa consulta
 * só, cada resultado dizendo a que categoria pertence.
 *
 * **Toda remote function é um endpoint HTTP público** (regra nº 3): começa pelo
 * guard, e as três consultas levam o `teacherId` no `where` — buscar sem escopo
 * seria o vazamento mais fácil de escrever do produto inteiro (regra nº 4).
 */

export type CategoriaBusca = 'atividade' | 'material' | 'turma';

/** Um resultado, já pronto para a tela — nunca a entidade do Prisma (server.md). */
export interface ResultadoBusca {
	id: string;
	categoria: CategoriaBusca;
	titulo: string;
	/** A linha de apoio: estado da atividade, tradução do material, nº de alunos. */
	detalhe: string;
	/** A tag de idioma (`$lib/idiomas.ts`) — atividade, material e turma têm a sua. */
	idioma: string | null;
}

/** Teto por categoria: uma bandeja é para escolher de relance, não para paginar. */
const POR_CATEGORIA = 5;

export const buscarNoStudio = query(
	z.object({ termo: z.string(), categorias: z.array(z.enum(['atividade', 'material', 'turma'])) }),
	async ({ termo, categorias }): Promise<ResultadoBusca[]> => {
		const teacher = requireTeacher(getRequestEvent().locals);
		const busca = termo.trim();
		// Um caractere casa com quase tudo e a bandeja vira ruído.
		if (busca.length < 2) return [];

		const quer = (c: CategoriaBusca) => categorias.length === 0 || categorias.includes(c);
		// `insensitive` é do Postgres via Prisma — não `toLowerCase()` no JS, que
		// obrigaria a trazer a tabela inteira para filtrar em memória.
		const contem = { contains: busca, mode: 'insensitive' as const };

		const [atividades, materiais, turmas] = await Promise.all([
			quer('atividade')
				? prisma.activity.findMany({
						where: { teacherId: teacher.id, title: contem },
						orderBy: { updatedAt: 'desc' },
						take: POR_CATEGORIA,
						include: {
							versions: {
								select: { publications: { select: { slug: true } } }
							}
						}
					})
				: [],
			quer('material')
				? prisma.contentUnit.findMany({
						where: { teacherId: teacher.id },
						orderBy: { createdAt: 'desc' },
						// O conteúdo do material é JSON: o filtro por texto não vai no
						// `where` (seria uma expressão sobre `jsonb` por tipo de material,
						// e este produto mistura idiomas na mesma tabela — db.md).
						// Filtra em memória sobre um teto, e não sobre a biblioteca toda.
						take: 200
					})
				: [],
			quer('turma')
				? prisma.classroom.findMany({
						where: { teacherId: teacher.id, name: contem },
						orderBy: { createdAt: 'desc' },
						take: POR_CATEGORIA,
						include: { _count: { select: { students: true } } }
					})
				: []
		]);

		const resultados: ResultadoBusca[] = [];

		for (const atividade of atividades) {
			// O professor nunca vê versão (paginas.md): o estado é o que o ALUNO
			// encontra ao abrir o link.
			const noAr = atividade.versions.some((v) =>
				v.publications.some((p) => !p.slug.includes('~'))
			);
			resultados.push({
				id: atividade.id,
				categoria: 'atividade',
				titulo: atividade.title,
				detalhe: noAr ? 'No ar' : 'Rascunho',
				idioma: idiomaOuNulo(atividade.targetLang)
			});
		}

		const alvo = busca.toLocaleLowerCase();
		for (const unidade of materiais) {
			const dados = parseContentUnit(unidade.kind as ContentUnitKind, unidade.data);
			const [titulo, detalhe] =
				'target' in dados
					? [dados.target, dados.source]
					: 'term' in dados
						? [dados.term, dados.translation]
						: 'title' in dados
							? [dados.title, dados.text.slice(0, 70)]
							: [dados.lines[0]?.text ?? '', `${dados.lines.length} falas`];
			if (!`${titulo} ${detalhe}`.toLocaleLowerCase().includes(alvo)) continue;
			resultados.push({
				id: unidade.id,
				categoria: 'material',
				titulo,
				detalhe,
				idioma: idiomaOuNulo(unidade.targetLang)
			});
			if (resultados.filter((r) => r.categoria === 'material').length >= POR_CATEGORIA) break;
		}

		for (const turma of turmas) {
			resultados.push({
				id: turma.id,
				categoria: 'turma',
				titulo: turma.name,
				detalhe: turma._count.students === 1 ? '1 aluno' : `${turma._count.students} alunos`,
				idioma: idiomaOuNulo(turma.languageTag)
			});
		}

		return resultados;
	}
);

/**
 * Grava o avatar do professor. É a única escrita sobre a própria conta que não
 * passa por um form action — o editor é um modal e a gravação acontece no
 * "Usar este avatar", sem sair da tela.
 *
 * **Toda remote function é um endpoint HTTP público** (regra nº 3): abre pelo
 * guard, e o id vem da SESSÃO — nunca do corpo do pedido, senão qualquer pessoa
 * trocaria o avatar de qualquer professor. O escopo é a própria conta, e é o
 * repositório que a escreve (regra nº 4).
 *
 * O schema valida a FORMA e normaliza: `montarAvatar` aguenta código podre, mas
 * aguentar não é razão para gravar `99-99-99` (ver `avatar/schema.ts`).
 */
export const gravarMeuAvatar = command(codigoDeAvatarSchema, async (avatar) => {
	const teacher = requireTeacher(getRequestEvent().locals);
	await contaProfessor(teacher).gravarAvatar(avatar);
	return { avatar };
});

/**
 * O SINO do cabeçalho (docs/notificacoes.md): a contagem de não lidas e as
 * últimas notificações, com o texto pronto. Do professor da sessão — o
 * repositório põe o `teacherId` em todo `where` (regra nº 4).
 */
export const notificacoesDoSino = query(async () => {
	const teacher = requireTeacher(getRequestEvent().locals);
	return notificacoes(teacher).doSino();
});

/** Abrir uma notificação a marca como lida. Id de outro professor dá 404, sem dizer por quê. */
export const marcarNotificacaoLida = command(z.object({ id: z.string() }), async ({ id }) => {
	const teacher = requireTeacher(getRequestEvent().locals);
	if (!(await notificacoes(teacher).marcarLida(id))) error(404, 'Notificação não encontrada');
	return { ok: true };
});

export const marcarTodasLidas = command(async () => {
	const teacher = requireTeacher(getRequestEvent().locals);
	return { lidas: await notificacoes(teacher).marcarTodas() };
});

/**
 * Abrir a tela de destino conta como ver o aviso (docs/notificacoes.md). Chamado
 * pela PÁGINA quando ela monta, e não pelo loader: o Studio pré-carrega dados ao
 * passar o ponteiro sobre um link, e o loader marcaria como visto o que ninguém
 * abriu.
 */
const alvoVistoSchema = z.discriminatedUnion('secao', [
	z.object({ secao: z.literal('resultados'), activityId: z.string().min(1).max(64) }),
	z.object({ secao: z.literal('atividades'), activityId: z.string().min(1).max(64) }),
	z.object({ secao: z.literal('turmas'), classroomId: z.string().min(1).max(64) }),
	z.object({ secao: z.literal('escola') }),
	z.object({ secao: z.literal('assinatura') })
]);

export const marcarAvisosVistos = command(alvoVistoSchema, async (alvo) => {
	const teacher = requireTeacher(getRequestEvent().locals);
	return { vistos: await notificacoes(teacher).marcarVistas(alvo) };
});
