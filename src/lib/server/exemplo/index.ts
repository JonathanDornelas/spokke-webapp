import { getInteraction } from '$lib/kernel/interactions/registry';
import { interactionSchema, localeSchema } from '$lib/kernel/item';
import { getProfile } from '$lib/kernel/language/profiles';
import { corrigirSemGravar, type Correcao } from '$lib/server/player/veredito';
import {
	buildRuntimeItem,
	itemAudioHashes,
	type RuntimeItem,
	type StoredItemRow
} from '$lib/server/player/runtime';
import { transcreverNoIdioma } from '$lib/server/asr/audiotext-provider';
import {
	guardarTranscricao,
	hashDoAudio,
	transcricaoGuardada
} from '$lib/server/asr/pre-transcricao';

/**
 * A atividade de exemplo: a de `/exemplo` e a do celular da home.
 *
 * Itens de verdade, no MESMO formato do banco, montados pelo MESMO
 * `buildRuntimeItem` do Player e corrigidos pelo MESMO kernel. Uma demonstração
 * desenhada à mão divergiria do produto no primeiro ajuste de correção, e o
 * "quase" que a home promete tem de ser o "quase" que o aluno recebe.
 *
 * O que NÃO tem: banco, tentativa e professor. Nada do que o visitante responde
 * é gravado, e por isso não existe `attemptId` para autorizar nada — a única
 * coisa que o servidor sabe fazer com estes itens é corrigir uma resposta.
 *
 * O gabarito continua aqui, no servidor (regra inviolável nº 1), mesmo sendo uma
 * demonstração: o celular da home é o primeiro lugar onde alguém procuraria o
 * vazamento, e "é só o exemplo" seria um mau exemplo.
 */

/** A seed da "tentativa". Fixa: o exemplo embaralha igual para todo mundo, e F5 não muda nada (regra nº 8). */
const SEMENTE = 'exemplo';

const LOCALE = { source: 'pt-BR', target: 'en-US' };

/**
 * A frase da escuta e os dois arquivos dela, em `static/demo/`. Foram gerados
 * pelo serviço de áudio com a voz que `vozDoTexto` escolhe para esta frase
 * (`af_heart`), nas duas velocidades do `en-US`. Trocar a frase pede gerar os
 * arquivos de novo — a URL não sai do bucket porque o exemplo não tem professor
 * dono de `tts/<teacherId>/`.
 */
const FRASE_DA_ESCUTA = 'I have lived here for two years.';
const AUDIO_DA_ESCUTA = ['/demo/exemplo-escuta.mp3', '/demo/exemplo-escuta-lento.mp3'];

const ITENS: StoredItemRow[] = [
	{
		id: 'escuta',
		prompt: { kind: 'audio', text: FRASE_DA_ESCUTA, instructionKey: 'listen-and-choose' },
		interaction: {
			type: 'choice',
			payload: {
				options: [
					FRASE_DA_ESCUTA,
					'I lived here two years ago.',
					'I will live here for two years.'
				],
				correctIndex: 0
			}
		},
		grading: { mode: 'exact' },
		locale: LOCALE
	},
	{
		id: 'lacuna',
		prompt: {
			kind: 'text',
			text: 'Ela trabalha aqui desde 2019.',
			instructionKey: 'fill-the-blank'
		},
		interaction: {
			type: 'cloze',
			payload: {
				masked: 'She ___ here since 2019.',
				accepted: ['has been working', 'has worked']
			}
		},
		grading: { mode: 'tolerant', tolerance: 0.9 },
		locale: LOCALE
	},
	{
		id: 'montar',
		prompt: {
			kind: 'text',
			text: 'Nós ainda não terminamos.',
			instructionKey: 'assemble-from-source'
		},
		interaction: {
			type: 'assemble',
			payload: {
				tokens: ['We', "haven't", 'finished', 'yet'],
				distractors: ['already', "didn't"],
				accepted: [['We', "haven't", 'finished', 'yet']]
			}
		},
		grading: { mode: 'sequence' },
		locale: LOCALE
	},
	{
		id: 'fala',
		prompt: { kind: 'text', text: 'Você já esteve em Londres?', instructionKey: 'say-in-target' },
		interaction: {
			type: 'speak',
			payload: { target: 'Have you ever been to London?', hints: ['London'] }
		},
		grading: { mode: 'asr' },
		locale: LOCALE
	},
	{
		id: 'pares',
		prompt: { kind: 'text', instructionKey: 'match-pairs' },
		interaction: {
			type: 'match',
			payload: {
				pairs: [
					{ left: 'already', right: 'já' },
					{ left: 'yet', right: 'ainda' },
					{ left: 'since', right: 'desde' },
					{ left: 'ever', right: 'alguma vez' }
				]
			}
		},
		grading: { mode: 'set' },
		locale: LOCALE
	}
];

/** As quatro que cabem no celular da home, na ordem das pastilhas. */
export const QUESTOES_DA_HOME = ['escuta', 'lacuna', 'montar', 'fala'] as const;

export type QuestaoDoExemplo = RuntimeItem & { id: string };

/** O que o browser recebe: só o que `toRuntime()` produziu, mais o id. */
export function questoesDoExemplo(ids?: readonly string[]): QuestaoDoExemplo[] {
	const audio = new Map<string, string>();
	const escuta = ITENS[0]!;
	itemAudioHashes(escuta, LOCALE.target).forEach((hash, i) => {
		const url = AUDIO_DA_ESCUTA[i];
		if (url) audio.set(hash, url);
	});

	const linhas = ids ? ids.map((id) => itemOuNada(id)).filter((l) => l !== null) : ITENS;
	return linhas.map((linha) => ({ ...buildRuntimeItem(linha, SEMENTE, audio), id: linha.id }));
}

function itemOuNada(id: string): StoredItemRow | null {
	return ITENS.find((linha) => linha.id === id) ?? null;
}

export type { Correcao, Veredito } from '$lib/server/player/veredito';

/**
 * Corrige uma resposta pelo corretor que não grava (`corrigirSemGravar`, o
 * mesmo da revisão do professor), com a seed do item. O resultado está sempre
 * ligado: é o veredito que se veio ver.
 */
export async function corrigirNoExemplo(itemId: string, resposta: unknown): Promise<Correcao> {
	const linha = itemOuNada(itemId);
	if (!linha) return { ok: false, erro: 'questão desconhecida' };
	return corrigirSemGravar(linha, resposta, `${SEMENTE}:${linha.id}`);
}

/**
 * Transcreve a gravação de uma questão de FALA do exemplo. Mesmo motor e mesmas
 * dicas do Player (`a/[slug]/fala`), e o mesmo cache por hash dos bytes: o
 * "Verificar" chega com a gravação que o "ouvir" já transcreveu e não paga o
 * Whisper duas vezes. `quem` separa os visitantes no cache — com uma chave só,
 * dois ao mesmo tempo se sobrescreveriam.
 *
 * `podeTranscrever` é consultado só quando o Whisper vai rodar de verdade: o
 * limite por visitante conta transcrições, não pedidos.
 *
 * Os bytes morrem aqui. O exemplo não tem consentimento para pedir nem
 * professor para ouvir, então não guarda gravação nenhuma.
 */
export type TranscricaoDoExemplo =
	{ ok: true; texto: string } | { ok: false; motivo: 'nao-e-fala' | 'limite' };

export async function transcreverNoExemplo(
	itemId: string,
	bytes: Uint8Array,
	contentType: string,
	quem: string,
	podeTranscrever: () => boolean
): Promise<TranscricaoDoExemplo> {
	const linha = itemOuNada(itemId);
	if (!linha) return { ok: false, motivo: 'nao-e-fala' };
	const interaction = interactionSchema.parse(linha.interaction);
	if (interaction.type !== 'speak') return { ok: false, motivo: 'nao-e-fala' };

	const locale = localeSchema.parse(linha.locale);
	const profile = getProfile(locale.target);
	const payload = getInteraction('speak').authoringSchema.parse(interaction.payload) as {
		hints?: string[];
	};

	const chave = `${SEMENTE}:${quem}`;
	const hash = hashDoAudio(bytes);
	const guardada = transcricaoGuardada(chave, itemId, hash);
	if (guardada !== null) return { ok: true, texto: guardada };
	if (!podeTranscrever()) return { ok: false, motivo: 'limite' };

	const { text } = await transcreverNoIdioma(
		bytes,
		profile.asr.model,
		[...profile.asr.hints, ...(payload.hints ?? [])],
		contentType
	);
	guardarTranscricao(chave, itemId, hash, text);
	return { ok: true, texto: text };
}
