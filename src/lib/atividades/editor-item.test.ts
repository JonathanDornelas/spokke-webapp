import { describe, expect, it } from 'vitest';
import {
	chaveDoEnunciado,
	modoInicial,
	modosDeCorrecao,
	podeAlternar,
	ROTULO_DA_INTERACAO,
	textoEditavel
} from './editor-item';
import type { InteractionKind } from '$lib/kernel/interactions/types';

const TODAS: InteractionKind[] = [
	'type',
	'cloze',
	'choice',
	'assemble',
	'match',
	'order',
	'select',
	'speak'
];

describe('regras do editor de questão', () => {
	it('todo tipo tem rótulo em português, e nenhum é a chave do kernel', () => {
		for (const tipo of TODAS) {
			expect(ROTULO_DA_INTERACAO[tipo]).toBeTruthy();
			expect(ROTULO_DA_INTERACAO[tipo].toLowerCase()).not.toBe(tipo);
		}
	});

	it('só digitar e lacuna alternam, e só com resposta no idioma alvo', () => {
		expect(podeAlternar('type', 'target')).toBe(true);
		expect(podeAlternar('cloze', 'target')).toBe(true);
		expect(podeAlternar('type', 'source')).toBe(false);
		expect(podeAlternar('assemble', 'target')).toBe(false);
	});

	it('o texto de um áudio preso a peças não é editável; o de leitura é', () => {
		expect(textoEditavel('assemble', 'audio')).toBe(false);
		expect(textoEditavel('choice', 'audio')).toBe(false);
		expect(textoEditavel('assemble', 'text')).toBe(true);
		expect(textoEditavel('type', 'audio')).toBe(true);
	});

	it('a correção de digitar é automática ou do professor; a dos outros é a do tipo', () => {
		expect(modosDeCorrecao('type', 'tolerant')).toEqual(['tolerant', 'rubric']);
		expect(modosDeCorrecao('cloze', 'tolerant')).toEqual(['tolerant']);
		expect(modosDeCorrecao('assemble', 'sequence')).toEqual(['sequence']);
		// "exata" num digitar corrigia igual à tolerante: aparece como automática.
		expect(modoInicial('type', 'exact')).toBe('tolerant');
	});

	it('o enunciado padrão acompanha o tipo escolhido', () => {
		const gravado = { interacao: 'type' as const, chave: 'listen-and-type', prompt: 'audio' };
		expect(chaveDoEnunciado(gravado, 'type')).toBe('listen-and-type');
		expect(chaveDoEnunciado(gravado, 'cloze')).toBe('fill-the-blank');
		const lacuna = { interacao: 'cloze' as const, chave: 'fill-the-blank', prompt: 'text' };
		// Digitar com texto não tem um padrão que sirva a toda frase.
		expect(chaveDoEnunciado(lacuna, 'type')).toBe(undefined);
	});
});
