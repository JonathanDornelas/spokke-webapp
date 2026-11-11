import { error, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import type { PageServerLoad } from './$types';
import { playerRepo } from '$lib/server/db/repos/player';
import { publicationSettingsSchema } from '$lib/server/player/settings';
import { readableAnswer } from '$lib/server/player/readable-answer';
import { instructionText, promptInstruction } from '$lib/server/player/runtime';
import { rotuloDoItem } from '$lib/server/player/rotulo';
import { readableAnswerKey } from '$lib/server/studio/answer-key';
import { getInteraction } from '$lib/kernel/interactions/registry';
import { gradingSchema, interactionSchema, promptSchema } from '$lib/kernel/item';
import { getProfile } from '$lib/kernel/language/profiles';

type AnswerState = 'correct' | 'partial' | 'incorrect' | 'pending';

/**
 * "Rever minhas respostas": o aluno relê o que respondeu, questão por questão.
 *
 * Esta é a ÚNICA tela do Player em que o gabarito aparece, e ela só existe
 * porque o professor ligou `showResult` ao publicar. Com o resultado
 * desligado, revisar seria o mesmo vazamento pela porta dos fundos — por isso
 * a rota redireciona em vez de esconder um pedaço da tela.
 *
 * Questão ainda não respondida não entra: mostrar a resposta certa de algo que
 * o aluno ainda vai responder é gabarito adiantado.
 */
export const load: PageServerLoad = async ({ params, cookies }) => {
	const attemptId = cookies.get(`spokke_attempt_${params.slug}`);
	if (!attemptId) redirect(303, resolve('/a/[slug]', { slug: params.slug }));

	const attempt = await playerRepo.attemptById(attemptId);
	if (!attempt) error(404, { message: 'Perdemos sua sessão', reason: 'attemptLost' });

	const settings = publicationSettingsSchema.parse(attempt.publication.settings);
	if (!settings.showResult) redirect(303, resolve('/a/[slug]/resultado', { slug: params.slug }));

	const { activityVersion } = attempt.publication;
	const dir = getProfile(activityVersion.activity.targetLang).direction;
	const respostaPorItem = new Map(attempt.items.map((row) => [row.itemId, row]));

	const answers = activityVersion.items.flatMap((item, i) => {
		const gravada = respostaPorItem.get(item.id);
		if (!gravada) return [];

		const prompt = promptSchema.parse(item.prompt);
		const interaction = interactionSchema.parse(item.interaction);
		const grading = gradingSchema.parse(item.grading);
		const registrada = getInteraction(interaction.type);

		// A MESMA seed de `buildRuntimeItem`: é o que faz os ids da resposta
		// gravada corresponderem ao que o aluno viu na tela.
		const runtime = registrada.toRuntime(interaction.payload, `${attempt.seed}:${item.id}`);

		const state: AnswerState =
			grading.mode === 'rubric'
				? 'pending'
				: gravada.score >= 1
					? 'correct'
					: gravada.score > 0
						? 'partial'
						: 'incorrect';

		const { answer: esperada } = readableAnswerKey(interaction.type, interaction.payload);

		return [
			{
				id: item.id,
				index: i + 1,
				prompt: promptInstruction(prompt) || instructionText(prompt.instructionKey),
				// O que o aluno FEZ, na mesma palavra que o resultado usa — o rótulo
				// era `` `${interaction.type} · ${itemSkills(item).join(' + ')}` ``,
				// que chega na tela como "cloze · writing".
				label: rotuloDoItem(prompt, interaction.type, grading.mode),
				given: readableAnswer(interaction.type, runtime, gravada.answer),
				// Só o que não saiu certo precisa da resposta esperada ao lado —
				// e nunca no item que ainda vai para a fila de rubrica.
				expected: state === 'correct' || state === 'pending' ? undefined : esperada,
				state
			}
		];
	});

	return {
		activity: {
			slug: params.slug,
			title: activityVersion.activity.title,
			itemCount: activityVersion.items.length,
			dir
		},
		student: { name: attempt.name },
		tally: {
			correct: answers.filter((a) => a.state === 'correct').length,
			partial: answers.filter((a) => a.state === 'partial').length,
			incorrect: answers.filter((a) => a.state === 'incorrect').length
		},
		answers
	};
};
