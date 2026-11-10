import { prisma } from '$lib/server/db/client';
import { itemAudioHashes } from '$lib/server/player/runtime';
import { CHAVE, notificar } from '$lib/server/notificacoes';

/**
 * A fila DESISTIU de um áudio (o job foi para `failed`): avisa o professor em
 * cada atividade que usa aquela frase. Sem o aviso ele só descobria pela turma —
 * o link responde 503 enquanto faltar áudio (server.md "TTS").
 *
 * O job só sabe o HASH (o áudio é identificado pelo conteúdo, db.md), então a
 * atividade sai da mesma conta de `limparAudioSemUso`: os itens do professor
 * cujo áudio é aquele hash. Arquivada fica de fora — não tem link aberto.
 */
export async function avisarAudioQueFalhou(teacherId: string, hash: string): Promise<void> {
	try {
		const itens = await prisma.item.findMany({
			where: { activityVersion: { activity: { teacherId, archivedAt: null } } },
			select: {
				id: true,
				prompt: true,
				interaction: true,
				grading: true,
				locale: true,
				activityVersion: {
					select: { activity: { select: { id: true, title: true, targetLang: true } } }
				}
			}
		});
		const atividades = new Map<string, string>();
		for (const item of itens) {
			const atividade = item.activityVersion.activity;
			if (itemAudioHashes(item, atividade.targetLang).includes(hash)) {
				atividades.set(atividade.id, atividade.title);
			}
		}
		for (const [activityId, titulo] of atividades) {
			await notificar(teacherId, {
				kind: 'audio',
				key: CHAVE.audio(activityId),
				data: { activityId, titulo }
			});
		}
	} catch (err) {
		console.warn('[notificacoes] áudio que falhou', err);
	}
}
