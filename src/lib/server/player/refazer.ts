import { playerRepo } from '$lib/server/db/repos/player';
import { apagarPrefixo } from '$lib/server/storage';
import { falaDaTentativa } from '$lib/server/tts';

/**
 * Responder de novo, quando o professor deixou (`allowRetake`): fica a ÚLTIMA
 * entrega. A refeita, ao ser entregue, toma o lugar da anterior — o professor
 * vê uma tentativa por aluno, a mais recente, e não o histórico de tentativas.
 *
 * **A troca acontece na ENTREGA, não no começo.** Até lá as duas existem: quem
 * abre o refazer e desiste no meio continua com o que entregou da outra vez. O
 * professor vê a nova como "em andamento" ao lado da antiga, e é verdade.
 *
 * **As gravações de fala da anterior saem do bucket na mesma hora**, não no
 * prazo de 7 dias: a resposta a que elas pertenciam deixou de existir, e é a
 * voz de uma pessoa (auth.md "A gravação de voz"). O banco vai primeiro — a
 * troca é o que importa ao aluno e ao professor —, e se o bucket falhar a regra
 * de ciclo de vida de `fala/` apaga o que sobrou no prazo de sempre.
 */
export async function trocarPelaRefeita(
	nova: { id: string; publicationId: string; substituiId: string | null },
	apagar: (prefixo: string) => Promise<number> = apagarPrefixo
): Promise<boolean> {
	if (!nova.substituiId) return false;
	const trocou = await playerRepo.substituirTentativa(nova, nova.substituiId);
	if (!trocou) return false;
	try {
		await apagar(falaDaTentativa(nova.substituiId));
	} catch (erro) {
		console.warn('[refazer] as gravações da tentativa anterior ficaram para o prazo', erro);
	}
	return true;
}
