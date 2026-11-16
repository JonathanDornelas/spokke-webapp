import { describe, expect, it } from 'vitest';
import { ROTULO_DA_INTERACAO } from './editor-item';
import {
	FORMATOS_DO_TIPO,
	TIPOS_DE_QUESTAO,
	camposIniciais,
	enunciadoPadrao,
	fraseDaQuestao,
	questaoNova,
	tipoDaQuestao
} from './questao';

const CHAVES = [
	'choice',
	'assemble',
	'type',
	'cloze',
	'match',
	'order',
	'select',
	'speak'
] as const;

describe('regras do editor de questão', () => {
	it('todo tipo de interação tem rótulo em português, e nenhum é a chave do kernel', () => {
		for (const chave of CHAVES) {
			expect(ROTULO_DA_INTERACAO[chave]).toBeTruthy();
			expect(ROTULO_DA_INTERACAO[chave].toLowerCase()).not.toBe(chave);
		}
	});

	it('os oito formatos aparecem em algum tipo de questão', () => {
		const todos = new Set(TIPOS_DE_QUESTAO.flatMap((t) => FORMATOS_DO_TIPO[t]));
		expect([...todos].sort()).toEqual([...CHAVES].sort());
	});

	it('a questão gravada abre no tipo certo', () => {
		expect(tipoDaQuestao('audio', 'choice')).toBe('escuta');
		expect(tipoDaQuestao('text', 'speak')).toBe('fala');
		// Montar sem áudio é Leitura, como o kernel deriva (o roteiro e o celular dizem o mesmo).
		expect(tipoDaQuestao('text', 'assemble')).toBe('leitura');
		expect(tipoDaQuestao('text', 'match')).toBe('leitura');
		// O diálogo que o aluno OUVE é escuta, o de "Só texto" é leitura, e o que ele
		// responde falando é fala — os nomes do roteiro e do celular.
		expect(tipoDaQuestao('composite', 'choice', 'ambos')).toBe('escuta');
		expect(tipoDaQuestao('composite', 'assemble', 'audio')).toBe('escuta');
		expect(tipoDaQuestao('composite', 'choice', 'texto')).toBe('leitura');
		expect(tipoDaQuestao('composite', 'speak', 'ambos')).toBe('fala');
		expect(tipoDaQuestao('composite', 'choice')).toBe('leitura');
	});

	it('o enunciado padrão acompanha o formato, e o gravado vence quando nada mudou', () => {
		expect(enunciadoPadrao('escrita', 'cloze')).toBe('Complete a frase.');
		expect(enunciadoPadrao('escuta', 'type')).toBe('Ouça e escreva o que você ouviu.');
		// Digitar no texto não tem padrão: o professor escreve o dele.
		expect(enunciadoPadrao('escrita', 'type')).toBe('');
		const pergunta = {
			tipo: 'leitura' as const,
			interacao: 'choice' as const,
			chave: 'answer-about-passage',
			answerLang: 'target' as const
		};
		expect(enunciadoPadrao('leitura', 'choice', pergunta)).toBe('Responda sobre o texto.');
		expect(enunciadoPadrao('leitura', 'order', pergunta)).toBe('Coloque as falas na ordem certa.');
	});

	it('trocar de formato leva a frase alvo junto', () => {
		const lacuna = { interacao: 'cloze' as const, frase: 'She ___ here.', aceitas: ['works'] };
		const frase = fraseDaQuestao(lacuna);
		expect(frase).toBe('She works here.');
		expect(camposIniciais('speak', frase)).toEqual({
			interacao: 'speak',
			frase: 'She works here.'
		});
		expect(camposIniciais('choice', frase)).toEqual({
			interacao: 'choice',
			opcoes: ['She works here.', ''],
			certa: 0
		});
	});

	it('a questão nova começa no primeiro formato do tipo, com o enunciado dele', () => {
		expect(questaoNova('escuta')).toMatchObject({
			tipo: 'escuta',
			enunciado: 'Ouça e escolha o que você ouviu.',
			campos: { interacao: 'choice' }
		});
	});
});
