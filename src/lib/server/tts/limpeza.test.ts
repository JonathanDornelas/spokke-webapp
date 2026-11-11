import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '$lib/server/db/client';
import type { Item } from '$lib/kernel/item';
import { atividades } from '$lib/server/db/repos/activities';
import { itemAudioHashes } from '$lib/server/player/runtime';
import { limparAudioSemUso } from './limpeza';
import { ttsObjectKey } from './index';

const PLANO = { itemTarget: 12, skills: ['listening', 'reading'] };

/** Um item de escuta: o áudio dele é `hash(texto, voz, velocidade)`. */
function itemDeEscuta(texto: string): Item {
	return {
		id: '',
		sourceContentId: null,
		generatedBy: null,
		prompt: { kind: 'audio', text: texto, instructionKey: 'listen-type' },
		interaction: { type: 'type', payload: { accepted: [texto] } },
		grading: { mode: 'tolerant' },
		locale: { source: 'pt-BR', target: 'en-US' }
	};
}

/**
 * O áudio de atividade não vence: sai quando NENHUMA atividade do professor o
 * usa mais. O caso que mais importa é o compartilhado — a mesma frase em duas
 * atividades é um arquivo só, e apagar uma não pode levar o áudio da outra.
 */
describe('limparAudioSemUso', () => {
	let professora: { id: string };
	let outro: { id: string };

	beforeAll(async () => {
		professora = await prisma.teacher.create({
			data: {
				id: crypto.randomUUID(),
				name: 'Professora',
				email: `p-${crypto.randomUUID()}@test.dev`
			}
		});
		outro = await prisma.teacher.create({
			data: { id: crypto.randomUUID(), name: 'Outro', email: `o-${crypto.randomUUID()}@test.dev` }
		});
	});

	afterAll(async () => {
		const ids = [professora?.id, outro?.id].filter(Boolean);
		await prisma.publication.deleteMany({
			where: { activityVersion: { activity: { teacherId: { in: ids } } } }
		});
		await prisma.teacher.deleteMany({ where: { id: { in: ids } } });
	});

	async function audiosDe(teacherId: string, item: Item) {
		const hashes = itemAudioHashes(item, 'en-US');
		for (const hash of hashes) {
			await prisma.mediaAsset.create({
				data: { teacherId, hash, url: `http://teste/${hash}.mp3`, kind: 'audio' }
			});
		}
		return hashes;
	}

	it('apaga só o áudio que ficou sem atividade, e o compartilhado fica', async () => {
		const repo = atividades(professora);
		const compartilhada = itemDeEscuta('She has lived here for years.');
		const so_da_a = itemDeEscuta('The train leaves at nine.');

		const a = await repo.create('A', 'pt-BR', 'en-US', PLANO);
		await repo.replaceDraftItems(a.id, [compartilhada, so_da_a]);
		const b = await repo.create('B', 'pt-BR', 'en-US', PLANO);
		await repo.replaceDraftItems(b.id, [compartilhada]);

		const hashesCompartilhados = await audiosDe(professora.id, compartilhada);
		const hashesSoDaA = await audiosDe(professora.id, so_da_a);
		// O mesmo hash do OUTRO professor: escopo de tenant, nunca é tocado.
		await audiosDe(outro.id, so_da_a);

		// Com as duas atividades vivas, nada sai.
		expect(await limparAudioSemUso(professora.id, async () => {})).toEqual({
			apagados: 0,
			falhas: 0
		});

		await repo.apagarDeVez(a.id);
		const apagadas: string[] = [];
		const r = await limparAudioSemUso(professora.id, async (key) => {
			apagadas.push(key);
		});

		expect(r).toEqual({ apagados: hashesSoDaA.length, falhas: 0 });
		expect(apagadas.sort()).toEqual(hashesSoDaA.map((h) => ttsObjectKey(professora.id, h)).sort());
		const restantes = await prisma.mediaAsset.findMany({
			where: { teacherId: professora.id },
			select: { hash: true }
		});
		expect(restantes.map((r) => r.hash).sort()).toEqual([...hashesCompartilhados].sort());
		expect(await prisma.mediaAsset.count({ where: { teacherId: outro.id } })).toBe(
			hashesSoDaA.length
		);
	});

	it('bucket falhou: a linha FICA, para a próxima limpeza tentar de novo', async () => {
		const repo = atividades(professora);
		const item = itemDeEscuta('Where is the library?');
		const c = await repo.create('C', 'pt-BR', 'en-US', PLANO);
		await repo.replaceDraftItems(c.id, [item]);
		const hashes = await audiosDe(professora.id, item);
		await repo.apagarDeVez(c.id);

		const r = await limparAudioSemUso(professora.id, async () => {
			throw new Error('bucket fora do ar');
		});
		expect(r.falhas).toBe(hashes.length);
		expect(
			await prisma.mediaAsset.count({ where: { teacherId: professora.id, hash: { in: hashes } } })
		).toBe(hashes.length);
	});
});
