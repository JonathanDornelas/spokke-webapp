/**
 * O MAPA do módulo, do lado do aluno (docs/telas-modulos-aluno.md). Puro e
 * isomórfico: o servidor monta as fases e a tela só as desenha.
 *
 * "Fase" é palavra SÓ do aluno; o professor vê "atividade".
 */

/**
 * - `done`: terminou ao menos uma tentativa;
 * - `doing`: começou e não terminou;
 * - `open`: a turma recebeu e ele ainda não abriu;
 * - `locked`: ainda não foi enviada para a turma (a programação do professor);
 * - `closed`: arquivada depois de enviada, e ele não começou.
 */
export type EstadoDaFase = 'done' | 'doing' | 'open' | 'locked' | 'closed';

export type Fase = {
	id: string;
	titulo: string;
	nivel: string | null;
	questoes: number;
	estado: EstadoDaFase;
	/** Trancada: "qui 15/10". Nula quando não há data programada. */
	abre: string | null;
	/**
	 * O acerto da MELHOR tentativa terminada, só onde o professor liberou o
	 * resultado. Nulo com o resultado desligado: aí a fase é só "concluída, sem
	 * placar" — estrela ali seria a porta dos fundos do interruptor.
	 */
	acerto: number | null;
	/** Para onde "Começar", "Continuar" ou "Ver o resultado" levam. */
	href: string | null;
};

export type MapaDoModulo = {
	id: string;
	nome: string;
	professor: string;
	turma: string;
	/** "Inglês · A2" — o idioma e o nível mais comum das fases. */
	contexto: string;
	fases: Fase[];
};

/** Estrelas por faixa de acerto: 3 a partir de 90%, 2 a partir de 60%, 1 para concluída. */
export function estrelasDe(acerto: number): 1 | 2 | 3 {
	return acerto >= 90 ? 3 : acerto >= 60 ? 2 : 1;
}

export const comAcao = (e: EstadoDaFase) => e === 'done' || e === 'doing' || e === 'open';

/**
 * Onde o avatar fica: a primeira fase liberada que ele não terminou. Devolve a
 * POSIÇÃO no caminho, em que 0 é a largada e `fases.length + 1` é o castelo —
 * em dia, ele fica depois da última concluída, esperando a próxima abrir.
 */
export function posicaoDoAvatar(fases: Fase[]): number {
	const atual = fases.findIndex((f) => f.estado === 'doing' || f.estado === 'open');
	if (atual >= 0) return atual + 1;
	if (fases.every((f) => f.estado === 'done' || f.estado === 'closed')) return fases.length + 1;
	const trancada = fases.findIndex((f) => f.estado === 'locked');
	let ultima = -1;
	for (let i = 0; i < trancada; i++) if (fases[i].estado === 'done') ultima = i;
	return ultima + 1;
}

/** O resumo do cartão no painel e o aviso do mapa. */
export function resumoDoMapa(fases: Fase[]): {
	concluidas: number;
	total: number;
	/** A próxima coisa a fazer, ou a data em que a próxima abre. */
	proxima:
		| { tipo: 'jogar'; fase: Fase }
		| { tipo: 'esperar'; abre: string | null }
		| { tipo: 'fim' }
		| { tipo: 'vazio'; abre: string | null };
} {
	const concluidas = fases.filter((f) => f.estado === 'done').length;
	const jogar = fases.find((f) => f.estado === 'doing') ?? fases.find((f) => f.estado === 'open');
	const trancada = fases.find((f) => f.estado === 'locked');
	const proxima = jogar
		? { tipo: 'jogar' as const, fase: jogar }
		: fases.length > 0 && fases.every((f) => f.estado === 'locked')
			? { tipo: 'vazio' as const, abre: trancada?.abre ?? null }
			: trancada
				? { tipo: 'esperar' as const, abre: trancada.abre }
				: { tipo: 'fim' as const };
	return { concluidas, total: fases.length, proxima };
}
