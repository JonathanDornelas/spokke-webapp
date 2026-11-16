import { prisma } from '$lib/server/db/client';
import { playerRepo } from '$lib/server/db/repos/player';
import { itemAudioHashes } from '$lib/server/player/runtime';
import { enfileirarAudioFaltante } from './enfileirar';

/**
 * O ÁUDIO QUE FALTA, DE TODAS AS ATIVIDADES de uma vez.
 *
 * O áudio é identificado por `hash(texto, voz, velocidade)`. Quando a REGRA da
 * voz muda — a palavra da Pronúncia passou a sair na voz de referência do
 * inglês —, a atividade que já existia passa a pedir arquivos que ainda não
 * foram sintetizados, e a entrada do Player fecha o link ("áudio ainda sendo
 * gerado") até o worker chegar neles. Um por um, na primeira abertura de cada
 * atividade, é a turma inteira dando com a porta fechada.
 *
 * Isto adianta o trabalho: enfileira o que falta de todas, e o script de
 * atualização (`deploy/scripts/atualizar.sh`) roda ANTES de trocar o web — o
 * worker novo gera o áudio novo enquanto o web antigo ainda serve o antigo, e
 * ninguém encontra o link fechado.
 *
 * **Operação, não tela**: atravessa professores de propósito, como o worker, e
 * por isso lê o banco direto (a regra nº 4 é das remote functions). Cada job
 * sai com o `teacherId` do dono da atividade, por `enfileirarAudioFaltante`,
 * que é idempotente — rodar de novo não repete nada.
 *
 * "Atividade" aqui é o mesmo que a limpeza chama de em uso
 * (`limparAudioSemUso`): as questões de todas as versões que não foram tiradas
 * da atividade, publicadas ou no rascunho.
 */

const LOTE = 50;

export interface AudioQueFalta {
	/** Quantas atividades foram olhadas. */
	atividades: number;
	/** Arquivos que as atividades pedem e ainda não existem (cada um contado uma vez por professor). */
	faltando: number;
	/** Jobs que entraram na fila agora. Zero quando só conta, ou quando já estavam na fila. */
	enfileirados: number;
}

export async function audioQueFalta(
	opcoes: {
		/** Enfileira a síntese do que falta. Sem isto, só conta. */
		enfileirar?: boolean;
		/** Só estes professores (os testes); sem isto, todos. */
		teacherIds?: string[];
	} = {}
): Promise<AudioQueFalta> {
	const pedidos = new Map<string, Set<string>>();
	let atividades = 0;
	let enfileirados = 0;
	let cursor: string | undefined;

	for (;;) {
		const lote = await prisma.activity.findMany({
			where: opcoes.teacherIds ? { teacherId: { in: opcoes.teacherIds } } : undefined,
			orderBy: { id: 'asc' },
			take: LOTE,
			...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
			select: {
				id: true,
				teacherId: true,
				targetLang: true,
				versions: {
					select: {
						items: {
							where: { discarded: false },
							select: { id: true, prompt: true, interaction: true, grading: true, locale: true }
						}
					}
				}
			}
		});
		if (lote.length === 0) break;
		cursor = lote.at(-1)!.id;

		for (const atividade of lote) {
			atividades += 1;
			const items = atividade.versions.flatMap((v) => v.items);
			if (items.length === 0) continue;
			try {
				const hashes = items.flatMap((item) => itemAudioHashes(item, atividade.targetLang));
				if (hashes.length === 0) continue;
				const doProfessor = pedidos.get(atividade.teacherId) ?? new Set<string>();
				for (const hash of hashes) doProfessor.add(hash);
				pedidos.set(atividade.teacherId, doProfessor);
				if (opcoes.enfileirar) {
					enfileirados += await enfileirarAudioFaltante({
						teacherId: atividade.teacherId,
						targetTag: atividade.targetLang,
						items
					});
				}
			} catch (erro) {
				// Uma atividade com item fora do formato não pode parar a varredura.
				console.warn(`[tts] atividade ${atividade.id} ficou de fora:`, (erro as Error).message);
			}
		}
	}

	let faltando = 0;
	for (const [teacherId, hashes] of pedidos) {
		const { done, total } = await playerRepo.audioReady(teacherId, [...hashes]);
		faltando += total - done;
	}
	return { atividades, faltando, enfileirados };
}

/** Quantos jobs de TTS ainda esperam o worker (na fila ou rodando). */
export function ttsNaFila(): Promise<number> {
	return prisma.job.count({ where: { type: 'tts', status: { in: ['pending', 'processing'] } } });
}
