import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const ADMIN = crypto.randomUUID();
vi.mock('$env/dynamic/private', () => ({ env: { PLATFORM_ADMIN_IDS: ` ${ADMIN} , outro-id ` } }));

const { ehAdminDaPlataforma, requirePlatformAdmin } = await import('$lib/server/auth/guard');
const { admin } = await import('./admin');
const { prisma } = await import('$lib/server/db/client');

/**
 * O painel interno: só quem está em `PLATFORM_ADMIN_IDS` passa, e o que ele
 * lê de um professor é conta, cobrança e contagem — nunca dado de aluno.
 */

const prof = crypto.randomUUID();

beforeAll(async () => {
	await prisma.teacher.create({
		data: {
			id: prof,
			name: 'Prof Admin',
			email: `admin-${prof}@test.dev`,
			subscriptionStatus: 'trialing'
		}
	});
	const turma = await prisma.classroom.create({ data: { name: 'Turma X', teacherId: prof } });
	await prisma.student.create({
		data: { name: 'Aluna Secreta', email: 'aluna@test.dev', teacherId: prof, classroomId: turma.id }
	});
});

afterAll(async () => {
	await prisma.teacher.deleteMany({ where: { id: prof } });
});

describe('guard do painel interno', () => {
	it('aceita só os ids da lista, aparados', () => {
		expect(ehAdminDaPlataforma(ADMIN)).toBe(true);
		expect(ehAdminDaPlataforma('outro-id')).toBe(true);
		expect(ehAdminDaPlataforma(prof)).toBe(false);
		expect(ehAdminDaPlataforma(null)).toBe(false);
		expect(ehAdminDaPlataforma('')).toBe(false);
	});

	it('responde 404 (não 403) para quem não administra, e para quem não está logado', () => {
		const comoProfessor = { user: { id: prof } } as unknown as App.Locals;
		const deslogado = { user: null } as unknown as App.Locals;
		expect(() => requirePlatformAdmin(comoProfessor)).toThrow(
			expect.objectContaining({ status: 404 })
		);
		expect(() => requirePlatformAdmin(deslogado)).toThrow(expect.objectContaining({ status: 404 }));
		const comoAdmin = { user: { id: ADMIN } } as unknown as App.Locals;
		expect(requirePlatformAdmin(comoAdmin).id).toBe(ADMIN);
	});
});

describe('o que o admin lê de um professor', () => {
	it('não carrega nome de aluno, turma nem resposta', async () => {
		const escopo = requirePlatformAdmin({ user: { id: ADMIN } } as unknown as App.Locals);
		const detalhe = await admin(escopo).professor(prof);
		const serializado = JSON.stringify(detalhe);
		expect(detalhe?.conta.email).toBe(`admin-${prof}@test.dev`);
		expect(serializado).not.toContain('Aluna Secreta');
		expect(serializado).not.toContain('aluna@test.dev');
		expect(serializado).not.toContain('Turma X');
		expect(serializado).not.toContain('checkoutUrl');
	});
});
