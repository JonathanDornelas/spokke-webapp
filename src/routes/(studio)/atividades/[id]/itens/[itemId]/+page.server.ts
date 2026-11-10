import { error, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import type { PageServerLoad } from './$types';
import { requireTeacher } from '$lib/server/auth/guard';
import { atividades } from '$lib/server/db/repos/activities';
import { instructionText, itemSkills } from '$lib/server/player/runtime';
import { readableAnswerKey } from '$lib/server/studio/answer-key';
import { gradingSchema, interactionSchema, localeSchema, promptSchema } from '$lib/kernel/item';
import { getProfile, labelForTag } from '$lib/kernel/language/profiles';
import { skillLabels } from '$lib/kernel/interactions/skill-schema';
import { gabaritoEditavel } from '$lib/atividades/editor-item';

/**
 * Editor de questão — nível 3 (kernel.md). O gabarito vem para esta tela porque
 * ela é do PROFESSOR e roda atrás do guard; o que nunca sai daqui é o mesmo
 * payload indo para o Player (regra inviolável nº 1) — a prévia ao lado vem de
 * `previaDoItem`, que passa pelo `toRuntime()`.
 *
 * O que o formulário pode mudar é decidido por `$lib/atividades/editor-item.ts`,
 * nas duas pontas. O gabarito só é editável nos tipos de lista de textos
 * (digitar e lacuna); nos outros ele segue como o gerador montou — o
 * formulário derivado do `authoringSchema` continua pendente (paginas.md).
 */
export const load: PageServerLoad = async ({ locals, params }) => {
	const teacher = requireTeacher(locals);
	const repo = atividades(teacher);
	const activity = await repo.byId(params.id);
	if (!activity) error(404, 'Atividade não encontrada');

	const draft = await repo.draft(params.id);
	const index = draft?.items.findIndex((item) => item.id === params.itemId) ?? -1;
	const row = index >= 0 ? draft?.items[index] : undefined;

	// `!draft` está junto de `!row` porque um implica o outro — e é o que deixa
	// o TypeScript saber que o rascunho existe daqui para baixo.
	if (!draft || !row) {
		// O id pode ser de um item PUBLICADO: a tela de detalhes lista a versão
		// no ar, e publicar apaga o rascunho — clicar numa questão de lá dava
		// 404. Editar um item publicado é editar a cópia editável dele, então
		// aqui a gente abre essa cópia e manda o professor para o item
		// equivalente. `draftFromPublished` clona na mesma ORDEM, que é o que
		// liga um id ao outro (os ids são novos, as posições não mudam).
		const published = await repo.published(params.id);
		const posicao = published?.items.findIndex((item) => item.id === params.itemId) ?? -1;
		if (posicao >= 0) {
			const editavel = await repo.draftFromPublished(params.id);
			const equivalente = editavel?.items[posicao];
			if (equivalente) {
				redirect(
					303,
					resolve('/(studio)/atividades/[id]/itens/[itemId]', {
						id: params.id,
						itemId: equivalente.id
					})
				);
			}
		}
		error(404, 'Item não encontrado nesta atividade');
	}

	const prompt = promptSchema.parse(row.prompt);
	const interaction = interactionSchema.parse(row.interaction);
	const grading = gradingSchema.parse(row.grading);
	const locale = localeSchema.parse(row.locale);

	// Cada interação guarda o gabarito numa forma diferente; o professor vê
	// todas do mesmo jeito (resposta principal + o que mais é aceito).
	const { answer, variants } = readableAnswerKey(interaction.type, interaction.payload);
	const masked = (interaction.payload as { masked?: unknown }).masked;

	// A língua da RESPOSTA, não a do item: numa "traduza para o português" o
	// aluno escreve em português, e é o profile do português que diz se acento
	// conta — e para que lado o campo escreve.
	const tagDaResposta = grading.answerLang === 'source' ? locale.source : locale.target;
	const perfil = getProfile(tagDaResposta);

	// Os enunciados padrão que a tela pode precisar: o da chave gravada e os dos
	// tipos para os quais a questão pode mudar (`chaveDoEnunciado`).
	const chaves = [prompt.instructionKey, 'fill-the-blank', 'listen-and-type'].filter(
		(chave): chave is string => !!chave
	);

	const published = await repo.published(params.id);

	return {
		activity: { id: activity.id, title: activity.title },
		itemCount: draft.items.length,
		// "Questão anterior"/"Próxima" andam pelo rascunho na ordem dele. `null`
		// na ponta é o que desabilita o botão — não escondê-lo, senão a barra do
		// editor muda de largura entre uma questão e outra.
		prevId: draft.items[index - 1]?.id ?? null,
		nextId: draft.items[index + 1]?.id ?? null,
		/** Já existe versão no ar: ela não muda até publicar de novo. */
		jaNoAr: published !== null,
		resposta: {
			idioma: labelForTag(tagDaResposta),
			dir: perfil.direction,
			// Normalização é do LanguageProfile, nunca do item (CLAUDE.md): a tela
			// DIZ o que já é aceito, para o professor não cadastrar variante à toa.
			ignoraAcento: perfil.diacritics === 'tolerant',
			ignoraCaixa: !perfil.caseSensitive,
			ignoraPontuacao: perfil.normalizers.includes('strip-punct')
		},
		padroes: Object.fromEntries(chaves.map((chave) => [chave, instructionText(chave)])),
		item: {
			index: index + 1,
			id: row.id,
			descartado: row.discarded,
			interaction: interaction.type,
			gabaritoEditavel: gabaritoEditavel(interaction.type),
			lingua: grading.answerLang,
			gradingMode: grading.mode,
			promptKind: prompt.kind,
			instructionKey: prompt.instructionKey ?? null,
			/** O que o professor escreveu — vazio quando vale o padrão do tipo. */
			instruction: prompt.instruction ?? '',
			texto: prompt.text ?? '',
			masked: typeof masked === 'string' ? masked : '',
			answer,
			variants,
			habilidades: itemSkills(row).map((skill) => skillLabels[skill])
		}
	};
};
