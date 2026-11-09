import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireTeacher } from '$lib/server/auth/guard';
import { turmas } from '$lib/server/db/repos/classrooms';
import { labelForTag } from '$lib/kernel/language/profiles';
import { idiomaOuNulo } from '$lib/idiomas';
import { etiquetaDaTurma } from '$lib/server/turmas/etiqueta';
import { programacoes } from '$lib/server/db/repos/programacoes';
import { resumoDaProgramacao } from '$lib/modulos/programacao';
import {
	contagemDeEnvios,
	estadoDaAlocacao,
	proximoEnvio,
	rotuloDoInstante
} from '$lib/modulos/estado';

/**
 * A turma. Três blocos numa rolagem: cabeçalho com os quatro números que
 * importam, alunos com o estado no último envio, e o histórico.
 *
 * **Os cinco estados de aluno** têm texto próprio e ícone, nunca só cor —
 * e verde e âmbar ficam de fora porque são a semântica de correção. Vermelho
 * aparece só em "Voltou", que é o único que pede ação.
 */
export type EstadoAluno =
	'terminou' | 'comecou' | 'enviado' | 'disponivel' | 'sem-envio' | 'sem-email' | 'voltou';

function haQuantoTempo(data: Date | null): string {
	if (!data) return 'nunca';
	const dias = Math.floor((Date.now() - data.getTime()) / 86_400_000);
	if (dias <= 0) return 'hoje';
	if (dias === 1) return 'ontem';
	if (dias < 7) return `há ${dias} dias`;
	const semanas = Math.floor(dias / 7);
	if (semanas === 1) return 'há 1 semana';
	if (semanas < 5) return `há ${semanas} semanas`;
	const meses = Math.floor(dias / 30);
	return meses === 1 ? 'há 1 mês' : `há ${meses} meses`;
}

function iniciais(nome: string): string {
	return (
		nome
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((parte) => parte[0]?.toUpperCase())
			.join('') || '?'
	);
}

export const load: PageServerLoad = async ({ locals, params }) => {
	const teacher = requireTeacher(locals);
	const turma = await turmas(teacher).detail(params.id);
	if (!turma) error(404, 'Turma não encontrada');

	const ultimoEnvio = turma.deliveries[0] ?? null;

	// "Módulos desta turma" (docs/telas-modulos-professor.md 2.3): a programação
	// de cada módulo alocado, dita como no detalhe do módulo.
	const alocacoes = await programacoes(teacher).daTurma(turma.id);
	const modulos = alocacoes.map((a) => {
		const estado = estadoDaAlocacao(a);
		const ids = a.modulo.atividades.map((x) => x.id);
		const { enviadas, total } = contagemDeEnvios(a.programacao, a.envios, ids);
		const prox = proximoEnvio(a.envios);
		const falha = a.envios.find((e) => e.status === 'nao_saiu');
		const titulo = (id: string) =>
			a.modulo.atividades.find((x) => x.id === id)?.title ?? 'uma atividade';
		const quando = a.programacao ? resumoDaProgramacao(a.programacao) : '';
		return {
			allocationId: a.id,
			moduleId: a.modulo.id,
			name: a.modulo.name,
			badge: etiquetaDaTurma(a.modulo.name),
			color: a.modulo.color,
			estado,
			resumo:
				estado === 'sem'
					? 'alocada · nada liberado ainda'
					: estado === 'falha' && falha
						? `${quando} · ${enviadas} de ${total} liberadas · ${titulo(falha.activityId)} esperando desde ${rotuloDoInstante(falha.dueAt)}`
						: `${quando} · ${enviadas} de ${total} liberadas${prox && !a.pausedAt ? ` · próxima ${rotuloDoInstante(prox.dueAt)}` : ''}`
		};
	});

	const students = turma.students.map((aluno) => {
		const convite = aluno.invites[0] ?? null;

		// "Sem e-mail" é sobre o CADASTRO; "sem envio" é sobre a turma ainda não
		// ter recebido nada. Confundir os dois marcava como "sem e-mail" um
		// aluno que tem e-mail e só não foi convidado ainda.
		//
		// "Disponível" é o envio de módulo SEM e-mail (`Delivery.porEmail` falso): a
		// atividade abriu no mapa e o link pessoal existe, mas ninguém foi avisado —
		// dizer "Enviado" ali seria afirmar que um e-mail saiu.
		const tentativa = convite
			? aluno.attempts.find((a) => a.publicationId === convite.delivery.publicationId)
			: undefined;
		let estado: EstadoAluno;
		if (convite && !convite.delivery.porEmail) {
			estado = tentativa?.finishedAt ? 'terminou' : tentativa ? 'comecou' : 'disponivel';
		} else if (!aluno.email) estado = 'sem-email';
		else if (!convite) estado = 'sem-envio';
		else if (convite.bouncedAt) estado = 'voltou';
		else estado = tentativa?.finishedAt ? 'terminou' : tentativa ? 'comecou' : 'enviado';

		return {
			id: aluno.id,
			name: aluno.name,
			initials: iniciais(aluno.name),
			email: aluno.email,
			state: estado,
			// O convite mais recente, para reenviar só para ele. Nulo quando a turma
			// ainda não recebeu nada ou o aluno entrou depois do último envio.
			inviteId: convite?.id ?? null,
			// A conta do aluno, quando ele já ligou as duas coisas abrindo o
			// convite logado. É informação, não estado da chamada: aluno com
			// conta e aluno sem conta participam igual, e por isso isto não entra
			// na contagem de estados nem muda o que o professor pode fazer.
			temConta: !!aluno.account,
			// O convite para a CONTA saiu por e-mail e ele ainda não entrou — a
			// chamada mostra "convidado" para o professor não mandar de novo à toa.
			convidadoParaConta: !aluno.account && !!aluno.accountInviteSentAt,
			// O avatar que o aluno montou na conta dele — o ícone dele na chamada.
			// Sem conta, as iniciais (o próprio `Avatar` cai nelas).
			avatar: aluno.account?.avatar ?? null
		};
	});

	const contagem = students.reduce<Record<EstadoAluno, number>>(
		(acc, aluno) => {
			acc[aluno.state]++;
			return acc;
		},
		{
			terminou: 0,
			comecou: 0,
			enviado: 0,
			disponivel: 0,
			'sem-envio': 0,
			'sem-email': 0,
			voltou: 0
		}
	);

	const deliveries = turma.deliveries.map((envio) => {
		const idsConvidados = new Set(envio.invites.map((c) => c.studentId));
		const tentativas = envio.publication.attempts.filter(
			(t) => t.studentId && idsConvidados.has(t.studentId)
		);
		return {
			id: envio.id,
			activityId: envio.publication.activityVersion.activity.id,
			activityTitle: envio.publication.activityVersion.activity.title,
			moduleName: envio.module?.name ?? null,
			porEmail: envio.porEmail,
			when: haQuantoTempo(envio.createdAt),
			invites: envio.invites.length,
			opened: envio.invites.filter((c) => c.openedAt).length,
			started: tentativas.length,
			finished: tentativas.filter((t) => t.finishedAt).length,
			unopened: envio.invites.filter((c) => !c.openedAt).length
		};
	});

	return {
		classroom: {
			id: turma.id,
			name: turma.name,
			badge: etiquetaDaTurma(turma.name),
			color: turma.color,
			languageLabel: turma.languageTag ? labelForTag(turma.languageTag) : null,
			idioma: idiomaOuNulo(turma.languageTag),
			createdAt: turma.createdAt.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })
		},
		totals: {
			students: students.length,
			withEmail: students.filter((a) => a.email).length,
			deliveries: turma.deliveries.length,
			bounced: contagem.voltou
		},
		lastDelivery: ultimoEnvio
			? {
					id: ultimoEnvio.id,
					activityTitle: ultimoEnvio.publication.activityVersion.activity.title,
					when: haQuantoTempo(ultimoEnvio.createdAt),
					porEmail: ultimoEnvio.porEmail,
					unopened: ultimoEnvio.invites.filter((c) => !c.openedAt).length
				}
			: null,
		students,
		tally: contagem,
		deliveries,
		modulos
	};
};
