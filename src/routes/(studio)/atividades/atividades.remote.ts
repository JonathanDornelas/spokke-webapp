import { z } from 'zod';
import { command, form, getRequestEvent, query } from '$app/server';
import { error, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { requireTeacher } from '$lib/server/auth/guard';
import { CHAVE, resolverNotificacoes } from '$lib/server/notificacoes';
import { motivoDoBloqueio } from '$lib/server/billing/entitlements';
import { acessoDoProfessor } from '$lib/server/billing/acesso';
import { comCota, motivoDeCriar } from '$lib/server/billing/cota';
import { nivelOuNulo, nivelSchema } from '$lib/atividades/nivel';
import { TETO_DO_TITULO } from '$lib/atividades/titulo';
import {
	MAX_LINHAS_POR_LOTE,
	avisoDeLimite,
	gravarMateriais
} from '$lib/server/atividades/gravar-materiais';
import { atividades } from '$lib/server/db/repos/activities';
import { materiais } from '$lib/server/db/repos/content-units';
import { isTtsConfigured } from '$lib/server/tts';
import { playerRepo, linhasPorHash } from '$lib/server/db/repos/player';
import { buildRuntimeItem, itemAudioHashes, type StoredItemRow } from '$lib/server/player/runtime';
import { montarQuestao, questaoDoItem } from '$lib/server/atividades/item-editado';
import { iniciarGeracao, progressoDaGeracao as andamentoDe } from '$lib/server/atividades/geracao';
import { resumirQuestao } from '$lib/server/atividades/questao-resumida';
import { umaPorHabilidade } from '$lib/atividades/questao-resumida';
import { corrigirSemGravar } from '$lib/server/player/veredito';
import { enfileirarAudioFaltante } from '$lib/server/tts/enfileirar';
import { limparAudioSemUso } from '$lib/server/tts/limpeza';
import { isAsrConfigured } from '$lib/server/asr';
import { gerarCodigoAcesso, normalizarCodigoAcesso } from '$lib/server/player/access-code';
import { linkDaAtividade } from '$lib/server/player/slug';
import { runGenerators } from '$lib/kernel/generators';
import { MAX_ITENS, entraComOsTipos } from '$lib/kernel/generators/select';
import { skillSchema } from '$lib/kernel/interactions/skill-schema';
import { parseContentUnit } from '$lib/kernel/content/parse';
import type { ContentUnitKind } from '$lib/kernel/content/types';
import { parseRawMaterial } from '$lib/kernel/content/parse-raw';
import {
	camposMaterial,
	montarMaterial,
	nenhumaLinhaEntrou,
	preencherTraducao,
	traduzirLote
} from '$lib/server/atividades/material-form';
import { getTradutor } from '$lib/server/traducao';
import { getProfile, tagForLabel } from '$lib/kernel/language/profiles';
import { interactionSchema, promptSchema, gradingSchema } from '$lib/kernel/item';
import { getInteraction } from '$lib/kernel/interactions/registry';
import { transcritorPara } from '$lib/server/escrita';
import { foneticaDoIdioma } from '$lib/server/pronuncia';
import { mostraDoDialogo } from '$lib/kernel/generators/dialogue';
import { dialogueSchema } from '$lib/kernel/content/types';
import { liberarEnviosQueEsperavamPublicacao } from '$lib/server/modulos/programacao';
import { montarPlano, tiposPorMaterialSchema } from '$lib/atividades/tipos-por-material';
import { mostraDoPrompt, questaoSchema, tipoDaQuestao } from '$lib/atividades/questao';
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
 * A questão "criada do zero" de antes nascia com um texto de exemplo, e um
 * rascunho antigo ainda pode tê-la. Ela valida no schema, então só o texto a
 * denuncia: publicada, o aluno receberia "Escreva a frase e marque a lacuna".
 */
function ehMarcadorAntigo(interaction: { type: string; payload: unknown }): boolean {
	const p = interaction.payload;
	return (
		interaction.type === 'cloze' &&
		typeof p === 'object' &&
		p !== null &&
		'masked' in p &&
		p.masked === 'Escreva a frase e marque a lacuna com ___'
	);
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

// ── em massa, na lista de atividades ────────────────────────────────────
// Os ids vêm da tela, mas o escopo vem da sessão: o repositório só toca o que é
// deste professor, e o id de outro passa em silêncio (auth.md). O teto da lista
// é do tamanho de uma biblioteca grande, não do que a tela mostra numa página.
const idsDaLista = z.array(z.string()).min(1).max(500);

/** A palavra que confirma apagar em massa — a tela pede, e o servidor confere de novo. */
const CONFIRMA_APAGAR = 'apagar';

export const arquivarAtividades = command(
	z.object({ activityIds: idsDaLista }),
	async ({ activityIds }) => {
		const teacher = teacherOf();
		return { ok: true as const, quantas: await atividades(teacher).arquivarVarias(activityIds) };
	}
);

/** Desarquivar em massa volta a ocupar vaga: todas cabem, ou nenhuma muda. */
export const desarquivarAtividades = command(
	z.object({ activityIds: idsDaLista }),
	async ({ activityIds }) => {
		const teacher = teacherOf();
		return comCota(teacher, 'atividades', activityIds.length, async (tx, cabem, estado) => {
			const repo = atividades(teacher, tx);
			const pedem = await repo.contarArquivadas(activityIds);
			if (cabem < pedem) {
				return {
					ok: false as const,
					motivo: motivoDeCriar(estado, 'atividades'),
					error:
						cabem === 0
							? 'Não cabe nenhuma no seu plano: arquive outra atividade antes, ou escolha um plano maior.'
							: `Cabem só ${cabem} no seu plano. Desmarque algumas, arquive outras antes ou escolha um plano maior.`
				};
			}
			return { ok: true as const, quantas: await repo.desarquivarVarias(activityIds) };
		});
	}
);

/**
 * Apagar DE VEZ em massa, com tentativas e resultados. A tela pede para digitar
 * "apagar" antes — conferido aqui também, porque um POST direto não passa pela
 * tela (regra nº 3). Uma atividade só, pela página dela, continua pedindo o título.
 */
export const apagarAtividades = command(
	z.object({ activityIds: idsDaLista, confirmacao: z.string() }),
	async ({ activityIds, confirmacao }) => {
		const teacher = teacherOf();
		if (confirmacao.trim().toLocaleLowerCase('pt-BR') !== CONFIRMA_APAGAR) {
			return { ok: false as const, error: 'Digite "apagar" para confirmar.' };
		}
		const quantas = await atividades(teacher).apagarVariasDeVez(activityIds);
		// Como em `apagarAtividade`: o áudio que só elas usavam sai agora, e falhar
		// aqui não desfaz o apagar.
		if (quantas > 0) await limparAudioSemUso(teacher.id).catch((erro) => console.warn(erro));
		return { ok: true as const, quantas };
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

/**
 * Renomear pela tela da atividade, sem o wizard. O título vale na hora, também
 * no que está no ar (ele mora na atividade, não na versão).
 */
export const renomearAtividade = command(
	z.object({
		activityId: z.string(),
		title: z
			.string()
			.trim()
			.min(1, 'Dê um título para a atividade')
			.max(TETO_DO_TITULO, `O título vai até ${TETO_DO_TITULO} caracteres`)
	}),
	async ({ activityId, title }) => {
		const { teacher } = await activityOr404(activityId);
		return { ok: await atividades(teacher).renomear(activityId, title) };
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
		const montado = montarMaterial(comTraducao.campos, {
			alvo: activity.targetLang,
			origem: activity.sourceLang
		});
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
		// Com tradutor, a linha sem separador ENTRA e a tradução vem dele. No
		// vocabulário, a linha que é frase fica de fora (`problemaDoVocabulario`).
		const tags = { alvo: activity.targetLang, origem: activity.sourceLang };
		const lidas = parseRawMaterial(kind, raw, {
			traduzirSemSeparador: !!tradutor,
			vocabulario: kind === 'VocabItem' ? tags : undefined
		});
		if (lidas.length === 0) {
			return { ok: false as const, error: nenhumaLinhaEntrou(kind, raw, !!tradutor) };
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
		const montado = montarMaterial(comTraducao.campos, {
			alvo: activity.targetLang,
			origem: activity.sourceLang
		});
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
		// O MESMO material que já está na atividade (outro registro, o mesmo
		// conteúdo) não entra de novo: a tela já o mostra travado, e isto é a guarda
		// de quem chega por um POST direto.
		const [todos, naAtividade] = await Promise.all([repo.list(), repo.byActivity(activityId)]);
		const repetidos = new Set(naAtividade.map(chaveDoMaterial));
		const pedidos = new Map(todos.map((m) => [m.id, m]));

		let vinculados = 0;
		for (const contentId of contentIds) {
			const material = pedidos.get(contentId);
			if (!material) continue;
			const chave = chaveDoMaterial(material);
			if (repetidos.has(chave)) continue;
			if (await repo.link(activityId, contentId)) {
				vinculados++;
				repetidos.add(chave);
			}
		}
		return { ok: vinculados > 0, linked: vinculados };
	}
);

/**
 * O texto principal de um material: a frase, o termo, o título do texto ou a
 * primeira fala do diálogo — o que a lista mostra em destaque.
 */
function principalESecundario(kind: ContentUnitKind, data: unknown): [string, string] {
	const dados = parseContentUnit(kind, data);
	return 'target' in dados
		? [dados.target, dados.source]
		: 'term' in dados
			? [dados.term, dados.translation]
			: 'title' in dados
				? [dados.title, dados.text.slice(0, 60)]
				: [dados.lines[0]?.text ?? '', `${dados.lines.length} falas`];
}

/**
 * "O mesmo material", para a biblioteca: o mesmo tipo com o mesmo texto
 * principal, sem diferença de espaço nas pontas, de caixa ou de forma Unicode
 * (regra nº 6). Uma frase cadastrada duas vezes com traduções diferentes é a
 * mesma frase na atividade — e duas vezes nela renderia as mesmas questões.
 */
function chaveDoMaterial(material: { kind: ContentUnitKind; data: unknown }): string {
	const [principal] = principalESecundario(material.kind, material.data);
	return `${material.kind}:${principal.trim().normalize('NFC').toLocaleLowerCase('pt-BR')}`;
}

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
		const repetidos = new Set(jaNaAtividade.map(chaveDoMaterial));
		return todos
			.filter((m) => !usados.has(m.id))
			.map((m) => {
				const dados = parseContentUnit(m.kind, m.data);
				const [primary, secondary] = principalESecundario(m.kind, m.data);
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
					/** O mesmo conteúdo já está na atividade (outro registro): a tela trava a linha. */
					jaNaAtividade: repetidos.has(chaveDoMaterial(m)),
					note: 'note' in dados ? (dados.note ?? '') : '',
					example: 'example' in dados ? (dados.example ?? '') : '',
					variants: 'variants' in dados ? (dados.variants ?? []) : []
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
 * O plano da etapa de materiais: quantas questões entram e os tipos de cada
 * material. O bloco de cima (`skills`) é recalculado aqui como a UNIÃO dos
 * materiais — o servidor não confia no que a tela diz que é a união.
 */
const planoSchema = z.object({
	itemTarget: z.number().int().min(1).max(MAX_ITENS),
	geral: z.array(skillSchema).max(4),
	tiposPorMaterial: tiposPorMaterialSchema
});

async function gravarPlano(
	teacher: { id: string },
	activityId: string,
	plano: z.infer<typeof planoSchema>
) {
	const ids = (await materiais(teacher).byActivity(activityId)).map((m) => m.id);
	const montado = montarPlano(plano.geral, plano.tiposPorMaterial, ids);
	await atividades(teacher).atualizarPlano(activityId, {
		itemTarget: plano.itemTarget,
		skills: montado.geral,
		tiposPorMaterial: montado.porMaterial
	});
	return montado;
}

/** Guarda o plano enquanto o professor mexe — voltar à etapa encontra o que ele deixou. */
export const salvarPlanoDeGeracao = command(
	z.object({ activityId: z.string(), plano: planoSchema }),
	async ({ activityId, plano }) => {
		const { teacher } = await activityOr404(activityId);
		await gravarPlano(teacher, activityId, plano);
		return { ok: true as const };
	}
);

/**
 * Nível 2: COMEÇA a geração das questões e devolve na hora. O trabalho roda em
 * segundo plano (`$lib/server/atividades/geracao.ts`), passo a passo, e a tela
 * "Gerando" acompanha por `progressoDaGeracao`. Gera para todos os materiais: o
 * que passa da quantidade vai para o rascunho como "fora" (pedido do dono do
 * repositório). Rascunho é uma `ActivityVersion` sem `Publication` — nada aqui
 * toca em versão já publicada (regra nº 7).
 */
export const gerarItens = command(
	z.object({ activityId: z.string(), plano: planoSchema.optional() }),
	async ({ activityId, plano }) => {
		const { teacher, activity } = await activityOr404(activityId);
		recusarArquivada(activity);

		const tipos = plano ? (await gravarPlano(teacher, activityId, plano)).geral : activity.skills;
		if (tipos.length === 0) {
			return { ok: false as const, error: 'Ligue ao menos um tipo de questão para gerar.' };
		}
		const atual = plano ? await atividades(teacher).byId(activityId) : activity;
		if (!atual) error(404, 'Atividade não encontrada');

		return iniciarGeracao<StoredItemRow>(teacher.id, {
			activity: {
				id: atual.id,
				targetLang: atual.targetLang,
				sourceLang: atual.sourceLang,
				itemTarget: atual.itemTarget,
				skills: atual.skills,
				tiposPorMaterial: atual.tiposPorMaterial,
				level: atual.level
			},
			// Só o material DESTA atividade — a biblioteca inteira geraria itens
			// de conteúdo que não pertence a ela.
			materiais: () => materiais(teacher).byActivity(activityId),
			capacidades: { asr: isAsrConfigured(), tts: isTtsConfigured() },
			tradutor: getTradutor(),
			// A leitura da frase (kana, pinyin) entra no gabarito das questões de
			// digitar — e fica visível e editável no editor de questão.
			transcritorPara,
			// A pronúncia das palavras, para a questão de Pronúncia.
			foneticaPara: foneticaDoIdioma,
			gravar: async (dentro, fora) => {
				const versao = await atividades(teacher).replaceDraftItems(activityId, dentro, fora);
				// As questões do rascunho anterior saíram: o áudio que só elas usavam
				// sai junto (o que outra atividade usa fica — a conta é por conteúdo).
				await limparAudioSemUso(teacher.id).catch((erro) => console.warn(erro));
				return (versao?.items ?? []).filter((item) => !item.discarded);
			},
			// **O áudio começa a ser sintetizado AQUI, não na publicação.** A etapa
			// 4 só libera o botão com todos os arquivos prontos; gerando agora, a
			// espera acontece enquanto o professor revisa. Só do que ENTROU: o que
			// ficou de fora pede o seu quando entrar (`descartarItem`).
			pedirAudio: (gravados) =>
				enfileirarAudioFaltante({
					teacherId: teacher.id,
					targetTag: atual.targetLang,
					items: gravados
				})
		});
	}
);

/** O andamento da geração — a tela "Gerando" pergunta até ela terminar. */
export const progressoDaGeracao = query(
	z.object({ activityId: z.string() }),
	async ({ activityId }) => {
		const { teacher } = await activityOr404(activityId);
		return andamentoDe(teacher.id, activityId);
	}
);

/**
 * O que UM material daria com estes tipos — a "Prévia" de cada linha na etapa
 * de materiais. Roda os geradores sem tradutor nem transcritor (é rápido e não
 * gasta o serviço de áudio): o associar que fecha a atividade e as outras
 * traduções certas só aparecem ao gerar de verdade.
 */
export const previaDoMaterial = query(
	z.object({
		activityId: z.string(),
		contentId: z.string(),
		tipos: z.array(skillSchema).max(4)
	}),
	async ({ activityId, contentId, tipos }) => {
		const { teacher, activity } = await activityOr404(activityId);
		const units = await materiais(teacher).byActivity(activityId);
		if (!units.some((u) => u.id === contentId)) error(404, 'Material não encontrado');
		const alvo = getProfile(activity.targetLang);
		const { groups } = runGenerators(units, {
			targetProfile: alvo,
			sourceProfile: getProfile(activity.sourceLang),
			seed: activity.id,
			capabilities: { asr: isAsrConfigured(), tts: isTtsConfigured() },
			nivel: nivelOuNulo(activity.level),
			foneticaDe: await foneticaDoIdioma(alvo),
			// Os tipos de agora, como na geração: sem escuta, o diálogo vai lido.
			pedidasPara: (id) => (id === contentId ? tipos : undefined)
		});
		// Um exemplo de CADA TIPO, como QUESTÃO RESUMIDA — o cartão do desenho, com a
		// resposta certa marcada (tela do professor). O tipo desligado vai junto,
		// apagado.
		const grupo = groups.find((g) => g.contentId === contentId);
		return umaPorHabilidade(
			(grupo?.items ?? []).map((item) => resumirQuestao(item, entraComOsTipos(item, tipos)))
		);
	}
);

/**
 * Os diálogos desta atividade, para o editor criar DO ZERO uma questão sobre um
 * deles, e como o aluno recebe o diálogo por padrão (o nível decide, como na
 * geração — `mostraDoDialogo`).
 */
export const dialogosDaAtividade = query(
	z.object({ activityId: z.string() }),
	async ({ activityId }) => {
		const { teacher, activity } = await activityOr404(activityId);
		const units = await materiais(teacher).byActivity(activityId);
		const alvo = getProfile(activity.targetLang);
		return {
			mostraPadrao: mostraDoDialogo(
				nivelOuNulo(activity.level),
				isTtsConfigured() && alvo.tts.voices.length > 0
			),
			dialogos: units.flatMap((u) => {
				if (u.kind !== 'Dialogue') return [];
				const lido = dialogueSchema.safeParse(u.data);
				return lido.success
					? [
							{
								id: u.id,
								falas: lido.data.lines.map((l) => ({ falante: l.speaker, texto: l.text }))
							}
						]
					: [];
			})
		};
	}
);

/** O que está DENTRO do rascunho agora (o que vai para a publicação). */
async function quantasDentro(teacher: { id: string }, activityId: string) {
	const draft = await atividades(teacher).draft(activityId);
	return draft?.items.filter((i) => !i.discarded).length ?? 0;
}

/**
 * Tirar ou pôr de volta. Não apaga: marca — o item continua no rascunho para o
 * professor trocar na mesma tela; só não entra na versão publicada. Pôr de volta
 * respeita o teto de questões por atividade e pede o áudio dela, se for de escuta.
 */
export const descartarItem = command(
	z.object({ activityId: z.string(), itemId: z.string(), descartado: z.boolean().default(true) }),
	async ({ activityId, itemId, descartado }) => {
		const { teacher, activity } = await activityOr404(activityId);
		const repo = atividades(teacher);
		if (!descartado && (await quantasDentro(teacher, activityId)) >= MAX_ITENS) {
			return {
				ok: false as const,
				error: `Uma atividade tem no máximo ${MAX_ITENS} questões. Tire uma antes de pôr esta.`
			};
		}
		const ok = await repo.setDraftItemDiscarded(activityId, itemId, descartado);
		if (ok && !descartado) {
			const item = await repo.draftItem(activityId, itemId);
			if (item) {
				await enfileirarAudioFaltante({
					teacherId: teacher.id,
					targetTag: activity.targetLang,
					items: [item]
				});
			}
		}
		// Tirada da atividade, a questão não vai para o aluno: o áudio dela, se
		// nenhuma outra o usa, sai. Pôr de volta pede a síntese de novo (acima).
		if (ok && descartado) void limparAudioSemUso(teacher.id).catch((erro) => console.warn(erro));
		return { ok };
	}
);

/**
 * A ordem do roteiro do aluno, arrastada na revisão. Só as questões de DENTRO;
 * a lista tem de ser exatamente elas (o repositório recusa a que não bate).
 */
export const reordenarQuestoes = command(
	z.object({ activityId: z.string(), ordem: z.array(z.string()).min(1).max(MAX_ITENS) }),
	async ({ activityId, ordem }) => {
		const { teacher, activity } = await activityOr404(activityId);
		recusarArquivada(activity);
		const ok = await atividades(teacher).reordenarRascunho(activityId, ordem);
		return ok
			? { ok: true as const }
			: {
					ok: false as const,
					error: 'A lista mudou enquanto você arrastava. Recarregue a página.'
				};
	}
);

/** "Pôr todas" — só quando todas cabem no teto de questões. */
export const aceitarTodosItens = command(
	z.object({ activityId: z.string() }),
	async ({ activityId }) => {
		const { teacher, activity } = await activityOr404(activityId);
		const draft = await atividades(teacher).draft(activityId);
		if ((draft?.items.length ?? 0) > MAX_ITENS) {
			return {
				ok: false as const,
				error: `Não cabem todas: uma atividade tem no máximo ${MAX_ITENS} questões.`
			};
		}
		const restaurados = await atividades(teacher).acceptAllDraftItems(activityId);
		if (draft) {
			await enfileirarAudioFaltante({
				teacherId: teacher.id,
				targetTag: activity.targetLang,
				items: draft.items
			});
		}
		return { ok: true as const, restaurados };
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
		await resolverNotificacoes(teacher.id, [CHAVE.audio(activityId)]);
		const enfileirados = await enfileirarAudioFaltante({
			teacherId: teacher.id,
			targetTag: activity.targetLang,
			items: itens
		});
		return { ok: true, enfileirados };
	}
);

/** O que o servidor consegue entregar para a questão: voz no idioma, transcrição. */
function capacidadesDe(targetLang: string) {
	return { tts: isTtsConfigured(), asr: isAsrConfigured(), alvo: getProfile(targetLang) };
}

/** A frase no idioma alvo do material de origem — o "monte" gerado guarda só as peças. */
async function fraseDoMaterial(
	teacher: { id: string },
	activityId: string,
	contentId: string | null
): Promise<string | undefined> {
	if (!contentId) return undefined;
	const unit = (await materiais(teacher).byActivity(activityId)).find((u) => u.id === contentId);
	if (!unit) return undefined;
	const dados = parseContentUnit(unit.kind, unit.data);
	return 'target' in dados ? dados.target : 'term' in dados ? dados.term : undefined;
}

/**
 * Nível 3: a questão como o EDITOR a abre (o modal da revisão). É a tela do
 * professor, atrás do guard: o gabarito vem junto, para a moldura âmbar.
 */
export const questaoParaEditar = query(
	z.object({ activityId: z.string(), itemId: z.string() }),
	async ({ activityId, itemId }) => {
		const { teacher } = await activityOr404(activityId);
		const item = await atividades(teacher).draftItem(activityId, itemId);
		if (!item) error(404, 'Questão não encontrada neste rascunho');
		const prompt = promptSchema.parse(item.prompt);
		const interaction = interactionSchema.parse(item.interaction);
		const grading = gradingSchema.parse(item.grading);
		return {
			questao: questaoDoItem(
				{ prompt, interaction, grading },
				{ fraseDoMaterial: await fraseDoMaterial(teacher, activityId, item.sourceContentId) }
			),
			// O que a tela precisa para o enunciado padrão acompanhar o gravado.
			gravada: {
				tipo: tipoDaQuestao(prompt.kind, interaction.type, mostraDoPrompt(prompt)),
				interacao: interaction.type,
				chave: prompt.instructionKey,
				answerLang: grading.answerLang
			},
			descartada: item.discarded
		};
	}
);

/**
 * Salvar a questão do editor — editar uma que existe (`itemId`) ou criar uma do
 * zero. Quem decide o que vale é `montarQuestao`, o MESMO que a prévia usa: a
 * tela não oferece o que o servidor recusaria, e o que o formulário não edita
 * (a língua da resposta, as ordens aceitas de um "monte") é mantido.
 *
 * A questão nova só passa a existir aqui, já validada — ela nascia no clique,
 * com texto de exemplo, e fechar o editor sem mexer deixava essa questão na
 * atividade. Áudio novo (questão nova de escuta, ou a frase mudou) é pedido
 * AQUI, para a síntese acontecer enquanto o professor revisa.
 */
export const salvarQuestao = command(
	z.object({ activityId: z.string(), itemId: z.string().optional(), questao: questaoSchema }),
	async ({ activityId, itemId, questao }) => {
		const { teacher, activity } = await activityOr404(activityId);
		recusarArquivada(activity);
		const repo = atividades(teacher);
		const { alvo, ...capacidades } = capacidadesDe(activity.targetLang);

		const atual = itemId ? await repo.draftItem(activityId, itemId) : null;
		if (itemId && !atual) error(404, 'Questão não encontrada neste rascunho');

		const montada = montarQuestao(questao, {
			alvo,
			capacidades,
			atual: atual ?? undefined,
			foneticaDe: await foneticaDoIdioma(alvo)
		});
		if (!montada.ok) return { ok: false as const, error: montada.error };

		// Os três já passaram pelos schemas do kernel em `montarQuestao`; o
		// `unknown` só atravessa o tipo de JSON do Prisma, que não aceita interface.
		const conteudo = {
			prompt: montada.prompt as unknown as Prisma.InputJsonValue,
			interaction: montada.interaction as unknown as Prisma.InputJsonValue,
			grading: montada.grading as unknown as Prisma.InputJsonValue
		};

		let gravado: StoredItemRow | null;
		let descartada = false;
		if (atual && itemId) {
			gravado = await repo.updateDraftItem(activityId, itemId, conteudo);
			descartada = atual.discarded;
		} else {
			if ((await quantasDentro(teacher, activityId)) >= MAX_ITENS) {
				return {
					ok: false as const,
					error: `Uma atividade tem no máximo ${MAX_ITENS} questões. Tire uma antes de criar outra.`
				};
			}
			// Sem rascunho ainda (nada gerado nem publicado), abre um vazio.
			if (!(await repo.draftFromPublished(activityId)))
				await repo.replaceDraftItems(activityId, []);
			gravado = await repo.criarQuestaoManual(activityId, {
				...conteudo,
				locale: { source: activity.sourceLang, target: activity.targetLang }
			});
		}
		if (!gravado) error(404, 'Questão não encontrada neste rascunho');

		// O áudio que a questão usa agora — a frase da escuta, as falas do diálogo, a
		// palavra da Pronúncia. `enfileirarAudioFaltante` pula o que já existe e o
		// que já está na fila, então pedir sempre não multiplica trabalho.
		if (!descartada) {
			await enfileirarAudioFaltante({
				teacherId: teacher.id,
				targetTag: activity.targetLang,
				items: [gravado]
			});
		}
		// O áudio que a questão deixou de usar (mudou a frase, deixou de ser escuta,
		// trocou o diálogo): se nenhuma outra questão o usa, sai do bucket.
		const antes = atual ? itemAudioHashes(atual, activity.targetLang) : [];
		const depois = new Set(itemAudioHashes(gravado, activity.targetLang));
		if (antes.some((hash) => !depois.has(hash))) {
			void limparAudioSemUso(teacher.id).catch((erro) => console.warn(erro));
		}
		return { ok: true as const, itemId: gravado.id };
	}
);

/**
 * A questão RESPONDÍVEL na revisão: o professor responde no celular do palco e
 * recebe o veredito que o aluno receberia — o mesmo kernel e a MESMA seed do
 * runtime que o palco mostra (`revisar/+page.server.ts`; sem ela os ids das
 * alternativas e das peças não batem). Nada é gravado. Fala e escrita livre
 * ficam de fora: uma precisa do microfone e do serviço de transcrição, a outra é
 * o professor quem corrige.
 */
export const corrigirNaRevisao = command(
	z.object({ activityId: z.string(), itemId: z.string(), resposta: z.unknown() }),
	async ({ activityId, itemId, resposta }) => {
		const { teacher } = await activityOr404(activityId);
		const draft = await atividades(teacher).draft(activityId);
		const item = draft?.items.find((i) => i.id === itemId);
		if (!draft || !item) error(404, 'Questão não encontrada neste rascunho');
		if (interactionSchema.parse(item.interaction).type === 'speak') {
			return { ok: false as const, erro: 'A fala se confere no Player, com o microfone.' };
		}
		if (gradingSchema.parse(item.grading).mode === 'rubric') {
			return {
				ok: false as const,
				erro: 'Esta resposta você corrige depois, na tela da tentativa.'
			};
		}
		return corrigirSemGravar(item, resposta, `revisao:${draft.id}:${item.id}`);
	}
);

/**
 * A prévia do editor: a questão COMO FICARIA com o que está no formulário,
 * passada pela mesma porta do Player (`buildRuntimeItem` → `toRuntime()`). Nada
 * é gravado. O gabarito chega aqui (é a tela do professor, atrás do guard) e não
 * volta: o que sai é o payload do aluno.
 */
export const previaDaQuestao = query(
	z.object({ activityId: z.string(), itemId: z.string().optional(), questao: questaoSchema }),
	async ({ activityId, itemId, questao }) => {
		const { teacher, activity } = await activityOr404(activityId);
		const atual = itemId ? await atividades(teacher).draftItem(activityId, itemId) : null;
		if (itemId && !atual) error(404, 'Questão não encontrada neste rascunho');
		const { alvo, ...capacidades } = capacidadesDe(activity.targetLang);

		const montada = montarQuestao(questao, {
			alvo,
			capacidades,
			atual: atual ?? undefined,
			foneticaDe: await foneticaDoIdioma(alvo)
		});
		if (!montada.ok) return { ok: false as const, error: montada.error };

		const row = {
			id: atual?.id ?? 'nova',
			prompt: montada.prompt,
			interaction: montada.interaction,
			grading: montada.grading,
			locale: atual?.locale ?? { source: activity.sourceLang, target: activity.targetLang }
		};
		const hashes = itemAudioHashes(row, activity.targetLang);
		const assets = await playerRepo.mediaUrls(teacher.id, hashes);
		const urlByHash = new Map(assets.map((asset) => [asset.hash, asset.url]));
		try {
			return {
				ok: true as const,
				runtime: buildRuntimeItem(
					row,
					`previa:${itemId ?? 'nova'}`,
					urlByHash,
					linhasPorHash(assets)
				),
				// Frase de áudio nova ainda não tem arquivo: a tela diz isso em vez de
				// mostrar um player que não toca.
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
 * A etapa 1 de uma atividade que já existe — o "voltar" da etapa de materiais
 * não cria outra atividade. Os idiomas só mudam enquanto nada depende deles:
 * sem material, sem questão e nunca publicada (o material tem a tag do idioma da
 * atividade, e a tokenização das questões é a dele).
 */
export const editarDetalhes = form(
	z.object({
		activityId: z.string(),
		title: z.string().min(1, 'Dê um título para a atividade'),
		targetLang: z.string().optional(),
		sourceLang: z.string().optional(),
		level: z.string().optional()
	}),
	async ({ activityId, title, targetLang, sourceLang, level }) => {
		const { teacher } = await activityOr404(activityId);
		const repo = atividades(teacher);
		const [units, draft, published] = await Promise.all([
			materiais(teacher).byActivity(activityId),
			repo.draft(activityId),
			repo.published(activityId)
		]);
		const idiomasLivres = units.length === 0 && !draft && !published;
		await repo.atualizarDetalhes(activityId, {
			title: title.trim(),
			level: nivelOuNulo(level),
			idiomas:
				idiomasLivres && targetLang && sourceLang
					? { targetLang: tagForLabel(targetLang), sourceLang: tagForLabel(sourceLang) }
					: undefined
		});
		redirect(303, resolve('/(studio)/atividades/[id]/materiais', { id: activityId }));
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
			return { ok: false, error: 'Nenhuma questão está dentro da atividade.' };
		}
		if (aPublicar.length > MAX_ITENS) {
			return {
				ok: false,
				error: `Uma atividade tem no máximo ${MAX_ITENS} questões. Deixe ${aPublicar.length - MAX_ITENS} de fora.`
			};
		}
		for (const [posicao, item] of aPublicar.entries()) {
			const interaction = interactionSchema.parse(item.interaction);
			const valido = getInteraction(interaction.type).authoringSchema.safeParse(
				interaction.payload
			);
			if (!valido.success || ehMarcadorAntigo(interaction)) {
				return {
					ok: false,
					error: `A questão ${posicao + 1} está incompleta. Abra-a no editor ou deixe-a de fora.`
				};
			}
		}

		// Repõe o que falta antes de olhar o placar: o áudio é identificado pelo
		// conteúdo (db.md), então reusar a frase de outra atividade já vem pronto,
		// e só o que mudou desde a geração precisa de síntese. Só do que ENTRA: o
		// que ficou de fora não vai para o aluno e não pede áudio.
		const faltando = await enfileirarAudioFaltante({
			teacherId: teacher.id,
			targetTag: activity.targetLang,
			items: aPublicar
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

		// As questões de fora sumiram de vez na publicação: o áudio que só elas
		// usavam sai também.
		void limparAudioSemUso(teacher.id).catch((erro) => console.warn(erro));

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
