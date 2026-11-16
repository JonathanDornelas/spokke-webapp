import type { Dialogue } from '../content/types';
import type { Item } from '../item';
import type { FalaDoContexto, InteractionKind, MostraDoDialogo } from '../interactions/types';
import { normalize } from '../language/normalize';
import { tokenize } from '../language/tokenize';
import { shuffleWithSeed } from '../random';
import { distractorPhrases, distractorTokens } from './distractors';
import type { ContentRef, Generator, GeneratorContext, NivelCefr } from './types';

/**
 * `Dialogue` — kernel.md lista `order-lines`, `listen-dialogue-choice` e
 * `roleplay-speak`. Aqui estão o ordenar, a pergunta sobre o diálogo
 * (`dialogue-comprehension`, das perguntas que o professor escreveu) e a
 * "próxima fala" (`dialogue-next-line`): o diálogo toca e para numa fala, e o
 * aluno a escolhe, monta ou diz — a escolha e a fala são os dois geradores
 * que o kernel.md previa, com o montar junto.
 */

/**
 * Como o aluno recebe o diálogo, na GERAÇÃO. O nível é rótulo (adr-004), e esta
 * é a exceção, pedida pelo dono do repositório: até B1 o aluno lê as falas
 * enquanto as ouve; de B2 para cima, só ouve. Sem nível, as duas coisas. Sem
 * voz no idioma (ou sem provedor de TTS), só o texto: um diálogo para ouvir
 * que não toca é uma questão sem resposta. No editor o professor troca.
 */
export function mostraDoDialogo(
	nivel: NivelCefr | null | undefined,
	temVoz: boolean
): MostraDoDialogo {
	if (!temVoz) return 'texto';
	return nivel === 'B2' || nivel === 'C1' || nivel === 'C2' ? 'audio' : 'ambos';
}

function falasDe(dialogo: Dialogue): FalaDoContexto[] {
	return dialogo.lines.map((l) => ({ falante: l.speaker, texto: l.text }));
}

function temVoz(ctx: GeneratorContext<Dialogue>): boolean {
	return ctx.capabilities.tts && ctx.targetProfile.tts.voices.length > 0;
}

/**
 * Como ESTE diálogo vai: pelo nível e pela voz — e LIDO quando o professor
 * desligou a escuta deste material (`GeneratorContext.pedidas`): com áudio, as
 * questões dele exigiriam a escuta, e o corte tiraria todas.
 */
function mostraDe(ctx: GeneratorContext<Dialogue>): MostraDoDialogo {
	const querEscuta = !ctx.pedidas || ctx.pedidas.includes('listening');
	return mostraDoDialogo(ctx.nivel, temVoz(ctx) && querEscuta);
}

function base(content: ContentRef<Dialogue>, generatedBy: string, ctx: GeneratorContext<Dialogue>) {
	return {
		sourceContentId: content.id,
		generatedBy,
		locale: { source: ctx.sourceProfile.tag, target: ctx.targetProfile.tag }
	};
}

export const orderLines: Generator<Dialogue> = {
	id: 'order-lines',
	generate: (content, ctx) => {
		const lines = content.data.lines.map((l) => l.text);
		// Duas falas já dão exercício; uma só, não.
		if (lines.length < 2) return [];

		const item: Item = {
			id: `${content.id}:order-lines`,
			...base(content, 'order-lines', ctx),
			// Sem `text`: o enunciado é só a instrução, e o conteúdo (as falas
			// na ordem certa) é gabarito — vai no payload da interação, que
			// `toRuntime` embaralha.
			prompt: { kind: 'text', instructionKey: 'order-the-lines' },
			interaction: { type: 'order', payload: { lines } },
			grading: { mode: 'sequence' }
		};
		return [item];
	}
};

/**
 * As perguntas que o professor escreveu, com o diálogo INTEIRO antes delas.
 * Alternativas erradas: as respostas das outras perguntas do conjunto (deste
 * diálogo e dos outros) — sem nenhuma, a pergunta não vira questão, igual à do
 * texto.
 */
export const dialogueComprehension: Generator<Dialogue> = {
	id: 'dialogue-comprehension',
	generate: (content, ctx) => {
		const respostas = [
			...content.data.questions.map((q) => q.answer),
			...ctx.siblings.flatMap((s) => s.data.questions.map((q) => q.answer))
		];
		const mostra = mostraDe(ctx);

		return content.data.questions.flatMap((pergunta, i) => {
			const erradas = distractorPhrases(
				respostas,
				pergunta.answer,
				3,
				ctx.targetProfile,
				`${ctx.seed}:${content.id}:dialogue-comprehension:${i}`
			);
			if (erradas.length < 1) return [];
			const item: Item = {
				id: `${content.id}:dialogue-comprehension:${i}`,
				...base(content, 'dialogue-comprehension', ctx),
				prompt: {
					kind: 'composite',
					text: pergunta.question,
					instructionKey: 'answer-about-dialogue',
					contexto: { tipo: 'dialogo', falas: falasDe(content.data), mostra }
				},
				interaction: {
					type: 'choice',
					payload: { options: [pergunta.answer, ...erradas], correctIndex: 0 }
				},
				grading: { mode: 'exact' }
			};
			return [item];
		});
	}
};

/** Quantas paradas um diálogo rende: metade das falas que têm alguma antes, até três. */
const MAX_PARADAS = 3;

/**
 * A próxima fala. O diálogo toca até uma fala e para: ali é a vez do aluno.
 *
 * - **Qual fala, sorteada** (pedido do dono do repositório): de qualquer pessoa,
 *   nunca a primeira (sem nada antes não há conversa a continuar).
 * - **Tipos variados no mesmo diálogo**: escolher, montar e dizer, numa ordem
 *   sorteada, cada parada um — e quando um não dá (fala de uma palavra não se
 *   monta, sem ASR não se diz, sem fala que o aluno ainda não viu não há
 *   alternativa errada), a parada fica com o seguinte.
 * - O diálogo vai INTEIRO no item, com `ate` na parada: o editor troca a
 *   parada sem precisar do material, e o runtime corta o que vem depois.
 */
export const dialogueNextLine: Generator<Dialogue> = {
	id: 'dialogue-next-line',
	generate: (content, ctx) => {
		const falas = falasDe(content.data);
		if (falas.length < 2) return [];
		const mostra = mostraDe(ctx);
		const semente = `${ctx.seed}:${content.id}:dialogue-next-line`;

		const candidatas = falas.map((_, i) => i).slice(1);
		const quantas = Math.min(MAX_PARADAS, Math.max(1, Math.ceil(candidatas.length / 2)));
		const paradas = shuffleWithSeed(candidatas, semente)
			.slice(0, quantas)
			.sort((a, b) => a - b);
		const ordem = shuffleWithSeed<InteractionKind>(
			['choice', 'assemble', 'speak'],
			`${semente}:tipos`
		);

		const dosOutros = ctx.siblings.flatMap((s) => s.data.lines.map((l) => l.text));
		// As peças a mais do MONTAR saem de qualquer outra fala: são palavras soltas.
		const outrasFalas = (ate: number) => [
			...falas.filter((_, i) => i !== ate).map((f) => f.texto),
			...dosOutros
		];
		// As erradas da ESCOLHA, não: uma fala que já está na tela, acima da vez do
		// aluno, sai na hora (quem pediu dois croissants não vai pedir de novo).
		// Ficam as que vêm DEPOIS da parada e as dos outros diálogos, menos as
		// que repetem uma fala já dita.
		const naoDitas = (ate: number) => {
			const ditas = new Set(falas.slice(0, ate).map((f) => normalize(f.texto, ctx.targetProfile)));
			return [...falas.slice(ate + 1).map((f) => f.texto), ...dosOutros].filter(
				(texto) => !ditas.has(normalize(texto, ctx.targetProfile))
			);
		};

		const itens: Item[] = [];
		paradas.forEach((ate, n) => {
			const alvo = falas[ate]!.texto;
			const fontes = { naoDitas: naoDitas(ate), outras: outrasFalas(ate) };
			for (let tentativa = 0; tentativa < ordem.length; tentativa++) {
				const tipo = ordem[(n + tentativa) % ordem.length]!;
				const interacao = montarParada(tipo, alvo, fontes, ctx, `${semente}:${ate}`);
				if (!interacao) continue;
				itens.push({
					id: `${content.id}:dialogue-next-line:${ate}`,
					...base(content, 'dialogue-next-line', ctx),
					prompt: {
						kind: 'composite',
						instructionKey: INSTRUCAO_DA_PARADA[tipo],
						contexto: { tipo: 'dialogo', falas, ate, mostra }
					},
					...interacao
				});
				break;
			}
		});
		return itens;
	}
};

const INSTRUCAO_DA_PARADA: Partial<Record<InteractionKind, string>> = {
	choice: 'choose-next-line',
	assemble: 'assemble-next-line',
	speak: 'say-next-line'
};

function montarParada(
	tipo: InteractionKind,
	alvo: string,
	{ naoDitas, outras }: { naoDitas: string[]; outras: string[] },
	ctx: GeneratorContext<Dialogue>,
	semente: string
): Pick<Item, 'interaction' | 'grading'> | null {
	if (tipo === 'choice') {
		const erradas = distractorPhrases(naoDitas, alvo, 2, ctx.targetProfile, semente);
		if (erradas.length < 1) return null;
		return {
			interaction: { type: 'choice', payload: { options: [alvo, ...erradas], correctIndex: 0 } },
			grading: { mode: 'exact' }
		};
	}
	if (tipo === 'assemble') {
		const tokens = tokenize(alvo, ctx.targetProfile);
		if (tokens.length < 2) return null;
		const distractors = distractorTokens(outras, alvo, 2, ctx.targetProfile, semente);
		return {
			interaction: { type: 'assemble', payload: { tokens, distractors, accepted: [tokens] } },
			grading: { mode: 'sequence' }
		};
	}
	if (tipo === 'speak') {
		if (!ctx.capabilities.asr) return null;
		return {
			interaction: { type: 'speak', payload: { target: alvo, hints: [] } },
			grading: { mode: 'asr' }
		};
	}
	return null;
}

export const dialogueGenerators: Generator<Dialogue>[] = [
	orderLines,
	dialogueComprehension,
	dialogueNextLine
];
