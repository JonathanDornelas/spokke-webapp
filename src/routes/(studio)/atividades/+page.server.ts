import type { PageServerLoad } from './$types';
import { nivelOuNulo } from '$lib/atividades/nivel';
import { requireTeacher } from '$lib/server/auth/guard';
import { atividades } from '$lib/server/db/repos/activities';
import { prisma } from '$lib/server/db/client';
import { itemSkills } from '$lib/server/player/runtime';
import { labelForTag } from '$lib/kernel/language/profiles';
import { skills as HABILIDADES } from '$lib/kernel/interactions/skill-schema';
import type { Skill } from '$lib/kernel/interactions/types';

/**
 * Lista de atividades. As habilidades NÃO são um campo do banco: são
 * derivadas dos itens da versão (kernel.md "Habilidade é derivada"), então
 * saem calculadas aqui.
 *
 * A tela mostra, além da lista: o rascunho em que o professor parou (a
 * retomada vem ANTES da lista, porque é a tarefa começada), a distribuição
 * certo/parcial/errado por atividade e os números do mês.
 */

function haQuantoTempo(data: Date): string {
	const min = Math.round((Date.now() - data.getTime()) / 60000);
	if (min < 60) return 'há minutos';
	const horas = Math.round(min / 60);
	if (horas < 24) return `há ${horas}h`;
	const dias = Math.round(horas / 24);
	return dias === 1 ? 'ontem' : `há ${dias} dias`;
}

export const load: PageServerLoad = async ({ locals }) => {
	const teacher = requireTeacher(locals);
	const rows = await atividades(teacher).list();

	// Distribuição de acerto por atividade, numa consulta só.
	const respostas = await prisma.attemptItem.findMany({
		where: { item: { activityVersion: { activity: { teacherId: teacher.id } } } },
		select: { score: true, item: { select: { activityVersion: { select: { activityId: true } } } } }
	});

	const placar = new Map<string, { correct: number; partial: number; incorrect: number }>();
	for (const r of respostas) {
		const id = r.item.activityVersion.activityId;
		const atual = placar.get(id) ?? { correct: 0, partial: 0, incorrect: 0 };
		if (r.score >= 1) atual.correct++;
		else if (r.score > 0) atual.partial++;
		else atual.incorrect++;
		placar.set(id, atual);
	}

	const activities = rows.map((activity) => {
		const publishedVersion = activity.versions.find((v) => v.publications.length > 0);
		const current = publishedVersion ?? activity.versions[0];

		const presentes = new Set<Skill>();
		for (const item of current?.items ?? []) {
			for (const skill of itemSkills(item)) presentes.add(skill);
		}

		const attempts = publishedVersion?.publications.reduce(
			(total, publication) => total + publication._count.attempts,
			0
		);

		return {
			id: activity.id,
			title: activity.title,
			itemCount: current?.items.length ?? 0,
			// As CHAVES, na ordem de sempre (escuta, fala, leitura, escrita): quem
			// escreve o nome em português é a tela, por `skillLabels`. A lista
			// mostrava "reading, speaking, writing", na ordem em que apareciam.
			skills: HABILIDADES.filter((h) => presentes.has(h)),
			language: labelForTag(activity.targetLang),
			/** A tag de idioma (`$lib/idiomas.ts`) — o chip e o filtro da lista. */
			idioma: activity.targetLang,
			// O snapshot de versão é interno (regra nº 7); para o professor a
			// atividade é uma só, e o que importa aqui é se ela está no ar.
			noAr: !!publishedVersion,
			// Arquivada: fora do limite do plano, link fechado para quem não começou.
			arquivada: activity.archivedAt !== null,
			level: nivelOuNulo(activity.level),
			modulos: activity.modules.map((m) => m.module),
			attempts: publishedVersion ? (attempts ?? 0) : null,
			// Turma cadastrada ainda não existe no produto — sem total previsto,
			// a tela mostra só o número de tentativas.
			invited: null,
			score: placar.get(activity.id) ?? { correct: 0, partial: 0, incorrect: 0 }
		};
	});

	// A retomada: o rascunho MEXIDO por último, com a etapa em que parou. A lista
	// vem por data de criação, e o primeiro rascunho dela era o mais NOVO, não o
	// último em que o professor trabalhou; arquivado não é tarefa começada.
	const rascunho = rows
		.filter((a) => a.archivedAt === null && a.versions.every((v) => v.publications.length === 0))
		.reduce<(typeof rows)[number] | null>(
			(ultimo, a) => (ultimo && ultimo.updatedAt >= a.updatedAt ? ultimo : a),
			null
		);
	// Os materiais DESTE rascunho. A conta era a biblioteca inteira: um rascunho
	// recém-criado aparecia com "200 materiais colados", já na etapa 2.
	const materiaisDoRascunho = rascunho
		? await prisma.contentUnit.count({
				where: { teacherId: teacher.id, activities: { some: { id: rascunho.id } } }
			})
		: 0;
	const itensDoRascunho = rascunho?.versions[0]?.items.length ?? 0;

	const resume = rascunho
		? {
				id: rascunho.id,
				title: rascunho.title,
				materiais: materiaisDoRascunho,
				itens: itensDoRascunho,
				editadoEm: haQuantoTempo(rascunho.updatedAt),
				// A atividade só existe depois do "Continuar" da etapa 1: sem questões,
				// ela está nos materiais, com ou sem algum colado. E a tela leva PARA a
				// etapa: com as questões geradas, cair nos materiais deixava o "Gerar"
				// a um toque de refazer a revisão.
				etapa: itensDoRascunho > 0 ? 3 : 2,
				etapaLabel: itensDoRascunho > 0 ? 'Revisar' : 'Materiais'
			}
		: null;

	// Números do mês corrente.
	const inicioDoMes = new Date();
	inicioDoMes.setDate(1);
	inicioDoMes.setHours(0, 0, 0, 0);
	const tentativasNoMes = await prisma.attempt.count({
		where: {
			startedAt: { gte: inicioDoMes },
			publication: { activityVersion: { activity: { teacherId: teacher.id } } }
		}
	});
	const totalRespostas = respostas.length;
	const acertoMedio = totalRespostas
		? Math.round((respostas.filter((r) => r.score >= 1).length / totalRespostas) * 100)
		: 0;

	const ativas = activities.filter((a) => !a.arquivada);
	const publishedCount = ativas.filter((a) => a.noAr).length;

	return {
		teacher: { firstName: teacher.name.split(/\s+/)[0] ?? teacher.name },
		// A lista INTEIRA, não as 6 primeiras: os filtros e a paginação da tela
		// trabalham sobre ela. É dado do próprio professor e cabe numa resposta —
		// uma ida ao servidor por clique de chip não compraria nada.
		activities,
		totalCount: activities.length,
		activeCount: ativas.length,
		archivedCount: activities.length - ativas.length,
		publishedCount,
		draftCount: ativas.length - publishedCount,
		resume,
		mes: {
			nome: new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(new Date()),
			tentativas: tentativasNoMes,
			acertoMedio,
			respostas: totalRespostas
		}
	};
};
