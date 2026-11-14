import { prisma } from '$lib/server/db/client';
import { modulos } from '$lib/server/db/repos/modules';
import { programacoes } from '$lib/server/db/repos/programacoes';
import { turmas } from '$lib/server/db/repos/classrooms';
import { eventosDaAgenda } from '$lib/server/modulos/agenda';
import { listaDeResultados } from '$lib/server/resultados/lista';
import { estadoDaResposta, quando } from '$lib/server/resultados/leitura';
import { gradingSchema } from '$lib/kernel/item';
import { diaEmBrasilia, diaPorExtenso, proximosDias } from '$lib/modulos/agenda';
import { estadoDaAlocacao, estadoDoModulo } from '$lib/modulos/estado';
import { hojeEmBrasilia, instanteDe, rotuloDaData, somarDias } from '$lib/modulos/programacao';
import { corOuPadrao, etiquetaDaTurma } from '$lib/etiquetas';
import {
	barrasDaSemana,
	rotuloDaSemana,
	saudacao,
	segundaDaSemana,
	type BarraDoDia
} from '$lib/inicio/semana';

type Professor = { id: string };

/** O estado de uma tentativa na lista do início — o que pede o olhar do professor primeiro. */
export type EstadoDaTentativa = 'corrigir' | 'andamento' | 'terminou';

/** A atividade como a peça "Atividades" a diz: os três nomes do produto, mais arquivada. */
export type EstadoDaAtividade = 'rascunho' | 'no-ar' | 'mudancas' | 'arquivada';

/** Os quatro grupos da barra de módulos, na ordem em que a barra os pinta. */
export type GrupoDeModulo = 'programado' | 'erro' | 'parado' | 'sem';

/** O rótulo dos tipos de material, no plural — os chips da peça "Materiais". */
const TIPO_DE_MATERIAL: Record<string, string> = {
	SentencePair: 'Frases',
	VocabItem: 'Vocabulário',
	Passage: 'Textos',
	Dialogue: 'Diálogos'
};

/** "7h30" → 450: a hora da agenda é texto, e "10h" vem antes de "7h" na ordem alfabética. */
function minutos(hora: string): number {
	const [h, m] = hora.split('h');
	return Number(h) * 60 + (Number(m) || 0);
}

/**
 * O INÍCIO do Studio (o desenho "Studio Dashboard", 1b — "mapa da conta"): uma
 * peça por área, cada uma com o número principal e um detalhe próprio. É uma
 * leitura só, e por isso mora fora do loader — `painel.test.ts` prova contra o
 * banco que nada de outro professor entra (regra inviolável nº 4).
 *
 * As contas que já existem em outra tela vêm de lá, nunca reescritas: o acerto
 * médio é o de `listaDeResultados`, o estado do módulo é o de `estadoDoModulo`,
 * a agenda é a de `eventosDaAgenda`. O início dizer um número e a tela da área
 * dizer outro faria o professor duvidar dos dois.
 */
export async function painelDoInicio(teacher: Professor, agora: Date = new Date()) {
	const hoje = hojeEmBrasilia(agora);
	const segunda = segundaDaSemana(hoje);
	const domingo = somarDias(segunda, 6);
	const inicio = instanteDe(segunda, '00:00');
	const fim = instanteDe(somarDias(segunda, 7), '00:00');
	// O escopo de toda tentativa: a atividade é do professor. Repetido em cada
	// consulta de propósito (db.md "Repositórios").
	const doProfessor = { publication: { activityVersion: { activity: { teacherId: teacher.id } } } };

	const [
		tentativasDaSemana,
		enviosDaSemana,
		recentes,
		atividades,
		listaDeModulos,
		alocacoes,
		eventos,
		listaDeTurmas,
		rostos,
		porTipo,
		resultados
	] = await Promise.all([
		prisma.attempt.findMany({
			where: { ...doProfessor, startedAt: { gte: inicio, lt: fim } },
			select: {
				startedAt: true,
				items: {
					select: {
						itemId: true,
						score: true,
						reviewedScore: true,
						reviewedAt: true,
						item: { select: { grading: true } }
					}
				}
			}
		}),
		prisma.delivery.findMany({
			where: { classroom: { teacherId: teacher.id }, createdAt: { gte: inicio, lt: fim } },
			select: { createdAt: true }
		}),
		prisma.attempt.findMany({
			where: doProfessor,
			orderBy: { startedAt: 'desc' },
			take: 5,
			select: {
				id: true,
				name: true,
				startedAt: true,
				finishedAt: true,
				account: { select: { avatar: true } },
				student: {
					select: {
						account: { select: { avatar: true } },
						classroom: { select: { name: true, color: true } }
					}
				},
				items: {
					select: { itemId: true, score: true, reviewedScore: true, reviewedAt: true }
				},
				publication: {
					select: {
						activityVersion: {
							select: {
								activity: { select: { id: true, title: true } },
								items: { select: { id: true, grading: true } }
							}
						}
					}
				}
			}
		}),
		prisma.activity.findMany({
			where: { teacherId: teacher.id },
			select: {
				id: true,
				title: true,
				archivedAt: true,
				updatedAt: true,
				versions: {
					orderBy: { versionNumber: 'desc' },
					select: { createdAt: true, _count: { select: { publications: true } } }
				}
			}
		}),
		modulos(teacher).list(),
		programacoes(teacher).todas(),
		eventosDaAgenda(teacher),
		turmas(teacher).list(),
		prisma.student.findMany({
			where: { teacherId: teacher.id },
			orderBy: { createdAt: 'asc' },
			take: 60,
			select: { name: true, account: { select: { avatar: true } } }
		}),
		// Os da biblioteca: o arquivado saiu dela e do limite do plano.
		prisma.contentUnit.groupBy({
			by: ['kind'],
			where: { teacherId: teacher.id, archivedAt: null },
			_count: { _all: true }
		}),
		listaDeResultados(teacher.id)
	]);

	// ── a semana ──
	// Rubrica sem nota do professor fica fora do acerto, como em Resultados:
	// contá-la reprovaria o aluno por uma fila que é do professor.
	const porDia: Record<string, number> = {};
	let certas = 0;
	let corrigidas = 0;
	for (const t of tentativasDaSemana) {
		const dia = diaEmBrasilia(t.startedAt);
		porDia[dia] = (porDia[dia] ?? 0) + 1;
		for (const linha of t.items) {
			const rubrica = gradingSchema.parse(linha.item.grading).mode === 'rubric';
			const estado = estadoDaResposta(linha, rubrica);
			if (estado === 'pending') continue;
			corrigidas++;
			if (estado === 'correct') certas++;
		}
	}
	const naSemana = (dia: string) => dia >= segunda && dia <= domingo;
	const diasComEnvio = [
		...enviosDaSemana.map((d) => diaEmBrasilia(d.createdAt)),
		...eventos.filter((e) => e.estado !== 'nao_saiu' && naSemana(e.dia)).map((e) => e.dia)
	];
	const barras: BarraDoDia[] = barrasDaSemana(segunda, hoje, porDia, diasComEnvio);
	// "Na fila" é o que AINDA vai sair de hoje a domingo, um cartão por turma por
	// dia — a mesma unidade dos "Próximos 7 dias" (um e-mail por aluno por data).
	const diasQueFaltam = 7 - barras.findIndex((b) => b.hoje);
	const naFila = proximosDias(eventos, hoje, diasQueFaltam).reduce(
		(total, d) => total + d.envios.length,
		0
	);

	// ── as tentativas recentes ──
	const tentativas = recentes.map((t) => {
		const versao = t.publication.activityVersion;
		const rubrica = new Set(
			versao.items.filter((i) => gradingSchema.parse(i.grading).mode === 'rubric').map((i) => i.id)
		);
		let ok = 0;
		let notas = 0;
		let pendentes = 0;
		for (const linha of t.items) {
			const estado = estadoDaResposta(linha, rubrica.has(linha.itemId));
			if (estado === 'pending') pendentes++;
			else {
				notas++;
				if (estado === 'correct') ok++;
			}
		}
		const turma = t.student?.classroom ?? null;
		const estado: EstadoDaTentativa =
			pendentes > 0 ? 'corrigir' : t.finishedAt ? 'terminou' : 'andamento';
		return {
			id: t.id,
			activityId: versao.activity.id,
			atividade: versao.activity.title,
			nome: t.name,
			avatar: t.account?.avatar ?? t.student?.account?.avatar ?? null,
			turma: turma
				? { nome: turma.name, sigla: etiquetaDaTurma(turma.name), cor: corOuPadrao(turma.color) }
				: null,
			quando: quando(t.startedAt),
			acerto: notas > 0 ? Math.round((ok / notas) * 100) : null,
			estado
		};
	});

	// ── atividades ──
	const estadoDe = (a: (typeof atividades)[number]): EstadoDaAtividade => {
		if (a.archivedAt) return 'arquivada';
		if (!a.versions.some((v) => v._count.publications > 0)) return 'rascunho';
		return a.versions[0]._count.publications === 0 ? 'mudancas' : 'no-ar';
	};
	// Mexer nas questões cria ou reescreve a VERSÃO, não a linha da atividade:
	// "editada por último" é a mais recente das duas datas.
	const mexida = (a: (typeof atividades)[number]) =>
		Math.max(a.updatedAt.getTime(), a.versions[0]?.createdAt.getTime() ?? 0);
	const estados = atividades.map(estadoDe);
	const ultimas = atividades
		.filter((a) => !a.archivedAt)
		.sort((x, y) => mexida(y) - mexida(x))
		.slice(0, 3)
		.map((a) => ({ id: a.id, titulo: a.title, estado: estadoDe(a) }));

	// ── módulos ──
	const contagem: Record<GrupoDeModulo, number> = { programado: 0, erro: 0, parado: 0, sem: 0 };
	for (const m of listaDeModulos) {
		const estado = estadoDoModulo(
			alocacoes.filter((a) => a.moduleId === m.id).map((a) => estadoDaAlocacao(a))
		);
		const grupo: GrupoDeModulo =
			estado === 'ativo'
				? 'programado'
				: estado === 'erro'
					? 'erro'
					: estado === 'pausa' || estado === 'fim'
						? 'parado'
						: 'sem';
		contagem[grupo]++;
	}
	const proximo = eventos
		.filter((e) => e.estado === 'programada' || e.estado === 'rascunho')
		.sort((x, y) => x.dia.localeCompare(y.dia) || minutos(x.hora) - minutos(y.hora))[0];

	// ── turmas ──
	const alunos = listaDeTurmas.reduce((t, c) => t + c.students, 0);
	const comEmail = listaDeTurmas.reduce((t, c) => t + c.withEmail, 0);
	// Quem tem avatar vem primeiro: a fileira de rostos é o detalhe da peça, e
	// seis iniciais seguidas não dizem "estes são os seus alunos".
	const fileira = [...rostos]
		.sort((x, y) => Number(!!y.account?.avatar) - Number(!!x.account?.avatar))
		.slice(0, 6)
		.map((s) => ({ nome: s.name, avatar: s.account?.avatar ?? null }));

	// ── resultados ──
	const comTentativa = resultados.activities.filter((a) => a.attempts > 0);
	const comNota = comTentativa.filter((a) => a.correct + a.partial + a.incorrect > 0);
	const menor =
		comNota.length >= 2 ? [...comNota].sort((x, y) => x.correct - y.correct)[0].title : null;

	return {
		saudacao: saudacao(agora),
		/** "sexta, 9 de outubro". */
		hoje: diaPorExtenso(hoje),
		semana: {
			rotulo: rotuloDaSemana(segunda),
			naFila,
			tentativas: tentativasDaSemana.length,
			acerto: corrigidas > 0 ? Math.round((certas / corrigidas) * 100) : null,
			barras
		},
		tentativas,
		atividades: {
			noAr: estados.filter((e) => e === 'no-ar' || e === 'mudancas').length,
			rascunhos: estados.filter((e) => e === 'rascunho').length,
			arquivadas: estados.filter((e) => e === 'arquivada').length,
			ultimas
		},
		modulos: {
			total: listaDeModulos.length,
			atividades: new Set(listaDeModulos.flatMap((m) => m.atividades.map((a) => a.id))).size,
			grupos: contagem,
			proximo: proximo
				? {
						quando: `${proximo.dia === hoje ? 'hoje' : rotuloDaData(proximo.dia)}, ${proximo.hora}`,
						atividade: proximo.atividade.titulo,
						turma: proximo.turma.nome
					}
				: null
		},
		turmas: {
			total: listaDeTurmas.length,
			alunos,
			comEmail,
			fileira,
			/** A primeira turma que tem alunos e nenhum com e-mail — ninguém dela recebe convite. */
			semEmail: listaDeTurmas.find((c) => c.students > 0 && c.withEmail === 0)?.name ?? null,
			/** A primeira turma ainda vazia. */
			vazia: listaDeTurmas.find((c) => c.students === 0)?.name ?? null
		},
		resultados: {
			tentativas: resultados.totalAttempts,
			atividades: comTentativa.length,
			acerto: resultados.averageCorrect,
			distribuicao: resultados.distribuicao,
			menor
		},
		materiais: {
			total: porTipo.reduce((t, g) => t + g._count._all, 0),
			porTipo: porTipo
				.map((g) => ({ rotulo: TIPO_DE_MATERIAL[g.kind] ?? g.kind, n: g._count._all }))
				.sort((x, y) => y.n - x.n)
		}
	};
}

export type PainelDoInicio = Awaited<ReturnType<typeof painelDoInicio>>;
