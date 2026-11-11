import { prisma } from '$lib/server/db/client';
import { DADOS, juntarNomes, type DadosDe, type TipoDeNotificacao } from '$lib/notificacoes';

/**
 * Quem GRAVA as notificações (docs/notificacoes.md). Interno do servidor: é
 * chamado pelo Player, pelo worker, pela programação de módulos e pela cobrança
 * — contextos sem a sessão do professor —, e por isso recebe o `teacherId` de
 * quem chama. Nunca é exposto como remote function; a LEITURA, essa sim com o
 * professor da sessão, é `repos/notificacoes.ts`.
 *
 * **Avisar nunca derruba o que avisa.** Uma falha aqui vira `console.warn`: o
 * aluno não pode perder a resposta porque o sino do professor não gravou.
 */

export type Evento = {
	[T in TipoDeNotificacao]: {
		kind: T;
		/** Agrupa enquanto não lida — ver `Notification.key` no schema. */
		key: string;
		data: DadosDe<T>;
		/** Só em `definir`: a contagem do momento (respostas pendentes, por exemplo). */
		count?: number;
	};
}[TipoDeNotificacao];

/**
 * Como um evento novo entra numa notificação ainda não lida com a mesma chave:
 * `somar` conta mais um (e junta os nomes), `definir` troca a contagem pela do
 * momento, `renovar` só traz a notificação para o topo com o dado novo.
 */
const AGRUPAR: Record<TipoDeNotificacao, 'somar' | 'definir' | 'renovar'> = {
	correcao: 'definir',
	liberacao: 'renovar',
	audio: 'renovar',
	'aluno-entrou': 'somar',
	plano: 'renovar',
	escola: 'somar',
	'trial-acabando': 'renovar',
	terminou: 'somar'
};

/**
 * As chaves que agrupam, num lugar só: quem AVISA e quem marca como VISTO
 * (`repos/notificacoes.ts`, ao abrir a tela de destino) precisam escrever a
 * mesma chave, senão o "visto" nunca alcança o aviso.
 */
export const CHAVE = {
	terminou: (activityId: string) => `terminou:${activityId}`,
	audio: (activityId: string) => `audio:${activityId}`,
	alunoEntrou: (classroomId: string) => `aluno-entrou:${classroomId}`
} as const;

/** Lidas há mais que isto saem quando chega uma nova: o sino não é arquivo. */
const GUARDAR_LIDAS_MS = 90 * 24 * 60 * 60 * 1000;

function comNomes(data: unknown): data is { nomes: string[] } {
	return (
		typeof data === 'object' && data !== null && Array.isArray((data as { nomes?: unknown }).nomes)
	);
}

export async function notificar(teacherId: string, evento: Evento): Promise<void> {
	try {
		const data = DADOS[evento.kind].parse(evento.data);
		const aberta = await prisma.notification.findFirst({
			where: { teacherId, key: evento.key, readAt: null },
			orderBy: { updatedAt: 'desc' }
		});

		if (aberta) {
			const modo = AGRUPAR[evento.kind];
			const nomes =
				comNomes(aberta.data) && comNomes(data) ? juntarNomes(aberta.data.nomes, data.nomes) : null;
			await prisma.notification.update({
				where: { id: aberta.id },
				data: {
					data: nomes ? { ...data, nomes } : data,
					count:
						modo === 'somar'
							? aberta.count + (evento.count ?? 1)
							: modo === 'definir'
								? (evento.count ?? aberta.count)
								: aberta.count
				}
			});
			return;
		}

		if (AGRUPAR[evento.kind] === 'definir' && (evento.count ?? 1) <= 0) return;
		await prisma.notification.create({
			data: { teacherId, kind: evento.kind, key: evento.key, data, count: evento.count ?? 1 }
		});
		await prisma.notification.deleteMany({
			where: { teacherId, readAt: { lt: new Date(Date.now() - GUARDAR_LIDAS_MS) } }
		});
	} catch (err) {
		console.warn('[notificacoes] não gravou', evento.kind, err);
	}
}

/**
 * O que o aviso pedia aconteceu (a liberação saiu, o professor mandou gerar o
 * áudio de novo): as notificações abertas com essas chaves viram lidas. Um sino
 * que continua chamando por algo resolvido ensina a não olhar para ele.
 */
export async function resolverNotificacoes(teacherId: string, keys: string[]): Promise<void> {
	if (keys.length === 0) return;
	try {
		await prisma.notification.updateMany({
			where: { teacherId, key: { in: keys }, readAt: null },
			data: { readAt: new Date() }
		});
	} catch (err) {
		console.warn('[notificacoes] não resolveu', keys, err);
	}
}

/** As respostas de rubrica ainda sem nota numa atividade do professor. */
function pendentesDaAtividade(teacherId: string, activityId: string) {
	return prisma.attemptItem.count({
		where: {
			reviewedAt: null,
			item: {
				grading: { path: ['mode'], equals: 'rubric' },
				activityVersion: { activityId, activity: { teacherId } }
			}
		}
	});
}

/**
 * "N respostas para corrigir": chamada quando uma resposta de rubrica CHEGA
 * (`criar`) e quando o professor dá a nota (sem criar). A contagem é sempre a do
 * banco, não um +1 — e zerou, o aviso se resolve sozinho (vira lido), porque o
 * que ele pedia está feito.
 */
export async function atualizarCorrecao(
	teacherId: string,
	atividade: { id: string; title: string },
	opcoes: { criar: boolean }
): Promise<void> {
	try {
		const pendentes = await pendentesDaAtividade(teacherId, atividade.id);
		const key = `correcao:${atividade.id}`;
		if (pendentes === 0) {
			await prisma.notification.updateMany({
				where: { teacherId, key, readAt: null },
				data: { readAt: new Date() }
			});
			return;
		}
		const aberta = await prisma.notification.count({ where: { teacherId, key, readAt: null } });
		if (!aberta && !opcoes.criar) return;
		await notificar(teacherId, {
			kind: 'correcao',
			key,
			data: { activityId: atividade.id, titulo: atividade.title },
			count: pendentes
		});
	} catch (err) {
		console.warn('[notificacoes] correção', err);
	}
}

/**
 * "Ana terminou Present perfect" — e, enquanto o professor não lê, "Ana e mais
 * 3 terminaram". Chamado pelo Player quando a tentativa termina pela PRIMEIRA
 * vez (`finalizarTentativa`): terminar de novo, recarregando a tela final, não
 * conta outro aluno.
 */
export async function avisarTentativaTerminada(
	teacherId: string,
	atividade: { id: string; title: string },
	nome: string
): Promise<void> {
	await notificar(teacherId, {
		kind: 'terminou',
		key: CHAVE.terminou(atividade.id),
		data: { activityId: atividade.id, titulo: atividade.title, nomes: [nome] }
	});
}

/**
 * O aviso do fim do teste: criado na primeira leitura do Studio a três dias do
 * fim (e de novo no último dia), nunca duas vezes para a mesma data — a chave é
 * a data do fim e o dia do aviso.
 */
export async function avisarFimDoTrial(
	teacherId: string,
	trialEndsAt: Date,
	diasRestantes: number
): Promise<void> {
	if (diasRestantes > 3) return;
	const marco = diasRestantes <= 1 ? 'ultimo' : 'tres';
	const key = `trial:${trialEndsAt.toISOString().slice(0, 10)}:${marco}`;
	try {
		const ja = await prisma.notification.count({ where: { teacherId, key } });
		if (ja > 0) return;
		// O aviso do último dia substitui o dos três: dois avisos do mesmo fim não ajudam.
		await prisma.notification.updateMany({
			where: { teacherId, kind: 'trial-acabando', readAt: null },
			data: { readAt: new Date() }
		});
		await notificar(teacherId, {
			kind: 'trial-acabando',
			key,
			data: { ate: trialEndsAt.toISOString() }
		});
	} catch (err) {
		console.warn('[notificacoes] trial', err);
	}
}
