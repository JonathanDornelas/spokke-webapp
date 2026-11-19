import { z } from 'zod';

/**
 * `Publication.settings` é uma coluna `Json` — valide ao ler, sempre
 * (db.md "JSON no Postgres").
 *
 * Mora aqui, e não no `.remote.ts` do Player, porque um arquivo de remote
 * functions só pode exportar remote functions: qualquer outro export vira
 * erro de build no SvelteKit.
 */
export const publicationSettingsSchema = z.object({
	requireCode: z.boolean().default(false),
	code: z.string().nullable().default(null),
	showResult: z.boolean().default(true),
	/**
	 * O aluno pode responder de novo, quantas vezes quiser. Fica a ÚLTIMA
	 * entrega: a anterior sai quando a nova é entregue, com as gravações de fala
	 * (`server/player/refazer.ts`). Desligado (o padrão, e o de toda publicação
	 * anterior a isto), quem já entregou vê o resultado e "fale com seu professor".
	 */
	allowRetake: z.boolean().default(false)
});

export type PublicationSettings = z.infer<typeof publicationSettingsSchema>;
