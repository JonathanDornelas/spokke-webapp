import { describe, expect, it } from 'vitest';
import { LIMITES } from '$lib/billing/catalogo';
import {
	cabe,
	can,
	estadoDaEquipe,
	montarEstado,
	motivoDoBloqueio,
	situacaoDaCobranca,
	type LinhaDeCobranca
} from './entitlements';

const AGORA = new Date('2026-10-03T12:00:00Z');
const dias = (n: number) => new Date(AGORA.getTime() + n * 24 * 3600 * 1000);
const vazio = { atividades: 0, materiais: 0 };
const semCredito = { saldo: 0, renovamEm: null };

function estado(linha: LinhaDeCobranca, uso = vazio, creditos = semCredito) {
	return montarEstado(linha, { uso, creditos }, AGORA);
}

describe('situacaoDaCobranca — a situação sai das datas', () => {
	it.each<[string, LinhaDeCobranca, string]>([
		['trial vivo', { subscriptionStatus: 'trialing', trialEndsAt: dias(3) }, 'trial'],
		['trial vencido', { subscriptionStatus: 'trialing', trialEndsAt: dias(-1) }, 'expirada'],
		['trial sem data (conta antiga) continua vivo', { subscriptionStatus: 'trialing' }, 'trial'],
		['status nulo é trial', { subscriptionStatus: null, trialEndsAt: dias(1) }, 'trial'],
		['ativa no período', { subscriptionStatus: 'active', currentPeriodEnd: dias(10) }, 'ativa'],
		['ativa sem fim', { subscriptionStatus: 'active' }, 'ativa'],
		[
			'ativa vencida, dentro da carência',
			{ subscriptionStatus: 'active', currentPeriodEnd: dias(-2) },
			'atrasada'
		],
		[
			'ativa vencida, fora da carência',
			{ subscriptionStatus: 'active', currentPeriodEnd: dias(-30) },
			'expirada'
		],
		[
			'cancelamento agendado, período ainda correndo',
			{ subscriptionStatus: 'active', currentPeriodEnd: dias(5), cancelAtPeriodEnd: true },
			'ativa'
		],
		[
			'cancelamento agendado, período acabou',
			{ subscriptionStatus: 'active', currentPeriodEnd: dias(-1), cancelAtPeriodEnd: true },
			'cancelada'
		],
		[
			'cancelada com período correndo usa o mês',
			{ subscriptionStatus: 'canceled', currentPeriodEnd: dias(3) },
			'ativa'
		],
		['cancelada', { subscriptionStatus: 'canceled', currentPeriodEnd: dias(-1) }, 'cancelada'],
		[
			'atrasada com carência gravada',
			{ subscriptionStatus: 'past_due', currentPeriodEnd: dias(-20), gracePeriodEnd: dias(1) },
			'atrasada'
		],
		['status desconhecido não libera', { subscriptionStatus: 'incomplete_expired' }, 'expirada']
	])('%s', (_nome, linha, esperado) => {
		expect(situacaoDaCobranca(linha, AGORA)).toBe(esperado);
	});
});

describe('montarEstado', () => {
	it('trial usa os limites do básico, sem plano gravado', () => {
		const e = estado({ subscriptionStatus: 'trialing', trialEndsAt: dias(3) });
		expect({ plano: e.plano, origem: e.origem, limites: e.limites }).toEqual({
			plano: 'basico',
			origem: 'trial',
			limites: LIMITES.basico
		});
	});

	it('assinatura ativa usa os limites do plano gravado', () => {
		const e = estado({ plan: 'pro', subscriptionStatus: 'active', currentPeriodEnd: dias(5) });
		expect({ plano: e.plano, origem: e.origem, ia: e.limites.ia }).toEqual({
			plano: 'pro',
			origem: 'assinatura',
			ia: true
		});
	});

	it('a escola vence o plano próprio', () => {
		const limites = { atividades: 20, materiais: 200, creditosPorCiclo: 500, ia: true };
		const e = montarEstado(
			{ subscriptionStatus: 'trialing', trialEndsAt: dias(-5) },
			{ uso: vazio, creditos: semCredito, escola: { id: 'e1', nome: 'Escola', limites } },
			AGORA
		);
		expect({ plano: e.plano, origem: e.origem, situacao: e.situacao, limites: e.limites }).toEqual({
			plano: 'scholar',
			origem: 'escola',
			situacao: 'ativa',
			limites
		});
	});
});

describe('cabe — estoque', () => {
	const ativo: LinhaDeCobranca = { plan: 'basico', subscriptionStatus: 'active' };

	it('quanto cabe de um pedido maior que a sobra', () => {
		expect(cabe(estado(ativo, { atividades: 7, materiais: 55 }), 'materiais', 20)).toBe(5);
	});

	it('acima do limite (rebaixou de plano) é zero, nunca negativo', () => {
		expect(cabe(estado(ativo, { atividades: 25, materiais: 0 }), 'atividades')).toBe(0);
	});

	it('situação bloqueada não cabe nada, mesmo com vaga', () => {
		const e = estado({ subscriptionStatus: 'trialing', trialEndsAt: dias(-1) });
		expect(cabe(e, 'atividades')).toBe(0);
	});
});

describe('can e motivoDoBloqueio', () => {
	it('trial vencido sem plano diz "trial", não "assinatura"', () => {
		const e = estado({ subscriptionStatus: 'trialing', trialEndsAt: dias(-1) });
		expect(can(e, 'publicar_atividade')).toBe(false);
		expect(motivoDoBloqueio(e, 'publicar_atividade')).toBe('trial');
	});

	it('plano vencido diz "publicar"', () => {
		const e = estado({ plan: 'pro', subscriptionStatus: 'active', currentPeriodEnd: dias(-60) });
		expect(motivoDoBloqueio(e, 'publicar_atividade')).toBe('publicar');
	});

	it('atrasada dentro da carência ainda publica', () => {
		const e = estado({ plan: 'pro', subscriptionStatus: 'active', currentPeriodEnd: dias(-1) });
		expect(can(e, 'publicar_atividade')).toBe(true);
	});

	it('limite de atividades', () => {
		const e = estado(
			{ plan: 'basico', subscriptionStatus: 'active' },
			{ atividades: 10, materiais: 0 }
		);
		expect(motivoDoBloqueio(e, 'criar_atividade')).toBe('criar');
		expect(can(e, 'publicar_atividade')).toBe(true);
	});

	it('limite de materiais', () => {
		const e = estado(
			{ plan: 'basico', subscriptionStatus: 'active' },
			{ atividades: 0, materiais: 60 }
		);
		expect(motivoDoBloqueio(e, 'criar_material')).toBe('materiais');
	});

	it('básico não usa IA, mesmo com crédito', () => {
		const e = estado({ plan: 'basico', subscriptionStatus: 'active' }, vazio, {
			saldo: 50,
			renovamEm: null
		});
		expect(motivoDoBloqueio(e, 'usar_ia')).toBe('ia');
	});

	it('pro sem saldo diz "creditos"', () => {
		const e = estado({ plan: 'pro', subscriptionStatus: 'active' });
		expect(motivoDoBloqueio(e, 'usar_ia')).toBe('creditos');
		const comSaldo = estado({ plan: 'pro', subscriptionStatus: 'active' }, vazio, {
			saldo: 1,
			renovamEm: null
		});
		expect(can(comSaldo, 'usar_ia')).toBe(true);
	});
});

describe('estadoDaEquipe — quem opera a plataforma testa o produto inteiro', () => {
	const comCredito = { saldo: 1000, renovamEm: dias(30) };

	it('o trial com os limites do Básico vira o maior plano, com IA', () => {
		const trial = estado({ subscriptionStatus: 'trialing', trialEndsAt: dias(10) });
		expect(can(trial, 'usar_ia')).toBe(false);
		const equipe = { ...estadoDaEquipe(trial), creditos: comCredito };
		expect(equipe).toMatchObject({ origem: 'equipe', situacao: 'ativa', plano: 'super' });
		expect(equipe.limites).toEqual(LIMITES.super);
		expect(can(equipe, 'usar_ia')).toBe(true);
		expect(can(equipe, 'publicar_atividade')).toBe(true);
	});

	it('vale mesmo com o teste vencido ou a assinatura expirada', () => {
		for (const linha of [
			{ subscriptionStatus: 'trialing', trialEndsAt: dias(-1) },
			{ subscriptionStatus: 'past_due', plan: 'pro', currentPeriodEnd: dias(-30) }
		] satisfies LinhaDeCobranca[]) {
			const parado = estado(linha);
			expect(can(parado, 'criar_atividade')).toBe(false);
			expect(can(estadoDaEquipe(parado), 'criar_atividade')).toBe(true);
		}
	});

	it('não inventa uso nem crédito: o estoque e o saldo continuam os de verdade', () => {
		const cheio = estado(
			{ subscriptionStatus: 'trialing', trialEndsAt: dias(10) },
			{ atividades: 80, materiais: 3 }
		);
		const equipe = estadoDaEquipe(cheio);
		expect(equipe.uso).toEqual({ atividades: 80, materiais: 3 });
		expect(motivoDoBloqueio(equipe, 'criar_atividade')).toBe('criar');
		expect(motivoDoBloqueio(equipe, 'usar_ia')).toBe('creditos');
	});
});
