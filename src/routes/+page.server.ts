import type { PageServerLoad } from './$types';
import { QUESTOES_DA_HOME, questoesDoExemplo } from '$lib/server/exemplo';

/**
 * As quatro questões do celular do hero. São as da atividade de exemplo
 * (`/exemplo`), já passadas por `toRuntime()`: o visitante responde de verdade
 * e a correção é a do servidor, sem gabarito no browser (regra inviolável nº 1).
 */
export const load: PageServerLoad = () => ({ exemplo: questoesDoExemplo(QUESTOES_DA_HOME) });
