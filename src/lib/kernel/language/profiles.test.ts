import { describe, expect, it } from 'vitest';
import { getProfile, labelForTag, languageLabels, languageProfiles, tagForLabel } from './profiles';
import type { LanguageProfile } from './profile';
import { normalize } from './normalize';
import { tokenize } from './tokenize';

/**
 * A integridade dos `LanguageProfile`. Nada aqui testa comportamento de
 * correção — isso é `normalize-idiomas.test.ts`. O que este arquivo guarda é a
 * COERÊNCIA do cadastro, e cada caso nasceu de uma forma de errar que não dá
 * erro em lugar nenhum:
 *
 * - voz que não existe no provedor → a publicação trava em "gerando áudio"
 *   para sempre, porque o worker enfileira e o serviço recusa
 * - voz de OUTRO idioma → o áudio sai, e sai falando a frase com o sotaque
 *   errado (ou ininteligível)
 * - idioma cadastrado sem rótulo → `labelForTag` devolve a tag crua, e o
 *   professor vê "hi-IN" no lugar de "Híndi"
 * - rótulo sem idioma → o `<select>` oferece uma opção que estoura no submit
 */

const entradas = Object.entries(languageProfiles);

/**
 * Tag BCP-47 → a LETRA que o Kokoro usa (`lang_code`), e o prefixo de toda voz
 * daquele idioma. A fonte é `audiotext-service/app/voices.py`, que é quem fala
 * com o modelo.
 *
 * Mora no teste, não no kernel, de propósito: o kernel é agnóstico de idioma E
 * de provedor. O papel deste mapa é justamente ser a contraparte independente —
 * se ele morasse no profile, o profile concordaria consigo mesmo e o teste não
 * provaria nada.
 */
const LETRA_DO_KOKORO: Record<string, string> = {
	'en-US': 'a',
	'en-GB': 'b',
	'es-ES': 'e',
	'fr-FR': 'f',
	'hi-IN': 'h',
	'it-IT': 'i',
	'ja-JP': 'j',
	'pt-BR': 'p',
	'zh-CN': 'z'
};

/** Todo id de voz do Kokoro-82M (`audiotext-service/app/voices.py`). */
const VOZES_DO_KOKORO = new Set([
	// en-US
	'af_heart',
	'af_alloy',
	'af_aoede',
	'af_bella',
	'af_jessica',
	'af_kore',
	'af_nicole',
	'af_nova',
	'af_river',
	'af_sarah',
	'af_sky',
	'am_adam',
	'am_echo',
	'am_eric',
	'am_fenrir',
	'am_liam',
	'am_michael',
	'am_onyx',
	'am_puck',
	'am_santa',
	// en-GB
	'bf_alice',
	'bf_emma',
	'bf_isabella',
	'bf_lily',
	'bm_daniel',
	'bm_fable',
	'bm_george',
	'bm_lewis',
	// es-ES
	'ef_dora',
	'em_alex',
	'em_santa',
	// fr-FR
	'ff_siwis',
	// hi-IN
	'hf_alpha',
	'hf_beta',
	'hm_omega',
	'hm_psi',
	// it-IT
	'if_sara',
	'im_nicola',
	// ja-JP
	'jf_alpha',
	'jf_gongitsune',
	'jf_nezumi',
	'jf_tebukuro',
	'jm_kumo',
	// pt-BR
	'pf_dora',
	'pm_alex',
	'pm_santa',
	// zh-CN
	'zf_xiaobei',
	'zf_xiaoni',
	'zf_xiaoxiao',
	'zf_xiaoyi',
	'zm_yunjian',
	'zm_yunxi',
	'zm_yunxia',
	'zm_yunyang'
]);

/**
 * Escritas SEM caixa: `lowercase` ali não tem efeito e só confunde. O chinês
 * saiu daqui quando o pinyin virou resposta aceita — `Wǒ` e `wǒ` são a mesma
 * sílaba.
 */
const SEM_CAIXA = ['ja-JP', 'hi-IN', 'ar-SA'];

describe('cadastro de idiomas', () => {
	it('a chave do registro é a tag do próprio profile', () => {
		const divergentes = entradas
			.filter(([tag, profile]) => tag !== profile.tag)
			.map(([tag, profile]) => `${tag} → ${profile.tag}`);
		expect(divergentes).toEqual([]);
	});

	it('todo idioma cadastrado tem rótulo, e o rótulo volta na tag', () => {
		const semRotulo = entradas
			.map(([tag]) => tag)
			.filter((tag) => !Object.values(languageLabels).includes(tag));
		expect(semRotulo).toEqual([]);

		const naoFecha = Object.entries(languageLabels)
			.filter(([rotulo, tag]) => tagForLabel(rotulo) !== tag || labelForTag(tag) !== rotulo)
			.map(([rotulo]) => rotulo);
		expect(naoFecha).toEqual([]);
	});

	// Rótulo apontando para idioma que não existe faz o `<select>` oferecer uma
	// opção que estoura no submit — e o professor perde o que digitou.
	it('todo rótulo aponta para um profile que existe', () => {
		const orfaos = Object.entries(languageLabels)
			.filter(([, tag]) => !(tag in languageProfiles))
			.map(([rotulo, tag]) => `${rotulo} → ${tag}`);
		expect(orfaos).toEqual([]);
	});

	it('não há dois rótulos para o mesmo idioma', () => {
		const tags = Object.values(languageLabels);
		expect(tags).toHaveLength(new Set(tags).size);
	});

	it('cobre os nove idiomas que o Kokoro fala', () => {
		const cadastrados = entradas.map(([tag]) => tag);
		const faltando = Object.keys(LETRA_DO_KOKORO).filter((tag) => !cadastrados.includes(tag));
		expect(faltando).toEqual([]);
	});

	it('getProfile explode com tag desconhecida em vez de devolver undefined', () => {
		expect(() => getProfile('xx-XX')).toThrow();
	});
});

describe('vozes de cada idioma', () => {
	it.each(entradas)('%s: toda voz existe no catálogo do Kokoro', (_tag, profile) => {
		const inexistentes = profile.tts.voices.filter((v) => !VOZES_DO_KOKORO.has(v));
		expect(inexistentes).toEqual([]);
	});

	// Voz de outro idioma não dá erro: ela SINTETIZA, com o sotaque errado.
	it.each(entradas)('%s: toda voz pertence a este idioma', (tag, profile) => {
		const letra = LETRA_DO_KOKORO[tag];
		if (letra === undefined) {
			// Idioma que o Kokoro não fala precisa estar sem voz — ver o caso abaixo.
			expect(profile.tts.voices).toEqual([]);
			return;
		}
		const forasteiras = profile.tts.voices.filter((v) => !v.startsWith(letra));
		expect(forasteiras).toEqual([]);
	});

	// A lista vazia é a resposta honesta, e é o que faz o gerador não produzir
	// item de escuta em vez de travar a publicação (kernel.md).
	it('idioma que o Kokoro não fala está sem voz', () => {
		const semSuporte = entradas.filter(([tag]) => !(tag in LETRA_DO_KOKORO));
		expect(semSuporte.map(([tag]) => tag)).toEqual(['ar-SA']);
		for (const [, profile] of semSuporte) expect(profile.tts.voices).toEqual([]);
	});

	it.each(entradas)('%s: não repete voz', (_tag, profile) => {
		expect(profile.tts.voices).toHaveLength(new Set(profile.tts.voices).size);
	});

	// `speeds` são os ARQUIVOS sintetizados — normal e reduzida (server.md "TTS").
	// Uma velocidade a mais é um arquivo a mais por frase no bucket.
	it.each(entradas)('%s: sintetiza a velocidade normal e uma reduzida', (_tag, profile) => {
		expect(profile.tts.speeds).toEqual([1, 0.75]);
	});
});

describe('coerência do profile com a escrita', () => {
	it.each(entradas)('%s: só usa lowercase onde existe caixa', (tag, profile) => {
		const temLowercase = profile.normalizers.includes('lowercase');
		expect(temLowercase).toBe(!SEM_CAIXA.includes(tag));
	});

	// NFKC é o que faz forma composta e decomposta comparar igual — regra
	// inviolável nº 6. Sem ele, "é" pré-composto não bate com "e" + acento.
	it.each(entradas)('%s: normaliza Unicode', (_tag, profile) => {
		expect(profile.normalizers).toContain('nfkc');
	});

	it.each(entradas)('%s: o profile declara a própria tag como BCP-47 válido', (_tag, profile) => {
		expect(() => new Intl.Segmenter(profile.tag, { granularity: 'word' })).not.toThrow();
	});

	it('só o árabe é RTL hoje', () => {
		const rtl = entradas.filter(([, p]) => p.direction === 'rtl').map(([tag]) => tag);
		expect(rtl).toEqual(['ar-SA']);
	});
});

describe('grupos de equivalência', () => {
	const comGrupos = entradas.filter(([, p]) => p.equivalences.length > 0);

	it('idioma sem espaço entre palavras não declara equivalência', () => {
		// `aplicarEquivalencias` exige que os vizinhos NÃO sejam letra nem número,
		// e em japonês ou chinês todo vizinho é letra: nenhum grupo pegaria, e
		// listá-los daria a impressão de uma cobertura que não existe.
		for (const tag of ['ja-JP', 'zh-CN']) {
			expect(getProfile(tag).equivalences).toEqual([]);
		}
	});

	it.each(comGrupos)('%s: todo grupo tem canônica e ao menos uma variante', (_tag, profile) => {
		const degenerados = profile.equivalences
			.filter((grupo) => grupo.length < 2 || grupo.some((forma) => forma.trim() === ''))
			.map((grupo) => JSON.stringify(grupo));
		expect(degenerados).toEqual([]);
	});

	it.each(comGrupos)('%s: nenhum grupo repete a mesma forma', (_tag, profile) => {
		const repetidos = profile.equivalences
			.filter((grupo) => new Set(grupo).size !== grupo.length)
			.map((grupo) => JSON.stringify(grupo));
		expect(repetidos).toEqual([]);
	});

	// As formas são comparadas DEPOIS da normalização, então elas têm de já estar
	// normalizadas: uma variante com maiúscula ou pontuação nunca casaria.
	it.each(comGrupos)('%s: as variantes já estão na forma normalizada', (tag, profile) => {
		const temLowercase = profile.normalizers.includes('lowercase');
		const sujas = profile.equivalences.flat().filter((forma) => {
			const semPontuacao = forma.replace(/[\p{P}\p{S}]/gu, '');
			const esperada = temLowercase ? semPontuacao.toLocaleLowerCase(tag) : semPontuacao;
			return forma !== esperada || /\s{2,}|^\s|\s$/.test(forma);
		});
		expect(sujas).toEqual([]);
	});

	// Uma forma em DOIS grupos é ambígua: qual canônica vale depende da ordem em
	// que as regras correm, e a ordem é detalhe de implementação.
	it.each(comGrupos)('%s: nenhuma variante aparece em dois grupos', (_tag, profile) => {
		const vistas = new Map<string, number>();
		for (const grupo of profile.equivalences) {
			for (const forma of grupo.slice(1)) {
				vistas.set(forma, (vistas.get(forma) ?? 0) + 1);
			}
		}
		const ambiguas = [...vistas.entries()].filter(([, n]) => n > 1).map(([forma]) => forma);
		expect(ambiguas).toEqual([]);
	});
});

describe('LanguageProfile como contrato', () => {
	// Um campo esquecido num profile novo não dá erro de tipo se alguém usar
	// `as LanguageProfile` — este caso é a rede.
	it.each(entradas)('%s: preenche todos os campos do contrato', (_tag, profile) => {
		const p: LanguageProfile = profile;
		expect({
			tag: typeof p.tag,
			direction: p.direction,
			segmentation: p.segmentation,
			normalizers: Array.isArray(p.normalizers) && p.normalizers.length > 0,
			diacritics: p.diacritics,
			caseSensitive: typeof p.caseSensitive,
			voices: Array.isArray(p.tts.voices),
			asrModel: p.asr.model.length > 0,
			equivalences: Array.isArray(p.equivalences)
		}).toEqual({
			tag: 'string',
			direction: p.direction === 'rtl' ? 'rtl' : 'ltr',
			segmentation: p.segmentation === 'icu-grapheme' ? 'icu-grapheme' : 'icu-word',
			normalizers: true,
			diacritics: p.diacritics === 'significant' ? 'significant' : 'tolerant',
			caseSensitive: 'boolean',
			voices: true,
			asrModel: true,
			equivalences: true
		});
	});
});

/**
 * O sujeito omitível é comparado com as PRIMEIRAS PALAVRAS do texto já
 * normalizado (`kernel/grading/sujeito.ts`): pronome ou conjunção com
 * maiúscula, com acento perdido ou com duas palavras nunca casaria.
 */
describe('sujeito omitível', () => {
	const comSujeito = entradas.filter(([, p]) => p.sujeitoOmitivel !== undefined);

	it('existe nas línguas que omitem o sujeito, e só nelas', () => {
		expect(comSujeito.map(([tag]) => tag).sort()).toEqual(['es-ES', 'it-IT', 'pt-BR']);
	});

	it.each(comSujeito)('%s: pronomes e conjunções são uma palavra, já normalizada', (_tag, p) => {
		const regra = p.sujeitoOmitivel;
		for (const forma of [...(regra?.pronomes ?? []), ...(regra?.conjuncoes ?? [])]) {
			expect(normalize(forma, p).trim()).toBe(forma);
			expect(tokenize(forma, p)).toEqual([forma]);
		}
	});
});
