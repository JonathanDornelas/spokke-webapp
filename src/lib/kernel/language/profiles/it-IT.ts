import type { LanguageProfile } from '../profile';
import { acentosItaliano } from '../teclados';
import { numerais } from '../equivalences';

/**
 * Italiano. Acento SIGNIFICATIVO pelo mesmo motivo do francês e do espanhol:
 * ele distingue palavras — `e` (e) contra `è` (é), `la` (a) contra `là` (lá),
 * `si` (se) contra `sì` (sim). Os três são pares que aparecem em frase de
 * iniciante, e com `tolerant` o aluno passaria escrevendo o outro.
 */
export const itIT: LanguageProfile = {
	tag: 'it-IT',
	direction: 'ltr',
	segmentation: 'icu-word',
	normalizers: ['nfkc', 'lowercase', 'strip-punct'],
	diacritics: 'significant',
	caseSensitive: false,
	/**
	 * PENDÊNCIA: corte por nota não aplicado (kernel.md) — nenhuma nota do Kokoro
	 * verificada. É o catálogo de `lang_code: 'i'` do `audiotext-service`.
	 */
	tts: { voices: ['if_sara', 'im_nicola'], speeds: [1, 0.75] },
	asr: { model: 'it-IT', hints: [] },
	input: { modo: 'acentos', teclado: acentosItaliano },
	equivalences: numerais(
		[
			'zero',
			'uno|una|un',
			'due',
			'tre',
			'quattro',
			'cinque',
			'sei',
			'sette',
			'otto',
			'nove',
			'dieci',
			'undici',
			'dodici',
			'tredici',
			'quattordici',
			'quindici',
			'sedici',
			'diciassette',
			'diciotto',
			'diciannove'
		],
		['venti', 'trenta', 'quaranta', 'cinquanta', 'sessanta', 'settanta', 'ottanta', 'novanta'],
		// No italiano a dezena e a unidade se juntam numa palavra ("ventidue"), e
		// a dezena perde a vogal final antes de "uno" e "otto" ("ventuno",
		// "ventotto") — as duas formas entram porque as duas são escritas.
		(dezena, unidade) => {
			const junto = `${dezena}${unidade}`;
			if (unidade === 'uno' || unidade === 'otto') {
				return [`${dezena.slice(0, -1)}${unidade}`, junto];
			}
			return [junto];
		},
		[['100', 'cento']]
	),
	// "Sono stanco" e "Io sono stanco". Ver `LanguageProfile.sujeitoOmitivel`.
	sujeitoOmitivel: { pronomes: ['io', 'noi'], conjuncoes: ['e', 'ed', 'o', 'né'] }
};
