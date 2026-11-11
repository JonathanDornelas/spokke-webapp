import { prisma } from '$lib/server/db/client';
import { notificar, resolverNotificacoes } from '$lib/server/notificacoes';
import { programacoes } from '$lib/server/db/repos/programacoes';
import { enqueueEnviosProgramados } from '$lib/server/queue';
import {
	agendar,
	hojeEmBrasilia,
	instanteDe,
	lerProgramacao,
	type Programacao
} from '$lib/modulos/programacao';
import { despacharEnvio, prepararAtividades, type MotivoDeNaoSair } from './enviar';

/**
 * A programação de LIBERAÇÃO de um módulo para uma turma, do lado do servidor
 * (docs/telas-modulos-professor.md 2.4). A conta das datas é `agendar`, a mesma
 * que a prévia da tela faz — aqui ela vira linhas de `ModuleSend` e jobs
 * `envio-programado` com `runAfter`.
 *
 * Toda função exportada que recebe `teacher` confere o dono pela alocação
 * (`programacoes(teacher).existe`) antes de escrever. `processarEnviosDevidos`
 * não recebe professor porque quem a chama é o WORKER, a partir de um job que só
 * o próprio servidor enfileira; o professor sai do módulo.
 */

type Professor = { id: string; name: string };

/** Quantas vezes um envio espera o áudio antes de parar de tentar sozinho. */
const TENTATIVAS_DE_AUDIO = 6;
/** De quanto em quanto tempo o envio que espera o áudio tenta de novo. */
const ESPERA_DO_AUDIO_MS = 5 * 60 * 1000;

export type ResultadoDoProcessamento = {
	/** Quantas atividades foram LIBERADAS agora (o nome é da época do e-mail). */
	enviadas: number;
	naoSairam: { title: string; motivo: MotivoDeNaoSair }[];
};
const NADA: ResultadoDoProcessamento = { enviadas: 0, naoSairam: [] };

/**
 * O endereço público quando quem libera é o worker. O e-mail do módulo saiu, mas
 * a assinatura de `processarEnviosDevidos` continua levando a origem.
 */
export function origemDoWorker(): string {
	return process.env.ORIGIN ?? process.env.BETTER_AUTH_URL ?? 'http://localhost:5173';
}

/**
 * Grava a programação: recalcula a agenda do que ainda não saiu, reescreve as
 * linhas programadas e enfileira um job por instante. O que já tem desfecho
 * (enviada, "não saiu") não é tocado. Instante que já chegou sai aqui mesmo —
 * é o caso de "tudo agora", e o professor vê o resultado na hora.
 */
export async function salvarProgramacao(
	teacher: Professor,
	allocationId: string,
	programacao: Programacao,
	origem: string,
	agora: Date = new Date()
): Promise<ResultadoDoProcessamento | null> {
	const alocacao = await programacoes(teacher).existe(allocationId);
	if (!alocacao) return null;
	await reescreverAgenda(allocationId, alocacao.moduleId, programacao, agora);
	if (alocacao.pausedAt) return NADA;
	return enfileirarEProcessar(allocationId, origem, agora);
}

async function reescreverAgenda(
	allocationId: string,
	moduleId: string,
	programacao: Programacao,
	agora: Date
): Promise<void> {
	const [doModulo, envios] = await Promise.all([
		prisma.moduleActivity.findMany({
			where: { moduleId },
			orderBy: { position: 'asc' },
			select: { activityId: true }
		}),
		prisma.moduleSend.findMany({
			where: { allocationId },
			select: { activityId: true, status: true }
		})
	]);
	const ordem = doModulo.map((x) => x.activityId);
	const consumidas = new Set(
		envios.filter((e) => e.status === 'enviada' || e.status === 'nao_saiu').map((e) => e.activityId)
	);
	const grupos = agendar(programacao, ordem, consumidas, hojeEmBrasilia(agora));
	const agendadas = grupos.flatMap((g) =>
		g.itens.map((i) => ({
			activityId: i.id,
			status: i.pulada ? 'pulada' : 'programada',
			dueAt: g.data ? instanteDe(g.data, programacao.hora) : agora
		}))
	);

	await prisma.$transaction(async (tx) => {
		await tx.moduleClassroom.update({
			where: { id: allocationId },
			data: { schedule: programacao }
		});
		// O que saiu da fila (desmarcada, ou tirada do módulo) deixa de estar programado.
		await tx.moduleSend.deleteMany({
			where: {
				allocationId,
				status: { in: ['programada', 'pulada'] },
				activityId: { notIn: agendadas.map((a) => a.activityId) }
			}
		});
		for (const a of agendadas) {
			await tx.moduleSend.upsert({
				where: { allocationId_activityId: { allocationId, activityId: a.activityId } },
				create: { allocationId, activityId: a.activityId, status: a.status, dueAt: a.dueAt },
				update: { status: a.status, dueAt: a.dueAt, reason: null, attempts: 0 }
			});
		}
	});
}

/** Um job para cada instante programado, e o que já chegou sai agora. */
async function enfileirarEProcessar(
	allocationId: string,
	origem: string,
	agora: Date
): Promise<ResultadoDoProcessamento> {
	const programadas = await prisma.moduleSend.findMany({
		where: { allocationId, status: 'programada' },
		select: { dueAt: true }
	});
	const futuras = programadas.filter((p) => p.dueAt > agora).map((p) => p.dueAt);
	await enqueueEnviosProgramados(allocationId, futuras);
	return programadas.some((p) => p.dueAt <= agora)
		? processarEnviosDevidos(allocationId, origem, agora, { avisar: false })
		: NADA;
}

/**
 * Pausa ou retoma. Pausada, nada sai (os jobs acordam e encontram a pausa).
 * Retomar recalcula a agenda a partir de hoje — `agendar` redistribui a fila
 * atrasada —, então "as datas recomeçam de quando retomar".
 */
export async function pausarProgramacao(
	teacher: Professor,
	allocationId: string,
	pausar: boolean,
	origem: string,
	agora: Date = new Date()
): Promise<ResultadoDoProcessamento | null> {
	const alocacao = await programacoes(teacher).existe(allocationId);
	if (!alocacao) return null;
	await prisma.moduleClassroom.update({
		where: { id: allocationId },
		data: { pausedAt: pausar ? agora : null }
	});
	if (pausar) return NADA;
	const programacao = lerProgramacao(alocacao.schedule);
	if (!programacao) return NADA;
	await reescreverAgenda(allocationId, alocacao.moduleId, programacao, agora);
	return enfileirarEProcessar(allocationId, origem, agora);
}

/**
 * "Enviar agora": adianta só estas atividades. As outras datas não mudam — a
 * agenda é ancorada no início, e a vaga da que saiu fica ocupada por ela.
 */
export async function enviarAgora(
	teacher: Professor,
	allocationId: string,
	activityIds: string[],
	origem: string,
	agora: Date = new Date()
): Promise<ResultadoDoProcessamento | null> {
	const alocacao = await programacoes(teacher).existe(allocationId);
	if (!alocacao) return null;
	// Só o que é DESTE módulo, e ainda não saiu. A linha pode não existir (turma
	// alocada sem programação salva): ela nasce aqui, já devida.
	const [doModulo, envios] = await Promise.all([
		prisma.moduleActivity.findMany({
			where: { moduleId: alocacao.moduleId, activityId: { in: activityIds } },
			select: { activityId: true }
		}),
		prisma.moduleSend.findMany({
			where: { allocationId, activityId: { in: activityIds } },
			select: { activityId: true, status: true }
		})
	]);
	const jaSaiu = new Set(envios.filter((e) => e.status === 'enviada').map((e) => e.activityId));
	for (const { activityId } of doModulo) {
		if (jaSaiu.has(activityId)) continue;
		await prisma.moduleSend.upsert({
			where: { allocationId_activityId: { allocationId, activityId } },
			create: { allocationId, activityId, status: 'programada', dueAt: agora },
			update: { status: 'programada', dueAt: agora, reason: null, attempts: 0 }
		});
	}
	return processarEnviosDevidos(allocationId, origem, agora, {
		ignorarPausa: true,
		avisar: false
	});
}

/** "Tentar de novo" na linha que não saiu. */
export async function tentarDeNovo(
	teacher: Professor,
	allocationId: string,
	activityId: string,
	origem: string,
	agora: Date = new Date()
): Promise<ResultadoDoProcessamento | null> {
	return enviarAgora(teacher, allocationId, [activityId], origem, agora);
}

/**
 * Publicar a atividade destrava o envio que esperava por ela: "publique a
 * atividade e ele sai na próxima tentativa, sem pular para a seguinte". Chamada
 * por `publicarAtividade`; os jobs saem na próxima volta do worker.
 */
export async function liberarEnviosQueEsperavamPublicacao(
	teacherId: string,
	activityId: string,
	agora: Date = new Date()
): Promise<void> {
	const esperando = await prisma.moduleSend.findMany({
		where: {
			activityId,
			status: 'nao_saiu',
			reason: 'rascunho',
			allocation: { module: { teacherId } }
		},
		select: { id: true, allocationId: true }
	});
	if (esperando.length === 0) return;
	await prisma.moduleSend.updateMany({
		where: { id: { in: esperando.map((e) => e.id) } },
		data: { status: 'programada', dueAt: agora, reason: null, attempts: 0 }
	});
	for (const allocationId of new Set(esperando.map((e) => e.allocationId))) {
		await enqueueEnviosProgramados(allocationId, [agora]);
	}
}

/**
 * Manda o que está DEVIDO nesta alocação — o handler do job `envio-programado`,
 * e o fim de "tudo agora" e "enviar agora".
 *
 * Idempotente: cada linha é REIVINDICADA com um `updateMany` condicionado ao
 * estado lido (`status` + `updatedAt`), então dois workers acordados no mesmo
 * instante não mandam o mesmo e-mail duas vezes — só um vê `count === 1`.
 *
 * O que não pode sair vira "não saiu" com o motivo, e **não pula para a
 * seguinte**: a próxima atividade sai na data dela. Áudio faltando é o caso
 * comum e se resolve sozinho — a síntese já foi pedida, e o envio tenta de novo
 * em cinco minutos, até `TENTATIVAS_DE_AUDIO`.
 */
export async function processarEnviosDevidos(
	allocationId: string,
	origem: string,
	agora: Date = new Date(),
	opcoes: { ignorarPausa?: boolean; avisar?: boolean } = {}
): Promise<ResultadoDoProcessamento> {
	const alocacao = await prisma.moduleClassroom.findUnique({
		where: { id: allocationId },
		select: {
			pausedAt: true,
			schedule: true,
			classroom: { select: { id: true, name: true } },
			module: {
				select: {
					id: true,
					name: true,
					teacher: { select: { id: true, name: true } },
					activities: {
						orderBy: { position: 'asc' },
						select: {
							activity: { select: { id: true, title: true, targetLang: true, archivedAt: true } }
						}
					}
				}
			}
		}
	});
	if (!alocacao || (alocacao.pausedAt && !opcoes.ignorarPausa)) return NADA;

	const devidas = await prisma.moduleSend.findMany({
		where: {
			allocationId,
			OR: [
				{ status: 'programada', dueAt: { lte: agora } },
				{ status: 'nao_saiu', reason: 'audio', attempts: { lt: TENTATIVAS_DE_AUDIO } }
			]
		},
		select: { id: true, activityId: true, status: true, updatedAt: true, attempts: true }
	});
	if (devidas.length === 0) return NADA;

	const teacher = alocacao.module.teacher;
	const doModulo = alocacao.module.activities.map((x) => x.activity);
	const devidaDe = new Map(devidas.map((d) => [d.activityId, d]));
	// Na ORDEM do módulo — é a ordem dos links no e-mail.
	const itens = doModulo.filter((a) => devidaDe.has(a.id));

	// Atividade que saiu do módulo depois de programada não sai mais.
	const orfas = devidas.filter((d) => !doModulo.some((a) => a.id === d.activityId));
	if (orfas.length > 0) {
		await prisma.moduleSend.deleteMany({ where: { id: { in: orfas.map((o) => o.id) } } });
	}

	const { prontas, naoProntas } = await prepararAtividades(teacher, itens);

	// Reivindica as prontas antes de mandar.
	const minhas: typeof prontas = [];
	for (const pronta of prontas) {
		const linha = devidaDe.get(pronta.activityId);
		if (!linha) continue;
		const { count } = await prisma.moduleSend.updateMany({
			where: { id: linha.id, status: linha.status, updatedAt: linha.updatedAt },
			data: { status: 'enviada', sentAt: agora, reason: null }
		});
		if (count === 1) minhas.push(pronta);
	}

	if (minhas.length > 0) {
		try {
			// Módulo LIBERA, não manda e-mail: `emails` fica 0 nas linhas novas.
			const r = await despacharEnvio(
				teacher,
				{ id: alocacao.module.id, name: alocacao.module.name },
				alocacao.classroom,
				minhas
			);
			await prisma.moduleSend.updateMany({
				where: { allocationId, activityId: { in: minhas.map((m) => m.activityId) } },
				data: { emails: 0, envioId: r.envioId }
			});
			// Saiu: o aviso de que não tinha saído perdeu o motivo de existir.
			await resolverNotificacoes(
				teacher.id,
				minhas.map((m) => `liberacao:${allocationId}:${m.activityId}`)
			);
		} catch (err) {
			// Devolve as linhas para a fila: o job tenta de novo com backoff.
			await prisma.moduleSend.updateMany({
				where: { allocationId, activityId: { in: minhas.map((m) => m.activityId) } },
				data: { status: 'programada', sentAt: null }
			});
			throw err;
		}
	}

	let esperaAudio = false;
	for (const n of naoProntas) {
		const linha = devidaDe.get(n.activityId);
		if (!linha) continue;
		await prisma.moduleSend.updateMany({
			where: { id: linha.id, updatedAt: linha.updatedAt },
			data: { status: 'nao_saiu', reason: n.motivo, attempts: linha.attempts + 1 }
		});
		const vaiTentarDeNovo = n.motivo === 'audio' && linha.attempts + 1 < TENTATIVAS_DE_AUDIO;
		if (vaiTentarDeNovo) esperaAudio = true;
		// O sino só quando é com ele: áudio ainda tem tentativas pela frente e
		// costuma se resolver sozinho; rascunho e arquivada esperam uma ação dele.
		if (opcoes.avisar !== false && !vaiTentarDeNovo) {
			await notificar(teacher.id, {
				kind: 'liberacao',
				key: `liberacao:${allocationId}:${n.activityId}`,
				data: {
					moduleId: alocacao.module.id,
					allocationId,
					modulo: alocacao.module.name,
					turma: alocacao.classroom.name,
					atividade: n.title,
					motivo: n.motivo
				}
			});
		}
	}
	if (esperaAudio) {
		await enqueueEnviosProgramados(allocationId, [new Date(agora.getTime() + ESPERA_DO_AUDIO_MS)]);
	}

	return {
		enviadas: minhas.length,
		naoSairam: naoProntas.map((n) => ({ title: n.title, motivo: n.motivo }))
	};
}
