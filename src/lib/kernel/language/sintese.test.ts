import { describe, expect, it } from 'vitest';
import {
	ERRO_MAXIMO_DA_SINTESE,
	segmentosDoIpa,
	temposDosFonemas,
	verificarSintese,
	type SomNoTempo
} from './sintese';
import { pronunciaDe, sonsDosFonemas } from './pronuncia';
import { enUS } from './profiles/en-US';

/**
 * Os casos são MEDIDOS: o que o Kokoro pretendia dizer (em IPA, como o serviço
 * de áudio devolve) e o que o reconhecedor de fonemas ouviu no arquivo, com o
 * tempo de cada som — tirados da calibração com as nove vozes do inglês.
 */
const sons = (lista: [string, number, number][]): SomNoTempo[] =>
	lista.map(([s, inicio, fim]) => ({ s, inicio, fim }));

const DEVAGAR = { consoantesAntes: 0 };

describe('segmentosDoIpa', () => {
	it('corta nos espaços, na pontuação e no acento antes de juntar ditongos', () => {
		expect(segmentosDoIpa('ˌaɪ dˈoʊnt nˈoʊ.')).toEqual(['aɪ', 'd', 'oʊ', 'n', 't', 'n', 'oʊ']);
		// "pɹaɪˈɔɹ": sem o corte no acento, o "aɪ" e o "ɔ" viravam uma vogal só.
		expect(segmentosDoIpa('pɹaɪˈɔɹəɾi')).toEqual(['p', 'ɹ', 'aɪ', 'ɔ', 'ɹ', 'ə', 'ɾ', 'i']);
	});
});

describe('verificarSintese: a voz disse o que pretendia?', () => {
	it('aprova a síntese normal, mesmo com o reconhecedor trocando vizinhos', () => {
		// "I don't know." (af_heart): o "oʊ" final ouvido como "eɪ" e o "n" fora do lugar.
		const ouvido = sons([
			['aɪ', 0.06, 0.08],
			['d', 0.14, 0.16],
			['oʊ', 0.18, 0.2],
			['t', 0.26, 0.28],
			['n', 0.3, 0.34],
			['eɪ', 0.36, 0.38]
		]);
		const v = verificarSintese('ˌaɪ dˈoʊnt nˈoʊ.', ouvido);
		expect(v.situacao).toBe('aprovada');
		expect(v.erro).toBeLessThanOrEqual(ERRO_MAXIMO_DA_SINTESE);
	});

	it('aprova o tepe do americano ("water" com o "tt" batido)', () => {
		const ouvido = sons([
			['w', 0.08, 0.1],
			['ɑː', 0.14, 0.16],
			['t', 0.28, 0.3],
			['ɚ', 0.34, 0.36]
		]);
		expect(verificarSintese('wˈɔɾəɹ', ouvido).situacao).toBe('aprovada');
	});

	it('reprova a versão devagar do relato: o chiado antes de "I" ("So I don\'t know")', () => {
		const ouvido = sons([
			['ts', 0.09, 0.11],
			['aɪ', 0.17, 0.19],
			['d', 0.31, 0.33],
			['oʊ', 0.37, 0.39],
			['ŋ', 0.45, 0.47],
			['t', 0.53, 0.55],
			['n', 0.65, 0.67],
			['ɚ', 0.71, 0.73]
		]);
		const v = verificarSintese('ˌaɪ dˈoʊnt nˈoʊ.', ouvido, DEVAGAR);
		expect(v).toMatchObject({ situacao: 'reprovada', motivo: 'som antes da fala' });
		// Na normal, um som de respiração antes da fala passa.
		expect(verificarSintese('ˌaɪ dˈoʊnt nˈoʊ.', ouvido).situacao).toBe('aprovada');
	});

	it('reprova a sílaba falsa do começo ("A good morning")', () => {
		const ouvido = sons([
			['ɐ', 0.08, 0.1],
			['ɡ', 0.2, 0.22],
			['ʊ', 0.26, 0.28],
			['d', 0.42, 0.44],
			['m', 0.56, 0.58],
			['oː', 0.62, 0.64],
			['n', 0.82, 0.84],
			['ɪ', 0.88, 0.9],
			['ŋ', 1.02, 1.04]
		]);
		// Vogal antes da fala reprova em qualquer velocidade.
		expect(verificarSintese('ɡˈʊd mˈɔɹnɪŋ!', ouvido)).toMatchObject({
			situacao: 'reprovada',
			motivo: 'vogal antes da fala'
		});
	});

	it('reprova a síntese que disse outra coisa, e a que não disse nada', () => {
		const outra = sons([
			['k', 0, 0.02],
			['æ', 0.1, 0.12],
			['t', 0.2, 0.22]
		]);
		expect(verificarSintese('wˈɔɾəɹ', outra)).toMatchObject({
			situacao: 'reprovada',
			motivo: 'sons trocados'
		});
		expect(verificarSintese('wˈɔɾəɹ', [])).toMatchObject({ situacao: 'reprovada' });
	});

	it('sem IPA que se meça, não há como verificar — e isso não reprova', () => {
		// A escrita que a fonética não conhece fica de fora (um TTS que não escreve em IPA).
		expect(verificarSintese('わたし', sons([['a', 0, 0.1]])).situacao).toBe('sem-como-verificar');
		expect(verificarSintese('a', sons([['a', 0, 0.1]])).situacao).toBe('sem-como-verificar');
	});
});

/**
 * As linhas do tempo são as que o serviço de áudio devolveu (`X-Phoneme-Times`)
 * para estas palavras, nestas vozes: os sons que o Kokoro disse, com o começo e o
 * fim de cada um já acertados no áudio.
 */
const PRIORITY_NORMAL = sons([
	['p', 0, 0.041],
	['ɹ', 0.041, 0.116],
	['aɪ', 0.116, 0.191],
	['ɔ', 0.191, 0.291],
	['ɹ', 0.291, 0.341],
	['ə', 0.341, 0.416],
	['ɾ', 0.416, 0.491],
	['i', 0.491, 0.674]
]);
const THINK = sons([
	['θ', 0.052, 0.122],
	['ɪ', 0.122, 0.25],
	['ŋ', 0.25, 0.338],
	['k', 0.338, 0.547]
]);
const COMPUTER = sons([
	['k', 0, 0.047],
	['ə', 0.047, 0.102],
	['m', 0.102, 0.188],
	['p', 0.188, 0.272],
	['j', 0.272, 0.322],
	['u', 0.322, 0.472],
	['ɾ', 0.472, 0.547],
	['ə', 0.547, 0.622],
	['ɹ', 0.622, 0.796]
]);

describe('temposDosFonemas: onde cada fonema do dicionário está no áudio', () => {
	const fonemasDe = (arpabet: string) =>
		sonsDosFonemas(pronunciaDe(arpabet.split(' '), enUS.pronuncia!), enUS.pronuncia!);

	it('os sons de cada fonema saem em IPA, na ordem das sílabas', () => {
		expect(fonemasDe('P R AY0 AO1 R AH0 T IY0')).toEqual([
			['p'],
			['ɹ'],
			['aɪ'],
			['ɔː'],
			['ɹ'],
			['ə'],
			['t'],
			['i']
		]);
	});

	it('cada fonema fica com o tempo do som que o TTS disse por ele, mesmo escrito diferente', () => {
		// O dicionário diz "t" e "ɔː"; o Kokoro disse o tepe e "ɔ". São o mesmo fonema.
		const fones = temposDosFonemas(fonemasDe('P R AY0 AO1 R AH0 T IY0'), PRIORITY_NORMAL)!;
		expect(fones).toEqual([
			[0, 0.041],
			[0.041, 0.116],
			[0.116, 0.191],
			[0.191, 0.291],
			[0.291, 0.341],
			[0.341, 0.416],
			[0.416, 0.491],
			[0.491, 0.674]
		]);
	});

	it('cobre a palavra de ponta a ponta, sem buraco entre um fonema e outro', () => {
		for (const [arpabet, linha] of [
			['TH IH1 NG K', THINK],
			['K AH0 M P Y UW1 T ER0', COMPUTER]
		] as const) {
			const fones = temposDosFonemas(fonemasDe(arpabet), linha)!;
			expect(fones).toHaveLength(arpabet.split(' ').length);
			expect(fones[0]![0]).toBe(linha[0]!.inicio);
			expect(fones.at(-1)![1]).toBe(linha.at(-1)!.fim);
			for (let i = 1; i < fones.length; i++) expect(fones[i]![0]).toBe(fones[i - 1]![1]);
		}
	});

	it('o "ɚ" do dicionário fica com o "ə" e o "ɹ" que o TTS disse separados', () => {
		// computer: K AH0 M P Y UW1 T ER0 — o último fonema é um só no dicionário.
		const fones = temposDosFonemas(fonemasDe('K AH0 M P Y UW1 T ER0'), COMPUTER)!;
		expect(fones.at(-1)![1]).toBe(0.796);
		expect(fones.at(-1)![0]).toBeLessThanOrEqual(0.622);
	});

	it('o som que sobrou vai para o vizinho com que mais se parece, não para o meio', () => {
		// "around" no dicionário é `ER0 AW1 N D`; o Kokoro disse "ə" + "ɹ" (versão devagar).
		const AROUND = sons([
			['ə', 0.025, 0.125],
			['ɹ', 0.125, 0.225],
			['aʊ', 0.225, 0.408],
			['n', 0.408, 0.568],
			['d', 0.568, 0.738]
		]);
		const fones = temposDosFonemas(fonemasDe('ER0 AW1 N D'), AROUND)!;
		// O "ɹ" é do "ɚ": a sílaba "ownd" começa no "aʊ", sem meio "r" na frente.
		expect(fones[0]).toEqual([0.025, 0.225]);
		expect(fones[1]).toEqual([0.225, 0.408]);
	});

	it('um fonema que o TTS não disse divide o espaço com os vizinhos', () => {
		// Sem o "ŋ": o "ɪ" e o "k" ficam, e o "ŋ" ganha um pedaço entre eles.
		const semNasal = THINK.filter((s) => s.s !== 'ŋ');
		const fones = temposDosFonemas(fonemasDe('TH IH1 NG K'), semNasal)!;
		expect(fones).toHaveLength(4);
		expect(fones[2]![1]).toBeGreaterThan(fones[2]![0]);
		for (let i = 1; i < 4; i++) expect(fones[i]![0]).toBe(fones[i - 1]![1]);
	});

	it('o TTS que disse outra palavra não vira linha (a tela fica com a boca parada)', () => {
		expect(temposDosFonemas(fonemasDe('TH IH1 NG K'), COMPUTER)).toBeNull();
		expect(temposDosFonemas(fonemasDe('TH IH1 NG K'), [])).toBeNull();
	});
});
