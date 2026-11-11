import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	corrigirNoExemplo,
	transcreverNoExemplo,
	type TranscricaoDoExemplo
} from '$lib/server/exemplo';
import { criarLimite } from '$lib/server/limite-por-ip';

/**
 * A questão de FALA da atividade de exemplo. O mesmo desenho de
 * `a/[slug]/fala`: o browser manda som, o servidor transcreve e corrige
 * (regra inviolável nº 2), e `modo=ouvir` devolve só o que foi entendido, para
 * o visitante decidir entre enviar e gravar de novo.
 *
 * **O que muda é quem paga.** Lá a chamada de ASR é autorizada por uma
 * tentativa de uma atividade publicada; aqui qualquer visitante da home pode
 * gravar. Por isso dois tetos a mais: poucas transcrições por IP, e uma
 * gravação pequena (dez segundos de opus têm ~40 kB; 2 MB cobre o mp4 do
 * Safari com folga). O serviço de áudio tem a própria fila com teto
 * (`audiotext-service/app/fila.py`) — passando dele, o 503 vira a mensagem de
 * pular a questão.
 *
 * A gravação não é guardada: o exemplo não pede consentimento e não tem
 * professor para ouvi-la.
 */
const MAX_BYTES = 2 * 1024 * 1024;
const limite = criarLimite({ maximo: 20, janelaMs: 10 * 60 * 1000 });

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	const quem = getClientAddress();
	const form = await request.formData();
	const itemId = form.get('itemId');
	const arquivo = form.get('audio');
	const somenteOuvir = form.get('modo') === 'ouvir';

	if (typeof itemId !== 'string') error(400, 'itemId é obrigatório');
	if (!(arquivo instanceof File) || arquivo.size === 0) error(400, 'nenhum áudio recebido');
	if (arquivo.size > MAX_BYTES) error(413, 'gravação longa demais');

	const bytes = new Uint8Array(await arquivo.arrayBuffer());

	let transcricao: TranscricaoDoExemplo;
	try {
		// O limite conta só a transcrição que vai acontecer de verdade: o
		// "Verificar" depois do "ouvir" reaproveita o texto e não paga de novo.
		transcricao = await transcreverNoExemplo(
			itemId,
			bytes,
			arquivo.type || 'audio/webm',
			quem,
			() => limite.permitir(quem)
		);
	} catch (erro) {
		console.error('[exemplo/fala] transcrição falhou', erro);
		error(503, 'Não conseguimos ouvir sua gravação agora. Pule esta questão e siga em frente.');
	}
	if (!transcricao.ok && transcricao.motivo === 'limite') {
		error(429, 'Muitas gravações em pouco tempo. Espere alguns minutos e tente de novo.');
	}
	if (!transcricao.ok) error(404, 'esta questão não é de fala');
	const transcript = transcricao.texto;

	if (somenteOuvir) return json({ transcript });

	const correcao = await corrigirNoExemplo(itemId, { transcript });
	if (!correcao.ok) error(400, correcao.erro);
	return json({ ...correcao.veredito, transcript });
};
