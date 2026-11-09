import type { Programacao } from './programacao';

/**
 * O ESTADO de uma turma alocada a um módulo, dito do mesmo jeito em três telas:
 * a listagem de módulos, o detalhe do módulo e a turma
 * (docs/telas-modulos-professor.md 2.3). Puro e isomórfico.
 *
 * "Com envio que não saiu" vence os outros: é o único que pede ação, e o único
 * em vermelho.
 */
export type EstadoDaAlocacao = 'sem' | 'ativa' | 'pausada' | 'concluida' | 'falha';

export type EnvioResumido = {
	activityId: string;
	status: 'programada' | 'enviada' | 'nao_saiu' | 'pulada';
	dueAt: Date;
	reason: 'rascunho' | 'arquivada' | 'audio' | null;
	sentAt: Date | null;
};

export function estadoDaAlocacao(a: {
	programacao: Programacao | null;
	pausedAt: Date | null;
	envios: EnvioResumido[];
}): EstadoDaAlocacao {
	if (!a.programacao && a.envios.length === 0) return 'sem';
	if (a.envios.some((e) => e.status === 'nao_saiu')) return 'falha';
	if (a.pausedAt) return 'pausada';
	if (!a.envios.some((e) => e.status === 'programada')) return 'concluida';
	return 'ativa';
}

/**
 * O estado do MÓDULO: o que mais pede atenção entre as turmas dele. O envio que
 * não saiu (o único vermelho) vence tudo; "parado" é o módulo com turma e nada
 * marcado, "sem" é o que ainda não tem turma. A lista de módulos e o início
 * dizem o mesmo estado com esta função.
 */
export type EstadoDoModulo = 'erro' | 'ativo' | 'pausa' | 'fim' | 'parado' | 'sem';

export function estadoDoModulo(turmas: EstadoDaAlocacao[]): EstadoDoModulo {
	if (turmas.length === 0) return 'sem';
	if (turmas.includes('falha')) return 'erro';
	if (turmas.includes('ativa')) return 'ativo';
	if (turmas.includes('pausada')) return 'pausa';
	if (turmas.every((e) => e === 'concluida')) return 'fim';
	return 'parado';
}

/** O próximo envio programado (o mais cedo), ou `null`. */
export function proximoEnvio(envios: EnvioResumido[]): EnvioResumido | null {
	let prox: EnvioResumido | null = null;
	for (const e of envios) {
		if (e.status !== 'programada') continue;
		if (!prox || e.dueAt < prox.dueAt) prox = e;
	}
	return prox;
}

/** "3 de 8 enviadas": o total é o que está marcado para ESTA turma. */
export function contagemDeEnvios(
	programacao: Programacao | null,
	envios: EnvioResumido[],
	atividadesDoModulo: string[]
): { enviadas: number; total: number } {
	const fora = new Set(programacao?.fora ?? []);
	return {
		enviadas: envios.filter((e) => e.status === 'enviada').length,
		total: atividadesDoModulo.filter((id) => !fora.has(id)).length
	};
}

/** A data no formato da prévia ("qui 15/10"), a partir de um instante, em Brasília. */
export function rotuloDoInstante(d: Date): string {
	const partes = new Intl.DateTimeFormat('pt-BR', {
		timeZone: 'America/Sao_Paulo',
		weekday: 'short',
		day: '2-digit',
		month: '2-digit'
	}).formatToParts(d);
	const pega = (t: string) => partes.find((p) => p.type === t)?.value ?? '';
	return `${pega('weekday').replace('.', '')} ${pega('day')}/${pega('month')}`;
}

/** O texto do motivo, para a linha que não saiu. */
export const TEXTO_DO_MOTIVO: Record<'rascunho' | 'arquivada' | 'audio', string> = {
	rascunho: 'ainda é rascunho',
	arquivada: 'foi arquivada',
	audio: 'o áudio ainda está sendo gerado'
};

/**
 * A pílula de cada estado — texto, classes e ícone (traço de 24px). Strings
 * INTEIRAS e literais, como em `$lib/etiquetas.ts`: o Tailwind só gera CSS para
 * classe que aparece completa no código-fonte. Vermelho só em "não liberada".
 */
export const PILULA_DO_ESTADO: Record<
	EstadoDaAlocacao,
	{ texto: string; curto: string; classe: string; icone: string }
> = {
	ativa: {
		texto: 'Ativa',
		curto: 'Ativa',
		classe: 'bg-base-300 text-primary',
		icone: 'M7 5v14l11-7z'
	},
	pausada: {
		texto: 'Pausada',
		curto: 'Pausada',
		classe: 'border border-line bg-base-200 text-base-content/70',
		icone: 'M9 6v12M15 6v12'
	},
	concluida: {
		texto: 'Concluída',
		curto: 'Concluída',
		classe: 'border border-line bg-base-200 text-base-content/70',
		icone: 'M5 12.5l4.5 4.5L19 7'
	},
	sem: {
		texto: 'Sem programação',
		curto: 'Sem programação',
		classe: 'border-[1.5px] border-dashed border-line text-base-content/70',
		icone: 'M6 12h12'
	},
	falha: {
		texto: 'Não liberada',
		curto: 'Não liberada',
		classe: 'bg-error text-error-content',
		icone: 'M12 7.5v6M12 16.5h.01M12 3l9.5 17H2.5z'
	}
};
