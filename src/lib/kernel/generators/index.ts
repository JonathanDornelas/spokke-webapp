import type { ContentUnitKind, Dialogue, Passage, SentencePair, VocabItem } from '../content/types';
import { parseContentUnit } from '../content/parse';
import type { Item } from '../item';
import type { LanguageProfile } from '../language/profile';
import { z } from 'zod';
import { exigeIme } from '../language/teclado';
import { tecladoAlcanca } from '../language/alcance';
import { comLeituraAceita, type Transcritor } from '../language/escrita';
import { sentencePairGenerators } from './sentence-pair';
import { vocabItemGenerators } from './vocab-item';
import { passageGenerators } from './passage';
import { dialogueGenerators } from './dialogue';
import { closingMatch, type PalavraTraduzida } from './closing-match';
import type { ContentRef, Generator } from './types';

/**
 * Roda todos os geradores aplicáveis sobre um lote de conteúdo e devolve o
 * resultado JÁ AGRUPADO por material — é essa a forma que a etapa "Revisar"
 * do wizard mostra (paginas.md: resumo legível por material, nunca JSON).
 *
 * Material que não produziu nada não some em silêncio: vira um grupo vazio
 * com `reason`, que a tela transforma num aviso com ação.
 */

export interface StoredContentUnit {
	id: string;
	kind: ContentUnitKind;
	/** Coluna `Json` do Postgres — `unknown` de verdade, validada aqui. */
	data: unknown;
}

export interface GenerationOptions {
	targetProfile: LanguageProfile;
	sourceProfile: LanguageProfile;
	seed: string;
	capabilities: { asr: boolean; tts: boolean };
	/**
	 * Quem escreve a LEITURA de uma frase (kana, pinyin), para a questão de
	 * digitar aceitar o que o teclado do idioma escreve — `language/escrita.ts`.
	 * É do servidor, que tem o dicionário; sem ele as frases que o teclado não
	 * alcança continuam fora das questões de digitar, como antes.
	 */
	transcrever?: Transcritor;
	/**
	 * Palavras das frases da atividade com a tradução do tradutor, para o "ligue
	 * os pares" do fecho (`closing-match.ts`). Quem escolhe as palavras é
	 * `palavrasParaAssociar` (puro); quem traduz é o servidor. Sem tradutor, vazio.
	 */
	palavrasTraduzidas?: PalavraTraduzida[];
}

export interface GenerationGroup {
	contentId: string;
	kind: ContentUnitKind;
	excerpt: string;
	items: Item[];
	reason?: string;
}

export interface GenerationResult {
	groups: GenerationGroup[];
	/**
	 * O exercício de associação que FECHA a atividade. Vem separado dos grupos
	 * porque não nasce de uma unidade de conteúdo: ele revisa o lote inteiro, e
	 * por isso também não entra no rodízio da seleção — ele é o último item.
	 */
	closing: Item | null;
}

function runSet<D>(
	generators: Generator<D>[],
	ref: ContentRef<D>,
	siblings: ContentRef<D>[],
	options: GenerationOptions
): Item[] {
	return generators
		.flatMap((generator) =>
			generator.generate(ref, {
				targetProfile: options.targetProfile,
				sourceProfile: options.sourceProfile,
				siblings: siblings.filter((s) => s.id !== ref.id),
				seed: options.seed,
				capabilities: options.capabilities
			})
		)
		.map((item) => comLeitura(item, options))
		.filter((item) => !pedeOQueOTecladoNaoEscreve(item, options));
}

/** O item com a leitura da frase entre as respostas aceitas, quando precisa dela. */
function comLeitura(item: Item, options: GenerationOptions): Item {
	const payload = comLeituraAceita(
		item.interaction,
		item.grading,
		options.targetProfile,
		options.transcrever
	);
	return payload === item.interaction.payload
		? item
		: { ...item, interaction: { ...item.interaction, payload } };
}

/**
 * O item pede para o aluno DIGITAR algo que o teclado dele não escreve?
 *
 * Dois casos, e os dois reprovariam o aluno com a cara de estar funcionando:
 *
 * - **`ime` (chinês):** nenhum teclado resolve — o aluno escreve pinyin e um
 *   IME escolhe o hanzi, e pinyin contra o gabarito em hanzi vale ZERO.
 * - **`grade` com resposta fora do ALCANCE do teclado** (`language/alcance.ts`):
 *   o teclado de kana escreve `おはよう` e não escreve `私`. A frase só em kana
 *   vira questão de digitar; a que tem kanji não.
 *
 * Basta UMA resposta aceita alcançável: a correção compara com todas, então o
 * aluno que escreve aquela leva a nota inteira.
 *
 * **A regra é do ITEM, não de um gerador.** Hoje ela pega `listen-type` e
 * `cloze-target`; um gerador novo que peça digitação no idioma alvo já nasce
 * coberto, sem ninguém precisar lembrar de pôr um `if` nele.
 *
 * **Só vale quando a resposta é no idioma ALVO.** No idioma do aluno o aparelho
 * é DELE e já tem o IME — o chinês que estuda inglês digita chinês todo dia. Por
 * isso `translate-type` (que pede a tradução na língua do aluno) sobrevive, e a
 * mesma frase continua treinando escrita por ali.
 *
 * O que substitui o item cortado é "montar a frase" (`assemble`), que os
 * geradores já produzem e que não precisa de teclado nenhum.
 */
function pedeOQueOTecladoNaoEscreve(item: Item, options: GenerationOptions): boolean {
	const digita = item.interaction.type === 'type' || item.interaction.type === 'cloze';
	if (!digita) return false;
	if ((item.grading.answerLang ?? 'target') !== 'target') return false;

	const entrada = options.targetProfile.input;
	if (exigeIme(entrada)) return true;
	if (entrada.modo !== 'grade') return false;

	const respostas = respostasAceitas.safeParse(item.interaction.payload);
	if (!respostas.success) return false;
	return !respostas.data.accepted.some((r) =>
		tecladoAlcanca(entrada.teclado, r, options.targetProfile)
	);
}

/** `type` e `cloze` guardam o gabarito no mesmo campo. */
const respostasAceitas = z.object({ accepted: z.array(z.string()) });

/** Trecho legível que identifica o material na tela de revisar. */
function excerptOf(data: SentencePair | VocabItem | Passage | Dialogue): string {
	if ('target' in data) return data.target;
	if ('term' in data) return data.term;
	if ('title' in data) return data.title;
	return data.lines[0]?.text ?? '';
}

const EMPTY_REASON =
	'Nenhum gerador conseguiu produzir item a partir deste material. Distrator sai sempre do seu próprio conjunto — com poucos materiais do mesmo tipo, alguns exercícios não têm alternativa errada plausível.';

export function runGenerators(
	units: StoredContentUnit[],
	options: GenerationOptions
): GenerationResult {
	const pairs: ContentRef<SentencePair>[] = [];
	const vocab: ContentRef<VocabItem>[] = [];
	const passages: ContentRef<Passage>[] = [];
	const dialogues: ContentRef<Dialogue>[] = [];
	const parsed = new Map<string, SentencePair | VocabItem | Passage | Dialogue>();

	for (const unit of units) {
		switch (unit.kind) {
			case 'SentencePair': {
				const data = parseContentUnit('SentencePair', unit.data);
				pairs.push({ id: unit.id, data });
				parsed.set(unit.id, data);
				break;
			}
			case 'VocabItem': {
				const data = parseContentUnit('VocabItem', unit.data);
				vocab.push({ id: unit.id, data });
				parsed.set(unit.id, data);
				break;
			}
			case 'Passage': {
				const data = parseContentUnit('Passage', unit.data);
				passages.push({ id: unit.id, data });
				parsed.set(unit.id, data);
				break;
			}
			case 'Dialogue': {
				const data = parseContentUnit('Dialogue', unit.data);
				dialogues.push({ id: unit.id, data });
				parsed.set(unit.id, data);
				break;
			}
		}
	}

	const byContentId = new Map<string, Item[]>();
	for (const ref of pairs) {
		byContentId.set(ref.id, runSet(sentencePairGenerators, ref, pairs, options));
	}
	for (const ref of vocab) {
		byContentId.set(ref.id, runSet(vocabItemGenerators, ref, vocab, options));
	}
	for (const ref of passages) {
		byContentId.set(ref.id, runSet(passageGenerators, ref, passages, options));
	}
	for (const ref of dialogues) {
		byContentId.set(ref.id, runSet(dialogueGenerators, ref, dialogues, options));
	}

	// Mantém a ordem original do lote — a tela de revisar lista na ordem em
	// que o professor cadastrou.
	const groups = units.map((unit) => {
		const items = byContentId.get(unit.id) ?? [];
		const data = parsed.get(unit.id);
		return {
			contentId: unit.id,
			kind: unit.kind,
			excerpt: data ? excerptOf(data) : '',
			items,
			reason: items.length === 0 ? EMPTY_REASON : undefined
		};
	});

	return {
		groups,
		closing: closingMatch({ vocab, palavras: options.palavrasTraduzidas, options })
	};
}
