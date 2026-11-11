import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { resolve } from '$app/paths';
import { playerRepo } from '$lib/server/db/repos/player';
import { COOKIE_DO_CODIGO } from '$lib/server/player/access-code';
import { publicationSettingsSchema } from '$lib/server/player/settings';

/**
 * O código é a primeira tela de uma atividade que pede um: a entrada manda
 * para cá (`precisaDoCodigo`). Atividade sem código, ou aparelho que já passou
 * por ele, não tem o que fazer aqui e volta para a entrada — em vez de ficar
 * diante de um formulário que recusaria qualquer coisa.
 */
export const load: PageServerLoad = async ({ params, cookies }) => {
	const publication = await playerRepo.publicationBySlug(params.slug);
	if (!publication) error(404, { message: 'Link não encontrado', reason: 'notFound' });

	const settings = publicationSettingsSchema.parse(publication.settings);
	const jaPassou =
		settings.code !== null && cookies.get(COOKIE_DO_CODIGO + params.slug) === settings.code;
	if (!settings.requireCode || jaPassou) redirect(303, resolve('/a/[slug]', { slug: params.slug }));
};
