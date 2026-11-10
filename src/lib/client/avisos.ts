import { untrack } from 'svelte';
import type { AlvoVisto } from '$lib/notificacoes';
import { marcarAvisosVistos } from '../../routes/(studio)/studio.remote';

/**
 * Disparado na janela quando um aviso vira lido — pela tela de destino
 * (`marcarVisto`) ou pelo próprio sino. O layout do Studio e o sino escutam e
 * recarregam a consulta deles: chamar `refresh()` daqui, fora de um componente,
 * não alcança a instância que eles leem, e o número da barra ficava parado até a
 * atualização seguinte (um minuto).
 */
export const AVISOS_LIDOS = 'spokke:avisos-lidos';

export function avisarQueLeu(): void {
	window.dispatchEvent(new Event(AVISOS_LIDOS));
}

/**
 * A tela de destino de um aviso ACABOU de abrir: o que ela mostra conta como
 * visto (docs/notificacoes.md). Chamado num `$effect` da página — nunca no
 * loader, que roda também no pré-carregamento ao passar o ponteiro sobre um
 * link. Falhar aqui não quebra a tela: o pior caso é o número continuar até a
 * próxima atualização do sino.
 */
export function marcarVisto(alvo: AlvoVisto): void {
	// `untrack`: chamada de dentro de um `$effect`, a remote function lê estado
	// reativo dela mesma (o pedido em andamento), e o efeito passava a depender
	// dele — cada resposta disparava o efeito de novo, em laço.
	untrack(() => marcarAvisosVistos(alvo))
		.then((r) => {
			if (r.vistos > 0) avisarQueLeu();
		})
		.catch(() => {});
}
