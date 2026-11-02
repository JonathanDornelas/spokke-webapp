import { z } from 'zod';
import { error } from '@sveltejs/kit';
import { command, getRequestEvent } from '$app/server';
import { corrigirNoExemplo } from '$lib/server/exemplo';
import { criarLimite } from '$lib/server/limite-por-ip';

/**
 * A correção da atividade de exemplo (`/exemplo` e o celular da home).
 *
 * Sem sessão, como o Player — e aqui nem `attemptId` existe: a função não lê
 * nem grava dado de ninguém, só corrige uma resposta contra itens fixos que
 * moram no servidor (`$lib/server/exemplo`). É endpoint público (regra nº 3)
 * por desenho, não por descuido.
 *
 * O limite por IP não protege dado nenhum, protege o processo: corrigir é
 * barato, mas é CPU do mesmo servidor que atende os alunos de verdade.
 */
const limite = criarLimite({ maximo: 120, janelaMs: 10 * 60 * 1000 });

export const corrigirExemplo = command(
	z.object({ itemId: z.string().max(40), answer: z.unknown() }),
	async ({ itemId, answer }) => {
		if (!limite.permitir(getRequestEvent().getClientAddress())) {
			error(429, 'Muitas respostas em pouco tempo. Espere um minuto e tente de novo.');
		}
		const correcao = await corrigirNoExemplo(itemId, answer);
		if (!correcao.ok) error(400, correcao.erro);
		return correcao.veredito;
	}
);
