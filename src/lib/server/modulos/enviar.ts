import { atividades } from '$lib/server/db/repos/activities';
import { envios } from '$lib/server/db/repos/deliveries';
import { playerRepo } from '$lib/server/db/repos/player';
import { itemAudioHashes } from '$lib/server/player/runtime';
import { enfileirarAudioFaltante } from '$lib/server/tts/enfileirar';
import { publicationSettingsSchema } from '$lib/server/player/settings';
import { labelForTag } from '$lib/kernel/language/profiles';

/**
 * As duas metades de um envio de módulo (docs/adr-004-modulos-e-nivel.md e
 * docs/telas-modulos-professor.md 2.4): **preparar** diz o que está pronto para
 * sair e o que não está, com o motivo; **despachar** cria os convites que
 * abrem as fases no mapa do aluno. Quem decide QUANDO é a programação
 * (`programacao.ts`); estas duas não sabem de data nenhuma.
 *
 * Moram aqui, e não numa remote function, para o worker (envio programado) e a
 * tela ("enviar agora") passarem pelo MESMO caminho.
 */

type Professor = { id: string; name: string };

/** Por que uma atividade não saiu. A tela escreve a frase; aqui fica a chave. */
export type MotivoDeNaoSair = 'arquivada' | 'rascunho' | 'audio';

export type AtividadeDoEnvio = {
	id: string;
	title: string;
	targetLang: string;
	archivedAt: Date | null;
};

export type AtividadePronta = {
	activityId: string;
	title: string;
	languageLabel: string;
	itemCount: number;
	minutes: number;
	publicationId: string;
	slug: string;
	code: string | null;
};

/**
 * Separa o que pode sair agora do que não pode:
 *
 * - **arquivada**: o link está fechado para quem não começou;
 * - **rascunho**: o link não existe;
 * - **audio**: o link responderia 503 (server.md "TTS") — e o que falta já é
 *   enfileirado de passagem, para o conserto não depender de ninguém achar um
 *   botão.
 */
export async function prepararAtividades(
	teacher: Professor,
	itens: AtividadeDoEnvio[]
): Promise<{
	prontas: AtividadePronta[];
	naoProntas: { activityId: string; title: string; motivo: MotivoDeNaoSair }[];
}> {
	const prontas: AtividadePronta[] = [];
	const naoProntas: { activityId: string; title: string; motivo: MotivoDeNaoSair }[] = [];

	for (const item of itens) {
		if (item.archivedAt) {
			naoProntas.push({ activityId: item.id, title: item.title, motivo: 'arquivada' });
			continue;
		}
		const published = await atividades(teacher).published(item.id);
		const publication = published?.publications.at(-1);
		if (!published || !publication) {
			naoProntas.push({ activityId: item.id, title: item.title, motivo: 'rascunho' });
			continue;
		}
		const hashes = published.items.flatMap((i) => itemAudioHashes(i, item.targetLang));
		const audio = await playerRepo.audioReady(teacher.id, hashes);
		if (audio.done < audio.total) {
			await enfileirarAudioFaltante({
				teacherId: teacher.id,
				targetTag: item.targetLang,
				items: published.items
			});
			naoProntas.push({ activityId: item.id, title: item.title, motivo: 'audio' });
			continue;
		}
		const settings = publicationSettingsSchema.parse(publication.settings);
		const itemCount = published.items.length;
		prontas.push({
			activityId: item.id,
			title: item.title,
			languageLabel: labelForTag(item.targetLang),
			itemCount,
			minutes: Math.max(1, Math.round(itemCount * 0.5)),
			publicationId: publication.id,
			slug: publication.slug,
			code: settings.requireCode ? settings.code : null
		});
	}
	return { prontas, naoProntas };
}

/**
 * LIBERA as atividades para a turma: um `Delivery` por atividade, todos com o
 * mesmo `envioId`, e um convite para CADA aluno da turma — é o convite que abre a
 * fase no mapa de quem tem conta, e o link pessoal existe do mesmo jeito.
 *
 * **Nenhum e-mail.** Módulo libera, não manda (`modulos/programacao.ts`). Houve
 * um "por e-mail" que enfileirava um e-mail por aluno com os links; ele saiu a
 * pedido do dono do repositório. Mandar UMA atividade por e-mail para a turma
 * continua existindo, fora do módulo ("Enviar atividade").
 */
export async function despacharEnvio(
	teacher: Professor,
	modulo: { id: string; name: string },
	turma: { id: string; name: string },
	prontas: AtividadePronta[]
): Promise<{ envioId: string; convites: number }> {
	const envioId = crypto.randomUUID();
	let convites = 0;
	for (const atividade of prontas) {
		const criado = await envios(teacher).create(atividade.publicationId, turma.id, {
			envioId,
			moduleId: modulo.id,
			porEmail: false
		});
		if (criado?.delivery) convites += criado.invites.length;
	}
	return { envioId, convites };
}
