import type { Item } from '$lib/kernel/item';
import { runGenerators, type StoredContentUnit } from '$lib/kernel/generators';
import { separarPelaQuantidade } from '$lib/kernel/generators/select';
import { getProfile } from '$lib/kernel/language/profiles';
import type { LanguageProfile } from '$lib/kernel/language/profile';
import type { Transcritor } from '$lib/kernel/language/escrita';
import { typeAuthoringSchema } from '$lib/kernel/interactions/type';
import { lerTiposGerais, lerTiposPorMaterial } from '$lib/atividades/tipos-por-material';
import type { Tradutor } from '$lib/server/traducao';
import { paresDasFrases } from './pares-de-palavras';
import { comVariantesDaTraducao } from './variantes-aceitas';
import type { PassoComEstado, PassoDaGeracao, ProgressoDaGeracao } from '$lib/atividades/geracao';

/**
 * A geração das questões, em segundo plano e passo a passo — a tela "Gerando".
 *
 * Ela era um `command` síncrono: o botão girava até tudo acabar, sem dizer o que
 * estava acontecendo, e fechar a aba no meio não dizia se tinha dado certo. Com o
 * tradutor (os pares do associar, as outras traduções certas) e o transcritor
 * do japonês e do chinês, são vários segundos. Agora o `gerarItens` começa o
 * trabalho e devolve na hora; a tela pergunta o andamento (`progressoDaGeracao`)
 * e marca cada passo quando ele termina.
 *
 * **Gera para TODOS os materiais** (pedido do dono do repositório): o que passa da
 * quantidade pedida vai para o rascunho como "fora" (`discarded`), e o professor
 * troca na revisão o que entra e o que sai. Cada material gera só os tipos dele
 * (`Activity.tiposPorMaterial`).
 *
 * O andamento vive na MEMÓRIA do processo web, não no banco: é de minutos, só o
 * professor que pediu lê, e o resultado (o rascunho) já é gravado no banco. Se o
 * processo reiniciar no meio, a tela vê "parou" e oferece gerar de novo.
 */

export interface FontesDaGeracao<Gravado = unknown> {
	activity: {
		id: string;
		targetLang: string;
		sourceLang: string;
		itemTarget: number;
		skills: string[];
		tiposPorMaterial: unknown;
	};
	materiais: () => Promise<StoredContentUnit[]>;
	capacidades: { tts: boolean; asr: boolean };
	tradutor: Tradutor | null;
	transcritorPara: (profile: LanguageProfile) => Promise<Transcritor | undefined>;
	/** Grava o rascunho (dentro, depois fora). Devolve os itens que ENTRARAM, gravados. */
	gravar: (dentro: Item[], fora: Item[]) => Promise<Gravado[]>;
	/** Pede o áudio do que entrou — o que ficou de fora pede quando entrar. */
	pedirAudio: (gravados: Gravado[]) => Promise<unknown>;
}

function contarAceitas(itens: Item[]): number {
	return itens.reduce((total, item) => {
		if (item.interaction.type !== 'type') return total;
		const lido = typeAuthoringSchema.safeParse(item.interaction.payload);
		return total + (lido.success ? lido.data.accepted.length : 0);
	}, 0);
}

/** Os passos que valem para esta atividade, na ordem. */
function passosDe(materiais: StoredContentUnit[], tradutor: Tradutor | null): PassoDaGeracao[] {
	const temFrases = materiais.some((m) => m.kind === 'SentencePair');
	return [
		'lendo',
		...(tradutor && temFrases ? (['pares'] as const) : []),
		'montando',
		'separando',
		...(tradutor?.alternativas && temFrases ? (['variantes'] as const) : []),
		'salvando'
	];
}

/**
 * O trabalho em si, com o que ele usa por parâmetro — testável sem banco, sem
 * tradutor e sem SvelteKit. `aoMudar` recebe o andamento a cada passo.
 */
export async function executarGeracao<Gravado>(
	fontes: FontesDaGeracao<Gravado>,
	aoMudar: (progresso: ProgressoDaGeracao) => void
): Promise<ProgressoDaGeracao> {
	let passos: PassoComEstado[] = [
		{ id: 'lendo', estado: 'andando' },
		...(['montando', 'separando', 'salvando'] as const).map((id) => ({
			id,
			estado: 'esperando' as const
		}))
	];
	const emitir = (extra: Partial<ProgressoDaGeracao> = {}) => {
		const progresso: ProgressoDaGeracao = {
			estado: 'andando',
			passos: passos.map((p) => ({ ...p })),
			...extra
		};
		aoMudar(progresso);
		return progresso;
	};
	const concluir = (id: PassoDaGeracao, numero?: number, outro?: number) => {
		const indice = passos.findIndex((p) => p.id === id);
		passos = passos.map((p, i) =>
			i === indice
				? { ...p, estado: 'feito', numero, outro }
				: i === indice + 1
					? { ...p, estado: 'andando' }
					: p
		);
		emitir();
	};
	emitir();

	const { activity } = fontes;
	const alvo = getProfile(activity.targetLang);
	const origem = getProfile(activity.sourceLang);
	const perfis = { alvo, origem };

	// 1. Os materiais (e o dicionário do transcritor, que o japonês e o chinês
	// carregam na primeira vez).
	const materiais = await fontes.materiais();
	if (materiais.length === 0) throw new SemMaterial();
	const transcrever = await fontes.transcritorPara(alvo);
	passos = passosDe(materiais, fontes.tradutor).map((id) =>
		id === 'lendo' ? passos[0] : { id, estado: 'esperando' as const }
	);
	concluir('lendo', materiais.length);

	// 2. As palavras das frases, traduzidas, para o "ligue os pares" do fecho.
	const palavrasTraduzidas = passos.some((p) => p.id === 'pares')
		? await paresDasFrases(materiais, perfis, fontes.tradutor)
		: [];
	if (passos.some((p) => p.id === 'pares')) concluir('pares', palavrasTraduzidas.length);

	// 3. Os geradores.
	const { groups, closing } = runGenerators(materiais, {
		targetProfile: alvo,
		sourceProfile: origem,
		seed: activity.id,
		capabilities: fontes.capacidades,
		transcrever,
		palavrasTraduzidas
	});
	const montadas = groups.reduce((total, g) => total + g.items.length, 0) + (closing ? 1 : 0);
	concluir('montando', montadas);

	// 4. O que entra e o que fica de fora.
	const separadas = separarPelaQuantidade(
		groups,
		{
			target: activity.itemTarget,
			skills: lerTiposGerais(activity.skills),
			skillsPorMaterial: lerTiposPorMaterial(activity.tiposPorMaterial)
		},
		closing
	);
	if (separadas.dentro.length === 0) throw new NadaParaGerar();
	concluir('separando', separadas.dentro.length, separadas.fora.length);

	// 5. As outras traduções certas, nas que entraram E nas de fora — a de fora
	// pode entrar na revisão, e não pode chegar lá sem elas.
	let dentro = separadas.dentro;
	let fora = separadas.fora;
	if (passos.some((p) => p.id === 'variantes')) {
		const todas = [...dentro, ...fora];
		const antes = contarAceitas(todas);
		const comVariantes = await comVariantesDaTraducao(todas, perfis, fontes.tradutor);
		dentro = comVariantes.slice(0, dentro.length);
		fora = comVariantes.slice(dentro.length);
		concluir('variantes', contarAceitas(comVariantes) - antes);
	}

	// 6. O rascunho e o áudio do que entrou.
	const gravados = await fontes.gravar(dentro, fora);
	await fontes.pedirAudio(gravados);
	concluir('salvando');

	return emitir({ estado: 'pronta', resultado: { dentro: dentro.length, fora: fora.length } });
}

export class SemMaterial extends Error {}
export class NadaParaGerar extends Error {}

function mensagemDoErro(erro: unknown): string {
	if (erro instanceof SemMaterial) return 'Adicione ao menos um material antes de gerar.';
	if (erro instanceof NadaParaGerar) {
		return 'Os tipos ligados não geram questão com estes materiais. Ligue outro tipo e gere de novo.';
	}
	return 'Não deu para gerar agora. Tente de novo em instantes.';
}

// ── O registro do andamento, na memória do processo ──────────────────────────

interface Registro {
	teacherId: string;
	progresso: ProgressoDaGeracao;
	atualizadoEm: number;
}

const registro = new Map<string, Registro>();

/** Andando sem notícia há mais que isto: o processo caiu ou travou. */
const PARADA_APOS_MS = 4 * 60_000;
/** Pronta ou falhada, a lembrança fica este tempo — o professor pode ter saído. */
const LEMBRAR_POR_MS = 20 * 60_000;
/** Gerações ao mesmo tempo por professor: cada uma é CPU e pedido ao tradutor. */
const MAX_POR_PROFESSOR = 3;

function limpar(agora: number) {
	for (const [chave, r] of registro) {
		if (r.progresso.estado !== 'andando' && agora - r.atualizadoEm > LEMBRAR_POR_MS) {
			registro.delete(chave);
		}
	}
}

/**
 * O andamento da geração desta atividade, só para o professor dela. Nulo quando
 * não há geração lembrada.
 */
export function progressoDaGeracao(
	teacherId: string,
	activityId: string,
	agora = Date.now()
): ProgressoDaGeracao | null {
	limpar(agora);
	const r = registro.get(activityId);
	if (!r || r.teacherId !== teacherId) return null;
	if (r.progresso.estado === 'andando' && agora - r.atualizadoEm > PARADA_APOS_MS) {
		return {
			...r.progresso,
			estado: 'falhou',
			erro: 'A geração parou no meio. Gere de novo.'
		};
	}
	return r.progresso;
}

/**
 * Começa a geração em segundo plano e devolve na hora. Se já existe uma andando
 * para esta atividade, não começa outra.
 */
export function iniciarGeracao<Gravado>(
	teacherId: string,
	fontes: FontesDaGeracao<Gravado>,
	agora = Date.now()
): { ok: true } | { ok: false; error: string } {
	limpar(agora);
	const activityId = fontes.activity.id;
	const atual = progressoDaGeracao(teacherId, activityId, agora);
	if (atual?.estado === 'andando') return { ok: true };

	const andando = [...registro.values()].filter(
		(r) =>
			r.teacherId === teacherId &&
			r.progresso.estado === 'andando' &&
			agora - r.atualizadoEm <= PARADA_APOS_MS
	).length;
	if (andando >= MAX_POR_PROFESSOR) {
		return { ok: false, error: 'Espere uma das gerações em andamento terminar.' };
	}

	const guardar = (progresso: ProgressoDaGeracao) => {
		registro.set(activityId, { teacherId, progresso, atualizadoEm: Date.now() });
	};
	guardar({ estado: 'andando', passos: [{ id: 'lendo', estado: 'andando' }] });

	void executarGeracao(fontes, guardar).catch((erro: unknown) => {
		if (!(erro instanceof SemMaterial) && !(erro instanceof NadaParaGerar)) {
			console.error('[geracao] falhou', erro);
		}
		const ultimo = registro.get(activityId)?.progresso;
		guardar({
			estado: 'falhou',
			passos: ultimo?.passos ?? [],
			erro: mensagemDoErro(erro)
		});
	});
	return { ok: true };
}

/** Só para teste: esquece tudo. */
export function esquecerGeracoes() {
	registro.clear();
}
