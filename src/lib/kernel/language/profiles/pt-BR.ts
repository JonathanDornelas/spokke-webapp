import type { LanguageProfile } from '../profile';
import { acentosPortugues } from '../teclados';
import { numerais } from '../equivalences';

/**
 * Português brasileiro — idioma de origem mais comum do produto hoje.
 * Acento é significativo (regra padrão de ortografia), então `diacritics`
 * fica `significant`: "e" não é aceito como "é".
 */
export const ptBR: LanguageProfile = {
	tag: 'pt-BR',
	direction: 'ltr',
	segmentation: 'icu-word',
	normalizers: ['nfkc', 'lowercase', 'strip-punct'],
	diacritics: 'significant',
	caseSensitive: false,
	tts: { voices: ['pf_dora', 'pm_alex', 'pm_santa'], speeds: [1, 0.75] },
	asr: { model: 'pt-BR', hints: [] },
	input: { modo: 'acentos', teclado: acentosPortugues },
	equivalences: [
		...numerais(
			[
				'zero',
				'um|uma',
				'dois|duas',
				'três',
				'quatro',
				'cinco',
				'seis',
				'sete',
				'oito',
				'nove',
				'dez',
				'onze',
				'doze',
				'treze',
				'catorze|quatorze',
				'quinze',
				'dezesseis',
				'dezessete',
				'dezoito',
				'dezenove'
			],
			['vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'],
			(dezena, unidade) => [`${dezena} e ${unidade}`],
			[['100', 'cem']]
		),
		// O futuro do presente e o futuro perifrástico dizem a mesma coisa: "irá
		// trabalhar" é "vai trabalhar". O aluno que traduz com um não pode receber
		// "quase" porque o professor escreveu o outro.
		['vou', 'irei'],
		['vai', 'irá'],
		['vais', 'irás'],
		['vamos', 'iremos'],
		['vão', 'irão'],
		// "pra" é o que o ASR escreve quando se fala "para".
		['para', 'pra'],
		...artigoAntesDoPossessivo()
	],
	// "Estou ansioso" e "Eu estou ansioso" são a mesma frase (o caso que o dono do
	// repositório relatou). Ver `LanguageProfile.sujeitoOmitivel`.
	sujeitoOmitivel: { pronomes: ['eu', 'nós'], conjuncoes: ['e', 'ou', 'nem'] }
};

/**
 * Em português o artigo antes do possessivo é OPCIONAL: "nunca desista de seus
 * sonhos" e "nunca desista dos seus sonhos" são a mesma frase, e o aluno que
 * escreveu uma recebia "quase" porque o gabarito tinha a outra (o caso que o
 * dono do repositório relatou, com a tradução automática do material).
 *
 * Três formas por possessivo, todas para a forma SEM artigo:
 * - com "de": "dos seus" → "de seus";
 * - com "em": "no seu quarto" → "em seu quarto";
 * - solto: "os seus sonhos" → "seus sonhos".
 *
 * O "a" do feminino singular solto ("a sua casa") fica DE FORA de propósito:
 * ali o "a" também pode ser a preposição ("dei o livro a sua irmã"), e
 * apagá-lo aceitaria "dei o livro sua irmã" como certo. Com "de" e "em" a
 * contração não deixa dúvida ("da sua" só pode ser "de" + "a sua").
 */
function artigoAntesDoPossessivo(): string[][] {
	const possessivos = ['meu', 'minha', 'teu', 'tua', 'seu', 'sua', 'nosso', 'nossa'];
	const grupos: string[][] = [];
	for (const singular of possessivos) {
		const feminino = singular.endsWith('a');
		for (const plural of [false, true]) {
			const p = plural ? `${singular}s` : singular;
			const artigo = (feminino ? 'a' : 'o') + (plural ? 's' : '');
			grupos.push([`de ${p}`, `d${artigo} ${p}`]);
			grupos.push([`em ${p}`, `n${artigo} ${p}`]);
			if (artigo !== 'a') grupos.push([p, `${artigo} ${p}`]);
		}
	}
	return grupos;
}
