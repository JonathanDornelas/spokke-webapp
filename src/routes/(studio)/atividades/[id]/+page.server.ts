import { error } from '@sveltejs/kit';
import { toDataURL } from 'qrcode';
import type { PageServerLoad } from './$types';
import { nivelOuNulo } from '$lib/atividades/nivel';
import { modulos } from '$lib/server/db/repos/modules';
import { corOuPadrao } from '$lib/etiquetas';
import { requireTeacher } from '$lib/server/auth/guard';
import { atividades } from '$lib/server/db/repos/activities';
import { envios } from '$lib/server/db/repos/deliveries';
import { prisma } from '$lib/server/db/client';
import { itemAudioHashes, itemSkills } from '$lib/server/player/runtime';
import { playerRepo } from '$lib/server/db/repos/player';
import { publicationSettingsSchema } from '$lib/server/player/settings';
import { resumoDoItem, tipoDoItem } from '$lib/server/atividades/resumo';
import { etiquetaDaTurma } from '$lib/server/turmas/etiqueta';
import { interactionSchema, promptSchema } from '$lib/kernel/item';
import { labelForTag } from '$lib/kernel/language/profiles';
import { skillLabels } from '$lib/kernel/interactions/skill-schema';
import type { Skill } from '$lib/kernel/interactions/types';

/**
 * A atividade aberta. Abrir uma da lista caía direto em `resultados`, que
 * responde "como foi" antes de o professor poder ver "o que é" — e para uma
 * atividade sem nenhuma tentativa era uma tela vazia. Aqui está o que ele
 * criou: as questões, o link, o QR, o código e para quais turmas foi.
 *
 * O que a tela mostra é a versão NO AR quando existe uma, e o rascunho quando
 * não — é o que o aluno pegaria se abrisse o link agora. Ler o rascunho aqui
 * não o cria: quem clona a versão publicada para edição é a etapa de revisão
 * (`draftFromPublished`), e esta tela é de leitura.
 */
function haQuantoTempo(data: Date): string {
	const min = Math.round((Date.now() - data.getTime()) / 60000);
	if (min < 60) return 'há minutos';
	const horas = Math.round(min / 60);
	if (horas < 24) return `há ${horas}h`;
	const dias = Math.round(horas / 24);
	if (dias === 1) return 'ontem';
	if (dias < 7) return `há ${dias} dias`;
	const semanas = Math.round(dias / 7);
	return semanas === 1 ? 'há 1 semana' : `há ${semanas} semanas`;
}

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const teacher = requireTeacher(locals);
	const activity = await atividades(teacher).byId(params.id);
	if (!activity) error(404, 'Atividade não encontrada');

	const [draft, published, deliveries, seusModulos, todosModulos] = await Promise.all([
		atividades(teacher).draft(params.id),
		atividades(teacher).published(params.id),
		envios(teacher).porAtividade(params.id),
		modulos(teacher).porAtividade(params.id),
		modulos(teacher).nomes()
	]);

	// A versão que o aluno veria agora. Sem publicação, o rascunho — é o que
	// existe para mostrar, marcado como rascunho na tela.
	const versao = published ?? draft;
	const itens = (versao?.items ?? []).filter((item) => !item.discarded);

	const habilidades = new Map<Skill, number>();
	for (const item of itens) {
		for (const skill of itemSkills(item)) {
			habilidades.set(skill, (habilidades.get(skill) ?? 0) + 1);
		}
	}

	// **O estado do áudio.** Ele é a única parte da atividade que existe FORA do
	// banco — num bucket, com 10 dias de validade (server.md "TTS") — e por isso
	// é a única que pode estar faltando sem nada na tela dizer. O professor
	// precisa ver isso aqui e não só na etapa de publicar: é nesta tela que ele
	// volta dias depois para reenviar o link.
	const hashesDeAudio = itens.flatMap((item) => itemAudioHashes(item, activity.targetLang));
	const [prontos, vence] = await Promise.all([
		playerRepo.audioReady(teacher.id, hashesDeAudio),
		playerRepo.audioVenceEm(teacher.id, hashesDeAudio)
	]);
	const audio = {
		...prontos,
		// Quantos dias até o PRIMEIRO vencer — é o prazo real da atividade, não a
		// média. Arredonda para cima: "vence em 0 dias" não diz nada a ninguém.
		venceEmDias: vence ? Math.max(0, Math.ceil((vence.getTime() - Date.now()) / 86_400_000)) : null
	};

	const publicacao = published?.publications.at(-1);
	const settings = publicacao ? publicationSettingsSchema.parse(publicacao.settings) : null;

	// **O link só existe depois de publicar.** O que está NO AR manda: uma
	// atividade publicada antes de o endereço passar a sair do id tem outro
	// slug, e mostrar o derivado era mostrar um link que responde 404 — o
	// professor projetava um QR morto. No rascunho nunca publicado não há link
	// nenhum, e a tela diz que ele nasce na publicação.
	const link = publicacao ? `${url.origin}/a/${publicacao.slug}` : null;
	const qr = link
		? await toDataURL(link, { margin: 1, width: 264, errorCorrectionLevel: 'M' })
		: null;

	// Leitura agregada, como na lista: o `teacherId` entra no filtro mesmo com a
	// atividade já resolvida pelo repositório — o escopo é o que impede vazar
	// entre professores, e não custa nada repeti-lo (regra inviolável nº 4).
	const escopo = { activityVersion: { activity: { id: params.id, teacherId: teacher.id } } };

	const [respostas, tentativas] = await Promise.all([
		// Distribuição de acerto: parcial tem faixa própria, nunca somada ao erro
		// (design-system.md "Estado de correção").
		prisma.attemptItem.findMany({ where: { item: escopo }, select: { score: true } }),
		prisma.attempt.findMany({
			where: { publication: escopo },
			select: { studentId: true, finishedAt: true }
		})
	]);

	const placar = { correct: 0, partial: 0, incorrect: 0 };
	for (const r of respostas) {
		if (r.score >= 1) placar.correct++;
		else if (r.score > 0) placar.partial++;
		else placar.incorrect++;
	}

	return {
		activity: {
			id: activity.id,
			title: activity.title,
			targetLang: labelForTag(activity.targetLang),
			/** A tag de idioma (`$lib/idiomas.ts`) — o chip do cabeçalho. */
			idioma: activity.targetLang,
			sourceLang: labelForTag(activity.sourceLang),
			// Criada em DATA, editada há QUANTO TEMPO: a primeira responde "de que
			// semestre é isto", a segunda "alguém mexeu depois de publicar".
			createdAt: activity.createdAt.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' }),
			updatedAt: haQuantoTempo(activity.updatedAt),
			// Arquivada: fora do estoque do plano e com o link fechado para quem não
			// começou (docs/adr-002-billing.md). A tela oferece desarquivar.
			arquivada: activity.archivedAt !== null,
			// O nível (CEFR) é rótulo, não versão: troca na hora, sem publicar.
			level: nivelOuNulo(activity.level)
		},
		// Os módulos em que ela está (chips) e os que dá para acrescentar.
		modulos: {
			dela: seusModulos.map((m) => ({ id: m.id, name: m.name, color: corOuPadrao(m.color) })),
			outros: todosModulos.filter((m) => !seusModulos.some((d) => d.id === m.id))
		},
		/** `no-ar` · `mudancas` (no ar, com edições por publicar) · `rascunho`. */
		estado: published
			? draft
				? ('mudancas' as const)
				: ('no-ar' as const)
			: ('rascunho' as const),
		link,
		qr,
		audio,
		access: {
			requireCode: settings?.requireCode ?? false,
			code: settings?.code ?? '',
			showResult: settings?.showResult ?? true
		},
		items: itens.map((item, i) => {
			const interaction = interactionSchema.parse(item.interaction);
			const prompt = promptSchema.parse(item.prompt);
			return {
				id: item.id,
				n: i + 1,
				tipo: tipoDoItem(prompt.kind, interaction.type),
				summary: resumoDoItem(item.generatedBy, interaction.type),
				// Habilidade DERIVADA, nunca declarada pelo professor.
				habilidade: itemSkills(item)
					.map((skill) => skillLabels[skill])
					.join(' + ')
			};
		}),
		skills: [...habilidades.entries()].map(([skill, count]) => ({
			name: skillLabels[skill],
			count
		})),
		deliveries: deliveries.map((envio) => {
			const convidados = new Set(envio.invites.map((c) => c.studentId));
			const daTurma = envio.publication.attempts.filter(
				(t) => t.studentId && convidados.has(t.studentId)
			);
			return {
				id: envio.id,
				classroomId: envio.classroom.id,
				classroom: envio.classroom.name,
				badge: etiquetaDaTurma(envio.classroom.name),
				color: envio.classroom.color,
				when: haQuantoTempo(envio.createdAt),
				invites: envio.invites.length,
				opened: envio.invites.filter((c) => c.openedAt).length,
				bounced: envio.invites.filter((c) => c.bouncedAt).length,
				finished: daTurma.filter((t) => t.finishedAt).length
			};
		}),
		attempts: {
			total: tentativas.length,
			finished: tentativas.filter((t) => t.finishedAt).length,
			// Tentativa sem `studentId` é o caminho NORMAL: quem entrou pelo link
			// aberto. Aparece como número, nunca como dado faltando.
			guests: tentativas.filter((t) => !t.studentId).length
		},
		score: placar
	};
};
