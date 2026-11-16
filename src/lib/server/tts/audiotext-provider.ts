import type { TtsProvider } from './provider';
import { sintetizar } from '$lib/server/audiotext/client';

/**
 * TTS pelo `audiotext-service` (Kokoro-82M).
 *
 * A `voice` que chega é a do `LanguageProfile` — "pt-BR-standard". O serviço
 * de áudio resolve esse apelido para a voz dele ("pf_dora"), de propósito: o
 * catálogo do Kokoro não deve vazar para dentro do produto, senão trocar de
 * modelo de voz vira uma edição em cinco perfis de idioma.
 */
export const audiotextTtsProvider: TtsProvider = {
	synthesize(text, voice, speed, opcoes) {
		return sintetizar(text, voice, speed, { esticar: opcoes?.esticar });
	}
};
