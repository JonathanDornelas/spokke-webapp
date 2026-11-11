import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireTeacher } from '$lib/server/auth/guard';
import { atividades } from '$lib/server/db/repos/activities';
import { materiais } from '$lib/server/db/repos/content-units';
import { parseContentUnit } from '$lib/kernel/content/parse';
import { getProfile, labelForTag } from '$lib/kernel/language/profiles';
import { KERNEL_TO_KIND, type MaterialRow } from '$lib/components/material-form';
import { estadoDaIa } from '$lib/server/ia/estado';
import { isTraducaoLigada } from '$lib/server/traducao';

export const load: PageServerLoad = async ({ locals, params }) => {
	const teacher = requireTeacher(locals);
	const activity = await atividades(teacher).byId(params.id);
	if (!activity) error(404, 'Atividade não encontrada');

	// "Materiais desta atividade" é literal: só o que está ligado a ela.
	const units = await materiais(teacher).byActivity(params.id);
	const idioma = labelForTag(activity.targetLang);

	const materials: MaterialRow[] = units.map((unit) => {
		const data = parseContentUnit(unit.kind, unit.data);
		// `primary` é o conteúdo no idioma alvo; `secondary`, o apoio na
		// língua do aluno.
		// Texto sem pergunta de compreensão não gera exercício nenhum
		// (`passage-comprehension` devolve zero itens sem elas) — a lista avisa
		// aqui, e não só na etapa 3 depois de gerar.
		const [primary, secondary] =
			'target' in data
				? [data.target, data.source]
				: 'term' in data
					? [data.term, data.translation]
					: 'title' in data
						? [
								data.title,
								data.questions.length === 0
									? 'Sem perguntas — nada será gerado deste texto'
									: `${data.questions.length} ${data.questions.length === 1 ? 'pergunta' : 'perguntas'} · ${data.text.slice(0, 60)}`
							]
						: [data.lines[0]?.text ?? '', `${data.lines.length} falas`];

		// Os campos crus, para "Editar" reabrir o MESMO formulário já preenchido,
		// campo a campo: `secondary` é resumo (o texto vem cortado, o diálogo
		// vira uma contagem) e reeditar a partir dele perderia conteúdo.
		return {
			id: unit.id,
			kind: KERNEL_TO_KIND[unit.kind],
			primary,
			secondary,
			// Dentro da atividade, o material fala o idioma DELA.
			idioma: activity.targetLang,
			usedIn: unit.usedIn,
			// Em mais de uma atividade = veio da biblioteca (ou já foi para ela).
			// Cadastrar de novo uma frase que o professor já tinha REAPROVEITA a
			// existente, e a etiqueta é o que conta isso para ele — senão parece
			// que a linha nova não foi salva.
			daBiblioteca: unit.usedIn > 1,
			target:
				'target' in data
					? data.target
					: 'term' in data
						? data.term
						: 'title' in data
							? data.title
							: '',
			source: 'source' in data ? data.source : 'translation' in data ? data.translation : '',
			raw: 'text' in data ? data.text : '',
			note: 'note' in data ? (data.note ?? '') : '',
			example: 'example' in data ? (data.example ?? '') : '',
			questions: 'questions' in data ? data.questions : [],
			lines: 'lines' in data ? data.lines : []
		};
	});

	const profile = getProfile(activity.targetLang);
	return {
		activity: {
			id: activity.id,
			title: activity.title,
			dir: profile.direction,
			/** A tag do idioma alvo — é o que tokeniza a prévia de "montar a frase". */
			tag: profile.tag,
			targetLabel: idioma,
			sourceLabel: labelForTag(activity.sourceLang),
			/** A língua do aluno: para onde vai a tradução automática do material. */
			sourceTag: activity.sourceLang
		},
		materials,
		// "Gerar com IA" escreve no par de idiomas DA ATIVIDADE.
		ia: await estadoDaIa(teacher, { alvo: activity.targetLang, origem: activity.sourceLang }),
		// A tradução da frase do aluno sai sozinha quando há tradutor (adr-006).
		traducaoAutomatica: isTraducaoLigada()
	};
};
