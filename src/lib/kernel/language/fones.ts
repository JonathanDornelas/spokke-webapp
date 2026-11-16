/**
 * Os SONS da fala em IPA, e a distância entre dois deles: é o que a correção da
 * Pronúncia usa para decidir se o som que o reconhecedor ouviu é o esperado, um
 * vizinho (o "i" de "sheep" no lugar do de "ship") ou outro som.
 *
 * Não é regra de idioma: é fonética, a mesma em qualquer língua (a vogal [i] é
 * alta e anterior em inglês e em japonês). O que É do idioma — como o dicionário
 * escreve cada fonema, que sons ele trata como o mesmo — mora no
 * `LanguageProfile.pronuncia`.
 *
 * Os símbolos chegam como o reconhecedor os escreve (o vocabulário IPA do
 * espeak), às vezes vários num só ("ɔːɹ" é vogal e r, "aɪ" é um ditongo), e às
 * vezes com marcas que não mudam o som para a correção (tom, sílaba, aspiração).
 * `segmentar` resolve as duas coisas.
 */

type Modo =
	| 'oclusiva'
	| 'nasal'
	| 'vibrante'
	| 'tepe'
	| 'fricativa'
	| 'africada'
	| 'aproximante'
	| 'lateral'
	| 'lateralFricativa';

export interface Vogal {
	tipo: 'vogal';
	/** De 0 (fechada, [i]) a 6 (aberta, [a]). */
	altura: number;
	/** 0 anterior, 1 central, 2 posterior. */
	recuo: number;
	arredondada: boolean;
	longa: boolean;
	/** A vogal com a cor do r ([ɚ], a de "water" no inglês americano). */
	rotica: boolean;
	nasal: boolean;
}

export interface Ditongo {
	tipo: 'ditongo';
	de: Vogal;
	para: Vogal;
}

export interface Consoante {
	tipo: 'consoante';
	/** 0 bilabial, 1 labiodental, 2 dental, 3 alveolar, 4 pós-alveolar, 5 palatal, 6 velar, 7 uvular, 8 faríngea, 9 glotal. */
	ponto: number;
	modo: Modo;
	vozeada: boolean;
}

export type Fone = Vogal | Ditongo | Consoante;

/** [altura, recuo, arredondada]. */
const VOGAIS: Record<string, readonly [number, number, 0 | 1]> = {
	i: [0, 0, 0],
	y: [0, 0, 1],
	ɨ: [0, 1, 0],
	ʉ: [0, 1, 1],
	ɯ: [0, 2, 0],
	u: [0, 2, 1],
	ɪ: [1, 0, 0],
	ʏ: [1, 0, 1],
	ᵻ: [1, 1, 0],
	ʊ: [1, 2, 1],
	e: [2, 0, 0],
	ø: [2, 0, 1],
	ɘ: [2, 1, 0],
	ɵ: [2, 1, 1],
	ɤ: [2, 2, 0],
	o: [2, 2, 1],
	ə: [3, 1, 0],
	ɚ: [3, 1, 0],
	ɛ: [4, 0, 0],
	œ: [4, 0, 1],
	ɜ: [4, 1, 0],
	ɝ: [4, 1, 0],
	ɞ: [4, 1, 1],
	ʌ: [4, 2, 0],
	ɔ: [4, 2, 1],
	æ: [5, 0, 0],
	ɐ: [5, 1, 0],
	a: [6, 0, 0],
	ɶ: [6, 0, 1],
	ä: [6, 1, 0],
	ɑ: [6, 2, 0],
	ɒ: [6, 2, 1]
};
const ROTICAS = new Set(['ɚ', 'ɝ']);

/** [ponto, modo, vozeada]. */
const CONSOANTES: Record<string, readonly [number, Modo, 0 | 1]> = {
	p: [0, 'oclusiva', 0],
	b: [0, 'oclusiva', 1],
	t: [3, 'oclusiva', 0],
	d: [3, 'oclusiva', 1],
	ʈ: [4.5, 'oclusiva', 0],
	ɖ: [4.5, 'oclusiva', 1],
	c: [5, 'oclusiva', 0],
	ɟ: [5, 'oclusiva', 1],
	k: [6, 'oclusiva', 0],
	ɡ: [6, 'oclusiva', 1],
	q: [7, 'oclusiva', 0],
	ɢ: [7, 'oclusiva', 1],
	ʔ: [9, 'oclusiva', 0],
	m: [0, 'nasal', 1],
	ɱ: [1, 'nasal', 1],
	n: [3, 'nasal', 1],
	ɳ: [4.5, 'nasal', 1],
	ɲ: [5, 'nasal', 1],
	ŋ: [6, 'nasal', 1],
	ɴ: [7, 'nasal', 1],
	r: [3, 'vibrante', 1],
	ʀ: [7, 'vibrante', 1],
	ɾ: [3, 'tepe', 1],
	ɽ: [4.5, 'tepe', 1],
	ɸ: [0, 'fricativa', 0],
	β: [0, 'fricativa', 1],
	f: [1, 'fricativa', 0],
	v: [1, 'fricativa', 1],
	θ: [2, 'fricativa', 0],
	ð: [2, 'fricativa', 1],
	s: [3, 'fricativa', 0],
	z: [3, 'fricativa', 1],
	ʃ: [4, 'fricativa', 0],
	ʒ: [4, 'fricativa', 1],
	ʂ: [4.5, 'fricativa', 0],
	ʐ: [4.5, 'fricativa', 1],
	ɕ: [4.5, 'fricativa', 0],
	ʑ: [4.5, 'fricativa', 1],
	ç: [5, 'fricativa', 0],
	ʝ: [5, 'fricativa', 1],
	x: [6, 'fricativa', 0],
	ɣ: [6, 'fricativa', 1],
	χ: [7, 'fricativa', 0],
	ʁ: [7, 'fricativa', 1],
	ħ: [8, 'fricativa', 0],
	ʕ: [8, 'fricativa', 1],
	h: [9, 'fricativa', 0],
	ɦ: [9, 'fricativa', 1],
	ts: [3, 'africada', 0],
	dz: [3, 'africada', 1],
	tʃ: [4, 'africada', 0],
	dʒ: [4, 'africada', 1],
	tɕ: [4.5, 'africada', 0],
	dʑ: [4.5, 'africada', 1],
	tʂ: [4.5, 'africada', 0],
	dʐ: [4.5, 'africada', 1],
	pf: [1, 'africada', 0],
	ʋ: [1, 'aproximante', 1],
	ɹ: [3.5, 'aproximante', 1],
	ɻ: [4.5, 'aproximante', 1],
	j: [5, 'aproximante', 1],
	ɰ: [6, 'aproximante', 1],
	w: [6, 'aproximante', 1],
	l: [3, 'lateral', 1],
	ɫ: [3.5, 'lateral', 1],
	ɭ: [4.5, 'lateral', 1],
	ʎ: [5, 'lateral', 1],
	ʟ: [6, 'lateral', 1],
	ɬ: [3, 'lateralFricativa', 0],
	ɮ: [3, 'lateralFricativa', 1]
};

/** As africadas, que são dois caracteres e UM som. */
const AFRICADAS = Object.keys(CONSOANTES).filter((s) => s.length === 2);

/** Grafias de outros alfabetos que o vocabulário do reconhecedor traz (X-SAMPA). */
const APELIDOS: Record<string, string> = {
	tS: 'tʃ',
	dZ: 'dʒ',
	S: 'ʃ',
	Z: 'ʒ',
	N: 'ŋ',
	X: 'χ',
	g: 'ɡ'
};

const LONGA = 'ː';
const NASAL = '̃';

/**
 * O que não muda o som para a correção: os dígitos e o "ɜ" final que o espeak
 * usa como TOM no mandarim, as marcas de acento e de sílaba, a aspiração e a
 * palatalização, os diacríticos de ponto e de abertura. Ficam o comprimento (ː)
 * e a nasalidade (◌̃), que são traços.
 */
function limpar(simbolo: string): string {
	let s = simbolo.normalize('NFD');
	for (const [de, para] of Object.entries(APELIDOS)) s = s.split(de).join(para);
	s = s.replace(/[0-9]/g, '');
	if (s.length >= 2 && s.endsWith('ɜ') && !/[ˑː]$/.test(s)) s = s.slice(0, -1);
	return s.replace(MARCAS, '').replace(DIACRITICOS, '');
}

/** Acento, sílaba, aspiração, palatalização e a pontuação que o espeak põe nos símbolos. */
const MARCAS = /[ˈˌ.^["?ʰʲʷˤ‿]/g;
/**
 * Os diacríticos COMBINANTES que não mudam o som para a correção (sílaba, ponto,
 * abertura, desvozeamento, trema), um a um: numa classe de caracteres eles se
 * juntariam visualmente ao vizinho.
 */
const DIACRITICOS = /\u0329|\u032F|\u032A|\u031E|\u031D|\u030A|\u0325|\u0308|\u0324/g;

interface Peca {
	base: string;
	longa: boolean;
	nasal: boolean;
}

function pecas(simbolo: string): Peca[] {
	const s = limpar(simbolo);
	const saida: Peca[] = [];
	let i = 0;
	while (i < s.length) {
		const par = s.slice(i, i + 2);
		let base: string | undefined;
		if (AFRICADAS.includes(par)) base = par;
		else if (VOGAIS[s[i]!] || CONSOANTES[s[i]!]) base = s[i];
		if (!base) {
			i += 1; // caractere desconhecido: não é som que se compare
			continue;
		}
		i += base.length;
		let longa = false;
		let nasal = false;
		while (s[i] === LONGA || s[i] === NASAL) {
			if (s[i] === LONGA) longa = true;
			else nasal = true;
			i += 1;
		}
		saida.push({ base, longa, nasal });
	}
	return saida;
}

const escrever = (p: Peca) => `${p.base}${p.nasal ? NASAL : ''}${p.longa ? LONGA : ''}`;
const ehVogal = (p: Peca) => p.base in VOGAIS;

/**
 * Um símbolo do reconhecedor em SEGMENTOS, um por som: "ɔːɹ" → ["ɔː", "ɹ"],
 * "əl" → ["ə", "l"]. Duas vogais seguidas num mesmo símbolo são um ditongo
 * ("aɪ", "oʊ"): o reconhecedor escreve num símbolo só o que é UM núcleo de
 * sílaba. Símbolo sem som conhecido devolve lista vazia.
 */
export function segmentar(simbolo: string): string[] {
	const lista = pecas(simbolo);
	const saida: string[] = [];
	for (let i = 0; i < lista.length; i++) {
		const atual = lista[i]!;
		const proxima = lista[i + 1];
		if (ehVogal(atual) && proxima && ehVogal(proxima)) {
			saida.push(escrever(atual) + escrever(proxima));
			i += 1;
		} else {
			saida.push(escrever(atual));
		}
	}
	return saida.map((s) => s.normalize('NFC'));
}

function vogalDe(p: Peca): Vogal {
	const [altura, recuo, arredondada] = VOGAIS[p.base]!;
	return {
		tipo: 'vogal',
		altura,
		recuo,
		arredondada: arredondada === 1,
		longa: p.longa,
		rotica: ROTICAS.has(p.base),
		nasal: p.nasal
	};
}

/** Os traços de UM segmento (como `segmentar` os devolve), ou `null`. */
export function tracosDe(segmento: string): Fone | null {
	const lista = pecas(segmento);
	if (lista.length === 1) {
		const p = lista[0]!;
		if (ehVogal(p)) return vogalDe(p);
		const [ponto, modo, vozeada] = CONSOANTES[p.base]!;
		return { tipo: 'consoante', ponto, modo, vozeada: vozeada === 1 };
	}
	if (lista.length === 2 && lista.every(ehVogal)) {
		return { tipo: 'ditongo', de: vogalDe(lista[0]!), para: vogalDe(lista[1]!) };
	}
	return null;
}

export function ehVogalOuDitongo(segmento: string): boolean {
	const f = tracosDe(segmento);
	return f !== null && f.tipo !== 'consoante';
}

/** Vogal curta: a que o aluno acrescenta depois de consoante ("dog-i"). */
export function ehVogalCurta(segmento: string): boolean {
	const f = tracosDe(segmento);
	return f !== null && f.tipo === 'vogal' && !f.longa;
}

/** As vogais reduzidas: o [ə] da sílaba fraca e os vizinhos centrais dele. */
export function ehVogalReduzida(segmento: string): boolean {
	const f = tracosDe(segmento);
	return f !== null && f.tipo === 'vogal' && !f.longa && f.recuo === 1;
}

// ----------------------------------------------------------------- distância

/**
 * O quanto mudar de modo de articulação muda o som (simétrico). Trocar uma
 * oclusiva por fricativa ("think" → "tink") pesa; o tepe e a vibrante são
 * vizinhos ("r" do espanhol e o do inglês).
 */
const MODOS: Partial<Record<Modo, Partial<Record<Modo, number>>>> = {
	oclusiva: {
		nasal: 0.5,
		vibrante: 0.5,
		tepe: 0.25,
		fricativa: 0.45,
		africada: 0.3,
		aproximante: 0.6,
		lateral: 0.6
	},
	vibrante: { tepe: 0.15, fricativa: 0.5, aproximante: 0.25, lateral: 0.35 },
	tepe: { fricativa: 0.5, africada: 0.5, aproximante: 0.25, lateral: 0.3 },
	fricativa: { africada: 0.3, aproximante: 0.45, lateral: 0.55, lateralFricativa: 0.2 },
	aproximante: { lateral: 0.3 },
	lateral: { lateralFricativa: 0.3 }
};

function distanciaDeModo(a: Modo, b: Modo): number {
	if (a === b) return 0;
	return MODOS[a]?.[b] ?? MODOS[b]?.[a] ?? 0.6;
}

/** Os pesos, um por traço. Os números saíram da bancada (`docs/plano-dialogo-e-pronuncia.md`). */
export const PESOS = {
	altura: 0.15,
	recuo: 0.15,
	arredondamento: 0.15,
	comprimento: 0.05,
	rotica: 0.2,
	nasal: 0.15,
	/** Ditongo contra vogal simples: o deslize que faltou ("eɪ" dito "e"). */
	semDeslize: 0.25,
	vozeamento: 0.12,
	/** Por casa de ponto de articulação, com teto de três casas. */
	ponto: 0.2,
	/** Semivogal contra a vogal dela ([j] e [i], [w] e [u]). */
	semivogal: 0.35
};

function distanciaEntreVogais(a: Vogal, b: Vogal): number {
	return Math.min(
		1,
		PESOS.altura * Math.abs(a.altura - b.altura) +
			PESOS.recuo * Math.abs(a.recuo - b.recuo) +
			(a.arredondada === b.arredondada ? 0 : PESOS.arredondamento) +
			(a.longa === b.longa ? 0 : PESOS.comprimento) +
			(a.rotica === b.rotica ? 0 : PESOS.rotica) +
			(a.nasal === b.nasal ? 0 : PESOS.nasal)
	);
}

function semivogalDe(c: Consoante): Vogal | null {
	if (c.modo !== 'aproximante') return null;
	if (c.ponto === 5) return vogalDe({ base: 'i', longa: false, nasal: false });
	if (c.ponto === 6) return vogalDe({ base: 'u', longa: false, nasal: false });
	return null;
}

function distanciaDeFones(a: Fone, b: Fone): number {
	if (a.tipo === 'consoante' && b.tipo === 'consoante') {
		return Math.min(
			1,
			(a.vozeada === b.vozeada ? 0 : PESOS.vozeamento) +
				Math.min(3 * PESOS.ponto, PESOS.ponto * Math.abs(a.ponto - b.ponto)) +
				distanciaDeModo(a.modo, b.modo)
		);
	}
	if (a.tipo === 'consoante' || b.tipo === 'consoante') {
		const [c, v] = a.tipo === 'consoante' ? [a, b] : [b as Consoante, a];
		const semivogal = semivogalDe(c);
		if (semivogal && v.tipo === 'vogal' && distanciaEntreVogais(semivogal, v) <= 0.15) {
			return PESOS.semivogal;
		}
		return 1;
	}
	if (a.tipo === 'vogal' && b.tipo === 'vogal') return distanciaEntreVogais(a, b);
	if (a.tipo === 'ditongo' && b.tipo === 'ditongo') {
		return (distanciaEntreVogais(a.de, b.de) + distanciaEntreVogais(a.para, b.para)) / 2;
	}
	const [d, v] = a.tipo === 'ditongo' ? [a, b as Vogal] : [b as Ditongo, a as Vogal];
	return Math.min(
		1,
		Math.min(distanciaEntreVogais(v, d.de), distanciaEntreVogais(v, d.para)) + PESOS.semDeslize
	);
}

/**
 * De 0 (o mesmo som) a 1 (outro som): ponto, modo e vozeamento na consoante;
 * altura, recuo, arredondamento, comprimento, cor de r e nasalidade na vogal.
 * Segmento desconhecido está sempre a 1 de tudo.
 */
export function distanciaEntreFones(a: string, b: string): number {
	if (a === b) return 0;
	const fa = tracosDe(a);
	const fb = tracosDe(b);
	if (!fa || !fb) return 1;
	return Math.round(distanciaDeFones(fa, fb) * 1000) / 1000;
}

/** A vogal sem a cor do r, para comparar [ɚ] com "vogal + r" ouvidos separados. */
export function semCorDeR(segmento: string): string {
	return segmento.replace('ɚ', 'ə').replace('ɝ', 'ɜ');
}
