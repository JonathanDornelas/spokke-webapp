import { z } from 'zod';
import { command, form, getRequestEvent, query } from '$app/server';
import { error, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { requireTeacher } from '$lib/server/auth/guard';
import { resolverNotificacoes } from '$lib/server/notificacoes';
import { motivoDoBloqueio } from '$lib/server/billing/entitlements';
import { acessoDoProfessor } from '$lib/server/billing/acesso';
import { comCota, motivoDeCriar } from '$lib/server/billing/cota';
import { nivelOuNulo, nivelSchema } from '$lib/atividades/nivel';
import {
	MAX_LINHAS_POR_LOTE,
	avisoDeLimite,
	gravarMateriais
} from '$lib/server/atividades/gravar-materiais';
import { atividades } from '$lib/server/db/repos/activities';
import { materiais } from '$lib/server/db/repos/content-units';
import { isTtsConfigured } from '$lib/server/tts';
import { playerRepo } from '$lib/server/db/repos/player';
import { buildRuntimeItem, itemAudioHashes } from '$lib/server/player/runtime';
import { edicaoDoItemSchema, montarItemEditado } from '$lib/server/atividades/item-editado';
import { enfileirarAudioFaltante } from '$lib/server/tts/enfileirar';
import { limparAudioSemUso } from '$lib/server/tts/limpeza';
import { isAsrConfigured } from '$lib/server/asr';
import { gerarCodigoAcesso, normalizarCodigoAcesso } from '$lib/server/player/access-code';
import { linkDaAtividade } from '$lib/server/player/slug';
import { runGenerators } from '$lib/kernel/generators';
import { MAX_ITENS, selectItems } from '$lib/kernel/generators/select';
import { skillSchema } from '$lib/kernel/interactions/skill-schema';
import { parseContentUnit } from '$lib/kernel/content/parse';
import { parseRawMaterial } from '$lib/kernel/content/parse-raw';
import {
	camposMaterial,
	montarMaterial,
	preencherTraducao,
	traduzirLote
} from '$lib/server/atividades/material-form';
import { getTradutor } from '$lib/server/traducao';
import { paresDasFrases } from '$lib/server/atividades/pares-de-palavras';
import { getProfile, tagForLabel } from '$lib/kernel/language/profiles';
import { interactionSchema } from '$lib/kernel/item';
import type { Skill } from '$lib/kernel/interactions/types';
import { getInteraction } from '$lib/kernel/interactions/registry';
import { transcritorPara } from '$lib/server/escrita';
import { liberarEnviosQueEsperavamPublicacao } from '$lib/server/modulos/programacao';
import type { Prisma } from '../../../../generated/prisma/client.ts';

/**
 * O wizard de criação — nível 1 e 2 de autoria (kernel.md). **Toda remote
 * function é um endpoint HTTP público** (regra inviolável nº 3): cada uma
 * começa pelo guard de sessão, e nenhuma toca o Prisma cru — só os
 * repositórios, que injetam o `teacherId` (regra nº 4).
 */

function teacherOf() {
	return requireTeacher(getRequestEvent().locals);
}

async function activityOr404(activityId: string) {
	const teacher = teacherOf();
	const activity = await atividades(teacher).byId(activityId);
	// Não distinga "não existe" de "não é seu" — isso vaza a existência do
	// recurso (auth.md).
	if (!activity) error(404, 'Atividade não encontrada');
	return { teacher, activity };
}

/**
 * Atividade arquivada está fora do estoque e com o link fechado para quem não
 * começou (docs/adr-002-billing.md): gerar, regerar áudio e publicar exigem
 * desarquivar antes — que é onde a vaga do plano é conferida.
 */
function recusarArquivada(activity: { archivedAt: Date | null }) {
	if (activity.archivedAt) error(409, 'Esta atividade está arquivada. Desarquive para mexer nela.');
}

/**
 * Arquivar: libera a vaga do plano, fecha o link para quem ainda não começou e
 * guarda os resultados. Quem está no meio de uma tentativa termina.
 */
export const arquivarAtividade = command(
	z.object({ activityId: z.string() }),
	async ({ activityId }) => {
		const { teacher } = await activityOr404(activityId);
		return { ok: await atividades(teacher).arquivar(activityId) };
	}
);

/** Desarquivar volta a ocupar vaga — conferida dentro da trava de cota. */
export const desarquivarAtividade = command(
	z.object({ activityId: z.string() }),
	async ({ activityId }) => {
		const teacher = teacherOf();
		return comCota(teacher, 'atividades', 1, async (tx, cabem, estado) => {
			const repo = atividades(teacher, tx);
			if (!(await repo.byId(activityId))) error(404, 'Atividade não encontrada');
			if (cabem < 1) {
				return {
					ok: false as const,
					motivo: motivoDeCriar(estado, 'atividades'),
					error: 'Não cabe no seu plano: arquive outra atividade antes, ou escolha um plano maior.'
				};
			}
			return { ok: await repo.desarquivar(activityId) };
		});
	}
);

/**
 * Apagar DE VEZ, com tentativas e resultados. A tela pede para digitar o
 * título antes — `confirmacao` é conferida aqui também, porque toda remote
 * function é endpoint público e um POST direto não passa pela tela.
 */
export const apagarAtividade = command(
	z.object({ activityId: z.string(), confirmacao: z.string() }),
	async ({ activityId, confirmacao }) => {
		const { teacher, activity } = await activityOr404(activityId);
		if (confirmacao.trim() !== activity.title.trim()) {
			return { ok: false as const, error: 'Digite o título exatamente como está para apagar.' };
		}
		const apagada = await atividades(teacher).apagarDeVez(activityId);
		// O áudio de atividade não vence: o que só ela usava sai AGORA, e o que
		// outra atividade do professor também usa fica (server/tts/limpeza.ts).
		// Falhar aqui não desfaz o apagar — o que sobrar sai na próxima limpeza.
		if (apagada) await limparAudioSemUso(teacher.id).catch((erro) => console.warn(erro));
		return { ok: apagada };
	}
);

/** Troca o nível da atividade. Vale na hora para quem abrir o link — é rótulo, não versão. */
export const definirNivel = command(
	z.object({ activityId: z.string(), level: nivelSchema.nullable() }),
	async ({ activityId, level }) => {
		const { teacher } = await activityOr404(activityId);
		return { ok: await atividades(teacher).definirNivel(activityId, level) };
	}
);

export const criarAtividade = form(
	z.object({
		title: z.string().min(1, 'Dê um título para a atividade'),
		targetLang: z.string(),
		sourceLang: z.string(),
		/**
		 * Quantas questões gerar. `string` porque é o que um formulário manda —
		 * um schema de `form()` só aceita campos de formulário, e `z.coerce`
		 * quebra a inferência do tipo inteiro. O teto é aplicado abaixo, no
		 * servidor, e não só no `max` do input: remote function é endpoint HTTP
		 * público (regra nº 3) e um POST direto ignora o atributo do HTML.
		 */
		itemTarget: z.string().optional(),
		/**
		 * Habilidades desejadas, separadas por vírgula. Uma string em vez de N
		 * checkboxes com o mesmo `name`: o componente monta a lista e manda um
		 * campo só — mesmo padrão de `questions`/`lines` na etapa 2. Vazio =
		 * todas.
		 */
		skills: z.string().optional(),
		/**
		 * O nível (CEFR), OPCIONAL — um rótulo, não muda os exercícios
		 * (`$lib/atividades/nivel.ts`). Fora da escala é descartado em silêncio,
		 * como as habilidades: é um POST forjado, não erro do professor.
		 */
		level: z.string().optional()
	}),
	async ({ title, targetLang, sourceLang, itemTarget, skills, level }) => {
		const teacher = teacherOf();
		const pedido = Number.parseInt(itemTarget ?? '', 10);
		const alvo = Number.isFinite(pedido) ? Math.min(Math.max(pedido, 1), MAX_ITENS) : 12;
		const desejadas = (skills ?? '')
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean);
		// Valor fora da lista é descartado em silêncio: é um POST forjado, não
		// um erro do professor a explicar na tela.
		const validas = desejadas.filter((s) => skillSchema.safeParse(s).success);

		// Cota de ESTOQUE (docs/adr-002-billing.md): conta e cria dentro da mesma
		// trava, senão duas abas criando juntas passavam do limite.
		const criada = await comCota(teacher, 'atividades', 1, async (tx, cabem, estado) => {
			if (cabem < 1) return { motivo: motivoDeCriar(estado, 'atividades') };
			const activity = await atividades(teacher, tx).create(
				title.trim(),
				tagForLabel(sourceLang),
				tagForLabel(targetLang),
				{
					itemTarget: alvo,
					skills: validas.length > 0 ? validas : ['listening', 'speaking', 'reading', 'writing'],
					level: nivelOuNulo(level)
				}
			);
			return { id: activity.id };
		});
		if ('motivo' in criada) {
			// O rascunho não chegou a existir, então não há o que "continuar salvo":
			// a tela mostra o motivo e o caminho (`/planos?motivo=`).
			return {
				ok: false as const,
				motivo: criada.motivo,
				error:
					criada.motivo === 'criar'
						? 'Você chegou ao limite de atividades do seu plano.'
						: criada.motivo === 'trial'
							? 'O período de teste acabou.'
							: 'Seu plano não permite criar atividades agora.'
			};
		}
		redirect(303, resolve('/(studio)/atividades/[id]/materiais', { id: criada.id }));
	}
);

/**
 * Nível 1 de autoria. Cada tipo tem os SEUS campos: par de frases e
 * vocabulário são dois campos mais um opcional; texto tem perguntas de
 * compreensão (sem elas `passage-comprehension` devolve zero itens); diálogo
 * é uma lista de falas com falante, não um bloco colado com a convenção
 * "Nome:" — que caía em A/B alternado sem avisar.
 */
export const adicionarMaterial = form(
	z.object({ activityId: z.string(), ...camposMaterial }),
	async ({ activityId, ...campos }) => {
		const { teacher, activity } = await activityOr404(activityId);
		// Tradução em branco sai do tradutor, do idioma da atividade para a
		// língua do aluno dela (docs/adr-006-traducao.md).
		const comTraducao = await preencherTraducao(
			campos,
			{ de: activity.targetLang, para: activity.sourceLang },
			getTradutor()
		);
		if ('error' in comTraducao) return { ok: false as const, error: comTraducao.error };
		const montado = montarMaterial(comTraducao.campos);
		if ('error' in montado) return { ok: false as const, error: montado.error };

		// Material igual a um que o professor já tem é REAPROVEITADO, não
		// duplicado — a biblioteca é dele e duas linhas com a mesma frase são
		// duas coisas para manter em dia sem ganhar nada. E o novo respeita o
		// estoque do plano (`gravarMateriais`).
		const r = await gravarMateriais(teacher, {
			kind: campos.kind,
			unidades: [montado.dados],
			activityId
		});
		if (r.foraDoLimite > 0) {
			return {
				ok: false as const,
				error: avisoDeLimite(r) ?? 'Não coube no plano.',
				motivo: r.motivo
			};
		}
		return { ok: true as const, added: 1, reused: r.reaproveitados > 0 };
	}
);

/**
 * Colar uma lista de uma vez — é assim que o professor tem o material, e é o
 * que faz vinte frases virarem cem exercícios. Devolve quantas linhas foram
 * IGNORADAS: a versão antiga descartava em silêncio toda linha sem separador
 * e a etapa travava sem dizer por quê.
 */
export const adicionarMateriaisEmLote = form(
	z.object({
		activityId: z.string(),
		kind: z.enum(['SentencePair', 'VocabItem']),
		raw: z.string()
	}),
	async ({ activityId, kind, raw }) => {
		const { teacher, activity } = await activityOr404(activityId);
		const tradutor = getTradutor();

		const linhas = raw.split('\n').filter((linha) => linha.trim()).length;
		// Com tradutor, a linha sem separador ENTRA e a tradução vem dele.
		const lidas = parseRawMaterial(kind, raw, { traduzirSemSeparador: !!tradutor });
		if (lidas.length === 0) {
			return {
				ok: false as const,
				error: 'Nenhuma linha tem o separador. Use "alvo · tradução", um por linha.'
			};
		}

		if (lidas.length > MAX_LINHAS_POR_LOTE) {
			return {
				ok: false as const,
				error: `Cole até ${MAX_LINHAS_POR_LOTE} linhas por vez.`
			};
		}

		const traduzido = await traduzirLote(
			kind,
			lidas,
			{ de: activity.targetLang, para: activity.sourceLang },
			tradutor
		);
		if ('error' in traduzido) return { ok: false as const, error: traduzido.error };
		const unidades = traduzido.unidades;

		const r = await gravarMateriais(teacher, { kind, unidades, activityId });
		if (r.criados === 0 && r.reaproveitados === 0) {
			return {
				ok: false as const,
				error: avisoDeLimite(r) ?? 'Nada coube no plano.',
				motivo: r.motivo
			};
		}
		return {
			ok: true as const,
			added: r.criados + r.reaproveitados,
			ignored: linhas - unidades.length,
			// Quantas traduções vieram do tradutor — é o que o professor confere.
			traduzidas: traduzido.traduzidas,
			// Colar a lista da aula passada de novo é comum — dizer quantas linhas
			// já existiam evita o professor achar que duplicou tudo.
			reused: r.reaproveitados,
			foraDoLimite: r.foraDoLimite,
			aviso: avisoDeLimite(r),
			motivo: r.motivo
		};
	}
);

/** Edição de um material já cadastrado, com os mesmos campos da adição. */
export const editarMaterial = form(
	z.object({ activityId: z.string(), contentId: z.string(), ...camposMaterial }),
	async ({ activityId, contentId, ...campos }) => {
		const { teacher, activity } = await activityOr404(activityId);
		const comTraducao = await preencherTraducao(
			campos,
			{ de: activity.targetLang, para: activity.sourceLang },
			getTradutor()
		);
		if ('error' in comTraducao) return { ok: false as const, error: comTraducao.error };
		const montado = montarMaterial(comTraducao.campos);
		if ('error' in montado) return { ok: false as const, error: montado.error };

		const atualizado = await materiais(teacher).update(contentId, campos.kind, montado.dados);
		if (!atualizado) error(404, 'Material não encontrado');
		return { ok: true as const };
	}
);

/**
 * Traz materiais da biblioteca para a atividade. Recebe uma LISTA porque é
 * assim que o professor escolhe: ele marca as frases que quer da aula
 * passada e traz de uma vez — um clique por material fazia ele repetir a
 * viagem até o servidor a cada linha.
 */
export const usarDaBiblioteca = command(
	z.object({ activityId: z.string(), contentIds: z.array(z.string()).min(1).max(200) }),
	async ({ activityId, contentIds }) => {
		const { teacher } = await activityOr404(activityId);
		const repo = materiais(teacher);

		let vinculados = 0;
		for (const contentId of contentIds) {
			if (await repo.link(activityId, contentId)) vinculados++;
		}
		return { ok: vinculados > 0, linked: vinculados };
	}
);

/** O que está na biblioteca e ainda NÃO está nesta atividade. */
export const materiaisDisponiveis = query(
	z.object({ activityId: z.string() }),
	async ({ activityId }) => {
		const { teacher } = await activityOr404(activityId);
		const [todos, jaNaAtividade] = await Promise.all([
			materiais(teacher).list(),
			materiais(teacher).byActivity(activityId)
		]);
		const usados = new Set(jaNaAtividade.map((m) => m.id));
		return todos
			.filter((m) => !usados.has(m.id))
			.map((m) => {
				const dados = parseContentUnit(m.kind, m.data);
				const [primary, secondary] =
					'target' in dados
						? [dados.target, dados.source]
						: 'term' in dados
							? [dados.term, dados.translation]
							: 'title' in dados
								? [dados.title, dados.text.slice(0, 60)]
								: [dados.lines[0]?.text ?? '', `${dados.lines.length} falas`];
				const kind = (
					{
						SentencePair: 'pair',
						VocabItem: 'vocab',
						Passage: 'text',
						Dialogue: 'dialogue'
					} as const
				)[m.kind];
				// `note` e `example` vão junto porque a tela compara o material
				// inteiro para dizer "você já tem esta frase" enquanto o professor
				// digita — o servidor reaproveita por igualdade de jsonb, e a nota
				// faz parte dela. Sem os dois a tela prometia reaproveitar e o
				// servidor gravava outro.
				return {
					id: m.id,
					kind,
					primary,
					secondary,
					/** A tag de idioma — o painel filtra pelo idioma da atividade. */
					idioma: m.targetLang,
					note: 'note' in dados ? (dados.note ?? '') : '',
					example: 'example' in dados ? (dados.example ?? '') : ''
				};
			});
	}
);

export const removerMaterial = command(
	z.object({ activityId: z.string(), contentId: z.string() }),
	async ({ activityId, contentId }) => {
		const { teacher } = await activityOr404(activityId);
		// Tira da atividade, não da biblioteca: o material pode estar em uso
		// em outra (paginas.md "Materiais").
		return { removed: await materiais(teacher).unlink(activityId, contentId) };
	}
);

/**
 * Nível 2: roda os geradores sobre o material do professor e grava o
 * resultado como RASCUNHO. Rascunho é uma `ActivityVersion` sem
 * `Publication` — publicar congela essa mesma versão (regra nº 7), então
 * nada aqui toca em versão já publicada.
 */
export const gerarItens = command(z.object({ activityId: z.string() }), async ({ activityId }) => {
	const { teacher, activity } = await activityOr404(activityId);
	recusarArquivada(activity);

	// Só o material DESTA atividade — a biblioteca inteira geraria itens de
	// conteúdo que não pertence a ela.
	const units = await materiais(teacher).byActivity(activityId);
	if (units.length === 0) error(400, 'Adicione ao menos um material antes de gerar itens.');

	const targetProfile = getProfile(activity.targetLang);
	const sourceProfile = getProfile(activity.sourceLang);
	const { groups, closing } = runGenerators(units, {
		targetProfile,
		sourceProfile,
		seed: activity.id,
		capabilities: { asr: isAsrConfigured(), tts: isTtsConfigured() },
		// A leitura da frase (kana, pinyin) entra no gabarito das questões de
		// digitar — e fica visível e editável no editor de item.
		transcrever: await transcritorPara(targetProfile),
		// Palavras das frases, traduzidas, para o "ligue os pares" do fecho quando
		// o vocabulário cadastrado não o enche (vazio sem tradutor).
		palavrasTraduzidas: await paresDasFrases(
			units,
			{ alvo: targetProfile, origem: sourceProfile },
			getTradutor()
		)
	});

	// O que os geradores produziram é a matéria-prima; o que vira rascunho é o
	// que o professor pediu na etapa 1 — quantas questões e quais habilidades.
	// Sem este corte, 20 frases viravam cem exercícios e ele descartava 88 na
	// mão.
	const disponiveis = groups.reduce((total, group) => total + group.items.length, 0);
	const items = selectItems(
		groups,
		{
			target: activity.itemTarget,
			skills: activity.skills.filter(
				(skill): skill is Skill => skillSchema.safeParse(skill).success
			)
		},
		closing
	);
	await atividades(teacher).replaceDraftItems(activityId, items);

	// **O áudio começa a ser sintetizado AQUI, não na publicação.** A etapa 4
	// libera o botão só quando todos os arquivos existem, e enfileirar apenas
	// dentro de `publicarAtividade` era um impasse: o professor não conseguia
	// publicar porque faltava áudio, e o áudio não era pedido porque ele não
	// conseguia publicar. Gerando agora, a espera acontece enquanto ele revisa.
	await enfileirarAudioFaltante({
		teacherId: teacher.id,
		targetTag: activity.targetLang,
		items
	});

	return { generated: items.length, groups: groups.length, available: disponiveis };
});

/**
 * Descartar não apaga: marca. O item continua no rascunho para o professor
 * poder restaurar na mesma tela — só não entra na versão publicada.
 */
export const descartarItem = command(
	z.object({ activityId: z.string(), itemId: z.string(), descartado: z.boolean().default(true) }),
	async ({ activityId, itemId, descartado }) => {
		const { teacher } = await activityOr404(activityId);
		return {
			ok: await atividades(teacher).setDraftItemDiscarded(activityId, itemId, descartado)
		};
	}
);

export const aceitarTodosItens = command(
	z.object({ activityId: z.string() }),
	async ({ activityId }) => {
		const { teacher } = await activityOr404(activityId);
		return { restaurados: await atividades(teacher).acceptAllDraftItems(activityId) };
	}
);

/**
 * Sintetiza os áudios da atividade de novo, do zero.
 *
 * O caso de uso é o áudio que FALTA — um job que esgotou as tentativas, um
 * arquivo que não chegou ao bucket. O áudio de atividade não vence mais, então
 * isto é conserto, não rotina: a tela só oferece o botão quando falta algo.
 *
 * Apaga as linhas antes de enfileirar porque o worker pula o que já existe; a
 * síntese nova grava na mesma chave do bucket.
 *
 * Enquanto a fila não drena a atividade fica com áudio pendente — ou seja, o
 * link não responde. É honesto: por alguns minutos ela realmente não tem o
 * áudio, e servir a questão de escuta muda seria pior.
 */
export const regerarAudio = command(
	z.object({ activityId: z.string() }),
	async ({ activityId }) => {
		const { teacher, activity } = await activityOr404(activityId);
		// Arquivada não tem link aberto para novas tentativas: regerar áudio ali
		// seria síntese para ninguém.
		recusarArquivada(activity);

		const [draft, published] = await Promise.all([
			atividades(teacher).draft(activityId),
			atividades(teacher).published(activityId)
		]);
		// Os dois: o que está no ar é o que o aluno pega agora, e o rascunho é o
		// que vai para o ar na próxima publicação. Regerar só um deixaria o outro
		// para trás.
		const itens = [...(published?.items ?? []), ...(draft?.items ?? [])];
		const hashes = itens.flatMap((item) => itemAudioHashes(item, activity.targetLang));
		if (hashes.length === 0) return { ok: true, enfileirados: 0 };

		await playerRepo.esquecerAudios(teacher.id, hashes);
		await resolverNotificacoes(teacher.id, [`audio:${activityId}`]);
		const enfileirados = await enfileirarAudioFaltante({
			teacherId: teacher.id,
			targetTag: activity.targetLang,
			items: itens
		});
		return { ok: true, enfileirados };
	}
);

/** Autoria manual (nível 3): cria o item vazio e devolve o id para abrir o editor. */
export const criarItemManual = command(
	z.object({ activityId: z.string() }),
	async ({ activityId }) => {
		const { teacher, activity } = await activityOr404(activityId);
		const item = await atividades(teacher).createManualDraftItem(activityId, {
			source: activity.sourceLang,
			target: activity.targetLang
		});
		if (!item) error(400, 'Gere os itens antes de criar um item do zero.');
		return { itemId: item.id };
	}
);

/**
 * Nível 3: edição manual de um item — o editor de questão. Quem decide o que
 * vale é `montarItemEditado` (`$lib/server/atividades/item-editado.ts`), o
 * MESMO que a prévia usa: a tela não oferece o que o servidor recusaria, e o
 * que o formulário não edita (a língua da resposta, por exemplo) é mantido.
 *
 * Mudou o texto de um prompt de áudio, o arquivo antigo não serve mais: o TTS
 * novo é pedido AQUI, para a síntese acontecer enquanto o professor revisa (a
 * etapa 4 também repõe, mas aí ele já está esperando).
 */
export const salvarItem = form(
	edicaoDoItemSchema.extend({ activityId: z.string(), itemId: z.string() }),
	async ({ activityId, itemId, ...edicao }) => {
		const { teacher, activity } = await activityOr404(activityId);

		const atual = await atividades(teacher).draftItem(activityId, itemId);
		if (!atual) error(404, 'Item não encontrado neste rascunho');

		const editado = montarItemEditado(atual, edicao);
		if (!editado.ok) return { ok: false as const, error: editado.error };

		const updated = await atividades(teacher).updateDraftItem(activityId, itemId, {
			// Os três já passaram pelos schemas do kernel em `montarItemEditado`; o
			// `unknown` só atravessa o tipo de JSON do Prisma, que não aceita interface.
			prompt: editado.prompt as unknown as Prisma.InputJsonValue,
			interaction: editado.interaction as unknown as Prisma.InputJsonValue,
			grading: editado.grading as unknown as Prisma.InputJsonValue
		});
		if (!updated) error(404, 'Item não encontrado neste rascunho');

		if (editado.audioMudou) {
			await enfileirarAudioFaltante({
				teacherId: teacher.id,
				targetTag: activity.targetLang,
				items: [updated]
			});
		}
		return { ok: true as const };
	}
);

/**
 * A prévia do editor de questão: o item COMO FICARIA com o que está no
 * formulário, passado pela mesma porta do Player (`buildRuntimeItem` →
 * `toRuntime()`). Nada é gravado. O gabarito chega aqui (é a tela do
 * professor, atrás do guard) e não volta: o que sai é o payload do aluno.
 */
export const previaDoItem = query(
	edicaoDoItemSchema.extend({ activityId: z.string(), itemId: z.string() }),
	async ({ activityId, itemId, ...edicao }) => {
		const { teacher, activity } = await activityOr404(activityId);
		const atual = await atividades(teacher).draftItem(activityId, itemId);
		if (!atual) error(404, 'Item não encontrado neste rascunho');

		const editado = montarItemEditado(atual, edicao);
		if (!editado.ok) return { ok: false as const, error: editado.error };

		const row = {
			id: atual.id,
			prompt: editado.prompt,
			interaction: editado.interaction,
			grading: editado.grading,
			locale: atual.locale
		};
		const hashes = itemAudioHashes(row, activity.targetLang);
		const assets = await playerRepo.mediaUrls(teacher.id, hashes);
		const urlByHash = new Map(assets.map((asset) => [asset.hash, asset.url]));
		try {
			return {
				ok: true as const,
				runtime: buildRuntimeItem(row, `previa:${itemId}`, urlByHash),
				// Texto de áudio novo ainda não tem arquivo: a tela diz isso em vez
				// de mostrar um player que não toca.
				audioPendente: hashes.length > 0 && assets.length < hashes.length
			};
		} catch {
			return {
				ok: false as const,
				error: 'Os campos desta questão não formam um exercício ainda.'
			};
		}
	}
);

/**
 * Publicar congela o rascunho e enfileira o TTS que falta. A publicação só
 * fica acessível quando todos os áudios existem (server.md "TTS") — o link
 * responde `audioPending` até lá.
 */
export const publicarAtividade = form(
	z.object({
		// O link NÃO é campo do formulário: ele sai do id da atividade
		// (`player/slug.ts`). Aceitar um slug do cliente aqui seria aceitar que
		// alguém escolhesse o endereço de outra pessoa por um POST direto.
		activityId: z.string(),
		// Checkbox não manda nada quando desmarcado — por isso `string`
		// opcional em vez de boolean (é o que o `form()` do SvelteKit exige).
		requireCode: z.string().optional(),
		showResult: z.string().optional(),
		/** As 4 letras que o professor dita. Vazio = o servidor sorteia. */
		accessCode: z.string().optional()
	}),
	async ({ activityId, requireCode: requireCodeRaw, showResult: showResultRaw, accessCode }) => {
		const requireCode = requireCodeRaw !== undefined;
		const showResult = showResultRaw !== undefined;
		const { teacher, activity } = await activityOr404(activityId);
		if (activity.archivedAt) {
			return { ok: false, error: 'Esta atividade está arquivada. Desarquive para publicar.' };
		}

		// Ponto único de decisão de acesso — nunca espalhe
		// `subscriptionStatus === 'active'` (billing.md "Entitlements").
		const bloqueio = motivoDoBloqueio(await acessoDoProfessor(teacher), 'publicar_atividade');
		if (bloqueio) {
			// `motivo` existe para a TELA poder oferecer o caminho de saída
			// (`/planos?motivo=…`) sem ler a frase de erro por dentro: comparar
			// string de mensagem quebra no dia em que alguém melhora o texto. O
			// rascunho continua salvo — publicar é o que não acontece.
			return {
				ok: false,
				error:
					bloqueio === 'trial'
						? 'O período de teste acabou. Escolha um plano para publicar.'
						: 'Seu plano não permite publicar agora.',
				motivo: bloqueio
			};
		}

		const draft = await atividades(teacher).draft(activityId);
		if (!draft || draft.items.length === 0) {
			return { ok: false, error: 'Gere os itens antes de publicar.' };
		}

		// A versão publicada é IMUTÁVEL (regra nº 7): item com payload que não
		// valida rebentaria em `toRuntime()` na tela do aluno e não teria como
		// ser corrigido depois. Barrar aqui é a única chance.
		const aPublicar = draft.items.filter((item) => !item.discarded);
		if (aPublicar.length === 0) {
			return { ok: false, error: 'Todos os itens estão descartados.' };
		}
		for (const [posicao, item] of aPublicar.entries()) {
			const interaction = interactionSchema.parse(item.interaction);
			const valido = getInteraction(interaction.type).authoringSchema.safeParse(
				interaction.payload
			);
			if (!valido.success) {
				return {
					ok: false,
					error: `O item ${posicao + 1} está incompleto. Abra-o no editor ou descarte-o.`
				};
			}
		}

		// Repõe o que falta antes de olhar o placar: o áudio pertence ao MATERIAL
		// (db.md), então reusar a frase de outra atividade já vem pronto, e só o
		// que mudou desde a geração precisa de síntese.
		const faltando = await enfileirarAudioFaltante({
			teacherId: teacher.id,
			targetTag: activity.targetLang,
			items: draft.items
		});

		// **Publicar com áudio faltando é barrado AQUI, não só no botão.** A tela
		// desabilita a ação, mas toda remote function é um endpoint HTTP público
		// (regra nº 3) — e a versão publicada é imutável (regra nº 7), então um
		// POST direto congelaria para sempre uma atividade cujas questões de
		// escuta não tocam. Nem republicar consertaria: o aluno que abrisse o
		// link no meio já teria a versão muda.
		const hashes = aPublicar.flatMap((item) => itemAudioHashes(item, activity.targetLang));
		const audio = await playerRepo.audioReady(teacher.id, hashes);
		if (audio.done < audio.total) {
			return {
				ok: false,
				error: `O áudio ainda está sendo gerado (${audio.done} de ${audio.total}). Assim que terminar, o botão libera sozinho.`
			};
		}

		// Único por construção: o endereço sai do id da atividade, então não
		// existe colisão entre professores e não há disponibilidade a checar.
		const slug = linkDaAtividade(activityId);

		// O código NÃO sai do slug: o slug está no link, então derivar dele
		// deixaria o código público junto. Sem um válido digitado, sorteia.
		const codigo = requireCode ? (normalizarCodigoAcesso(accessCode) ?? gerarCodigoAcesso()) : null;

		const publication = await atividades(teacher).publishDraft(activityId, slug, {
			requireCode,
			code: codigo,
			showResult
		});
		if (!publication) return { ok: false, error: 'Nada para publicar.' };

		// O envio programado de um módulo que esperava esta atividade sair do
		// rascunho sai agora, na próxima volta do worker — sem o professor ter de
		// achar o "tentar de novo" (docs/telas-modulos-professor.md 2.4).
		await liberarEnviosQueEsperavamPublicacao(teacher.id, activityId);

		// "pendente" é o que FALTA, não o total: republicar uma atividade cujo
		// áudio já está pronto não pode dizer ao professor que ele vai esperar.
		return {
			ok: true,
			slug: publication.slug,
			code: codigo,
			audioPending: faltando > 0
		};
	}
);
