import { describe, expect, it } from 'vitest';
import { aindaNaLista, alternar, alternarPagina, estadoDaPagina } from './lista';

// A seleção das listas do Studio (components.md "Listas do Studio"): a caixa de
// "marcar todos" vale para a PÁGINA, e não mexe no que está marcado nas outras.
describe('seleção da lista', () => {
	it('marca e desmarca um item', () => {
		expect(alternar([], 'a')).toEqual(['a']);
		expect(alternar(['a', 'b'], 'a')).toEqual(['b']);
	});

	it('diz se a página está toda, parte ou nada marcada', () => {
		expect(estadoDaPagina([], ['a', 'b'])).toEqual({ todos: false, alguns: false });
		expect(estadoDaPagina(['a'], ['a', 'b'])).toEqual({ todos: false, alguns: true });
		expect(estadoDaPagina(['a', 'b', 'z'], ['a', 'b'])).toEqual({ todos: true, alguns: false });
		// Página vazia nunca aparece como "toda marcada".
		expect(estadoDaPagina(['z'], [])).toEqual({ todos: false, alguns: false });
	});

	it('marcar a página completa o que falta e mantém as outras páginas', () => {
		expect(alternarPagina(['z', 'a'], ['a', 'b'])).toEqual(['z', 'a', 'b']);
	});

	it('com a página toda marcada, desmarca só ela', () => {
		expect(alternarPagina(['z', 'a', 'b'], ['a', 'b'])).toEqual(['z']);
	});

	it('o que saiu da lista sai da seleção', () => {
		expect(aindaNaLista(['a', 'b'], ['b', 'c'])).toEqual(['b']);
	});
});
