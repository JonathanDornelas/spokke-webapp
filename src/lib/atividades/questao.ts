import { z } from 'zod';
import type { InteractionKind } from '$lib/kernel/interactions/types';
import { instructionText } from './enunciados';

/**
 * O EDITOR DE QUESTÃO — o modal da revisão, para editar uma questão ou criar uma
 * do zero, nos oito formatos do kernel. Isomórfico: a tela usa para montar os
 * campos e o servidor (`$lib/server/atividades/item-editado.ts`) usa as MESMAS
 * listas para decidir o que aceita. Se cada ponta tivesse a sua, a tela
 * ofereceria o que o servidor recusa.
 *
 * O professor começa pelo TIPO de questão (o que o aluno faz: ouvir, falar, ler,
 * escrever) e o tipo filtra os formatos possíveis. O tipo não é a habilidade
 * gravada — ela continua derivada pelo kernel (kernel.md "Habilidade é
 * derivada"); ele decide o prompt (áudio na escuta, texto nos outros) e quais
 * formatos fazem sentido.
 *
 * Os campos são LEGÍVEIS (alternativas, a frase na ordem certa, os pares), nunca
 * o payload do kernel: quem transforma um no outro é o servidor, com o
 * segmentador do idioma (regra nº 5) e o `authoringSchema` da interação.
 */

export const TIPOS_DE_QUESTAO = ['escuta', 'fala', 'leitura', 'escrita'] as const;
export type TipoDeQuestao = (typeof TIPOS_DE_QUESTAO)[number];

export const ROTULO_DO_TIPO: Record<TipoDeQuestao, string> = {
	escuta: 'Escuta',
	fala: 'Fala',
	leitura: 'Leitura',
	escrita: 'Escrita'
};

export const DESCRICAO_DO_TIPO: Record<TipoDeQuestao, string> = {
	escuta: 'Ouve o áudio e responde.',
	fala: 'Grava a frase em voz alta.',
	leitura: 'Lê e escolhe, monta, ordena ou associa.',
	escrita: 'Digita a resposta.'
};

/**
 * Os formatos de cada tipo, na ordem em que aparecem. O primeiro é o padrão.
 * "Montar" é LEITURA, como o kernel deriva (`assemble` com prompt de texto rende
 * `reading`): o editor o punha em Escrita, e a mesma questão aparecia como
 * Escrita no editor e Leitura no celular, no roteiro e na prévia do material.
 */
export const FORMATOS_DO_TIPO: Record<TipoDeQuestao, InteractionKind[]> = {
	escuta: ['choice', 'type', 'assemble'],
	fala: ['speak'],
	leitura: ['choice', 'assemble', 'match', 'order', 'select'],
	escrita: ['cloze', 'type']
};

/** O nome curto do formato, no botão. */
export const ROTULO_DO_FORMATO: Record<InteractionKind, string> = {
	choice: 'Escolher',
	type: 'Digitar',
	assemble: 'Montar',
	cloze: 'Lacuna',
	match: 'Associar',
	order: 'Ordenar',
	select: 'Tocar na palavra',
	speak: 'Falar'
};

/** O que o aluno faz em cada formato, numa frase. */
export const DICA_DO_FORMATO: Record<InteractionKind, string> = {
	choice: 'O aluno escolhe a alternativa certa entre as outras.',
	type: 'O aluno escreve a resposta inteira.',
	assemble: 'O aluno coloca as palavras soltas na ordem.',
	cloze: 'O aluno digita o trecho que falta na frase.',
	match: 'O aluno liga cada termo ao seu par.',
	order: 'O aluno coloca as falas na sequência.',
	select: 'O aluno toca na palavra pedida dentro da frase.',
	speak: 'O aluno grava a frase, e a fala é comparada com ela.'
};

/** O tipo de uma questão que já existe: é daqui que o editor abre marcado. */
export function tipoDaQuestao(promptKind: string, interacao: InteractionKind): TipoDeQuestao {
	if (promptKind === 'audio') return 'escuta';
	if (interacao === 'speak') return 'fala';
	if (interacao === 'type' || interacao === 'cloze') return 'escrita';
	return 'leitura';
}

const CHAVE_PADRAO: Partial<Record<`${TipoDeQuestao}:${InteractionKind}`, string>> = {
	'escuta:choice': 'listen-and-choose',
	'escuta:type': 'listen-and-type',
	'escuta:assemble': 'listen-and-assemble',
	'fala:speak': 'say-in-target',
	'leitura:choice': 'choose-translation',
	'leitura:assemble': 'assemble-from-source',
	'leitura:match': 'match-pairs',
	'leitura:order': 'order-the-lines',
	'leitura:select': 'tap-the-word',
	'escrita:cloze': 'fill-the-blank'
};

export interface QuestaoGravada {
	tipo: TipoDeQuestao;
	interacao: InteractionKind;
	chave?: string;
	answerLang: 'source' | 'target';
}

/**
 * A chave do enunciado padrão. Voltar ao tipo e ao formato gravados devolve a
 * chave gravada (a "Responda sobre o texto" de uma pergunta de compreensão não
 * vira "Escolha a tradução"). Digitar no texto só tem padrão quando a resposta
 * é a tradução para a língua do aluno; nos outros casos não há um enunciado que
 * sirva a toda frase, e o professor escreve o dele.
 */
export function chaveDoEnunciado(
	tipo: TipoDeQuestao,
	interacao: InteractionKind,
	gravada?: QuestaoGravada
): string | undefined {
	if (gravada && gravada.tipo === tipo && gravada.interacao === interacao && gravada.chave) {
		return gravada.chave;
	}
	if (tipo === 'escrita' && interacao === 'type' && gravada?.answerLang === 'source') {
		return 'translate-to-source';
	}
	return CHAVE_PADRAO[`${tipo}:${interacao}`];
}

/** O enunciado padrão por extenso ('' quando o formato não tem um). */
export function enunciadoPadrao(
	tipo: TipoDeQuestao,
	interacao: InteractionKind,
	gravada?: QuestaoGravada
): string {
	return instructionText(chaveDoEnunciado(tipo, interacao, gravada));
}

const campo = z.string().max(2000);

/** Teto de alternativas numa escolha: acima disso a questão vira caça-palavra. */
export const MAX_ALTERNATIVAS_DA_QUESTAO = 6;
/** Teto de pares: duas colunas num celular; acima disso o aluno rola para achar o par. */
export const MAX_PARES_DA_QUESTAO = 5;

/** Os campos de cada formato, como o professor os preenche. */
export const camposSchema = z.discriminatedUnion('interacao', [
	z.object({
		interacao: z.literal('choice'),
		opcoes: z.array(campo).max(MAX_ALTERNATIVAS_DA_QUESTAO),
		certa: z.number().int().min(0)
	}),
	z.object({
		interacao: z.literal('assemble'),
		/** A frase na ordem certa. Vazia = as peças gravadas continuam. */
		frase: campo,
		distratores: z.array(campo).max(10)
	}),
	z.object({
		interacao: z.literal('type'),
		/** A primeira é a resposta principal; as outras também valem. */
		aceitas: z.array(campo).max(20),
		/** Escrita livre: o professor corrige na tela da tentativa. */
		corrigeVoce: z.boolean()
	}),
	z.object({
		interacao: z.literal('cloze'),
		/** A frase inteira; a lacuna é a primeira resposta aceita, achada nela. */
		frase: campo,
		aceitas: z.array(campo).max(20)
	}),
	z.object({
		interacao: z.literal('match'),
		pares: z.array(z.object({ esquerda: campo, direita: campo })).max(MAX_PARES_DA_QUESTAO)
	}),
	z.object({
		interacao: z.literal('order'),
		falas: z.array(campo).max(12)
	}),
	z.object({
		interacao: z.literal('select'),
		frase: campo,
		/** A palavra que o aluno precisa tocar. */
		certa: campo
	}),
	z.object({
		interacao: z.literal('speak'),
		frase: campo
	})
]);
export type CamposDaQuestao = z.infer<typeof camposSchema>;

export const questaoSchema = z.object({
	tipo: z.enum(TIPOS_DE_QUESTAO),
	/** O enunciado como está no campo. Igual ao padrão = não personalizado. */
	enunciado: campo,
	/**
	 * O que o aluno LÊ — ou, na escuta, OUVE (é dele que o áudio sai). Na lacuna
	 * e no montar é a tradução de apoio; na fala, a frase na língua dele.
	 */
	texto: campo,
	campos: camposSchema
});
export type Questao = z.infer<typeof questaoSchema>;

/**
 * A "frase alvo" que atravessa a troca de formato: trocar o formato refaz os
 * campos de resposta, mas a frase em que o professor estava trabalhando fica.
 */
export function fraseDaQuestao(campos: CamposDaQuestao): string {
	switch (campos.interacao) {
		case 'choice':
			return campos.opcoes[campos.certa] ?? '';
		case 'type':
			return campos.aceitas[0] ?? '';
		case 'cloze':
			return campos.frase.includes('___') && campos.aceitas[0]
				? campos.frase.replace('___', campos.aceitas[0])
				: campos.frase;
		case 'assemble':
		case 'select':
		case 'speak':
			return campos.frase;
		case 'match':
		case 'order':
			return '';
	}
}

/** Os campos vazios de um formato, já com a frase alvo onde ela cabe. */
export function camposIniciais(interacao: InteractionKind, frase = ''): CamposDaQuestao {
	switch (interacao) {
		case 'choice':
			return { interacao, opcoes: [frase, ''], certa: 0 };
		case 'type':
			return { interacao, aceitas: [frase], corrigeVoce: false };
		case 'cloze':
			return { interacao, frase, aceitas: [''] };
		case 'assemble':
			return { interacao, frase, distratores: [] };
		case 'match':
			return {
				interacao,
				pares: [
					{ esquerda: '', direita: '' },
					{ esquerda: '', direita: '' }
				]
			};
		case 'order':
			return { interacao, falas: ['', ''] };
		case 'select':
			return { interacao, frase, certa: '' };
		case 'speak':
			return { interacao, frase };
	}
}

/** Uma questão nova, do zero, de um tipo: o primeiro formato dele. */
export function questaoNova(tipo: TipoDeQuestao): Questao {
	const interacao = FORMATOS_DO_TIPO[tipo][0];
	return {
		tipo,
		enunciado: enunciadoPadrao(tipo, interacao),
		texto: '',
		campos: camposIniciais(interacao)
	};
}

/** Como cada formato é corrigido, numa frase para o professor. */
export function comoECorrigida(campos: CamposDaQuestao): string {
	switch (campos.interacao) {
		case 'type':
			return campos.corrigeVoce
				? 'Você corrige: a resposta fica "a comentar" na tela da tentativa.'
				: 'Automática e tolerante: uma letra trocada vira "quase", não erro.';
		case 'cloze':
			return 'Automática e tolerante: uma letra trocada vira "quase", não erro.';
		case 'choice':
			return 'Automática: certo ou errado, pela alternativa escolhida.';
		case 'assemble':
			return 'Automática, pela ordem: o que sair do lugar aparece grifado para o aluno.';
		case 'order':
			return 'Automática, pela sequência: o que sair do lugar aparece grifado para o aluno.';
		case 'match':
			return 'Automática, par a par.';
		case 'select':
			return 'Automática, pela palavra tocada.';
		case 'speak':
			return 'Automática, pela transcrição da fala. Sotaque não reprova: o mais duro é "quase".';
	}
}
