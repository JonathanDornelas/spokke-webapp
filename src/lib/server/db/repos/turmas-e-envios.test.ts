import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '$lib/server/db/client';
import { alunos, turmas } from './classrooms';
import { envios } from './deliveries';
import { modulos } from './modules';
import { programacoes } from './programacoes';
import { mapasDoAluno } from './mapa-aluno';

/**
 * O isolamento que faltava provar (testing.md "Obrigatório em repositório"):
 * a TURMA ABERTA (o loader da chamada), os alunos e os envios de outro
 * professor, e o mapa do módulo de outra conta. `modules.test.ts` já cobre
 * ler a lista e mandar a publicação alheia; aqui fica o resto da superfície.
 */

const ids = { a: crypto.randomUUID(), b: crypto.randomUUID() };
const contas: string[] = [];
let turmaA = '';
let alunaA = '';
let entregaA = '';
let conviteA = '';
let atividadeA = '';

async function atividadePublicada(teacherId: string, title: string) {
	const atividade = await prisma.activity.create({ data: { title, teacherId } });
	const versao = await prisma.activityVersion.create({
		data: { activityId: atividade.id, versionNumber: 1 }
	});
	await prisma.item.create({
		data: {
			order: 0,
			prompt: { kind: 'text', text: 'Olá', instructionKey: 'translate-to-target' },
			interaction: { type: 'type', payload: { accepted: ['Hello'] } },
			grading: { mode: 'tolerant' },
			locale: { source: 'pt-BR', target: 'en-US' },
			activityVersionId: versao.id
		}
	});
	const publicacao = await prisma.publication.create({
		data: { slug: `iso-${atividade.id}`, settings: {}, activityVersionId: versao.id }
	});
	return { atividade, publicacao };
}

beforeAll(async () => {
	for (const id of [ids.a, ids.b]) {
		await prisma.teacher.create({
			data: { id, name: `Prof ${id.slice(0, 4)}`, email: `iso-${id}@test.dev` }
		});
	}
	const turma = await turmas({ id: ids.a }).create('Turma Secreta da A', 'en-US', 'azul', [
		{ name: 'Aluna Secreta', email: 'aluna.secreta@test.dev' }
	]);
	turmaA = turma.id;
	alunaA = turma.students[0]!.id;
	const { atividade, publicacao } = await atividadePublicada(ids.a, 'Atividade da A');
	atividadeA = atividade.id;
	const criado = await envios({ id: ids.a }).create(publicacao.id, turmaA);
	if (!criado?.delivery) throw new Error('o envio da semente não foi criado');
	entregaA = criado.delivery.id;
	conviteA = criado.invites[0]!.id;
});

afterAll(async () => {
	const professores = [ids.a, ids.b];
	await prisma.attempt.deleteMany({
		where: { publication: { activityVersion: { activity: { teacherId: { in: professores } } } } }
	});
	await prisma.delivery.deleteMany({ where: { classroom: { teacherId: { in: professores } } } });
	await prisma.publication.deleteMany({
		where: { activityVersion: { activity: { teacherId: { in: professores } } } }
	});
	await prisma.teacher.deleteMany({ where: { id: { in: professores } } });
	if (contas.length > 0) await prisma.studentAccount.deleteMany({ where: { id: { in: contas } } });
});

describe('turma e alunos de outro professor', () => {
	it('a turma aberta (o loader da chamada) não é lida', async () => {
		expect(await turmas({ id: ids.b }).detail(turmaA)).toBeNull();
		const lista = JSON.stringify(await turmas({ id: ids.b }).list());
		expect(lista).not.toContain('Turma Secreta da A');
		// A busca da lista olha os nomes dos alunos: nem eles atravessam.
		expect(lista).not.toContain('Aluna Secreta');
	});

	it('não edita nem apaga a turma alheia', async () => {
		expect(
			await turmas({ id: ids.b }).update(turmaA, {
				name: 'Invadida',
				languageTag: null,
				color: 'azul'
			})
		).toBe(false);
		expect(await turmas({ id: ids.b }).remove(turmaA)).toBe(false);
		const intacta = await turmas({ id: ids.a }).detail(turmaA);
		expect(intacta?.name).toBe('Turma Secreta da A');
	});

	it('não põe aluno na turma alheia, nem lê, edita ou apaga o aluno de lá', async () => {
		expect(await alunos({ id: ids.b }).add(turmaA, { name: 'Intruso', email: null })).toBeNull();
		expect(await alunos({ id: ids.b }).addMany(turmaA, [{ name: 'Intruso', email: null }])).toBe(0);
		expect(await alunos({ id: ids.b }).historico(alunaA)).toBeNull();
		expect(
			await alunos({ id: ids.b }).update(alunaA, { name: 'Trocado', email: 'x@test.dev' })
		).toBe(false);
		expect(await alunos({ id: ids.b }).remove(alunaA)).toBe(false);
		const ficha = await alunos({ id: ids.a }).historico(alunaA);
		expect(ficha?.name).toBe('Aluna Secreta');
		expect(ficha?.email).toBe('aluna.secreta@test.dev');
	});
});

describe('envios de outro professor', () => {
	it('não renova os convites nem lê o envio alheio', async () => {
		expect(await envios({ id: ids.b }).renewOne(conviteA)).toBeNull();
		expect(await envios({ id: ids.b }).renewUnopened(entregaA)).toEqual([]);
		expect(await envios({ id: ids.b }).arquivado({ deliveryId: entregaA })).toBeNull();
		expect(await envios({ id: ids.b }).arquivado({ inviteId: conviteA })).toBeNull();
		expect(await envios({ id: ids.b }).porAtividade(atividadeA)).toEqual([]);
		// O token do convite da A continua o mesmo: nada foi renovado por fora.
		const convite = await prisma.invite.findUniqueOrThrow({ where: { id: conviteA } });
		expect(convite.sentAt).toBeNull();
	});
});

describe('o mapa do módulo é só de quem tem a ficha ligada', () => {
	it('uma conta não vê o módulo da turma de outra', async () => {
		const modulo = await modulos({ id: ids.a }).create({
			name: 'Módulo Secreto',
			description: null,
			color: 'teal'
		});
		await modulos({ id: ids.a }).adicionar(modulo.id, [atividadeA]);
		await programacoes({ id: ids.a }).alocar(modulo.id, [turmaA]);

		const daAluna = await prisma.studentAccount.create({
			data: { id: crypto.randomUUID(), name: 'Aluna', email: `${crypto.randomUUID()}@test.dev` }
		});
		const deFora = await prisma.studentAccount.create({
			data: { id: crypto.randomUUID(), name: 'De fora', email: `${crypto.randomUUID()}@test.dev` }
		});
		contas.push(daAluna.id, deFora.id);
		await prisma.student.update({ where: { id: alunaA }, data: { accountId: daAluna.id } });

		const dela = await mapasDoAluno({ id: daAluna.id }).todos();
		expect(dela).toHaveLength(1);

		expect(await mapasDoAluno({ id: deFora.id }).todos()).toEqual([]);
		expect(await mapasDoAluno({ id: deFora.id }).um(modulo.id)).toBeNull();
		expect(JSON.stringify(await mapasDoAluno({ id: deFora.id }).todos())).not.toContain(
			'Módulo Secreto'
		);
	});
});
