import { z } from 'zod';
import { command, getRequestEvent } from '$app/server';
import { requireTeacher } from '$lib/server/auth/guard';
import { ehIdioma } from '$lib/idiomas';
import { criarLimite } from '$lib/server/limite-por-ip';
import { TraducaoIndisponivel, getTradutor } from '$lib/server/traducao';

/**
 * A tradução SUGERIDA enquanto o professor digita, no formulário de material
 * (biblioteca e etapa 2 do wizard — os dois usam esta função).
 *
 * **Não grava nada.** É só o texto traduzido, para o campo da tradução vir
 * preenchido e o professor conferir antes de salvar. Quem grava continua sendo
 * a remote function do formulário, que também traduz o que chegar em branco —
 * então esta aqui pode falhar à vontade: o professor escreve, ou salva e a
 * tradução sai do servidor.
 *
 * **Toda remote function é um endpoint público** (regra nº 3): guard de sessão
 * primeiro, e um teto por professor — cada chamada é CPU do serviço de áudio,
 * o mesmo que transcreve a fala dos alunos.
 */

const idioma = z.string().refine(ehIdioma, 'Idioma inválido.');

/** Uma sugestão por pausa na digitação; 120 em 10 minutos é folga para digitar uma lista inteira. */
const limite = criarLimite({ maximo: 120, janelaMs: 10 * 60_000 });

export const sugerirTraducao = command(
	z.object({ texto: z.string().trim().min(1).max(500), de: idioma, para: idioma }),
	async ({ texto, de, para }) => {
		const teacher = requireTeacher(getRequestEvent().locals);
		const tradutor = getTradutor();
		if (!tradutor) return { ok: false as const, motivo: 'desligado' as const };
		if (!limite.permitir(teacher.id)) return { ok: false as const, motivo: 'limite' as const };
		try {
			const [traducao] = await tradutor.traduzir([texto], de, para);
			return traducao?.trim()
				? { ok: true as const, traducao: traducao.trim() }
				: { ok: false as const, motivo: 'vazio' as const };
		} catch (erro) {
			if (erro instanceof TraducaoIndisponivel) {
				return { ok: false as const, motivo: 'indisponivel' as const };
			}
			throw erro;
		}
	}
);
