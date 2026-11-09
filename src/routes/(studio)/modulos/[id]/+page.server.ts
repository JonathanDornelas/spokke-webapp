import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireTeacher } from '$lib/server/auth/guard';
import { modulos } from '$lib/server/db/repos/modules';
import { atividades } from '$lib/server/db/repos/activities';
import { programacoes } from '$lib/server/db/repos/programacoes';
import { labelForTag } from '$lib/kernel/language/profiles';
import { nivelOuNulo } from '$lib/atividades/nivel';
import { hojeEmBrasilia } from '$lib/modulos/programacao';
import { proximosDias } from '$lib/modulos/agenda';
import { eventosDaAgenda } from '$lib/server/modulos/agenda';

/**
 * O módulo aberto (docs/telas-modulos-professor.md 2): as atividades na ordem,
 * as que dá para acrescentar, as turmas alocadas com a programação de cada uma,
 * e o histórico do que já saiu. Tudo pelos repositórios escopados — o módulo de
 * outro professor responde 404, sem dizer que existe (auth.md).
 *
 * `hoje` vem daqui, em Brasília, para a prévia da tela calcular as MESMAS datas
 * que o servidor grava ao salvar.
 */
export const load: PageServerLoad = async ({ locals, params, url }) => {
	const teacher = requireTeacher(locals);
	const modulo = await modulos(teacher).byId(params.id);
	if (!modulo) error(404, 'Módulo não encontrado');

	const repo = programacoes(teacher);
	const [todas, alocacoes, livres, historico, eventos] = await Promise.all([
		atividades(teacher).list(),
		repo.doModulo(modulo.id),
		repo.livres(modulo.id),
		repo.historico(modulo.id),
		eventosDaAgenda(teacher, { moduleId: modulo.id })
	]);
	const hoje = hojeEmBrasilia();
	const dentro = new Set(modulo.atividades.map((a) => a.id));

	// `?turma=<alocação>` abre o painel de programação direto — é para onde a
	// tela da turma leva ("Programação").
	const pedida = url.searchParams.get('turma');

	return {
		hoje,
		modulo: {
			...modulo,
			atividades: modulo.atividades.map((a) => ({ ...a, language: labelForTag(a.targetLang) }))
		},
		// Arquivada não entra no seletor: ela está fora do ar para quem não começou.
		disponiveis: todas
			.filter((a) => !dentro.has(a.id) && !a.archivedAt)
			.map((a) => ({
				id: a.id,
				title: a.title,
				level: nivelOuNulo(a.level),
				idioma: a.targetLang,
				noAr: a.versions.some((v) => v.publications.length > 0)
			})),
		alocacoes,
		livres,
		historico,
		// O que sai deste módulo nos próximos 7 dias, em todas as turmas.
		semana: proximosDias(eventos, hoje),
		painelInicial: alocacoes.some((a) => a.id === pedida) ? pedida : null
	};
};
