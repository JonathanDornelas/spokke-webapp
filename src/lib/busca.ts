/**
 * Busca de TELA: sem caixa e sem acento, para "intermediario" achar
 * "Intermediário" e "joao" achar "João".
 *
 * Não é a régua da correção (essa é o normalizador do kernel, por idioma — regra
 * nº 6): aqui o professor procura uma turma, um aluno ou uma atividade na lista
 * dele, e a dobra de acento é a do português de quem digita.
 */
export function paraBusca(texto: string): string {
	return texto.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR').trim();
}

/** O termo casa com o texto? Termo vazio casa com tudo. */
export function casaComBusca(texto: string, termo: string): boolean {
	const q = paraBusca(termo);
	return !q || paraBusca(texto).includes(q);
}
