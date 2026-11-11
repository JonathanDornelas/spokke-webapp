import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import type { RequestHandler } from './$types';

/**
 * "Nova turma" deixou de ser uma página: é a bandeja da lista de turmas
 * (paginas.md "Turmas e alunos"). Este endereço só existe para link antigo e
 * favorito não quebrarem — `?modo=lote` continua abrindo já no "Colar uma lista".
 */
export const GET: RequestHandler = ({ url }) => {
	const lote = url.searchParams.get('modo') === 'lote';
	redirect(307, `${resolve('/(studio)/turmas')}?nova=${lote ? 'lote' : '1'}`);
};
