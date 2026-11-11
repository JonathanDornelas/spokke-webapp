import { createHash } from 'node:crypto';
import type { TtsProvider } from './provider';
import { stubTtsProvider } from './stub-provider';
import { audiotextTtsProvider } from './audiotext-provider';

/**
 * TTS é gerado na PUBLICAÇÃO, nunca em runtime — ver server.md "TTS". A
 * chave do objeto é `hash(texto, voz, velocidade)`, o que torna a geração
 * idempotente e o cache automático: o mesmo texto na mesma voz nunca é
 * sintetizado duas vezes, nem entre atividades diferentes.
 *
 * `process.env` (e não `$env/dynamic/private`) porque o worker importa este
 * módulo fora do runtime do SvelteKit — mesma razão de `db/client.ts`.
 */

export function ttsHash(text: string, voice: string, speed: number): string {
	return createHash('sha256').update(`${text}|${voice}|${speed}`).digest('hex');
}

/**
 * A chave leva o PROFESSOR, não o material nem a atividade.
 *
 * O hash já identifica o conteúdo (`texto|voz|velocidade`), então o prefixo não
 * precisa dizer de onde a frase veio — e não DEVE: material é facilitador de
 * montagem, e o professor pode apagar um sem que nada da atividade se mexa
 * (db.md "MediaAsset"). O que o prefixo dá é escopo de tenant: os arquivos de um
 * professor ficam todos sob a mesma pasta.
 *
 * O prefixo `tts/` importa: é o único com leitura anônima no bucket (ver
 * `docker/minio.yml`). Ele NÃO tem regra de ciclo de vida — o áudio de atividade
 * não vence; sai quando nenhuma atividade do professor o usa mais
 * (`limpeza.ts`).
 */
export function ttsObjectKey(teacherId: string, hash: string): string {
	return `tts/${teacherId}/${hash}.${TTS_EXTENSAO}`;
}

/**
 * A extensão dos arquivos de TTS. É `mp3` porque voz comprime muito bem e o
 * áudio é servido a cada aluno que abre o link — ver `audiotext/client.ts`.
 * Fica aqui, e não espalhada, porque a chave do objeto e o provedor têm de
 * concordar: divergindo, o worker grava num endereço e o Player procura noutro.
 */
export const TTS_EXTENSAO = 'mp3';

/**
 * Quantos dias a GRAVAÇÃO DO ALUNO vive no bucket. É o único prazo que sobrou:
 * o áudio de atividade deixou de vencer (é conteúdo do professor, dentro do
 * estoque do plano), mas a voz de uma pessoa fica o mínimo que ainda serve para
 * o professor dar retorno. Espelha a regra do MinIO — as duas precisam bater.
 */
export const FALA_DIAS_DE_VIDA = 7;

export function falaExpiraEm(from = new Date()): Date {
	return new Date(from.getTime() + FALA_DIAS_DE_VIDA * 24 * 60 * 60 * 1000);
}

/**
 * Onde a gravação de um aluno fica. O prefixo `fala/` é o que a regra de ciclo
 * de vida de 7 dias enxerga, e é o que NÃO tem leitura anônima no bucket.
 *
 * A chave leva a tentativa e o item, não um hash: duas gravações da mesma frase
 * por alunos diferentes são coisas diferentes, e o que se quer achar depois é
 * "a resposta daquele aluno naquela questão".
 */
export function falaObjectKey(attemptId: string, itemId: string, extensao: string): string {
	return `fala/${attemptId}/${itemId}.${extensao}`;
}

/**
 * Sem provedor configurado o servidor não gera item de escuta — mesma regra
 * que o ASR já segue (server.md). O provedor real ainda é uma pendência de
 * produto: `TTS_PROVIDER=stub` existe só para exercitar o pipeline em dev.
 */
export function isTtsConfigured(): boolean {
	return !!process.env.TTS_PROVIDER;
}

export function getTtsProvider(): TtsProvider {
	const name = process.env.TTS_PROVIDER;
	if (name === 'audiotext') return audiotextTtsProvider;
	if (name === 'stub') return stubTtsProvider;
	throw new Error(
		`TTS_PROVIDER="${name ?? ''}" não é um provedor conhecido. Use "audiotext" (o serviço de áudio) ou "stub" (WAV silencioso, só para exercitar a fila em dev).`
	);
}
