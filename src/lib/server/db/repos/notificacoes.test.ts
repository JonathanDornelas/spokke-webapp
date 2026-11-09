import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '$lib/server/db/client';
import { notificar, resolverNotificacoes } from '$lib/server/notificacoes';
import { notificacoes } from './notificacoes';
import { turmas } from './classrooms';
import { vincularFichaAConta } from './student-accounts';

/**
 * O sino é dado do professor como outro qualquer (regra nº 4): o de um nunca
 * aparece nem se marca pelo outro. E o AGRUPAMENTO é o que impede trinta
 * alunos entrando na turma de virarem trinta avisos.
 */
describe('notificações', () => {
	let teacherA: { id: string };
	let teacherB: { id: string };
	const contas: string[] = [];

	beforeAll(async () => {
		teacherA = await prisma.teacher.create({
			data: {
				id: crypto.randomUUID(),
				name: 'Professora A',
				email: `a-${crypto.randomUUID()}@test.dev`
			}
		});
		teacherB = await prisma.teacher.create({
			data: {
				id: crypto.randomUUID(),
				name: 'Professor B',
				email: `b-${crypto.randomUUID()}@test.dev`
			}
		});
	});

	afterAll(async () => {
		const ids = [teacherA?.id, teacherB?.id].filter((id) => id !== undefined);
		if (ids.length > 0) await prisma.teacher.deleteMany({ where: { id: { in: ids } } });
		if (contas.length > 0)
			await prisma.studentAccount.deleteMany({ where: { id: { in: contas } } });
	});

	it('o professor não lê nem marca o sino de outro', async () => {
		await notificar(teacherA.id, {
			kind: 'audio',
			key: 'audio:segredo',
			data: { activityId: 'segredo', titulo: 'Atividade secreta da A' }
		});
		const daA = await notificacoes(teacherA).doSino();
		expect(daA.naoLidas).toBe(1);
		const id = daA.itens[0]!.id;

		const doB = await notificacoes(teacherB).doSino();
		expect(JSON.stringify(doB)).not.toContain('Atividade secreta da A');
		expect(await notificacoes(teacherB).marcarLida(id)).toBe(false);
		expect(await notificacoes(teacherB).marcarTodas()).toBe(0);
		expect((await notificacoes(teacherA).doSino()).naoLidas).toBe(1);

		expect(await notificacoes(teacherA).marcarLida(id)).toBe(true);
		expect((await notificacoes(teacherA).doSino()).naoLidas).toBe(0);
	});

	it('enquanto não lida, a mesma chave agrupa; lida, a próxima abre outra', async () => {
		const evento = (nome: string) =>
			notificar(teacherA.id, {
				kind: 'aluno-entrou',
				key: 'aluno-entrou:turma-x',
				data: { classroomId: 'turma-x', turma: '7º B', nomes: [nome] }
			});
		await evento('Juliana');
		await evento('Pedro');
		await evento('Ana');
		let linhas = await prisma.notification.findMany({
			where: { teacherId: teacherA.id, key: 'aluno-entrou:turma-x' }
		});
		expect(linhas).toHaveLength(1);
		expect(linhas[0]!.count).toBe(3);
		const sino = await notificacoes(teacherA).doSino();
		expect(sino.itens.find((n) => n.titulo.includes('7º B'))?.titulo).toBe(
			'Ana e mais 2 entraram em 7º B'
		);

		await notificacoes(teacherA).marcarTodas();
		await evento('Bruno');
		linhas = await prisma.notification.findMany({
			where: { teacherId: teacherA.id, key: 'aluno-entrou:turma-x' },
			orderBy: { createdAt: 'asc' }
		});
		expect(linhas).toHaveLength(2);
		expect(linhas[1]!.count).toBe(1);
	});

	it('não lidas vêm primeiro, e resolver vira lida', async () => {
		await notificar(teacherA.id, {
			kind: 'liberacao',
			key: 'liberacao:al:at',
			data: {
				moduleId: 'm',
				allocationId: 'al',
				modulo: 'Frutas',
				turma: '7º B',
				atividade: 'Frutas 3',
				motivo: 'rascunho'
			}
		});
		const antes = await notificacoes(teacherA).doSino();
		expect(antes.itens[0]!.lida).toBe(false);
		expect(antes.itens.some((n) => n.lida)).toBe(true);

		await resolverNotificacoes(teacherA.id, ['liberacao:al:at']);
		const depois = await notificacoes(teacherA).doSino();
		// O aviso do Bruno, do teste anterior, continua aberto: só o resolvido caiu.
		expect(depois.naoLidas).toBe(antes.naoLidas - 1);
	});

	it('dado que não valida mais é pulado, sem quebrar o sino', async () => {
		await prisma.notification.create({
			data: { teacherId: teacherA.id, kind: 'correcao', key: 'velha', data: { nada: true } }
		});
		await prisma.notification.create({
			data: { teacherId: teacherA.id, kind: 'tipo-que-saiu', key: 'velha2', data: {} }
		});
		const sino = await notificacoes(teacherA).doSino();
		expect(sino.itens.every((n) => n.titulo.length > 0)).toBe(true);
	});

	it('ligar a conta avisa UMA vez — ligar de novo não', async () => {
		const turma = await turmas(teacherA).create('Turma do aviso', 'en-US', 'azul', [
			{ name: 'Carla Dias', email: null }
		]);
		const ficha = turma.students[0]!;
		const conta = await prisma.studentAccount.create({
			data: { id: crypto.randomUUID(), name: 'Carla', email: `${crypto.randomUUID()}@test.dev` }
		});
		contas.push(conta.id);

		expect(await vincularFichaAConta(ficha.id, conta.id)).toBe(true);
		expect(await vincularFichaAConta(ficha.id, conta.id)).toBe(true);
		const avisos = await prisma.notification.findMany({
			where: { teacherId: teacherA.id, key: `aluno-entrou:${turma.id}` }
		});
		expect(avisos).toHaveLength(1);
		expect(avisos[0]!.count).toBe(1);
		// E o professor B não fica sabendo de nada.
		expect(await prisma.notification.count({ where: { teacherId: teacherB.id } })).toBe(0);
	});
});
