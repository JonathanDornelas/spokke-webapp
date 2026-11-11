import { prisma } from '$lib/server/db/client';
import type { Prisma } from '../../../../../generated/prisma/client.ts';

/**
 * Repositório do Player — aluno anônimo, sem sessão de professor. Superfície
 * mínima por design: resolver publicação por slug, criar tentativa, gravar
 * resposta. Ver .claude/rules/db.md e server.md "fronteira de segurança do
 * Player".
 *
 * Nada aqui devolve o payload de autoria para fora: quem monta o item do
 * aluno é `player/runtime.ts`, que passa tudo por `toRuntime()`.
 */
export const playerRepo = {
	publicationBySlug(slug: string) {
		return prisma.publication.findUnique({
			where: { slug },
			include: {
				activityVersion: {
					include: {
						items: { orderBy: { order: 'asc' } },
						// O `teacherId` entra porque a entrada REPÕE o áudio expirado, e
						// todo job de TTS é de um professor — é o que o worker usa para
						// gravar o `MediaAsset` no dono certo.
						activity: {
							select: {
								id: true,
								title: true,
								sourceLang: true,
								targetLang: true,
								teacherId: true,
								// Arquivada fecha a ENTRADA (docs/adr-002-billing.md): quem já está
								// respondendo termina, quem não começou não começa.
								archivedAt: true,
								// O nível (CEFR) aparece na entrada — rótulo do professor, nunca gabarito.
								level: true
							}
						}
					}
				}
			}
		});
	},

	/**
	 *  é OPCIONAL e nulo é o caminho normal: o aluno entrou pelo
	 * link aberto e a tentativa vale igual no relatório do professor. Ele só
	 * chega preenchido quando o aluno veio por um link pessoal.
	 */
	createAttempt(
		publicationId: string,
		name: string,
		anonId: string,
		seed: string,
		studentId: string | null = null,
		// A conta do aluno, quando ele estava LOGADO. Independente de
		// `studentId`: dá para responder logado sem estar na chamada de ninguém.
		accountId: string | null = null,
		// Autorização para GUARDAR as gravações de fala. Opt-in, perguntado na
		// entrada — `false` é o padrão e o caminho de sempre: transcreve e
		// descarta.
		audioConsent = false
	) {
		return prisma.attempt.create({
			data: { publicationId, name, anonId, seed, studentId, accountId, audioConsent }
		});
	},

	/** A tentativa mais o suficiente para montar a questão atual. */
	attemptById(attemptId: string) {
		return prisma.attempt.findUnique({
			where: { id: attemptId },
			include: {
				items: true,
				// O avatar de quem está logado: o cabeçalho da questão mostra o dele.
				account: { select: { avatar: true } },
				publication: {
					include: {
						activityVersion: {
							include: {
								items: { orderBy: { order: 'asc' } },
								// O `teacherId` entra porque o áudio é escopado por professor
								// (db.md "MediaAsset"): é por ele que a questão acha o arquivo.
								activity: {
									select: {
										id: true,
										title: true,
										sourceLang: true,
										targetLang: true,
										teacherId: true,
										archivedAt: true
									}
								}
							}
						}
					}
				}
			}
		});
	},

	/**
	 * A tentativa TERMINADA mais recente de quem está abrindo o link — para a
	 * entrada mostrar o resultado em vez de pedir para responder de novo.
	 *
	 * Casa por aparelho (`anonId`) **ou** por conta: quem entrou pela conta
	 * troca de celular e continua sendo a mesma pessoa, e o cookie não
	 * atravessa aparelho.
	 */
	concludedAttempt(publicationId: string, quem: { anonId?: string; accountId?: string }) {
		const identidades = [
			...(quem.anonId ? [{ anonId: quem.anonId }] : []),
			...(quem.accountId ? [{ accountId: quem.accountId }] : [])
		];
		if (identidades.length === 0) return null;
		return prisma.attempt.findFirst({
			where: { publicationId, finishedAt: { not: null }, OR: identidades },
			orderBy: { finishedAt: 'desc' },
			include: { items: { select: { score: true } } }
		});
	},

	/**
	 * Quantas vezes esta pessoa já ENTREGOU esta atividade, e quantos acertos
	 * ela fez em cada uma. É o "Tentativa 2 de 2" do resultado, mais o "na 1ª
	 * você fez 3 de 8" — o percurso dela, que é o que dá sentido ao número de
	 * hoje.
	 *
	 * Mesma identidade dupla de `concludedAttempt`: aparelho **ou** conta.
	 */
	concludedAttempts(publicationId: string, quem: { anonId?: string; accountId?: string }) {
		const identidades = [
			...(quem.anonId ? [{ anonId: quem.anonId }] : []),
			...(quem.accountId ? [{ accountId: quem.accountId }] : [])
		];
		if (identidades.length === 0) {
			return Promise.resolve(
				[] as { id: string; finishedAt: Date | null; items: { score: number }[] }[]
			);
		}
		return prisma.attempt.findMany({
			where: { publicationId, finishedAt: { not: null }, OR: identidades },
			orderBy: { finishedAt: 'asc' },
			select: { id: true, finishedAt: true, items: { select: { score: true } } }
		});
	},

	/**
	 * O tempo MÉDIO por questão de quem já respondeu este link — o "a turma leva
	 * 1 min 12 s" que fica ao lado da média do aluno.
	 *
	 * Só de tentativas TERMINADAS: quem abandonou na segunda questão deixa um
	 * tempo que não é de resolver, é de desistir. E o aluno de agora fica FORA
	 * da conta (`excetoAttemptId`) — comparar-se com a própria média é uma
	 * comparação com nada.
	 *
	 * Devolve nulo quando ainda não há com quem comparar, e a tela omite a
	 * linha: "a turma leva 0 s" seria pior do que não dizer nada.
	 */
	async avgMsPorQuestao(publicationId: string, excetoAttemptId: string): Promise<number | null> {
		const agregado = await prisma.attemptItem.aggregate({
			_avg: { ms: true },
			where: {
				attempt: {
					publicationId,
					finishedAt: { not: null },
					id: { not: excetoAttemptId }
				}
			}
		});
		return agregado._avg.ms ?? null;
	},

	/** Tentativa não terminada deste aparelho, para a retomada. */
	resumableAttempt(publicationId: string, anonId: string) {
		return prisma.attempt.findFirst({
			where: { publicationId, anonId, finishedAt: null },
			orderBy: { startedAt: 'desc' },
			include: { items: true }
		});
	},

	/**
	 * Apaga a tentativa inacabada deste aparelho — é o "Começar de novo" da
	 * entrada. Só a NÃO terminada: tentativa entregue é resultado do aluno e
	 * do professor, e apagar isso por engano não tem volta.
	 */
	async discardResumable(publicationId: string, anonId: string): Promise<number> {
		const { count } = await prisma.attempt.deleteMany({
			where: { publicationId, anonId, finishedAt: null }
		});
		return count;
	},

	recordAnswer(
		attemptId: string,
		itemId: string,
		answer: Prisma.InputJsonValue,
		score: number,
		ms: number
	) {
		// `upsert` e não `create`: o aluno pode voltar para uma questão, e um
		// clique duplo chega duas vezes. Com `create`, cada uma virava uma linha
		// nova e o item contava duas vezes na distribuição de acerto do
		// professor — a chave `(attemptId, itemId)` é o que fecha essa porta.
		return prisma.attemptItem.upsert({
			where: { attemptId_itemId: { attemptId, itemId } },
			create: { attemptId, itemId, answer, score, ms },
			update: { answer, score, ms }
		});
	},

	/**
	 * Liga a gravação guardada à resposta. Só é chamado quando o aluno
	 * autorizou (`Attempt.audioConsent`) — ver `a/[slug]/fala/+server.ts`.
	 *
	 * A CHAVE, não uma URL: o objeto é privado, e quem serve é uma rota do
	 * Studio que confere se o professor é dono da tentativa.
	 */
	recordAudio(attemptId: string, itemId: string, audioKey: string, audioExpiresAt: Date) {
		return prisma.attemptItem.update({
			where: { attemptId_itemId: { attemptId, itemId } },
			data: { audioKey, audioExpiresAt }
		});
	},

	finishAttempt(attemptId: string) {
		return prisma.attempt.update({
			where: { id: attemptId },
			data: { finishedAt: new Date() }
		});
	},

	/**
	 * Quais destes hashes já existem, para este professor. O áudio de atividade
	 * não vence: linha que existe é arquivo que existe (`server/tts/limpeza.ts`
	 * apaga os dois juntos).
	 */
	async audiosExistentes(teacherId: string, hashes: string[]): Promise<Set<string>> {
		if (hashes.length === 0) return new Set();
		const linhas = await prisma.mediaAsset.findMany({
			where: { teacherId, hash: { in: hashes } },
			select: { hash: true }
		});
		return new Set(linhas.map((linha) => linha.hash));
	},

	/** Quantos dos áudios pedidos já existem — o contador da etapa 4 e do link. */
	async audioReady(teacherId: string, hashes: string[]): Promise<{ done: number; total: number }> {
		const unicos = [...new Set(hashes)];
		const prontos = await this.audiosExistentes(teacherId, unicos);
		return { done: prontos.size, total: unicos.length };
	},

	/**
	 * Apaga estas linhas para que os áudios sejam sintetizados de novo.
	 *
	 * É o que o botão "Gerar de novo" faz. Não basta enfileirar: o worker pula o
	 * que já existe. O objeto no bucket não precisa sair antes — a síntese nova
	 * grava na MESMA chave (`tts/<teacherId>/<hash>.mp3`).
	 */
	async esquecerAudios(teacherId: string, hashes: string[]): Promise<number> {
		if (hashes.length === 0) return 0;
		const { count } = await prisma.mediaAsset.deleteMany({
			where: { teacherId, hash: { in: hashes } }
		});
		return count;
	},

	/** As URLs, por hash — é o que `buildRuntimeItem` consulta para montar a questão. */
	mediaUrls(teacherId: string, hashes: string[]) {
		if (hashes.length === 0) return Promise.resolve([] as { hash: string; url: string }[]);
		return prisma.mediaAsset.findMany({
			where: { teacherId, hash: { in: [...new Set(hashes)] } },
			select: { hash: true, url: true }
		});
	}
};
