import { vozDaPronuncia, vozDoFalante, vozDoTexto } from '$lib/kernel/language/voice';
import { getProfile, labelForTag } from '$lib/kernel/language/profiles';
import { gradingSchema, interactionSchema, localeSchema, promptSchema } from '$lib/kernel/item';
import { getInteraction } from '$lib/kernel/interactions/registry';
import { habilidadePrincipal } from '$lib/kernel/interactions/skills';
import { speakAuthoringSchema } from '$lib/kernel/interactions/speak';
import {
	passosDaBoca,
	pronunciaDe,
	sonsDosFonemas,
	type RigorDaPronuncia
} from '$lib/kernel/language/pronuncia';
import {
	temposDosFonemas,
	type LinhaDaPalavra,
	type LinhaDoTempo
} from '$lib/kernel/language/sintese';
import type {
	ContextoDoPrompt,
	GradingMode,
	InteractionKind,
	Skill
} from '$lib/kernel/interactions/types';
import type { ContextoNoRuntime, PronunciaNoRuntime } from '$lib/components/interactions/types';
import type { LanguageProfile } from '$lib/kernel/language/profile';
import { tecladoDe, type Teclado } from '$lib/kernel/language/teclado';
import { skillLabels } from '$lib/kernel/interactions/skill-schema';
import { ttsHash } from '$lib/server/tts';
import { instructionText } from '$lib/atividades/enunciados';
import { sePula } from './sequencia';

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

// A copy dos enunciados mora em `$lib/atividades/enunciados.ts`: o editor de
// questão também a usa, na tela.
export { instructionText };

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
	/** O trecho ou o diálogo antes da pergunta (`composite` com contexto). */
	contexto?: ContextoNoRuntime;
	/** A pergunta sobre o trecho ou o diálogo, quando há contexto. */
	pergunta?: string;
	/** Só na Pronúncia: a boca passo a passo e o áudio da palavra. */
	pronuncia?: PronunciaNoRuntime;
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

/** O modo de correção da Pronúncia, no cabeçalho da questão: o rigor que vale ali. */
const ROTULO_DO_RIGOR: Record<RigorDaPronuncia, string> = {
	leve: 'pronúncia leve',
	normal: 'pronúncia',
	rigoroso: 'pronúncia rigorosa'
};

/** A regra da Pronúncia em uma linha, no rigor da questão (`TOLERANCIA`). */
const DICA_DA_PRONUNCIA: Record<RigorDaPronuncia, string> = {
	leve: 'Aqui o som conta, com correção leve: som parecido passa. O retorno diz qual sílaba saiu diferente.',
	normal:
		'Aqui o som conta: cada som precisa sair certo. O retorno diz qual sílaba saiu diferente.',
	rigoroso:
		'Aqui o som conta, com correção rigorosa: até a vogal fraca precisa sair certa. O retorno diz qual sílaba saiu diferente.'
};

function rigorDoRuntime(runtime: object): RigorDaPronuncia {
	const rigor = 'rigor' in runtime ? runtime.rigor : undefined;
	return rigor === 'leve' || rigor === 'rigoroso' ? rigor : 'normal';
}

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
 * Um áudio que a questão usa: o texto, a voz e os arquivos (um por velocidade,
 * na ordem de `profile.tts.speeds`: o normal e o reduzido).
 */
export interface AudioDoItem {
	/** `prompt`: a frase de uma escuta; `fala`: uma fala do diálogo; `palavra`: a da Pronúncia. */
	papel: 'prompt' | 'fala' | 'palavra';
	/** Na fala do diálogo, o índice dela. */
	fala?: number;
	texto: string;
	voz: string;
	arquivos: { hash: string; velocidade: number }[];
	/**
	 * Na palavra da Pronúncia: os sons de cada fonema, em IPA (`sonsDosFonemas`).
	 * É com eles que a linha do tempo do áudio vira o trecho de cada fonema
	 * (`temposDosFonemas`), e o que marca o áudio que precisa dela.
	 */
	sonsDosFonemas?: string[][];
}

/**
 * Os áudios de uma questão. Três tipos, e todos são função pura de (texto, voz,
 * velocidade) — e a voz também sai do conteúdo —, então nada precisa ser
 * guardado: a geração enfileira o TTS que falta e o Player recalcula a chave
 * (server.md "TTS"). Nem o material nem a atividade entram na conta, o que é o
 * ponto: material é facilitador de montagem, e apagar um não pode mexer numa
 * atividade no ar.
 *
 * - **A frase da escuta** (`prompt` de áudio), na voz do texto.
 * - **As falas do diálogo** que o aluno OUVE (as anteriores à parada; todas na
 *   pergunta de compreensão), cada uma na voz da pessoa que fala
 *   (`vozDoFalante`). O diálogo só em texto não tem áudio.
 * - **A palavra da Pronúncia**, na voz de referência do idioma quando ele tem uma
 *   (`vozDaPronuncia`: a melhor voz, porque é o modelo que o aluno imita), senão
 *   na do texto. É o que ele ouve antes de falar, e o que move a boca.
 *
 * Vazio quando a questão não tem áudio, ou o idioma alvo não tem voz no
 * provedor (árabe hoje) — nenhum dos dois é erro.
 */
export function audiosDoItem(
	row: Pick<StoredItemRow, 'prompt' | 'interaction'>,
	targetTag: string
): AudioDoItem[] {
	const prompt = promptSchema.parse(row.prompt);
	const profile = getProfile(targetTag);
	const arquivos = (texto: string, voz: string) =>
		profile.tts.speeds.map((velocidade) => ({ hash: ttsHash(texto, voz, velocidade), velocidade }));
	const audios: AudioDoItem[] = [];

	if (prompt.kind === 'audio' && prompt.text) {
		const voz = vozDoTexto(profile, prompt.text);
		if (voz)
			audios.push({
				papel: 'prompt',
				texto: prompt.text,
				voz,
				arquivos: arquivos(prompt.text, voz)
			});
	}

	const contexto = prompt.contexto;
	if (prompt.kind === 'composite' && contexto?.tipo === 'dialogo' && contexto.mostra !== 'texto') {
		const falantes = contexto.falas.map((f) => f.falante);
		contexto.falas.slice(0, contexto.ate ?? contexto.falas.length).forEach((fala, i) => {
			const voz = vozDoFalante(profile, falantes, fala.falante);
			if (voz)
				audios.push({
					papel: 'fala',
					fala: i,
					texto: fala.texto,
					voz,
					arquivos: arquivos(fala.texto, voz)
				});
		});
	}

	const interaction = interactionSchema.parse(row.interaction);
	if (interaction.type === 'speak') {
		const fala = speakAuthoringSchema.safeParse(interaction.payload);
		if (fala.success && fala.data.pronuncia) {
			const voz = vozDaPronuncia(profile, fala.data.target);
			if (voz) {
				audios.push({
					papel: 'palavra',
					texto: fala.data.target,
					voz,
					arquivos: arquivos(fala.data.target, voz),
					...(profile.pronuncia
						? { sonsDosFonemas: sonsDosFonemas(fala.data.pronuncia, profile.pronuncia) }
						: {})
				});
			}
		}
	}
	return audios;
}

/** Todos os hashes de áudio de uma questão — o que a prontidão, a limpeza e o Player contam. */
export function itemAudioHashes(row: StoredItemRow, targetTag: string): string[] {
	return audiosDoItem(row, targetTag).flatMap((a) => a.arquivos.map((f) => f.hash));
}

/** O lado de cada pessoa na conversa: a primeira que fala à esquerda, a segunda à direita. */
function ladoDe(falantes: string[], falante: string): 'inicio' | 'fim' {
	const elenco = [...new Set(falantes)];
	return elenco.indexOf(falante) % 2 === 0 ? 'inicio' : 'fim';
}

/** O contexto como chega ao browser (o tipo mora com os do Player: `ContextoNoRuntime`). */
function contextoNoRuntime(
	contexto: ContextoDoPrompt,
	audios: AudioDoItem[],
	audioUrlByHash: Map<string, string>
): ContextoNoRuntime {
	if (contexto.tipo === 'texto') return { tipo: 'texto', texto: contexto.texto };
	const falantes = contexto.falas.map((f) => f.falante);
	const ate = contexto.ate ?? contexto.falas.length;
	return {
		tipo: 'dialogo',
		mostra: contexto.mostra,
		falas: contexto.falas.slice(0, ate).map((fala, i) => {
			const audio = audios.find((a) => a.papel === 'fala' && a.fala === i);
			return {
				falante: fala.falante,
				lado: ladoDe(falantes, fala.falante),
				texto: contexto.mostra === 'audio' ? undefined : fala.texto,
				audio: audio?.arquivos[0] ? audioUrlByHash.get(audio.arquivos[0].hash) : undefined,
				audioSlow: audio?.arquivos[1] ? audioUrlByHash.get(audio.arquivos[1].hash) : undefined
			};
		}),
		vez:
			contexto.ate !== undefined && contexto.falas[ate]
				? {
						falante: contexto.falas[ate]!.falante,
						lado: ladoDe(falantes, contexto.falas[ate]!.falante)
					}
				: undefined
	};
}

/**
 * Onde cada fonema da palavra está nos dois arquivos dela (normal e devagar),
 * da linha do tempo que o serviço de áudio devolveu ao sintetizar. Cada arquivo
 * tem a sua: a versão devagar é mais longa, e a esticada tem a dela.
 */
function linhasDaPalavra(
	palavra: AudioDoItem | undefined,
	linhasByHash: Map<string, LinhaDoTempo>
): Pick<PronunciaNoRuntime, 'linha' | 'linhaLenta'> {
	const sons = palavra?.sonsDosFonemas;
	const doArquivo = (i: number): LinhaDaPalavra | undefined => {
		const hash = palavra?.arquivos[i]?.hash;
		const linha = hash ? linhasByHash.get(hash) : undefined;
		const fones = sons && linha ? temposDosFonemas(sons, linha.sons) : null;
		return fones ? { fones, fala: linha?.fala ?? null } : undefined;
	};
	const normal = doArquivo(0);
	const lenta = doArquivo(1);
	return { ...(normal ? { linha: normal } : {}), ...(lenta ? { linhaLenta: lenta } : {}) };
}

export function buildRuntimeItem(
	row: StoredItemRow,
	seed: string,
	audioUrlByHash: Map<string, string>,
	/**
	 * Onde cada som está em cada áudio, pelo hash (`MediaAsset.trechos`). Na
	 * Pronúncia é o que toca uma sílaba só e anda a boca no tempo do som; sem ele,
	 * a sílaba só mostra a boca.
	 */
	linhasByHash: Map<string, LinhaDoTempo> = new Map()
): RuntimeItem {
	const prompt = promptSchema.parse(row.prompt);
	const interaction = interactionSchema.parse(row.interaction);
	const grading = gradingSchema.parse(row.grading);
	const locale = localeSchema.parse(row.locale);

	const targetProfile = getProfile(locale.target);
	const registered = getInteraction(interaction.type);
	const skills = registered.skills(prompt);
	// O rótulo do cabeçalho é o que a questão PEDE, não o enunciado: "Diga esta
	// frase em voz alta" aparecia como Leitura. A regra é a do roteiro e do
	// editor, num lugar só (`habilidadePrincipal`).
	const skill = habilidadePrincipal(skills);

	// A seed do item mistura a seed da tentativa com o id do item: cada
	// questão embaralha diferente, e F5 não muda nada (regra nº 8).
	const runtime = registered.toRuntime(interaction.payload, `${seed}:${row.id}`);

	// Duas velocidades por áudio (server.md "TTS"): a normal e a reduzida. São
	// arquivos diferentes, não `playbackRate` — TTS lento soa melhor gerado
	// lento do que desacelerado no browser.
	// A voz sai do TEXTO, não do idioma sozinho: frases diferentes falam com
	// vozes diferentes dentro da mesma atividade (language/voice.ts).
	const audios = audiosDoItem(row, locale.target);
	const url = (audio: AudioDoItem | undefined, i: number) => {
		const arquivo = audio?.arquivos[i];
		return arquivo ? audioUrlByHash.get(arquivo.hash) : undefined;
	};
	const doPrompt = audios.find((a) => a.papel === 'prompt');
	const daPalavra = audios.find((a) => a.papel === 'palavra');

	// O título da questão é o ENUNCIADO. `prompt.text` num item de áudio é o
	// texto que o TTS sintetizou — ou seja, exatamente a frase que o aluno
	// tem que descobrir de ouvido —, então ele só aparece quando o prompt é
	// de texto.
	const instruction = promptInstruction(prompt);
	const visibleText =
		prompt.kind === 'text' || prompt.kind === 'composite' ? prompt.text : undefined;
	// Com contexto, o texto do `composite` é a PERGUNTA (vem depois do trecho ou
	// do diálogo). Sem contexto é a compreensão antiga, que mostrava a pergunta
	// na caixa de apoio — e continua igual.
	const contexto = prompt.kind === 'composite' && prompt.contexto ? prompt.contexto : undefined;

	const digitaNoAlvo =
		(interaction.type === 'type' || interaction.type === 'cloze') &&
		(grading.answerLang ?? 'target') === 'target';

	// A Pronúncia: a boca passo a passo, das regras do idioma, e o áudio da palavra.
	const fonemas = 'fonemas' in runtime && Array.isArray(runtime.fonemas) ? runtime.fonemas : null;
	const silabas = 'silabas' in runtime && Array.isArray(runtime.silabas) ? runtime.silabas : null;
	const pronuncia =
		fonemas && targetProfile.pronuncia && interaction.type === 'speak'
			? {
					passos: passosDaBoca(
						pronunciaDe(fonemas, targetProfile.pronuncia),
						targetProfile.pronuncia
					),
					audio: url(daPalavra, 0),
					audioSlow: url(daPalavra, 1),
					...linhasDaPalavra(daPalavra, linhasByHash)
				}
			: undefined;

	return {
		...runtime,
		dir: targetProfile.direction,
		sourceDir: getProfile(locale.source).direction,
		teclado: digitaNoAlvo ? (tecladoDe(targetProfile.input) ?? undefined) : undefined,
		interaction: interaction.type,
		prompt: instruction,
		passage: contexto ? undefined : visibleText,
		pergunta: contexto ? visibleText : undefined,
		contexto: contexto ? contextoNoRuntime(contexto, audios, audioUrlByHash) : undefined,
		pronuncia: silabas ? pronuncia : undefined,
		skill,
		skillLabel: skillLabels[skill],
		sourceLabel: labelForTag(locale.source),
		targetLabel: labelForTag(locale.target),
		hint: pronuncia
			? DICA_DA_PRONUNCIA[rigorDoRuntime(runtime)]
			: contexto?.tipo === 'dialogo' && contexto.mostra !== 'texto'
				? 'Pode ouvir o diálogo quantas vezes quiser. A velocidade mais lenta não conta como erro.'
				: itemHint(prompt.kind, grading, interaction.type, targetProfile),
		gradingLabel: pronuncia
			? ROTULO_DO_RIGOR[rigorDoRuntime(runtime)]
			: GRADING_LABEL[grading.mode],
		audio: url(doPrompt, 0),
		audioSlow: url(doPrompt, 1),
		gradedLater: grading.mode === 'rubric' || undefined,
		skippable: sePula(interaction.type) || undefined
	};
}
