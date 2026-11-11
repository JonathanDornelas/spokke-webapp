/**
 * O vocabulário do RELATO DE PROBLEMA ("Relatar problema", no Player) — o que a
 * tela oferece como motivo e o nome de cada um, iguais no navegador, no
 * servidor, no e-mail para a equipe e na intranet. Isomórfico.
 */

export const MOTIVOS = ['correcao', 'texto', 'audio', 'microfone', 'travou', 'outro'] as const;
export type Motivo = (typeof MOTIVOS)[number];

/** Como o ALUNO lê o motivo, na tela de relatar. */
export const MOTIVO_NA_TELA: Record<Motivo, string> = {
	correcao: 'Minha resposta estava certa e foi marcada como errada',
	texto: 'A questão tem um erro (uma palavra, a tradução, a frase)',
	audio: 'O áudio não toca ou está estranho',
	microfone: 'O microfone não funcionou',
	travou: 'A tela travou ou um botão não respondeu',
	outro: 'Outra coisa'
};

/** Como a EQUIPE lê o motivo, no e-mail e na intranet. */
export const MOTIVO_CURTO: Record<Motivo, string> = {
	correcao: 'Certa marcada como errada',
	texto: 'Erro no texto da questão',
	audio: 'Problema no áudio',
	microfone: 'Microfone',
	travou: 'Tela travou',
	outro: 'Outra coisa'
};

/** O código curto que o aluno vê ao mandar, e que a equipe acha na intranet. */
export function codigoDoRelato(id: string): string {
	return `R-${id.slice(-6).toUpperCase()}`;
}
