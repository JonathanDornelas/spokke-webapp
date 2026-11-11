import { z } from 'zod';
import { command, getRequestEvent } from '$app/server';
import { error } from '@sveltejs/kit';
import { requireTeacher } from '$lib/server/auth/guard';
import { modulos } from '$lib/server/db/repos/modules';
import { programacoes } from '$lib/server/db/repos/programacoes';
import {
	enviarAgora as enviarAgoraNoServidor,
	pausarProgramacao as pausarNoServidor,
	salvarProgramacao as salvarNoServidor,
	tentarDeNovo as tentarDeNovoNoServidor
} from '$lib/server/modulos/programacao';
import { programacaoSchema } from '$lib/modulos/programacao';
import { CORES_DE_ETIQUETA, COR_PADRAO } from '$lib/etiquetas';

/**
 * Os módulos — coleções ordenadas de atividades (docs/adr-004-modulos-e-nivel.md).
 * **Toda remote function é um endpoint HTTP público** (regra nº 3): abre pelo
 * guard, e nenhuma toca o Prisma cru — só os repositórios escopados.
 */

function teacherOf() {
	return requireTeacher(getRequestEvent().locals);
}

const camposDoModulo = z.object({
	name: z.string().trim().min(1, 'Dê um nome ao módulo.').max(80),
	description: z.string().trim().max(400).optional(),
	color: z.enum(CORES_DE_ETIQUETA).default(COR_PADRAO)
});

export const criarModulo = command(
	camposDoModulo.extend({ activityIds: z.array(z.string()).max(200).default([]) }),
	async ({ name, description, color, activityIds }) => {
		const teacher = teacherOf();
		const repo = modulos(teacher);
		const criado = await repo.create({ name, description: description || null, color });
		if (activityIds.length > 0) await repo.adicionar(criado.id, activityIds);
		return { ok: true as const, id: criado.id };
	}
);

export const editarModulo = command(
	camposDoModulo.extend({ moduleId: z.string() }),
	async ({ moduleId, name, description, color }) => {
		const teacher = teacherOf();
		const ok = await modulos(teacher).update(moduleId, {
			name,
			description: description || null,
			color
		});
		if (!ok) error(404, 'Módulo não encontrado');
		return { ok: true as const };
	}
);

/** Uma cópia com as mesmas atividades, na mesma ordem — sem turmas nem programação. */
export const duplicarModulo = command(z.object({ moduleId: z.string() }), async ({ moduleId }) => {
	const id = await modulos(teacherOf()).duplicar(moduleId);
	if (!id) error(404, 'Módulo não encontrado');
	return { ok: true as const, id };
});

/** Apaga o módulo — as atividades ficam, só o agrupamento some. */
export const apagarModulo = command(z.object({ moduleId: z.string() }), async ({ moduleId }) => {
	const teacher = teacherOf();
	return { ok: await modulos(teacher).remove(moduleId) };
});

export const adicionarAoModulo = command(
	z.object({ moduleId: z.string(), activityIds: z.array(z.string()).min(1).max(200) }),
	async ({ moduleId, activityIds }) => {
		const teacher = teacherOf();
		const adicionadas = await modulos(teacher).adicionar(moduleId, activityIds);
		if (adicionadas === null) error(404, 'Módulo não encontrado');
		return { ok: true as const, adicionadas };
	}
);

export const removerDoModulo = command(
	z.object({ moduleId: z.string(), activityId: z.string() }),
	async ({ moduleId, activityId }) => {
		const teacher = teacherOf();
		return { ok: await modulos(teacher).remover(moduleId, activityId) };
	}
);

export const reordenarModulo = command(
	z.object({ moduleId: z.string(), activityIds: z.array(z.string()).max(200) }),
	async ({ moduleId, activityIds }) => {
		const teacher = teacherOf();
		return { ok: await modulos(teacher).reordenar(moduleId, activityIds) };
	}
);

/**
 * As TURMAS do módulo e a PROGRAMAÇÃO de envio de cada uma
 * (docs/telas-modulos-professor.md 2.3 e 2.4). A regra mora em
 * `$lib/server/modulos/programacao.ts`; aqui ficam só a sessão e a forma do
 * pedido. O id da alocação vem do corpo, e o repositório confere que ela é de um
 * módulo DESTE professor antes de qualquer escrita.
 */
export const alocarTurmas = command(
	z.object({ moduleId: z.string(), classroomIds: z.array(z.string()).min(1).max(50) }),
	async ({ moduleId, classroomIds }) => {
		const n = await programacoes(teacherOf()).alocar(moduleId, classroomIds);
		if (n === null) error(404, 'Módulo não encontrado');
		return { ok: true as const, alocadas: n };
	}
);

export const desalocarTurma = command(
	z.object({ allocationId: z.string() }),
	async ({ allocationId }) => ({ ok: await programacoes(teacherOf()).desalocar(allocationId) })
);

function origem() {
	return getRequestEvent().url.origin;
}

export const salvarProgramacao = command(
	z.object({ allocationId: z.string(), programacao: programacaoSchema }),
	async ({ allocationId, programacao }) => {
		const r = await salvarNoServidor(teacherOf(), allocationId, programacao, origem());
		if (!r) error(404, 'Turma não encontrada neste módulo');
		return { ok: true as const, ...r };
	}
);

export const pausarProgramacao = command(
	z.object({ allocationId: z.string(), pausar: z.boolean() }),
	async ({ allocationId, pausar }) => {
		const r = await pausarNoServidor(teacherOf(), allocationId, pausar, origem());
		if (!r) error(404, 'Turma não encontrada neste módulo');
		return { ok: true as const, ...r };
	}
);

/** "Enviar agora" de uma linha, e "Enviar a próxima agora" do rodapé. */
export const enviarAgora = command(
	z.object({ allocationId: z.string(), activityIds: z.array(z.string()).min(1).max(200) }),
	async ({ allocationId, activityIds }) => {
		const r = await enviarAgoraNoServidor(teacherOf(), allocationId, activityIds, origem());
		if (!r) error(404, 'Turma não encontrada neste módulo');
		return { ok: true as const, ...r };
	}
);

export const tentarDeNovo = command(
	z.object({ allocationId: z.string(), activityId: z.string() }),
	async ({ allocationId, activityId }) => {
		const r = await tentarDeNovoNoServidor(teacherOf(), allocationId, activityId, origem());
		if (!r) error(404, 'Turma não encontrada neste módulo');
		return { ok: true as const, ...r };
	}
);
