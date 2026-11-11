import { MAXIMO_DE_FALA_S } from '$lib/billing/ia';

/**
 * O formato dos arquivos que a IA lê (docs/adr-003-ia-gemini.md "Imagem e vídeo"). Isomórfico e
 * puro: o NAVEGADOR monta o arquivo com isto (`$lib/client/arquivo-ia.ts`) e o SERVIDOR confere o
 * que chegou com isto (`routes/(studio)/materiais/ia/arquivo`). As duas pontas fazem a mesma conta.
 *
 * - **Imagem**: a foto é reduzida no navegador para no máximo `LADO_MAXIMO_DA_IMAGEM` no lado maior
 *   e recodificada em JPEG. Isso descarta os metadados da câmera (inclusive a localização) e põe a
 *   foto bem abaixo dos limites dos provedores. O tipo é decidido pelos BYTES, nunca pelo nome.
 * - **Vídeo**: o vídeo nunca sobe. O navegador extrai a FALA do trecho escolhido, em mono, a
 *   `TAXA_DA_FALA`, com 8 bits por amostra (WAV PCM). Dez minutos dão 9,6 MB, abaixo do
 *   `BODY_SIZE_LIMIT` de produção (10M, docs/deploy.md) e do teto de envio inline do Gemini. A
 *   duração que vale para os créditos é a que o SERVIDOR lê do cabeçalho, não a que a tela diz.
 */

/** O lado maior da foto, em pixels. Ainda lê com folga a letra de um livro fotografado inteiro. */
export const LADO_MAXIMO_DA_IMAGEM = 1568;
/** A amostragem da fala: guarda a faixa da voz inteira, até as sibilantes. */
export const TAXA_DA_FALA = 16_000;
/** Bytes do cabeçalho do WAV que `wavDaFala` escreve. */
const CABECALHO_WAV = 44;

/** O que o servidor aceita, com folga para o cabeçalho e para o arredondamento do trecho. */
export const LIMITE_DA_IMAGEM_BYTES = 5 * 1024 * 1024;
export const LIMITE_DO_AUDIO_BYTES = CABECALHO_WAV + TAXA_DA_FALA * (MAXIMO_DE_FALA_S + 2);

export type TipoDeImagem = 'image/jpeg' | 'image/png' | 'image/webp';

/** O tipo da imagem pelos primeiros bytes (a assinatura do formato). `null` se não for um dos três. */
export function tipoDaImagem(bytes: Uint8Array): TipoDeImagem | null {
	const b = (i: number) => bytes[i];
	if (bytes.length >= 3 && b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return 'image/jpeg';
	const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
	if (bytes.length >= 8 && png.every((v, i) => b(i) === v)) return 'image/png';
	if (bytes.length >= 12 && texto(bytes, 0, 4) === 'RIFF' && texto(bytes, 8, 4) === 'WEBP') {
		return 'image/webp';
	}
	return null;
}

export interface InfoDoWav {
	taxa: number;
	canais: number;
	bits: number;
	amostras: number;
	segundos: number;
}

/**
 * Lê o cabeçalho de um WAV PCM. `null` para qualquer coisa que não seja um WAV PCM bem formado:
 * compressão, ponto flutuante, tamanho que não fecha. Não decodifica o som, só confere a forma e
 * conta as amostras, que é de onde sai a duração.
 */
export function lerWav(bytes: Uint8Array): InfoDoWav | null {
	if (bytes.length < CABECALHO_WAV) return null;
	if (texto(bytes, 0, 4) !== 'RIFF' || texto(bytes, 8, 4) !== 'WAVE') return null;
	const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	let formato: {
		codigo: number;
		canais: number;
		taxa: number;
		alinhamento: number;
		bits: number;
	} | null = null;
	let pos = 12;
	while (pos + 8 <= bytes.length) {
		const id = texto(bytes, pos, 4);
		const tamanho = v.getUint32(pos + 4, true);
		const corpo = pos + 8;
		if (id === 'fmt ') {
			if (tamanho < 16 || corpo + 16 > bytes.length) return null;
			formato = {
				codigo: v.getUint16(corpo, true),
				canais: v.getUint16(corpo + 2, true),
				taxa: v.getUint32(corpo + 4, true),
				alinhamento: v.getUint16(corpo + 12, true),
				bits: v.getUint16(corpo + 14, true)
			};
		} else if (id === 'data') {
			if (!formato || formato.codigo !== 1) return null;
			const { canais, taxa, bits, alinhamento } = formato;
			if (canais < 1 || taxa < 1 || (bits !== 8 && bits !== 16)) return null;
			if (alinhamento !== canais * (bits / 8)) return null;
			// O tamanho declarado tem de caber no arquivo: um `data` que promete mais bytes do que
			// chegaram seria uma duração inventada, e é dela que sai a cobrança.
			if (corpo + tamanho > bytes.length) return null;
			const amostras = Math.floor(tamanho / alinhamento);
			return { taxa, canais, bits, amostras, segundos: amostras / taxa };
		}
		// Os blocos do RIFF são alinhados em 2 bytes: tamanho ímpar leva um byte de enchimento.
		pos = corpo + tamanho + (tamanho % 2);
	}
	return null;
}

/**
 * O WAV da fala: mono, `taxa` amostras por segundo, 8 bits sem sinal (128 é o silêncio). As amostras
 * chegam entre -1 e 1; o que passar disso é cortado.
 */
export function wavDaFala(amostras: Float32Array, taxa: number = TAXA_DA_FALA): Uint8Array {
	const saida = new Uint8Array(CABECALHO_WAV + amostras.length);
	const v = new DataView(saida.buffer);
	const escrever = (pos: number, s: string) => {
		for (let i = 0; i < s.length; i++) saida[pos + i] = s.charCodeAt(i);
	};
	escrever(0, 'RIFF');
	v.setUint32(4, 36 + amostras.length, true);
	escrever(8, 'WAVE');
	escrever(12, 'fmt ');
	v.setUint32(16, 16, true); // tamanho do bloco fmt
	v.setUint16(20, 1, true); // PCM
	v.setUint16(22, 1, true); // mono
	v.setUint32(24, taxa, true);
	v.setUint32(28, taxa, true); // bytes por segundo: 1 canal × 1 byte
	v.setUint16(32, 1, true); // alinhamento do quadro
	v.setUint16(34, 8, true); // bits por amostra
	escrever(36, 'data');
	v.setUint32(40, amostras.length, true);
	for (let i = 0; i < amostras.length; i++) {
		const s = Math.max(-1, Math.min(1, amostras[i]));
		saida[CABECALHO_WAV + i] = Math.max(0, Math.min(255, Math.round(s * 127) + 128));
	}
	return saida;
}

/**
 * Junta os canais num só e corta o trecho. `inicio` e `fim` em segundos; `fim` nulo vai até o fim.
 * Devolve uma cópia: os canais de entrada (o vídeo decodificado inteiro) ficam intactos para o
 * professor trocar o trecho sem decodificar de novo.
 */
export function falaDoTrecho(
	canais: readonly Float32Array[],
	taxa: number,
	inicio: number,
	fim: number | null
): Float32Array {
	const total = canais[0]?.length ?? 0;
	const de = Math.max(0, Math.min(total, Math.floor(inicio * taxa)));
	const ate = Math.max(de, Math.min(total, fim === null ? total : Math.floor(fim * taxa)));
	const mono = new Float32Array(ate - de);
	for (const canal of canais) {
		for (let i = 0; i < mono.length; i++) mono[i] += canal[de + i] / canais.length;
	}
	return mono;
}

/**
 * Muda a taxa de amostragem, com a média da janela de origem de cada amostra nova (um passa-baixa
 * simples): 48 kHz para 16 kHz sem a média dobraria o chiado agudo de volta para a faixa da voz. Só
 * é usada quando o navegador não decodifica direto na taxa pedida.
 */
export function reamostrar(amostras: Float32Array, de: number, para: number): Float32Array {
	if (de === para || amostras.length === 0) return amostras;
	const razao = de / para;
	const saida = new Float32Array(Math.max(1, Math.floor(amostras.length / razao)));
	for (let i = 0; i < saida.length; i++) {
		const inicio = i * razao;
		const fim = Math.min(amostras.length, (i + 1) * razao);
		let soma = 0;
		let n = 0;
		for (let j = Math.floor(inicio); j < Math.ceil(fim); j++) {
			soma += amostras[j];
			n++;
		}
		saida[i] = n ? soma / n : 0;
	}
	return saida;
}

/**
 * Leva o pico a `alvo`, com ganho limitado: com 8 bits por amostra, a fala baixa perderia detalhe
 * para o chiado da quantização, e a voz em volume cheio fica nítida. O teto do ganho impede que um
 * trecho quase mudo vire só ruído amplificado. Silêncio volta como veio.
 */
export function normalizarFala(
	amostras: Float32Array,
	alvo = 0.95,
	ganhoMaximo = 20
): Float32Array {
	let pico = 0;
	for (const s of amostras) pico = Math.max(pico, Math.abs(s));
	if (pico === 0) return amostras;
	const ganho = Math.min(ganhoMaximo, alvo / pico);
	return amostras.map((s) => s * ganho);
}

/** O pico do trecho: perto de zero, não há o que a IA escutar. */
export function picoDaFala(amostras: Float32Array): number {
	let pico = 0;
	for (const s of amostras) pico = Math.max(pico, Math.abs(s));
	return pico;
}

/**
 * Os segundos de um campo de trecho ("2:30", "02:30", "1:02:30" ou só "90"). `null` quando o campo
 * está em branco (o vídeo inteiro, ou até o fim) e `false` quando não dá para ler.
 */
export function segundosDoTrecho(entrada: string): number | null | false {
	const t = entrada.trim();
	if (!t) return null;
	if (!/^\d+(:\d{1,2}){0,2}$/.test(t)) return false;
	const partes = t.split(':').map(Number);
	if (partes.slice(1).some((p) => p >= 60)) return false;
	return partes.reduce((total, p) => total * 60 + p, 0);
}

/**
 * O que impede o trecho escolhido de ir para a IA, ou `null` quando ele serve. `inicio` e `fim` em
 * segundos (`fim` nulo vai até o fim do vídeo). É a frase que a tela mostra sob os campos.
 */
export function problemaDoTrecho(
	duracao: number,
	inicio: number,
	fim: number | null
): string | null {
	if (inicio >= duracao) return `O vídeo tem ${formatarDuracao(duracao)}: o início passa do fim.`;
	const ate = Math.min(fim ?? duracao, duracao);
	if (ate <= inicio) return 'O fim do trecho tem de vir depois do início.';
	if (ate - inicio > MAXIMO_DE_FALA_S + 0.5) {
		return `Escolha um trecho de até ${MAXIMO_DE_FALA_S / 60} minutos. Do jeito que está, são ${formatarDuracao(ate - inicio)}.`;
	}
	if (ate - inicio < 1) return 'O trecho tem menos de um segundo.';
	return null;
}

/** "2:30", "1:02:03": a duração como o professor escreve no campo do trecho. */
export function formatarDuracao(segundos: number): string {
	const s = Math.max(0, Math.round(segundos));
	const h = Math.floor(s / 3600);
	const m = Math.floor((s % 3600) / 60);
	const r = String(s % 60).padStart(2, '0');
	return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
}

function texto(bytes: Uint8Array, pos: number, n: number): string {
	return String.fromCharCode(...bytes.subarray(pos, pos + n));
}
