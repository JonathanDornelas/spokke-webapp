/**
 * As cores de ETIQUETA — de turma e de módulo. Isomórfico: o servidor valida
 * contra a lista e a tela desenha com as classes.
 *
 * Azul, teal, violeta, magenta e ardósia. **Verde e âmbar ficam fora**: são a
 * semântica de correção (design-system.md) e não podem virar etiqueta — uma
 * turma "verde" leria como "acertou".
 *
 * **Azul é a cor da marca e vem primeiro**: é a etiqueta com que turma e módulo
 * nascem. Violeta foi a marca até a troca para #3659CB e ficou como uma cor de
 * etiqueta entre as outras, com token próprio (`--color-violeta`) — senão ela
 * passaria a ser um segundo azul ao lado do azul.
 *
 * As classes são strings INTEIRAS e literais: o Tailwind só gera CSS para
 * classe que aparece completa no código-fonte.
 */
export const CORES_DE_ETIQUETA = ['azul', 'teal', 'violeta', 'magenta', 'ardosia'] as const;
export type CorDeEtiqueta = (typeof CORES_DE_ETIQUETA)[number];

/** A etiqueta de turma e módulo novos. */
export const COR_PADRAO: CorDeEtiqueta = 'azul';

/** A etiqueta (fundo suave + texto) — o selo da turma ou do módulo. */
export const CLASSE_DA_ETIQUETA: Record<CorDeEtiqueta, string> = {
	azul: 'bg-base-300 text-primary',
	teal: 'bg-accent/16 text-accent',
	violeta: 'bg-violeta/14 text-violeta',
	magenta: 'bg-[color-mix(in_oklab,var(--color-violeta)_12%,var(--color-error)_10%)] text-violeta',
	ardosia: 'bg-base-300 text-base-content/70'
};

/** O nome da cor, para o `aria-label` e o `title` do seletor — a cor sozinha não se anuncia. */
export const NOME_DA_COR: Record<CorDeEtiqueta, string> = {
	azul: 'Azul',
	teal: 'Teal',
	violeta: 'Violeta',
	magenta: 'Magenta',
	ardosia: 'Ardósia'
};

/** O chip cheio do seletor de cor. */
export const CLASSE_DO_CHIP: Record<CorDeEtiqueta, string> = {
	azul: 'bg-primary',
	teal: 'bg-accent',
	violeta: 'bg-violeta',
	magenta: 'bg-[color-mix(in_oklab,var(--color-violeta)_60%,var(--color-error))]',
	ardosia: 'bg-base-content/45'
};

export function ehCorDeEtiqueta(valor: unknown): valor is CorDeEtiqueta {
	return typeof valor === 'string' && (CORES_DE_ETIQUETA as readonly string[]).includes(valor);
}

/** Cor gravada que não está mais na paleta cai na padrão, em vez de quebrar a tela. */
export function corOuPadrao(valor: unknown): CorDeEtiqueta {
	return ehCorDeEtiqueta(valor) ? valor : COR_PADRAO;
}

/**
 * As iniciais viram a etiqueta da turma (e do módulo): "7º B — inglês" → "7B".
 * O indicador ordinal (º/ª) sai fora: para o Unicode ele é letra, e "7º" não
 * distingue uma turma de outra. Isomórfico: a lista no servidor e o painel de
 * programação no navegador desenham a mesma sigla.
 */
export function etiquetaDaTurma(nome: string): string {
	const letras = nome.replace(/[^\p{L}\p{N}]|[ºª°]/gu, '');
	return letras.slice(0, 2).toUpperCase() || '?';
}
