import { prisma, type Db } from '$lib/server/db/client';
import type { Item } from '$lib/kernel/item';
import type { Prisma } from '../../../../../generated/prisma/client.ts';

/**
 * O repositório só precisa do id para escopar — pedir a linha inteira do
 * Prisma acopla ele à forma exata da sessão do Better Auth, que traz os
 * mesmos campos com opcionalidade diferente.
 */
type TeacherScope = { id: string };

/**
 * A ordem do rascunho quando questões ENTRAM no roteiro (aceitar uma de fora,
 * aceitar todas, criar uma do zero): elas vão para o fim das de dentro — antes
 * do "associar" que fecha, se ele for a ÚLTIMA — e as de fora seguem depois. A
 * ordem que o professor arrastou é respeitada: o fecho só é contornado quando
 * está no fim, nunca puxado de volta para lá.
 */
export function ordemComEntradas(
	itens: { id: string; discarded: boolean; generatedBy: string | null }[],
	entram: string[]
): string[] {
	const entrando = new Set(entram);
	const dentro = itens.filter((i) => !i.discarded && !entrando.has(i.id));
	const ultima = dentro.at(-1);
	const fecho = ultima?.generatedBy === 'closing-match' ? [ultima] : [];
	const antes = fecho.length > 0 ? dentro.slice(0, -1) : dentro;
	const fora = itens.filter((i) => i.discarded && !entrando.has(i.id));
	return [...antes, ...entram.map((id) => ({ id })), ...fecho, ...fora].map((i) => i.id);
}

/**
 * Padrão de repositório escopado por professor — ver .claude/rules/auth.md
 * "Isolamento entre professores" e .claude/rules/db.md "Repositórios". Nunca
 * use `prisma.activity` cru numa remote function; use isto.
 *
 * `byId` devolve `null` tanto quando o registro não existe quanto quando
 * pertence a outro professor — não distinga os dois casos, isso vaza a
 * existência do recurso.
 *
 * **Rascunho é uma `ActivityVersion` sem `Publication`.** Publicar não cria
 * versão nova: ele PUBLICA o rascunho, e a partir daí aquela versão está
 * congelada (regra inviolável nº 7). A próxima edição abre a versão seguinte.
 */
export function atividades(teacher: TeacherScope, db: Db = prisma) {
	return {
		byId(id: string) {
			return db.activity.findFirst({ where: { id, teacherId: teacher.id } });
		},

		list() {
			return prisma.activity.findMany({
				where: { teacherId: teacher.id },
				orderBy: { createdAt: 'desc' },
				include: {
					versions: {
						orderBy: { versionNumber: 'desc' },
						include: {
							// Só o que está DENTRO: as que ficaram de fora na revisão
							// não contam como questões da atividade.
							items: { where: { discarded: false }, select: { prompt: true, interaction: true } },
							publications: {
								select: { id: true, slug: true, _count: { select: { attempts: true } } }
							}
						}
					},
					// Os módulos em que ela está — para a lista filtrar por módulo.
					modules: { select: { module: { select: { id: true, name: true } } } }
				}
			});
		},

		/**
		 * `plano` é o que a etapa 1 passou a perguntar: quantas questões gerar e
		 * quais habilidades a atividade treina. Fica na atividade, não na versão,
		 * porque é preferência do professor — regerar os itens tem que respeitar
		 * a mesma escolha sem ele repetir nada.
		 */
		create(
			title: string,
			sourceLang: string,
			targetLang: string,
			plano: { itemTarget: number; skills: string[]; level?: string | null }
		) {
			// `db`, não `prisma`: criar atividade acontece DENTRO da trava de cota
			// (`$lib/server/billing/cota.ts`), e fora da transação a escrita iria
			// por outra conexão.
			return db.activity.create({
				data: {
					title,
					sourceLang,
					targetLang,
					teacherId: teacher.id,
					itemTarget: plano.itemTarget,
					skills: plano.skills,
					level: plano.level ?? null
				}
			});
		},

		/** A versão em edição: a de maior número que ainda não foi publicada. */
		async draft(activityId: string) {
			const activity = await prisma.activity.findFirst({
				where: { id: activityId, teacherId: teacher.id }
			});
			if (!activity) return null;

			return prisma.activityVersion.findFirst({
				where: { activityId, publications: { none: {} } },
				orderBy: { versionNumber: 'desc' },
				include: { items: { orderBy: { order: 'asc' } } }
			});
		},

		/** A última versão publicada, se existir. */
		async published(activityId: string) {
			const activity = await prisma.activity.findFirst({
				where: { id: activityId, teacherId: teacher.id }
			});
			if (!activity) return null;

			return prisma.activityVersion.findFirst({
				where: { activityId, publications: { some: {} } },
				orderBy: { versionNumber: 'desc' },
				include: { items: { orderBy: { order: 'asc' } }, publications: true }
			});
		},

		/**
		 * A cópia editável de uma atividade que já está no ar.
		 *
		 * Publicar congela a versão (regra nº 7) e o rascunho deixa de existir,
		 * então "Editar atividade" caía numa tela de revisão VAZIA — a atividade
		 * do professor sumia da frente dele e o único caminho era gerar tudo de
		 * novo. Aqui a versão publicada é clonada item a item num rascunho novo:
		 * ela continua intacta para quem está respondendo, e o professor volta a
		 * mexer no que já tinha.
		 *
		 * Idempotente por definição: se já existe rascunho, devolve aquele. É o
		 * que permite chamar isto de um loader sem duplicar nada a cada visita.
		 */
		async draftFromPublished(activityId: string) {
			const existente = await this.draft(activityId);
			if (existente) return existente;

			const publicada = await this.published(activityId);
			if (!publicada) return null;

			return prisma.$transaction(async (tx) => {
				const last = await tx.activityVersion.findFirst({
					where: { activityId },
					orderBy: { versionNumber: 'desc' }
				});
				const criada = await tx.activityVersion.create({
					data: { activityId, versionNumber: (last?.versionNumber ?? 0) + 1 }
				});

				await tx.item.createMany({
					data: publicada.items.map((item, index) => ({
						sourceContentId: item.sourceContentId,
						generatedBy: item.generatedBy,
						order: index,
						prompt: item.prompt as Prisma.InputJsonValue,
						interaction: item.interaction as Prisma.InputJsonValue,
						grading: item.grading as Prisma.InputJsonValue,
						locale: item.locale as Prisma.InputJsonValue,
						activityVersionId: criada.id
					}))
				});

				return tx.activityVersion.findUniqueOrThrow({
					where: { id: criada.id },
					include: { items: { orderBy: { order: 'asc' } } }
				});
			});
		},

		/**
		 * Troca o conteúdo do RASCUNHO pelos itens recém-gerados. Nunca toca
		 * numa versão publicada: se a última versão já tem `Publication`, abre
		 * a próxima em vez de editar aquela.
		 *
		 * `fora` são as questões geradas que passaram da quantidade pedida: entram
		 * depois das outras, já marcadas como fora da atividade (`discarded`), para
		 * o professor trocar na revisão o que entra e o que sai.
		 */
		async replaceDraftItems(activityId: string, items: Item[], fora: Item[] = []) {
			const activity = await prisma.activity.findFirst({
				where: { id: activityId, teacherId: teacher.id }
			});
			if (!activity) return null;

			return prisma.$transaction(async (tx) => {
				const draft = await tx.activityVersion.findFirst({
					where: { activityId, publications: { none: {} } },
					orderBy: { versionNumber: 'desc' }
				});

				let versionId: string;
				if (draft) {
					await tx.item.deleteMany({ where: { activityVersionId: draft.id } });
					versionId = draft.id;
				} else {
					const last = await tx.activityVersion.findFirst({
						where: { activityId },
						orderBy: { versionNumber: 'desc' }
					});
					const created = await tx.activityVersion.create({
						data: { activityId, versionNumber: (last?.versionNumber ?? 0) + 1 }
					});
					versionId = created.id;
				}

				await tx.item.createMany({
					data: [...items, ...fora].map((item, index) => ({
						sourceContentId: item.sourceContentId,
						generatedBy: item.generatedBy,
						order: index,
						prompt: item.prompt as unknown as Prisma.InputJsonValue,
						interaction: item.interaction as unknown as Prisma.InputJsonValue,
						grading: item.grading as unknown as Prisma.InputJsonValue,
						locale: item.locale as unknown as Prisma.InputJsonValue,
						discarded: index >= items.length,
						activityVersionId: versionId
					}))
				});

				return tx.activityVersion.findUniqueOrThrow({
					where: { id: versionId },
					include: { items: { orderBy: { order: 'asc' } } }
				});
			});
		},

		/**
		 * Descarta ou aceita um item do rascunho. O item NÃO é apagado: fica
		 * marcado e some da publicação, para o professor poder voltar atrás na
		 * própria tela de revisão. Item de versão publicada nunca é tocado.
		 * Aceitar põe a questão no FIM do roteiro (`ordemComEntradas`) — é o que
		 * a revisão promete, e é onde o professor a procura.
		 */
		async setDraftItemDiscarded(
			activityId: string,
			itemId: string,
			discarded: boolean
		): Promise<boolean> {
			const draft = await this.draft(activityId);
			if (!draft) return false;
			const item = draft.items.find((i) => i.id === itemId);
			if (!item) return false;
			if (discarded || !item.discarded) {
				await prisma.item.update({
					where: { id: itemId, activityVersionId: draft.id },
					data: { discarded }
				});
				return true;
			}
			const ordem = ordemComEntradas(draft.items, [itemId]);
			await prisma.$transaction([
				prisma.item.update({
					where: { id: itemId, activityVersionId: draft.id },
					data: { discarded: false }
				}),
				...ordem.map((id, order) =>
					prisma.item.update({ where: { id, activityVersionId: draft.id }, data: { order } })
				)
			]);
			return true;
		},

		/** Aceita todas de uma vez, no fim do roteiro — o "Aceitar todas" da revisão. */
		async acceptAllDraftItems(activityId: string): Promise<number> {
			const draft = await this.draft(activityId);
			if (!draft) return 0;
			const fora = draft.items.filter((i) => i.discarded).map((i) => i.id);
			if (fora.length === 0) return 0;
			const ordem = ordemComEntradas(draft.items, fora);
			await prisma.$transaction([
				prisma.item.updateMany({
					where: { activityVersionId: draft.id, discarded: true },
					data: { discarded: false }
				}),
				...ordem.map((id, order) =>
					prisma.item.update({ where: { id, activityVersionId: draft.id }, data: { order } })
				)
			]);
			return fora.length;
		},

		/**
		 * Publica o rascunho: cria a `Publication` que congela aquela versão.
		 * A versão anterior continua existindo e quem está respondendo nela
		 * termina nela (regra inviolável nº 7).
		 *
		 * **Publicar de novo move o link.** `Publication.slug` é único no
		 * produto inteiro, então republicar com o mesmo endereço estourava
		 * `Unique constraint failed on Publication_slug_key` — o professor
		 * clicava, nada acontecia, e a atividade ficava com uma versão a mais
		 * sem publicação nenhuma. A publicação anterior NÃO é apagada (as
		 * tentativas apontam para ela): o slug dela vira `<slug>~<versão>`,
		 * que nenhum professor consegue escolher (o slug dele é
		 * `^[a-z0-9-]+$`, sem `~`), e o endereço público passa para a
		 * publicação nova. Quem está respondendo agora não sente nada: o
		 * Player resolve a questão pelo `attemptId`, não pelo slug.
		 */
		async publishDraft(activityId: string, slug: string, settings: Prisma.InputJsonValue) {
			const draft = await this.draft(activityId);
			if (!draft) return null;

			// O que o professor descartou não vai para a versão publicada. Aqui
			// eles somem de vez: a versão publicada é imutável, então não faz
			// sentido carregar item morto nela (regra inviolável nº 7).
			await prisma.item.deleteMany({ where: { activityVersionId: draft.id, discarded: true } });

			return prisma.$transaction(async (tx) => {
				const anterior = await tx.publication.findUnique({
					where: { slug },
					include: { activityVersion: { select: { activityId: true, versionNumber: true } } }
				});

				// O endereço sai do id da atividade, então isto não deveria
				// acontecer nunca. Se acontecer, não roube o link de ninguém.
				if (anterior && anterior.activityVersion.activityId !== activityId) {
					return null;
				}

				if (anterior) {
					await tx.publication.update({
						where: { id: anterior.id },
						data: { slug: `${slug}~${anterior.activityVersion.versionNumber}` }
					});
				}

				return tx.publication.create({
					data: { slug, settings, activityVersionId: draft.id }
				});
			});
		},

		/**
		 * O plano de geração da etapa de materiais: quantas questões entram e os
		 * tipos de cada material. `skills` é o bloco de cima da tela (a união dos
		 * tipos de todos os materiais). Devolve se era dele.
		 */
		async atualizarPlano(
			id: string,
			plano: { itemTarget: number; skills: string[]; tiposPorMaterial: Record<string, string[]> }
		): Promise<boolean> {
			const { count } = await db.activity.updateMany({
				where: { id, teacherId: teacher.id },
				data: {
					itemTarget: plano.itemTarget,
					skills: plano.skills,
					tiposPorMaterial: plano.tiposPorMaterial
				}
			});
			return count > 0;
		},

		/**
		 * A etapa 1 de uma atividade que já existe: título e nível, e os idiomas só
		 * quando quem chama decidiu que ainda podem mudar (sem material, sem
		 * questão, nunca publicada). Devolve se era dele.
		 */
		async atualizarDetalhes(
			id: string,
			campos: {
				title: string;
				level: string | null;
				idiomas?: { sourceLang: string; targetLang: string };
			}
		): Promise<boolean> {
			const { count } = await db.activity.updateMany({
				where: { id, teacherId: teacher.id },
				data: { title: campos.title, level: campos.level, ...(campos.idiomas ?? {}) }
			});
			return count > 0;
		},

		/**
		 * Uma questão escrita do zero, gravada só quando o professor salva o editor
		 * — já validada. Ela nascia no clique, com texto de exemplo e a resposta
		 * "resposta", e fechar o editor sem mexer deixava essa questão na atividade.
		 * Entra no fim das que estão DENTRO, antes do "associar" que fecha quando
		 * ele é a última (`ordemComEntradas`).
		 */
		async criarQuestaoManual(
			activityId: string,
			conteudo: {
				prompt: Prisma.InputJsonValue;
				interaction: Prisma.InputJsonValue;
				grading: Prisma.InputJsonValue;
				locale: Prisma.InputJsonValue;
			}
		) {
			const draft = await this.draftFromPublished(activityId);
			if (!draft) return null;
			return prisma.$transaction(async (tx) => {
				const criada = await tx.item.create({
					data: {
						sourceContentId: null,
						generatedBy: null,
						order: draft.items.length,
						...conteudo,
						activityVersionId: draft.id
					}
				});
				const ordem = ordemComEntradas(draft.items, [criada.id]);
				for (const [order, id] of ordem.entries()) {
					await tx.item.update({ where: { id }, data: { order } });
				}
				return criada;
			});
		},

		/**
		 * A ORDEM do roteiro do aluno: as questões de dentro na sequência que o
		 * professor arrastou, e as de fora depois delas, como estavam. `ids` tem de
		 * ser exatamente as de dentro do rascunho — uma lista que não bate (de
		 * outra atividade, faltando uma) é recusada inteira. Devolve se reordenou.
		 */
		async reordenarRascunho(activityId: string, ids: string[]): Promise<boolean> {
			const draft = await this.draft(activityId);
			if (!draft) return false;
			const dentro = draft.items.filter((i) => !i.discarded).map((i) => i.id);
			const pedidos = new Set(ids);
			if (pedidos.size !== ids.length || ids.length !== dentro.length) return false;
			if (!dentro.every((id) => pedidos.has(id))) return false;
			const fora = draft.items.filter((i) => i.discarded).map((i) => i.id);
			await prisma.$transaction(
				[...ids, ...fora].map((id, order) =>
					prisma.item.update({ where: { id, activityVersionId: draft.id }, data: { order } })
				)
			);
			return true;
		},

		/** Troca o nível (rótulo). Nulo = sem nível. Quem chama já validou contra a escala. */
		async definirNivel(id: string, level: string | null): Promise<boolean> {
			const { count } = await db.activity.updateMany({
				where: { id, teacherId: teacher.id },
				data: { level }
			});
			return count > 0;
		},

		/**
		 * Arquiva: a atividade sai do estoque do plano (libera a vaga), o link
		 * FECHA para quem ainda não começou e os resultados ficam
		 * (docs/adr-002-billing.md). Nada é apagado. Devolve se era dele.
		 */
		async arquivar(id: string): Promise<boolean> {
			return (await this.arquivarVarias([id])) > 0;
		},

		/**
		 * Arquiva várias de uma vez (a lista de atividades, em massa). Só as DESTE
		 * professor e só as que ainda não estavam arquivadas: o id de outro passa
		 * em silêncio, sem dizer se existe (auth.md). Devolve quantas mudaram.
		 */
		async arquivarVarias(ids: string[]): Promise<number> {
			const { count } = await db.activity.updateMany({
				where: { id: { in: ids }, teacherId: teacher.id, archivedAt: null },
				data: { archivedAt: new Date() }
			});
			return count;
		},

		/** Quantas destas estão arquivadas — a vaga que desarquivar vai pedir. */
		contarArquivadas(ids: string[]): Promise<number> {
			return db.activity.count({
				where: { id: { in: ids }, teacherId: teacher.id, archivedAt: { not: null } }
			});
		},

		/** Desarquiva várias. Quem chama confere a vaga ANTES, dentro da trava de cota. */
		async desarquivarVarias(ids: string[]): Promise<number> {
			const { count } = await db.activity.updateMany({
				where: { id: { in: ids }, teacherId: teacher.id, archivedAt: { not: null } },
				data: { archivedAt: null }
			});
			return count;
		},

		/** Desarquiva. Quem chama confere a vaga ANTES, dentro da trava de cota. */
		async desarquivar(id: string): Promise<boolean> {
			const { count } = await db.activity.updateMany({
				where: { id, teacherId: teacher.id, archivedAt: { not: null } },
				data: { archivedAt: null }
			});
			return count > 0;
		},

		/**
		 * Apaga DE VEZ, com as tentativas e os resultados — o professor confirma
		 * na tela sabendo disso. Devolve falso quando a atividade não existe ou
		 * é de outro professor (sem distinguir os dois, auth.md).
		 *
		 * A ordem é obrigatória: `Publication→ActivityVersion`, `Attempt→Publication`
		 * e `AttemptItem→Item` são `RESTRICT` no banco. Tentativa primeiro (leva os
		 * `AttemptItem` em cascata e solta os itens), publicação depois (leva
		 * envios e convites), e por fim a atividade (versões, itens, vínculos com
		 * material e com módulo). **Não** trocar esses RESTRICT por Cascade: são eles
		 * que impedem que apagar um professor, ou uma versão, leve junto respostas
		 * de aluno por acidente.
		 *
		 * O áudio (`MediaAsset`) não sai aqui: é do professor, identificado pelo
		 * conteúdo, e outra atividade pode usar o mesmo arquivo. Quem chama roda
		 * `limparAudioSemUso` depois (`server/tts/limpeza.ts`). As gravações de fala
		 * do aluno (`fala/`) vencem pela regra de ciclo de vida do bucket, como em
		 * `apagarTentativa`.
		 */
		async apagarDeVez(id: string): Promise<boolean> {
			return (await this.apagarVariasDeVez([id])) > 0;
		},

		/**
		 * Apaga várias DE VEZ, numa transação só (a lista, em massa), na mesma
		 * ordem dos `RESTRICT` de `apagarDeVez`. O escopo entra nas três escritas:
		 * o id de outro professor não leva nada dele junto. Devolve quantas saíram.
		 */
		async apagarVariasDeVez(ids: string[]): Promise<number> {
			const dono = { id: { in: ids }, teacherId: teacher.id };
			return prisma.$transaction(async (tx) => {
				await tx.attempt.deleteMany({
					where: { publication: { activityVersion: { activity: dono } } }
				});
				await tx.publication.deleteMany({ where: { activityVersion: { activity: dono } } });
				const { count } = await tx.activity.deleteMany({ where: dono });
				return count;
			});
		},

		/** Um item específico do rascunho, para o editor de item (nível 3). */
		async draftItem(activityId: string, itemId: string) {
			const draft = await this.draft(activityId);
			if (!draft) return null;
			return prisma.item.findFirst({ where: { id: itemId, activityVersionId: draft.id } });
		},

		/** Edição manual (nível 3). Só vale no rascunho. */
		async updateDraftItem(
			activityId: string,
			itemId: string,
			data: {
				prompt: Prisma.InputJsonValue;
				interaction: Prisma.InputJsonValue;
				grading: Prisma.InputJsonValue;
			}
		) {
			const draft = await this.draft(activityId);
			if (!draft) return null;
			const { count } = await prisma.item.updateMany({
				where: { id: itemId, activityVersionId: draft.id },
				data
			});
			return count > 0 ? prisma.item.findUnique({ where: { id: itemId } }) : null;
		}
	};
}
