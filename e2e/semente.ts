import 'dotenv/config';
import { prisma } from '../src/lib/server/db/client.ts';

/**
 * A semente do E2E do aluno (testing.md "E2E"): um professor descartável e DUAS
 * atividades publicadas, iguais, só de texto (sem áudio, para não depender da
 * fila de TTS) — uma com o resultado liberado e outra sem. Três interações
 * diferentes: escolher, montar a frase e digitar.
 *
 * Grava no banco do `.env`, como o resto do `preview`; tudo nasce com um prefixo
 * da rodada e sai no teardown — inclusive as tentativas que os cenários criarem.
 */

export const GABARITO = {
	escolha: 'green tea',
	montar: ['I', 'like', 'green', 'tea'],
	distrator: 'coffee',
	// Uma frase que não aparece em lugar nenhum do produto: se ela chegar ao
	// navegador numa atividade com o resultado desligado, o gabarito vazou.
	digitar: 'Purple zebras dance'
} as const;

const ITENS = [
	{
		prompt: {
			kind: 'text',
			text: 'Como se diz "chá verde"?',
			instructionKey: 'translate-to-target'
		},
		interaction: {
			type: 'choice',
			payload: { options: [GABARITO.escolha, 'black coffee', 'orange juice'], correctIndex: 0 }
		},
		grading: { mode: 'exact' }
	},
	{
		prompt: { kind: 'text', text: 'Eu gosto de chá verde', instructionKey: 'translate-to-target' },
		interaction: {
			type: 'assemble',
			payload: {
				tokens: [...GABARITO.montar],
				distractors: [GABARITO.distrator],
				accepted: [[...GABARITO.montar]]
			}
		},
		grading: { mode: 'sequence' }
	},
	{
		prompt: { kind: 'text', text: 'Zebras roxas dançam', instructionKey: 'translate-to-target' },
		interaction: { type: 'type', payload: { accepted: [GABARITO.digitar] } },
		grading: { mode: 'tolerant' }
	}
];

export async function semear(
	rodada: string
): Promise<{ comResultado: string; semResultado: string }> {
	const teacherId = `e2e-${rodada}`;
	await prisma.teacher.create({
		data: {
			id: teacherId,
			name: 'Professora E2E',
			email: `${teacherId}@test.dev`,
			subscriptionStatus: 'trialing',
			trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
		}
	});
	const slugs: string[] = [];
	for (const showResult of [true, false]) {
		const atividade = await prisma.activity.create({
			data: {
				title: showResult ? 'E2E com resultado' : 'E2E sem resultado',
				teacherId,
				sourceLang: 'pt-BR',
				targetLang: 'en-US'
			}
		});
		const versao = await prisma.activityVersion.create({
			data: { activityId: atividade.id, versionNumber: 1 }
		});
		for (const [order, item] of ITENS.entries()) {
			await prisma.item.create({
				data: {
					order,
					...item,
					locale: { source: 'pt-BR', target: 'en-US' },
					activityVersionId: versao.id
				}
			});
		}
		const slug = `e2e-${rodada}-${showResult ? 'com' : 'sem'}`;
		await prisma.publication.create({
			data: {
				slug,
				settings: { requireCode: false, code: null, showResult },
				activityVersionId: versao.id
			}
		});
		slugs.push(slug);
	}
	return { comResultado: slugs[0]!, semResultado: slugs[1]! };
}

export async function limpar(rodada: string): Promise<void> {
	const teacherId = `e2e-${rodada}`;
	const dela = { activityVersion: { activity: { teacherId } } };
	// Os RESTRICT de db.md: tentativas, depois publicações, depois o professor.
	await prisma.attempt.deleteMany({ where: { publication: dela } });
	await prisma.publication.deleteMany({ where: dela });
	await prisma.teacher.deleteMany({ where: { id: teacherId } });
}
