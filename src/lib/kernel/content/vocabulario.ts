import { tokenize } from '../language/tokenize';

/**
 * O que o VOCABULÁRIO aceita: palavra, ou expressão curta ("ice cream", "look
 * up", "thank you") — nunca frase (pedido do dono do repositório). Frase entra
 * como Sentença, e é lá que ela rende os exercícios de frase; cadastrada como
 * vocabulário, ela virava "escreva a palavra" com uma frase inteira de resposta.
 *
 * A regra vale nos quatro caminhos de entrada: um por um (`montarMaterial`), a
 * lista colada (`parseRawMaterial` e a prévia dela), a edição e o "Gerar com
 * IA". O schema de LEITURA (`vocabItemSchema`) não muda: o material que já
 * estava gravado continua abrindo e gerando.
 *
 * Agnóstico: as palavras saem do segmentador do idioma (regra nº 5; "日本語学校"
 * não tem espaço nenhum) e a pontuação de frase, das classes do Unicode.
 */

/** Até três palavras: "look forward to" é vocabulário; "I look forward to it", não. */
export const MAX_PALAVRAS_DO_TERMO = 3;

/** Os pontos finais das escritas do produto: no fim de duas palavras ou mais, é frase. */
const PONTO_FINAL = /[.。．｡।॥۔]\s*$/u;

/** Os outros terminais de frase (interrogação, exclamação, e as formas deles em outras escritas). */
function temInterrogacaoOuExclamacao(texto: string): boolean {
	for (const caractere of texto) {
		if (/\p{Sentence_Terminal}/u.test(caractere) && !/[.。．｡।॥۔]/u.test(caractere)) return true;
	}
	return false;
}

function pontuacaoDeFrase(texto: string, palavras: number): boolean {
	return temInterrogacaoOuExclamacao(texto) || (palavras >= 2 && PONTO_FINAL.test(texto));
}

/**
 * O que está errado num item de vocabulário, numa frase para o professor, ou
 * `null` quando ele pode entrar. `alvo` é a tag do idioma do termo; `origem`, a
 * do sentido. Campo vazio não é assunto daqui (é "preencha o termo").
 */
export function problemaDoVocabulario(
	item: { term: string; translation: string },
	tags: { alvo: string; origem: string }
): string | null {
	const termo = item.term.trim();
	if (termo) {
		const palavras = tokenize(termo, { tag: tags.alvo }).length;
		if (palavras > MAX_PALAVRAS_DO_TERMO) {
			return `Vocabulário é palavra ou expressão curta, de até ${MAX_PALAVRAS_DO_TERMO} palavras. Frase inteira entra como Sentença.`;
		}
		if (pontuacaoDeFrase(termo, palavras)) {
			return 'Vocabulário não leva pontuação de frase. Frase inteira entra como Sentença.';
		}
	}
	const sentido = item.translation.trim();
	if (sentido && pontuacaoDeFrase(sentido, tokenize(sentido, { tag: tags.origem }).length)) {
		return 'O sentido também não leva pontuação de frase: escreva só o que a palavra quer dizer.';
	}
	return null;
}
