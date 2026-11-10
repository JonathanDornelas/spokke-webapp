/**
 * O relato de problema contra o banco de verdade. O que importa provar:
 *
 * - o relato chega com o que a equipe precisa SEM o aluno mandar: a questão de
 *   autoria (com o gabarito), a resposta que estava na tela e a correção refeita
 *   no servidor, com a forma normalizada dos dois lados;
 * - o NOME do aluno não vai (é dado dele, e não ajuda a achar erro nenhum);
 * - a tentativa é a prova de origem: questão de outra atividade é recusada;
 * - o clique duplo não vira dois relatos, e há teto por tentativa;
 * - a equipe é avisada pela fila (`aviso-equipe`), sem o gabarito no e-mail;
 * - apagar a tentativa leva os relatos, e a retenção apaga os velhos.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '$lib/server/db/client';
import { atividades } from '../db/repos/activities';
import { playerRepo } from '../db/repos/player';
import { relatosRepo } from '../db/repos/relatos';
import { INTERVALO_DA_MESMA_QUESTAO_MS, TETO_POR_TENTATIVA, registrarRelato } from './index';
import { limiteDaRetencao, purgarRelatosVencidos } from './retencao';
import { relatoSchema, type RelatoDoCliente } from './schema';
import type { Item } from '$lib/kernel/item';

const PLANO = { itemTarget: 12, skills: ['listening', 'speaking', 'reading', 'writing'] };
const NOME_DO_ALUNO = 'Maria Relato Silva';
const GABARITO = 'she has been working here';

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

const SERVIDOR = {
	userAgent: 'vitest',
	idiomaDoNavegador: 'pt-BR',
	versao: 'teste',
	ambiente: 'desenvolvimento' as const
};

function relato(attemptId: string, itemId: string, extras: Partial<RelatoDoCliente> = {}) {
	return relatoSchema.parse({
		attemptId,
		itemId,
		motivo: 'correcao',
		descricao: 'escrevi certo e deu errado',
		tela: {
			respostaNaTela: { text: 'She has been working  here!' },
			jaRespondida: true,
			verificando: false,
			tecladoAberto: false,
			audioTocado: 0,
			msNaQuestao: 12_000
		},
		aparelho: {
			navegador: 'Mozilla/5.0 (teste)',
			idiomas: ['pt-BR'],
			tela: { largura: 390, altura: 844, dpr: 3 },
			janela: { largura: 390, altura: 760 },
			toque: 5,
			online: true,
			fuso: 'America/Sao_Paulo',
			horaLocal: 'agora',
			menosMovimento: false,
			versao: 'teste',
			caminho: '/a/x/q/1'
		},
		diario: [{ em: 1, tipo: 'questao', texto: 'abriu a questão 1 (type)' }],
		...extras
	});
}

describe('o relato de problema', () => {
	let teacherId = '';
	let attemptId = '';
	let itemIds: string[] = [];
	let outraAtividadeItemId = '';

	beforeAll(async () => {
		const teacher = await prisma.teacher.create({
			data: {
				id: crypto.randomUUID(),
				name: 'Professora Relato',
				email: `relato-${crypto.randomUUID()}@test.dev`
			}
		});
		teacherId = teacher.id;
		const repo = atividades(teacher);

		const atividade = await repo.create('Present perfect — relato', 'pt-BR', 'en-US', PLANO);
		await repo.replaceDraftItems(atividade.id, [
			itemDeDigitar(GABARITO),
			itemDeDigitar('he has gone')
		]);
		const pub = await repo.publishDraft(atividade.id, `relato-${crypto.randomUUID().slice(0, 8)}`, {
			showResult: true
		});
		if (!pub) throw new Error('não publicou');

		const outra = await repo.create('Outra atividade', 'pt-BR', 'en-US', PLANO);
		await repo.replaceDraftItems(outra.id, [itemDeDigitar('they arrived')]);
		const pubOutra = await repo.publishDraft(
			outra.id,
			`relato-${crypto.randomUUID().slice(0, 8)}`,
			{
				showResult: true
			}
		);
		if (!pubOutra) throw new Error('não publicou a outra');
		const tentativaOutra = await playerRepo.createAttempt(pubOutra.id, 'X', 'anon-x', 'seed-x');
		outraAtividadeItemId =
			(await playerRepo.attemptById(tentativaOutra.id))?.publication.activityVersion.items[0]?.id ??
			'';

		const tentativa = await playerRepo.createAttempt(
			pub.id,
			NOME_DO_ALUNO,
			'anon-relato',
			'seed-relato'
		);
		attemptId = tentativa.id;
		itemIds = (
			(await playerRepo.attemptById(attemptId))?.publication.activityVersion.items ?? []
		).map((i) => i.id);
		await playerRepo.recordAnswer(
			attemptId,
			itemIds[0]!,
			{ text: 'She has been working  here!' },
			1,
			12_000
		);
	});

	afterAll(async () => {
		await prisma.job.deleteMany({
			where: { type: 'aviso-equipe', payload: { path: ['assunto'], string_contains: 'relato' } }
		});
		await prisma.attempt.deleteMany({
			where: { publication: { activityVersion: { activity: { teacherId } } } }
		});
		await prisma.publication.deleteMany({
			where: { activityVersion: { activity: { teacherId } } }
		});
		await prisma.teacher.deleteMany({ where: { id: teacherId } });
	});

	it('grava o relato com a questão, o gabarito e a correção refeita, sem o nome do aluno', async () => {
		const desfecho = await registrarRelato(relato(attemptId, itemIds[0]!), SERVIDOR);
		if (!desfecho.ok) throw new Error(desfecho.mensagem);
		expect(desfecho.codigo).toMatch(/^R-[A-Z0-9]{6}$/);

		const linha = await prisma.problemReport.findUniqueOrThrow({ where: { id: desfecho.id } });
		expect(linha).toMatchObject({
			motivo: 'correcao',
			descricao: 'escrevi certo e deu errado',
			status: 'aberto',
			teacherId,
			attemptId,
			itemId: itemIds[0],
			itemIndex: 1,
			interaction: 'type'
		});

		const contexto = linha.contexto as Record<string, unknown>;
		const json = JSON.stringify(contexto);
		// O que a equipe precisa, sem pedir ao aluno:
		expect(json).toContain(GABARITO); // a autoria (fica no servidor e na intranet)
		expect(contexto.correcaoAgora).toMatchObject({
			situacao: 'corrigida',
			nota: 1,
			normalizacao: { resposta: 'she has been working here', aceitas: [GABARITO] }
		});
		expect(contexto.respostaGravada).toMatchObject({ nota: 1, ms: 12_000 });
		expect(contexto.tentativa).toMatchObject({
			semente: `seed-relato:${itemIds[0]}`,
			comConta: false
		});
		// E o que NÃO pode ir:
		expect(json).not.toContain(NOME_DO_ALUNO);
		expect(json).not.toContain('anon-relato');
	});

	it('avisa a equipe pela fila, sem o gabarito no e-mail', async () => {
		const avisos = await prisma.job.findMany({
			where: { type: 'aviso-equipe', payload: { path: ['assunto'], string_contains: 'relato' } }
		});
		expect(avisos.length).toBeGreaterThan(0);
		const texto = JSON.stringify(avisos.map((a) => a.payload));
		expect(texto).toContain('Certa marcada como errada');
		expect(texto).not.toContain(GABARITO);
		expect(texto).not.toContain(NOME_DO_ALUNO);
	});

	it('recusa questão que não é desta tentativa e tentativa que não existe', async () => {
		expect(await registrarRelato(relato(attemptId, outraAtividadeItemId), SERVIDOR)).toMatchObject({
			ok: false,
			status: 404
		});
		expect(await registrarRelato(relato('nao-existe', itemIds[0]!), SERVIDOR)).toMatchObject({
			ok: false,
			status: 404
		});
	});

	it('o clique duplo não vira dois relatos; depois do intervalo, vira', async () => {
		const agora = new Date();
		const primeiro = await registrarRelato(relato(attemptId, itemIds[1]!), SERVIDOR, agora);
		expect(primeiro.ok).toBe(true);
		const duplo = await registrarRelato(relato(attemptId, itemIds[1]!), SERVIDOR, agora);
		expect(duplo).toMatchObject({ ok: false, status: 429 });
		const depois = await registrarRelato(
			relato(attemptId, itemIds[1]!),
			SERVIDOR,
			new Date(agora.getTime() + INTERVALO_DA_MESMA_QUESTAO_MS + 1000)
		);
		expect(depois.ok).toBe(true);
	});

	it(`para no teto de ${TETO_POR_TENTATIVA} relatos por tentativa`, async () => {
		const ja = await relatosRepo.contarDaTentativa(attemptId);
		// Completa o teto direto no banco (o caminho normal tem o intervalo entre relatos).
		for (let i = ja; i < TETO_POR_TENTATIVA; i++) {
			await relatosRepo.criar({
				motivo: 'outro',
				teacherId,
				attemptId,
				activityId: 'x',
				publicationId: 'x',
				itemId: itemIds[0]!,
				itemIndex: 1,
				interaction: 'type',
				contexto: {}
			});
		}
		const futuro = new Date(Date.now() + 24 * 60 * 60 * 1000);
		expect(await registrarRelato(relato(attemptId, itemIds[0]!), SERVIDOR, futuro)).toMatchObject({
			ok: false,
			status: 429
		});
	});

	it('o payload do navegador tem teto: JSON grande demais é recusado', () => {
		const grande = { text: 'a'.repeat(7000) };
		expect(
			relatoSchema.safeParse({
				...relato(attemptId, itemIds[0]!),
				tela: { ...relato(attemptId, itemIds[0]!).tela, respostaNaTela: grande }
			}).success
		).toBe(false);
	});

	it('a retenção apaga só o que passou do prazo', async () => {
		const velho = await relatosRepo.criar({
			motivo: 'outro',
			teacherId,
			attemptId,
			activityId: 'x',
			publicationId: 'x',
			itemId: itemIds[0]!,
			itemIndex: 1,
			interaction: 'type',
			contexto: {},
			createdAt: new Date(limiteDaRetencao().getTime() - 60_000)
		});
		const antes = await relatosRepo.contarDaTentativa(attemptId);
		await purgarRelatosVencidos();
		expect(await prisma.problemReport.findUnique({ where: { id: velho.id } })).toBeNull();
		expect(await relatosRepo.contarDaTentativa(attemptId)).toBe(antes - 1);
	});

	it('marcar muda o estado e quem resolveu; apagar a tentativa leva os relatos', async () => {
		const [um] = await prisma.problemReport.findMany({ where: { attemptId }, take: 1 });
		expect(await relatosRepo.marcar(um!.id, 'resolvido', 'admin:intranet:equipe@spokke.app')).toBe(
			true
		);
		expect(await prisma.problemReport.findUnique({ where: { id: um!.id } })).toMatchObject({
			status: 'resolvido',
			resolvedBy: 'admin:intranet:equipe@spokke.app'
		});
		expect(await relatosRepo.marcar('nao-existe', 'resolvido', 'x')).toBe(false);

		await prisma.attempt.delete({ where: { id: attemptId } });
		expect(await prisma.problemReport.count({ where: { attemptId } })).toBe(0);
	});
});
