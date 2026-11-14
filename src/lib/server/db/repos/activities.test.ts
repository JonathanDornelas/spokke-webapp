import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '$lib/server/db/client';
import type { Item } from '$lib/kernel/item';
import { atividades } from './activities';

/** O plano de geração vem da etapa 1; aqui só precisa ser válido e estável. */
const PLANO = { itemTarget: 12, skills: ['listening', 'speaking', 'reading', 'writing'] };

// Regra inviolável nº 4 + testing.md "Obrigatório em repositório": todo
// repositório precisa provar que não devolve dado de outro professor.
describe('atividades', () => {
	let teacherA: Awaited<ReturnType<typeof prisma.teacher.create>>;
	let teacherB: Awaited<ReturnType<typeof prisma.teacher.create>>;

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
		if (ids.length === 0) return;
		// `Publication` não cai em cascata com o professor — apagar direto viola
		// `Publication_activityVersionId_fkey`. Some com elas primeiro.
		await prisma.publication.deleteMany({
			where: { activityVersion: { activity: { teacherId: { in: ids } } } }
		});
		await prisma.teacher.deleteMany({ where: { id: { in: ids } } });
	});

	// A lista de atividades arquiva, desarquiva e apaga várias de uma vez: o id de
	// outro professor passa em silêncio, sem mudar nada dele.
	it('arquiva, desarquiva e apaga em massa só as deste professor', async () => {
		const daA = await atividades(teacherA).create('Da A, em massa', 'pt-BR', 'en-US', PLANO);
		const outraDaA = await atividades(teacherA).create('Outra da A', 'pt-BR', 'en-US', PLANO);
		const doB = await atividades(teacherB).create('Do B, em massa', 'pt-BR', 'en-US', PLANO);
		const ids = [daA.id, outraDaA.id, doB.id];

		expect(await atividades(teacherA).arquivarVarias(ids)).toBe(2);
		expect((await atividades(teacherB).byId(doB.id))?.archivedAt).toBeNull();
		expect(await atividades(teacherA).contarArquivadas(ids)).toBe(2);

		expect(await atividades(teacherA).desarquivarVarias([daA.id, doB.id])).toBe(1);
		expect((await atividades(teacherA).byId(daA.id))?.archivedAt).toBeNull();

		expect(await atividades(teacherA).apagarVariasDeVez(ids)).toBe(2);
		expect(await atividades(teacherA).byId(daA.id)).toBeNull();
		expect(await atividades(teacherB).byId(doB.id)).not.toBeNull();
	});

	it('não devolve atividade de outro professor', async () => {
		const activity = await atividades(teacherA).create('Atividade da A', 'pt-BR', 'en-US', PLANO);

		const fromOwner = await atividades(teacherA).byId(activity.id);
		const fromOther = await atividades(teacherB).byId(activity.id);

		expect(fromOwner?.id).toBe(activity.id);
		expect(fromOther).toBeNull();
	});

	/**
	 * O produto não tem versão na interface: para o professor a atividade é uma
	 * só, que ele publica e volta a editar. Estes dois testes cobrem o que
	 * sustenta isso por baixo — e os dois nasceram de bug real.
	 */
	describe('publicar, editar e publicar de novo', () => {
		function itemDeTeste(texto: string): Item {
			return {
				id: '',
				sourceContentId: null,
				generatedBy: null,
				prompt: { kind: 'text', text: texto, instructionKey: 'translate' },
				interaction: { type: 'type', payload: { accepted: [texto] } },
				grading: { mode: 'exact' },
				locale: { source: 'pt-BR', target: 'en-US' }
			};
		}

		it('devolve a atividade publicada como rascunho editável, sem tocar no que está no ar', async () => {
			const repo = atividades(teacherA);
			const activity = await repo.create('Para editar depois', 'pt-BR', 'en-US', PLANO);
			await repo.replaceDraftItems(activity.id, [itemDeTeste('livro'), itemDeTeste('mesa')]);
			await repo.publishDraft(activity.id, `editar-${crypto.randomUUID().slice(0, 8)}`, {});

			// Publicar congela a versão e o rascunho some: sem esta chamada a
			// tela de revisão abria VAZIA e a atividade sumia da frente dele.
			expect(await repo.draft(activity.id)).toBeNull();

			const editavel = await repo.draftFromPublished(activity.id);
			expect(editavel?.items).toHaveLength(2);

			const noAr = await repo.published(activity.id);
			expect(noAr?.items).toHaveLength(2);
			expect(noAr?.id).not.toBe(editavel?.id);

			// Idempotente: abrir a revisão duas vezes não gera dois rascunhos.
			const segunda = await repo.draftFromPublished(activity.id);
			expect(segunda?.id).toBe(editavel?.id);
		});

		it('republicar mantém o link e arquiva a publicação anterior', async () => {
			const repo = atividades(teacherA);
			const slug = `republicar-${crypto.randomUUID().slice(0, 8)}`;
			const activity = await repo.create('Para republicar', 'pt-BR', 'en-US', PLANO);
			await repo.replaceDraftItems(activity.id, [itemDeTeste('livro')]);
			const primeira = await repo.publishDraft(activity.id, slug, {});
			expect(primeira?.slug).toBe(slug);

			await repo.draftFromPublished(activity.id);
			await repo.replaceDraftItems(activity.id, [itemDeTeste('livro'), itemDeTeste('mesa')]);

			// `Publication.slug` é único: sem arquivar a anterior isto estourava
			// a constraint e o professor clicava em publicar sem nada acontecer.
			const segunda = await repo.publishDraft(activity.id, slug, {});
			expect(segunda?.slug).toBe(slug);
			expect(segunda?.id).not.toBe(primeira?.id);

			// A publicação antiga continua existindo — as tentativas em curso
			// apontam para ela — só perde o endereço público.
			const antiga = await prisma.publication.findUniqueOrThrow({ where: { id: primeira!.id } });
			expect(antiga.slug).toBe(`${slug}~1`);

			const noAr = await repo.published(activity.id);
			expect(noAr?.items).toHaveLength(2);
		});

		it('não rouba o link de outro professor', async () => {
			const slug = `disputado-${crypto.randomUUID().slice(0, 8)}`;
			const daA = await atividades(teacherA).create('Da A', 'pt-BR', 'en-US', PLANO);
			await atividades(teacherA).replaceDraftItems(daA.id, [itemDeTeste('livro')]);
			await atividades(teacherA).publishDraft(daA.id, slug, {});

			const daB = await atividades(teacherB).create('Do B', 'pt-BR', 'en-US', PLANO);
			await atividades(teacherB).replaceDraftItems(daB.id, [itemDeTeste('mesa')]);

			expect(await atividades(teacherB).publishDraft(daB.id, slug, {})).toBeNull();
			const aindaDaA = await prisma.publication.findUniqueOrThrow({ where: { slug } });
			expect(aindaDaA.activityVersionId).toBe((await atividades(teacherA).published(daA.id))?.id);
		});
	});

	/**
	 * A geração é para todos os materiais: o que passou da quantidade entra no
	 * rascunho como "fora", e o professor troca na revisão. O plano de geração e
	 * a questão criada no editor também são escritas — e escrita de outro
	 * professor não pode passar.
	 */
	describe('questões de fora, plano e questão do zero', () => {
		const questao = (texto: string): Item => ({
			id: '',
			sourceContentId: null,
			generatedBy: 'translate-type',
			prompt: { kind: 'text', text: texto, instructionKey: 'translate' },
			interaction: { type: 'type', payload: { accepted: [texto] } },
			grading: { mode: 'tolerant' },
			locale: { source: 'pt-BR', target: 'en-US' }
		});

		it('as questões de fora entram depois das outras, marcadas como fora', async () => {
			const repo = atividades(teacherA);
			const activity = await repo.create('Com fora', 'pt-BR', 'en-US', PLANO);
			const versao = await repo.replaceDraftItems(
				activity.id,
				[questao('um'), questao('dois')],
				[questao('três')]
			);
			expect(versao?.items.map((i) => [i.order, i.discarded])).toEqual([
				[0, false],
				[1, false],
				[2, true]
			]);
		});

		it('a questão do zero entra no fim das de dentro, antes do fecho e das de fora', async () => {
			const repo = atividades(teacherA);
			const activity = await repo.create('Do zero', 'pt-BR', 'en-US', PLANO);
			const fecho = { ...questao('fecho'), generatedBy: 'closing-match' };
			await repo.replaceDraftItems(activity.id, [questao('a'), fecho], [questao('fora')]);
			const criada = await repo.criarQuestaoManual(activity.id, {
				prompt: { kind: 'text', text: 'nova' },
				interaction: { type: 'type', payload: { accepted: ['nova'] } },
				grading: { mode: 'tolerant' },
				locale: { source: 'pt-BR', target: 'en-US' }
			});
			const ordem = (await repo.draft(activity.id))?.items.map((i) =>
				i.id === criada?.id ? 'nova' : (i.generatedBy ?? '')
			);
			expect(ordem).toEqual(['translate-type', 'nova', 'closing-match', 'translate-type']);
		});

		it('outro professor não grava plano, detalhes nem questão na atividade', async () => {
			const activity = await atividades(teacherA).create('Só da A', 'pt-BR', 'en-US', PLANO);
			await atividades(teacherA).replaceDraftItems(activity.id, [questao('x')]);
			const intruso = atividades(teacherB);

			expect(
				await intruso.atualizarPlano(activity.id, {
					itemTarget: 3,
					skills: ['reading'],
					tiposPorMaterial: {}
				})
			).toBe(false);
			expect(await intruso.atualizarDetalhes(activity.id, { title: 'roubada', level: null })).toBe(
				false
			);
			expect(
				await intruso.criarQuestaoManual(activity.id, {
					prompt: { kind: 'text', text: 'invasora' },
					interaction: { type: 'type', payload: { accepted: ['invasora'] } },
					grading: { mode: 'tolerant' },
					locale: { source: 'pt-BR', target: 'en-US' }
				})
			).toBeNull();

			const intacta = await atividades(teacherA).byId(activity.id);
			expect(intacta?.title).toBe('Só da A');
			expect(intacta?.itemTarget).toBe(PLANO.itemTarget);
			expect((await atividades(teacherA).draft(activity.id))?.items).toHaveLength(1);
		});

		it('reordena o roteiro: as de dentro na ordem pedida, as de fora depois; outro professor não', async () => {
			const repo = atividades(teacherA);
			const activity = await repo.create('Roteiro', 'pt-BR', 'en-US', PLANO);
			const versao = await repo.replaceDraftItems(
				activity.id,
				[questao('a'), questao('b'), questao('c')],
				[questao('fora')]
			);
			const [a, b, c, fora] = versao?.items.map((i) => i.id) ?? [];
			if (!a || !b || !c || !fora) throw new Error('rascunho incompleto');

			expect(await atividades(teacherB).reordenarRascunho(activity.id, [c, a, b])).toBe(false);
			// A lista precisa ser exatamente as de dentro: com a de fora, ou faltando uma, nada muda.
			expect(await repo.reordenarRascunho(activity.id, [c, a, fora])).toBe(false);
			expect(await repo.reordenarRascunho(activity.id, [c, a])).toBe(false);

			expect(await repo.reordenarRascunho(activity.id, [c, a, b])).toBe(true);
			const ordem = (await repo.draft(activity.id))?.items.map((i) => i.id);
			expect(ordem).toEqual([c, a, b, fora]);
		});

		it('aceitar põe a questão no fim do roteiro, antes do associar que fecha; outro professor não', async () => {
			const repo = atividades(teacherA);
			const activity = await repo.create('Aceitar', 'pt-BR', 'en-US', PLANO);
			const fecho = { ...questao('fecho'), generatedBy: 'closing-match' };
			const versao = await repo.replaceDraftItems(
				activity.id,
				[questao('a'), questao('b'), fecho],
				[questao('fora 1'), questao('fora 2')]
			);
			const [a, b, f, fora1, fora2] = versao?.items.map((i) => i.id) ?? [];
			if (!a || !b || !f || !fora1 || !fora2) throw new Error('rascunho incompleto');
			const ordem = async () => (await repo.draft(activity.id))?.items.map((i) => i.id);

			expect(await atividades(teacherB).setDraftItemDiscarded(activity.id, fora2, false)).toBe(
				false
			);
			expect(await ordem()).toEqual([a, b, f, fora1, fora2]);

			expect(await repo.setDraftItemDiscarded(activity.id, fora2, false)).toBe(true);
			expect(await ordem()).toEqual([a, b, fora2, f, fora1]);

			// O fecho que o professor arrastou para o começo fica lá: aceitar não o devolve ao fim.
			expect(await repo.reordenarRascunho(activity.id, [f, a, b, fora2])).toBe(true);
			expect(await repo.acceptAllDraftItems(activity.id)).toBe(1);
			expect(await ordem()).toEqual([f, a, b, fora2, fora1]);
		});

		it('o dono grava o plano com os tipos de cada material', async () => {
			const repo = atividades(teacherA);
			const activity = await repo.create('Plano', 'pt-BR', 'en-US', PLANO);
			expect(
				await repo.atualizarPlano(activity.id, {
					itemTarget: 7,
					skills: ['reading', 'writing'],
					tiposPorMaterial: { m1: ['reading'], m2: ['writing'] }
				})
			).toBe(true);
			const lida = await repo.byId(activity.id);
			expect(lida?.itemTarget).toBe(7);
			expect(lida?.tiposPorMaterial).toEqual({ m1: ['reading'], m2: ['writing'] });
		});
	});
});
