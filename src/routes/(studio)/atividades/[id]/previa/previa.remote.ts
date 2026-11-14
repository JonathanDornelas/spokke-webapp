import { z } from 'zod';
import { error } from '@sveltejs/kit';
import { command, getRequestEvent } from '$app/server';
import { requireTeacher } from '$lib/server/auth/guard';
import { corrigirNaPrevia, versaoDaPrevia } from '$lib/server/atividades/previa';

/**
 * A correção da PRÉVIA DO ALUNO: o veredito que o aluno receberia, pelo mesmo
 * kernel e com a mesma seed da tela, sem gravar nada. A fala vai pelo endpoint
 * `previa/fala` (sobe binário). Atrás da sessão do professor dono da atividade —
 * toda remote function é endpoint público (regra nº 3).
 */
export const corrigirResposta = command(
	z.object({ activityId: z.string(), itemId: z.string(), resposta: z.unknown() }),
	async ({ activityId, itemId, resposta }) => {
		const teacher = requireTeacher(getRequestEvent().locals);
		const versao = await versaoDaPrevia(teacher, activityId);
		if (!versao) error(404, 'Atividade não encontrada');
		const linha = versao.linhas.find((l) => l.id === itemId);
		if (!linha) error(404, 'Questão não encontrada nesta atividade');
		const resultado = await corrigirNaPrevia(versao, linha, resposta);
		if (!resultado.ok) error(400, resultado.erro);
		return resultado.correcao;
	}
);
