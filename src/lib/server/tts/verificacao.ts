import { verificarSintese, type LinhaDoTempo, type SomNoTempo } from '$lib/kernel/language/sintese';
import type { SinteseDoTts, TtsProvider } from './provider';

/**
 * A SÍNTESE CONFERIDA: cada áudio é ouvido de volta pelo reconhecedor de fonemas
 * antes de ir para o bucket (pedido do dono do repositório, depois do relato
 * R-LX4WSJ — "a fala ficou estranha, não parecia a mesma frase").
 *
 * O que se mediu nas nove vozes do inglês: a versão NORMAL sai certa; a DEVAGAR,
 * às vezes, nasce com um som a mais no começo, que se ouve como uma sílaba ("So
 * I don't know", "A good morning", "And can you help me"). Então:
 *
 * - **Aprovada** — vai como saiu.
 * - **Reprovada na versão devagar** — pede de novo com `esticar`: a fala sai da
 *   síntese normal, esticada sem mudar o tom, e é conferida de novo. Na medição,
 *   os cinco casos que falhavam passaram todos assim.
 * - **Reprovada na normal** — não há reserva (trocar de voz trocaria a voz da
 *   frase, que sai do texto): vai como saiu, marcada `suspeita`, e o log diz por
 *   quê.
 * - **Sem verificação** — o provedor não disse o que pretendia (o de mentira), o
 *   reconhecedor está desligado ou fora do ar, ou o idioma não escreve em IPA que
 *   se meça. O áudio vai, como sempre foi; verificar nunca trava a fila.
 *
 * A LINHA DO TEMPO (onde cada som está no arquivo) vem do próprio serviço de
 * áudio, junto da síntese, e vai como veio: é a da versão que foi para o bucket
 * (a esticada tem a dela). O reconhecedor marca um instante por som, não o começo
 * e o fim dele, e por isso não serve para isso (`LinhaDoTempo`, kernel).
 */

export type QualidadeDoAudio = 'aprovada' | 'esticada' | 'suspeita' | 'sem-verificacao';

/** Quem ouve o arquivo: os sons com o tempo de cada um, e a duração. */
export type Ouvinte = (
	audio: Uint8Array,
	contentType: string
) => Promise<{ sons: SomNoTempo[]; duracao: number }>;

export interface PedidoDeSintese {
	text: string;
	voice: string;
	speed: number;
}

export interface SinteseConferida {
	audio: Uint8Array;
	contentType: string;
	qualidade: QualidadeDoAudio;
	/** Onde cada som está no arquivo que vai para o bucket. */
	linha: LinhaDoTempo | null;
	/** Por que reprovou ("vogal antes da fala"), quando reprovou. */
	motivo?: string;
}

export async function sintetizarConferido(
	pedido: PedidoDeSintese,
	provedor: TtsProvider,
	ouvinte: Ouvinte | null
): Promise<SinteseConferida> {
	const { text, voice, speed } = pedido;

	const ouvir = async (sintese: SinteseDoTts) => {
		if (!ouvinte || !sintese.fonemas) return null;
		try {
			return await ouvinte(sintese.audio, sintese.contentType);
		} catch (erro) {
			// O reconhecedor desligado (503) ou fora do ar: o áudio segue sem a
			// conferência, como era antes dela.
			console.warn('[tts] não deu para ouvir a síntese:', (erro as Error).message);
			return null;
		}
	};
	const saida = (
		sintese: SinteseDoTts,
		qualidade: QualidadeDoAudio,
		motivo?: string
	): SinteseConferida => ({
		audio: sintese.audio,
		contentType: sintese.contentType,
		qualidade,
		linha: sintese.linha ?? null,
		...(motivo ? { motivo } : {})
	});

	const sintese = await provedor.synthesize(text, voice, speed);
	const ouvido = await ouvir(sintese);
	if (!ouvido || !sintese.fonemas) return saida(sintese, 'sem-verificacao');

	// Na versão devagar nenhum som antes da fala passa; na normal, a respiração passa.
	const veredito = verificarSintese(sintese.fonemas, ouvido.sons, {
		consoantesAntes: speed < 1 ? 0 : 1
	});
	if (veredito.situacao === 'sem-como-verificar') return saida(sintese, 'sem-verificacao');
	if (veredito.situacao === 'aprovada') return saida(sintese, 'aprovada');

	// Reprovada. A versão devagar tem reserva: a normal esticada.
	if (speed < 1) {
		const esticada = await provedor.synthesize(text, voice, speed, { esticar: true });
		if (esticada.esticada) {
			const ouvidoDaEsticada = await ouvir(esticada);
			const segundo =
				ouvidoDaEsticada && esticada.fonemas
					? verificarSintese(esticada.fonemas, ouvidoDaEsticada.sons, { consoantesAntes: 1 })
					: null;
			return saida(
				esticada,
				segundo?.situacao === 'reprovada' ? 'suspeita' : 'esticada',
				veredito.motivo
			);
		}
	}
	return saida(sintese, 'suspeita', veredito.motivo);
}
