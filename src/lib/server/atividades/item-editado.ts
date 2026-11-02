import { z } from 'zod';
import {
	gradingSchema,
	interactionKindSchema,
	interactionSchema,
	promptSchema
} from '$lib/kernel/item';
import { getInteraction } from '$lib/kernel/interactions/registry';
import { instructionText } from '$lib/server/player/runtime';
import {
	chaveDoEnunciado,
	gabaritoEditavel,
	modosDeCorrecao,
	podeAlternar,
	textoEditavel
} from '$lib/atividades/editor-item';

/**
 * O item como o EDITOR DE QUESTÃO o deixa — usado por `salvarItem` para gravar
 * e por `previaDoItem` para a prévia. Os dois passam por aqui, então a prévia
 * mostra exatamente o que vai ser gravado, e nada que a tela ofereça escapa
 * das regras de `$lib/atividades/editor-item.ts`.
 *
 * **O que o formulário não edita é PRESERVADO**, não reconstruído. A versão
 * anterior gravava `grading: { mode }` e um prompt montado só com quatro
 * campos: salvar uma "traduza para o português" sem mudar nada apagava o
 * `answerLang: 'source'`, e a resposta passava a ser corrigida com as regras
 * do inglês — e a questão ganhava o teclado do idioma alvo para uma resposta
 * em português.
 */

export const edicaoDoItemSchema = z.object({
	interaction: interactionKindSchema,
	/** O gabarito em JSON — só nos tipos que o editor monta (`gabaritoEditavel`). */
	payload: z.string().optional(),
	/** O que o aluno lê (ou, no áudio, ouve). */
	promptText: z.string().optional(),
	/** O enunciado como está no campo. Igual ao padrão do tipo = não personalizado. */
	instruction: z.string().optional(),
	gradingMode: z.enum(['exact', 'tolerant', 'sequence', 'set', 'asr', 'rubric'])
});
export type EdicaoDoItem = z.infer<typeof edicaoDoItemSchema>;

export type ItemEditado =
	| {
			ok: true;
			prompt: z.infer<typeof promptSchema>;
			interaction: { type: z.infer<typeof interactionKindSchema>; payload: unknown };
			grading: z.infer<typeof gradingSchema>;
			/** O texto de um prompt de áudio mudou: o arquivo antigo não serve mais. */
			audioMudou: boolean;
	  }
	| { ok: false; error: string };

/** JSON não guarda `undefined`; tirar as chaves vazias evita um `"text": null` no banco. */
function semVazios<T extends Record<string, unknown>>(objeto: T): T {
	return Object.fromEntries(Object.entries(objeto).filter(([, v]) => v !== undefined)) as T;
}

export function montarItemEditado(
	atual: { prompt: unknown; interaction: unknown; grading: unknown },
	entrada: EdicaoDoItem
): ItemEditado {
	const prompt = promptSchema.parse(atual.prompt);
	const interaction = interactionSchema.parse(atual.interaction);
	const grading = gradingSchema.parse(atual.grading);

	const escolhida = entrada.interaction;
	if (
		escolhida !== interaction.type &&
		!(podeAlternar(interaction.type, grading.answerLang) && gabaritoEditavel(escolhida))
	) {
		return { ok: false, error: 'Esta questão não pode mudar para esse tipo por aqui.' };
	}

	// O gabarito: montado pelo formulário nos tipos de lista de textos; nos
	// outros, o que o gerador produziu continua valendo.
	let payload: unknown = interaction.payload;
	if (gabaritoEditavel(escolhida)) {
		if (!entrada.payload) return { ok: false, error: 'Preencha a resposta esperada.' };
		try {
			payload = JSON.parse(entrada.payload);
		} catch {
			return { ok: false, error: 'O gabarito chegou num formato inesperado. Recarregue a página.' };
		}
	}
	const validado = getInteraction(escolhida).authoringSchema.safeParse(payload);
	if (!validado.success) {
		return {
			ok: false,
			error:
				escolhida === 'cloze'
					? 'Marque a lacuna na frase com ___ e preencha a resposta esperada.'
					: 'Os campos desta questão não estão completos.'
		};
	}

	const modos = modosDeCorrecao(escolhida, grading.mode);
	if (!modos.includes(entrada.gradingMode)) {
		return { ok: false, error: 'Essa correção não vale para este tipo de questão.' };
	}

	// O texto só muda onde mudar não descola do gabarito (ver `textoEditavel`).
	const texto = textoEditavel(escolhida, prompt.kind)
		? entrada.promptText?.trim() || undefined
		: prompt.text;
	if (prompt.kind === 'audio' && !texto) {
		return { ok: false, error: 'Escreva o que o aluno vai ouvir: é dele que o áudio é gerado.' };
	}
	// Numa "traduza" ou "monte a frase" o texto É a questão: apagá-lo deixaria o
	// aluno sem o que traduzir. Só a questão criada sem texto pode seguir sem.
	if (prompt.text && !texto) {
		return { ok: false, error: 'Esta questão precisa do texto que o aluno lê.' };
	}

	// Enunciado: o padrão do tipo não é gravado como texto do professor — senão
	// a questão deixava de acompanhar o padrão e, trocando de tipo, levava o
	// enunciado do tipo antigo ("Ouça e escreva" numa lacuna).
	const chave = chaveDoEnunciado(
		{ interacao: interaction.type, chave: prompt.instructionKey, prompt: prompt.kind },
		escolhida
	);
	const padrao = instructionText(chave);
	const escrito = entrada.instruction?.trim() ?? '';
	const instrucao = escrito && escrito !== padrao ? escrito : undefined;
	if (!instrucao && !padrao) {
		return { ok: false, error: 'Escreva o enunciado: este tipo de questão não tem um padrão.' };
	}

	return {
		ok: true,
		prompt: semVazios({
			...prompt,
			text: texto,
			instructionKey: chave,
			instruction: instrucao
		}),
		interaction: { type: escolhida, payload: validado.data },
		grading: semVazios({ ...grading, mode: entrada.gradingMode }),
		audioMudou: prompt.kind === 'audio' && texto !== prompt.text
	};
}
