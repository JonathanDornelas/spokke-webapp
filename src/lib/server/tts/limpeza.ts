import { prisma } from '$lib/server/db/client';
import { itemAudioHashes } from '$lib/server/player/runtime';
import { apagarObjeto } from '$lib/server/storage';
import { ttsObjectKey } from './index';

/**
 * O áudio de atividade NÃO vence: fica enquanto alguma atividade do professor o
 * usa, e sai quando a última delas é apagada.
 *
 * Por que não vence mais: ele vivia 10 dias, e a entrada do Player
 * resintetizava o que tinha vencido — um link de três semanas atrás abria em
 * "gerando áudio" para a turma inteira. Com o limite de atividades por plano o
 * estoque é finito, e o arquivo (uma frase em MP3, ~35 kB) custa menos que a
 * espera.
 *
 * **"Usa" é por CONTEÚDO, não por atividade.** O arquivo é
 * `hash(texto, voz, velocidade)` por professor (db.md "MediaAsset"): a mesma
 * frase em duas atividades é UM arquivo, e apagar uma não pode levar o áudio da
 * outra. Por isso a conta é "hashes de todos os itens que ainda existem" contra
 * "áudios do professor" — e o que sobra sai, inclusive o de frases editadas há
 * tempos (o texto mudou, o hash mudou, o arquivo antigo ficou sem dono).
 *
 * A ordem é objeto primeiro, linha depois: se o bucket falhar, a linha fica e a
 * próxima limpeza tenta de novo; o contrário deixaria um arquivo órfão sem
 * ninguém que soubesse dele.
 */
export async function limparAudioSemUso(
	teacherId: string,
	apagar: (key: string) => Promise<void> = apagarObjeto
): Promise<{ apagados: number; falhas: number }> {
	const [itens, audios] = await Promise.all([
		prisma.item.findMany({
			where: { activityVersion: { activity: { teacherId } } },
			select: {
				id: true,
				prompt: true,
				interaction: true,
				grading: true,
				locale: true,
				activityVersion: { select: { activity: { select: { targetLang: true } } } }
			}
		}),
		prisma.mediaAsset.findMany({ where: { teacherId }, select: { id: true, hash: true } })
	]);

	const emUso = new Set(
		itens.flatMap((item) => itemAudioHashes(item, item.activityVersion.activity.targetLang))
	);
	const semUso = audios.filter((audio) => !emUso.has(audio.hash));

	const apagados: string[] = [];
	let falhas = 0;
	for (const audio of semUso) {
		try {
			await apagar(ttsObjectKey(teacherId, audio.hash));
			apagados.push(audio.id);
		} catch (erro) {
			falhas += 1;
			console.warn(`[tts] não deu para apagar ${audio.hash} do bucket:`, erro);
		}
	}
	if (apagados.length > 0) {
		await prisma.mediaAsset.deleteMany({ where: { teacherId, id: { in: apagados } } });
	}
	return { apagados: apagados.length, falhas };
}
