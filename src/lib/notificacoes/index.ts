import { z } from 'zod';

/**
 * As notificações do sino do Studio — o QUE existe e como cada uma se escreve.
 * Isomórfico e puro: o servidor valida o `data` gravado com estes schemas, e a
 * tela recebe o texto já montado (docs/notificacoes.md).
 *
 * **Só entra o que pede uma ação do professor ou o desfecho de algo que ele
 * começou e não está olhando.** Tentativa terminada, e-mail que saiu, liberação
 * que aconteceu na data: tudo isso ele vê abrindo a tela, e avisar seria ensinar
 * a ignorar o sino.
 */

const nomes = z.array(z.string()).max(5);

export const DADOS = {
	/** Resposta de escrita (rubrica) esperando a nota dele. */
	correcao: z.object({ activityId: z.string(), titulo: z.string() }),
	/** A liberação de um módulo que não aconteceu na data. */
	liberacao: z.object({
		moduleId: z.string(),
		allocationId: z.string(),
		modulo: z.string(),
		turma: z.string(),
		atividade: z.string(),
		motivo: z.enum(['rascunho', 'audio', 'arquivada'])
	}),
	/** O áudio de uma atividade que a fila desistiu de gerar. */
	audio: z.object({ activityId: z.string(), titulo: z.string() }),
	/** Aluno da chamada que ligou a conta à turma. */
	'aluno-entrou': z.object({ classroomId: z.string(), turma: z.string(), nomes }),
	/** O que a equipe fez na assinatura dele (sem gateway, é o painel interno). */
	plano: z.object({
		evento: z.enum(['ativado', 'trial', 'cancelado', 'creditos']),
		plano: z.string().nullable(),
		ate: z.string().nullable(),
		creditos: z.number().int().nullable()
	}),
	/** Professor que aceitou o convite da escola — para a coordenação. */
	escola: z.object({ escola: z.string(), nomes }),
	/** O teste grátis perto do fim. */
	'trial-acabando': z.object({ ate: z.string() })
} as const;

export type TipoDeNotificacao = keyof typeof DADOS;
export type DadosDe<T extends TipoDeNotificacao> = z.infer<(typeof DADOS)[T]>;

export const TIPOS = Object.keys(DADOS) as TipoDeNotificacao[];

export function ehTipo(kind: string): kind is TipoDeNotificacao {
	return kind in DADOS;
}

/**
 * Para onde a notificação leva. A tela resolve a rota (`resolve()` de
 * `$app/paths`); aqui fica só o destino, sem montar endereço à mão.
 */
export type Destino =
	| { rota: 'resultados'; activityId: string }
	| { rota: 'modulo'; moduleId: string; allocationId: string }
	| { rota: 'atividade'; activityId: string }
	| { rota: 'turma'; classroomId: string }
	| { rota: 'assinatura' }
	| { rota: 'escola' }
	| { rota: 'planos' };

export interface NotificacaoNaTela {
	id: string;
	titulo: string;
	detalhe: string | null;
	destino: Destino;
	/** `acao` pede que ele faça algo; `info` conta um desfecho. */
	tom: 'acao' | 'info';
	lida: boolean;
	/** ISO — a tela diz "há 2 h". */
	quando: string;
}

/** "Ana", "Ana e Bruno", "Ana e mais 3". `nomes` vem do mais recente para o mais antigo. */
function quem(lista: string[], total: number): string {
	const [primeiro, segundo] = lista;
	if (!primeiro) return total === 1 ? 'Um aluno' : `${total} alunos`;
	if (total <= 1) return primeiro;
	if (total === 2 && segundo) return `${primeiro} e ${segundo}`;
	return `${primeiro} e mais ${total - 1}`;
}

function dataCurta(iso: string): string {
	return new Date(iso).toLocaleDateString('pt-BR', {
		day: 'numeric',
		month: 'long',
		timeZone: 'America/Sao_Paulo'
	});
}

/** Dias inteiros de Brasília entre hoje e a data — 0 é hoje. */
export function diasAte(iso: string, agora: Date = new Date()): number {
	const dia = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
	const alvo = Date.parse(`${dia(new Date(iso))}T00:00:00Z`);
	const hoje = Date.parse(`${dia(agora)}T00:00:00Z`);
	return Math.round((alvo - hoje) / 86_400_000);
}

const MOTIVO_DA_LIBERACAO: Record<DadosDe<'liberacao'>['motivo'], string> = {
	rascunho: 'Ela ainda é rascunho. Publique e ela sai na próxima tentativa.',
	audio: 'O áudio não ficou pronto. Abra a programação para tentar de novo.',
	arquivada: 'Ela está arquivada. Desarquive ou tire-a do módulo.'
};

/**
 * O texto de uma notificação. Recebe o `data` JÁ validado e a contagem de
 * eventos agrupados nela.
 */
export function textoDaNotificacao(
	n:
		| { kind: 'correcao'; data: DadosDe<'correcao'>; count: number }
		| { kind: 'liberacao'; data: DadosDe<'liberacao'>; count: number }
		| { kind: 'audio'; data: DadosDe<'audio'>; count: number }
		| { kind: 'aluno-entrou'; data: DadosDe<'aluno-entrou'>; count: number }
		| { kind: 'plano'; data: DadosDe<'plano'>; count: number }
		| { kind: 'escola'; data: DadosDe<'escola'>; count: number }
		| { kind: 'trial-acabando'; data: DadosDe<'trial-acabando'>; count: number },
	agora: Date = new Date()
): Pick<NotificacaoNaTela, 'titulo' | 'detalhe' | 'destino' | 'tom'> {
	switch (n.kind) {
		case 'correcao':
			return {
				titulo: n.count === 1 ? '1 resposta para corrigir' : `${n.count} respostas para corrigir`,
				detalhe: `em ${n.data.titulo}`,
				destino: { rota: 'resultados', activityId: n.data.activityId },
				tom: 'acao'
			};
		case 'liberacao':
			return {
				titulo: `${n.data.atividade} não foi liberada para ${n.data.turma}`,
				detalhe: `${n.data.modulo} · ${MOTIVO_DA_LIBERACAO[n.data.motivo]}`,
				destino: { rota: 'modulo', moduleId: n.data.moduleId, allocationId: n.data.allocationId },
				tom: 'acao'
			};
		case 'audio':
			return {
				titulo: `O áudio de ${n.data.titulo} não foi gerado`,
				detalhe: 'O link não abre enquanto faltar áudio. Use "Gerar áudio de novo" na atividade.',
				destino: { rota: 'atividade', activityId: n.data.activityId },
				tom: 'acao'
			};
		case 'aluno-entrou': {
			const varios = n.count > 1;
			return {
				titulo: `${quem(n.data.nomes, n.count)} ${varios ? 'entraram' : 'entrou'} em ${n.data.turma}`,
				detalhe: varios
					? 'Com a conta ligada, eles veem os módulos da turma no mapa.'
					: 'Com a conta ligada, os módulos da turma aparecem no mapa.',
				destino: { rota: 'turma', classroomId: n.data.classroomId },
				tom: 'info'
			};
		}
		case 'plano': {
			const { evento, plano, ate, creditos } = n.data;
			const titulo =
				evento === 'ativado'
					? plano
						? `Seu plano ${plano} está ativo`
						: 'Seu plano está ativo'
					: evento === 'trial'
						? `Seu teste foi estendido${ate ? ` até ${dataCurta(ate)}` : ''}`
						: evento === 'cancelado'
							? 'Sua assinatura foi cancelada'
							: `Você ganhou ${creditos ?? 0} créditos de IA`;
			const detalhe =
				evento === 'ativado'
					? ate
						? `Vale até ${dataCurta(ate)}.`
						: null
					: evento === 'cancelado'
						? 'Os links publicados continuam no ar.'
						: evento === 'creditos'
							? 'Valem neste ciclo da assinatura.'
							: null;
			return { titulo, detalhe, destino: { rota: 'assinatura' }, tom: 'info' };
		}
		case 'escola': {
			const varios = n.count > 1;
			return {
				titulo: `${quem(n.data.nomes, n.count)} ${varios ? 'entraram' : 'entrou'} na escola`,
				detalhe: n.data.escola,
				destino: { rota: 'escola' },
				tom: 'info'
			};
		}
		case 'trial-acabando': {
			const dias = diasAte(n.data.ate, agora);
			return {
				titulo:
					dias <= 0
						? 'Seu teste termina hoje'
						: dias === 1
							? 'Seu teste termina amanhã'
							: `Seu teste termina em ${dias} dias`,
				detalhe: 'Depois disso, criar e publicar ficam pausados. Os links continuam no ar.',
				destino: { rota: 'planos' },
				tom: 'acao'
			};
		}
	}
}

/**
 * Junta os nomes de um evento novo aos de uma notificação agrupada: o mais
 * recente primeiro, sem repetir, com teto — a tela mostra dois e a contagem.
 */
export function juntarNomes(antigos: string[], novos: string[]): string[] {
	const lista = [...novos, ...antigos.filter((n) => !novos.includes(n))];
	return lista.slice(0, 5);
}
