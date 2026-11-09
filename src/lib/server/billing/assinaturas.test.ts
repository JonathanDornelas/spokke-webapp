import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '$lib/server/db/client';
import { acessoDoProfessor } from './acesso';
import {
	ativarPlano,
	atenderPedido,
	cancelar,
	estenderTrial,
	fimDoPeriodo,
	reativar
} from './assinaturas';
import { manualBillingProvider } from './manual-provider';
import { uso } from '$lib/server/db/repos/uso';

const ORIGEM = { origem: 'http://localhost:5173' };
import { minhaAssinatura } from '$lib/server/db/repos/assinatura';

/**
 * O serviço de assinatura contra o banco de dev, no padrão dos testes de
 * repositório: professores novos por arquivo, apagados no fim.
 */

const ids = { a: crypto.randomUUID(), b: crypto.randomUUID(), admin: crypto.randomUUID() };
const AGORA = new Date('2026-10-03T12:00:00Z');

async function criarProfessor(id: string) {
	await prisma.teacher.create({
		data: {
			id,
			name: `Prof ${id.slice(0, 4)}`,
			email: `assin-${id}@test.dev`,
			subscriptionStatus: 'trialing',
			trialEndsAt: new Date(AGORA.getTime() + 5 * 24 * 3600 * 1000)
		}
	});
}

beforeAll(async () => {
	await criarProfessor(ids.a);
	await criarProfessor(ids.b);
});

afterAll(async () => {
	await prisma.job.deleteMany({
		where: { type: 'aviso-equipe', payload: { path: ['replyTo'], string_contains: '@test.dev' } }
	});
	await prisma.teacher.deleteMany({ where: { id: { in: [ids.a, ids.b] } } });
});

describe('fimDoPeriodo', () => {
	it('mensal no dia 31 cai no último dia do mês seguinte', () => {
		expect(fimDoPeriodo(new Date('2026-01-31T10:00:00Z'), 'mensal').toISOString()).toBe(
			'2026-02-28T10:00:00.000Z'
		);
	});
	it('anual soma doze meses', () => {
		expect(fimDoPeriodo(AGORA, 'anual').toISOString()).toBe('2027-10-03T12:00:00.000Z');
	});
});

describe('assinaturas', () => {
	it('ativar plano grava os campos e a auditoria na mesma operação', async () => {
		await ativarPlano(ids.a, { plano: 'pro', ciclo: 'mensal' }, `admin:${ids.admin}`, {
			agora: AGORA
		});
		const linha = await prisma.teacher.findUniqueOrThrow({ where: { id: ids.a } });
		expect({
			plan: linha.plan,
			status: linha.subscriptionStatus,
			ciclo: linha.planCycle,
			fim: linha.currentPeriodEnd?.toISOString(),
			ancora: linha.cycleAnchor?.toISOString()
		}).toEqual({
			plan: 'pro',
			status: 'active',
			ciclo: 'mensal',
			fim: '2026-11-03T12:00:00.000Z',
			ancora: AGORA.toISOString()
		});
		const eventos = await prisma.auditEvent.findMany({ where: { teacherId: ids.a } });
		expect(eventos.map((e) => [e.type, e.actor])).toEqual([
			['plano_ativado', `admin:${ids.admin}`]
		]);

		const estado = await acessoDoProfessor({ id: ids.a }, prisma, AGORA);
		expect({ plano: estado.plano, situacao: estado.situacao, ia: estado.limites.ia }).toEqual({
			plano: 'pro',
			situacao: 'ativa',
			ia: true
		});
	});

	it('cancelar no fim do período continua valendo até a data, e desfazer volta', async () => {
		await cancelar(ids.a, { noFimDoPeriodo: true }, 'professor');
		let estado = await acessoDoProfessor({ id: ids.a }, prisma, AGORA);
		expect({ situacao: estado.situacao, agendado: estado.cancelAtPeriodEnd }).toEqual({
			situacao: 'ativa',
			agendado: true
		});
		const depois = new Date('2026-11-10T12:00:00Z');
		expect((await acessoDoProfessor({ id: ids.a }, prisma, depois)).situacao).toBe('cancelada');

		await reativar(ids.a, 'professor');
		estado = await acessoDoProfessor({ id: ids.a }, prisma, AGORA);
		expect(estado.cancelAtPeriodEnd).toBe(false);
	});

	it('estender trial de quem tem plano é recusado', async () => {
		await expect(estenderTrial(ids.a, 7, 'sistema')).rejects.toThrow(/não está em trial/);
	});

	it('encerrar o trial (dias negativos) bloqueia criar e publicar', async () => {
		await estenderTrial(ids.b, -30, `admin:${ids.admin}`, { agora: AGORA });
		const estado = await acessoDoProfessor({ id: ids.b }, prisma, new Date(AGORA.getTime() + 1000));
		expect(estado.situacao).toBe('expirada');
	});
});

describe('pedido de plano (provedor manual)', () => {
	it('substitui o pedido pendente, avisa a equipe e só o painel ativa', async () => {
		const professor = { id: ids.b, name: 'Prof B', email: `assin-${ids.b}@test.dev` };
		await manualBillingProvider.iniciarAssinatura(professor, 'basico', 'mensal', ORIGEM);
		const segundo = await manualBillingProvider.iniciarAssinatura(
			professor,
			'super',
			'anual',
			ORIGEM
		);
		expect(segundo.tipo).toBe('pedido');

		const pendentes = await prisma.planRequest.findMany({
			where: { teacherId: ids.b, status: 'pendente' }
		});
		expect(pendentes.map((p) => p.plano)).toEqual(['super']);

		const avisos = await prisma.job.count({
			where: { type: 'aviso-equipe', payload: { path: ['replyTo'], equals: professor.email } }
		});
		expect(avisos).toBe(2);

		// Pedir não libera nada.
		expect((await acessoDoProfessor({ id: ids.b })).situacao).toBe('expirada');

		const pedidoId = pendentes[0].id;
		await atenderPedido(pedidoId, ids.admin);
		const estado = await acessoDoProfessor({ id: ids.b });
		expect({ plano: estado.plano, situacao: estado.situacao }).toEqual({
			plano: 'super',
			situacao: 'ativa'
		});
		// Atender duas vezes não ativa duas vezes.
		await expect(atenderPedido(pedidoId, ids.admin)).rejects.toThrow(/já foi resolvido/);
	});

	it('o professor só vê e cancela o próprio pedido', async () => {
		await manualBillingProvider.iniciarAssinatura(
			{ id: ids.a, name: 'Prof A', email: `assin-${ids.a}@test.dev` },
			'super',
			'mensal',
			ORIGEM
		);
		expect(await minhaAssinatura({ id: ids.b }).pedidoPendente()).toBeNull();
		expect(await minhaAssinatura({ id: ids.b }).cancelarPedido()).toBe(false);
		expect((await minhaAssinatura({ id: ids.a }).pedidoPendente())?.plano).toBe('super');
	});
});

describe('uso — isolamento entre professores', () => {
	it('conta só o que é do professor, e ignora atividade arquivada', async () => {
		await prisma.activity.createMany({
			data: [
				{ title: 'A1', teacherId: ids.a },
				{ title: 'A2', teacherId: ids.a, archivedAt: new Date() },
				{ title: 'B1', teacherId: ids.b }
			]
		});
		await prisma.contentUnit.create({ data: { kind: 'VocabItem', data: {}, teacherId: ids.a } });
		expect(await uso({ id: ids.a }).contar()).toEqual({ atividades: 1, materiais: 1 });
		expect(await uso({ id: ids.b }).contar()).toEqual({ atividades: 1, materiais: 0 });
	});
});
