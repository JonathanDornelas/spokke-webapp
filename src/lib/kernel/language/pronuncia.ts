/**
 * A PRONÚNCIA de uma palavra, para a questão de Pronúncia: as sílabas como o
 * aluno as lê ("prai · aw · ruh · tee", a tônica marcada), o formato da boca a
 * cada som (os visemas) e a comparação RÍGIDA entre o que se esperava e o que
 * se ouviu, sílaba por sílaba.
 *
 * Puro e agnóstico: os fonemas vêm do dicionário do SERVIDOR (o kernel não
 * carrega dicionário), e tudo que é do idioma — quais fonemas são vogais, que
 * ataques de sílaba existem, como cada fonema se escreve, que boca ele faz —
 * vem de `LanguageProfile.pronuncia`. Aqui só há o algoritmo.
 *
 * O acento vem colado na vogal, como no dicionário (`AO1` é a vogal tônica,
 * `AY0` a átona): é ele que diz qual sílaba vai em destaque.
 *
 * Há duas comparações. `compararSons` é a de verdade: os sons que o
 * RECONHECEDOR DE FONEMAS ouviu, no rigor da questão. `compararPronuncia` é a
 * reserva, para quando ele está fora do ar: o dicionário aplicado ao que o
 * Whisper transcreveu, que só pega palavra trocada (o Whisper devolve a palavra
 * certa de uma pronúncia torta).
 */

import {
	distanciaEntreFones,
	ehVogalCurta,
	ehVogalOuDitongo,
	ehVogalReduzida,
	segmentar,
	semCorDeR,
	tracosDe
} from './fones';

/** O formato da boca, de frente. Um desenho por visema (`components/pronuncia`). */
export type Visema =
	| 'repouso'
	| 'mbp'
	| 'fv'
	| 'th'
	| 'tdn'
	| 'l'
	| 'sz'
	| 'sh'
	| 'r'
	| 'u'
	| 'o'
	| 'a'
	| 'e'
	| 'i'
	| 'kg';

export interface RegrasDePronuncia {
	/** O alfabeto dos fonemas que o servidor manda (o do dicionário). */
	alfabeto: 'arpabet';
	/** Os fonemas que são vogal: cada um é o núcleo de uma sílaba. */
	vogais: string[];
	/**
	 * Os ataques de sílaba que o idioma permite, de mais de uma consoante
	 * (`['P', 'R']`, `['S', 'T', 'R']`). Consoante sozinha é sempre ataque, menos
	 * as de `semAtaque`.
	 */
	ataques: string[][];
	/** Consoantes que nunca começam sílaba (o `NG` do inglês). */
	semAtaque: string[];
	/** Como cada fonema se escreve para o aluno ler: `AO` → "aw". */
	leitura: Record<string, string>;
	/** A boca de cada fonema; ditongo é uma lista de duas. */
	visemas: Record<string, Visema | Visema[]>;
	/**
	 * Como o RECONHECEDOR DE FONEMAS escreve cada fonema do dicionário (o IPA do
	 * espeak, `fones.ts`). Com o acento quando ele muda o som: `AH0` é a vogal
	 * fraca ([ə]) e `AH`, a de "cup" ([ʌ]). Procura-se primeiro com o acento.
	 */
	sons: Record<string, string>;
	/**
	 * Sons que o idioma trata como o MESMO fonema, em qualquer rigor: o [ɾ] de
	 * "water" é o t do inglês americano, não um erro. Cada grupo vale em par
	 * (dois sons do mesmo grupo), não em cadeia.
	 */
	equivalentes: string[][];
	/** Os mesmos, só onde o fonema esperado é vogal ÁTONA (a vogal reduzida). */
	equivalentesNaAtona: string[][];
	/** Sons que não contam quando SOBRAM (a oclusiva glotal antes de vogal). */
	semPeso: string[];
	/**
	 * Como escrever, para o aluno ler, os sons que o idioma não tem e o aluno
	 * produz: o "r" de "rato" (`x`, `ʁ`) é "h". Sem isto, a leitura do que se
	 * ouviu cai no fonema mais próximo, ou fica de fora.
	 */
	leituraDeOutrosSons: Record<string, string>;
}

export interface SilabaDaPronuncia {
	/** A sílaba como o aluno a lê: "ruh". */
	leitura: string;
	tonica: boolean;
	/** Os fonemas dela, com o acento. */
	fonemas: string[];
}

/**
 * O quanto a correção da Pronúncia exige (pedido do dono do repositório). O
 * nível da atividade escolhe o padrão (`rigorDaPronuncia`), e o professor troca
 * no editor de questão. `TOLERANCIA` diz o que cada um aceita.
 */
export type RigorDaPronuncia = 'leve' | 'normal' | 'rigoroso';
export const RIGORES: readonly RigorDaPronuncia[] = ['leve', 'normal', 'rigoroso'];

export interface Pronuncia {
	fonemas: string[];
	silabas: SilabaDaPronuncia[];
	/** Sem rigor (questão de antes dos níveis), vale o `normal`. */
	rigor?: RigorDaPronuncia;
}

/** O fonema sem o acento: `AO1` → `AO`. */
export function baseDoFonema(fonema: string): string {
	return fonema.replace(/\d+$/, '');
}

function ehVogal(fonema: string, regras: RegrasDePronuncia): boolean {
	return regras.vogais.includes(baseDoFonema(fonema));
}

function ehAtaque(consoantes: string[], regras: RegrasDePronuncia): boolean {
	if (consoantes.length === 0) return true;
	const bases = consoantes.map(baseDoFonema);
	if (bases.length === 1) return !regras.semAtaque.includes(bases[0]!);
	return regras.ataques.some((a) => a.length === bases.length && a.every((f, i) => f === bases[i]));
}

/**
 * As sílabas, pelo ATAQUE MÁXIMO: das consoantes entre duas vogais, a próxima
 * sílaba leva o maior final que o idioma aceita como começo de sílaba; o resto
 * fecha a anterior. "priority" (`P R AY0 AO1 R AH0 T IY0`) dá
 * `P R AY0 · AO1 · R AH0 · T IY0`: "prai · aw · ruh · tee".
 */
export function silabar(fonemas: string[], regras: RegrasDePronuncia): SilabaDaPronuncia[] {
	const nucleos = fonemas.flatMap((f, i) => (ehVogal(f, regras) ? [i] : []));
	if (nucleos.length === 0) {
		return fonemas.length ? [silaba(fonemas, regras)] : [];
	}
	// Onde cada sílaba começa: a primeira no começo da palavra; as outras no
	// começo do maior ataque válido antes da vogal delas.
	const inicios = [0];
	for (let n = 1; n < nucleos.length; n++) {
		const anterior = nucleos[n - 1]!;
		const atual = nucleos[n]!;
		let inicio = atual;
		for (let i = anterior + 1; i < atual; i++) {
			if (ehAtaque(fonemas.slice(i, atual), regras)) {
				inicio = i;
				break;
			}
		}
		inicios.push(inicio);
	}
	return inicios.map((inicio, n) =>
		silaba(fonemas.slice(inicio, inicios[n + 1] ?? fonemas.length), regras)
	);
}

function silaba(fonemas: string[], regras: RegrasDePronuncia): SilabaDaPronuncia {
	return {
		leitura: fonemas
			.map((f) => regras.leitura[baseDoFonema(f)] ?? baseDoFonema(f).toLowerCase())
			.join(''),
		tonica: fonemas.some((f) => f.endsWith('1')),
		fonemas
	};
}

export function pronunciaDe(fonemas: string[], regras: RegrasDePronuncia): Pronuncia {
	return { fonemas, silabas: silabar(fonemas, regras) };
}

/** A pronúncia escrita, como na tela: "prai · AW · ruh · tee" (a tônica em caixa alta). */
export function leituraDaPronuncia(p: Pronuncia): string {
	return p.silabas.map((s) => (s.tonica ? s.leitura.toUpperCase() : s.leitura)).join(' · ');
}

export interface PassoDaBoca {
	visema: Visema;
	/** O peso do passo na duração da palavra: vogal dura mais que consoante. */
	peso: number;
	/** Em qual sílaba o passo cai — para a tela acender a sílaba junto da boca. */
	silaba: number;
	/**
	 * De qual fonema (a posição em `Pronuncia.fonemas`) o passo é. Com a linha do
	 * tempo do áudio (`LinhaDaPalavra`), a boca anda no tempo REAL de cada som;
	 * sem ela, pelo peso.
	 */
	fonema: number;
}

/**
 * A boca, passo a passo: um visema por fonema (dois no ditongo), com o peso de
 * cada um na duração. Quem transforma peso em tempo é a tela, pela duração do
 * áudio que está tocando; quando o serviço de áudio devolver a duração de cada
 * fonema, ela entra aqui no lugar do peso.
 */
export function passosDaBoca(p: Pronuncia, regras: RegrasDePronuncia): PassoDaBoca[] {
	const passos: PassoDaBoca[] = [];
	let indice = 0;
	p.silabas.forEach((s, silaba) => {
		for (const fonema of s.fonemas) {
			const base = baseDoFonema(fonema);
			const visema = regras.visemas[base] ?? 'e';
			const vogal = regras.vogais.includes(base);
			const lista = Array.isArray(visema) ? visema : [visema];
			const peso = (vogal ? 2.4 : 1) / lista.length;
			for (const v of lista) passos.push({ visema: v, peso, silaba, fonema: indice });
			indice += 1;
		}
	});
	return passos;
}

export interface ComparacaoDaPronuncia {
	/** Uma por sílaba ESPERADA: se todos os sons dela saíram. */
	silabas: { leitura: string; tonica: boolean; ok: boolean }[];
	fora: number;
}

/**
 * O que se ouviu contra o que se esperava, SOM A SOM, e o resultado por sílaba.
 *
 * O acento não entra na conta (é o mesmo som). O alinhamento é o de edição
 * (Levenshtein com o caminho de volta): cada fonema esperado ou casa com um
 * ouvido, ou foi trocado, ou faltou — e a sílaba que tem qualquer um dos dois
 * últimos saiu fora. Som a mais entre duas sílabas marca a seguinte.
 */
export function compararPronuncia(esperada: Pronuncia, ouvidos: string[]): ComparacaoDaPronuncia {
	const alvo = esperada.fonemas.map(baseDoFonema);
	const ouvido = ouvidos.map(baseDoFonema);
	const n = alvo.length;
	const m = ouvido.length;
	const custo: number[][] = Array.from({ length: n + 1 }, (_, i) =>
		Array.from({ length: m + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
	);
	for (let i = 1; i <= n; i++) {
		for (let j = 1; j <= m; j++) {
			const troca = alvo[i - 1] === ouvido[j - 1] ? 0 : 1;
			custo[i]![j] = Math.min(
				custo[i - 1]![j]! + 1,
				custo[i]![j - 1]! + 1,
				custo[i - 1]![j - 1]! + troca
			);
		}
	}
	// O caminho de volta: quais fonemas esperados saíram certos, e onde houve som a mais.
	const certo = new Array<boolean>(n).fill(false);
	const sobraAntes = new Array<boolean>(n + 1).fill(false);
	let i = n;
	let j = m;
	while (i > 0 || j > 0) {
		if (
			i > 0 &&
			j > 0 &&
			custo[i]![j] === custo[i - 1]![j - 1]! + (alvo[i - 1] === ouvido[j - 1] ? 0 : 1)
		) {
			certo[i - 1] = alvo[i - 1] === ouvido[j - 1];
			i -= 1;
			j -= 1;
		} else if (i > 0 && custo[i]![j] === custo[i - 1]![j]! + 1) {
			i -= 1; // faltou: `certo` continua falso
		} else {
			sobraAntes[i] = true; // som a mais, antes do esperado de índice i
			j -= 1;
		}
	}

	let indice = 0;
	const silabas = esperada.silabas.map((s) => {
		const fim = indice + s.fonemas.length;
		let ok = true;
		for (let k = indice; k < fim; k++) {
			if (!certo[k]) ok = false;
			// Som a mais dentro da sílaba, ou logo antes dela.
			if (sobraAntes[k]) ok = false;
		}
		if (fim === n && sobraAntes[n]) ok = false;
		indice = fim;
		return { leitura: s.leitura, tonica: s.tonica, ok };
	});
	return { silabas, fora: silabas.filter((s) => !s.ok).length };
}

// ------------------------------------------------------------ os sons ouvidos

/**
 * Um som que o RECONHECEDOR DE FONEMAS ouviu (`/v1/asr/phonemes` do serviço de
 * áudio): o símbolo IPA, a certeza dele e os outros que ele considerou nos
 * mesmos quadros. Chaves curtas porque ficam guardados na resposta do aluno.
 */
export interface SomOuvido {
	s: string;
	p: number;
	alt?: { s: string; p: number }[];
}

interface Tolerancia {
	/** A maior distância (`fones.ts`) que ainda conta como o som certo. */
	consoante: number;
	tonica: number;
	atona: number;
	/** Uma vogal curta a mais depois de consoante ("dog-i") não conta. */
	sobraCurtaPassa: boolean;
	/** Som a mais só conta com pelo menos esta certeza. */
	limiarDeSobra: number;
	/**
	 * Quando o reconhecedor hesita entre dois sons, o esperado vale se for uma
	 * das alternativas com pelo menos `piso` de certeza e pelo menos `razao` da
	 * certeza do primeiro. É o que impede reprovar o aluno pela dúvida do modelo.
	 */
	duvida: { razao: number; piso: number };
}

/**
 * O que cada rigor aceita. Os números saíram da bancada com áudio sintetizado,
 * certo e com os erros típicos de brasileiro (docs/plano-dialogo-e-pronuncia.md).
 * Gravações de alunos de verdade podem pedir outro ajuste, e é aqui que ele mora.
 *
 * - **leve**: som vizinho passa (o "i" de "sheep" no lugar do de "ship", o "th"
 *   dito "f"), a vogal átona só precisa ser parecida e a vogal curta a mais no
 *   fim ("dogi") não conta. Erra quem troca o som por outro bem diferente
 *   ("tink", o "r" de "rato"), quem engole um som e quem acrescenta um.
 * - **normal**: cada som tônico e cada consoante precisam sair certos. Passam a
 *   variação que o próprio idioma aceita (`equivalentes`), a diferença de
 *   vozeamento (o reconhecedor confunde [θ] e [ð] até em voz nativa) e a vogal
 *   átona parecida.
 * - **rigoroso**: como o normal, sem o vozeamento e sem a átona parecida (ela
 *   precisa sair reduzida), e a dúvida do reconhecedor só ajuda quando é quase
 *   empate.
 */
export const TOLERANCIA: Record<RigorDaPronuncia, Tolerancia> = {
	leve: {
		consoante: 0.35,
		tonica: 0.35,
		atona: 0.6,
		sobraCurtaPassa: true,
		limiarDeSobra: 0.7,
		duvida: { razao: 0.3, piso: 0.1 }
	},
	normal: {
		consoante: 0.12,
		tonica: 0.12,
		atona: 0.35,
		sobraCurtaPassa: false,
		limiarDeSobra: 0.5,
		duvida: { razao: 0.5, piso: 0.15 }
	},
	rigoroso: {
		consoante: 0.06,
		tonica: 0.06,
		atona: 0.06,
		sobraCurtaPassa: false,
		limiarDeSobra: 0.35,
		duvida: { razao: 0.8, piso: 0.25 }
	}
};

/** A vogal reduzida a mais, com pouca certeza, é o estalo da consoante final, não um som. */
const CERTEZA_DA_REDUZIDA_A_MAIS = 0.6;
/** Abaixo disto o reconhecedor não tem certeza de que houve som: não aparece nem conta. */
const CERTEZA_MINIMA_DE_SOM = 0.35;

interface Esperado {
	som: string;
	fonema: string;
	silaba: number;
	vogal: boolean;
	atona: boolean;
	/** O último som da sílaba: um som a mais logo depois é dela ("dog-i"). */
	fimDaSilaba: boolean;
}

interface Ouvido {
	/** Os segmentos do símbolo mais provável, e a certeza dele. */
	segmentos: string[];
	p: number;
	/** As leituras possíveis deste som: a mais provável e as alternativas que valem. */
	candidatos: string[][];
}

function somDoFonema(fonema: string, regras: RegrasDePronuncia): string {
	return regras.sons[fonema] ?? regras.sons[baseDoFonema(fonema)] ?? baseDoFonema(fonema);
}

/**
 * Os sons de CADA FONEMA, em IPA segmentado (como o reconhecedor de fonemas e o
 * TTS os escrevem), na ordem das sílabas: é o que se alinha com a linha do tempo
 * do áudio (`temposDosFonemas`) para saber onde cada um está. "priority" dá
 * `[["p"],["ɹ"],["aɪ"],["ɔː"],["ɹ"],["ə"],["t"],["i"]]`.
 */
export function sonsDosFonemas(p: Pronuncia, regras: RegrasDePronuncia): string[][] {
	return p.silabas.flatMap((s) => s.fonemas.map((f) => segmentar(somDoFonema(f, regras))));
}

function esperadosDe(p: Pronuncia, regras: RegrasDePronuncia): Esperado[] {
	return p.silabas.flatMap((s, silaba) =>
		s.fonemas.map((fonema, i) => {
			const vogal = ehVogal(fonema, regras);
			return {
				som: somDoFonema(fonema, regras),
				fonema,
				silaba,
				vogal,
				atona: vogal && fonema.endsWith('0'),
				fimDaSilaba: i === s.fonemas.length - 1
			};
		})
	);
}

function ouvidosDe(sons: SomOuvido[], t: Tolerancia): Ouvido[] {
	return sons.flatMap((som) => {
		const segmentos = segmentar(som.s);
		const alternativas = (som.alt ?? [])
			.filter((a) => a.p >= t.duvida.piso && a.p >= t.duvida.razao * som.p)
			.map((a) => segmentar(a.s))
			.filter((segs) => segs.length > 0);
		const candidatos = segmentos.length > 0 ? [segmentos, ...alternativas] : alternativas;
		// Símbolo sem som conhecido e sem alternativa: ruído do vocabulário, fica de fora.
		if (candidatos.length === 0) return [];
		return [{ segmentos: candidatos[0]!, p: som.p, candidatos }];
	});
}

function custo(e: Esperado, ouvido: string, regras: RegrasDePronuncia): number {
	if (e.som === ouvido) return 0;
	const mesmo = (g: string[]) => g.includes(e.som) && g.includes(ouvido);
	if (regras.equivalentes.some(mesmo)) return 0;
	if (e.atona && regras.equivalentesNaAtona.some(mesmo)) return 0;
	return distanciaEntreFones(e.som, ouvido);
}

function tolerado(e: Esperado, distancia: number, t: Tolerancia): boolean {
	const limite = !e.vogal ? t.consoante : e.atona ? t.atona : t.tonica;
	return distancia <= limite + 1e-9;
}

function ehRotica(som: string): boolean {
	const f = tracosDe(som);
	return f !== null && f.tipo === 'vogal' && f.rotica;
}

function ehR(segmentos: string[]): boolean {
	return segmentos.length === 1 && ['ɹ', 'ɻ', 'r'].includes(segmentos[0]!);
}

/** Semivogal de passagem entre duas vogais ("prai-y-or…"): o deslize do [aɪ] para o [ɔ]. */
function ehDePassagem(ouvidos: Ouvido[], j: number): boolean {
	const segmentos = ouvidos[j]!.segmentos;
	if (segmentos.length !== 1 || !['j', 'w'].includes(segmentos[0]!)) return false;
	const antes = ouvidos[j - 1]?.segmentos.at(-1);
	const depois = ouvidos[j + 1]?.segmentos[0];
	if (!antes || !depois || !ehVogalOuDitongo(depois)) return false;
	const fim = tracosDe(antes);
	const vogalFinal = fim?.tipo === 'ditongo' ? fim.para : fim?.tipo === 'vogal' ? fim : null;
	if (!vogalFinal) return false;
	return segmentos[0] === 'j'
		? vogalFinal.recuo === 0 && vogalFinal.altura <= 2
		: vogalFinal.recuo === 2 && vogalFinal.arredondada;
}

/**
 * O que um som A MAIS é, neste rigor:
 * - `nada`: não é som da pessoa (a semivogal de passagem, a oclusiva glotal, o
 *   estalo fraco da consoante final, o que o reconhecedor quase não ouviu);
 * - `tolerada`: é som, e o rigor deixa passar (a vogal curta de "dog-i" no leve);
 * - `conta`: é erro, e marca a sílaba.
 * A tolerada e a que conta aparecem no "Ouvimos": o aluno vê o que disse.
 */
type Sobra = 'nada' | 'tolerada' | 'conta';

function tipoDaSobra(
	ouvidos: Ouvido[],
	j: number,
	regras: RegrasDePronuncia,
	t: Tolerancia
): Sobra {
	const o = ouvidos[j]!;
	if (o.segmentos.every((s) => regras.semPeso.includes(s))) return 'nada';
	if (ehDePassagem(ouvidos, j)) return 'nada';
	if (o.segmentos.every(ehVogalReduzida) && o.p < CERTEZA_DA_REDUZIDA_A_MAIS) return 'nada';
	if (o.p < CERTEZA_MINIMA_DE_SOM) return 'nada';
	if (o.p < t.limiarDeSobra) return 'tolerada';
	if (t.sobraCurtaPassa && o.segmentos.every(ehVogalCurta)) return 'tolerada';
	return 'conta';
}

type Passo =
	| { tipo: 'troca'; k: number; segmentos: string[] }
	| { tipo: 'rotica'; vogal: string }
	| { tipo: 'silabica'; segmento: string }
	| { tipo: 'falta' }
	| { tipo: 'sobra'; sobra: Sobra };

const CUSTO_DA_FALTA = 1;
const CUSTO_DA_SOBRA = 0.6;
const CUSTO_DA_SOBRA_SEM_PESO = 0.05;
/**
 * A sílaba final de vogal reduzida e soante ("-ble" de "comfortable", "-ton" de
 * "button") ouvida num som só: a soante sozinha, silábica, ou só a vogal, com o
 * [l] escuro virando quase [ʊ]. É assim que a voz nativa da bancada saiu, e a
 * distância de cada som fica perto de zero, não zero: passa no leve e no normal,
 * e o rigoroso pede a sílaba inteira.
 */
const DISTANCIA_DA_SILABICA = 0.1;

interface Casamento {
	/**
	 * Por som esperado: o segmento ouvido no lugar dele (nulo = faltou) e a
	 * distância. `fundido` marca o segundo som de uma sílaba ouvida num som só.
	 */
	porEsperado: { ouvido: string | null; distancia: number; fundido?: boolean }[];
	/** Os sons a mais, cada um ANTES do esperado de índice `antes` (o total = no fim). */
	sobras: { antes: number; segmentos: string[]; sobra: Sobra }[];
}

function custoDaRotica(e: Esperado, vogal: string, regras: RegrasDePronuncia): number {
	return Math.min(custo(e, vogal, regras), distanciaEntreFones(semCorDeR(e.som), vogal));
}

function ehSoante(som: string): boolean {
	const f = tracosDe(som);
	return f !== null && f.tipo === 'consoante' && (f.modo === 'lateral' || f.modo === 'nasal');
}

/** Se `esperados[i]` e o seguinte são a sílaba final de vogal reduzida e soante. */
function ehSilabicaFinal(esperados: Esperado[], i: number): boolean {
	const vogal = esperados[i];
	const soante = esperados[i + 1];
	return (
		vogal !== undefined &&
		soante !== undefined &&
		i + 2 === esperados.length &&
		vogal.silaba === soante.silaba &&
		vogal.atona &&
		ehVogalReduzida(vogal.som) &&
		ehSoante(soante.som)
	);
}

/** Um som que vale pela sílaba silábica inteira: a soante, a reduzida ou a posterior arredondada. */
function valePelaSilabica(soante: string, ouvido: string): boolean {
	if (distanciaEntreFones(soante, ouvido) <= DISTANCIA_DA_SILABICA) return true;
	const f = tracosDe(ouvido);
	if (!f || f.tipo !== 'vogal' || f.longa) return false;
	return ehVogalReduzida(ouvido) || (f.recuo === 2 && f.arredondada && f.altura <= 2);
}

/**
 * O alinhamento de menor custo entre o esperado e o ouvido. É o de edição, com
 * três movimentos a mais que a fala pede:
 *
 * - um símbolo ouvido vale VÁRIOS sons esperados quando os escreve juntos ("ɔːɹ"
 *   é o [ɔː] e o [ɹ] de "priority");
 * - uma vogal rótica esperada ([ɝ], de "bird") vale a vogal e o r ouvidos
 *   separados;
 * - cada alternativa que a dúvida do reconhecedor permite é uma leitura possível
 *   do mesmo som, e vale a mais próxima do esperado.
 */
function casar(
	esperados: Esperado[],
	ouvidos: Ouvido[],
	regras: RegrasDePronuncia,
	t: Tolerancia
): Casamento {
	const n = esperados.length;
	const m = ouvidos.length;
	const tipos = ouvidos.map((_, j) => tipoDaSobra(ouvidos, j, regras, t));
	const total: number[][] = Array.from({ length: n + 1 }, () =>
		new Array<number>(m + 1).fill(Infinity)
	);
	const volta: (Passo | null)[][] = Array.from({ length: n + 1 }, () =>
		new Array<Passo | null>(m + 1).fill(null)
	);
	total[0]![0] = 0;
	const tentar = (i: number, j: number, valor: number, passo: Passo) => {
		if (valor < total[i]![j]! - 1e-9) {
			total[i]![j] = valor;
			volta[i]![j] = passo;
		}
	};
	for (let i = 0; i <= n; i++) {
		for (let j = 0; j <= m; j++) {
			const aqui = total[i]![j]!;
			if (aqui === Infinity) continue;
			if (i < n) tentar(i + 1, j, aqui + CUSTO_DA_FALTA, { tipo: 'falta' });
			if (j >= m) continue;
			tentar(i, j + 1, aqui + (tipos[j] === 'conta' ? CUSTO_DA_SOBRA : CUSTO_DA_SOBRA_SEM_PESO), {
				tipo: 'sobra',
				sobra: tipos[j]!
			});
			for (const segmentos of ouvidos[j]!.candidatos) {
				const k = segmentos.length;
				if (i + k > n) continue;
				let soma = 0;
				for (let x = 0; x < k; x++) soma += custo(esperados[i + x]!, segmentos[x]!, regras);
				tentar(i + k, j + 1, aqui + soma, { tipo: 'troca', k, segmentos });
			}
			if (i < n && j + 1 < m && ehRotica(esperados[i]!.som) && ehR(ouvidos[j + 1]!.segmentos)) {
				for (const segmentos of ouvidos[j]!.candidatos) {
					if (segmentos.length !== 1 || !ehVogalOuDitongo(segmentos[0]!)) continue;
					const valor = custoDaRotica(esperados[i]!, segmentos[0]!, regras);
					tentar(i + 1, j + 2, aqui + valor, { tipo: 'rotica', vogal: segmentos[0]! });
				}
			}
			if (ehSilabicaFinal(esperados, i)) {
				for (const segmentos of ouvidos[j]!.candidatos) {
					if (segmentos.length !== 1) continue;
					if (!valePelaSilabica(esperados[i + 1]!.som, segmentos[0]!)) continue;
					tentar(i + 2, j + 1, aqui + 2 * DISTANCIA_DA_SILABICA, {
						tipo: 'silabica',
						segmento: segmentos[0]!
					});
				}
			}
		}
	}

	const porEsperado: Casamento['porEsperado'] = esperados.map(() => ({
		ouvido: null,
		distancia: CUSTO_DA_FALTA
	}));
	const sobras: Casamento['sobras'] = [];
	let i = n;
	let j = m;
	while (i > 0 || j > 0) {
		const passo = volta[i]![j]!;
		if (passo.tipo === 'falta') {
			i -= 1;
		} else if (passo.tipo === 'sobra') {
			j -= 1;
			sobras.unshift({ antes: i, segmentos: ouvidos[j]!.segmentos, sobra: passo.sobra });
		} else if (passo.tipo === 'rotica') {
			i -= 1;
			j -= 2;
			porEsperado[i] = {
				ouvido: passo.vogal,
				distancia: custoDaRotica(esperados[i]!, passo.vogal, regras)
			};
		} else if (passo.tipo === 'silabica') {
			i -= 2;
			j -= 1;
			porEsperado[i] = { ouvido: passo.segmento, distancia: DISTANCIA_DA_SILABICA };
			porEsperado[i + 1] = {
				ouvido: passo.segmento,
				distancia: DISTANCIA_DA_SILABICA,
				fundido: true
			};
		} else {
			i -= passo.k;
			j -= 1;
			for (let x = 0; x < passo.k; x++) {
				porEsperado[i + x] = {
					ouvido: passo.segmentos[x]!,
					distancia: custo(esperados[i + x]!, passo.segmentos[x]!, regras)
				};
			}
		}
	}
	return { porEsperado, sobras };
}

/** A sílaba a que um som a mais pertence: a anterior, quando ele vem logo depois do fim dela. */
function silabaDaSobra(antes: number, esperados: Esperado[]): number {
	if (esperados.length === 0 || antes === 0) return 0;
	const anterior = esperados[antes - 1]!;
	if (antes === esperados.length || anterior.fimDaSilaba) return anterior.silaba;
	return esperados[antes]!.silaba;
}

/** Como escrever, para o aluno ler, um som que se ouviu. Vazio quando não há como. */
export function leituraDoSom(som: string, regras: RegrasDePronuncia): string {
	const direto = Object.entries(regras.sons).find(([, ipa]) => ipa === som);
	if (direto) return regras.leitura[baseDoFonema(direto[0])] ?? '';
	const outro = regras.leituraDeOutrosSons[som];
	if (outro !== undefined) return outro;
	let melhor: { leitura: string; distancia: number } | null = null;
	for (const [fonema, ipa] of Object.entries(regras.sons)) {
		const distancia = distanciaEntreFones(som, ipa);
		if (distancia <= 0.35 && (!melhor || distancia < melhor.distancia)) {
			melhor = { leitura: regras.leitura[baseDoFonema(fonema)] ?? '', distancia };
		}
	}
	return melhor?.leitura ?? '';
}

export interface ComparacaoPorSom extends ComparacaoDaPronuncia {
	/** O que se ouviu, na mesma escrita da pronúncia ("prai · aw · ree · tee"). */
	ouvido: string;
	/** Por sílaba esperada, como ela saiu ("ree"); vazio quando não saiu nada. */
	ouvidoPorSilaba: string[];
}

/**
 * Os sons OUVIDOS pelo reconhecedor de fonemas contra os esperados, no rigor
 * pedido, e o resultado por sílaba. A sílaba sai certa quando cada som dela está
 * dentro da tolerância (`TOLERANCIA`) e nenhum som a mais que conte caiu nela.
 *
 * O que se ouviu volta escrito como a pronúncia: o som certo na grafia do
 * esperado (a mesma da tela), o diferente na grafia dele, e o som a mais onde
 * apareceu. É o "Ouvimos:" do veredito.
 */
export function compararSons(
	esperada: Pronuncia,
	sons: SomOuvido[],
	regras: RegrasDePronuncia,
	rigor: RigorDaPronuncia = 'normal'
): ComparacaoPorSom {
	const t = TOLERANCIA[rigor];
	const esperados = esperadosDe(esperada, regras);
	const { porEsperado, sobras } = casar(esperados, ouvidosDe(sons, t), regras, t);

	const ok = esperada.silabas.map(() => true);
	const pedacos: string[][] = esperada.silabas.map(() => []);
	const escreverSobras = (antes: number) => {
		for (const sobra of sobras) {
			if (sobra.antes !== antes || sobra.sobra === 'nada') continue;
			const silaba = silabaDaSobra(antes, esperados);
			if (sobra.sobra === 'conta') ok[silaba] = false;
			const leitura = sobra.segmentos.map((s) => leituraDoSom(s, regras)).join('');
			if (leitura) pedacos[silaba]!.push(leitura);
		}
	};
	esperados.forEach((e, i) => {
		escreverSobras(i);
		const { ouvido, distancia, fundido } = porEsperado[i]!;
		const certo = ouvido !== null && tolerado(e, distancia, t);
		if (!certo) ok[e.silaba] = false;
		if (ouvido === null) return;
		if (certo) pedacos[e.silaba]!.push(regras.leitura[baseDoFonema(e.fonema)] ?? '');
		// O som ouvido de uma sílaba fundida já foi escrito pelo primeiro som dela.
		else if (!fundido) pedacos[e.silaba]!.push(leituraDoSom(ouvido, regras));
	});
	escreverSobras(esperados.length);

	const silabas = esperada.silabas.map((s, i) => ({
		leitura: s.leitura,
		tonica: s.tonica,
		ok: ok[i]!
	}));
	const ouvidoPorSilaba = pedacos.map((p) => p.join(''));
	return {
		silabas,
		fora: silabas.filter((s) => !s.ok).length,
		ouvido: ouvidoPorSilaba.filter(Boolean).join(' · '),
		ouvidoPorSilaba
	};
}
