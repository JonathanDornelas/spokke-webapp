import { prisma } from '$lib/server/db/client';
import { enqueueTts } from '$lib/server/queue';
import { playerRepo } from '$lib/server/db/repos/player';
import { audiosDoItem, type StoredItemRow } from '$lib/server/player/runtime';

/**
 * Enfileira o áudio que FALTA para um conjunto de itens.
 *
 * Chamado de quatro lugares, e cada um por um motivo:
 *
 * - `gerarItens` — o texto do áudio passa a existir ali. É o começo da síntese,
 *   e o que faz a espera acontecer enquanto o professor revisa.
 * - o `load` da etapa 4 — repõe o que mudou depois de gerar (frase editada =
 *   texto novo = hash novo).
 * - `enviarParaTurmas` — não manda link que não abre.
 * - a entrada do Player — a rede de segurança. O áudio de atividade não vence
 *   mais, mas um job pode ter falhado ou um arquivo ter sido regerado pela
 *   metade; sem reposição o link ficaria travado em "gerando áudio" para sempre.
 *
 * Idempotente por duas vias: pula o que tem `MediaAsset` e pula o que já está
 * na fila. A segunda importa porque a entrada do Player é pública — trinta
 * alunos abrindo o mesmo link ao mesmo tempo não podem virar trinta jobs
 * iguais.
 *
 * Devolve quantos jobs entraram.
 */
export async function enfileirarAudioFaltante(params: {
	teacherId: string;
	/** A tag do idioma ALVO da atividade: é dela que saem as vozes e as velocidades. */
	targetTag: string;
	items: StoredItemRow[];
}): Promise<number> {
	const { teacherId, targetTag, items } = params;

	// A chave é só o HASH, porque o áudio é identificado pelo conteúdo (db.md):
	// a mesma frase em dois materiais, ou em duas atividades, é UM arquivo — e
	// a mesma fala na mesma voz, em dois diálogos, também. `audiosDoItem` já
	// deixa de fora o idioma sem voz no provedor: um item antigo que escapou não
	// pode virar um job que falha para sempre e trava a publicação.
	const pendentes = new Map<
		string,
		{ text: string; voice: string; speed: number; pronuncia: boolean }
	>();
	for (const item of items) {
		for (const audio of audiosDoItem(item, targetTag)) {
			for (const { hash, velocidade } of audio.arquivos) {
				pendentes.set(hash, {
					text: audio.texto,
					voice: audio.voz,
					speed: velocidade,
					pronuncia: !!audio.sonsDosFonemas
				});
			}
		}
	}
	if (pendentes.size === 0) return 0;

	const hashes = [...pendentes.keys()];
	const qualidade = await playerRepo.qualidadeDosAudios(teacherId, hashes);
	const naFila = await audiosNaFila(teacherId, hashes);

	let enfileirados = 0;
	for (const [hash, pedido] of pendentes) {
		if (naFila.has(hash)) continue;
		// O que já existe só volta à fila se é de ANTES da conferência
		// (`qualidade` nula) e é onde ela importa: a versão devagar, que podia ter
		// nascido com um som a mais, e a palavra da Pronúncia, que ganha a linha do
		// tempo de cada som. Refeito uma vez, na mesma chave: o arquivo antigo segue no ar
		// até o novo chegar, e o link nunca fica sem áudio.
		const existe = qualidade.has(hash);
		const refazer =
			existe && qualidade.get(hash) === null && (pedido.speed < 1 || pedido.pronuncia);
		if (existe && !refazer) continue;
		await enqueueTts({
			hash,
			teacherId,
			text: pedido.text,
			voice: pedido.voice,
			speed: pedido.speed,
			...(refazer ? { refazer: true } : {})
		});
		enfileirados += 1;
	}
	return enfileirados;
}

/**
 * O que já está esperando o worker. `processing` entra junto: um job travado
 * com o `lockedUntil` ainda vivo vai ser retomado, não perdido.
 *
 * Lê a fila de TTS pendente e casa em memória, em vez de filtrar pelo JSON no
 * banco: o filtro por `payload` só compara um valor por vez, e aqui os hashes
 * são vários. A fila é curta por natureza — o worker a consome continuamente —,
 * então o que se lê aqui é o que ainda não foi sintetizado, não um histórico.
 */
async function audiosNaFila(teacherId: string, hashes: string[]): Promise<Set<string>> {
	const jobs = await prisma.job.findMany({
		where: { type: 'tts', status: { in: ['pending', 'processing'] } },
		select: { payload: true }
	});

	const pedidos = new Set(hashes);
	const naFila = new Set<string>();
	for (const job of jobs) {
		const payload = job.payload;
		if (!payload || typeof payload !== 'object' || Array.isArray(payload)) continue;
		const dados = payload as Record<string, unknown>;
		if (dados.teacherId !== teacherId) continue;
		if (typeof dados.hash === 'string' && pedidos.has(dados.hash)) naFila.add(dados.hash);
	}
	return naFila;
}
