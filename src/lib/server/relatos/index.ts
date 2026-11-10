import { env } from '$env/dynamic/private';
import type { Prisma } from '../../../../generated/prisma/client.ts';
import { playerRepo } from '../db/repos/player';
import { relatosRepo } from '../db/repos/relatos';
import { buildRuntimeItem, itemAudioHashes } from '../player/runtime';
import { publicationSettingsSchema } from '../player/settings';
import { payloadParaCorrigir } from '../escrita';
import { enqueueAvisoEquipe } from '../queue';
import { getInteraction } from '$lib/kernel/interactions/registry';
import { gradingSchema, interactionSchema, localeSchema, promptSchema } from '$lib/kernel/item';
import { getProfile, labelForTag } from '$lib/kernel/language/profiles';
import { normalize } from '$lib/kernel/language/normalize';
import { ROTULO_DA_INTERACAO } from '$lib/atividades/editor-item';
import { MOTIVO_CURTO, codigoDoRelato } from '$lib/relatos';
import type { RelatoDoCliente } from './schema';

/**
 * O RELATO DE PROBLEMA: o aluno aperta "Relatar problema" numa questão, e a
 * equipe recebe tudo o que ajuda a achar o erro — sem precisar pedir print, nem
 * perguntar qual era a questão.
 *
 * O navegador manda o que só ele sabe (o que estava na tela, o aparelho, o
 * diário de erros). O servidor acrescenta o que ele NÃO pode mandar, porque o
 * navegador não tem e não deve ter: a questão de autoria com o gabarito, o
 * mesmo item como foi servido, os áudios, a resposta gravada e a correção
 * refeita AGORA sobre o que estava na tela, com a forma normalizada dos dois
 * lados — é ela que responde "por que a minha resposta certa deu errado?".
 *
 * Sem nome do aluno e sem IP. Testável sem SvelteKit: quem chama (a remote
 * function) confere o limite por IP e transforma a recusa em erro HTTP.
 */

/** Teto de relatos por tentativa — um aluno com quinze questões não precisa de mais. */
export const TETO_POR_TENTATIVA = 15;
/** Um relato da mesma questão dentro deste intervalo é clique duplo, não relato novo. */
export const INTERVALO_DA_MESMA_QUESTAO_MS = 60_000;

export type Desfecho =
	{ ok: true; id: string; codigo: string } | { ok: false; status: 404 | 429; mensagem: string };

export interface DoServidor {
	userAgent: string | null;
	idiomaDoNavegador: string | null;
	versao: string;
	ambiente: 'desenvolvimento' | 'producao';
}

/** A correção refeita agora, sobre o que estava na tela. Nunca derruba o relato. */
async function corrigirDeNovo(
	interaction: { type: Parameters<typeof getInteraction>[0]; payload: unknown },
	grading: ReturnType<typeof gradingSchema.parse>,
	locale: ReturnType<typeof localeSchema.parse>,
	resposta: unknown,
	semente: string
) {
	try {
		const registrada = getInteraction(interaction.type);
		const lida = registrada.answerSchema.safeParse(resposta);
		if (!lida.success) return { situacao: 'resposta-em-formato-inesperado' as const };
		if (grading.mode === 'rubric') return { situacao: 'corrigida-pelo-professor' as const };

		const profile = getProfile(grading.answerLang === 'source' ? locale.source : locale.target);
		const payload = await payloadParaCorrigir(interaction, grading, profile);
		const resultado = registrada.grade(payload, lida.data, profile, semente);
		if (!resultado.ok) return { situacao: 'erro-na-correcao' as const, erro: resultado.error };

		// A forma normalizada dos dois lados, nas questões de digitar: é o que a
		// régua de fato comparou (regra nº 6).
		const texto =
			typeof (lida.data as { text?: unknown }).text === 'string'
				? (lida.data as { text: string }).text
				: null;
		const aceitas = (payload as { accepted?: unknown }).accepted;
		const normalizacao =
			texto !== null
				? {
						idioma: profile.tag,
						resposta: normalize(texto, profile),
						aceitas:
							Array.isArray(aceitas) && aceitas.every((a) => typeof a === 'string')
								? aceitas.map((a) => normalize(a, profile))
								: null
					}
				: null;

		return {
			situacao: 'corrigida' as const,
			nota: resultado.value.value,
			feedback: resultado.value.feedback ?? null,
			marcas: resultado.value.marks ?? null,
			esperado: resultado.value.expected ?? null,
			normalizacao
		};
	} catch (erro) {
		return {
			situacao: 'erro-na-correcao' as const,
			erro: erro instanceof Error ? erro.message : String(erro)
		};
	}
}

export async function registrarRelato(
	entrada: RelatoDoCliente,
	servidor: DoServidor,
	agora: Date = new Date()
): Promise<Desfecho> {
	const attempt = await playerRepo.attemptById(entrada.attemptId);
	if (!attempt) return { ok: false, status: 404, mensagem: 'Não achamos esta tentativa.' };

	const versao = attempt.publication.activityVersion;
	const atividade = versao.activity;
	const posicao = versao.items.findIndex((i) => i.id === entrada.itemId);
	const item = versao.items[posicao];
	if (!item) return { ok: false, status: 404, mensagem: 'Esta questão não é desta atividade.' };

	// Tetos que o banco conta (o por IP fica na remote function, na memória).
	if ((await relatosRepo.contarDaTentativa(attempt.id)) >= TETO_POR_TENTATIVA) {
		return { ok: false, status: 429, mensagem: 'Você já mandou muitos relatos nesta atividade.' };
	}
	const ultimo = await relatosRepo.ultimoDaQuestao(attempt.id, item.id);
	if (ultimo && agora.getTime() - ultimo.getTime() < INTERVALO_DA_MESMA_QUESTAO_MS) {
		return {
			ok: false,
			status: 429,
			mensagem: 'Você acabou de relatar esta questão. A equipe já recebeu.'
		};
	}

	const interaction = interactionSchema.parse(item.interaction);
	const grading = gradingSchema.parse(item.grading);
	const locale = localeSchema.parse(item.locale);
	const prompt = promptSchema.parse(item.prompt);
	const settings = publicationSettingsSchema.parse(attempt.publication.settings);
	const semente = `${attempt.seed}:${item.id}`;

	// Os áudios da questão e se cada um existe — "o áudio não toca" começa aqui.
	const hashes = itemAudioHashes(item, atividade.targetLang);
	const midias = await playerRepo.mediaUrls(atividade.teacherId, hashes);
	const urlPorHash = new Map(midias.map((m) => [m.hash, m.url]));

	// A questão COMO FOI SERVIDA ao aluno (o mesmo `buildRuntimeItem` da `/q/[n]`).
	let comoOAlunoViu: unknown;
	try {
		comoOAlunoViu = buildRuntimeItem(item, attempt.seed, urlPorHash);
	} catch (erro) {
		comoOAlunoViu = { erro: erro instanceof Error ? erro.message : String(erro) };
	}

	const gravada = attempt.items.find((r) => r.itemId === item.id);

	const contexto = {
		versaoDoContexto: 1,
		atividade: {
			id: atividade.id,
			titulo: atividade.title,
			idiomaAlvo: atividade.targetLang,
			idiomaDoAluno: atividade.sourceLang,
			versaoId: versao.id,
			publicacaoId: attempt.publication.id,
			slug: attempt.publication.slug,
			mostraResultado: settings.showResult,
			pedeCodigo: settings.requireCode
		},
		questao: {
			id: item.id,
			posicao: posicao + 1,
			total: versao.items.length,
			interacao: interaction.type,
			enunciado: prompt,
			// A autoria inteira, gabarito incluído: fica no servidor e na intranet.
			autoria: interaction.payload,
			correcao: grading,
			idiomas: locale,
			geradaPor: item.generatedBy,
			materialDeOrigem: item.sourceContentId
		},
		comoOAlunoViu,
		audio: hashes.map((hash) => ({ hash, url: urlPorHash.get(hash) ?? null })),
		tentativa: {
			id: attempt.id,
			comecou: attempt.startedAt.toISOString(),
			terminou: attempt.finishedAt?.toISOString() ?? null,
			respondidas: attempt.items.length,
			comConta: attempt.accountId !== null,
			comFicha: attempt.studentId !== null,
			guardaAGravacao: attempt.audioConsent,
			// Com ela a ordem das alternativas e das peças se reproduz (regra nº 8).
			semente
		},
		respostaGravada: gravada
			? {
					resposta: gravada.answer,
					nota: gravada.score,
					ms: gravada.ms,
					notaDoProfessor: gravada.reviewedScore
				}
			: null,
		correcaoAgora: await corrigirDeNovo(
			interaction,
			grading,
			locale,
			entrada.tela.respostaNaTela,
			semente
		),
		tela: entrada.tela,
		aparelho: entrada.aparelho,
		diario: entrada.diario,
		servidor: {
			versao: servidor.versao,
			ambiente: servidor.ambiente,
			recebidoEm: agora.toISOString(),
			userAgent: servidor.userAgent,
			idiomaDoNavegador: servidor.idiomaDoNavegador,
			provedores: {
				tts: env.TTS_PROVIDER || 'nenhum',
				asr: env.ASR_PROVIDER || 'nenhum',
				traducao: env.TRANSLATE_PROVIDER || 'nenhum'
			}
		}
	};

	const descricao = entrada.descricao?.trim() || null;
	const { id } = await relatosRepo.criar({
		motivo: entrada.motivo,
		descricao,
		teacherId: atividade.teacherId,
		attemptId: attempt.id,
		activityId: atividade.id,
		publicationId: attempt.publication.id,
		itemId: item.id,
		itemIndex: posicao + 1,
		interaction: interaction.type,
		// Passa por JSON: datas viram texto e o que não serializa sai antes do banco.
		contexto: JSON.parse(JSON.stringify(contexto)) as Prisma.InputJsonValue
	});
	const codigo = codigoDoRelato(id);

	// O aviso para a equipe, pela fila (provedor fora do ar vira retentativa).
	// Curto de propósito: a resposta do aluno e o gabarito ficam na intranet,
	// não numa caixa de e-mail.
	await enqueueAvisoEquipe({
		assunto: `Relato ${codigo}: ${MOTIVO_CURTO[entrada.motivo]} (${atividade.title})`.slice(0, 200),
		texto: [
			`Um aluno relatou um problema numa questão.`,
			``,
			`Código: ${codigo}`,
			`Motivo: ${MOTIVO_CURTO[entrada.motivo]}`,
			`O que ele escreveu: ${descricao ?? '(nada)'}`,
			``,
			`Atividade: ${atividade.title} (${labelForTag(atividade.targetLang)})`,
			`Questão ${posicao + 1} de ${versao.items.length}: ${ROTULO_DA_INTERACAO[interaction.type]}`,
			`Professor (id): ${atividade.teacherId}`,
			`Aparelho: ${entrada.aparelho.navegador.slice(0, 160)}`,
			`Tela: ${entrada.aparelho.janela.largura}×${entrada.aparelho.janela.altura}`,
			``,
			`O relato completo (a questão, a resposta, a correção refeita e o diário da tela) está na intranet, em Relatos.`
		].join('\n')
	});

	return { ok: true, id, codigo };
}
