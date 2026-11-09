import type { PageServerLoad } from './$types';
import { requireTeacher } from '$lib/server/auth/guard';
import { modulos } from '$lib/server/db/repos/modules';
import { atividades } from '$lib/server/db/repos/activities';
import { nivelOuNulo } from '$lib/atividades/nivel';
import { programacoes } from '$lib/server/db/repos/programacoes';
import { eventosDaAgenda } from '$lib/server/modulos/agenda';
import {
	contagemDeEnvios,
	estadoDaAlocacao,
	estadoDoModulo,
	proximoEnvio,
	rotuloDoInstante,
	TEXTO_DO_MOTIVO
} from '$lib/modulos/estado';
import { proximosDias } from '$lib/modulos/agenda';
import {
	hojeEmBrasilia,
	resumoDaProgramacao,
	rotuloDaData,
	somarDias
} from '$lib/modulos/programacao';
import { etiquetaDaTurma } from '$lib/etiquetas';

/** O "próximo envio" da linha da turma, e como ele se pinta. */
type TipoDoProximo = 'erro' | 'aviso' | 'ok' | 'pausa' | 'fim' | 'nada';

const ddmm = (d: Date) => rotuloDoInstante(d).split(' ')[1];

/**
 * A lista de módulos (desenho "Studio Modulos v2"). Responde três perguntas sem
 * abrir nada: o que precisa de mim (o aviso do topo), o que sai esta semana (os
 * 7 dias de todos os módulos) e como cada módulo anda em cada turma (ritmo,
 * enviadas, próximo envio e quantos terminaram a última). O loader só lê; criar,
 * renomear, duplicar e apagar são remote functions.
 */
export const load: PageServerLoad = async ({ locals }) => {
	const teacher = requireTeacher(locals);
	const repo = programacoes(teacher);
	const [lista, alocacoes, eventos, ultimos, todas] = await Promise.all([
		modulos(teacher).list(),
		repo.todas(),
		eventosDaAgenda(teacher),
		repo.ultimoEnvioPorTurma(),
		atividades(teacher).list()
	]);
	const hoje = hojeEmBrasilia();

	const linhas = lista.map((m) => {
		const titulo = (id: string) => m.atividades.find((a) => a.id === id)?.title ?? 'atividade';
		const estadoDe = (id: string) => m.atividades.find((a) => a.id === id)?.estado;
		const ids = m.atividades.map((a) => a.id);

		const turmas = alocacoes
			.filter((a) => a.moduleId === m.id)
			.map((a) => {
				const estado = estadoDaAlocacao(a);
				const { enviadas, total } = contagemDeEnvios(a.programacao, a.envios, ids);
				let prox: string;
				let tipo: TipoDoProximo;
				const falha = a.envios.find((e) => e.status === 'nao_saiu');
				const p = proximoEnvio(a.envios);
				if (estado === 'falha' && falha) {
					prox = `${titulo(falha.activityId)} esperando desde ${rotuloDoInstante(falha.dueAt)}`;
					tipo = 'erro';
				} else if (estado === 'pausada' && a.pausedAt) {
					prox = `pausada desde ${ddmm(a.pausedAt)}`;
					tipo = 'pausa';
				} else if (estado === 'concluida') {
					const ultima = a.envios
						.map((e) => e.sentAt)
						.filter((d): d is Date => d !== null)
						.sort((x, y) => y.getTime() - x.getTime())[0];
					prox = ultima ? `tudo enviado em ${ddmm(ultima)}` : 'tudo enviado';
					tipo = 'fim';
				} else if (estado === 'ativa' && p) {
					const rascunho = estadoDe(p.activityId) !== 'no-ar';
					prox = `${rotuloDoInstante(p.dueAt)} · ${titulo(p.activityId)}${rascunho ? ' (rascunho)' : ''}`;
					tipo = rascunho ? 'aviso' : 'ok';
				} else {
					prox = 'nada programado';
					tipo = 'nada';
				}
				const ultimo = ultimos[`${m.id}:${a.turma.id}`];
				return {
					id: a.id,
					sigla: etiquetaDaTurma(a.turma.name),
					nome: a.turma.name,
					cor: a.turma.color,
					ritmo: a.programacao ? resumoDaProgramacao(a.programacao) : 'sem programação',
					enviadas,
					total,
					estado,
					prox,
					tipo,
					terminaram:
						ultimo && ultimo.convites > 0
							? `${Math.round((ultimo.terminaram / ultimo.convites) * 100)}%`
							: null
				};
			});

		const estado = estadoDoModulo(turmas.map((t) => t.estado));
		const pausadaDesde = alocacoes
			.filter((a) => a.moduleId === m.id && a.pausedAt)
			.map((a) => a.pausedAt as Date)
			.sort((x, y) => x.getTime() - y.getTime())[0];

		return {
			id: m.id,
			name: m.name,
			description: m.description,
			color: m.color,
			sigla: etiquetaDaTurma(m.name),
			estado,
			sequencia: m.atividades.map((a) => ({ titulo: a.title, estado: a.estado })),
			noAr: m.noAr,
			turmas,
			semana: proximosDias(
				eventos.filter((e) => e.modulo.id === m.id),
				hoje
			),
			pausadaDesde: pausadaDesde ? ddmm(pausadaDesde) : null
		};
	});

	// O aviso do topo: o envio que não saiu há mais tempo. Se a mesma atividade
	// está programada para outra turma nesta semana, ele diz — é o que torna
	// resolver urgente.
	const falhas = alocacoes
		.flatMap((a) =>
			a.envios.filter((e) => e.status === 'nao_saiu').map((e) => ({ alocacao: a, envio: e }))
		)
		.sort((x, y) => x.envio.dueAt.getTime() - y.envio.dueAt.getTime());
	const primeira = falhas[0];
	let alerta: {
		titulo: string;
		detalhe: string;
		acao: string;
		atividadeId: string | null;
		moduloId: string;
		alocacaoId: string;
	} | null = null;
	if (primeira) {
		const { alocacao, envio } = primeira;
		const mod = lista.find((m) => m.id === alocacao.moduleId);
		const nome = mod?.atividades.find((a) => a.id === envio.activityId)?.title ?? 'A atividade';
		const tambem = eventos.find(
			(e) =>
				e.atividade.id === envio.activityId &&
				e.alocacaoId !== alocacao.id &&
				(e.estado === 'programada' || e.estado === 'rascunho') &&
				e.dia <= somarDias(hoje, 6)
		);
		alerta = {
			titulo: `A liberação de ${rotuloDoInstante(envio.dueAt)} para ${alocacao.turma.name} não aconteceu.`,
			detalhe: `${nome} ${envio.reason ? TEXTO_DO_MOTIVO[envio.reason] : 'não pôde sair'}${
				tambem
					? `, e ${tambem.turma.nome} também a recebe ${tambem.dia === hoje ? 'hoje' : `em ${rotuloDaData(tambem.dia)}`}`
					: ''
			}.${falhas.length > 1 ? ` Mais ${falhas.length - 1} ${falhas.length === 2 ? 'envio espera' : 'envios esperam'}.` : ''}`,
			acao:
				envio.reason === 'rascunho'
					? `Publicar ${nome}`
					: envio.reason === 'arquivada'
						? `Abrir ${nome}`
						: 'Ver a programação',
			atividadeId: envio.reason === 'audio' ? null : envio.activityId,
			moduloId: alocacao.moduleId,
			alocacaoId: alocacao.id
		};
	}

	const atividadesUnicas = new Set(lista.flatMap((m) => m.atividades.map((a) => a.id)));
	const turmasRecebendo = new Set(
		alocacoes
			.filter((a) => {
				const e = estadoDaAlocacao(a);
				return e === 'ativa' || e === 'falha';
			})
			.map((a) => a.turma.id)
	);

	return {
		modulos: linhas,
		resumo: {
			modulos: lista.length,
			atividades: atividadesUnicas.size,
			turmasRecebendo: turmasRecebendo.size
		},
		alerta,
		semana: proximosDias(eventos, hoje),
		// O que o "Novo módulo" pode levar já ao nascer. Arquivada fica fora: ela
		// está fora do ar para quem não começou.
		atividades: todas
			.filter((a) => !a.archivedAt)
			.map((a) => ({
				id: a.id,
				title: a.title,
				level: nivelOuNulo(a.level),
				idioma: a.targetLang,
				noAr: a.versions.some((v) => v.publications.length > 0)
			}))
	};
};
