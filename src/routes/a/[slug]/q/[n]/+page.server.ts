import { error, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import type { PageServerLoad } from './$types';
import { playerRepo } from '$lib/server/db/repos/player';
import { buildRuntimeItem, itemAudioHashes } from '$lib/server/player/runtime';
import { publicationSettingsSchema } from '$lib/server/player/settings';

/**
 * Uma questão. O item vai para o browser JÁ PASSADO por `toRuntime()` — é a
 * regra inviolável nº 1, e quem garante isso é `server/player/runtime.ts`.
 * O payload de autoria nunca entra neste `return`.
 */
export const load: PageServerLoad = async ({ params, cookies }) => {
	const attemptId = cookies.get(`spokke_attempt_${params.slug}`);
	if (!attemptId) redirect(303, resolve('/a/[slug]', { slug: params.slug }));

	const attempt = await playerRepo.attemptById(attemptId);
	if (!attempt) error(404, { message: 'Perdemos sua sessão', reason: 'attemptLost' });

	const { activityVersion } = attempt.publication;
	const items = activityVersion.items;
	const index = Number(params.n);
	const item = items[index - 1];
	if (!item) error(404, { message: 'Questão não existe', reason: 'notFound' });

	// A URL do áudio é derivada do hash — não fica guardada no item, o que
	// evita `UPDATE` numa versão publicada (regra inviolável nº 7).
	const hashes = itemAudioHashes(item, activityVersion.activity.targetLang);
	const assets = await playerRepo.mediaUrls(activityVersion.activity.teacherId, hashes);
	const audioUrlByHash = new Map(assets.map((asset) => [asset.hash, asset.url]));

	const initials = attempt.name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part[0]?.toUpperCase())
		.join('');

	/**
	 * O que o aluno JÁ respondeu nesta questão, se ele voltou para ela.
	 *
	 * A resposta vem do servidor e não de `sessionStorage`: ela já está gravada
	 * em `AttemptItem` (é o que o professor vê e o que sustenta a retomada), e
	 * uma segunda cópia no browser seria uma segunda verdade — divergindo no
	 * primeiro F5 em outro aparelho, ou depois de limpar o navegador.
	 *
	 * O veredito respeita `showResult`: com o feedback desligado, voltar não
	 * pode ser a porta dos fundos para descobrir se acertou.
	 */
	const respondido = attempt.items.find((resposta) => resposta.itemId === item.id);
	const settings = publicationSettingsSchema.parse(attempt.publication.settings);

	return {
		index,
		activity: {
			slug: params.slug,
			title: activityVersion.activity.title,
			itemCount: items.length
		},
		student: {
			name: attempt.name,
			initials: initials || '?',
			avatar: attempt.account?.avatar ?? null
		},
		attemptId: attempt.id,
		itemId: item.id,
		item: buildRuntimeItem(item, attempt.seed, audioUrlByHash),
		answered: respondido
			? {
					answer: respondido.answer,
					// Pontuação vira estado aqui, e não no browser: parcial é um
					// estado próprio, nunca "erro que quase acertou".
					state: !settings.showResult
						? null
						: respondido.score >= 1
							? ('correct' as const)
							: respondido.score > 0
								? ('partial' as const)
								: ('incorrect' as const)
				}
			: null
	};
};
