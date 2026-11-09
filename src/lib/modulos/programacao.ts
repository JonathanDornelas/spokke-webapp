import { z } from 'zod';

/**
 * A PROGRAMAÇÃO de LIBERAÇÃO de um módulo para UMA turma (docs/telas-modulos-professor.md
 * 2.4): em que data cada atividade abre no mapa do aluno. Pura e isomórfica: a prévia da tela e o servidor que grava as datas
 * chamam a MESMA `agendar`, então o professor nunca vê uma data que o envio não
 * vai cumprir.
 *
 * **Datas são texto `AAAA-MM-DD`, não `Date`.** A conta é de calendário (toda
 * quinta, a cada mês), e um `Date` carrega fuso: a mesma quinta viraria quarta
 * no navegador de quem está a oeste de Greenwich. O instante só aparece no fim,
 * em `instanteDe`, com o fuso escrito.
 */

/** O fuso das datas da programação, escrito na tela ("Horário de Brasília"). */
export const FUSO = 'America/Sao_Paulo';
/**
 * O deslocamento de Brasília. Fixo porque o Brasil não tem horário de verão
 * desde 2019; se ele voltar, `instanteDe` é o único lugar a mudar.
 */
const DESLOCAMENTO = '-03:00';

const dataSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.');

export const MODOS = ['agora', 'semana', 'intervalo', 'datas'] as const;
export type Modo = (typeof MODOS)[number];
export const UNIDADES = ['dias', 'semanas', 'meses'] as const;

/**
 * **Módulo não manda e-mail.** Ele LIBERA: na data, a atividade abre no mapa do
 * módulo de quem tem conta ligada à turma, e ninguém é avisado por e-mail (pedido
 * do dono do repositório). Houve um campo `canal` (`email` | `mapa`); ele saiu,
 * e uma programação gravada com ele continua valendo — o Zod descarta a chave.
 * Mandar UMA atividade por e-mail para a turma continua existindo, fora do
 * módulo ("Enviar atividade", na tela da turma).
 */
export const programacaoSchema = z.object({
	modo: z.enum(MODOS),
	/** Dias da semana, 0 = domingo (o `getUTCDay`). */
	dias: z.array(z.number().int().min(0).max(6)).max(7).default([4]),
	hora: z
		.string()
		.regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Horário inválido.')
		.default('08:00'),
	/** Quantas atividades abrem em cada data. */
	porVez: z.number().int().min(1).max(8).default(1),
	intervalo: z.number().int().min(1).max(12).default(1),
	unidade: z.enum(UNIDADES).default('semanas'),
	inicio: dataSchema,
	/** Modo "datas escolhidas": uma data por atividade. */
	datas: z.record(z.string(), dataSchema).default({}),
	/** Desmarcadas: não saem para esta turma nem aparecem no mapa destes alunos. */
	fora: z.array(z.string()).max(200).default([]),
	/** Puladas: continuam na lista, riscadas, e não saem. */
	pulei: z.array(z.string()).max(200).default([]),
	/** Adiadas: semanas a somar na data calculada. */
	adiei: z.record(z.string(), z.number().int().min(1).max(52)).default({})
});
export type Programacao = z.infer<typeof programacaoSchema>;

export function programacaoPadrao(hoje: string): Programacao {
	return programacaoSchema.parse({ modo: 'semana', inicio: hoje });
}

/** Lê a coluna `Json` com o schema; o que não valida conta como "sem programação". */
export function lerProgramacao(valor: unknown): Programacao | null {
	const r = programacaoSchema.safeParse(valor);
	return r.success ? r.data : null;
}

// ── calendário ────────────────────────────────────────────────────────────

function emUtc(data: string): Date {
	const [a, m, d] = data.split('-').map(Number);
	return new Date(Date.UTC(a, m - 1, d));
}
function texto(d: Date): string {
	return d.toISOString().slice(0, 10);
}
export function somarDias(data: string, n: number): string {
	const d = emUtc(data);
	d.setUTCDate(d.getUTCDate() + n);
	return texto(d);
}
/** Soma meses mantendo o dia, e o dia 31 vira o último dia dos meses curtos — a regra de `billing/ciclo.ts`. */
export function somarMeses(data: string, n: number): string {
	const d = emUtc(data);
	const total = d.getUTCFullYear() * 12 + d.getUTCMonth() + n;
	const ano = Math.floor(total / 12);
	const mes = total - ano * 12;
	const ultimo = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
	return texto(new Date(Date.UTC(ano, mes, Math.min(d.getUTCDate(), ultimo))));
}
function diaDaSemana(data: string): number {
	return emUtc(data).getUTCDay();
}

/** A data de hoje em Brasília — a referência de "já passou" da programação. */
export function hojeEmBrasilia(agora: Date = new Date()): string {
	return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO }).format(agora);
}

/** O instante de um envio: a data e o horário em Brasília. */
export function instanteDe(data: string, hora: string): Date {
	return new Date(`${data}T${hora}:00${DESLOCAMENTO}`);
}

const CURTO = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const LONGO = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/** "qui 15/10" — o formato da prévia e do mapa do aluno. */
export function rotuloDaData(data: string): string {
	const [, m, d] = data.split('-');
	return `${CURTO[diaDaSemana(data)]} ${d}/${m}`;
}

/** "8h", "7h30". */
export function rotuloDaHora(hora: string): string {
	const [h, m] = hora.split(':');
	return `${Number(h)}h${m === '00' ? '' : m}`;
}

/** "toda quinta, 8h", "segunda e quarta, 8h", "a cada 2 semanas, 7h30". */
export function resumoDaProgramacao(p: Programacao): string {
	if (p.modo === 'agora') return 'tudo de uma vez';
	if (p.modo === 'datas') return 'datas escolhidas';
	const hora = rotuloDaHora(p.hora);
	if (p.modo === 'intervalo') {
		const singular = { dias: 'dia', semanas: 'semana', meses: 'mês' }[p.unidade];
		return `a cada ${p.intervalo === 1 ? singular : `${p.intervalo} ${p.unidade}`}, ${hora}`;
	}
	const ordenados = [...p.dias].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
	const dias = ordenados.map((d) => LONGO[d]);
	// Sábado e domingo são masculinos: "todo sábado", não "toda sábado".
	if (dias.length === 1) return `${ordenados[0] % 6 === 0 ? 'todo' : 'toda'} ${dias[0]}, ${hora}`;
	const [ultimo, ...resto] = [...dias].reverse();
	return `${resto.reverse().join(', ')} e ${ultimo}, ${hora}`;
}

/** As `n` primeiras datas do ritmo a partir de `desde` (inclusive). */
function datasDoRitmo(p: Programacao, desde: string, n: number): string[] {
	const datas: string[] = [];
	if (p.modo === 'semana') {
		if (p.dias.length === 0) return [];
		for (let k = 0; datas.length < n && k < 3660; k++) {
			const d = somarDias(desde, k);
			if (p.dias.includes(diaDaSemana(d))) datas.push(d);
		}
		return datas;
	}
	for (let k = 0; k < n; k++) {
		const passo = k * p.intervalo;
		datas.push(
			p.unidade === 'dias'
				? somarDias(desde, passo)
				: p.unidade === 'semanas'
					? somarDias(desde, 7 * passo)
					: somarMeses(desde, passo)
		);
	}
	return datas;
}

export type ItemAgendado = { id: string; pulada: boolean; adiada: boolean };
/** Um envio da agenda. `data` nula = sai agora ("tudo agora"). */
export type Grupo = { data: string | null; itens: ItemAgendado[] };

/**
 * A agenda do que AINDA NÃO SAIU, em ordem de data.
 *
 * - `ordem`: as atividades do módulo, na ordem do módulo.
 * - `consumidas`: as que já têm desfecho (enviada, ou "não saiu") — elas não
 *   entram na fila, mas no ritmo continuam ocupando a vaga delas. É isso que
 *   mantém a Frutas 4 na data dela quando a Frutas 3 falhou.
 * - `hoje`: em Brasília (`hojeEmBrasilia`).
 *
 * **Uma agenda atrasada recomeça de hoje.** Se alguma pendente caiu no passado
 * (a programação ficou pausada, ou a data de início já foi), as pendentes são
 * redistribuídas a partir de hoje no mesmo ritmo — "as datas recomeçam a partir
 * de quando retomar". Sem atraso, as datas são ancoradas no início e não andam
 * sozinhas de um dia para o outro.
 */
export function agendar(
	p: Programacao,
	ordem: string[],
	consumidas: ReadonlySet<string>,
	hoje: string
): Grupo[] {
	const selecionadas = ordem.filter((id) => !p.fora.includes(id));
	const pendentes = selecionadas.filter((id) => !consumidas.has(id));
	if (pendentes.length === 0) return [];

	const item = (id: string): ItemAgendado => ({
		id,
		pulada: p.pulei.includes(id),
		adiada: (p.adiei[id] ?? 0) > 0
	});

	if (p.modo === 'agora') return [{ data: null, itens: pendentes.map(item) }];

	const dataDe = new Map<string, string>();
	if (p.modo === 'datas') {
		const base = p.inicio < hoje ? hoje : p.inicio;
		pendentes.forEach((id, i) => {
			const escolhida = p.datas[id] ?? somarDias(base, 7 * i);
			dataDe.set(id, escolhida < hoje ? hoje : escolhida);
		});
	} else {
		const porVez = p.porVez;
		const vagas = datasDoRitmo(p, p.inicio, Math.ceil(selecionadas.length / porVez));
		if (vagas.length === 0) return [];
		selecionadas.forEach((id, i) => dataDe.set(id, vagas[Math.floor(i / porVez)]));
		const atrasada = pendentes.some((id) => (dataDe.get(id) ?? hoje) < hoje);
		if (atrasada) {
			const novas = datasDoRitmo(p, hoje, Math.ceil(pendentes.length / porVez));
			pendentes.forEach((id, i) => dataDe.set(id, novas[Math.floor(i / porVez)]));
		}
	}

	const grupos = new Map<string, ItemAgendado[]>();
	for (const id of pendentes) {
		const semanas = p.adiei[id] ?? 0;
		const data = somarDias(dataDe.get(id) as string, 7 * semanas);
		grupos.set(data, [...(grupos.get(data) ?? []), item(id)]);
	}
	return [...grupos.entries()]
		.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
		.map(([data, itens]) => ({ data, itens }));
}
