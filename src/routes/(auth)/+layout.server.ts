import type { LayoutServerLoad } from './$types';
import { googleLigado } from '$lib/server/auth/google';

// Entrar, criar conta e recuperar a senha. Só um dado: se o login com o Google
// está ligado (as duas chaves no ambiente) — sem ele as telas não mostram o
// botão, em vez de um botão que leva a um erro.
export const load: LayoutServerLoad = () => ({ google: googleLigado() });
