import type { PageServerLoad } from './$types';
import { requireTeacher } from '$lib/server/auth/guard';
import { turmas } from '$lib/server/db/repos/classrooms';
import { labelForTag } from '$lib/kernel/language/profiles';
import { idiomaOuNulo } from '$lib/idiomas';
import { etiquetaDaTurma } from '$lib/server/turmas/etiqueta';
import { contaProfessor } from '$lib/server/db/repos/teachers';

/** Quanto tempo faz, em português, sem trazer uma biblioteca de datas. */
function haQuantoTempo(data: Date | null): string {
	if (!data) return 'nunca';
	const dias = Math.floor((Date.now() - data.getTime()) / 86_400_000);
	if (dias <= 0) return 'hoje';
	if (dias === 1) return 'ontem';
	if (dias < 7) return `há ${dias} dias`;
	const semanas = Math.floor(dias / 7);
	if (semanas === 1) return 'há 1 semana';
	if (semanas < 5) return `há ${semanas} semanas`;
	const meses = Math.floor(dias / 30);
	return meses === 1 ? 'há 1 mês' : `há ${meses} meses`;
}

export const load: PageServerLoad = async ({ locals }) => {
	const teacher = requireTeacher(locals);
	const [lista, perfil] = await Promise.all([
		turmas(teacher).list(),
		contaProfessor(teacher).perfil()
	]);

	return {
		// A "Nova turma" (bandeja) nasce no idioma do professor quando ele ensina UM
		// só (Conta): aí a resposta é óbvia. Com dois ou mais, nenhum vem marcado —
		// adivinhar entre eles erraria metade das vezes.
		idiomaPadrao: perfil.idiomas.length === 1 ? idiomaOuNulo(perfil.idiomas[0]) : null,
		classrooms: lista.map((turma) => ({
			id: turma.id,
			name: turma.name,
			badge: etiquetaDaTurma(turma.name),
			color: turma.color,
			languageLabel: turma.languageTag ? labelForTag(turma.languageTag) : null,
			/** A tag de idioma (`$lib/idiomas.ts`); nula = turma sem idioma. */
			idioma: idiomaOuNulo(turma.languageTag),
			students: turma.students,
			withEmail: turma.withEmail,
			withAccount: turma.withAccount,
			bounced: turma.bounced,
			/** Para a busca de tela achar a turma pelo nome de um aluno. */
			studentNames: turma.studentNames,
			createdAt: turma.createdAt.toISOString(),
			deliveries: turma.deliveries,
			lastDelivery: haQuantoTempo(turma.lastDeliveryAt)
		})),
		totals: {
			classrooms: lista.length,
			students: lista.reduce((n, t) => n + t.students, 0),
			withEmail: lista.reduce((n, t) => n + t.withEmail, 0)
		}
	};
};
