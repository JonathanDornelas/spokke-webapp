import { error } from '@sveltejs/kit';
import { toDataURL } from 'qrcode';
import type { PageServerLoad } from './$types';
import { requireTeacher } from '$lib/server/auth/guard';
import { atividades } from '$lib/server/db/repos/activities';
import { playerRepo } from '$lib/server/db/repos/player';
import { itemAudioHashes, itemSkills } from '$lib/server/player/runtime';
import { labelForTag } from '$lib/kernel/language/profiles';
import { publicationSettingsSchema } from '$lib/server/player/settings';
import { linkDaAtividade } from '$lib/server/player/slug';
import { enfileirarAudioFaltante } from '$lib/server/tts/enfileirar';
import { skillLabels } from '$lib/kernel/interactions/skill-schema';
import type { Skill } from '$lib/kernel/interactions/types';
import { turmas } from '$lib/server/db/repos/classrooms';
import { modulos } from '$lib/server/db/repos/modules';
import { corOuPadrao, etiquetaDaTurma } from '$lib/etiquetas';

/**
 * Etapa 4. As habilidades aqui são DERIVADAS dos itens aceitos — o professor
 * não escolheu nenhuma delas (kernel.md). O contador de áudio vem do que já
 * existe em `MediaAsset`: a publicação só fica acessível quando todos os
 * áudios terminam (server.md "TTS").
 *
 * Publicar e ENVIAR moram juntos aqui (o desenho "Studio Publicar A"): as
 * turmas e os módulos do professor vêm para as bandejas da tela, e quem envia
 * e quem acrescenta ao módulo continuam sendo as remote functions de sempre
 * (`enviarParaTurmas`, `adicionarAoModulo`), chamadas depois de publicar.
 */
export const load: PageServerLoad = async ({ locals, params, url }) => {
	const teacher = requireTeacher(locals);
	const activity = await atividades(teacher).byId(params.id);
	if (!activity) error(404, 'Atividade não encontrada');

	const [draft, published, listaDeTurmas, listaDeModulos] = await Promise.all([
		atividades(teacher).draft(params.id),
		atividades(teacher).published(params.id),
		turmas(teacher).list(),
		modulos(teacher).list()
	]);

	// Depois de publicar não existe mais rascunho: a tela continua mostrando a
	// versão que acabou de ir ao ar, não uma atividade vazia.
	// Do rascunho, só o que está DENTRO: o que ficou de fora na revisão não vai
	// para o aluno, não conta nas habilidades e não pede áudio.
	const items = draft?.items.filter((item) => !item.discarded) ?? published?.items ?? [];

	const counts = new Map<Skill, number>();
	for (const item of items) {
		for (const skill of itemSkills(item)) counts.set(skill, (counts.get(skill) ?? 0) + 1);
	}

	const hashes = items.flatMap((item) => itemAudioHashes(item, activity.targetLang));
	let audio = await playerRepo.audioReady(teacher.id, hashes);

	// Falta áudio? Peça — não fique só contando. Quem gera é `gerarItens`, mas
	// entre lá e aqui o professor pode ter editado a frase de um item (texto
	// novo = hash novo) ou restaurado um descartado. Sem esta reposição a tela
	// mostraria "3 de 10" para sempre, com o botão de publicar travado e nada
	// acontecendo do outro lado.
	//
	// Enfileirar de um `load` é efeito colateral num GET, e é deliberado: o
	// helper é idempotente (pula o que tem áudio válido e o que já está na
	// fila), então recarregar a tela não multiplica trabalho.
	if (audio.done < audio.total) {
		await enfileirarAudioFaltante({
			teacherId: teacher.id,
			targetTag: activity.targetLang,
			items
		});
		audio = await playerRepo.audioReady(teacher.id, hashes);
	}

	const publicacao = published?.publications.at(-1);
	// As configurações da publicação anterior viram os padrões desta tela: o
	// professor não deve ter que redigitar o código a cada publicação.
	const settings = publicacao ? publicationSettingsSchema.parse(publicacao.settings) : null;
	const noAr = !draft && !!published;

	// **O link só existe depois de publicar.** O endereço sai do id da atividade
	// (`player/slug.ts`) e daria para mostrá-lo antes — mas um link que não abre
	// é um link que o professor copia para o grupo e a turma bate numa porta
	// fechada. Publicada, vale o slug que está no ar (atividades antigas têm
	// outro); antes disso a tela diz que ele é criado na publicação.
	const slug = publicacao?.slug ?? linkDaAtividade(activity.id);
	// O QR sai pronto do servidor: é uma imagem estática do link, e gerar no
	// cliente só acrescentaria JS a uma tela que não precisa dele. A origem vem
	// do request — em dev o link é localhost, não "spokke.com.br".
	const linkPublico = publicacao ? `${url.origin}/a/${slug}` : null;
	const qr = linkPublico
		? await toDataURL(linkPublico, { margin: 1, width: 264, errorCorrectionLevel: 'M' })
		: null;

	return {
		origin: url.origin,
		link: linkPublico,
		qr,
		activity: {
			id: activity.id,
			title: activity.title,
			targetLang: labelForTag(activity.targetLang),
			sourceLang: labelForTag(activity.sourceLang),
			slug
		},
		access: {
			requireCode: settings?.requireCode ?? false,
			code: settings?.code ?? '',
			showResult: settings?.showResult ?? true
		},
		itemCount: items.length,
		turmas: listaDeTurmas.map((turma) => ({
			id: turma.id,
			nome: turma.name,
			cor: corOuPadrao(turma.color),
			sigla: etiquetaDaTurma(turma.name),
			alunos: turma.students,
			comEmail: turma.withEmail
		})),
		// A posição diz se a atividade JÁ está no módulo (e em que lugar): essa
		// linha aparece marcada e parada — tirar dali é na tela do módulo.
		modulos: listaDeModulos.map((modulo) => {
			const indice = modulo.atividades.findIndex((a) => a.id === activity.id);
			return {
				id: modulo.id,
				nome: modulo.name,
				cor: modulo.color,
				sigla: etiquetaDaTurma(modulo.name),
				total: modulo.total,
				posicao: indice >= 0 ? indice + 1 : null
			};
		}),
		skills: [...counts.entries()].map(([name, count]) => ({ name: skillLabels[name], count })),
		audio,
		published: noAr,
		// O snapshot imutável (regra nº 7) existe para que ninguém tenha as
		// perguntas trocadas no meio da tentativa — mas ele é interno. Para o
		// professor a atividade é UMA só, com estado: rascunho, no ar, ou no ar
		// com mudanças por publicar. A tela nunca cita número de versão.
		jaNoAr: !!published
	};
};
