import { distanciaEntreFones, ehVogalOuDitongo, segmentar, tracosDe } from './fones';

/**
 * A VOZ SINTETIZADA ouvida de volta: o que ela pretendia dizer (os fonemas que o
 * TTS usou, em IPA) contra o que o reconhecedor de fonemas ouviu no arquivo.
 * Serve à **verificação** (`verificarSintese`), na geração do áudio: a síntese
 * às vezes nasce com um som a mais — medido nas nove vozes do inglês, a versão
 * DEVAGAR ganhava uma sílaba no começo ("So I don't know", "A good morning"), e
 * o aluno ouvia "outra frase" (o relato R-LX4WSJ). A normal não tinha o defeito.
 *
 * E aqui mora também a LINHA DO TEMPO do áudio (`LinhaDoTempo`, no fim do
 * arquivo): onde cada som está, vindo do próprio TTS e não do reconhecedor, e o
 * trecho de cada fonema da palavra da Pronúncia (`temposDosFonemas`).
 *
 * É fonética (`fones.ts`), não regra de idioma: o mesmo para qualquer língua cujo
 * TTS escreva em IPA. O que não dá para comparar (símbolo que a fonética não
 * conhece) fica de fora, e com pouco a comparar a resposta é "sem como verificar".
 */

/** Um som que o reconhecedor de fonemas ouviu, com o tempo dele no arquivo, em segundos. */
export interface SomNoTempo {
	s: string;
	inicio: number;
	fim: number;
}

interface Ouvido {
	seg: string;
	inicio: number;
	fim: number;
}

type Passo =
	| { tipo: 'par'; e: number; o: number; d: number }
	| { tipo: 'falta'; e: number }
	| { tipo: 'sobra'; o: number };

/**
 * Os segmentos de uma escrita IPA corrida ("ˌaɪ dˈoʊnt nˈoʊ."). Corta nos espaços,
 * na pontuação e nas marcas de acento ANTES de segmentar: `segmentar` junta duas
 * vogais seguidas num ditongo, e sem o corte o fim de uma palavra e o começo da
 * outra virariam um.
 */
export function segmentosDoIpa(ipa: string): string[] {
	return ipa
		.split(/[\s.,!?;:¡¿"“”«»()…ˈˌ–—-]+/u)
		.filter(Boolean)
		.flatMap(segmentar);
}

function ouvidosDe(sons: SomNoTempo[]): Ouvido[] {
	return sons.flatMap((som) =>
		segmentar(som.s).map((seg) => ({ seg, inicio: som.inicio, fim: som.fim }))
	);
}

/** Som que falta ou que sobra custa um som inteiro; a troca custa a distância fonética. */
const CUSTO_DE_FORA = 1;

/** Distância de edição com custo fonético, e o caminho dela. */
function alinhar(esperados: string[], ouvidos: string[]): Passo[] {
	const n = esperados.length;
	const m = ouvidos.length;
	const custo: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
	for (let i = 1; i <= n; i++) custo[i]![0] = i * CUSTO_DE_FORA;
	for (let j = 1; j <= m; j++) custo[0]![j] = j * CUSTO_DE_FORA;
	for (let i = 1; i <= n; i++) {
		for (let j = 1; j <= m; j++) {
			custo[i]![j] = Math.min(
				custo[i - 1]![j - 1]! + distanciaEntreFones(esperados[i - 1]!, ouvidos[j - 1]!),
				custo[i - 1]![j]! + CUSTO_DE_FORA,
				custo[i]![j - 1]! + CUSTO_DE_FORA
			);
		}
	}
	const passos: Passo[] = [];
	let i = n;
	let j = m;
	while (i > 0 || j > 0) {
		if (i > 0 && j > 0) {
			const d = distanciaEntreFones(esperados[i - 1]!, ouvidos[j - 1]!);
			if (Math.abs(custo[i]![j]! - (custo[i - 1]![j - 1]! + d)) < 1e-9) {
				passos.push({ tipo: 'par', e: i - 1, o: j - 1, d });
				i -= 1;
				j -= 1;
				continue;
			}
		}
		if (i > 0 && Math.abs(custo[i]![j]! - (custo[i - 1]![j]! + CUSTO_DE_FORA)) < 1e-9) {
			passos.push({ tipo: 'falta', e: i - 1 });
			i -= 1;
		} else {
			passos.push({ tipo: 'sobra', o: j - 1 });
			j -= 1;
		}
	}
	return passos.reverse();
}

/** Um par conta como o MESMO som (para achar onde a fala começa e ancorar a sílaba). */
const PAR_PROXIMO = 0.5;

/**
 * O erro tolerado: a soma das distâncias, dos sons que faltam e dos que sobram,
 * sobre o número de sons esperados. O reconhecedor erra sozinho (troca vizinhos,
 * perde o "n" de "don't", dobra um "t"), então o limite é folgado; o que ele
 * pega é a síntese que disse OUTRA coisa. Calibrado com as nove vozes do inglês.
 */
export const ERRO_MAXIMO_DA_SINTESE = 0.6;

export interface VereditoDaSintese {
	situacao: 'aprovada' | 'reprovada' | 'sem-como-verificar';
	/** O que reprovou, para o log: "vogal antes da fala", "sons trocados". */
	motivo?: string;
	/** O erro do alinhamento, de 0 a ~1 (ver `ERRO_MAXIMO_DA_SINTESE`). */
	erro: number;
}

/**
 * A síntese disse o que pretendia? Reprova em três casos:
 *
 * 1. **Uma VOGAL antes da fala** — a sílaba falsa do começo ("So", "A", "If").
 * 2. **Consoante antes da fala além do tolerado** (`consoantesAntes`). Na versão
 *    DEVAGAR nenhuma passa: o chiado do começo ("ts") vinha junto da pausa no
 *    meio da frase e do resto torto — foi o "So I don't know" do relato. Na
 *    NORMAL passa uma, a respiração antes da primeira palavra, que o ouvido não
 *    toma por sílaba.
 * 3. **Sons trocados demais** (`ERRO_MAXIMO_DA_SINTESE`).
 *
 * "Sem como verificar" quando há menos de dois sons conhecidos a comparar, ou
 * quando parte demais da escrita não é fonética que se meça (o TTS de um idioma
 * que não escreve em IPA).
 */
export function verificarSintese(
	esperado: string,
	sons: SomNoTempo[],
	opcoes: { consoantesAntes?: number } = {}
): VereditoDaSintese {
	const tolerado = opcoes.consoantesAntes ?? 1;
	const esperados = segmentosDoIpa(esperado);
	const conhecidos = esperados.filter((s) => tracosDe(s) !== null).length;
	if (conhecidos < 2 || conhecidos / Math.max(1, esperados.length) < 0.8) {
		return { situacao: 'sem-como-verificar', erro: 0 };
	}
	const ouvidos = ouvidosDe(sons).map((o) => o.seg);
	if (ouvidos.length === 0) {
		return { situacao: 'reprovada', motivo: 'nenhum som reconhecido', erro: 1 };
	}

	const passos = alinhar(esperados, ouvidos);
	const primeiro = passos.findIndex((p) => p.tipo === 'par' && p.d < PAR_PROXIMO);
	const antes = (primeiro < 0 ? passos : passos.slice(0, primeiro)).filter(
		(p): p is Extract<Passo, { tipo: 'sobra' }> => p.tipo === 'sobra'
	);
	const soma = passos.reduce((t, p) => t + (p.tipo === 'par' ? p.d : CUSTO_DE_FORA), 0);
	const erro = Math.round((soma / esperados.length) * 1000) / 1000;

	if (antes.some((p) => ehVogalOuDitongo(ouvidos[p.o]!))) {
		return { situacao: 'reprovada', motivo: 'vogal antes da fala', erro };
	}
	if (antes.length > tolerado) {
		return { situacao: 'reprovada', motivo: 'som antes da fala', erro };
	}
	if (erro > ERRO_MAXIMO_DA_SINTESE) {
		return { situacao: 'reprovada', motivo: 'sons trocados', erro };
	}
	return { situacao: 'aprovada', erro };
}

/** Um pedaço do arquivo, em segundos: [início, fim]. */
export type Trecho = [number, number];

/**
 * ONDE CADA SOM ESTÁ no áudio sintetizado, como o serviço de áudio o devolve
 * (`X-Phoneme-Times`): os sons que o TTS disse, em IPA, com o começo e o fim de
 * cada um no arquivo, e onde a fala começa e termina.
 *
 * Quem sabe disso é o próprio modelo, que prevê a duração de cada fonema; o
 * serviço corrige o adiantamento medido entre a previsão e o som e acerta na
 * onda os limites que se veem nela (o fechamento de um "p", a queda para uma
 * nasal). Antes isto saía do reconhecedor de fonemas, que marca um INSTANTE por
 * som e não o começo e o fim dele: a sílaba tocava fora do lugar.
 *
 * `fala` existe para a tela descobrir se o decodificador de MP3 do navegador
 * atrasou o áudio (há os que deixam o enchimento do codificador na frente):
 * medindo onde a fala começa no que ela decodificou, a diferença é o atraso.
 */
export interface LinhaDoTempo {
	fala: Trecho | null;
	sons: SomNoTempo[];
}

/** A linha do tempo de uma palavra da Pronúncia: o trecho de CADA FONEMA dela. */
export interface LinhaDaPalavra {
	/** Um por fonema do dicionário, na ordem, colados (o fim de um é o começo do outro). */
	fones: Trecho[];
	fala: Trecho | null;
}

/** A fração mínima de fonemas casados para a linha valer; abaixo, a tela fica com a boca parada. */
const CASADOS_MINIMOS = 0.6;
/** Um par mais distante que isto não é o mesmo som (o fonemizador do TTS leu outra coisa). */
const PAR_DO_MESMO_SOM = 0.6;
/**
 * O erro do alinhamento (distâncias, mais um por som que falta ou sobra, sobre
 * os sons esperados) acima do qual o TTS disse OUTRA palavra. Entre o dicionário
 * e o fonemizador do Kokoro, na mesma palavra, fica perto de 0,15 ("computer":
 * o "ɚ" do dicionário é "ə" + "ɹ" no TTS).
 */
const ERRO_MAXIMO_DA_LINHA = 0.45;

/**
 * O trecho de cada fonema do DICIONÁRIO (`sonsPorFonema`: os sons em IPA de cada
 * um, na ordem) no áudio, a partir dos sons que o TTS disse (`sons`).
 *
 * O dicionário da Pronúncia e o fonemizador do TTS não escrevem igual ("t" e o
 * tepe de "priority", "ɔː" e "ɔ"), então os dois são ALINHADOS pela distância
 * fonética. Cada fonema fica com o tempo dos sons do TTS casados com ele; um som
 * do TTS que sobrou vai para o vizinho (o limite fica no meio do vão), e um
 * fonema sem par divide o espaço entre os vizinhos. O resultado cobre a palavra
 * de ponta a ponta, sem buraco.
 *
 * `null` quando o TTS disse outra coisa (menos de 60% dos fonemas casados).
 */
export function temposDosFonemas(sonsPorFonema: string[][], sons: SomNoTempo[]): Trecho[] | null {
	const n = sonsPorFonema.length;
	if (n === 0 || sons.length === 0) return null;
	const esperados = sonsPorFonema.flatMap((segs, fonema) => segs.map((seg) => ({ seg, fonema })));
	// Um som do TTS escrito com dois segmentos divide o tempo dele ao meio.
	const ditos: Ouvido[] = sons.flatMap((som) => {
		const segs = segmentar(som.s);
		const passo = (som.fim - som.inicio) / Math.max(1, segs.length);
		return segs.map((seg, k) => ({
			seg,
			inicio: som.inicio + passo * k,
			fim: som.inicio + passo * (k + 1)
		}));
	});
	if (esperados.length === 0 || ditos.length === 0) return null;

	const casados: ({ ini: number; fim: number } | null)[] = new Array(n).fill(null);
	const passos = alinhar(
		esperados.map((e) => e.seg),
		ditos.map((d) => d.seg)
	);
	const custo = passos.reduce((t, p) => t + (p.tipo === 'par' ? p.d : CUSTO_DE_FORA), 0);
	if (custo / esperados.length > ERRO_MAXIMO_DA_LINHA) return null;
	const juntar = (f: number, d: Ouvido) => {
		const atual = casados[f];
		casados[f] = atual
			? { ini: Math.min(atual.ini, d.inicio), fim: Math.max(atual.fim, d.fim) }
			: { ini: d.inicio, fim: d.fim };
	};
	// O fonema de cada passo que casou (o par próximo o bastante).
	const casadoNoPasso = passos.map((passo) =>
		passo.tipo === 'par' && passo.d <= PAR_DO_MESMO_SOM ? esperados[passo.e]!.fonema : null
	);
	passos.forEach((passo, k) => {
		const f = casadoNoPasso[k];
		if (f !== null && f !== undefined && passo.tipo === 'par') juntar(f, ditos[passo.o]!);
	});
	if (casados.filter(Boolean).length < Math.max(1, n * CASADOS_MINIMOS)) return null;

	// O som do TTS que não casou com ninguém vai para o VIZINHO com que mais se
	// parece, não para o meio do vão: "around" é `ER0 AW1 N D` no dicionário (o
	// "ɚ" num fonema só) e "ə" + "ɹ" no TTS; o "ɹ" é do "ɚ", e partido ao meio
	// fazia a sílaba seguinte começar com meio "r".
	passos.forEach((passo, k) => {
		if (casadoNoPasso[k] !== null || passo.tipo === 'falta') return;
		const dito = ditos[passo.o]!;
		const vizinho = (de: number, passoDe: number): number | null => {
			for (let j = de; j >= 0 && j < passos.length; j += passoDe) {
				if (casadoNoPasso[j] !== null) return casadoNoPasso[j]!;
			}
			return null;
		};
		const antes = vizinho(k - 1, -1);
		const depois = vizinho(k + 1, 1);
		const distancia = (f: number | null) =>
			f === null
				? Number.POSITIVE_INFINITY
				: Math.min(...sonsPorFonema[f]!.map((seg) => distanciaEntreFones(seg, dito.seg)));
		const alvo = distancia(depois) < distancia(antes) ? depois : antes;
		if (alvo !== null) juntar(alvo, dito);
	});

	// As fronteiras entre fonemas: nas pontas, o primeiro e o último som do TTS
	// (a palavra inteira); entre dois casados, o meio do vão (sem vão, o limite
	// que o serviço já acertou); uma sequência sem par divide em partes iguais.
	const fronteira: number[] = new Array(n + 1).fill(0);
	fronteira[0] = Math.min(ditos[0]!.inicio, casados.find(Boolean)!.ini);
	fronteira[n] = Math.max(ditos.at(-1)!.fim, [...casados].reverse().find(Boolean)!.fim);
	let i = 0;
	while (i < n) {
		const atual = casados[i];
		if (atual) {
			const proximo = casados[i + 1];
			if (i + 1 < n && proximo) fronteira[i + 1] = (atual.fim + proximo.ini) / 2;
			i += 1;
			continue;
		}
		let j = i;
		while (j < n && !casados[j]) j += 1;
		// Sem par de `i` a `j - 1`: entre o meio do casado de antes e o meio do de
		// depois (ou a ponta da palavra), em partes iguais.
		const antes = i === 0 ? null : casados[i - 1]!;
		const depois = j === n ? null : casados[j]!;
		const esquerda = antes ? (antes.ini + antes.fim) / 2 : fronteira[0]!;
		const direita = depois ? (depois.ini + depois.fim) / 2 : fronteira[n]!;
		const partes = j - i + (antes ? 1 : 0) + (depois ? 1 : 0);
		const largura = (direita - esquerda) / Math.max(1, partes);
		for (let k = antes ? i : i + 1; k <= (depois ? j : j - 1); k++) {
			fronteira[k] = esquerda + largura * (k - i + (antes ? 1 : 0));
		}
		i = j;
	}

	const fones: Trecho[] = [];
	for (let k = 0; k < n; k++) {
		const ini = fronteira[k]!;
		const fim = Math.max(ini, fronteira[k + 1]!);
		fones.push([Math.round(ini * 1000) / 1000, Math.round(fim * 1000) / 1000]);
	}
	return fones;
}
