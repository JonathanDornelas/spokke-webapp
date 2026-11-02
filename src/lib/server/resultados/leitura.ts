import { prisma } from '$lib/server/db/client';
import { itemSkills, promptInstruction } from '$lib/server/player/runtime';
import { getInteraction } from '$lib/kernel/interactions/registry';
import { readableAnswer } from '$lib/server/player/readable-answer';
import { readableAnswerKey } from '$lib/server/studio/answer-key';
import { resumoDoItem } from '$lib/server/atividades/resumo';
import { gradingSchema, interactionSchema, promptSchema } from '$lib/kernel/item';
import { getProfile } from '$lib/kernel/language/profiles';

/**
 * As leituras da tela de resultados. Módulo próprio porque as três rotas
 * (`resultados`, `[activityId]`, `[attemptId]`) partilham a mesma noção de
 * "nota que vale" e de "estado de uma resposta" — e um `+page.server.ts` não
 * pode exportar nada além de `load`, `actions` e as opções de rota.
 *
 * Todo acesso é escopado pelo professor. O `teacherId` entra no `where` mesmo
 * quando a atividade já foi resolvida antes: repetir o escopo não custa nada e
 * é ele que impede o vazamento (db.md "Repositórios").
 */

export type AnswerState = 'correct' | 'partial' | 'incorrect' | 'pending';

/**
 * A nota QUE VALE. Corrigido pelo professor, vale o dele; senão vale o
 * automático. Guardar os dois separados é o que deixa desfazer a correção
 * manual sem recorrigir (db.md "AttemptItem").
 */
export function notaValida(linha: { score: number; reviewedScore: number | null }): number {
	return linha.reviewedScore ?? linha.score;
}

/**
 * Escrita por rubrica não tem nota automática — o zero que ela guarda é
 * "ainda não corrigida", não "errou". Chamar isso de incorreto no relatório
 * seria reprovar o aluno por uma fila do professor.
 */
export function estadoDaResposta(
	linha: { score: number; reviewedScore: number | null; reviewedAt: Date | null },
	porRubrica: boolean
): AnswerState {
	if (porRubrica && linha.reviewedAt === null) return 'pending';
	const nota = notaValida(linha);
	if (nota >= 1) return 'correct';
	if (nota > 0) return 'partial';
	return 'incorrect';
}

/**
 * Quantos dias inteiros faltam para uma data. Arredonda para CIMA: "vence em 0
 * dias" não diz nada a quem lê, e o que o professor precisa saber é se ainda dá
 * tempo hoje.
 */
export function diasAte(quando: Date, de = new Date()): number {
	return Math.max(0, Math.ceil((quando.getTime() - de.getTime()) / 86_400_000));
}

/** Quantas respostas de rubrica ainda esperam o professor. */
export function contarPendentes(teacherId: string): Promise<number> {
	return prisma.attemptItem.count({
		where: {
			reviewedAt: null,
			item: {
				grading: { path: ['mode'], equals: 'rubric' },
				activityVersion: { activity: { teacherId } }
			}
		}
	});
}

/** Distância legível — o professor pensa em "há 2h", não em timestamp. */
export function quando(data: Date): string {
	const minutos = Math.floor((Date.now() - data.getTime()) / 60000);
	if (minutos < 1) return 'agora';
	if (minutos < 60) return `há ${minutos}min`;
	const horas = Math.floor(minutos / 60);
	if (horas < 24) return `há ${horas}h`;
	const dias = Math.floor(horas / 24);
	if (dias === 1) return 'ontem';
	if (dias < 30) return `há ${dias} dias`;
	return data.toLocaleDateString('pt-BR');
}

export function duracao(inicio: Date, fim: Date | null): string {
	if (!fim) return 'em andamento';
	const minutos = Math.round((fim.getTime() - inicio.getTime()) / 60000);
	if (minutos < 1) return 'menos de 1min';
	return `${minutos}min`;
}

export function iniciais(nome: string): string {
	return (
		nome
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((parte) => parte[0]?.toUpperCase())
			.join('') || '?'
	);
}

/**
 * Uma tentativa inteira, com cada resposta em texto legível e o retorno do
 * professor. É o que substituiu a fila de correção: ver a resposta e comentar
 * acontecem no mesmo lugar.
 */
export async function tentativaDoProfessor(teacherId: string, attemptId: string) {
	const attempt = await prisma.attempt.findFirst({
		where: { id: attemptId, publication: { activityVersion: { activity: { teacherId } } } },
		include: {
			items: { orderBy: { createdAt: 'asc' } },
			// O avatar de quem respondeu: da conta logada, ou da conta ligada à ficha.
			account: { select: { avatar: true } },
			student: { select: { account: { select: { avatar: true } } } },
			publication: {
				include: {
					activityVersion: {
						include: {
							activity: true,
							items: { orderBy: { order: 'asc' } }
						}
					}
				}
			}
		}
	});
	if (!attempt) return null;

	const agora = new Date();
	const versao = attempt.publication.activityVersion;
	const activity = versao.activity;
	const porItemId = new Map(attempt.items.map((linha) => [linha.itemId, linha]));

	const answers = versao.items.map((item, posicao) => {
		const linha = porItemId.get(item.id);
		const interaction = interactionSchema.parse(item.interaction);
		const grading = gradingSchema.parse(item.grading);
		const prompt = promptSchema.parse(item.prompt);
		const porRubrica = grading.mode === 'rubric';

		// A resposta do aluno sai do payload de `toRuntime()`, nunca do de
		// autoria: em `assemble`, `match` e `order` ela é uma lista de ids
		// embaralhados, e ler o payload de autoria daria o mesmo texto trazendo
		// o gabarito junto (regra nº 1 pelo avesso).
		const runtime = getInteraction(interaction.type).toRuntime(
			interaction.payload,
			`${attempt.seed}:${item.id}`
		);
		const dada = linha ? readableAnswer(interaction.type, runtime, linha.answer) : '';
		const gabarito = readableAnswerKey(interaction.type, interaction.payload);

		return {
			// O id da RESPOSTA quando ela existe; sem resposta, o do item — a
			// tela precisa de uma chave estável para o `{#each}` de qualquer jeito.
			id: linha?.id ?? item.id,
			answerId: linha?.id ?? null,
			index: posicao + 1,
			itemLabel: resumoDoItem(item.generatedBy, interaction.type),
			instruction: promptInstruction(prompt),
			given: dada,
			// O gabarito é do PROFESSOR e esta tela roda atrás do guard — o que
			// nunca pode acontecer é ele ir para o payload do aluno.
			expected: gabarito.answer,
			porRubrica,
			state: linha ? estadoDaResposta(linha, porRubrica) : ('pending' as const),
			respondida: linha !== undefined,
			comment: linha?.comment ?? '',
			reviewedScore: linha?.reviewedScore ?? null,
			reviewed: linha?.reviewedAt !== null && linha?.reviewedAt !== undefined,
			skill: itemSkills(item)[0] ?? 'reading',
			// A gravação do aluno, quando ele autorizou guardar. NÃO é a chave nem
			// uma URL do bucket: é o endereço da rota do Studio que confere o dono
			// antes de servir os bytes. O objeto em si é privado.
			audio:
				linha?.audioKey && linha.audioExpiresAt && linha.audioExpiresAt > agora
					? {
							src: `/resultados/${activity.id}/${attempt.id}/audio/${item.id}`,
							diasAteExpirar: diasAte(linha.audioExpiresAt)
						}
					: null
		};
	});

	const respondidas = answers.filter((a) => a.respondida);
	return {
		activity: {
			id: activity.id,
			title: activity.title,
			dir: getProfile(activity.targetLang).direction
		},
		attempt: {
			id: attempt.id,
			name: attempt.name,
			initials: iniciais(attempt.name),
			avatar: attempt.account?.avatar ?? attempt.student?.account?.avatar ?? null,
			when: quando(attempt.startedAt),
			duration: duracao(attempt.startedAt, attempt.finishedAt),
			studentId: attempt.studentId
		},
		// **Quando as gravações desta tentativa somem.** Vai para a tela como
		// aviso: elas vivem 7 dias e não se recriam, então o professor precisa
		// saber que o retorno tem prazo — diferente do áudio da atividade, que
		// se regenera com um clique.
		audioExpira: (() => {
			const dias = answers
				.map((a) => a.audio?.diasAteExpirar)
				.filter((d): d is number => d !== undefined);
			return dias.length ? { quantidade: dias.length, emDias: Math.min(...dias) } : null;
		})(),
		tally: {
			correct: respondidas.filter((a) => a.state === 'correct').length,
			partial: respondidas.filter((a) => a.state === 'partial').length,
			incorrect: respondidas.filter((a) => a.state === 'incorrect').length,
			pending: respondidas.filter((a) => a.state === 'pending').length
		},
		answers
	};
}
