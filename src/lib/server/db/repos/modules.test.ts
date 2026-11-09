import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '$lib/server/db/client';
import { modulos } from './modules';
import { turmas } from './classrooms';
import { envios } from './deliveries';
import { programacoes } from './programacoes';
import {
	pausarProgramacao,
	processarEnviosDevidos,
	salvarProgramacao
} from '$lib/server/modulos/programacao';
import { programacaoSchema } from '$lib/modulos/programacao';
import { eventosDaAgenda } from '$lib/server/modulos/agenda';

/**
 * Módulos, envio de módulo e o isolamento de turmas e envios (testing.md:
 * todo repositório prova que não devolve dado de outro professor).
 */

const ids = { a: crypto.randomUUID(), b: crypto.randomUUID() };
const ORIGEM = 'http://localhost:5173';
const inicioDoTeste = new Date();

async function atividadePublicada(teacherId: string, title: string) {
	const atividade = await prisma.activity.create({ data: { title, teacherId } });
	const versao = await prisma.activityVersion.create({
		data: { activityId: atividade.id, versionNumber: 1 }
	});
	// Um item sem áudio (texto + digitar): o envio não precisa esperar TTS.
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
	await prisma.publication.create({
		data: { slug: `mod-${atividade.id}`, settings: {}, activityVersionId: versao.id }
	});
	return atividade;
}

let modA = '';
let turmaA = '';
let publicadas: string[] = [];
let rascunho = '';
let arquivada = '';
let deB = '';

beforeAll(async () => {
	for (const id of [ids.a, ids.b]) {
		await prisma.teacher.create({
			data: { id, name: 'Prof', email: `mod-${id}@test.dev`, subscriptionStatus: 'trialing' }
		});
	}
	publicadas = [
		(await atividadePublicada(ids.a, 'Frutas 1')).id,
		(await atividadePublicada(ids.a, 'Frutas 2')).id
	];
	rascunho = (await prisma.activity.create({ data: { title: 'Rascunho', teacherId: ids.a } })).id;
	arquivada = (await atividadePublicada(ids.a, 'Arquivada')).id;
	await prisma.activity.update({ where: { id: arquivada }, data: { archivedAt: new Date() } });
	deB = (await atividadePublicada(ids.b, 'Do outro')).id;

	modA = (await modulos({ id: ids.a }).create({ name: 'Frutas', description: null, color: 'teal' }))
		.id;
	const turma = await turmas({ id: ids.a }).create('7º B', 'en-US', 'violeta', [
		{ name: 'Ana', email: 'ana@test.dev' },
		{ name: 'Bia', email: 'bia@test.dev' },
		{ name: 'Caio', email: null }
	]);
	turmaA = turma.id;
});

afterAll(async () => {
	const alocacoes = await prisma.moduleClassroom.findMany({
		where: { module: { teacherId: { in: [ids.a, ids.b] } } },
		select: { id: true }
	});
	for (const { id } of alocacoes) {
		await prisma.job.deleteMany({
			where: { type: 'envio-programado', payload: { path: ['allocationId'], equals: id } }
		});
	}
	const dono = { activityVersion: { activity: { teacherId: { in: [ids.a, ids.b] } } } };
	await prisma.attempt.deleteMany({ where: { publication: dono } });
	await prisma.publication.deleteMany({ where: dono });
	await prisma.teacher.deleteMany({ where: { id: { in: [ids.a, ids.b] } } });
});

describe('repositório de módulos', () => {
	it('acrescenta só atividades do PRÓPRIO professor, sem repetir', async () => {
		const n = await modulos({ id: ids.a }).adicionar(modA, [
			...publicadas,
			rascunho,
			arquivada,
			deB,
			publicadas[0]
		]);
		expect(n).toBe(4);
		const modulo = await modulos({ id: ids.a }).byId(modA);
		expect(modulo?.atividades.map((a) => a.title)).toEqual([
			'Frutas 1',
			'Frutas 2',
			'Rascunho',
			'Arquivada'
		]);
		expect(modulo?.atividades.map((a) => a.estado)).toEqual([
			'no-ar',
			'no-ar',
			'rascunho',
			'arquivada'
		]);
	});

	it('outro professor não lê, não acrescenta e não apaga o módulo', async () => {
		const deOutro = modulos({ id: ids.b });
		expect(await deOutro.byId(modA)).toBeNull();
		expect(await deOutro.adicionar(modA, [deB])).toBeNull();
		expect(await deOutro.remove(modA)).toBe(false);
		expect(await deOutro.list()).toEqual([]);
	});

	it('reordenar exige o MESMO conjunto — id alheio no meio é recusado', async () => {
		const repo = modulos({ id: ids.a });
		const atual = (await repo.byId(modA))!.atividades.map((a) => a.id);
		expect(await repo.reordenar(modA, [atual[1], atual[0], atual[2], deB])).toBe(false);
		expect(await repo.reordenar(modA, [atual[1], atual[0], atual[2], atual[3]])).toBe(true);
		expect((await repo.byId(modA))!.atividades[0].title).toBe('Frutas 2');
		await repo.reordenar(modA, atual);
	});
});

describe('turmas do módulo e programação de envio', () => {
	const profA = { id: ids.a, name: 'Prof Módulo' };
	let alocacao = '';

	it('alocar confere as DUAS pontas', async () => {
		const turmaDoB = await turmas({ id: ids.b }).create('Turma do B', null, 'violeta', [
			{ name: 'Zeca', email: 'zeca@test.dev' }
		]);
		// O módulo do A não aceita a turma do B, e o B não aloca nada no módulo do A.
		expect(await programacoes({ id: ids.a }).alocar(modA, [turmaDoB.id])).toBe(0);
		expect(await programacoes({ id: ids.b }).alocar(modA, [turmaDoB.id])).toBeNull();
		expect(await programacoes({ id: ids.a }).alocar(modA, [turmaA, turmaA])).toBe(1);
		const [linha] = await programacoes({ id: ids.a }).doModulo(modA);
		alocacao = linha.id;
		expect(await programacoes({ id: ids.b }).doModulo(modA)).toEqual([]);
	});

	it('outro professor não programa, não pausa e não tira a turma', async () => {
		const outro = { id: ids.b, name: 'Outro' };
		const prog = programacaoSchema.parse({ modo: 'agora', inicio: '2026-10-09' });
		expect(await salvarProgramacao(outro, alocacao, prog, ORIGEM)).toBeNull();
		expect(await pausarProgramacao(outro, alocacao, true, ORIGEM)).toBeNull();
		expect(await programacoes({ id: ids.b }).desalocar(alocacao)).toBe(false);
	});

	it('"tudo agora" LIBERA só o que está no ar, para todos os alunos, sem e-mail', async () => {
		const prog = programacaoSchema.parse({ modo: 'agora', inicio: '2026-10-09' });
		const r = await salvarProgramacao(profA, alocacao, prog, ORIGEM);
		expect(r?.enviadas).toBe(2);
		expect(r?.naoSairam.map((n) => n.motivo).sort()).toEqual(['arquivada', 'rascunho']);

		// Módulo não manda e-mail: nenhum job de e-mail nasce deste despacho.
		expect(
			await prisma.job.count({
				where: { type: { in: ['convite', 'convite-modulo'] }, createdAt: { gte: inicioDoTeste } }
			})
		).toBe(0);
		const deliveries = await prisma.delivery.findMany({
			where: { classroomId: turmaA },
			include: { invites: true }
		});
		expect(new Set(deliveries.map((d) => d.envioId)).size).toBe(1);
		expect(deliveries.every((d) => d.moduleId === modA && !d.porEmail)).toBe(true);
		// Os três alunos — o Caio sem e-mail também — têm o convite que abre a fase.
		expect(deliveries.every((d) => d.invites.length === 3)).toBe(true);

		const [linha] = await programacoes({ id: ids.a }).doModulo(modA);
		const porAtividade = Object.fromEntries(linha.envios.map((e) => [e.activityId, e]));
		expect(porAtividade[publicadas[0]].status).toBe('enviada');
		expect(porAtividade[rascunho]).toMatchObject({ status: 'nao_saiu', reason: 'rascunho' });
		expect(porAtividade[arquivada]).toMatchObject({ status: 'nao_saiu', reason: 'arquivada' });
	});

	it('processar de novo não manda nada duas vezes', async () => {
		const r = await processarEnviosDevidos(alocacao, ORIGEM);
		expect(r.enviadas).toBe(0);
		expect(await prisma.delivery.count({ where: { classroomId: turmaA } })).toBe(2);
	});

	it('toda quinta: programa no futuro, e nada sai antes da hora', async () => {
		const turma2 = await turmas({ id: ids.a }).create('8º A', 'en-US', 'teal', [
			{ name: 'Dani', email: 'dani@test.dev' }
		]);
		await programacoes({ id: ids.a }).alocar(modA, [turma2.id]);
		const linha = (await programacoes({ id: ids.a }).doModulo(modA)).find(
			(l) => l.turma.id === turma2.id
		)!;
		const prog = programacaoSchema.parse({
			modo: 'semana',
			dias: [4],
			inicio: '2099-01-01',
			fora: [rascunho, arquivada]
		});
		const r = await salvarProgramacao(profA, linha.id, prog, ORIGEM);
		expect(r?.enviadas).toBe(0);

		const envios = await prisma.moduleSend.findMany({
			where: { allocationId: linha.id },
			orderBy: { dueAt: 'asc' }
		});
		expect(envios.map((e) => e.status)).toEqual(['programada', 'programada']);
		// 01/01/2099 é uma quinta; 8h em Brasília são 11h UTC.
		expect(envios[0].dueAt.toISOString()).toBe('2099-01-01T11:00:00.000Z');
		expect(envios[1].dueAt.toISOString()).toBe('2099-01-08T11:00:00.000Z');
		const acordar = await prisma.job.count({
			where: { type: 'envio-programado', payload: { path: ['allocationId'], equals: linha.id } }
		});
		expect(acordar).toBe(2);
		expect((await processarEnviosDevidos(linha.id, ORIGEM)).enviadas).toBe(0);
	});

	it('a agenda é do professor: o que saiu, o programado e nada da pausa', async () => {
		const eventos = await eventosDaAgenda({ id: ids.a }, { moduleId: modA });
		const doB = await eventosDaAgenda({ id: ids.b });
		expect(doB).toEqual([]);
		expect(await programacoes({ id: ids.b }).agenda({ moduleId: modA })).toEqual([]);

		// 7º B: as duas no ar saíram hoje; as duas que não saíram ficam no dia marcado.
		const do7B = eventos.filter((e) => e.turma.nome === '7º B');
		expect(do7B.filter((e) => e.estado === 'enviada')).toHaveLength(2);
		expect(do7B.filter((e) => e.estado === 'nao_saiu')).toHaveLength(2);
		// Liberada, não enviada por e-mail: nenhum e-mail conta na agenda.
		expect(do7B.find((e) => e.estado === 'enviada')?.emails).toBe(0);
		// 8º A: as duas quintas de 2099, no dia de Brasília e no horário dele.
		const do8A = eventos.filter((e) => e.turma.nome === '8º A');
		expect(do8A.map((e) => [e.dia, e.hora, e.estado])).toEqual([
			['2099-01-01', '8h', 'programada'],
			['2099-01-08', '8h', 'programada']
		]);

		// Pausada, a programação sai da agenda; o que já saiu não.
		const alocacao8A = (await programacoes({ id: ids.a }).doModulo(modA)).find(
			(l) => l.turma.name === '8º A'
		)!;
		await pausarProgramacao(profA, alocacao8A.id, true, ORIGEM);
		const pausada = await eventosDaAgenda({ id: ids.a }, { moduleId: modA });
		expect(pausada.some((e) => e.turma.nome === '8º A')).toBe(false);
		expect(pausada.filter((e) => e.turma.nome === '7º B')).toHaveLength(4);
		expect((await programacoes({ id: ids.a }).pausadas()).map((p) => p.turma.name)).toEqual([
			'8º A'
		]);
		expect(await programacoes({ id: ids.b }).pausadas()).toEqual([]);
	});

	it('o último envio por turma conta os convidados, e só do professor', async () => {
		const ultimos = await programacoes({ id: ids.a }).ultimoEnvioPorTurma();
		expect(ultimos[`${modA}:${turmaA}`]).toEqual({ convites: 3, terminaram: 0 });
		expect(await programacoes({ id: ids.b }).ultimoEnvioPorTurma()).toEqual({});
	});

	it('programação gravada com o antigo "por e-mail" também só libera', async () => {
		const turma3 = await turmas({ id: ids.a }).create('9º C', 'en-US', 'azul', [
			{ name: 'Edu', email: 'edu@test.dev' },
			{ name: 'Fábio', email: null }
		]);
		await programacoes({ id: ids.a }).alocar(modA, [turma3.id]);
		const linha = (await programacoes({ id: ids.a }).doModulo(modA)).find(
			(l) => l.turma.id === turma3.id
		)!;
		// O campo `canal` saiu; uma programação antiga que ainda o tenha é lida igual.
		const prog = programacaoSchema.parse({ modo: 'agora', canal: 'email', inicio: '2026-10-09' });
		const r = await salvarProgramacao(profA, linha.id, prog, ORIGEM);
		expect(r?.enviadas).toBe(2);
		expect(
			await prisma.job.count({
				where: { type: { in: ['convite', 'convite-modulo'] }, createdAt: { gte: inicioDoTeste } }
			})
		).toBe(0);
		const entregas = await prisma.delivery.findMany({
			where: { classroomId: turma3.id },
			include: { invites: true }
		});
		expect(entregas).toHaveLength(2);
		expect(entregas.every((d) => !d.porEmail)).toBe(true);
		// Os dois alunos — inclusive o Fábio, sem e-mail — têm o convite que abre a fase no mapa.
		expect(entregas.every((d) => d.invites.length === 2)).toBe(true);
	});

	it('duplicar copia nome, cor e ordem — sem turmas — e só o próprio módulo', async () => {
		expect(await modulos({ id: ids.b }).duplicar(modA)).toBeNull();
		const copia = await modulos({ id: ids.a }).duplicar(modA);
		expect(copia).not.toBeNull();
		const original = await modulos({ id: ids.a }).byId(modA);
		const duplicado = await modulos({ id: ids.a }).byId(copia!);
		expect(duplicado?.name).toBe('Frutas (cópia)');
		expect(duplicado?.color).toBe('teal');
		expect(duplicado?.atividades.map((a) => a.id)).toEqual(original?.atividades.map((a) => a.id));
		expect(await programacoes({ id: ids.a }).doModulo(copia!)).toEqual([]);
	});
});

describe('isolamento de turmas e envios', () => {
	it('turma de outro professor não é lida', async () => {
		expect(await turmas({ id: ids.b }).byId(turmaA)).toBeNull();
		expect((await turmas({ id: ids.b }).list()).map((t) => t.id)).not.toContain(turmaA);
	});

	it('não dá para mandar a publicação de OUTRO professor para a própria turma', async () => {
		const turmaB = await turmas({ id: ids.b }).create('Turma B', null, 'violeta', [
			{ name: 'Zé', email: 'ze@test.dev' }
		]);
		const publicacaoDoA = await prisma.publication.findFirstOrThrow({
			where: { activityVersion: { activityId: publicadas[0] } }
		});
		expect(await envios({ id: ids.b }).create(publicacaoDoA.id, turmaB.id)).toBeNull();
	});
});
