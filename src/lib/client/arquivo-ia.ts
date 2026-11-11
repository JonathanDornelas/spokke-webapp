import { resolve } from '$app/paths';
import type { RespostaDaGeracao } from '$lib/billing/ia';
import {
	falaDoTrecho,
	LADO_MAXIMO_DA_IMAGEM,
	normalizarFala,
	picoDaFala,
	problemaDoTrecho,
	reamostrar,
	TAXA_DA_FALA,
	wavDaFala
} from '$lib/ia/arquivo';
import type { ContentUnitKind } from '$lib/kernel/content/types';

/**
 * O lado do NAVEGADOR de "Gerar com IA" a partir de um arquivo (docs/adr-003-ia-gemini.md
 * "Imagem e vídeo"). O formato e as contas puras moram em `$lib/ia/arquivo.ts`, que o servidor
 * também usa; aqui fica só o que precisa do navegador: decodificar a foto e o vídeo, e enviar.
 *
 * **O vídeo nunca sobe.** Um vídeo de dez minutos de celular passa de 500 MB; a fala dele, mono, a
 * 16 kHz e 8 bits, tem 9,6 MB. O professor escolhe o trecho e só ele vai.
 */

/** Um vídeo maior que isto nem é aberto: o navegador teria de carregar o arquivo inteiro na memória. */
const LIMITE_DO_VIDEO_BYTES = 1024 * 1024 * 1024;

/**
 * A foto pronta para enviar: no máximo `LADO_MAXIMO_DA_IMAGEM` no lado maior, em JPEG, na orientação
 * em que foi tirada. Recodificar descarta os metadados da câmera, inclusive a localização.
 */
export async function prepararImagem(arquivo: File): Promise<Blob> {
	let bitmap: ImageBitmap;
	try {
		bitmap = await createImageBitmap(arquivo, { imageOrientation: 'from-image' });
	} catch {
		throw new Error(
			'Não deu para abrir esta imagem neste navegador. Tente uma foto em JPEG ou PNG.'
		);
	}
	const escala = Math.min(1, LADO_MAXIMO_DA_IMAGEM / Math.max(bitmap.width, bitmap.height));
	const largura = Math.max(1, Math.round(bitmap.width * escala));
	const altura = Math.max(1, Math.round(bitmap.height * escala));
	const tela = document.createElement('canvas');
	tela.width = largura;
	tela.height = altura;
	const ctx = tela.getContext('2d');
	if (!ctx) throw new Error('Não deu para preparar a imagem neste navegador.');
	// Fundo branco: PNG com transparência viraria preto no JPEG.
	ctx.fillStyle = '#ffffff';
	ctx.fillRect(0, 0, largura, altura);
	ctx.drawImage(bitmap, 0, 0, largura, altura);
	bitmap.close();
	const blob = await new Promise<Blob | null>((pronto) => tela.toBlob(pronto, 'image/jpeg', 0.85));
	if (!blob) throw new Error('Não deu para preparar a imagem neste navegador.');
	return blob;
}

/** A fala de um vídeo já decodificada: mono, a `TAXA_DA_FALA`, com a duração em segundos. */
export interface FalaDecodificada {
	mono: Float32Array;
	duracao: number;
}

/**
 * Decodifica o áudio do vídeo UMA vez, já na taxa da fala e num canal só. O professor troca o
 * trecho depois sem decodificar de novo (`falaParaEnviar`).
 */
export async function decodificarFala(arquivo: File): Promise<FalaDecodificada> {
	if (arquivo.size > LIMITE_DO_VIDEO_BYTES) {
		throw new Error(
			'O arquivo passa de 1 GB. Exporte o vídeo em resolução menor, ou só o trecho que vai usar.'
		);
	}
	const ctx = contextoParaDecodificar();
	if (!ctx) {
		throw new Error(
			'Este navegador não lê o áudio de vídeos. Abra a página no Chrome, no Edge, no Firefox ou no Safari.'
		);
	}
	let audio: AudioBuffer;
	try {
		audio = await decodificar(ctx, await arquivo.arrayBuffer());
	} catch {
		throw new Error(
			'Não deu para ler o áudio deste arquivo neste navegador. Tente um vídeo .mp4, ou abra a página em outro navegador.'
		);
	} finally {
		// O `AudioContext` de reserva segura o dispositivo de som até ser fechado; o offline, não.
		if (typeof AudioContext !== 'undefined' && ctx instanceof AudioContext) void ctx.close();
	}
	const canais = Array.from({ length: audio.numberOfChannels }, (_, i) => audio.getChannelData(i));
	// Quase sempre o navegador já devolve a 16 kHz; quando não (o `AudioContext` de reserva pode
	// ignorar a taxa pedida), a reamostragem acerta, porque o WAV declara `TAXA_DA_FALA`.
	const mono = reamostrar(
		falaDoTrecho(canais, audio.sampleRate, 0, null),
		audio.sampleRate,
		TAXA_DA_FALA
	);
	return { mono, duracao: mono.length / TAXA_DA_FALA };
}

type ConstrutorOffline = typeof OfflineAudioContext;

/**
 * O contexto que decodifica, já pedindo a taxa da fala. O offline é o certo (não toca nada e
 * reamostra ao decodificar); o prefixado e o `AudioContext` são a reserva de navegador mais antigo.
 * `null` quando o navegador não tem Web Audio nenhum.
 */
function contextoParaDecodificar(): BaseAudioContext | null {
	const global = globalThis as typeof globalThis & {
		webkitOfflineAudioContext?: ConstrutorOffline;
	};
	const Offline = global.OfflineAudioContext ?? global.webkitOfflineAudioContext;
	if (Offline) {
		try {
			return new Offline({ numberOfChannels: 1, length: 1, sampleRate: TAXA_DA_FALA });
		} catch {
			try {
				return new Offline(1, 1, TAXA_DA_FALA);
			} catch {
				// segue para o AudioContext
			}
		}
	}
	if (typeof AudioContext !== 'undefined') {
		try {
			return new AudioContext({ sampleRate: TAXA_DA_FALA });
		} catch {
			return new AudioContext();
		}
	}
	return null;
}

/** `decodeAudioData` nas duas formas: a de promessa e a de callback dos navegadores antigos. */
function decodificar(ctx: BaseAudioContext, dados: ArrayBuffer): Promise<AudioBuffer> {
	return new Promise((pronto, falhou) => {
		const promessa = ctx.decodeAudioData(dados, pronto, falhou) as Promise<AudioBuffer> | undefined;
		promessa?.then(pronto, falhou);
	});
}

/**
 * O WAV do trecho escolhido, pronto para enviar, ou o motivo de não dar. `inicio` e `fim` em
 * segundos; `fim` nulo vai até o fim do vídeo.
 */
export function falaParaEnviar(
	fala: FalaDecodificada,
	inicio: number,
	fim: number | null
): { blob: Blob; segundos: number } | { erro: string } {
	const problema = problemaDoTrecho(fala.duracao, inicio, fim);
	if (problema) return { erro: problema };
	const trecho = falaDoTrecho([fala.mono], TAXA_DA_FALA, inicio, fim);
	if (trecho.length < TAXA_DA_FALA) return { erro: 'O trecho tem menos de um segundo.' };
	if (picoDaFala(trecho) < 0.01) return { erro: 'Não há som neste trecho do vídeo.' };
	const wav = wavDaFala(normalizarFala(trecho));
	return {
		blob: new Blob([wav.buffer as ArrayBuffer], { type: 'audio/wav' }),
		segundos: trecho.length / TAXA_DA_FALA
	};
}

/**
 * Pede as propostas com o arquivo junto. Vai por `POST /materiais/ia/arquivo`, e não por remote
 * function, porque remote function fala JSON (e o arquivo em base64 incharia 33%).
 */
export async function gerarComArquivo(pedido: {
	requestId: string;
	kind: ContentUnitKind;
	fonte: 'imagem' | 'video';
	quantos: 5 | 10 | 20;
	pedido: string;
	arquivo: Blob;
	activityId?: string;
	sourceLang?: string;
	targetLang?: string;
}): Promise<RespostaDaGeracao> {
	const corpo = new FormData();
	corpo.set('requestId', pedido.requestId);
	corpo.set('kind', pedido.kind);
	corpo.set('fonte', pedido.fonte);
	corpo.set('quantos', String(pedido.quantos));
	corpo.set('pedido', pedido.pedido);
	if (pedido.activityId) corpo.set('activityId', pedido.activityId);
	if (pedido.sourceLang) corpo.set('sourceLang', pedido.sourceLang);
	if (pedido.targetLang) corpo.set('targetLang', pedido.targetLang);
	corpo.set('arquivo', pedido.arquivo, pedido.fonte === 'imagem' ? 'foto.jpg' : 'fala.wav');

	let resposta: Response;
	try {
		resposta = await fetch(resolve('/(studio)/materiais/ia/arquivo'), {
			method: 'POST',
			body: corpo
		});
	} catch {
		return { ok: false, error: 'A conexão caiu no envio. Tente de novo.' };
	}
	if (resposta.status === 413) {
		return {
			ok: false,
			error: 'O arquivo ficou grande demais para enviar. Escolha um trecho menor.'
		};
	}
	if (resposta.status === 401) {
		return { ok: false, error: 'Sua sessão terminou. Entre de novo para gerar.' };
	}
	if (!resposta.ok)
		return { ok: false, error: 'Não deu para gerar agora. Tente de novo em instantes.' };
	const r = (await resposta.json()) as RespostaDaGeracao & { saldo?: number };
	return r.ok ? { ok: true, propostas: r.propostas, saldo: r.saldo } : r;
}
