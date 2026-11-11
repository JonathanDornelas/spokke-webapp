import 'dotenv/config';
import { prisma } from '../src/lib/server/db/client.ts';
import {
	avisoEquipeJobSchema,
	conviteContaJobSchema,
	conviteEscolaJobSchema,
	conviteJobSchema,
	envioProgramadoJobSchema,
	intranetJobSchema,
	mercadoPagoJobSchema,
	redefinirSenhaJobSchema,
	ttsJobSchema
} from '../src/lib/server/queue/index.ts';
import { getEmailProvider } from '../src/lib/server/email/index.ts';
import { montarConviteAluno } from '../src/lib/server/email/convite-aluno.ts';
import { montarAvisoEquipe } from '../src/lib/server/email/aviso-equipe.ts';
import { montarConviteEscola } from '../src/lib/server/email/convite-escola.ts';
import { montarConviteConta } from '../src/lib/server/email/convite-conta.ts';
import {
	conviteAindaVale,
	conviteDeContaParaEnviar,
	marcarConviteDeContaEnviado
} from '../src/lib/server/db/repos/convites-de-conta.ts';
import { montarRedefinirSenha } from '../src/lib/server/email/redefinir-senha.ts';
import { getTtsProvider, ttsObjectKey } from '../src/lib/server/tts/index.ts';
import { putObject } from '../src/lib/server/storage/index.ts';
import { avisarAudioQueFalhou } from '../src/lib/server/tts/falha.ts';
import { processarNotificacao } from '../src/lib/server/billing/mercadopago/sincronizar.ts';
import {
	avisarTrocaQueFalhou,
	processarTroca
} from '../src/lib/server/billing/mercadopago/troca.ts';
import {
	concederSemVencimento,
	encerrarSemVencimento
} from '../src/lib/server/billing/assinaturas.ts';
import { origemDoWorker, processarEnviosDevidos } from '../src/lib/server/modulos/programacao.ts';
import { relatosRepo } from '../src/lib/server/db/repos/relatos.ts';
import { purgarRelatosVencidos } from '../src/lib/server/relatos/retencao.ts';

// Fila em tabela Postgres, sem Redis — ver .claude/rules/server.md "Fila". O
// `SELECT ... FOR UPDATE SKIP LOCKED` é a primitiva de exclusão mútua entre
// workers concorrentes; recupera também jobs travados em `processing` cujo
// `lockedUntil` já passou (worker anterior que caiu no meio do processamento).
/** Quanto se espera quando a fila está VAZIA. Com trabalho, não se espera nada. */
const POLL_INTERVAL_MS = 2000;
const LOCK_DURATION_MS = 60_000;
const MAX_ATTEMPTS = 5;

/**
 * Quantos jobs correm ao mesmo tempo.
 *
 * **Para TTS isto não acelera nada, e foi medido.** Dez áudios levaram 34,0 s
 * com concorrência 1, 35,4 s com 3 e 36,9 s com 6. O serviço de áudio é
 * CPU-bound nos 2 vCPU dele: duas sínteses em paralelo levam o dobro do tempo
 * de uma (1,0 s → 2,0 s), quatro levam o quádruplo. Não há vaga ociosa para
 * preencher — o modelo já usa os núcleos que existem.
 *
 * O que existe aqui é para os jobs de `convite`: enviar e-mail é espera de
 * REDE, e trinta convites em série são trinta idas e voltas somadas. Três é
 * conservador de propósito, e o teto de verdade do TTS continua sendo a
 * máquina do serviço de áudio, não este número.
 */
const CONCORRENCIA = Math.max(1, Number(process.env.WORKER_CONCURRENCY ?? 3));

interface ClaimedJob {
	id: string;
	type: string;
	payload: unknown;
	attempts: number;
}

async function claimNextJob(): Promise<ClaimedJob | null> {
	return prisma.$transaction(async (tx) => {
		// Identificadores entre aspas duplas: sem elas, o Postgres dobra tudo para
		// minúsculo e "runAfter"/"lockedUntil" deixam de bater com as colunas reais
		// (o Prisma sempre cria as tabelas com o case exato entre aspas).
		const [job] = await tx.$queryRaw<ClaimedJob[]>`
			SELECT id, type, payload, attempts
			FROM "Job"
			WHERE (status = 'pending' AND "runAfter" <= NOW())
			   OR (status = 'processing' AND "lockedUntil" <= NOW())
			ORDER BY "runAfter" ASC
			LIMIT 1
			FOR UPDATE SKIP LOCKED
		`;
		if (!job) return null;

		await tx.job.update({
			where: { id: job.id },
			data: { status: 'processing', lockedUntil: new Date(Date.now() + LOCK_DURATION_MS) }
		});

		return job;
	});
}

/**
 * Sintetiza uma fala e guarda no storage. Idempotente pela chave: ela é
 * `tts/<teacherId>/<hash>`, então rodar o mesmo job duas vezes reescreve o
 * mesmo arquivo e atualiza a mesma linha.
 *
 * O áudio de atividade não vence (`server/tts/limpeza.ts`): linha existente é
 * áudio pronto, e o job termina sem sintetizar. Quem quer o arquivo de novo
 * ("Gerar áudio de novo") apaga a linha antes de enfileirar.
 */
async function processTts(payload: unknown): Promise<void> {
	const job = ttsJobSchema.parse(payload);

	const chave = { teacherId_hash: { teacherId: job.teacherId, hash: job.hash } };

	const existente = await prisma.mediaAsset.findUnique({ where: chave });
	if (existente) return;

	const { audio, contentType } = await getTtsProvider().synthesize(job.text, job.voice, job.speed);
	const url = await putObject(ttsObjectKey(job.teacherId, job.hash), audio, contentType);

	await prisma.mediaAsset.upsert({
		where: chave,
		// `upsert` e não `create`: dois jobs do mesmo hash podem chegar juntos (o
		// professor regerou enquanto a fila andava), e o segundo só reescreve a URL.
		update: { url },
		create: { hash: job.hash, url, kind: 'audio', teacherId: job.teacherId }
	});
}

/**
 * Manda o convite e marca o convite como enviado. Idempotente pelo
 * `sentAt`: reprocessar não manda de novo, porque o segundo e-mail idêntico
 * na caixa do aluno é pior do que não reprocessar.
 */
async function processConvite(payload: unknown): Promise<void> {
	const job = conviteJobSchema.parse(payload);

	const convite = await prisma.invite.findUnique({ where: { id: job.inviteId } });
	if (!convite || convite.sentAt) return;

	const email = montarConviteAluno(job);
	await getEmailProvider().send({ ...email, to: job.to });

	await prisma.invite.update({ where: { id: job.inviteId }, data: { sentAt: new Date() } });
}

/**
 * O convite de escola. Idempotente por `sentAt`, e não manda convite que já foi
 * aceito, revogado (apagado) ou vencido — chegaria um link que não abre.
 */
async function processConviteEscola(payload: unknown): Promise<void> {
	const job = conviteEscolaJobSchema.parse(payload);
	const convite = await prisma.schoolInvite.findUnique({ where: { id: job.inviteId } });
	if (!convite || convite.sentAt || convite.acceptedAt || convite.expiresAt <= new Date()) return;

	await getEmailProvider().send({ ...montarConviteEscola(job), to: job.to });
	await prisma.schoolInvite.update({ where: { id: job.inviteId }, data: { sentAt: new Date() } });
}

/**
 * O convite de CONTA do aluno da chamada. A ficha é lida AGORA, não no pedido:
 * quem já criou a conta, o link que foi trocado por outro e o e-mail que saiu
 * do cadastro não recebem nada (`conviteAindaVale`). Idempotente por
 * `pedidoEm` contra `accountInviteSentAt`.
 */
async function processConviteConta(payload: unknown): Promise<void> {
	const job = conviteContaJobSchema.parse(payload);
	const ficha = await conviteDeContaParaEnviar(job.studentId);
	if (!conviteAindaVale(ficha, job)) return;

	const email = montarConviteConta({
		studentName: ficha.name,
		teacherName: job.teacherName,
		classroomName: ficha.classroom.name,
		link: job.link
	});
	await getEmailProvider().send({ ...email, to: ficha.email });
	await marcarConviteDeContaEnviado(job.studentId, job.token);
}

/**
 * O envio programado de um módulo (docs/telas-modulos-professor.md 2.4). O job
 * só diz QUAL alocação acordar; o que sai é decidido pelo banco na hora, então
 * um job de uma data que mudou acorda, não acha nada devido, e termina.
 */
async function processEnvioProgramado(payload: unknown): Promise<void> {
	const job = envioProgramadoJobSchema.parse(payload);
	await processarEnviosDevidos(job.allocationId, origemDoWorker());
}

/**
 * O aviso para a equipe. Sem `CONTATO_PARA` ele vai para o log — o mesmo
 * comportamento de e-mail sem provedor —, porque o pedido já está gravado no
 * banco e o painel o mostra de qualquer jeito. Não é idempotente por marca (não
 * há linha de envio): repetir manda de novo, e um aviso duplicado para a
 * equipe é inofensivo.
 */
async function processAvisoEquipe(payload: unknown): Promise<void> {
	const job = avisoEquipeJobSchema.parse(payload);
	const para = process.env.CONTATO_PARA;
	const email = montarAvisoEquipe(job);
	if (!para) {
		console.info(
			`[aviso-equipe] CONTATO_PARA vazio — "${job.assunto}"\n${job.texto.replace(/^/gm, '  ')}`
		);
		return;
	}
	await getEmailProvider().send({ ...email, to: para, replyTo: job.replyTo });
}

/**
 * O link de redefinir senha. Link vencido na fila não sai: chegaria dizendo
 * "vale por 1 hora" e abriria em "link expirado". Rodar duas vezes manda o
 * mesmo link duas vezes — inofensivo, e melhor que não mandar nenhum.
 */
async function processRedefinirSenha(payload: unknown): Promise<void> {
	const job = redefinirSenhaJobSchema.parse(payload);
	if (new Date(job.expiraEm) <= new Date()) return;
	await getEmailProvider().send({ ...montarRedefinirSenha(job), to: job.to });
}

/**
 * A notificação do Mercado Pago: busca o recurso na API e aplica (`sincronizar.ts`).
 * Idempotente — aplicar o mesmo estado duas vezes não muda nada, e a fatura
 * aprovada estende o período uma vez só (`ProviderEvent`).
 */
async function processMercadoPago(payload: unknown): Promise<void> {
	const job = mercadoPagoJobSchema.parse(payload);
	const desfecho = await processarNotificacao(job);
	console.info(`[mercadopago] ${job.topico} ${job.id}: ${desfecho}`);
}

/**
 * A troca de plano (`troca.ts`): cancela lá as assinaturas que a nova substituiu
 * e devolve a parte não usada delas, depois de o plano novo estar pago.
 */
async function processTrocaMercadoPago(payload: unknown): Promise<void> {
	const d = await processarTroca(payload);
	console.info(
		`[mercadopago] troca: ${d.canceladas} cancelada(s), ${d.devolvidas} devolução(ões)` +
			(d.aguardando ? ', esperando o primeiro pagamento da nova' : '')
	);
}

/**
 * Uma ação pedida pela intranet. O worker aplica pelo `assinaturas.ts` (o único
 * escritor da cobrança), com o e-mail de quem pediu no histórico. Encerrar só
 * vale para plano sem vencimento: se a conta não está assim, o job FALHA com o
 * motivo, e a intranet mostra.
 */
async function processIntranet(payload: unknown): Promise<void> {
	const job = intranetJobSchema.parse(payload);
	const ator = `admin:intranet:${job.admin}` as const;
	if (job.acao === 'marcar-relato') {
		const achou = await relatosRepo.marcar(job.relatoId, job.status, ator);
		if (!achou) throw new Error('O relato não existe mais (venceu ou a tentativa foi apagada).');
		console.info(`[intranet] relato ${job.relatoId} marcado como ${job.status}`);
		return;
	}
	if (job.acao === 'plano-sem-vencimento') {
		const mudou = await concederSemVencimento(job.teacherId, job.plano, ator, {
			motivo: job.motivo
		});
		console.info(
			`[intranet] plano ${job.plano} sem vencimento para ${job.teacherId}: ${mudou ? 'concedido' : 'já tinha'}`
		);
		return;
	}
	const encerrou = await encerrarSemVencimento(job.teacherId, ator, { motivo: job.motivo });
	if (!encerrou) throw new Error('A conta não tem plano sem vencimento para encerrar.');
	console.info(`[intranet] plano sem vencimento encerrado para ${job.teacherId}`);
}

async function processJob(job: ClaimedJob): Promise<void> {
	// Todo handler precisa ser idempotente: o mesmo job pode rodar mais de uma
	// vez se o worker cair entre concluir o trabalho e marcar `done`.
	switch (job.type) {
		case 'tts':
			return processTts(job.payload);
		case 'convite':
			return processConvite(job.payload);
		case 'convite-escola':
			return processConviteEscola(job.payload);
		case 'convite-conta':
			return processConviteConta(job.payload);
		case 'aviso-equipe':
			return processAvisoEquipe(job.payload);
		case 'redefinir-senha':
			return processRedefinirSenha(job.payload);
		case 'envio-programado':
			return processEnvioProgramado(job.payload);
		case 'mercadopago':
			return processMercadoPago(job.payload);
		case 'mercadopago-troca':
			return processTrocaMercadoPago(job.payload);
		case 'intranet':
			return processIntranet(job.payload);
		default:
			throw new Error(`Nenhum handler registrado para o tipo de job "${job.type}"`);
	}
}

/** Processa um job e resolve o desfecho dele. Nunca rejeita. */
async function executar(job: ClaimedJob): Promise<void> {
	try {
		await processJob(job);
		await prisma.job.update({ where: { id: job.id }, data: { status: 'done' } });
	} catch (err) {
		const attempts = job.attempts + 1;
		const exhausted = attempts >= MAX_ATTEMPTS;

		await prisma.job.update({
			where: { id: job.id },
			data: {
				status: exhausted ? 'failed' : 'pending',
				attempts,
				lastError: err instanceof Error ? err.message : String(err),
				runAfter: exhausted ? undefined : new Date(Date.now() + 2 ** attempts * 1000)
			}
		});
		// O áudio que a fila não conseguiu gerar trava o link da atividade: o
		// professor precisa saber sem esperar a turma reclamar (docs/notificacoes.md).
		if (exhausted && job.type === 'tts') {
			const tts = ttsJobSchema.safeParse(job.payload);
			if (tts.success) await avisarAudioQueFalhou(tts.data.teacherId, tts.data.hash);
		}
		// A troca de plano parada é dinheiro do professor: assinatura antiga ainda
		// cobrando, ou devolução que não saiu. Vai para a equipe por e-mail.
		if (exhausted && job.type === 'mercadopago-troca') {
			try {
				await avisarTrocaQueFalhou(job.payload, err instanceof Error ? err.message : String(err));
			} catch (aviso) {
				console.error('[mercadopago] não deu para avisar a equipe da troca parada', aviso);
			}
		}
	}
}

/**
 * Pega até `CONCORRENCIA` jobs e processa os três juntos. Devolve quantos
 * pegou — zero significa fila vazia.
 *
 * O `claim` continua sendo um de cada vez, e tem de continuar: é o
 * `FOR UPDATE SKIP LOCKED` que dá exclusão mútua entre workers, e pegar em
 * lote numa transação só seguraria as linhas por mais tempo sem ganhar nada —
 * o custo aqui é a síntese, não a consulta.
 */
async function drenar(): Promise<number> {
	const lote: ClaimedJob[] = [];
	for (let i = 0; i < CONCORRENCIA; i++) {
		const job = await claimNextJob();
		if (!job) break;
		lote.push(job);
	}
	if (lote.length === 0) return 0;

	// `Promise.all` e não `allSettled`: `executar` já trata o próprio erro e
	// nunca rejeita — um job que falha marca a si mesmo e não derruba os irmãos.
	await Promise.all(lote.map((job) => executar(job)));
	return lote.length;
}

/**
 * A manutenção de hora em hora, sem cron (a mesma decisão da fila): hoje, a
 * retenção dos relatos de problema (`server/relatos/retencao.ts`, 180 dias —
 * auth.md "Dados do aluno e LGPD" pede prazo aplicado por job). Falhar aqui
 * não derruba a fila: tenta de novo na hora seguinte.
 */
const MANUTENCAO_A_CADA_MS = 60 * 60 * 1000;
let proximaManutencao = 0;

async function manutencao(): Promise<void> {
	if (Date.now() < proximaManutencao) return;
	proximaManutencao = Date.now() + MANUTENCAO_A_CADA_MS;
	try {
		const apagados = await purgarRelatosVencidos();
		if (apagados > 0)
			console.info(`[manutenção] ${apagados} relato(s) de problema vencido(s) apagado(s)`);
	} catch (err) {
		console.error('[manutenção] não deu para apagar os relatos vencidos', err);
	}
}

async function main(): Promise<void> {
	for (;;) {
		await manutencao();
		// **Só dorme quando não há o que fazer.** Antes o `setTimeout` rodava
		// depois de CADA job, então publicar dez áudios custava vinte segundos de
		// sono puro — mais do que a síntese inteira levava. Medido nos mesmos dez
		// áudios: 53,9 s antes, 35,4 s depois. O ganho é este; a concorrência
		// acima não muda o número (ver `CONCORRENCIA`).
		const feitos = await drenar();
		if (feitos === 0) await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
	}
}

main();
