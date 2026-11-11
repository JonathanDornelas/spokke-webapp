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
export const MAX_VARIANTES = 3;

/**
 * Dice sobre as palavras (`wordSimilarity`). Entram "Onde está a estação de
 * trem?" contra "Onde fica a estação de trem?" (0,83), "Não gosto de café"
 * contra "Eu não gosto de café" (0,89) e "Eu geralmente acordo às sete da manhã"
 * contra "Eu costumo acordar às sete da manhã" (0,71). Fica de fora "O relatório
 * já foi concluído" contra "Eles já terminaram o relatório" (0,60): a frase
 * virou outra, ainda que diga o mesmo.
 *
 * Esta régua mede o TAMANHO da diferença, não o sentido. Quem confere o sentido
 * é o servidor, traduzindo cada variante de volta (`server/atividades/
 * variantes-aceitas.ts`) — "Eu adoro ler" passa aqui contra "Eu gosto muito de
 * ler" (0,71) e cai lá.
 */
const LIMIAR = 0.7;

/** Palavras a mais ou a menos que uma variante pode ter. */
const MAX_PALAVRAS_DE_DIFERENCA = 2;

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
	const palavrasDaBase = tokenize(base, profile).length;

	const vistas = new Set([base, ...jaAceitas.map(chave)]);
	const saida: string[] = [];
	for (const candidata of candidatas) {
		if (saida.length >= max) break;
		const texto = candidata.trim();
		const n = chave(texto);
		if (!n || vistas.has(n)) continue;
		vistas.add(n);
		const palavras = tokenize(n, profile).length;
		if (Math.abs(palavras - palavrasDaBase) > MAX_PALAVRAS_DE_DIFERENCA) continue;
		if (wordSimilarity(texto, principal, profile) < LIMIAR) continue;
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
