import { z } from 'zod';
import { CUSTO_IA } from '$lib/billing/catalogo';
import { custoDaGeracao, type FonteDaIa } from '$lib/billing/ia';
import type { MotivoDoBloqueio } from '$lib/billing/motivos';
import type { ContentUnitKind } from '$lib/kernel/content/types';
import { materiais } from '$lib/server/db/repos/content-units';
import { debitar, estornar } from '$lib/server/billing/creditos';
import { usoDeIa } from '$lib/server/db/repos/uso-de-ia';
import { getGerador } from './index';
import { jsonSchemaDaResposta, validarProposta } from './schemas';
import type { PedidoDeMateriais } from './prompt';
import type { AnexoDaIa, GeradorDeMateriais, RespostaDoModelo } from './provider';

type TeacherScope = { id: string };

/** Quanto se espera pelo modelo antes de desistir e estornar. */
const TIMEOUT_MS = 45_000;
/** Com arquivo, o modelo lê a foto ou até dez minutos de fala antes de escrever: mais folga. */
const TIMEOUT_COM_ARQUIVO_MS = 90_000;

/** De onde a geração partiu, pelo arquivo que veio junto. */
export function fonteDoPedido(anexo: AnexoDaIa | undefined): FonteDaIa {
	if (!anexo) return 'prompt';
	return anexo.tipo === 'imagem' ? 'imagem' : 'video';
}

const O_QUE_NAO_LE: Record<AnexoDaIa['tipo'], string> = {
	imagem: 'A IA ligada neste servidor não lê imagem.',
	audio: 'A IA ligada neste servidor não lê a fala de vídeo.'
};

export interface PropostaDaIa {
	id: string;
	kind: ContentUnitKind;
	/** O material já validado pelo schema do kernel — o mesmo da autoria manual. */
	dados: Record<string, unknown>;
	/** As duas colunas da lista de propostas da tela. */
	resumo: { esq: string; dir: string };
	/** "Você já tem": igual a um material da biblioteca do professor. */
	reused: boolean;
}

export type ResultadoDaGeracao =
	| { ok: true; propostas: PropostaDaIa[]; debitados: number; estornados: number; saldo: number }
	| { ok: false; error: string; motivo?: MotivoDoBloqueio };

function resumoDe(
	kind: ContentUnitKind,
	dados: Record<string, unknown>
): { esq: string; dir: string } {
	const texto = (v: unknown) => (typeof v === 'string' ? v : '');
	switch (kind) {
		case 'SentencePair':
			return { esq: texto(dados.target), dir: texto(dados.source) };
		case 'VocabItem':
			return { esq: texto(dados.term), dir: texto(dados.translation) };
		case 'Passage': {
			const n = Array.isArray(dados.questions) ? dados.questions.length : 0;
			return { esq: texto(dados.title), dir: `${n} ${n === 1 ? 'pergunta' : 'perguntas'}` };
		}
		case 'Dialogue': {
			const falas = Array.isArray(dados.lines) ? dados.lines : [];
			const primeira = falas[0] as { text?: unknown } | undefined;
			return { esq: texto(primeira?.text), dir: `${falas.length} falas` };
		}
	}
}

/** Chave de repetição: o material aparado, para "duas iguais na mesma resposta" virar uma. */
function chaveDe(dados: Record<string, unknown>): string {
	return JSON.stringify(dados, (_k, v) => (typeof v === 'string' ? v.trim().toLowerCase() : v));
}

/**
 * Grava os tokens da chamada (`AiUsage`), a medição por trás dos preços
 * (docs/adr-002-billing.md "Preços"). Medir nunca custa ao professor a geração
 * que ele pediu: falhou, fica no log e a resposta segue.
 */
async function registrarUso(
	teacher: TeacherScope,
	gerador: GeradorDeMateriais,
	entrada: PedidoDeMateriais & { requestId: string },
	aceitas: number,
	resposta: RespostaDoModelo
): Promise<void> {
	try {
		await usoDeIa(teacher).registrar({
			requestId: entrada.requestId,
			// Quem respondeu de fato: com a reserva (Claude, depois Gemini), não a fila inteira.
			model: resposta.modelo ?? gerador.nome,
			kind: entrada.kind,
			requested: entrada.quantos,
			accepted: aceitas,
			source: fonteDoPedido(entrada.anexo),
			mediaSeconds: entrada.anexo?.tipo === 'audio' ? Math.round(entrada.anexo.segundos) : null,
			inputTokens: resposta.uso?.entrada ?? null,
			outputTokens: resposta.uso?.saida ?? null,
			thoughtsTokens: resposta.uso?.raciocinio ?? null
		});
	} catch (e) {
		console.warn('[ia] o uso da geração não foi gravado:', e);
	}
}

/**
 * Pede propostas de material à IA (docs/adr-003-ia-gemini.md):
 *
 * 1. Debita o custo da geração, idempotente pelo `requestId`: as propostas pedidas e, com
 *    arquivo, a leitura dele (`custoDaGeracao`, a mesma conta do botão da tela).
 * 2. Chama o provedor FORA de qualquer transação, com teto de tempo.
 * 3. Valida cada proposta contra o schema do kernel e descarta repetidas.
 * 4. Estorna o que não veio ou não serviu — o professor paga só pelo que pode usar. A leitura do
 *    arquivo fica cobrada quando ao menos uma proposta serviu (o modelo leu, e o professor levou
 *    material); sem nenhuma, volta tudo, leitura junto.
 * 5. Grava os tokens que o provedor informou (`registrarUso`), com a fonte.
 *
 * **Nada é gravado na biblioteca aqui.** A IA propõe; o professor marca e
 * confirma (`aceitarPropostasIa`), e só aí o material entra — pela mesma porta
 * da autoria manual, com a cota de estoque. O arquivo não é gravado em lugar nenhum.
 */
export async function gerarPropostas(
	teacher: TeacherScope,
	entrada: PedidoDeMateriais & { requestId: string },
	gerador: GeradorDeMateriais | null = getGerador()
): Promise<ResultadoDaGeracao> {
	if (!gerador) return { ok: false, error: 'A geração por IA ainda não está ligada.' };
	// Antes de cobrar: um arquivo que nenhum provedor ligado lê não pode custar crédito nenhum.
	if (entrada.anexo && !gerador.le.has(entrada.anexo.tipo)) {
		return { ok: false, error: O_QUE_NAO_LE[entrada.anexo.tipo] };
	}

	const custo = custoDaGeracao({
		quantos: entrada.quantos,
		fonte: fonteDoPedido(entrada.anexo),
		segundos: entrada.anexo?.tipo === 'audio' ? entrada.anexo.segundos : null
	});
	const debito = await debitar(teacher, custo.total, entrada.requestId);
	if (!debito.ok) {
		return {
			ok: false,
			motivo: debito.motivo,
			error:
				debito.motivo === 'creditos'
					? `Seus créditos deste ciclo não cobrem os ${custo.total} desta geração (saldo: ${debito.saldo}).`
					: debito.motivo === 'ia'
						? 'Gerar material com IA é dos planos Pro e Super.'
						: 'Seu plano não permite gerar material agora.'
		};
	}
	if (debito.repetido) {
		return { ok: false, error: 'Este pedido já foi feito — gere de novo para um novo pedido.' };
	}

	let resposta: RespostaDoModelo;
	try {
		resposta = await gerador.propor(entrada, {
			schema: jsonSchemaDaResposta(entrada.kind, entrada.quantos),
			timeoutMs: entrada.anexo ? TIMEOUT_COM_ARQUIVO_MS : TIMEOUT_MS
		});
	} catch (e) {
		await estornar(teacher, custo.total, entrada.requestId, debito.cicloInicio);
		return {
			ok: false,
			error: `${e instanceof Error ? e.message : 'A IA não respondeu.'} Os créditos foram devolvidos.`
		};
	}

	const envelope = z.object({ propostas: z.array(z.unknown()) }).safeParse(resposta.dados);
	const vistos = new Set<string>();
	const validas: Record<string, unknown>[] = [];
	for (const candidata of envelope.success ? envelope.data.propostas : []) {
		if (validas.length >= entrada.quantos) break;
		const dados = validarProposta(entrada.kind, candidata) as Record<string, unknown> | null;
		if (!dados) continue;
		const chave = chaveDe(dados);
		if (vistos.has(chave)) continue;
		vistos.add(chave);
		validas.push(dados);
	}

	// Nenhuma serviu: volta tudo, a leitura do arquivo junto — o professor não levou nada. Com ao
	// menos uma, volta só o que não serviu, e a leitura fica (o modelo leu o arquivo inteiro).
	const estornados =
		validas.length === 0 ? custo.total : (entrada.quantos - validas.length) * CUSTO_IA.porProposta;
	await estornar(teacher, estornados, entrada.requestId, debito.cicloInicio);
	await registrarUso(teacher, gerador, entrada, validas.length, resposta);

	const repo = materiais(teacher);
	const propostas: PropostaDaIa[] = [];
	for (const [i, dados] of validas.entries()) {
		propostas.push({
			id: `${entrada.requestId}:${i}`,
			kind: entrada.kind,
			dados,
			resumo: resumoDe(entrada.kind, dados),
			reused: (await repo.findEquivalent(entrada.kind, dados)) !== null
		});
	}

	return {
		ok: true,
		propostas,
		debitados: custo.total - estornados,
		estornados,
		saldo: debito.saldo + estornados
	};
}
