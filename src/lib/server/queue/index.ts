import { z } from 'zod';
import { prisma, type Db } from '$lib/server/db/client';

/**
 * Fila em tabela Postgres, sem Redis — ver server.md "Fila". O worker faz o
 * poll com `SELECT ... FOR UPDATE SKIP LOCKED`; aqui só entra quem enfileira.
 *
 * Todo job precisa ser idempotente: o mesmo job pode rodar mais de uma vez
 * se o worker cair entre concluir o trabalho e marcar `done`.
 */

export const ttsJobSchema = z.object({
	hash: z.string(),
	text: z.string(),
	voice: z.string(),
	speed: z.number(),
	/** O dono. O áudio é identificado pelo CONTEÚDO (o hash) e escopado por professor (db.md). */
	teacherId: z.string()
});
export type TtsJob = z.infer<typeof ttsJobSchema>;

export async function enqueueTts(job: TtsJob): Promise<void> {
	await prisma.job.create({ data: { type: 'tts', payload: job } });
}

/**
 * O convite do aluno. Vai pela fila porque enviar 30 e-mails na requisição
 * deixaria o professor olhando um spinner — e porque um provedor fora do ar
 * precisa ser retentativa, não erro na cara dele.
 */
export const conviteJobSchema = z.object({
	inviteId: z.string(),
	to: z.string(),
	studentName: z.string(),
	teacherName: z.string(),
	activityTitle: z.string(),
	languageLabel: z.string(),
	itemCount: z.number().int(),
	minutes: z.number().int(),
	classroomName: z.string(),
	link: z.string(),
	code: z.string().nullable(),
	codeUrl: z.string()
});
export type ConviteJob = z.infer<typeof conviteJobSchema>;

export async function enqueueConvites(jobs: ConviteJob[]): Promise<void> {
	if (jobs.length === 0) return;
	await prisma.job.createMany({
		data: jobs.map((job) => ({ type: 'convite', payload: job }))
	});
}

/**
 * O convite para um PROFESSOR entrar numa escola (docs/adr-005-escola.md).
 * `expiresAt` vai em ISO porque o payload é JSON. O worker só manda se o
 * convite ainda existe, não foi aceito e não venceu — e marca `sentAt`.
 */
export const conviteEscolaJobSchema = z.object({
	inviteId: z.string(),
	to: z.string(),
	schoolName: z.string(),
	quemConvidou: z.string(),
	role: z.enum(['coordenacao', 'professor']),
	link: z.string(),
	expiresAt: z.string()
});
export type ConviteEscolaJob = z.infer<typeof conviteEscolaJobSchema>;

export async function enqueueConviteEscola(job: ConviteEscolaJob): Promise<void> {
	await prisma.job.create({
		data: { type: 'convite-escola', payload: conviteEscolaJobSchema.parse(job) }
	});
}

/**
 * Aviso para a EQUIPE (formulário de contato, pedido de plano). Vai para
 * `CONTATO_PARA`; sem ela configurada, o worker registra no log — mesmo padrão
 * do e-mail sem provedor. Pela fila, e não na requisição, pelo mesmo motivo do
 * convite: provedor fora do ar vira retentativa, não erro na tela de quem pediu.
 */
export const avisoEquipeJobSchema = z.object({
	assunto: z.string().min(1).max(200),
	texto: z.string().min(1).max(10_000),
	replyTo: z.string().email().optional()
});
export type AvisoEquipeJob = z.infer<typeof avisoEquipeJobSchema>;

export async function enqueueAvisoEquipe(job: AvisoEquipeJob, db: Db = prisma): Promise<void> {
	await db.job.create({ data: { type: 'aviso-equipe', payload: avisoEquipeJobSchema.parse(job) } });
}

/**
 * O link de REDEFINIR SENHA, do professor ou do aluno (as duas instâncias de
 * Better Auth, auth.md). Pela fila pelo mesmo motivo do convite: provedor fora
 * do ar vira retentativa, não erro — e a tela de "esqueci a senha" responde
 * igual exista ou não a conta, então ela nem saberia mostrar a falha. `expiraEm`
 * (ISO) é a validade do link: o worker não manda um que já venceu na fila.
 */
export const redefinirSenhaJobSchema = z.object({
	to: z.string(),
	nome: z.string(),
	link: z.string(),
	conta: z.enum(['professor', 'aluno']),
	expiraEm: z.string()
});
export type RedefinirSenhaJob = z.infer<typeof redefinirSenhaJobSchema>;

export async function enqueueRedefinirSenha(job: RedefinirSenhaJob): Promise<void> {
	await prisma.job.create({
		data: { type: 'redefinir-senha', payload: redefinirSenhaJobSchema.parse(job) }
	});
}

/**
 * O CONVITE DE CONTA do aluno da chamada (auth.md "A conta do aluno"): o link
 * para ele criar a conta, ou entrar na que já tem, e ligá-la à ficha.
 *
 * O job não carrega o endereço: o worker lê a ficha na hora e só manda se ela
 * ainda não tem conta, se o token ainda é o mesmo (o professor pode ter gerado
 * outro link, e o velho não vale mais) e se ainda há e-mail. `pedidoEm` é a
 * idempotência: o worker não manda de novo um pedido que já saiu
 * (`accountInviteSentAt` depois dele), e um "Mandar de novo" é um pedido novo.
 */
export const conviteContaJobSchema = z.object({
	studentId: z.string(),
	token: z.string(),
	link: z.string(),
	teacherName: z.string(),
	pedidoEm: z.string()
});
export type ConviteContaJob = z.infer<typeof conviteContaJobSchema>;

export async function enqueueConvitesDeConta(jobs: ConviteContaJob[]): Promise<void> {
	if (jobs.length === 0) return;
	await prisma.job.createMany({
		data: jobs.map((job) => ({ type: 'convite-conta', payload: conviteContaJobSchema.parse(job) }))
	});
}

/**
 * O envio PROGRAMADO de um módulo para uma turma (docs/telas-modulos-professor.md
 * 2.4). O job não carrega o QUE sai: ele só acorda na hora (`runAfter`) e
 * pergunta ao banco o que está devido naquela alocação
 * (`processarEnviosDevidos`). É isso que o torna idempotente e à prova de
 * reprogramação: um job de uma data que mudou acorda, não acha nada devido, e
 * termina sem efeito.
 */
export const envioProgramadoJobSchema = z.object({ allocationId: z.string() });
export type EnvioProgramadoJob = z.infer<typeof envioProgramadoJobSchema>;

/** Um job por instante distinto. Instante no passado = sai na próxima volta do worker. */
export async function enqueueEnviosProgramados(
	allocationId: string,
	instantes: Date[]
): Promise<void> {
	const unicos = [...new Set(instantes.map((d) => d.getTime()))];
	if (unicos.length === 0) return;
	await prisma.job.createMany({
		data: unicos.map((t) => ({
			type: 'envio-programado',
			payload: { allocationId } satisfies EnvioProgramadoJob,
			runAfter: new Date(t)
		}))
	});
}

/**
 * A notificação do Mercado Pago, já com a assinatura conferida (billing.md
 * "Mercado Pago"). O webhook só enfileira e responde 200 na hora; quem busca o
 * recurso na API e aplica é o worker, com as retentativas da fila — o provedor
 * fora do ar vira backoff, não notificação perdida.
 */
export const mercadoPagoJobSchema = z.object({
	topico: z.enum(['subscription_preapproval', 'subscription_authorized_payment']),
	id: z.string().min(1).max(100)
});
export type MercadoPagoJob = z.infer<typeof mercadoPagoJobSchema>;

export async function enqueueMercadoPago(job: MercadoPagoJob): Promise<void> {
	await prisma.job.create({
		data: { type: 'mercadopago', payload: mercadoPagoJobSchema.parse(job) }
	});
}

/** Jobs que falharam depois de esgotar as tentativas — nunca somem em silêncio. */
export function failedJobs(limit = 50) {
	return prisma.job.findMany({
		where: { status: 'failed' },
		orderBy: { updatedAt: 'desc' },
		take: limit
	});
}
