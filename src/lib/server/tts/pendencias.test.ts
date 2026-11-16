import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '$lib/server/db/client';
import type { Item } from '$lib/kernel/item';
import { atividades } from '$lib/server/db/repos/activities';
import { itemAudioHashes } from '$lib/server/player/runtime';
import { audioQueFalta } from './pendencias';

const PLANO = { itemTarget: 12, skills: ['listening', 'reading'] };

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
 * A conta do áudio que falta, que o script de atualização usa para adiantar a
 * síntese antes de trocar o web. Só a LEITURA é testada aqui: enfileirar é
 * `enfileirarAudioFaltante`, e um job de verdade nesta fila seria pego por um
 * worker que estivesse rodando sobre o mesmo banco.
 */
describe('audioQueFalta', () => {
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
		await prisma.teacher.deleteMany({ where: { id: { in: ids } } });
	});

	it('conta o que as atividades pedem e não existe, uma vez por arquivo', async () => {
		const repo = atividades(professora);
		const frase = itemDeEscuta('She has lived here for years.');
		const a = await repo.create('A', 'pt-BR', 'en-US', PLANO);
		await repo.replaceDraftItems(a.id, [frase, itemDeEscuta('The train leaves at nine.')]);
		// A mesma frase noutra atividade é o MESMO arquivo: não conta duas vezes.
		const b = await repo.create('B', 'pt-BR', 'en-US', PLANO);
		await repo.replaceDraftItems(b.id, [frase]);

		// Duas frases, duas velocidades cada.
		expect(await audioQueFalta({ teacherIds: [professora.id] })).toEqual({
			atividades: 2,
			faltando: 4,
			enfileirados: 0
		});

		const hashes = itemAudioHashes(frase, 'en-US');
		// Com o áudio de uma das frases no bucket, falta só o da outra.
		for (const hash of hashes) {
			await prisma.mediaAsset.create({
				data: { teacherId: professora.id, hash, url: `http://teste/${hash}.mp3`, kind: 'audio' }
			});
		}
		expect((await audioQueFalta({ teacherIds: [professora.id] })).faltando).toBe(2);
	});

	it('o áudio de um professor não cobre a falta de outro', async () => {
		const frase = itemDeEscuta('She has lived here for years.');
		const c = await atividades(outro).create('C', 'pt-BR', 'en-US', PLANO);
		await atividades(outro).replaceDraftItems(c.id, [frase]);
		// A professora já tem este arquivo; o outro, não: o áudio é por professor.
		expect(await audioQueFalta({ teacherIds: [outro.id] })).toEqual({
			atividades: 1,
			faltando: 2,
			enfileirados: 0
		});
	});
});
