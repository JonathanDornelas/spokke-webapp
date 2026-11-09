import { prisma } from '$lib/server/db/client';
import { creditos } from '$lib/server/db/repos/creditos';
import type { MotivoDoBloqueio } from '$lib/billing/motivos';
import { acessoComCiclo } from './acesso';
import { registrar, type Ator, avisaProfessor, avisarPlano } from './assinaturas';
import { travarProfessor } from './cota';
import { motivoDoBloqueio } from './entitlements';

type TeacherScope = { id: string };

/**
 * Gastar, devolver e conceder créditos de IA (docs/adr-003-ia-gemini.md).
 *
 * O débito acontece ANTES de chamar a IA, numa transação curta sob a trava por
 * professor — duas gerações simultâneas nunca gastam o mesmo saldo. A chamada
 * à IA fica FORA da transação (é rede), e o que não serviu é devolvido depois
 * por `estornar`.
 */

export type ResultadoDoDebito =
	| { ok: true; cicloInicio: Date; saldo: number; repetido: boolean }
	| { ok: false; motivo: MotivoDoBloqueio; saldo: number };

/**
 * Debita `n` créditos. `requestId` é gerado no cliente e vira a `refKey`: o
 * mesmo pedido chegando duas vezes (clique duplo, retentativa de rede) debita
 * UMA vez — a segunda chamada devolve o débito que já existe com `repetido`.
 */
export async function debitar(
	teacher: TeacherScope,
	n: number,
	requestId: string
): Promise<ResultadoDoDebito> {
	if (!Number.isInteger(n) || n <= 0) throw new Error('Débito precisa ser um inteiro positivo.');
	return prisma.$transaction(async (tx) => {
		await travarProfessor(tx, teacher.id);
		const repo = creditos(teacher, tx);
		const { estado, cicloInicio } = await acessoComCiclo(teacher, tx);

		const existente = await repo.porChave(requestId);
		if (existente) {
			return {
				ok: true as const,
				cicloInicio: existente.cicloInicio,
				saldo: estado.creditos.saldo,
				repetido: true
			};
		}

		const bloqueio = motivoDoBloqueio(estado, 'usar_ia');
		if (bloqueio) return { ok: false as const, motivo: bloqueio, saldo: estado.creditos.saldo };
		if (estado.creditos.saldo < n) {
			return { ok: false as const, motivo: 'creditos' as const, saldo: estado.creditos.saldo };
		}

		await repo.lancar({ delta: -n, motivo: 'geracao_ia', refKey: requestId, cicloInicio });
		return { ok: true as const, cicloInicio, saldo: estado.creditos.saldo - n, repetido: false };
	});
}

/**
 * Devolve `n` créditos de um débito — as propostas que a IA não entregou ou que
 * não passaram na validação. Idempotente pela chave `<requestId>:estorno`, e
 * lançado no MESMO ciclo do débito (devolver no ciclo seguinte daria crédito a
 * mais lá e deixaria o gasto aqui).
 */
export async function estornar(
	teacher: TeacherScope,
	n: number,
	requestId: string,
	cicloInicio: Date
): Promise<void> {
	if (n <= 0) return;
	const refKey = `${requestId}:estorno`;
	await prisma.$transaction(async (tx) => {
		await travarProfessor(tx, teacher.id);
		const repo = creditos(teacher, tx);
		if (await repo.porChave(refKey)) return;
		await repo.lancar({ delta: n, motivo: 'estorno', refKey, cicloInicio });
	});
}

/**
 * Créditos de CORTESIA, pelo painel interno. Valem só no ciclo atual — como a
 * franquia, não acumulam (decisão registrada no adr-003).
 */
export async function concederCreditos(
	teacherId: string,
	n: number,
	motivo: string,
	ator: Ator
): Promise<void> {
	if (!Number.isInteger(n) || n <= 0 || n > 100_000) throw new Error('Quantidade inválida.');
	await prisma.$transaction(async (tx) => {
		await travarProfessor(tx, teacherId);
		const { cicloInicio } = await acessoComCiclo({ id: teacherId }, tx);
		await creditos({ id: teacherId }, tx).lancar({
			delta: n,
			motivo: 'cortesia',
			refKey: `cortesia:${crypto.randomUUID()}`,
			cicloInicio
		});
		await registrar(tx, {
			teacherId,
			actor: ator,
			type: 'creditos_concedidos',
			data: { creditos: n, motivo: motivo.trim().slice(0, 200) }
		});
	});
	if (avisaProfessor(ator)) await avisarPlano(teacherId, { evento: 'creditos', creditos: n });
}
