import type { PageServerLoad } from './$types';
import { questoesDoExemplo } from '$lib/server/exemplo';

/**
 * A atividade de exemplo inteira, já passada por `toRuntime()`. Sem banco, sem
 * tentativa e sem nome: quem abre está conhecendo o produto, e responder aqui
 * não aparece no relatório de professor nenhum.
 *
 * `logado` decide só o que o botão dos planos faz no fim: sem conta leva ao
 * cadastro, com conta vira pedido (como em `/planos`).
 */
export const load: PageServerLoad = ({ locals }) => ({
	questoes: questoesDoExemplo(),
	logado: !!locals.user
});
