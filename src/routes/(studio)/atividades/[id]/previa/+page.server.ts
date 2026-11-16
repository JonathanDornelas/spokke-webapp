import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireTeacher } from '$lib/server/auth/guard';
import { versaoDaPrevia } from '$lib/server/atividades/previa';
import { playerRepo, linhasPorHash } from '$lib/server/db/repos/player';
import { buildRuntimeItem, itemAudioHashes } from '$lib/server/player/runtime';
import { rotuloDoItem } from '$lib/server/player/rotulo';
import { gradingSchema, interactionSchema, promptSchema } from '$lib/kernel/item';
import { getProfile } from '$lib/kernel/language/profiles';

/**
 * A PRÉVIA DO ALUNO, aberta pelo "Pré-visualizar" da etapa 4 e da tela da
 * atividade: a atividade na tela do Player, direto na primeira questão — sem
 * nome, sem código e sem conta — até o resultado. Nada é gravado (sem
 * `Attempt`); quem corrige é `previa.remote.ts` e `previa/fala`.
 *
 * Cada questão passa por `buildRuntimeItem`, a MESMA porta do Player (regra
 * inviolável nº 1): o que chega aqui é o que chega no browser do aluno, sem o
 * gabarito. A seed é fixa por versão — o mesmo embaralhamento a cada F5.
 */
export const load: PageServerLoad = async ({ locals, params, url }) => {
	const teacher = requireTeacher(locals);
	const versao = await versaoDaPrevia(teacher, params.id);
	if (!versao) error(404, 'Atividade não encontrada');
	const { activity, linhas, semente } = versao;

	const hashes = linhas.flatMap((item) => itemAudioHashes(item, activity.targetLang));
	const assets = await playerRepo.mediaUrls(teacher.id, hashes);
	const urlByHash = new Map(assets.map((asset) => [asset.hash, asset.url]));

	// `buildRuntimeItem` valida o payload contra o `authoringSchema` e LANÇA
	// quando ele não bate — o certo, mas aqui derrubaria a prévia inteira por
	// causa de uma questão só. Ela aparece na sequência dizendo que está
	// incompleta, com o caminho para o editor.
	const questoes = linhas.map((linha) => {
		try {
			const prompt = promptSchema.parse(linha.prompt);
			const interaction = interactionSchema.parse(linha.interaction);
			const grading = gradingSchema.parse(linha.grading);
			return {
				id: linha.id,
				rotulo: rotuloDoItem(prompt, interaction.type, grading.mode),
				item: buildRuntimeItem(linha, semente, urlByHash, linhasPorHash(assets))
			};
		} catch {
			return { id: linha.id, rotulo: 'questão incompleta', item: null };
		}
	});

	return {
		activity: {
			id: activity.id,
			title: activity.title,
			dir: getProfile(activity.targetLang).direction
		},
		rascunho: versao.rascunho,
		// Quem responde a prévia é o professor: o cabeçalho do Player mostra a
		// conta logada, e aqui é a dele.
		quem: { nome: teacher.name, avatar: teacher.avatar ?? null },
		// De onde a prévia foi aberta, para o "Fechar" voltar para lá. É um TOKEN
		// de uma lista fechada, nunca uma URL vinda do cliente: `?voltar=` com
		// endereço livre é redirecionamento aberto de manual.
		voltarPara:
			url.searchParams.get('voltar') === 'detalhe' ? ('detalhe' as const) : ('publicar' as const),
		questoes
	};
};
