import { z } from 'zod';
import type { Skill } from '$lib/kernel/interactions/types';
import { skillSchema, skills } from '$lib/kernel/interactions/skill-schema';

/**
 * Os tipos de questão da etapa de materiais: o bloco de cima vale para todos os
 * materiais, e cada material pode ter os seus. Pedido do dono do repositório:
 * "ambos precisam se conversar e replicar um ao outro".
 *
 * - Mexer no bloco de cima muda TODOS os materiais.
 * - Ligar num material um tipo que o bloco de cima não tem liga o tipo lá também.
 * - O bloco de cima é sempre a UNIÃO dos materiais: o tipo ligado em só alguns
 *   aparece como parcial (tracejado), e o desligado em todos sai dele.
 * - **Nenhum material fica sem tipo** (também pedido dele): o clique que
 *   desligaria o último tipo de um material não faz nada, e a tela diz por quê
 *   no `title` do chip (`bloqueioNoGeral`, `bloqueioNoMaterial`).
 *
 * Cada material guarda a lista INTEIRA dele. Guardar só os que diferem do bloco
 * de cima não serve: ligar a escrita num material mudaria o bloco de cima, e os
 * materiais que "seguiam o bloco" ganhariam a escrita sem ninguém ter pedido.
 * Material novo (que ainda não está no mapa) nasce com o bloco de cima.
 *
 * Puro, usado pela tela e pelo servidor (`Activity.tiposPorMaterial`).
 */

/** A ordem em que os tipos aparecem na tela. */
export const TIPOS: readonly Skill[] = skills;

export const tiposPorMaterialSchema = z.record(z.string(), z.array(skillSchema));
export type TiposPorMaterial = z.infer<typeof tiposPorMaterialSchema>;

export interface PlanoDeTipos {
	/** O bloco de cima. Com materiais, é a união deles. */
	geral: Skill[];
	/** A lista de cada material, por id. */
	porMaterial: TiposPorMaterial;
}

function ordenado(lista: Iterable<Skill>): Skill[] {
	const tem = new Set(lista);
	return TIPOS.filter((tipo) => tem.has(tipo));
}

/** Lê o que veio do banco (Json) sem confiar no tipo — db.md "JSON no Postgres". */
export function lerTiposPorMaterial(valor: unknown): TiposPorMaterial {
	const lido = tiposPorMaterialSchema.safeParse(valor);
	return lido.success ? lido.data : {};
}

/** Lê `Activity.skills`, descartando o que não é habilidade. */
export function lerTiposGerais(valor: readonly string[]): Skill[] {
	return ordenado(valor.filter((tipo): tipo is Skill => skillSchema.safeParse(tipo).success));
}

/**
 * O plano completo para os materiais desta atividade: todo material ganha a
 * lista dele (quem não tem segue o bloco de cima), e o bloco de cima vira a união.
 * Material que saiu da atividade sai do mapa.
 */
export function montarPlano(
	geral: readonly Skill[],
	porMaterial: TiposPorMaterial,
	materiais: readonly string[]
): PlanoDeTipos {
	const mapa: TiposPorMaterial = {};
	for (const id of materiais) mapa[id] = ordenado(porMaterial[id] ?? geral);
	return { geral: uniao(geral, mapa, materiais), porMaterial: mapa };
}

function uniao(geral: readonly Skill[], mapa: TiposPorMaterial, materiais: readonly string[]) {
	// Sem material, o bloco de cima é o que o professor marcou: é o padrão do
	// primeiro material que entrar.
	if (materiais.length === 0) return ordenado(geral);
	return ordenado(materiais.flatMap((id) => mapa[id] ?? []));
}

export type EstadoDoTipo =
	{ tipo: 'todos' } | { tipo: 'nenhum' } | { tipo: 'alguns'; ligados: number; total: number };

/** Como o tipo aparece no bloco de cima: ligado, desligado ou "em X de N". */
export function estadoNoGeral(
	plano: PlanoDeTipos,
	tipo: Skill,
	materiais: readonly string[]
): EstadoDoTipo {
	if (materiais.length === 0) {
		return plano.geral.includes(tipo) ? { tipo: 'todos' } : { tipo: 'nenhum' };
	}
	const ligados = materiais.filter((id) => plano.porMaterial[id]?.includes(tipo)).length;
	if (ligados === 0) return { tipo: 'nenhum' };
	if (ligados === materiais.length) return { tipo: 'todos' };
	return { tipo: 'alguns', ligados, total: materiais.length };
}

/**
 * O que não entrega hoje (sem voz, sem transcrição) — o `Map` com o motivo, da
 * tela, ou um `Set`. Tipo indisponível não conta como "ainda ligado": um
 * material que só ficasse com a escuta, sem voz no idioma, não geraria nada.
 */
export type Indisponiveis = { has(tipo: Skill): boolean };
const NENHUM: Indisponiveis = { has: () => false };

/** As frases do `title` do chip que não desliga. */
export const ULTIMO_DO_MATERIAL =
	'É o único tipo ligado neste material. Ligue outro antes de desligar este.';
export const ULTIMO_DE_UM_MATERIAL =
	'Um material só gera este tipo. Ligue outro tipo nele antes de desligar este.';
export const ULTIMO_DA_ATIVIDADE = 'É o único tipo ligado. Ligue outro antes de desligar este.';

function ficaSemTipo(lista: readonly Skill[], tipo: Skill, indisponiveis: Indisponiveis) {
	return !lista.some((outro) => outro !== tipo && !indisponiveis.has(outro));
}

/**
 * Por que o clique no tipo de UM material não pode desligá-lo (a lista dele é
 * `lista`). Nulo = pode. Ligar nunca é barrado.
 */
export function bloqueioNoMaterial(
	lista: readonly Skill[],
	tipo: Skill,
	indisponiveis: Indisponiveis = NENHUM
): string | null {
	if (!lista.includes(tipo)) return null;
	return ficaSemTipo(lista, tipo, indisponiveis) ? ULTIMO_DO_MATERIAL : null;
}

/**
 * Por que o clique no bloco de cima não pode desligar o tipo: ele desligaria em
 * todos, e algum material ficaria sem tipo. Só o "ligado em todos" desliga — o
 * clique no parcial e no desligado liga, e esses nunca são barrados.
 */
export function bloqueioNoGeral(
	plano: PlanoDeTipos,
	tipo: Skill,
	materiais: readonly string[],
	indisponiveis: Indisponiveis = NENHUM
): string | null {
	if (estadoNoGeral(plano, tipo, materiais).tipo !== 'todos') return null;
	if (ficaSemTipo(plano.geral, tipo, indisponiveis)) return ULTIMO_DA_ATIVIDADE;
	const algumFica = materiais.some((id) =>
		ficaSemTipo(plano.porMaterial[id] ?? plano.geral, tipo, indisponiveis)
	);
	return algumFica ? ULTIMO_DE_UM_MATERIAL : null;
}

/**
 * Clique no bloco de cima. Ligado em todos desliga em todos; parcial ou desligado
 * liga em todos — o parcial é um "quase todos", e o clique o completa.
 */
export function alternarNoGeral(
	plano: PlanoDeTipos,
	tipo: Skill,
	materiais: readonly string[],
	indisponiveis: Indisponiveis = NENHUM
): PlanoDeTipos {
	if (bloqueioNoGeral(plano, tipo, materiais, indisponiveis)) return plano;
	const ligar = estadoNoGeral(plano, tipo, materiais).tipo !== 'todos';
	const porMaterial: TiposPorMaterial = {};
	for (const id of materiais) {
		const atual = new Set(plano.porMaterial[id] ?? plano.geral);
		if (ligar) atual.add(tipo);
		else atual.delete(tipo);
		porMaterial[id] = ordenado(atual);
	}
	const base = new Set(plano.geral);
	if (ligar) base.add(tipo);
	else base.delete(tipo);
	return { geral: uniao([...base], porMaterial, materiais), porMaterial };
}

/** Clique no tipo de UM material. O bloco de cima acompanha (é a união). */
export function alternarNoMaterial(
	plano: PlanoDeTipos,
	material: string,
	tipo: Skill,
	materiais: readonly string[],
	indisponiveis: Indisponiveis = NENHUM
): PlanoDeTipos {
	if (bloqueioNoMaterial(plano.porMaterial[material] ?? plano.geral, tipo, indisponiveis)) {
		return plano;
	}
	const atual = new Set(plano.porMaterial[material] ?? plano.geral);
	if (atual.has(tipo)) atual.delete(tipo);
	else atual.add(tipo);
	const porMaterial = { ...plano.porMaterial, [material]: ordenado(atual) };
	return { geral: uniao(plano.geral, porMaterial, materiais), porMaterial };
}

/** Tipos que o servidor não consegue entregar hoje (sem voz, sem transcrição). */
export function tiposIndisponiveis(capacidades: { tts: boolean; asr: boolean }): Set<Skill> {
	const fora = new Set<Skill>();
	if (!capacidades.tts) fora.add('listening');
	if (!capacidades.asr) fora.add('speaking');
	return fora;
}
