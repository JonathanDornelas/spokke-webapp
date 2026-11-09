import { limpar } from './semente.ts';
import { prisma } from '../src/lib/server/db/client.ts';

/** Tira do banco tudo o que a rodada criou, inclusive as tentativas dos cenários. */
export default async function globalTeardown(): Promise<void> {
	const rodada = process.env.E2E_RODADA;
	if (rodada) await limpar(rodada);
	await prisma.$disconnect();
}
