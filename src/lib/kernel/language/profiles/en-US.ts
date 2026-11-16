import type { LanguageProfile } from '../profile';
import { equivalenciasEmIngles } from './en-comum';
import { pronunciaEmInglesAmericano } from './en-pronuncia';

/**
 * Inglês americano — idioma alvo mais comum do produto hoje. Sem acento no
 * vocabulário nativo, mas `tolerant` cobre empréstimos (ex.: "café", "naïve")
 * digitados sem o diacrítico. Aqui `tolerant` é seguro porque o inglês não tem
 * nenhum par de palavras que se distinga só por marca combinante — o que NÃO
 * vale para japonês nem híndi (ver `ja-JP.ts` e `hi-IN.ts`).
 */
export const enUS: LanguageProfile = {
	tag: 'en-US',
	direction: 'ltr',
	segmentation: 'icu-word',
	normalizers: ['nfkc', 'lowercase', 'strip-punct'],
	diacritics: 'tolerant',
	caseSensitive: false,
	/**
	 * **A lista é filtrada pela NOTA do próprio Kokoro** (VOICES.md do modelo),
	 * não pelo tamanho do catálogo: entram só as de C+ para cima. As demais têm
	 * pouco material de treino e soam artificiais — e numa questão de escuta o
	 * aluno perde o exercício por causa da voz, não da língua.
	 *
	 * A versão anterior tinha quatro vozes e uma delas era `am_adam`, **grau F+,
	 * a pior do catálogo inteiro**. Um quarto do áudio em inglês saía nela.
	 *
	 * Seis femininas e três masculinas porque o Kokoro não tem voz masculina
	 * americana acima de C+ — é limite do modelo, não escolha.
	 */
	tts: {
		voices: [
			'af_heart', // A
			'af_bella', // A-
			'af_nicole', // B-
			'af_aoede', // C+
			'af_kore', // C+
			'af_sarah', // C+
			'am_fenrir', // C+
			'am_michael', // C+
			'am_puck' // C+
		],
		speeds: [1, 0.75]
	},
	asr: { model: 'en-US', hints: [] },
	input: { modo: 'nativo' },
	// Numerais e contrações são os mesmos do britânico — `en-comum.ts`.
	equivalences: equivalenciasEmIngles,
	pronuncia: pronunciaEmInglesAmericano
};
