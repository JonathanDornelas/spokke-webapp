import { semear } from './semente.ts';

/**
 * Semeia antes dos cenários. Os slugs vão por variável de ambiente: o processo
 * principal do Playwright roda isto antes de abrir os workers, e eles herdam o
 * ambiente.
 */
export default async function globalSetup(): Promise<void> {
	const rodada = String(Date.now());
	const { comResultado, semResultado } = await semear(rodada);
	process.env.E2E_RODADA = rodada;
	process.env.E2E_SLUG_COM_RESULTADO = comResultado;
	process.env.E2E_SLUG_SEM_RESULTADO = semResultado;
}
