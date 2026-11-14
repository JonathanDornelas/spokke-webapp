/**
 * O desenho comum das LISTAS do Studio — atividades, materiais e turmas
 * (components.md "Listas do Studio"). Cada lista tem as suas colunas, mas os
 * blocos que elas têm em comum ficam no mesmo lugar e com as mesmas medidas:
 * cabeçalho com a ação de criar, a barra de busca e filtros, os chips de
 * situação, a barra do que está marcado, a tabela (cartões no celular), o
 * vazio do filtro e a paginação.
 *
 * Aqui ficam as classes que as telas repetem e a conta da seleção.
 */

/** O botão de criar, na ponta do cabeçalho ("Nova atividade", "Novo material"…). */
export const BOTAO_NOVO =
	'btn h-11 min-h-11 w-full motion-tap gap-2 btn-primary px-[18px] text-[14.5px] font-bold no-underline sm:w-auto';
export const ICONE_MAIS = 'M12 5v14M5 12h14';

/** Os selects da barra de filtros — a mesma altura do campo de busca. */
/** No celular eles dividem a linha (`flex-1`) em vez de cada um quebrar para a sua. */
export const SELECT_DA_LISTA = 'select h-10 min-h-10 w-auto flex-1 py-0 text-[13px] sm:flex-none';

/**
 * A tabela. Sem `overflow-hidden` de propósito: o menu "⋯" de uma linha abre
 * para fora dela, e o recorte o cortaria. Quem arredonda os cantos são o
 * cabeçalho e a última linha.
 */
export const TABELA = 'rounded-[14px] border border-line';
export const CABECALHO_DA_TABELA =
	'gap-4 rounded-t-[13px] border-b border-line bg-base-200 px-5 py-[11px] text-[11px] font-bold tracking-[0.09em] text-base-content/65 uppercase';
export const LINHA_DA_TABELA =
	'relative items-center gap-4 border-b border-line px-5 py-[13px] text-sm transition-colors last:rounded-b-[13px] last:border-0 hover:bg-base-200';
/** O cartão do celular. */
export const CARTAO_DA_LISTA = 'relative rounded-[14px] border border-line p-4';

/**
 * O link do TÍTULO cobre a linha inteira (`::after`): a linha toda abre o item,
 * e a caixa de marcar e o menu ficam por cima (`relative z-2`). Âncora não pode
 * conter controle — por isso o link é o título, não a linha.
 */
export const LINK_DA_LINHA = 'no-underline after:absolute after:inset-0 after:content-[""]';
export const POR_CIMA_DO_LINK = 'relative z-2';

/** Itens por página — o mesmo número nas três listas. */
export const POR_PAGINA = 10;

/** Marca ou desmarca um id. */
export function alternar(marcados: string[], id: string): string[] {
	return marcados.includes(id) ? marcados.filter((x) => x !== id) : [...marcados, id];
}

/**
 * A caixa de "marcar todos" da página: marcada quando todos os visíveis estão,
 * indeterminada quando só alguns. Clicar marca os da página que faltam, ou
 * desmarca os da página — os marcados de outras páginas continuam.
 */
export function estadoDaPagina(
	marcados: string[],
	daPagina: string[]
): { todos: boolean; alguns: boolean } {
	const nela = daPagina.filter((id) => marcados.includes(id)).length;
	return {
		todos: daPagina.length > 0 && nela === daPagina.length,
		alguns: nela > 0 && nela < daPagina.length
	};
}

export function alternarPagina(marcados: string[], daPagina: string[]): string[] {
	const { todos } = estadoDaPagina(marcados, daPagina);
	if (todos) return marcados.filter((id) => !daPagina.includes(id));
	return [...marcados, ...daPagina.filter((id) => !marcados.includes(id))];
}

/**
 * `indeterminate` é propriedade do elemento, não atributo do HTML: sem esta
 * ação a caixa de "marcar todos" nunca mostrava o traço de "alguns marcados".
 */
export function indeterminado(no: HTMLInputElement, valor: boolean) {
	no.indeterminate = valor;
	return {
		update(novo: boolean) {
			no.indeterminate = novo;
		}
	};
}

/** Só os marcados que ainda existem na lista (o que saiu depois de apagar não fica marcado). */
export function aindaNaLista(marcados: string[], ids: string[]): string[] {
	return marcados.filter((id) => ids.includes(id));
}
