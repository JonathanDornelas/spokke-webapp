import { z } from 'zod';
import { CORES_DE_ETIQUETA } from '$lib/etiquetas';
import { nivelOuNulo } from '$lib/atividades/nivel';
import { command, form, getRequestEvent, query } from '$app/server';
import { error, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { requireTeacher } from '$lib/server/auth/guard';
import { alunos, turmas } from '$lib/server/db/repos/classrooms';
import { envios } from '$lib/server/db/repos/deliveries';
import { atividades } from '$lib/server/db/repos/activities';
import { playerRepo } from '$lib/server/db/repos/player';
import { itemAudioHashes } from '$lib/server/player/runtime';
import { enfileirarAudioFaltante } from '$lib/server/tts/enfileirar';
import { publicationSettingsSchema } from '$lib/server/player/settings';
import { enqueueConvites, type ConviteJob } from '$lib/server/queue';
import { labelForTag } from '$lib/kernel/language/profiles';
import { campoIdioma } from '$lib/idiomas';
import { alunosValidos, parseAlunos } from '$lib/turmas/parse-alunos';

/**
 * Turmas, alunos e envio de convite. **Toda remote function é um endpoint
 * HTTP público** (regra inviolável nº 3): cada uma começa pelo guard, e
 * nenhuma toca o Prisma cru — só os repositórios, que injetam o `teacherId`.
 */

function teacherOf() {
	return requireTeacher(getRequestEvent().locals);
}

// A paleta é a mesma dos módulos — `$lib/etiquetas.ts`.
const CORES = CORES_DE_ETIQUETA;

const alunoSchema = z.object({ name: z.string().min(1), email: z.string().nullable() });

/** A lista colada ou os campos um a um — a tela manda um dos dois. */
function alunosDoFormulario(modo: string | undefined, colado?: string, um_a_um?: string) {
	if (modo === 'lote') return alunosValidos(parseAlunos(colado ?? ''));
	try {
		const bruto: unknown = JSON.parse(um_a_um ?? '[]');
		const lista = z.array(alunoSchema).safeParse(bruto);
		if (!lista.success) return [];
		return lista.data
			.map((aluno) => ({ name: aluno.name.trim(), email: aluno.email?.trim() || null }))
			.filter((aluno) => aluno.name);
	} catch {
		return [];
	}
}

export const criarTurma = form(
	z.object({
		name: z.string().min(1, 'Dê um nome para a turma'),
		/** A TAG, de um seletor das tags do produto — o mesmo campo de `editarTurma`. */
		idioma: campoIdioma,
		color: z.enum(CORES).default('violeta'),
		modo: z.string().optional(),
		/** Bloco colado, um aluno por linha. */
		colado: z.string().optional(),
		/** `[{ name, email }]` do modo um a um, montado pelo componente. */
		alunos: z.string().optional()
	}),
	async ({ name, idioma, color, modo, colado, alunos: umAUm }) => {
		const teacher = teacherOf();
		const lista = alunosDoFormulario(modo, colado, umAUm);

		const turma = await turmas(teacher).create(name.trim(), idioma, color, lista);
		redirect(303, resolve('/(studio)/turmas/[id]', { id: turma.id }));
	}
);

/**
 * Editar nome, idioma e cor. O idioma chega como TAG, de um seletor
 * (`campoIdioma`): era um campo de texto livre que passava por `tagForLabel`, e
 * qualquer rótulo que não fosse exatamente "Inglês (EUA)" estourava em 500 —
 * o professor clicava em salvar e nada acontecia.
 */
export const editarTurma = form(
	z.object({
		classroomId: z.string(),
		name: z.string().trim().min(1, 'Dê um nome para a turma.').max(80),
		idioma: campoIdioma,
		color: z.enum(CORES).default('violeta')
	}),
	async ({ classroomId, name, idioma, color }) => {
		const teacher = teacherOf();
		const ok = await turmas(teacher).update(classroomId, {
			name,
			languageTag: idioma,
			color
		});
		if (!ok) error(404, 'Turma não encontrada');
		return { ok: true };
	}
);

export const apagarTurma = command(
	z.object({ classroomId: z.string() }),
	async ({ classroomId }) => {
		const teacher = teacherOf();
		const ok = await turmas(teacher).remove(classroomId);
		if (!ok) error(404, 'Turma não encontrada');
		return { ok: true };
	}
);

export const adicionarAluno = form(
	z.object({
		classroomId: z.string(),
		name: z.string().min(1, 'Escreva o nome do aluno'),
		email: z.string().optional()
	}),
	async ({ classroomId, name, email }) => {
		const teacher = teacherOf();
		const criado = await alunos(teacher).add(classroomId, {
			name: name.trim(),
			// Aluno sem e-mail é permitido: ele existe na chamada e nos
			// resultados, só não recebe convite.
			email: email?.trim() || null
		});
		if (!criado) error(404, 'Turma não encontrada');
		return { ok: true };
	}
);

export const salvarAluno = form(
	z.object({
		studentId: z.string(),
		name: z.string().min(1, 'Escreva o nome do aluno'),
		email: z.string().optional()
	}),
	async ({ studentId, name, email }) => {
		const teacher = teacherOf();
		const ok = await alunos(teacher).update(studentId, {
			name: name.trim(),
			email: email?.trim() || null
		});
		if (!ok) error(404, 'Aluno não encontrado');
		return { ok: true };
	}
);

export const removerAluno = command(z.object({ studentId: z.string() }), async ({ studentId }) => {
	const teacher = teacherOf();
	const ok = await alunos(teacher).remove(studentId);
	if (!ok) error(404, 'Aluno não encontrado');
	return { ok: true };
});

/** As turmas com a contagem que importa antes de enviar: quantos têm e-mail. */
export const turmasParaEnvio = query(async () => {
	const teacher = teacherOf();
	const lista = await turmas(teacher).list();
	return lista.map((turma) => ({
		id: turma.id,
		name: turma.name,
		color: turma.color,
		languageLabel: turma.languageTag ? labelForTag(turma.languageTag) : null,
		students: turma.students,
		withEmail: turma.withEmail
	}));
});

/**
 * As atividades que dá para enviar: só as PUBLICADAS. Enviar um rascunho
 * mandaria o aluno para um link que não existe, e a tela precisa desse filtro
 * antes de oferecer a escolha.
 */
export const atividadesPublicadas = query(async () => {
	const teacher = teacherOf();
	const lista = await atividades(teacher).list();

	return lista.flatMap((activity) => {
		// Arquivada tem o link fechado para quem não começou: oferecê-la aqui
		// seria mandar a turma para uma porta fechada.
		if (activity.archivedAt) return [];
		const versao = activity.versions.find((v) => v.publications.length > 0);
		const publicacao = versao?.publications.at(-1);
		if (!versao || !publicacao) return [];
		return [
			{
				id: activity.id,
				title: activity.title,
				itemCount: versao.items.length,
				languageLabel: labelForTag(activity.targetLang),
				idioma: activity.targetLang,
				level: nivelOuNulo(activity.level),
				slug: publicacao.slug,
				attempts: publicacao._count.attempts
			}
		];
	});
});

/**
 * Enviar a atividade JÁ PUBLICADA para uma ou mais turmas. Nunca um passo do
 * wizard: o link aberto, o QR e o código continuam valendo, e enviar não
 * tranca ninguém de fora.
 *
 * O e-mail sai pela fila — a tela confirma o número real e diz que a fila
 * está andando, nunca que chegou.
 */
export const enviarParaTurmas = command(
	z.object({ activityId: z.string(), classroomIds: z.array(z.string()).min(1) }),
	async ({ activityId, classroomIds }) => {
		const teacher = teacherOf();

		const activity = await atividades(teacher).byId(activityId);
		if (!activity) error(404, 'Atividade não encontrada');
		if (activity.archivedAt) {
			return { ok: false, error: 'Esta atividade está arquivada. Desarquive para enviar.' };
		}

		const published = await atividades(teacher).published(activityId);
		const publication = published?.publications.at(-1);
		if (!published || !publication) {
			return { ok: false, error: 'Publique a atividade antes de enviar.' };
		}

		// **Não manda link que não abre.** O áudio de uma atividade vive 10 dias
		// e o link 503 enquanto ele falta — mandar trinta e-mails para uma
		// atividade nesse estado é fazer a turma inteira bater numa porta
		// fechada, e o professor só descobre pelo aluno que reclamou.
		//
		// A checagem é do lado do servidor porque é aqui que o e-mail sai (regra
		// nº 3): a tela também avisa, mas ela não é o que impede.
		const hashes = published.items.flatMap((item) => itemAudioHashes(item, activity.targetLang));
		const audio = await playerRepo.audioReady(teacher.id, hashes);
		if (audio.done < audio.total) {
			// Repõe o que faltar de passagem: quase sempre é prazo vencido, e o
			// professor não deveria precisar procurar o botão de gerar de novo.
			await enfileirarAudioFaltante({
				teacherId: teacher.id,
				targetTag: activity.targetLang,
				items: published.items
			});
			return {
				ok: false,
				error: `O áudio desta atividade não está pronto (${audio.done} de ${audio.total}). Já começamos a gerar — tente de novo em alguns minutos.`
			};
		}

		const settings = publicationSettingsSchema.parse(publication.settings);
		const { url } = getRequestEvent();
		const itemCount = published.items.length;
		const minutes = Math.max(1, Math.round(itemCount * 0.5));
		const languageLabel = labelForTag(activity.targetLang);

		const jobs: ConviteJob[] = [];
		let convites = 0;

		for (const classroomId of classroomIds) {
			const turma = await turmas(teacher).byId(classroomId);
			if (!turma) continue;

			const criado = await envios(teacher).create(publication.id, classroomId);
			if (!criado?.delivery) continue;

			for (const convite of criado.invites) {
				convites++;
				if (!convite.student.email) continue;
				jobs.push({
					inviteId: convite.id,
					to: convite.student.email,
					studentName: convite.student.name,
					teacherName: teacher.name,
					activityTitle: activity.title,
					languageLabel,
					itemCount,
					minutes,
					classroomName: turma.name,
					link: `${url.origin}/e/${convite.token}`,
					code: settings.requireCode ? settings.code : null,
					codeUrl: `${url.origin}/a/${publication.slug}`
				});
			}
		}

		await enqueueConvites(jobs);
		return { ok: true, convites, enfileirados: jobs.length };
	}
);

/**
 * Um convite renovado vira um job de e-mail — o MESMO job do envio original,
 * remontado a partir do que o convite carrega. Quem não tem e-mail não vira
 * job: o token novo continua valendo pelo link pessoal, só não há para onde
 * mandá-lo.
 */
type ConviteRenovado = Awaited<ReturnType<ReturnType<typeof envios>['renewUnopened']>>[number];

function jobsDeReenvio(teacherName: string, convites: ConviteRenovado[]): ConviteJob[] {
	const { url } = getRequestEvent();
	const jobs: ConviteJob[] = [];
	for (const convite of convites) {
		if (!convite.student.email) continue;
		const publication = convite.delivery.publication;
		const activity = publication.activityVersion.activity;
		const settings = publicationSettingsSchema.parse(publication.settings);
		const itemCount = publication.activityVersion._count.items;
		jobs.push({
			inviteId: convite.id,
			to: convite.student.email,
			studentName: convite.student.name,
			teacherName,
			activityTitle: activity.title,
			languageLabel: labelForTag(activity.targetLang),
			itemCount,
			minutes: Math.max(1, Math.round(itemCount * 0.5)),
			classroomName: convite.delivery.classroom.name,
			link: `${url.origin}/e/${convite.token}`,
			code: settings.requireCode ? settings.code : null,
			codeUrl: `${url.origin}/a/${publication.slug}`
		});
	}
	return jobs;
}

/**
 * Reenvio para quem não abriu — sempre com contagem, nunca "para todos".
 *
 * Renovar o token E enfileirar o e-mail, as duas coisas: houve uma versão que
 * só renovava, e o efeito era o pior possível — o link antigo parava de valer
 * e nenhum novo chegava.
 */
export const reenviarNaoAbertos = command(
	z.object({ deliveryId: z.string() }),
	async ({ deliveryId }) => {
		const teacher = teacherOf();
		if (await envios(teacher).arquivado({ deliveryId })) {
			return { ok: false, reenviados: 0, error: 'Esta atividade está arquivada.' };
		}
		const renovados = await envios(teacher).renewUnopened(deliveryId);
		const jobs = jobsDeReenvio(teacher.name, renovados);
		await enqueueConvites(jobs);
		return { ok: true, reenviados: jobs.length };
	}
);

/**
 * Reenvio para UM aluno: o e-mail que voltou e foi corrigido, ou o que se
 * perdeu na caixa de entrada. Renova só aquele token — os outros convites da
 * turma continuam valendo.
 */
export const reenviarConvite = command(z.object({ inviteId: z.string() }), async ({ inviteId }) => {
	const teacher = teacherOf();
	if (await envios(teacher).arquivado({ inviteId })) {
		return { ok: false, error: 'Esta atividade está arquivada.' };
	}
	const renovado = await envios(teacher).renewOne(inviteId);
	if (!renovado) error(404, 'Convite não encontrado');
	if (!renovado.student.email) {
		return { ok: false, error: 'Este aluno não tem e-mail cadastrado.' };
	}
	await enqueueConvites(jobsDeReenvio(teacher.name, [renovado]));
	return { ok: true };
});
