import type { LanguageProfile } from '../language/profile';
import { normalize } from '../language/normalize';
import { tokenize } from '../language/tokenize';
import { wordSimilarity } from './compare';
import { sujeitoNoInicio } from './sujeito';

/**
 * Quais traduções alternativas viram RESPOSTA ACEITA de uma questão de
 * tradução (kernel.md "Respostas aceitas"). Quem propõe as candidatas é o
 * tradutor do servidor, ao gerar os itens; aqui só se decide, sem conhecimento
 * de língua nenhum, quais delas ficam perto o bastante da resposta do professor.
 *
 * O pedido do dono do repositório foi exatamente este: variações que o aluno
 * pode digitar, com o mesmo sentido, "pequenas diferenças, não grandes". Então
 * a régua é a mesma das palavras do `tolerantScore`, só que mais exigente — e
 * com um teto de palavras a mais ou a menos, para "Amanhã vamos à praia" não
 * entrar como variante de "Nós vamos para a praia amanhã".
 */

/** No máximo isto de variantes novas por questão: a lista é para conferir, não para ler. */
export const MAX_VARIANTES = 4;

/**
 * Dice sobre as palavras (`wordSimilarity`). Entram "Onde está a estação de
 * trem?" contra "Onde fica a estação de trem?" (0,83), "Não gosto de café"
 * contra "Eu não gosto de café" (0,89) e "Eu geralmente acordo às sete da manhã"
 * contra "Eu costumo acordar às sete da manhã" (0,71). Fica de fora "O relatório
 * já foi concluído" contra "Eles já terminaram o relatório" (0,60): a frase
 * virou outra, ainda que diga o mesmo.
 *
 * Estas réguas medem o TAMANHO da diferença, não o sentido. Quem confere o sentido
 * é o servidor, traduzindo cada variante de volta (`server/atividades/
 * variantes-aceitas.ts`) — "Eu adoro ler" passa aqui contra "Eu gosto muito de
 * ler" (0,71) e cai lá.
 */
const LIMIAR = 0.7;

/** Palavras a mais ou a menos que uma variante pode ter. */
const MAX_PALAVRAS_DE_DIFERENCA = 2;

/**
 * A segunda régua, para a frase CURTA: até duas palavras trocadas, com as outras
 * na mesma ordem.
 *
 * O Dice é uma proporção, e proporção pune frase curta: trocar "estou com" por
 * "tenho" em "Não estou com fome" dá 0,57, e "Amanhã vamos para a praia" contra
 * "Amanhã vamos à praia" dá 0,67 — as duas caíam, e são exatamente as frases de
 * uma aula de iniciante. Medido com o MADLAD em dezesseis frases de aula: o
 * limiar sozinho cortava a variante mais natural em metade delas, e o retorno do
 * dono do repositório foi "não está gerando variações".
 *
 * A ORDEM é o que separa a troca pequena da frase reescrita: em "O relatório já
 * foi concluído" contra "Eles já terminaram o relatório" as palavras em comum
 * mudaram de lugar, e ela continua de fora. Quem confere o sentido das duas
 * réguas é a ida e volta do servidor.
 */
const MAX_PALAVRAS_TROCADAS = 2;

/** Quantas palavras as duas frases têm em comum NA MESMA ORDEM (subsequência comum). */
function palavrasNaMesmaOrdem(a: string[], b: string[]): number {
	let anterior = new Array<number>(b.length + 1).fill(0);
	for (const palavra of a) {
		const linha = [0];
		for (let j = 1; j <= b.length; j++) {
			linha.push(
				palavra === b[j - 1]
					? (anterior[j - 1] ?? 0) + 1
					: Math.max(anterior[j] ?? 0, linha[j - 1] ?? 0)
			);
		}
		anterior = linha;
	}
	return anterior[b.length] ?? 0;
}

/** A diferença entre as duas frases é pequena, por uma das duas réguas. */
function diferencaPequena(a: string[], b: string[], dice: number): boolean {
	if (dice >= LIMIAR) return true;
	const emOrdem = palavrasNaMesmaOrdem(a, b);
	return emOrdem >= 1 && Math.max(a.length, b.length) - emOrdem <= MAX_PALAVRAS_TROCADAS;
}

/**
 * As `candidatas` que valem como variante da `principal`, na ordem em que
 * vieram (a do tradutor é a da confiança dele) e sem repetir nada que a
 * correção já trataria como igual — inclusive pelas `equivalences` do profile:
 * "dos seus" não entra como variante de "de seus", porque já é a mesma
 * resposta.
 *
 * `jaAceitas` são as respostas que a questão já aceita além da principal: não
 * voltam como novas.
 */
export function variantesProximas(
	principal: string,
	candidatas: string[],
	profile: LanguageProfile,
	jaAceitas: string[] = [],
	max = MAX_VARIANTES
): string[] {
	const chave = (texto: string) => normalize(texto, profile).trim();
	const base = chave(principal);
	if (!base) return [];
	const palavrasDaBase = tokenize(base, profile);

	const vistas = new Set([base, ...jaAceitas.map(chave)]);
	const saida: string[] = [];
	for (const candidata of candidatas) {
		if (saida.length >= max) break;
		const texto = candidata.trim();
		const n = chave(texto);
		if (!n || vistas.has(n)) continue;
		vistas.add(n);
		const palavras = tokenize(n, profile);
		if (Math.abs(palavras.length - palavrasDaBase.length) > MAX_PALAVRAS_DE_DIFERENCA) continue;
		if (!diferencaPequena(palavras, palavrasDaBase, wordSimilarity(texto, principal, profile))) {
			continue;
		}
		saida.push(texto);
	}
	return saida;
}

/**
 * As candidatas de SUJEITO EXPLÍCITO: a resposta do professor com cada pronome
 * que a língua deixa omitir na frente (`LanguageProfile.sujeitoOmitivel`) —
 * "Estou ansioso para o fim de semana" vira "Eu estou…" e "Nós estou…".
 *
 * Existe porque o feixe do tradutor não garante esse par: para "I'm looking
 * forward to the weekend" o MADLAD só variava gênero e preposição, e o aluno
 * que escreveu "Eu estou ansioso para o fim de semana" recebia "quase" (o caso
 * do dono do repositório). Qual pronome é o certo, o kernel não sabe — quem
 * decide é a ida e volta do servidor: "Nós estou…" volta como "We're…" e cai.
 *
 * Nada a propor quando alguma resposta aceita já começa com um desses
 * pronomes: aí a correção já aceita com e sem ele (`tolerantScore`).
 */
export function candidatasComSujeito(
	principal: string,
	profile: LanguageProfile,
	aceitas: string[] = []
): string[] {
	const lista = profile.sujeitoOmitivel?.pronomes ?? [];
	const texto = principal.trim();
	const chave = (t: string) => normalize(t, profile).trim();
	if (lista.length === 0 || tokenize(chave(texto), profile).length === 0) return [];
	if ([texto, ...aceitas].some((a) => sujeitoNoInicio(chave(a), profile) !== null)) return [];

	const resto = texto.charAt(0).toLocaleLowerCase(profile.tag) + texto.slice(1);
	return lista.map((p) => `${p.charAt(0).toLocaleUpperCase(profile.tag)}${p.slice(1)} ${resto}`);
}
