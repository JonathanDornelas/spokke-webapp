import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '$lib/server/db/client';
import { atividades } from '$lib/server/db/repos/activities';
import type { Item } from '$lib/kernel/item';
import { corrigirNaPrevia, versaoDaPrevia } from './previa';

const PLANO = { itemTarget: 12, skills: ['listening', 'speaking', 'reading', 'writing'] };

function traduzir(texto: string, modo: 'exact' | 'rubric' = 'exact'): Item {
	return {
		id: '',
		sourceContentId: null,
		generatedBy: null,
		prompt: { kind: 'text', text: texto, instructionKey: 'translate' },
		interaction: { type: 'type', payload: { accepted: [texto] } },
		grading: { mode: modo },
		locale: { source: 'pt-BR', target: 'en-US' }
	};
}

// A prévia do aluno (paginas.md "Prévia do aluno"): lê a versão do professor
// dono — e só dele, regra inviolável nº 4 —, corrige pelo kernel e não grava.
describe('prévia do aluno', () => {
	let teacherA: Awaited<ReturnType<typeof prisma.teacher.create>>;
	let teacherB: Awaited<ReturnType<typeof prisma.teacher.create>>;
	let activityId = '';

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
		const repo = atividades(teacherA);
		const activity = await repo.create('Prévia', 'pt-BR', 'en-US', PLANO);
		activityId = activity.id;
		await repo.replaceDraftItems(
			activity.id,
			[traduzir('book'), traduzir('Write about your city.', 'rubric')],
			[traduzir('table')]
		);
	});

	afterAll(async () => {
		const ids = [teacherA?.id, teacherB?.id].filter((id) => id !== undefined);
		if (ids.length > 0) await prisma.teacher.deleteMany({ where: { id: { in: ids } } });
	});

	it('não abre a atividade de outro professor', async () => {
		expect(await versaoDaPrevia(teacherB, activityId)).toBeNull();
		const daDona = await versaoDaPrevia(teacherA, activityId);
		expect(daDona?.activity.id).toBe(activityId);
	});

	it('traz o rascunho sem as questões de fora, com a seed da versão', async () => {
		const versao = (await versaoDaPrevia(teacherA, activityId))!;
		expect(versao.rascunho).toBe(true);
		expect(versao.linhas).toHaveLength(2);
		expect(versao.semente).toMatch(/^previa:/);
	});

	it('corrige pelo kernel: o certo sem resposta esperada, o errado com ela', async () => {
		const versao = (await versaoDaPrevia(teacherA, activityId))!;
		const livro = versao.linhas[0]!;

		const certa = await corrigirNaPrevia(versao, livro, { text: 'book' });
		expect(certa.ok && certa.correcao.veredito?.state).toBe('correct');
		expect(certa.ok && certa.correcao.esperada).toBe('');

		const errada = await corrigirNaPrevia(versao, livro, { text: 'pen' });
		expect(errada.ok && errada.correcao.veredito?.state).toBe('incorrect');
		expect(errada.ok && errada.correcao.dada).toBe('pen');
		expect(errada.ok && errada.correcao.esperada).toBe('book');
	});

	it('a escrita por rubrica vai sem veredito, como no Player', async () => {
		const versao = (await versaoDaPrevia(teacherA, activityId))!;
		const r = await corrigirNaPrevia(versao, versao.linhas[1]!, { text: 'My city is big.' });
		expect(r.ok && r.correcao.pendente).toBe(true);
		expect(r.ok && r.correcao.veredito).toBeNull();
	});

	it('recusa resposta fora do formato e não grava nada', async () => {
		const versao = (await versaoDaPrevia(teacherA, activityId))!;
		const r = await corrigirNaPrevia(versao, versao.linhas[0]!, { optionId: 'x' });
		expect(r.ok).toBe(false);
		const tentativas = await prisma.attempt.count({
			where: { publication: { activityVersion: { activityId } } }
		});
		expect(tentativas).toBe(0);
	});
});
