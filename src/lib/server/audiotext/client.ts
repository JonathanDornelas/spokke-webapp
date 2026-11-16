/**
 * O cliente do `audiotext-service` — Whisper, Kokoro-82M e o tradutor atrás de
 * HTTP.
 *
 * Um módulo só para os três provedores porque a autenticação, o endereço e o
 * tratamento de erro são os mesmos; o que muda é a rota.
 *
 * `process.env` (e não `$env/dynamic/private`) porque o WORKER importa isto
 * fora do runtime do SvelteKit — mesma razão de `db/client.ts` e de
 * `server/tts/index.ts`.
 */
import { z } from 'zod';
import type { LinhaDoTempo } from '$lib/kernel/language/sintese';
import { lerLinha } from '$lib/server/tts/linha';

export class AudiotextError extends Error {
	constructor(
		message: string,
		readonly status: number
	) {
		super(message);
		this.name = 'AudiotextError';
	}
}

function baseUrl(): string {
	const url = process.env.AUDIOTEXT_URL;
	if (!url) {
		throw new Error(
			'AUDIOTEXT_URL não configurada — o serviço de áudio é quem sintetiza e transcreve.'
		);
	}
	return url.replace(/\/+$/, '');
}

function authHeaders(): Record<string, string> {
	const token = process.env.AUDIOTEXT_TOKEN;
	return token ? { authorization: `Bearer ${token}` } : {};
}

/**
 * Toda chamada tem prazo. O serviço mantém os modelos na memória e responde em
 * centenas de milissegundos; se estiver baixando os pesos ele responde 503 na
 * hora, e não pendurado. Um `fetch` sem prazo aqui prenderia um worker da fila
 * para sempre.
 */
function comPrazo(ms: number): AbortSignal {
	return AbortSignal.timeout(ms);
}

async function erroDaResposta(resposta: Response): Promise<AudiotextError> {
	let detalhe = resposta.statusText;
	try {
		const corpo = (await resposta.json()) as { detail?: unknown; error?: unknown };
		detalhe = String(corpo.detail ?? corpo.error ?? detalhe);
	} catch {
		// Corpo não-JSON (um 502 de proxy, por exemplo). Fica o statusText.
	}
	return new AudiotextError(`audiotext ${resposta.status}: ${detalhe}`, resposta.status);
}

/**
 * Texto → voz. Devolve o arquivo tal como veio; quem grava é o storage. Junto,
 * os fonemas que a voz pretendia dizer, em IPA (`X-Phonemes-Ipa`), que a
 * verificação compara com o que o reconhecedor ouve no arquivo. `esticar` pede a
 * versão devagar de reserva: a síntese normal esticada (`server/tts/verificacao`).
 */
export async function sintetizar(
	text: string,
	voice: string,
	speed: number,
	opcoes: { esticar?: boolean } = {},
	timeoutMs = 60_000
): Promise<{
	audio: Uint8Array;
	contentType: string;
	fonemas?: string;
	esticada: boolean;
	linha?: LinhaDoTempo;
}> {
	const resposta = await fetch(`${baseUrl()}/v1/tts/speak`, {
		method: 'POST',
		headers: { ...authHeaders(), 'content-type': 'application/json' },
		// **MP3, não WAV.** Voz mono de 24 kHz comprime ~6x (medido: 222 kB → 35 kB
		// numa frase de 4,6 s), e o que se perde é inaudível na faixa da fala —
		// conferido pelo caminho mais duro que existe: o Whisper transcreve o MP3
		// palavra por palavra igual ao WAV. Cada questão de escuta são dois
		// arquivos, servidos a cada aluno que abre o link.
		body: JSON.stringify({
			text,
			voice,
			speed,
			format: 'mp3',
			...(opcoes.esticar ? { esticar: true } : {})
		}),
		signal: comPrazo(timeoutMs)
	});
	if (!resposta.ok) throw await erroDaResposta(resposta);

	// Percent-encoded no serviço: cabeçalho HTTP é latin-1, e IPA não é.
	const ipa = resposta.headers.get('x-phonemes-ipa');
	const linha = lerLinhaDoCabecalho(resposta.headers.get('x-phoneme-times'));
	return {
		audio: new Uint8Array(await resposta.arrayBuffer()),
		contentType: resposta.headers.get('content-type') ?? 'audio/mpeg',
		...(ipa ? { fonemas: decodeURIComponent(ipa) } : {}),
		esticada: resposta.headers.get('x-stretched') === '1',
		...(linha ? { linha } : {})
	};
}

/**
 * Onde cada som está no áudio (`X-Phoneme-Times`, JSON percent-encoded). O
 * serviço antigo não manda; fora do formato, também não há linha.
 */
function lerLinhaDoCabecalho(cabecalho: string | null): LinhaDoTempo | null {
	if (!cabecalho) return null;
	try {
		return lerLinha(JSON.parse(decodeURIComponent(cabecalho)));
	} catch {
		return null;
	}
}

/**
 * Voz → texto. `hints` são os termos que o modelo tenderia a escrever errado —
 * vêm de `LanguageProfile.asr.hints` e do próprio item.
 *
 * `language` é opcional mas quase sempre conhecido aqui, e informar melhora
 * muito: a detecção automática erra em áudio curto, e uma fala de um segundo
 * vira outro idioma com frequência.
 */
export async function transcrever(
	audio: Uint8Array,
	opcoes: { language?: string; hints?: string[]; contentType?: string } = {},
	timeoutMs = 60_000
): Promise<{ text: string; language: string }> {
	const form = new FormData();
	form.append(
		'file',
		new Blob([audio as BlobPart], { type: opcoes.contentType ?? 'audio/webm' }),
		'fala.webm'
	);
	if (opcoes.language) form.append('language', opcoes.language);
	if (opcoes.hints?.length) form.append('hints', opcoes.hints.join(','));

	const resposta = await fetch(`${baseUrl()}/v1/asr/transcribe`, {
		method: 'POST',
		headers: authHeaders(),
		body: form,
		signal: comPrazo(timeoutMs)
	});
	if (!resposta.ok) throw await erroDaResposta(resposta);

	const corpo = (await resposta.json()) as { text?: unknown; language?: unknown };
	return {
		text: typeof corpo.text === 'string' ? corpo.text : '',
		language: typeof corpo.language === 'string' ? corpo.language : ''
	};
}

const fonemasSchema = z.object({
	phonemes: z.array(
		z.object({
			symbol: z.string(),
			start: z.number().default(0),
			end: z.number().default(0),
			p: z.number(),
			alternatives: z.array(z.object({ symbol: z.string(), p: z.number() })).default([])
		})
	),
	duration: z.number().default(0)
});

/**
 * Os sons de um áudio SINTETIZADO, com o tempo de cada um e a duração do arquivo:
 * é o que a verificação da voz compara com o que ela pretendia dizer, e de onde
 * sai o trecho de cada sílaba da Pronúncia (`kernel/language/sintese.ts`).
 */
export async function ouvirComTempo(
	audio: Uint8Array,
	contentType: string,
	timeoutMs = 20_000
): Promise<{ sons: { s: string; inicio: number; fim: number }[]; duracao: number }> {
	const form = new FormData();
	form.append('file', new Blob([audio as BlobPart], { type: contentType }), 'sintese.mp3');
	const resposta = await fetch(`${baseUrl()}/v1/asr/phonemes`, {
		method: 'POST',
		headers: authHeaders(),
		body: form,
		signal: comPrazo(timeoutMs)
	});
	if (!resposta.ok) throw await erroDaResposta(resposta);
	const corpo = fonemasSchema.parse(await resposta.json());
	return {
		sons: corpo.phonemes.map((som) => ({ s: som.symbol, inicio: som.start, fim: som.end })),
		duracao: corpo.duration
	};
}

/**
 * Os SONS de uma gravação, fonema a fonema (`/v1/asr/phonemes`, o reconhecedor
 * de fonemas do serviço): o que corrige a questão de Pronúncia. Volta no
 * formato que a resposta do aluno guarda (`SomOuvido`, chaves curtas), e
 * recusa resposta fora do contrato — o serviço é outro processo, outro repositório.
 *
 * O prazo é curto: a inferência leva uns 0,2 s por palavra, e o aluno espera
 * o veredito com a questão aberta.
 */
export async function reconhecerFonemas(
	audio: Uint8Array,
	opcoes: { contentType?: string } = {},
	timeoutMs = 20_000
): Promise<{ s: string; p: number; alt?: { s: string; p: number }[] }[]> {
	const form = new FormData();
	form.append(
		'file',
		new Blob([audio as BlobPart], { type: opcoes.contentType ?? 'audio/webm' }),
		'fala.webm'
	);
	const resposta = await fetch(`${baseUrl()}/v1/asr/phonemes`, {
		method: 'POST',
		headers: authHeaders(),
		body: form,
		signal: comPrazo(timeoutMs)
	});
	if (!resposta.ok) throw await erroDaResposta(resposta);
	const corpo = fonemasSchema.parse(await resposta.json());
	return corpo.phonemes.map((som) => ({
		s: som.symbol,
		p: som.p,
		...(som.alternatives.length
			? { alt: som.alternatives.map((a) => ({ s: a.symbol, p: a.p })) }
			: {})
	}));
}

/**
 * O idioma em que o serviço SINTETIZA. É a lista do Kokoro-82M (nove), não a
 * do Whisper (~99) — e essa assimetria é o motivo de existir.
 */
export async function idiomasComVoz(timeoutMs = 10_000): Promise<string[]> {
	const resposta = await fetch(`${baseUrl()}/v1/info`, {
		headers: authHeaders(),
		signal: comPrazo(timeoutMs)
	});
	if (!resposta.ok) throw await erroDaResposta(resposta);
	const corpo = (await resposta.json()) as { languages?: { tts?: unknown } };
	const lista = corpo.languages?.tts;
	return Array.isArray(lista) ? lista.filter((x): x is string => typeof x === 'string') : [];
}

/** Quantos textos vão em cada pedido de tradução — o serviço aceita até 64. */
const TEXTOS_POR_PEDIDO = 32;

const respostaDaTraducao = z.object({
	translations: z.array(z.string()),
	// Só vem quando o pedido quis alternativas; um serviço anterior a elas não
	// manda o campo, e aí cada texto fica só com a principal.
	alternatives: z.array(z.array(z.string())).optional()
});

/**
 * Os lotes, em sequência: cada pedido devolve, por texto, a principal e as
 * alternativas que ele tiver (nenhuma, quando `alternativas` é 0).
 */
async function pedirTraducoes(
	textos: string[],
	de: string,
	para: string,
	alternativas: number,
	timeoutMs: number
): Promise<string[][]> {
	const saida: string[][] = [];
	for (let i = 0; i < textos.length; i += TEXTOS_POR_PEDIDO) {
		const lote = textos.slice(i, i + TEXTOS_POR_PEDIDO);
		const resposta = await fetch(`${baseUrl()}/v1/translate`, {
			method: 'POST',
			headers: { ...authHeaders(), 'content-type': 'application/json' },
			body: JSON.stringify({
				texts: lote,
				source: de,
				target: para,
				...(alternativas > 0 ? { alternatives: alternativas } : {})
			}),
			signal: comPrazo(timeoutMs)
		});
		if (!resposta.ok) throw await erroDaResposta(resposta);
		const corpo = respostaDaTraducao.safeParse(await resposta.json());
		// Contagem diferente da pedida não tem conserto do lado de cá: casar as
		// traduções pela posição daria a frase de uma linha para outra.
		const extras = corpo.success ? corpo.data.alternatives : undefined;
		if (
			!corpo.success ||
			corpo.data.translations.length !== lote.length ||
			(extras !== undefined && extras.length > 0 && extras.length !== lote.length)
		) {
			throw new AudiotextError('audiotext devolveu uma tradução fora do formato', 502);
		}
		corpo.data.translations.forEach((principal, n) => {
			saida.push([principal, ...(extras?.[n] ?? [])]);
		});
	}
	return saida;
}

/**
 * Texto → texto, em LOTE e na ordem do pedido. `de` e `para` são as tags
 * BCP-47 do `LanguageProfile` (`ja-JP`, `pt-BR`); o serviço corta no código
 * base sozinho.
 *
 * Lote porque é assim que o material chega — a lista da aula colada de uma vez
 * —, e vinte frases num pedido custam bem menos que vinte pedidos. Listas
 * maiores que o teto do serviço vão em pedidos seguidos, nunca em paralelo: o
 * tradutor atende um lote por vez, e mandar dois juntos só encheria a fila dele.
 */
export async function traduzir(
	textos: string[],
	de: string,
	para: string,
	timeoutMs = 90_000
): Promise<string[]> {
	const traducoes = await pedirTraducoes(textos, de, para, 0, timeoutMs);
	return traducoes.map(([principal]) => principal ?? '');
}

/**
 * Como `traduzir`, mas cada texto volta com as traduções ALTERNATIVAS que o
 * modelo considerou quase tão boas — a principal primeiro. É de onde saem as
 * variantes que uma questão de tradução também aceita (`server/atividades/
 * variantes-aceitas.ts`). `alternativas` vai de 1 a 4.
 */
export async function traduzirComAlternativas(
	textos: string[],
	de: string,
	para: string,
	alternativas: number,
	timeoutMs = 90_000
): Promise<string[][]> {
	return pedirTraducoes(textos, de, para, Math.min(4, Math.max(1, alternativas)), timeoutMs);
}
