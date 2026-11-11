import { prisma, type Db } from '$lib/server/db/client';

type TeacherScope = { id: string };

export interface RegistroDeUsoDeIa {
	requestId: string;
	model: string;
	kind: string;
	requested: number;
	accepted: number;
	inputTokens: number | null;
	outputTokens: number | null;
	thoughtsTokens: number | null;
}

/**
 * Os tokens que o modelo gastou em cada geração do professor (`AiUsage`) — a
 * MEDIÇÃO por trás dos preços (docs/adr-002-billing.md "Preços"). Só escreve:
 * quem lê é a conta da equipe, por SQL, nunca uma tela do produto. Escopado
 * por `teacherId` como todo repositório (regra inviolável nº 4).
 */
export function usoDeIa(teacher: TeacherScope, db: Db = prisma) {
	return {
		registrar(registro: RegistroDeUsoDeIa) {
			return db.aiUsage.create({ data: { ...registro, teacherId: teacher.id } });
		}
	};
}
