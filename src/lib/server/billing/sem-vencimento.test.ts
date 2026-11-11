import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '$lib/server/db/client';
import { intranetJobSchema } from '$lib/server/queue';
import { ativarPlano, concederSemVencimento, encerrarSemVencimento } from './assinaturas';
import { situacaoDaCobranca } from './entitlements';

/**
 * O plano SEM VENCIMENTO que a intranet concede (pelo job \`intranet\`): ativo
 * para sempre até ser encerrado, idempotente, e o encerrar não alcança uma
 * assinatura paga.
 */
describe('plano sem vencimento', () => {
	const ids = { a: crypto.randomUUID(), b: crypto.randomUUID() };
	const ATOR = 'admin:intranet:equipe@spokke.com.br' as const;

	beforeAll(async () => {
		for (const id of Object.values(ids)) {
			await prisma.teacher.create({
				data: {
					id,
					name: 'Prof',
					email: `sv-${id}@test.dev`,
					subscriptionStatus: 'trialing',
					trialEndsAt: new Date(Date.now() + 86_400_000)
				}
			});
		}
	});

	afterAll(async () => {
		await prisma.teacher.deleteMany({ where: { id: { in: Object.values(ids) } } });
	});

	it('concede: ativo, sem data de fim, e continua ativo daqui a anos', async () => {
		expect(await concederSemVencimento(ids.a, 'pro', ATOR, { motivo: 'parceria de teste' })).toBe(
			true
		);
		const conta = await prisma.teacher.findUniqueOrThrow({ where: { id: ids.a } });
		expect(conta).toMatchObject({
			plan: 'pro',
			subscriptionStatus: 'active',
			currentPeriodEnd: null
		});
		const daquiDezAnos = new Date(Date.now() + 10 * 365 * 86_400_000);
		expect(situacaoDaCobranca(conta, daquiDezAnos)).toBe('ativa');

		const historico = await prisma.auditEvent.findFirstOrThrow({
			where: { teacherId: ids.a, type: 'plano_sem_vencimento' }
		});
		expect(historico.actor).toBe(ATOR);
		// O professor fica sabendo pelo sino.
		expect(await prisma.notification.count({ where: { teacherId: ids.a, kind: 'plano' } })).toBe(1);
	});

	it('conceder de novo o mesmo plano não grava nem avisa outra vez', async () => {
		expect(await concederSemVencimento(ids.a, 'pro', ATOR, { motivo: 'repetido' })).toBe(false);
		expect(
			await prisma.auditEvent.count({ where: { teacherId: ids.a, type: 'plano_sem_vencimento' } })
		).toBe(1);
	});

	it('encerrar vale para o plano sem vencimento, e só para ele', async () => {
		expect(await encerrarSemVencimento(ids.a, ATOR, { motivo: 'fim do teste' })).toBe(true);
		const conta = await prisma.teacher.findUniqueOrThrow({ where: { id: ids.a } });
		expect(situacaoDaCobranca(conta, new Date(Date.now() + 1000))).toBe('cancelada');

		// Uma assinatura paga, com data, não se encerra por este caminho.
		await ativarPlano(ids.b, { plano: 'basico', ciclo: 'mensal' }, 'provedor');
		expect(await encerrarSemVencimento(ids.b, ATOR, { motivo: 'engano' })).toBe(false);
		const paga = await prisma.teacher.findUniqueOrThrow({ where: { id: ids.b } });
		expect(paga.subscriptionStatus).toBe('active');
	});

	it('o job da intranet recusa plano desconhecido, e-mail inválido e motivo vazio', () => {
		const base = {
			acao: 'plano-sem-vencimento',
			teacherId: 'x',
			plano: 'pro',
			admin: 'a@b.dev',
			motivo: 'teste'
		};
		expect(intranetJobSchema.safeParse(base).success).toBe(true);
		expect(intranetJobSchema.safeParse({ ...base, plano: 'scholar' }).success).toBe(false);
		expect(intranetJobSchema.safeParse({ ...base, admin: 'nao-e-email' }).success).toBe(false);
		expect(intranetJobSchema.safeParse({ ...base, motivo: ' ' }).success).toBe(false);
	});
});
