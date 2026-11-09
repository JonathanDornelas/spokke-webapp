import type { ContentUnitKind } from './types';

/**
 * Converte o texto que o professor COLA na etapa 2 do wizard em unidades de
 * conteúdo. É o nível 1 de autoria (kernel.md): ele cola uma lista que já
 * usa em aula, não preenche exercício por exercício.
 *
 * Puro e sem I/O, como todo o kernel — a tela só manda a string.
 */

/**
 * O separador que a tela mostra no placeholder: "alvo · tradução". Os chips ao
 * lado do textarea saem de `RAW_SEPARATORS`, aqui embaixo, não de uma cópia
 * na tela — o dia em que um separador novo entrar, tela e parser mudam juntos.
 */
const SEPARATORS = ['·', '|', '\t', ' - '];

export const RAW_SEPARATORS: readonly { mark: string; name: string }[] = [
	{ mark: '·', name: 'ponto' },
	{ mark: '|', name: 'barra' },
	{ mark: '-', name: 'hífen com espaços' },
	{ mark: '⇥', name: 'tabulação' }
];

function splitPair(line: string): [string, string] | null {
	for (const separator of SEPARATORS) {
		const index = line.indexOf(separator);
		if (index > 0) {
			const left = line.slice(0, index).trim();
			const right = line.slice(index + separator.length).trim();
			if (left && right) return [left, right];
		}
	}
	return null;
}

const linesOf = (raw: string) =>
	raw
		.split('\n')
		.map((l) => l.trim())
		.filter(Boolean);

/** Uma linha colada, e no que ela virou — ou por que não virou nada. */
export interface RawLinePreview {
	/** A linha como o professor colou, já sem espaços nas pontas. */
	text: string;
	left: string;
	right: string;
	/** `false` quando a linha não tem separador e vai ser ignorada. */
	ok: boolean;
	/**
	 * A linha não tem separador, mas ENTRA: a tradução vem do tradutor
	 * automático. Só acontece com `traduzirSemSeparador`.
	 */
	automatica?: boolean;
}

/**
 * Como tratar a linha SEM separador. Sem tradutor ela não vira material (não
 * há tradução, e a do aluno é obrigatória). Com tradutor ela entra só com o
 * lado do idioma alvo, e a tradução vem dele — é o caminho padrão: o professor
 * cola a lista no idioma que ensina e confere a tradução depois.
 */
export interface OpcoesDoLote {
	traduzirSemSeparador?: boolean;
}

/**
 * A prévia do lote, LINHA A LINHA. `parseRawMaterial` devolve só o que vira
 * material; a tela precisa também das linhas que ficam de fora, para o
 * professor ver QUAL frase está sem separador antes de enviar — um contador
 * "2 ignoradas" não diz onde consertar.
 *
 * Mesmo `splitPair` do parser de verdade: o que aparece como "vira material"
 * é exatamente o que o servidor grava.
 */
export function previewRawLines(raw: string, opcoes: OpcoesDoLote = {}): RawLinePreview[] {
	return linesOf(raw).map((text) => {
		const pair = splitPair(text);
		if (pair) return { text, left: pair[0], right: pair[1], ok: true };
		return opcoes.traduzirSemSeparador
			? { text, left: text, right: '', ok: true, automatica: true }
			: { text, left: text, right: '', ok: false };
	});
}

/**
 * Com `traduzirSemSeparador`, a linha sem separador volta com a tradução EM
 * BRANCO (`source: ''` / `translation: ''`): o servidor preenche antes de
 * validar, e uma unidade assim nunca chega ao schema do kernel vazia.
 */
export function parseRawMaterial(
	kind: ContentUnitKind,
	raw: string,
	opcoes: OpcoesDoLote = {}
): unknown[] {
	const lines = linesOf(raw);
	if (lines.length === 0) return [];
	const semSeparador = (line: string): [string, string] | null =>
		opcoes.traduzirSemSeparador ? [line, ''] : null;

	switch (kind) {
		// Uma frase por linha vira uma unidade — vinte linhas viram vinte
		// materiais, e é daí que saem os ~cem exercícios.
		case 'SentencePair':
			return lines.flatMap((line) => {
				const pair = splitPair(line) ?? semSeparador(line);
				return pair ? [{ target: pair[0], source: pair[1] }] : [];
			});

		case 'VocabItem':
			return lines.flatMap((line) => {
				const pair = splitPair(line) ?? semSeparador(line);
				return pair ? [{ term: pair[0], translation: pair[1] }] : [];
			});

		// Texto e diálogo são UMA unidade só: o bloco inteiro.
		case 'Passage': {
			const [first, ...rest] = lines;
			return rest.length > 0
				? [{ title: first, text: rest.join('\n') }]
				: [{ title: first.slice(0, 60), text: first }];
		}

		case 'Dialogue': {
			const parsed = lines.map((line, i) => {
				const colon = line.indexOf(':');
				if (colon > 0) {
					const speaker = line.slice(0, colon).trim();
					const text = line.slice(colon + 1).trim();
					if (speaker && text) return { speaker, text };
				}
				// Sem "Falante:" na frente, alterna A e B — o professor colou só
				// as falas na ordem, que é o que importa para `order-lines`.
				return { speaker: i % 2 === 0 ? 'A' : 'B', text: line };
			});
			return parsed.length >= 2 ? [{ lines: parsed }] : [];
		}
	}
}
