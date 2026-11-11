import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '$lib/server/db/client';
import { alunos, turmas } from './classrooms';
import {
	conviteAindaVale,
	conviteDeContaPorToken,
	convitesDeConta,
	ligarContaPeloConvite
} from './convites-de-conta';

/**
 * O convite de conta liga uma PESSOA (a conta) a um dado do professor (a ficha
 * da chamada). As fronteiras que não podem ceder: o professor só gera convite
 * da própria chamada (regra nº 4), o token é a única coisa que diz QUAL ficha, e
 * uma ficha já ligada nunca muda de dono.
 */
describe('convite de conta do aluno', () => {
	let teacherA: { id: string };
	let teacherB: { id: string };
	const contas: string[] = [];

	async function novaConta(nome: string) {
		const conta = await prisma.studentAccount.create({
			data: { id: crypto.randomUUID(), name: nome, email: `${crypto.randomUUID()}@test.dev` }
		});
		contas.push(conta.id);
		return conta;
	}

	async function fichaDaA(nome: string, email: string | null = null) {
		const turma = await turmas(teacherA).create(`Turma ${nome}`, 'en-US', 'azul', [
			{ name: nome, email }
		]);
		return { turma, ficha: turma.students[0]! };
	}

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

	it('o professor só gera convite da própria chamada', async () => {
		const { ficha } = await fichaDaA('Juliana Pereira');
		expect(await convitesDeConta(teacherB).garantir(ficha.id)).toBeNull();

		const daA = await convitesDeConta(teacherA).garantir(ficha.id);
		expect(daA?.accountInviteToken).toMatch(/^[A-Za-z0-9_-]{32}$/);
		// Pedir de novo devolve o MESMO link: copiar duas vezes não invalida o primeiro.
		const deNovo = await convitesDeConta(teacherA).garantir(ficha.id);
		expect(deNovo?.accountInviteToken).toBe(daA?.accountInviteToken);
	});

	it('renovar troca o link e o antigo para de abrir', async () => {
		const { ficha } = await fichaDaA('Pedro Lima');
		const antigo = (await convitesDeConta(teacherA).garantir(ficha.id))!.accountInviteToken;
		const novo = (await convitesDeConta(teacherA).garantir(ficha.id, true))!.accountInviteToken;
		expect(novo).not.toBe(antigo);
		expect(await conviteDeContaPorToken(antigo)).toBeNull();
		expect((await conviteDeContaPorToken(novo))?.id).toBe(ficha.id);
	});

	it('a porta pública mostra a turma e o professor, nunca o e-mail', async () => {
		const { ficha } = await fichaDaA('Ana Ribeiro', 'ana@escola.dev');
		const token = (await convitesDeConta(teacherA).garantir(ficha.id))!.accountInviteToken;
		const publico = await conviteDeContaPorToken(token);
		expect(publico).toMatchObject({
			name: 'Ana Ribeiro',
			classroom: { name: 'Turma Ana Ribeiro' },
			teacher: { name: 'Professora A' }
		});
		expect(JSON.stringify(publico)).not.toContain('ana@escola.dev');
	});

	it('liga a conta pelo token, e uma ficha ligada não muda de dono', async () => {
		const { ficha } = await fichaDaA('Bruna Okamoto');
		const token = (await convitesDeConta(teacherA).garantir(ficha.id))!.accountInviteToken;
		const bruna = await novaConta('Bruna');
		const colega = await novaConta('Colega');

		expect(await ligarContaPeloConvite('token-que-nao-existe', bruna.id)).toBe('invalido');
		expect(await ligarContaPeloConvite(token, bruna.id)).toBe('ligada');
		expect(await ligarContaPeloConvite(token, bruna.id)).toBe('ja-era-sua');
		// O colega que pegou o link depois não herda a chamada.
		expect(await ligarContaPeloConvite(token, colega.id)).toBe('outra-conta');

		const depois = await prisma.student.findUnique({ where: { id: ficha.id } });
		expect(depois?.accountId).toBe(bruna.id);
	});

	it('a turma inteira: só quem tem e-mail e ainda não tem conta', async () => {
		const turma = await turmas(teacherA).create('Lote', 'en-US', 'azul', [
			{ name: 'Com e-mail', email: 'com@escola.dev' },
			{ name: 'Sem e-mail', email: null },
			{ name: 'Já tem conta', email: 'conta@escola.dev' }
		]);
		const comConta = turma.students.find((s) => s.name === 'Já tem conta')!;
		const conta = await novaConta('Já tem conta');
		await prisma.student.update({ where: { id: comConta.id }, data: { accountId: conta.id } });

		const prontos = await convitesDeConta(teacherA).daTurmaParaEnviar(turma.id);
		expect(prontos.map((p) => p.name)).toEqual(['Com e-mail']);
		// A turma de outro professor devolve vazio, sem dizer por quê.
		expect(await convitesDeConta(teacherB).daTurmaParaEnviar(turma.id)).toEqual([]);
	});

	it('trocar o e-mail de quem já recebeu o convite invalida o link', async () => {
		const { ficha } = await fichaDaA('Carla Dias', 'carla@errado.dev');
		const token = (await convitesDeConta(teacherA).garantir(ficha.id))!.accountInviteToken;

		// Copiado e nunca enviado por e-mail: corrigir o endereço não mexe no link.
		await alunos(teacherA).update(ficha.id, { name: 'Carla Dias', email: 'carla@quase.dev' });
		expect((await conviteDeContaPorToken(token))?.id).toBe(ficha.id);

		// Saiu por e-mail para o endereço errado: o link daquele e-mail para de abrir.
		await prisma.student.update({
			where: { id: ficha.id },
			data: { accountInviteSentAt: new Date() }
		});
		await alunos(teacherA).update(ficha.id, { name: 'Carla Dias', email: 'carla@certo.dev' });
		expect(await conviteDeContaPorToken(token)).toBeNull();
	});

	describe('conviteAindaVale (o worker decide se manda)', () => {
		const pedido = { token: 'tok', pedidoEm: '2026-11-09T12:00:00.000Z' };
		const ficha = {
			accountId: null,
			accountInviteToken: 'tok',
			accountInviteSentAt: null,
			email: 'a@b.dev'
		};

		it('manda o pedido que ainda vale', () => {
			expect(conviteAindaVale(ficha, pedido)).toBe(true);
		});

		it('não manda quando já tem conta, o link mudou, sumiu o e-mail ou o pedido já saiu', () => {
			expect(conviteAindaVale(null, pedido)).toBe(false);
			expect(conviteAindaVale({ ...ficha, accountId: 'conta' }, pedido)).toBe(false);
			expect(conviteAindaVale({ ...ficha, accountInviteToken: 'outro' }, pedido)).toBe(false);
			expect(conviteAindaVale({ ...ficha, email: null }, pedido)).toBe(false);
			expect(
				conviteAindaVale(
					{ ...ficha, accountInviteSentAt: new Date('2026-11-09T12:00:05Z') },
					pedido
				)
			).toBe(false);
		});

		it('"mandar de novo" é um pedido novo, depois do último envio', () => {
			expect(
				conviteAindaVale(
					{ ...ficha, accountInviteSentAt: new Date('2026-11-09T11:00:00Z') },
					pedido
				)
			).toBe(true);
		});
	});
});
