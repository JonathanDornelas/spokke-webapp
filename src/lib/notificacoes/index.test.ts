import { describe, expect, it } from 'vitest';
import { diasAte, juntarNomes, textoDaNotificacao } from './index';

describe('o texto de cada notificação', () => {
	it('correção conta as respostas, no singular e no plural', () => {
		const um = textoDaNotificacao({
			kind: 'correcao',
			data: { activityId: 'a1', titulo: 'Present perfect' },
			count: 1
		});
		expect(um.titulo).toBe('1 resposta para corrigir');
		expect(um.detalhe).toBe('em Present perfect');
		expect(um.destino).toEqual({ rota: 'resultados', activityId: 'a1' });
		expect(um.tom).toBe('acao');

		const tres = textoDaNotificacao({
			kind: 'correcao',
			data: { activityId: 'a1', titulo: 'Present perfect' },
			count: 3
		});
		expect(tres.titulo).toBe('3 respostas para corrigir');
	});

	it('aluno que entrou: um nome, dois nomes, e "mais N"', () => {
		const base = { classroomId: 't1', turma: '7º B' };
		expect(
			textoDaNotificacao({
				kind: 'aluno-entrou',
				data: { ...base, nomes: ['Juliana'] },
				count: 1
			}).titulo
		).toBe('Juliana entrou em 7º B');
		expect(
			textoDaNotificacao({
				kind: 'aluno-entrou',
				data: { ...base, nomes: ['Pedro', 'Juliana'] },
				count: 2
			}).titulo
		).toBe('Pedro e Juliana entraram em 7º B');
		expect(
			textoDaNotificacao({
				kind: 'aluno-entrou',
				data: { ...base, nomes: ['Ana', 'Pedro', 'Juliana'] },
				count: 7
			}).titulo
		).toBe('Ana e mais 6 entraram em 7º B');
	});

	it('liberação que não aconteceu diz o motivo e leva à programação da turma', () => {
		const t = textoDaNotificacao({
			kind: 'liberacao',
			data: {
				moduleId: 'm1',
				allocationId: 'al1',
				modulo: 'Frutas',
				turma: '7º B',
				atividade: 'Frutas 3',
				motivo: 'rascunho'
			},
			count: 1
		});
		expect(t.titulo).toBe('Frutas 3 não foi liberada para 7º B');
		expect(t.detalhe).toContain('rascunho');
		expect(t.destino).toEqual({ rota: 'modulo', moduleId: 'm1', allocationId: 'al1' });
	});

	it('plano: o que a equipe fez, com a data em Brasília', () => {
		const ativo = textoDaNotificacao({
			kind: 'plano',
			data: { evento: 'ativado', plano: 'Pro', ate: '2026-12-10T12:00:00.000Z', creditos: null },
			count: 1
		});
		expect(ativo.titulo).toBe('Seu plano Pro está ativo');
		expect(ativo.detalhe).toBe('Vale até 10 de dezembro.');
		const creditos = textoDaNotificacao({
			kind: 'plano',
			data: { evento: 'creditos', plano: null, ate: null, creditos: 50 },
			count: 1
		});
		expect(creditos.titulo).toBe('Você ganhou 50 créditos de IA');
	});

	it('fim do teste conta os dias até a data, no fuso de Brasília', () => {
		const agora = new Date('2026-11-09T15:00:00-03:00');
		const titulo = (ate: string) =>
			textoDaNotificacao({ kind: 'trial-acabando', data: { ate }, count: 1 }, agora).titulo;
		expect(titulo('2026-11-09T23:00:00-03:00')).toBe('Seu teste termina hoje');
		expect(titulo('2026-11-10T09:00:00-03:00')).toBe('Seu teste termina amanhã');
		expect(titulo('2026-11-12T09:00:00-03:00')).toBe('Seu teste termina em 3 dias');
	});
});

describe('diasAte', () => {
	it('conta dias de CALENDÁRIO de Brasília, não blocos de 24 h', () => {
		// 23h de um dia para 1h do seguinte: duas horas, mas é "amanhã".
		expect(diasAte('2026-11-10T01:00:00-03:00', new Date('2026-11-09T23:00:00-03:00'))).toBe(1);
		// 0h30 UTC do dia 10 ainda é dia 9 em Brasília.
		expect(diasAte('2026-11-10T00:30:00Z', new Date('2026-11-09T12:00:00-03:00'))).toBe(0);
	});
});

describe('juntarNomes', () => {
	it('o mais recente primeiro, sem repetir, com teto de cinco', () => {
		expect(juntarNomes(['Ana', 'Bia'], ['Caio'])).toEqual(['Caio', 'Ana', 'Bia']);
		expect(juntarNomes(['Ana', 'Bia'], ['Bia'])).toEqual(['Bia', 'Ana']);
		expect(juntarNomes(['a', 'b', 'c', 'd', 'e'], ['f'])).toEqual(['f', 'a', 'b', 'c', 'd']);
	});
});
