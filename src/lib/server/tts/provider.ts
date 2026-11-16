import type { LinhaDoTempo } from '$lib/kernel/language/sintese';

/**
 * Provedor de TTS ainda indefinido — ver "Pendências" no CLAUDE.md. Gerado na
 * publicação, nunca em runtime; chave do objeto é hash(texto, voz,
 * velocidade), sempre duas velocidades (normal e reduzida). Ver
 * .claude/rules/server.md "TTS".
 */
export interface TtsProvider {
	synthesize(
		text: string,
		voice: string,
		speed: number,
		opcoes?: OpcoesDaSintese
	): Promise<SinteseDoTts>;
}

export interface OpcoesDaSintese {
	/**
	 * Com `speed` abaixo de 1: a versão devagar sai da síntese NORMAL esticada, e
	 * não da síntese lenta. É a reserva de quando a lenta nasceu com um som a mais
	 * (`server/tts/verificacao.ts`). Provedor sem isso ignora.
	 */
	esticar?: boolean;
}

export interface SinteseDoTts {
	audio: Uint8Array;
	contentType: string;
	/**
	 * Onde cada som está no áudio (`LinhaDoTempo`): o que deixa a Pronúncia tocar
	 * uma sílaba só e a boca andar no tempo do som. Ausente no provedor que não
	 * informa (o de mentira).
	 */
	linha?: LinhaDoTempo;
	/**
	 * Os fonemas que a voz PRETENDIA dizer, em IPA. É contra eles que a
	 * verificação compara o que o reconhecedor ouviu no arquivo. Ausente, não há
	 * o que verificar (o provedor de mentira).
	 */
	fonemas?: string;
	/** A versão devagar saiu da normal esticada. */
	esticada?: boolean;
}
