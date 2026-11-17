import type { z } from 'zod';
import { gradingSchema, interactionSchema, promptSchema } from '$lib/kernel/item';
import type { ContextoDoPrompt, InteractionKind } from '$lib/kernel/interactions/types';
import { getInteraction } from '$lib/kernel/interactions/registry';
import type { LanguageProfile } from '$lib/kernel/language/profile';
import { normalize } from '$lib/kernel/language/normalize';
import { segmentosDePalavra, tokenize } from '$lib/kernel/language/tokenize';
import { assembleAuthoringSchema } from '$lib/kernel/interactions/assemble';
import { speakAuthoringSchema } from '$lib/kernel/interactions/speak';
import { pronunciaDe } from '$lib/kernel/language/pronuncia';
import { instructionText } from '$lib/atividades/enunciados';
import {
	FORMATOS_DO_TIPO,
	MAX_PARES_DA_QUESTAO,
	chaveDoContexto,
	chaveDoEnunciado,
	formatoUsaContexto,
	mostraDoPrompt,
	tipoDaQuestao,
	type CamposDaQuestao,
	type ContextoNaQuestao,
	type Questao,
	type QuestaoGravada
} from '$lib/atividades/questao';

/**
 * A questão como o EDITOR a deixa — usado para gravar (`salvarQuestao`) e para
 * a prévia (`previaDaQuestao`). Os dois passam por aqui, então a prévia mostra
 * exatamente o que vai ser gravado.
 *
 * O editor manda campos LEGÍVEIS (`$lib/atividades/questao.ts`) e este módulo
 * monta o payload do kernel: a frase vira peças pelo segmentador do idioma
 * (regra nº 5), a lacuna é achada na frase pela fronteira de palavra, e no fim
 * tudo passa pelo `authoringSchema` da interação.
 *
 * **O que o formulário não edita é PRESERVADO.** Salvar uma "traduza para o
 * português" sem mexer não pode apagar o `answerLang: 'source'` (a resposta
 * passaria a ser corrigida com as regras do inglês e ganharia o teclado do
 * idioma alvo); salvar uma escuta sem mudar a frase mantém o `mediaId`; salvar
 * um "monte" sem reescrever a frase mantém as peças e as ordens aceitas.
 */

type Prompt = z.infer<typeof promptSchema>;
type Grading = z.infer<typeof gradingSchema>;

export type QuestaoMontada =
	| {
			ok: true;
			prompt: Prompt;
			interaction: { type: InteractionKind; payload: unknown };
			grading: Grading;
			/** O áudio desta questão precisa ser gerado (é nova, ou a frase mudou). */
			audioMudou: boolean;
	  }
	| { ok: false; error: string };

export interface ContextoDaQuestao {
	/** O idioma alvo da atividade: tokenização, comparação, vozes. */
	alvo: LanguageProfile;
	/** O que o servidor consegue entregar hoje. */
	capacidades: { tts: boolean; asr: boolean };
	/** A questão como está gravada. Ausente quando ela é criada do zero. */
	atual?: { prompt: unknown; interaction: unknown; grading: unknown };
	/**
	 * A pronúncia de uma palavra, do dicionário do servidor (`server/pronuncia`):
	 * a questão de Pronúncia acompanha a palavra quando o professor a troca.
	 */
	foneticaDe?: (palavra: string) => string[] | null;
}

/** JSON não guarda `undefined`; tirar as chaves vazias evita um `"text": null` no banco. */
function semVazios<T extends Record<string, unknown>>(objeto: T): T {
	return Object.fromEntries(Object.entries(objeto).filter(([, v]) => v !== undefined)) as T;
}

const limpar = (lista: string[]) => lista.map((t) => t.trim()).filter(Boolean);

function falha(error: string): QuestaoMontada {
	return { ok: false, error };
}

/**
 * Onde o trecho começa na frase, inteiro: começando e terminando numa fronteira
 * de PALAVRA do idioma. "a" em "I have a cat" é a palavra solta, não o "a" de
 * "have". Sem `split(' ')` (regra nº 5): a fronteira é a do `Intl.Segmenter`.
 */
export function acharTrecho(frase: string, trecho: string, perfil: LanguageProfile): number {
	if (!trecho) return -1;
	const segmentos = segmentosDePalavra(frase, perfil);
	const fronteiras = new Set([...segmentos.map((s) => s.inicio), frase.length]);
	for (const s of segmentos) {
		if (!s.palavra) continue;
		if (frase.startsWith(trecho, s.inicio) && fronteiras.has(s.inicio + trecho.length)) {
			return s.inicio;
		}
	}
	return -1;
}

function repetidos(textos: string[], perfil: LanguageProfile): boolean {
	const vistos = new Set(textos.map((t) => normalize(t, perfil)));
	return vistos.size !== textos.length;
}

interface Gravada {
	prompt: Prompt;
	interaction: { type: InteractionKind; payload: unknown };
	grading: Grading;
}

function payloadDe(
	questao: Questao,
	campos: CamposDaQuestao,
	ctx: ContextoDaQuestao,
	gravada: Gravada | null
): { ok: true; payload: unknown } | { ok: false; error: string } {
	const { alvo } = ctx;
	const texto = questao.texto.trim();
	const escuta = questao.tipo === 'escuta';
	const mesmoFormato = gravada?.interaction.type === campos.interacao;

	switch (campos.interacao) {
		case 'choice': {
			const opcoes = campos.opcoes.map((o) => o.trim());
			const certa = opcoes[campos.certa];
			if (!certa) return { ok: false, error: 'Escreva a alternativa certa.' };
			const indices = opcoes.map((o, i) => (o ? i : -1)).filter((i) => i >= 0);
			if (indices.length < 2) {
				return { ok: false, error: 'Escreva ao menos uma alternativa errada.' };
			}
			const options = indices.map((i) => opcoes[i] as string);
			if (repetidos(options, alvo)) {
				return { ok: false, error: 'Duas alternativas iguais: o aluno acertaria qualquer uma.' };
			}
			if (escuta && normalize(certa, alvo) !== normalize(texto, alvo)) {
				return { ok: false, error: 'Na escuta, a alternativa certa é a frase do áudio.' };
			}
			return { ok: true, payload: { options, correctIndex: indices.indexOf(campos.certa) } };
		}

		case 'assemble': {
			const frase = (escuta ? texto : campos.frase).trim();
			const distractors = limpar(campos.distratores).flatMap((d) => {
				const pecas = tokenize(d, alvo);
				return pecas.length > 0 ? pecas : [d];
			});
			const anterior = mesmoFormato
				? assembleAuthoringSchema.safeParse(gravada?.interaction.payload)
				: null;
			if (!frase) {
				// Sem frase escrita, as peças gravadas continuam: a frase original de
				// um "monte" gerado não fica no item, e juntar as peças com espaço
				// seria a regra nº 5 pelo avesso.
				if (anterior?.success) return { ok: true, payload: { ...anterior.data, distractors } };
				return { ok: false, error: 'Escreva a frase na ordem certa.' };
			}
			const tokens = tokenize(frase, alvo);
			if (tokens.length < 2) {
				return { ok: false, error: 'A frase precisa de ao menos duas palavras para montar.' };
			}
			const mesmasPecas =
				anterior?.success &&
				anterior.data.tokens.length === tokens.length &&
				anterior.data.tokens.every((t, i) => t === tokens[i]);
			return {
				ok: true,
				payload: semVazios({
					tokens,
					distractors,
					// As outras ordens aceitas só valem para as MESMAS peças.
					accepted: mesmasPecas && anterior?.success ? anterior.data.accepted : [tokens],
					translation: anterior?.success ? anterior.data.translation : undefined
				})
			};
		}

		case 'type': {
			const aceitas = limpar(escuta ? [texto, ...campos.aceitas] : campos.aceitas);
			const unicas = aceitas.filter(
				(a, i) => aceitas.findIndex((b) => normalize(b, alvo) === normalize(a, alvo)) === i
			);
			if (unicas.length === 0) return { ok: false, error: 'Escreva a resposta esperada.' };
			return { ok: true, payload: { accepted: unicas } };
		}

		case 'cloze': {
			const frase = campos.frase.trim();
			const aceitas = limpar(campos.aceitas);
			const lacuna = aceitas[0];
			if (!frase) return { ok: false, error: 'Escreva a frase que vai ter a lacuna.' };
			if (!lacuna) return { ok: false, error: 'Escreva o trecho que falta.' };
			if (frase.includes('___')) return { ok: true, payload: { masked: frase, accepted: aceitas } };
			const inicio = acharTrecho(frase, lacuna, alvo);
			if (inicio < 0) {
				return {
					ok: false,
					error: 'O trecho que falta precisa aparecer na frase, com as palavras inteiras.'
				};
			}
			const masked = `${frase.slice(0, inicio)}___${frase.slice(inicio + lacuna.length)}`;
			return { ok: true, payload: { masked, accepted: aceitas } };
		}

		case 'match': {
			const linhas = campos.pares
				.map((p) => ({ left: p.esquerda.trim(), right: p.direita.trim() }))
				.filter((p) => p.left || p.right);
			if (linhas.some((p) => !p.left || !p.right)) {
				return { ok: false, error: 'Complete os dois lados de cada par.' };
			}
			if (linhas.length < 2) return { ok: false, error: 'Escreva ao menos dois pares.' };
			if (linhas.length > MAX_PARES_DA_QUESTAO) {
				return { ok: false, error: `No máximo ${MAX_PARES_DA_QUESTAO} pares.` };
			}
			if (
				repetidos(
					linhas.map((p) => p.left),
					alvo
				) ||
				repetidos(
					linhas.map((p) => p.right),
					alvo
				)
			) {
				return {
					ok: false,
					error: 'Dois pares com o mesmo lado: duas ligações ficariam certas.'
				};
			}
			return { ok: true, payload: { pairs: linhas } };
		}

		case 'order': {
			const falas = limpar(campos.falas);
			if (falas.length < 2) return { ok: false, error: 'Escreva ao menos duas falas.' };
			if (repetidos(falas, alvo)) {
				return { ok: false, error: 'Duas falas iguais: a ordem certa ficaria ambígua.' };
			}
			return { ok: true, payload: { lines: falas } };
		}

		case 'select': {
			const frase = campos.frase.trim();
			const certa = campos.certa.trim();
			if (!frase) return { ok: false, error: 'Escreva a frase em que o aluno toca.' };
			if (!certa) return { ok: false, error: 'Escreva a palavra que o aluno precisa tocar.' };
			const segments = segmentosDePalavra(frase, alvo).map((s) => ({
				text: s.texto,
				selectable: s.palavra
			}));
			const correctIndex = segments.findIndex(
				(s) => s.selectable && normalize(s.text, alvo) === normalize(certa, alvo)
			);
			if (correctIndex < 0) {
				return {
					ok: false,
					error: 'A palavra certa precisa ser uma palavra só, da própria frase.'
				};
			}
			return { ok: true, payload: { segments, correctIndex } };
		}

		case 'speak': {
			const frase = campos.frase.trim();
			if (!frase) return { ok: false, error: 'Escreva a frase que o aluno vai falar.' };
			const anterior = mesmoFormato
				? speakAuthoringSchema.safeParse(gravada?.interaction.payload)
				: null;
			const mesma = anterior?.success && anterior.data.target === frase;
			// A questão de Pronúncia continua sendo de Pronúncia (era uma fala comum
			// depois de salvar, sem a boca e sem a correção por sílaba), com o rigor
			// que o professor escolheu — ou o que ela já tinha.
			const pronuncia =
				anterior?.success && anterior.data.pronuncia
					? mesma
						? anterior.data.pronuncia
						: pronunciaDaPalavra(frase, ctx)
					: undefined;
			const rigor =
				campos.rigor ?? (anterior?.success ? anterior.data.pronuncia?.rigor : undefined);
			return {
				ok: true,
				payload: semVazios({
					target: frase,
					hints: mesma && anterior?.success ? anterior.data.hints : [],
					ipa: mesma && anterior?.success ? anterior.data.ipa : undefined,
					pronuncia: pronuncia ? { ...pronuncia, ...(rigor ? { rigor } : {}) } : undefined
				})
			};
		}
	}
}

/**
 * A pronúncia da palavra NOVA, quando o professor troca a palavra de uma questão de
 * Pronúncia: lida de novo no dicionário, como na geração (`vocab-pronuncia`). Mais
 * de uma palavra, ou uma fora do dicionário, volta a ser uma fala comum.
 */
function pronunciaDaPalavra(frase: string, ctx: ContextoDaQuestao) {
	const regras = ctx.alvo.pronuncia;
	if (!regras || !ctx.foneticaDe || tokenize(frase, ctx.alvo).length !== 1) return undefined;
	const fonemas = ctx.foneticaDe(frase);
	return fonemas && fonemas.length > 0 ? pronunciaDe(fonemas, regras) : undefined;
}

function gradingDe(campos: CamposDaQuestao, gravada: Gravada | null): Grading {
	const tolerancia = gravada?.grading.tolerance ?? 0.9;
	switch (campos.interacao) {
		case 'choice':
			// "Escolha a tradução" responde na língua do aluno, e isso fica: é o que a
			// conferência lê para saber que o sentido igual ao áudio não foi traduzido.
			return {
				mode: 'exact',
				answerLang: gravada?.interaction.type === 'choice' ? gravada.grading.answerLang : 'target'
			};
		case 'select':
			return { mode: 'exact', answerLang: 'target' };
		case 'assemble':
		case 'order':
			return { mode: 'sequence', answerLang: 'target' };
		case 'match':
			return { mode: 'set', answerLang: 'target' };
		case 'speak':
			return { mode: 'asr', answerLang: 'target' };
		case 'cloze':
			// A lacuna é na frase do idioma alvo: a resposta é dele.
			return { mode: 'tolerant', tolerance: tolerancia, answerLang: 'target' };
		case 'type':
			return {
				mode: campos.corrigeVoce ? 'rubric' : 'tolerant',
				tolerance: tolerancia,
				// "Traduza para o português" responde na língua do aluno, e isso fica.
				answerLang: gravada?.interaction.type === 'type' ? gravada.grading.answerLang : 'target'
			};
	}
}

export function montarQuestao(questao: Questao, ctx: ContextoDaQuestao): QuestaoMontada {
	const gravada: Gravada | null = ctx.atual
		? {
				prompt: promptSchema.parse(ctx.atual.prompt),
				interaction: interactionSchema.parse(ctx.atual.interaction),
				grading: gradingSchema.parse(ctx.atual.grading)
			}
		: null;
	const { campos, tipo } = questao;

	if (!FORMATOS_DO_TIPO[tipo].includes(campos.interacao)) {
		return falha('Esse formato não existe para este tipo de questão.');
	}

	// A questão com contexto (o trecho, o diálogo) é montada à parte: o prompt é
	// `composite` e o áudio, quando há, sai das falas — não de uma frase.
	if (questao.contexto && formatoUsaContexto(questao.contexto, campos.interacao)) {
		return montarComContexto(questao, questao.contexto, ctx, gravada);
	}

	const texto = questao.texto.trim();
	const kind = tipo === 'escuta' ? 'audio' : 'text';
	if (kind === 'audio' && !texto) {
		return falha('Escreva a frase que o aluno ouve: é dela que sai o áudio.');
	}
	// "Escolha a tradução" sem nada para ler é uma lista de alternativas soltas.
	if (tipo === 'leitura' && campos.interacao === 'choice' && !texto) {
		return falha('Escreva o que o aluno lê: a frase, o termo ou a pergunta.');
	}
	const audioMudou =
		kind === 'audio' && (gravada?.prompt.kind !== 'audio' || gravada.prompt.text !== texto);
	if (audioMudou && (!ctx.capacidades.tts || ctx.alvo.tts.voices.length === 0)) {
		return falha('Sem voz para este idioma agora: não dá para gerar o áudio desta questão.');
	}
	const jaEraFala = gravada?.interaction.type === 'speak';
	if (campos.interacao === 'speak' && !jaEraFala && !ctx.capacidades.asr) {
		return falha(
			'A transcrição de fala está desligada: questão de fala não teria como ser corrigida.'
		);
	}

	const montado = payloadDe(questao, campos, ctx, gravada);
	if (!montado.ok) return montado;
	const validado = getInteraction(campos.interacao).authoringSchema.safeParse(montado.payload);
	if (!validado.success) return falha('Os campos desta questão não formam um exercício ainda.');

	const grading = gradingDe(campos, gravada);
	if (campos.interacao === 'type' && grading.answerLang === 'source' && !texto) {
		return falha('Escreva a frase que o aluno traduz.');
	}

	// Enunciado: o padrão não é gravado como texto do professor — senão a
	// questão deixava de acompanhar o padrão e, trocando de formato, levava o
	// enunciado do formato antigo ("Ouça e escreva" numa lacuna).
	const anterior: QuestaoGravada | undefined = gravada
		? {
				tipo: tipoDaQuestao(
					gravada.prompt.kind,
					gravada.interaction.type,
					mostraDoPrompt(gravada.prompt)
				),
				interacao: gravada.interaction.type,
				chave: gravada.prompt.instructionKey,
				answerLang: gravada.grading.answerLang
			}
		: undefined;
	const chave = chaveDoEnunciado(tipo, campos.interacao, anterior);
	const padrao = instructionText(chave);
	const escrito = questao.enunciado.trim();
	const instruction = escrito && escrito !== padrao ? escrito : undefined;
	if (!instruction && !padrao) {
		return falha('Escreva o enunciado: este formato não tem um padrão.');
	}
	// "Toque na palavra certa" não diz QUAL: sem uma pista ou um enunciado próprio,
	// o aluno toca no escuro.
	if (campos.interacao === 'select' && !texto && !instruction) {
		return falha('Diga ao aluno qual palavra tocar: escreva uma pista ou um enunciado seu.');
	}

	return {
		ok: true,
		prompt: semVazios({
			kind,
			text: texto || undefined,
			// O arquivo gravado só serve se a frase do áudio é a mesma.
			mediaId: kind === 'audio' && !audioMudou ? gravada?.prompt.mediaId : undefined,
			instructionKey: chave,
			instruction
		}),
		interaction: { type: campos.interacao, payload: validado.data },
		grading: semVazios(grading),
		audioMudou
	};
}

/**
 * A questão com CONTEXTO: a pergunta sobre um texto ou um diálogo, e a próxima
 * fala. O prompt é `composite` com o contexto dentro (a versão publicada não
 * depende do material), e na próxima fala a fala da vez é a RESPOSTA: o que o
 * professor escreve nos campos vira o texto dela no diálogo, para o roteiro e o
 * cartão mostrarem a mesma coisa.
 */
function montarComContexto(
	questao: Questao,
	contexto: ContextoNaQuestao,
	ctx: ContextoDaQuestao,
	gravada: Gravada | null
): QuestaoMontada {
	const { campos } = questao;
	const texto = questao.texto.trim();
	const pergunta = contexto.tipo === 'texto' || contexto.ate === null;
	if (pergunta && !texto) {
		return falha(
			contexto.tipo === 'texto'
				? 'Escreva a pergunta sobre o texto.'
				: 'Escreva a pergunta sobre o diálogo.'
		);
	}
	if (
		campos.interacao === 'speak' &&
		gravada?.interaction.type !== 'speak' &&
		!ctx.capacidades.asr
	) {
		return falha(
			'A transcrição de fala está desligada: questão de fala não teria como ser corrigida.'
		);
	}

	let promptContexto: ContextoDoPrompt;
	if (contexto.tipo === 'texto') {
		const trecho = contexto.texto.trim();
		if (!trecho) return falha('O trecho do texto está vazio.');
		promptContexto = { tipo: 'texto', texto: trecho };
	} else {
		const falas = contexto.falas
			.map((f) => ({ falante: f.falante.trim() || 'A', texto: f.texto.trim() }))
			.filter((f) => f.texto);
		if (falas.length < 2) return falha('O diálogo precisa de pelo menos duas falas.');
		if (contexto.ate !== null && (contexto.ate < 1 || contexto.ate >= falas.length)) {
			return falha('Escolha qual fala é a vez do aluno.');
		}
		if (contexto.mostra !== 'texto' && (!ctx.capacidades.tts || ctx.alvo.tts.voices.length === 0)) {
			return falha(
				'Sem voz para este idioma agora: o aluno receberia um diálogo mudo. Escolha "Só texto".'
			);
		}
		if (contexto.ate !== null) {
			const resposta =
				campos.interacao === 'choice'
					? (campos.opcoes[campos.certa] ?? '').trim()
					: 'frase' in campos
						? campos.frase.trim()
						: '';
			if (resposta) falas[contexto.ate] = { ...falas[contexto.ate]!, texto: resposta };
		}
		promptContexto = {
			tipo: 'dialogo',
			falas,
			ate: contexto.ate ?? undefined,
			mostra: contexto.mostra
		};
	}

	// A escuta de um diálogo é das FALAS: a resposta não é "a frase do áudio", que
	// é a regra da escuta de uma frase só (`payloadDe`).
	const montado = payloadDe(
		questao.tipo === 'escuta' ? { ...questao, tipo: 'leitura' } : questao,
		campos,
		ctx,
		gravada
	);
	if (!montado.ok) return montado;
	const validado = getInteraction(campos.interacao).authoringSchema.safeParse(montado.payload);
	if (!validado.success) return falha('Os campos desta questão não formam um exercício ainda.');

	const chave = chaveDoContexto(contexto, campos.interacao);
	const padrao = instructionText(chave);
	const escrito = questao.enunciado.trim();
	return {
		ok: true,
		prompt: semVazios({
			kind: 'composite' as const,
			text: pergunta ? texto : undefined,
			instructionKey: chave,
			instruction: escrito && escrito !== padrao ? escrito : undefined,
			contexto: promptContexto
		}),
		interaction: { type: campos.interacao, payload: validado.data },
		grading: semVazios(gradingDe(campos, gravada)),
		audioMudou: false
	};
}

/**
 * O caminho inverso: a questão gravada como o editor a abre. É a tela do
 * PROFESSOR, atrás do guard — o gabarito vem junto, na moldura âmbar.
 *
 * `fraseDoMaterial` é a frase no idioma alvo do material de origem, quando há:
 * o "monte a frase" gerado não guarda a frase inteira, só as peças, e juntar as
 * peças com espaço quebraria o japonês (regra nº 5).
 */
export function questaoDoItem(
	item: { prompt: unknown; interaction: unknown; grading: unknown },
	extra: { fraseDoMaterial?: string } = {}
): Questao {
	const prompt = promptSchema.parse(item.prompt);
	const interaction = interactionSchema.parse(item.interaction);
	const grading = gradingSchema.parse(item.grading);
	const tipo = tipoDaQuestao(prompt.kind, interaction.type, mostraDoPrompt(prompt));
	const enunciado = prompt.instruction?.trim() || instructionText(prompt.instructionKey);
	// O contexto (o trecho, o diálogo) abre junto, para salvar não o perder.
	const contexto: ContextoNaQuestao | undefined =
		prompt.kind !== 'composite' || !prompt.contexto
			? undefined
			: prompt.contexto.tipo === 'texto'
				? { tipo: 'texto', texto: prompt.contexto.texto }
				: {
						tipo: 'dialogo',
						falas: prompt.contexto.falas.map((f) => ({ falante: f.falante, texto: f.texto })),
						ate: prompt.contexto.ate ?? null,
						mostra: prompt.contexto.mostra
					};
	// Na próxima fala, a frase do "montar" é a fala da vez (o item guarda só as peças).
	const falaDaVez =
		contexto?.tipo === 'dialogo' && contexto.ate !== null
			? contexto.falas[contexto.ate]?.texto
			: undefined;
	const base = { tipo, enunciado, texto: prompt.text ?? '', ...(contexto ? { contexto } : {}) };
	if (falaDaVez && interaction.type === 'assemble')
		extra = { ...extra, fraseDoMaterial: falaDaVez };
	const validado = getInteraction(interaction.type).authoringSchema.safeParse(interaction.payload);
	const payload: Record<string, unknown> = validado.success
		? (validado.data as Record<string, unknown>)
		: {};
	const lista = (valor: unknown) =>
		Array.isArray(valor) ? valor.filter((v): v is string => typeof v === 'string') : [];

	switch (interaction.type) {
		case 'choice':
			return {
				...base,
				campos: {
					interacao: 'choice',
					opcoes: lista(payload.options),
					certa: typeof payload.correctIndex === 'number' ? payload.correctIndex : 0
				}
			};
		case 'assemble':
			return {
				...base,
				campos: {
					interacao: 'assemble',
					frase: prompt.kind === 'audio' ? (prompt.text ?? '') : (extra.fraseDoMaterial ?? ''),
					distratores: lista(payload.distractors)
				}
			};
		case 'type':
			return {
				...base,
				campos: {
					interacao: 'type',
					aceitas: lista(payload.accepted),
					corrigeVoce: grading.mode === 'rubric'
				}
			};
		case 'cloze': {
			const aceitas = lista(payload.accepted);
			const masked = typeof payload.masked === 'string' ? payload.masked : '';
			// Com UMA lacuna a frase volta inteira (a lacuna é o primeiro aceito);
			// com mais de uma, a frase fica com os ___ e o professor os vê.
			const uma = masked.split('___').length === 2 && aceitas[0];
			return {
				...base,
				campos: {
					interacao: 'cloze',
					frase: uma ? masked.replace('___', aceitas[0] as string) : masked,
					aceitas
				}
			};
		}
		case 'match': {
			const pares = Array.isArray(payload.pairs)
				? (payload.pairs as { left: string; right: string }[]).map((p) => ({
						esquerda: p.left,
						direita: p.right
					}))
				: [];
			return { ...base, campos: { interacao: 'match', pares } };
		}
		case 'order':
			return { ...base, campos: { interacao: 'order', falas: lista(payload.lines) } };
		case 'select': {
			const segmentos = Array.isArray(payload.segments)
				? (payload.segments as { text: string; selectable: boolean }[])
				: [];
			const indice = typeof payload.correctIndex === 'number' ? payload.correctIndex : -1;
			return {
				...base,
				campos: {
					interacao: 'select',
					// Os segmentos guardam também o espaço e a pontuação: juntá-los
					// devolve a frase exata.
					frase: segmentos.map((s) => s.text).join(''),
					certa: segmentos[indice]?.text ?? ''
				}
			};
		}
		case 'speak': {
			// A Pronúncia abre com o rigor dela: é o que mostra o seletor no formulário.
			const fala = speakAuthoringSchema.safeParse(interaction.payload);
			const pronuncia = fala.success ? fala.data.pronuncia : undefined;
			return {
				...base,
				campos: {
					interacao: 'speak',
					frase: typeof payload.target === 'string' ? payload.target : '',
					...(pronuncia ? { rigor: pronuncia.rigor ?? 'normal' } : {})
				}
			};
		}
	}
}
