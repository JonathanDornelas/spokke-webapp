import {
	CARENCIA_DIAS,
	EQUIPE,
	LIMITES,
	TRIAL,
	ehPlanoPago,
	type Limites,
	type PlanoId,
	type PlanoPago
} from '$lib/billing/catalogo';
import type { MotivoDoBloqueio } from '$lib/billing/motivos';

/**
 * Ponto ÚNICO de decisão de acesso — ver .claude/rules/billing.md
 * "Entitlements" e docs/adr-002-billing.md. Nunca espalhe
 * `subscriptionStatus === 'active'` fora daqui.
 *
 * Tudo aqui é PURO: recebe o estado já montado (`acessoDoProfessor`, em
 * `./acesso.ts`, é quem vai ao banco) e devolve decisão. É o que deixa a matriz
 * inteira de situações ser testada sem banco nenhum.
 *
 * Duas regras de produto que atravessam o arquivo:
 *
 * - **A situação sai das DATAS, não de um job.** Trial vencido, período que
 *   passou, carência que acabou — tudo é derivado na leitura a partir de
 *   `trialEndsAt`, `currentPeriodEnd` e `gracePeriodEnd`. Um cron que esquecesse
 *   de rodar deixaria uma conta liberada para sempre; uma derivação não esquece.
 * - **Degradação, não desligamento.** Nenhuma situação derruba link publicado
 *   nem apaga nada. O que fecha é criar e publicar, do lado do professor. O
 *   Player não consulta este arquivo.
 */

export type Situacao = 'trial' | 'ativa' | 'atrasada' | 'cancelada' | 'expirada';
/** `equipe`: a conta de quem opera a plataforma (`estadoDaEquipe`). */
export type Origem = 'trial' | 'assinatura' | 'escola' | 'equipe' | 'nenhum';

export type Capacidade =
	'publicar_atividade' | 'criar_atividade' | 'criar_material' | 'usar_ia' | 'usar_asr';

export type Recurso = 'atividades' | 'materiais';

/**
 * Os campos de cobrança do `Teacher`. Opcionais e anuláveis de propósito: a
 * mesma forma serve para a linha do Prisma e para o usuário da sessão do Better
 * Auth, que traz os mesmos campos com opcionalidade diferente.
 */
export interface LinhaDeCobranca {
	plan?: string | null;
	subscriptionStatus?: string | null;
	trialEndsAt?: Date | null;
	currentPeriodEnd?: Date | null;
	gracePeriodEnd?: Date | null;
	cancelAtPeriodEnd?: boolean | null;
}

export interface Uso {
	atividades: number;
	materiais: number;
}

export interface Creditos {
	saldo: number;
	/** Quando o saldo volta ao valor do plano. Nulo quando o plano não tem crédito. */
	renovamEm: Date | null;
}

/** A escola em vigor para este professor (P6). Ela VENCE o plano próprio enquanto vale. */
export interface EscolaEmVigor {
	id: string;
	nome: string;
	limites: Limites;
}

export interface EstadoDeAcesso {
	/** O plano em vigor — ou o último que a conta teve, quando nada vale mais. */
	plano: PlanoId | null;
	origem: Origem;
	situacao: Situacao;
	limites: Limites;
	uso: Uso;
	creditos: Creditos;
	trialEndsAt: Date | null;
	currentPeriodEnd: Date | null;
	cancelAtPeriodEnd: boolean;
	escola: { id: string; nome: string } | null;
}

const DIA_MS = 24 * 60 * 60 * 1000;

/** Fim da carência: a data gravada, ou `CARENCIA_DIAS` depois do fim do período. */
function fimDaCarencia(linha: LinhaDeCobranca): Date | null {
	if (linha.gracePeriodEnd) return linha.gracePeriodEnd;
	if (!linha.currentPeriodEnd) return null;
	return new Date(linha.currentPeriodEnd.getTime() + CARENCIA_DIAS * DIA_MS);
}

/**
 * A situação da cobrança, derivada das datas. O status gravado é a ÚLTIMA
 * decisão explícita (ativar, cancelar, marcar atrasado); a passagem do tempo é
 * aplicada aqui, na leitura.
 */
export function situacaoDaCobranca(linha: LinhaDeCobranca, agora: Date): Situacao {
	const status = linha.subscriptionStatus ?? 'trialing';

	if (status === 'trialing') {
		// `trialEndsAt` nulo só existe em conta de antes do backfill — a migration
		// carimba todas, e o cadastro carimba as novas. Tratar como trial vivo é o
		// lado seguro: travar quem já publicava por um campo que faltou.
		if (!linha.trialEndsAt) return 'trial';
		return linha.trialEndsAt > agora ? 'trial' : 'expirada';
	}

	if (status === 'active') {
		const fim = linha.currentPeriodEnd;
		if (!fim || fim > agora) return 'ativa';
		if (linha.cancelAtPeriodEnd) return 'cancelada';
		const carencia = fimDaCarencia(linha);
		return carencia && carencia > agora ? 'atrasada' : 'expirada';
	}

	if (status === 'past_due' || status === 'unpaid') {
		const carencia = fimDaCarencia(linha);
		return carencia && carencia > agora ? 'atrasada' : 'expirada';
	}

	if (status === 'canceled') {
		// Cancelada com o período ainda correndo continua valendo até o fim dele —
		// quem pagou o mês usa o mês.
		const fim = linha.currentPeriodEnd;
		return fim && fim > agora ? 'ativa' : 'cancelada';
	}

	return 'expirada';
}

/** A situação deixa criar e publicar? */
export function liberada(situacao: Situacao): boolean {
	return situacao === 'trial' || situacao === 'ativa' || situacao === 'atrasada';
}

function planoGravado(linha: LinhaDeCobranca): PlanoPago | null {
	return ehPlanoPago(linha.plan) ? linha.plan : null;
}

/**
 * Monta o estado de acesso a partir da linha, do uso e dos créditos. Puro: quem
 * vai ao banco buscar cada parte é `acessoDoProfessor`.
 */
export function montarEstado(
	linha: LinhaDeCobranca,
	partes: { uso: Uso; creditos: Creditos; escola?: EscolaEmVigor | null },
	agora: Date
): EstadoDeAcesso {
	const base = {
		uso: partes.uso,
		creditos: partes.creditos,
		trialEndsAt: linha.trialEndsAt ?? null,
		currentPeriodEnd: linha.currentPeriodEnd ?? null,
		cancelAtPeriodEnd: linha.cancelAtPeriodEnd ?? false
	};

	// A escola vence o plano próprio enquanto vale (adr-005-escola): o contrato
	// dela é a cobrança do professor-membro.
	if (partes.escola) {
		return {
			...base,
			plano: 'scholar',
			origem: 'escola',
			situacao: 'ativa',
			limites: partes.escola.limites,
			escola: { id: partes.escola.id, nome: partes.escola.nome }
		};
	}

	const situacao = situacaoDaCobranca(linha, agora);
	const gravado = planoGravado(linha);

	if (situacao === 'trial') {
		return {
			...base,
			plano: TRIAL.plano,
			origem: 'trial',
			situacao,
			limites: LIMITES[TRIAL.plano],
			escola: null
		};
	}

	const plano = gravado ?? TRIAL.plano;
	return {
		...base,
		plano: gravado,
		origem: liberada(situacao) ? 'assinatura' : 'nenhum',
		situacao,
		limites: LIMITES[plano],
		escola: null
	};
}

/**
 * O estado da conta de quem OPERA a plataforma: o maior plano, ativo, sem vencimento (`EQUIPE`
 * em `catalogo.ts`) — tudo liberado, a IA inclusive. Vence a cobrança gravada, o trial e a
 * escola: a equipe testa o produto inteiro sem depender do que está na linha dela. O uso
 * continua o de verdade, e os créditos saem da franquia do plano mais os lançamentos do ciclo,
 * como em qualquer conta (`acesso.ts`) — a IA da equipe também gasta e aparece em `AiUsage`.
 *
 * Não abre nada ENTRE professores: o escopo por `teacherId` não passa por aqui.
 */
export function estadoDaEquipe(estado: EstadoDeAcesso): EstadoDeAcesso {
	return {
		...estado,
		plano: EQUIPE.plano,
		origem: 'equipe',
		situacao: 'ativa',
		limites: LIMITES[EQUIPE.plano],
		trialEndsAt: null,
		currentPeriodEnd: null,
		cancelAtPeriodEnd: false,
		escola: null
	};
}

/**
 * Quantos de `n` cabem no estoque do plano. Zero quando não cabe nenhum — e
 * nunca negativo, mesmo para quem rebaixou de plano e está ACIMA do limite
 * (nada é apagado: ele só não cria até voltar para baixo do teto).
 */
export function cabe(estado: EstadoDeAcesso, recurso: Recurso, n = 1): number {
	if (!liberada(estado.situacao)) return 0;
	const sobra = estado.limites[recurso] - estado.uso[recurso];
	return Math.max(0, Math.min(n, sobra));
}

/** Ponto único de decisão. Quando a resposta é não, `motivoDoBloqueio` diz por quê. */
export function can(estado: EstadoDeAcesso, capacidade: Capacidade): boolean {
	return motivoDoBloqueio(estado, capacidade) === null;
}

/**
 * O porquê de uma porta fechada, já no vocabulário de `/planos?motivo=`. Nulo
 * quando a porta está aberta.
 */
export function motivoDoBloqueio(
	estado: EstadoDeAcesso,
	capacidade: Capacidade
): MotivoDoBloqueio | null {
	if (!liberada(estado.situacao)) {
		// Quem nunca teve plano e viu o trial acabar precisa ouvir "o teste
		// acabou", não "sua assinatura" — ele nunca assinou nada.
		return estado.plano === null ? 'trial' : 'publicar';
	}

	switch (capacidade) {
		case 'publicar_atividade':
		case 'usar_asr':
			return null;
		case 'criar_atividade':
			return cabe(estado, 'atividades') > 0 ? null : 'criar';
		case 'criar_material':
			return cabe(estado, 'materiais') > 0 ? null : 'materiais';
		case 'usar_ia':
			if (!estado.limites.ia) return 'ia';
			return estado.creditos.saldo > 0 ? null : 'creditos';
	}
}
