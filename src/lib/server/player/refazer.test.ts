/**
 * Responder de novo e a atividade em sequência, contra o banco de verdade.
 *
 * - a refeita só toma o lugar da anterior NA ENTREGA, e a anterior sai com as
 *   respostas e as gravações (o prefixo `fala/<id>/` inteiro);
 * - os relatos de problema da anterior passam para a nova — são da equipe;
 * - nada sai de OUTRA publicação, nem uma tentativa que ainda não foi entregue;
 * - o avanço só cresce, e a entrega diz qual chamada foi a primeira.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '$lib/server/db/client';
import { atividades } from '../db/repos/activities';
import { playerRepo } from '../db/repos/player';
import { falaDaTentativa } from '../tts';
import { trocarPelaRefeita } from './refazer';
import type { Item } from '$lib/kernel/item';

const PLANO = { itemTarget: 12, skills: ['listening', 'speaking', 'reading', 'writing'] };

function itemDeDigitar(alvo: string): Item {
	return {
		id: '',
		sourceContentId: null,
		generatedBy: null,
		prompt: { kind: 'text', text: alvo, instructionKey: 'translate' },
		interaction: { type: 'type', payload: { accepted: [alvo] } },
		grading: { mode: 'tolerant', tolerance: 0.9 },
		locale: { source: 'pt-BR', target: 'en-US' }
	};
}

describe('responder de novo', () => {
	let teacher: Awaited<ReturnType<typeof prisma.teacher.create>>;
	let publicacao: { id: string };
	let outraPublicacao: { id: string };
	let itemIds: string[] = [];

	async function publicar(titulo: string) {
		const repo = atividades(teacher);
		const activity = await repo.create(titulo, 'pt-BR', 'en-US', PLANO);
		await repo.replaceDraftItems(activity.id, [
			itemDeDigitar('she has been working here'),
			itemDeDigitar('they have just arrived')
		]);
		const pub = await repo.publishDraft(activity.id, `refazer-${crypto.randomUUID().slice(0, 8)}`, {
			showResult: true,
			allowRetake: true
		});
		if (!pub) throw new Error('não publicou');
		return { pub, activity };
	}

	/** Uma tentativa entregue, com resposta, gravação guardada e um relato. */
	async function entregue(publicationId: string, activityId: string, anon: string) {
		const t = await playerRepo.createAttempt(publicationId, 'Ana Refaz', anon, crypto.randomUUID());
		await playerRepo.recordAnswer(t.id, itemIds[0]!, { text: 'she has been working' }, 0.5, 9_000);
		await playerRepo.recordAudio(t.id, itemIds[0]!, `${falaDaTentativa(t.id)}x.webm`, new Date());
		await prisma.problemReport.create({
			data: {
				motivo: 'correcao',
				teacherId: teacher.id,
				attemptId: t.id,
				activityId,
				publicationId,
				itemId: itemIds[0]!,
				itemIndex: 1,
				interaction: 'type',
				contexto: {}
			}
		});
		await playerRepo.finishAttempt(t.id);
		return t;
	}

	beforeAll(async () => {
		teacher = await prisma.teacher.create({
			data: {
				id: crypto.randomUUID(),
				name: 'Professora Refazer',
				email: `refazer-${crypto.randomUUID()}@test.dev`
			}
		});
		const uma = await publicar('Refazer — uma');
		publicacao = uma.pub;
		const cheia = await prisma.item.findMany({
			where: { activityVersionId: uma.pub.activityVersionId },
			orderBy: { order: 'asc' }
		});
		itemIds = cheia.map((i) => i.id);
		outraPublicacao = (await publicar('Refazer — outra')).pub;
	});

	afterAll(async () => {
		await prisma.attempt.deleteMany({
			where: { publication: { activityVersion: { activity: { teacherId: teacher.id } } } }
		});
		await prisma.publication.deleteMany({
			where: { activityVersion: { activity: { teacherId: teacher.id } } }
		});
		await prisma.teacher.deleteMany({ where: { id: teacher.id } });
	});

	it('a refeita toma o lugar da anterior, com as gravações e os relatos', async () => {
		const pub = await prisma.publication.findUniqueOrThrow({
			where: { id: publicacao.id },
			include: { activityVersion: true }
		});
		const antiga = await entregue(pub.id, pub.activityVersion.activityId, 'anon-ana');
		const nova = await playerRepo.createAttempt(
			pub.id,
			'Ana Refaz',
			'anon-ana',
			crypto.randomUUID(),
			null,
			null,
			false,
			{ id: antiga.id, vez: antiga.vez }
		);
		expect(nova.vez).toBe(2);
		expect(nova.substituiId).toBe(antiga.id);

		// Até a entrega, as duas existem: desistir no meio não custa nada.
		expect(await prisma.attempt.count({ where: { id: { in: [antiga.id, nova.id] } } })).toBe(2);

		const apagados: string[] = [];
		const trocou = await trocarPelaRefeita(nova, async (prefixo) => {
			apagados.push(prefixo);
			return 1;
		});

		expect(trocou).toBe(true);
		expect(await prisma.attempt.findUnique({ where: { id: antiga.id } })).toBeNull();
		expect(await prisma.attemptItem.count({ where: { attemptId: antiga.id } })).toBe(0);
		// O prefixo INTEIRO da anterior, e só ele.
		expect(apagados).toEqual([`fala/${antiga.id}/`]);
		// O relato é da equipe: mudou de tentativa em vez de sumir.
		expect(await prisma.problemReport.count({ where: { attemptId: nova.id } })).toBe(1);
	});

	it('não apaga a entrega de outra publicação, nem uma que não foi entregue', async () => {
		const pub = await prisma.publication.findUniqueOrThrow({
			where: { id: outraPublicacao.id },
			include: { activityVersion: true }
		});
		const deOutra = await entregue(pub.id, pub.activityVersion.activityId, 'anon-bia');
		const pelaMetade = await playerRepo.createAttempt(
			publicacao.id,
			'Bia',
			'anon-bia',
			crypto.randomUUID()
		);

		const apagar = async () => {
			throw new Error('não devia chegar ao bucket');
		};
		const daqui = { id: crypto.randomUUID(), publicationId: publicacao.id };
		expect(await trocarPelaRefeita({ ...daqui, substituiId: deOutra.id }, apagar)).toBe(false);
		expect(await trocarPelaRefeita({ ...daqui, substituiId: pelaMetade.id }, apagar)).toBe(false);
		expect(await trocarPelaRefeita({ ...daqui, substituiId: null }, apagar)).toBe(false);

		expect(await prisma.attempt.count({ where: { id: { in: [deOutra.id, pelaMetade.id] } } })).toBe(
			2
		);
	});

	it('o bucket fora do ar não desfaz a troca — o prazo de fala/ leva o resto', async () => {
		const pub = await prisma.publication.findUniqueOrThrow({
			where: { id: publicacao.id },
			include: { activityVersion: true }
		});
		const antiga = await entregue(pub.id, pub.activityVersion.activityId, 'anon-caio');
		const nova = await playerRepo.createAttempt(
			pub.id,
			'Caio',
			'anon-caio',
			crypto.randomUUID(),
			null,
			null,
			false,
			{ id: antiga.id, vez: antiga.vez }
		);
		const trocou = await trocarPelaRefeita(nova, async () => {
			throw new Error('bucket fora do ar');
		});
		expect(trocou).toBe(true);
		expect(await prisma.attempt.findUnique({ where: { id: antiga.id } })).toBeNull();
	});
});

describe('a tentativa em sequência', () => {
	let teacher: Awaited<ReturnType<typeof prisma.teacher.create>>;
	let publicationId: string;

	beforeAll(async () => {
		teacher = await prisma.teacher.create({
			data: {
				id: crypto.randomUUID(),
				name: 'Professora Sequência',
				email: `sequencia-${crypto.randomUUID()}@test.dev`
			}
		});
		const repo = atividades(teacher);
		const activity = await repo.create('Sequência', 'pt-BR', 'en-US', PLANO);
		await repo.replaceDraftItems(activity.id, [itemDeDigitar('a'), itemDeDigitar('b')]);
		const pub = await repo.publishDraft(activity.id, `seq-${crypto.randomUUID().slice(0, 8)}`, {});
		if (!pub) throw new Error('não publicou');
		publicationId = pub.id;
	});

	afterAll(async () => {
		await prisma.attempt.deleteMany({
			where: { publication: { activityVersion: { activity: { teacherId: teacher.id } } } }
		});
		await prisma.publication.deleteMany({
			where: { activityVersion: { activity: { teacherId: teacher.id } } }
		});
		await prisma.teacher.deleteMany({ where: { id: teacher.id } });
	});

	it('o avanço só cresce: responder de novo uma questão de trás não o puxa de volta', async () => {
		const t = await playerRepo.createAttempt(publicationId, 'Davi', 'anon-davi', 'seed');
		expect(t.avanco).toBe(0);
		await playerRepo.avancarAte(t.id, 1);
		await playerRepo.avancarAte(t.id, 2);
		await playerRepo.avancarAte(t.id, 1);
		expect((await prisma.attempt.findUniqueOrThrow({ where: { id: t.id } })).avanco).toBe(2);
	});

	it('a entrega diz qual chamada foi a primeira', async () => {
		const t = await playerRepo.createAttempt(publicationId, 'Eva', 'anon-eva', 'seed');
		const [uma, outra] = await Promise.all([
			playerRepo.finishAttempt(t.id),
			playerRepo.finishAttempt(t.id)
		]);
		expect([uma, outra].filter(Boolean)).toHaveLength(1);
		expect(await playerRepo.finishAttempt(t.id)).toBe(false);
	});
});
