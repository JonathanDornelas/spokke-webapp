import { vozDoTexto } from '$lib/kernel/language/voice';
import { getProfile, labelForTag } from '$lib/kernel/language/profiles';
import { gradingSchema, interactionSchema, localeSchema, promptSchema } from '$lib/kernel/item';
import { getInteraction } from '$lib/kernel/interactions/registry';
import type { GradingMode, InteractionKind, Skill } from '$lib/kernel/interactions/types';
import type { LanguageProfile } from '$lib/kernel/language/profile';
import { tecladoDe, type Teclado } from '$lib/kernel/language/teclado';
import { skillLabels } from '$lib/kernel/interactions/skill-schema';
import { ttsHash } from '$lib/server/tts';

/**
 * A ÚNICA porta por onde um item chega no browser do aluno — regra
 * inviolável nº 1. Tudo aqui é montado a partir de `toRuntime()`; o payload
 * de autoria (com gabarito) nunca é copiado nem "filtrado". Se um campo não
 * é escrito explicitamente neste arquivo, ele não existe para o aluno.
 */

/** A linha do Item como sai do Prisma — colunas Json ainda por validar. */
export interface StoredItemRow {
	id: string;
	prompt: unknown;
	interaction: unknown;
	grading: unknown;
	locale: unknown;
}

/**
 * O enunciado que o aluno lê. O kernel só emite a CHAVE porque é agnóstico
 * de idioma; a copy fica aqui, na camada de apresentação. Hoje só existe em
 * português — quando o produto atender aluno de outra língua materna, isto
 * vira um mapa por `locale.source` (pendência, ver paginas.md).
 */
const INSTRUCTIONS: Record<string, string> = {
	'assemble-from-source': 'Monte a frase.',
	'translate-to-source': 'Traduza a frase.',
	'listen-and-assemble': 'Ouça e monte a frase.',
	'listen-and-type': 'Ouça e escreva o que você ouviu.',
	'listen-and-choose': 'Ouça e escolha o que você ouviu.',
	'fill-the-blank': 'Complete a frase.',
	'say-in-target': 'Diga esta frase em voz alta.',
	'choose-translation': 'Escolha a tradução.',
	'answer-about-passage': 'Responda sobre o texto.',
	'order-the-lines': 'Coloque as falas na ordem certa.',
	'match-pairs': 'Ligue cada um ao seu par.'
};

/** O enunciado por extenso. O professor nunca vê a chave crua. */
export function instructionText(key: string | undefined | null): string {
	return key ? (INSTRUCTIONS[key] ?? '') : '';
}

/**
 * O enunciado final de um item: o que o professor escreveu ganha da copy
 * padrão da chave. Um único ponto de decisão — a prévia do editor e o
 * Player precisam mostrar exatamente a mesma frase.
 */
export function promptInstruction(prompt: {
	instruction?: string;
	instructionKey?: string;
}): string {
	return prompt.instruction?.trim() || instructionText(prompt.instructionKey);
}

export interface RuntimeItem {
	/** Direção do idioma ALVO — é a do conteúdo que o aluno produz. */
	dir: 'ltr' | 'rtl';
	/**
	 * Direção da língua do aluno. Um brasileiro estudando árabe vê a frase de
	 * apoio em LTR e responde em RTL na mesma tela — as duas precisam existir
	 * (design-system.md "Direção do texto").
	 */
	sourceDir: 'ltr' | 'rtl';
	/**
	 * O teclado virtual que o campo de resposta mostra, quando mostra algum.
	 *
	 * Só existe em questão de DIGITAR cuja resposta é no idioma ALVO: é ali que o
	 * aparelho do aluno não tem as teclas. Na língua do aluno (`translate-type`)
	 * o aparelho é dele e já escreve o que ele precisa — oferecer um teclado de
	 * português a um brasileiro seria só estorvo.
	 *
	 * Não é gabarito: é o alfabeto do idioma, o mesmo para toda questão dele.
	 */
	teclado?: Teclado;
	interaction: InteractionKind;
	/** O enunciado ("Ouça e escreva o que você ouviu"). */
	prompt: string;
	/**
	 * Uma linha explicando a REGRA da questão ("a velocidade mais lenta não
	 * conta como erro"). Não é enunciado nem dica de resposta: é o que evita o
	 * aluno achar que perdeu a questão por um acento.
	 */
	hint?: string;
	/** O texto com que o aluno trabalha — só quando ele PODE ver (nunca em áudio). */
	passage?: string;
	skill: Skill;
	skillLabel: string;
	/** Nomes dos idiomas do par — cabeçalho das colunas de `match`. */
	sourceLabel: string;
	targetLabel: string;
	/** O modo de correção, quando ele muda o que o aluno deve esperar. */
	gradingLabel?: string;
	audio?: string;
	/** O mesmo áudio na velocidade reduzida — arquivo próprio, gerado no TTS. */
	audioSlow?: string;
	gradedLater?: boolean;
	skippable?: boolean;
	[extra: string]: unknown;
}

/**
 * O modo de correção só vira rótulo quando muda a EXPECTATIVA do aluno.
 * "exact" e "sequence" não mudam: a resposta está certa ou não está, e
 * anunciar isso só ocuparia espaço.
 */
const GRADING_LABEL: Partial<Record<GradingMode, string>> = {
	tolerant: 'tolerante',
	asr: 'reconhecimento de voz',
	rubric: 'corrigida pelo professor'
};

/**
 * A regra da questão em uma linha. Sai do item e do LanguageProfile — nunca
 * de texto fixo por idioma: quem diz que acento não conta é o profile
 * (`diacritics`/`caseSensitive`), não esta função.
 */
function itemHint(
	promptKind: string,
	grading: { mode: GradingMode },
	interaction: InteractionKind,
	profile: LanguageProfile
): string | undefined {
	if (promptKind === 'audio') {
		return 'Pode repetir quantas vezes quiser. A velocidade mais lenta não conta como erro.';
	}
	if (interaction === 'match') {
		return 'Toque numa palavra e depois no sentido correspondente.';
	}
	if (grading.mode === 'rubric') {
		return 'Sua resposta vai para o professor corrigir. Não há veredito automático.';
	}
	if (grading.mode === 'asr') {
		return 'Sotaque não reprova. Se o microfone falhar, pule sem perder a atividade.';
	}
	if (grading.mode === 'tolerant') {
		const ignorados = [
			profile.diacritics === 'tolerant' ? 'acento' : '',
			profile.caseSensitive ? '' : 'caixa',
			profile.normalizers.includes('strip-punct') ? 'pontuação' : ''
		].filter(Boolean);
		return ignorados.length > 0
			? `${ignorados.join(' e ')} ${ignorados.length > 1 ? 'são ignorados' : 'é ignorado'} nesta questão.`
			: 'Uma letra a menos vira parcial, não zero.';
	}
	return undefined;
}

/**
 * Habilidades derivadas do item — nunca declaradas pelo professor. Pede só
 * o que usa, para servir também a consultas que trazem duas colunas.
 */
export function itemSkills(row: Pick<StoredItemRow, 'prompt' | 'interaction'>): Skill[] {
	const prompt = promptSchema.parse(row.prompt);
	const interaction = interactionSchema.parse(row.interaction);
	return getInteraction(interaction.type).skills(prompt);
}

/**
 * Os hashes de áudio de um item, quando ele tem prompt de áudio.
 *
 * É função pura de (texto, voz, velocidade) — e a voz também sai do texto —,
 * então nada precisa ser guardado: a geração enfileira o TTS que falta e o
 * Player recalcula a chave (server.md "TTS"). Nem o material nem a atividade
 * entram na conta, o que é o ponto: material é facilitador de montagem, e
 * apagar um não pode mexer numa atividade no ar.
 *
 * Devolve vazio em dois casos, e nenhum é erro: o item não é de áudio, ou o
 * idioma alvo não tem voz no provedor (árabe hoje).
 */
export function itemAudioHashes(row: StoredItemRow, targetTag: string): string[] {
	const prompt = promptSchema.parse(row.prompt);
	if (prompt.kind !== 'audio' || !prompt.text) return [];

	const profile = getProfile(targetTag);
	const voz = vozDoTexto(profile, prompt.text);
	if (!voz) return [];

	return profile.tts.speeds.map((speed) => ttsHash(prompt.text!, voz, speed));
}

export function buildRuntimeItem(
	row: StoredItemRow,
	seed: string,
	audioUrlByHash: Map<string, string>
): RuntimeItem {
	const prompt = promptSchema.parse(row.prompt);
	const interaction = interactionSchema.parse(row.interaction);
	const grading = gradingSchema.parse(row.grading);
	const locale = localeSchema.parse(row.locale);

	const targetProfile = getProfile(locale.target);
	const registered = getInteraction(interaction.type);
	const skills = registered.skills(prompt);
	// O rótulo do cabeçalho é o que a questão PEDE, não o enunciado. Todo prompt
	// de texto rende `reading`, e ela vinha primeiro na lista: "Diga esta frase
	// em voz alta" aparecia como Leitura, "Complete a frase" também. A leitura
	// só nomeia a questão quando é a única coisa nela (kernel.md, `selectItems`).
	const skill = skills.find((s) => s !== 'reading') ?? skills[0] ?? 'reading';

	// A seed do item mistura a seed da tentativa com o id do item: cada
	// questão embaralha diferente, e F5 não muda nada (regra nº 8).
	const runtime = registered.toRuntime(interaction.payload, `${seed}:${row.id}`);

	// Duas velocidades por item (server.md "TTS"): a normal e a reduzida. São
	// arquivos diferentes, não `playbackRate` — TTS lento soa melhor gerado
	// lento do que desacelerado no browser.
	// A voz sai do TEXTO, não do idioma sozinho: frases diferentes falam com
	// vozes diferentes dentro da mesma atividade (language/voice.ts).
	const [hashNormal, hashLento] = itemAudioHashes(row, locale.target);

	// O título da questão é o ENUNCIADO. `prompt.text` num item de áudio é o
	// texto que o TTS sintetizou — ou seja, exatamente a frase que o aluno
	// tem que descobrir de ouvido —, então ele só aparece quando o prompt é
	// de texto.
	const instruction = promptInstruction(prompt);
	const visibleText =
		prompt.kind === 'text' || prompt.kind === 'composite' ? prompt.text : undefined;

	const digitaNoAlvo =
		(interaction.type === 'type' || interaction.type === 'cloze') &&
		(grading.answerLang ?? 'target') === 'target';

	return {
		...runtime,
		dir: targetProfile.direction,
		sourceDir: getProfile(locale.source).direction,
		teclado: digitaNoAlvo ? (tecladoDe(targetProfile.input) ?? undefined) : undefined,
		interaction: interaction.type,
		prompt: instruction,
		passage: visibleText,
		skill,
		skillLabel: skillLabels[skill],
		sourceLabel: labelForTag(locale.source),
		targetLabel: labelForTag(locale.target),
		hint: itemHint(prompt.kind, grading, interaction.type, targetProfile),
		gradingLabel: GRADING_LABEL[grading.mode],
		audio: hashNormal ? audioUrlByHash.get(hashNormal) : undefined,
		audioSlow: hashLento ? audioUrlByHash.get(hashLento) : undefined,
		gradedLater: grading.mode === 'rubric' || undefined,
		skippable: interaction.type === 'speak' || undefined
	};
}
