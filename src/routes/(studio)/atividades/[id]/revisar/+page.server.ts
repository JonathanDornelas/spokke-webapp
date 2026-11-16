import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireTeacher } from '$lib/server/auth/guard';
import { atividades } from '$lib/server/db/repos/activities';
import { materiais } from '$lib/server/db/repos/content-units';
import { playerRepo, linhasPorHash } from '$lib/server/db/repos/player';
import { itemAudioHashes } from '$lib/server/player/runtime';
import { materiaisPorId, questoesDoRoteiro } from '$lib/server/atividades/roteiro';
import { isTtsConfigured } from '$lib/server/tts';
import { isAsrConfigured } from '$lib/server/asr';
import { progressoDaGeracao } from '$lib/server/atividades/geracao';
import { getProfile, labelForTag } from '$lib/kernel/language/profiles';
import { MAX_ITENS } from '$lib/kernel/generators/select';
import { lerTiposPorMaterial } from '$lib/atividades/tipos-por-material';

/**
 * Etapa 3 — a REVISÃO: o roteiro do aluno. As questões de dentro na ordem em
 * que ele responde (o professor arrasta para mudar), depois as que ficaram de
 * fora pela quantidade pedida; ao lado, o celular com a questão escolhida, do
 * jeito que o aluno a vê. Nenhum JSON aparece (paginas.md).
 *
 * O celular desenha o que `buildRuntimeItem` devolve — a mesma porta do
 * Player, então o gabarito não vai junto (regra nº 1). A "Resposta" da linha
 * selecionada é a tela do PROFESSOR, atrás do guard: ela vai em texto, à parte.
 */
export const load: PageServerLoad = async ({ locals, params }) => {
	const teacher = requireTeacher(locals);
	const activity = await atividades(teacher).byId(params.id);
	if (!activity) error(404, 'Atividade não encontrada');

	const geracao = progressoDaGeracao(teacher.id, params.id);

	// `draftFromPublished` e não `draft`: depois de publicar o rascunho deixa de
	// existir, e "Editar atividade" abria uma revisão vazia. A chamada devolve o
	// rascunho quando já existe e, quando não, clona o que está no ar (regra nº 7).
	const [draft, units] = await Promise.all([
		atividades(teacher).draftFromPublished(params.id),
		materiais(teacher).byActivity(params.id)
	]);

	const materialPorId = materiaisPorId(units);

	const itens = draft?.items ?? [];
	// As de dentro na ordem do roteiro; as de fora depois, como estão.
	const ordenados = [...itens.filter((i) => !i.discarded), ...itens.filter((i) => i.discarded)];

	const hashes = ordenados.flatMap((item) => itemAudioHashes(item, activity.targetLang));
	const assets = await playerRepo.mediaUrls(teacher.id, hashes);
	const urlByHash = new Map(assets.map((asset) => [asset.hash, asset.url]));

	const questoes = questoesDoRoteiro(ordenados, {
		targetLang: activity.targetLang,
		semente: `revisao:${draft?.id ?? activity.id}`,
		urlByHash,
		linhasByHash: linhasPorHash(assets),
		materialPorId
	});

	// Material que não rendeu questão aparece com o motivo, numa linha só.
	const comQuestao = new Set(itens.map((i) => i.sourceContentId).filter(Boolean));
	const tipos = lerTiposPorMaterial(activity.tiposPorMaterial);
	const semQuestao = units
		.filter((unit) => !comQuestao.has(unit.id))
		.map((unit) => ({
			id: unit.id,
			trecho: materialPorId.get(unit.id)?.trecho ?? '',
			motivo:
				tipos[unit.id]?.length === 0
					? 'todos os tipos de questão dele estão desligados'
					: 'nenhum exercício saiu dele com os tipos ligados'
		}));

	const profile = getProfile(activity.targetLang);
	return {
		activity: {
			id: activity.id,
			title: activity.title,
			dir: profile.direction,
			tag: profile.tag,
			targetLabel: labelForTag(activity.targetLang),
			sourceLabel: labelForTag(activity.sourceLang)
		},
		geracao,
		alvo: activity.itemTarget,
		maxItens: MAX_ITENS,
		capacidades: {
			tts: isTtsConfigured() && profile.tts.voices.length > 0,
			asr: isAsrConfigured()
		},
		questoes,
		semQuestao
	};
};
