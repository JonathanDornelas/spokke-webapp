import { describe, expect, it } from 'vitest';
import { conferirItem, ordenarProblemas, temErro } from './index';
import type { Item } from '../item';
import { interactionRegistry } from '../interactions/registry';
import { runGenerators, type StoredContentUnit } from '../generators';
import { separarPelaQuantidade } from '../generators/select';
import { distractorPhrases } from '../generators/distractors';
import { esES } from '../language/profiles/es-ES';
import { ptBR } from '../language/profiles/pt-BR';
import { enUS } from '../language/profiles/en-US';
import { jaJP } from '../language/profiles/ja-JP';

/**
 * A CONFERÊNCIA de qualidade (kernel.md "Conferência de qualidade"): as regras
 * que cada formato aplica a si mesmo, sem saber idioma nenhum. O caso que abriu
 * tudo é o primeiro: "la cometa" traduzida como "la cometa".
 */

const espanhol = { alvo: esES, origem: ptBR };
const ingles = { alvo: enUS, origem: ptBR };

function questao(parcial: Partial<Item> & Pick<Item, 'prompt' | 'interaction'>): Item {
	return {
		id: 'q',
		sourceContentId: null,
		generatedBy: null,
		grading: { mode: 'exact' },
		locale: { source: 'pt-BR', target: 'es-ES' },
		...parcial
	};
}

const codigos = (item: Item, perfis = espanhol) => conferirItem(item, perfis).map((p) => p.codigo);

describe('o caso da "la cometa": a tradução que voltou sem traduzir', () => {
	const vocabulario: StoredContentUnit[] = [
		{ id: 'v1', kind: 'VocabItem', data: { term: 'la cometa', translation: 'la cometa' } },
		{ id: 'v2', kind: 'VocabItem', data: { term: 'el perro', translation: 'o cachorro' } },
		{ id: 'v3', kind: 'VocabItem', data: { term: 'la casa', translation: 'a casa' } }
	];
	const { groups } = runGenerators(vocabulario, {
		targetProfile: esES,
		sourceProfile: ptBR,
		seed: 'cometa',
		capabilities: { asr: true, tts: true }
	});
	const daCometa = groups.find((g) => g.contentId === 'v1')!.items;
	const doGerador = (id: string) => daCometa.find((i) => i.generatedBy === id)!;

	it('reprova toda questão que mostra a resposta', () => {
		for (const id of ['vocab-choice', 'vocab-choice-term', 'vocab-type', 'listen-vocab-choice']) {
			const problemas = conferirItem(doGerador(id), espanhol);
			expect(temErro(problemas), id).toBe(true);
			expect(problemas.map((p) => p.codigo)).toContain('resposta-igual-ao-enunciado');
		}
	});

	it('não reprova o ditado: ouvir "la cometa" e escrever "la cometa" é a própria questão', () => {
		expect(conferirItem(doGerador('listen-vocab-type'), espanhol)).toEqual([]);
	});

	it('avisa na fala: a tradução de apoio é a frase sem traduzir', () => {
		const fala = doGerador('speak-vocab');
		expect(codigos(fala)).toEqual(['traducao-igual-ao-original']);
		expect(temErro(conferirItem(fala, espanhol))).toBe(false);
	});

	it('o vocabulário bem traduzido passa limpo', () => {
		const doCachorro = groups.find((g) => g.contentId === 'v2')!.items;
		for (const item of doCachorro) {
			expect(conferirItem(item, espanhol), item.generatedBy ?? '').toEqual([]);
		}
	});

	it('o termo sem tradução não empresta "sentido" às questões dos outros', () => {
		// "la cometa" como alternativa errada de "el perro" apareceria em espanhol no
		// meio dos sentidos em português.
		const todas = groups.filter((g) => g.contentId !== 'v1').flatMap((g) => g.items);
		const deSentido = todas.filter(
			(i) => i.generatedBy === 'vocab-choice' || i.generatedBy === 'listen-vocab-choice'
		);
		expect(deSentido.length).toBeGreaterThan(0);
		for (const item of deSentido) {
			const { options } = item.interaction.payload as { options: string[] };
			expect(options).not.toContain('la cometa');
		}
	});

	it('e não entra no "ligue os pares" que fecha a atividade: ele se ligaria sozinho', () => {
		const { closing } = runGenerators(vocabulario, {
			targetProfile: esES,
			sourceProfile: ptBR,
			seed: 'cometa',
			capabilities: { asr: false, tts: false }
		});
		const { pairs } = closing!.interaction.payload as { pairs: { left: string }[] };
		expect(pairs.map((p) => p.left).sort()).toEqual(['el perro', 'la casa']);
		expect(conferirItem(closing!, espanhol)).toEqual([]);
	});
});

describe('as alternativas erradas, na origem', () => {
	it('uma por forma normalizada: "a casa" e "A casa." não viram duas alternativas iguais', () => {
		const erradas = distractorPhrases(
			['a casa', 'A casa.', 'o gato', '...', 'o cachorro'],
			'o cachorro',
			5,
			ptBR,
			'seed'
		);
		expect([...erradas].sort()).toEqual(['a casa', 'o gato']);
	});
});

describe('choice', () => {
	it('duas alternativas iguais: a correção é pelo índice e reprova quem acertou', () => {
		const item = questao({
			prompt: { kind: 'text', text: 'the kite' },
			interaction: {
				type: 'choice',
				payload: { options: ['a pipa', 'o cachorro', 'A pipa.'], correctIndex: 0 }
			}
		});
		const problemas = conferirItem(item, ingles);
		expect(problemas).toEqual([
			{ codigo: 'alternativas-repetidas', gravidade: 'erro', trecho: 'a pipa' }
		]);
	});

	it('"ouça e escolha o que ouviu": a certa igual ao áudio é a questão, não um erro', () => {
		const item = questao({
			prompt: { kind: 'audio', text: 'the kite' },
			interaction: {
				type: 'choice',
				payload: { options: ['the kite', 'the dog'], correctIndex: 0 }
			}
		});
		expect(conferirItem(item, ingles)).toEqual([]);
	});

	it('alternativa que some no normalizador', () => {
		const item = questao({
			prompt: { kind: 'text', text: 'the kite' },
			interaction: { type: 'choice', payload: { options: ['a pipa', '...'], correctIndex: 0 } }
		});
		expect(codigos(item, ingles)).toEqual(['texto-vazio']);
	});
});

describe('assemble', () => {
	it('o gabarito pede uma peça que não está no banco', () => {
		const item = questao({
			prompt: { kind: 'text', text: 'Eu moro aqui.' },
			interaction: {
				type: 'assemble',
				payload: {
					tokens: ['I', 'live', 'here'],
					distractors: [],
					accepted: [
						['I', 'live', 'here'],
						['Here', 'I', 'live', 'now']
					]
				}
			},
			grading: { mode: 'sequence' }
		});
		expect(codigos(item, ingles)).toEqual(['peca-faltando']);
	});

	it('peça repetida conta: "the" duas vezes pede duas peças', () => {
		const item = questao({
			prompt: { kind: 'text', text: 'O gato vê o cachorro.' },
			interaction: {
				type: 'assemble',
				payload: {
					tokens: ['The', 'cat', 'sees', 'dog'],
					distractors: [],
					accepted: [['The', 'cat', 'sees', 'the', 'dog']]
				}
			},
			grading: { mode: 'sequence' }
		});
		expect(conferirItem(item, ingles)).toEqual([
			{ codigo: 'peca-faltando', gravidade: 'erro', trecho: 'the' }
		]);
	});

	it('a frase a montar escrita no enunciado, comparada pelo segmentador (regra nº 5)', () => {
		const item = questao({
			prompt: { kind: 'text', text: '私は学生です。' },
			interaction: {
				type: 'assemble',
				payload: {
					tokens: ['私', 'は', '学生', 'です'],
					distractors: [],
					accepted: [['私', 'は', '学生', 'です']]
				}
			},
			grading: { mode: 'sequence' },
			locale: { source: 'pt-BR', target: 'ja-JP' }
		});
		expect(codigos(item, { alvo: jaJP, origem: ptBR })).toEqual(['resposta-igual-ao-enunciado']);
	});

	it('o ditado de montar (áudio) não compara com o que se ouve', () => {
		const item = questao({
			prompt: { kind: 'audio', text: 'I live here' },
			interaction: {
				type: 'assemble',
				payload: {
					tokens: ['I', 'live', 'here'],
					distractors: [],
					accepted: [['I', 'live', 'here']]
				}
			},
			grading: { mode: 'sequence' }
		});
		expect(conferirItem(item, ingles)).toEqual([]);
	});
});

describe('type', () => {
	const traducao = (accepted: string[]) =>
		questao({
			prompt: {
				kind: 'text',
				text: 'She will call you later.',
				instructionKey: 'translate-to-source'
			},
			interaction: { type: 'type', payload: { accepted } },
			grading: { mode: 'tolerant', tolerance: 0.9, answerLang: 'source' }
		});

	it('tradução de frase com UMA resposta aceita: aviso, porque reprova quem acerta diferente', () => {
		expect(conferirItem(traducao(['Ela vai ligar para você mais tarde.']), ingles)).toEqual([
			{ codigo: 'resposta-unica-na-traducao', gravidade: 'aviso' }
		]);
	});

	it('com as outras traduções certas, o aviso some', () => {
		expect(
			conferirItem(
				traducao(['Ela vai ligar para você mais tarde.', 'Ela vai te ligar mais tarde.']),
				ingles
			)
		).toEqual([]);
	});

	it('frase curta não pede variação: "Bom dia" quase não tem outro jeito', () => {
		const item = questao({
			prompt: { kind: 'text', text: 'Good morning' },
			interaction: { type: 'type', payload: { accepted: ['Bom dia'] } },
			grading: { mode: 'tolerant', answerLang: 'source' }
		});
		expect(conferirItem(item, ingles)).toEqual([]);
	});

	it('escrita livre (rubrica) não tem gabarito a conferir', () => {
		const item = questao({
			prompt: { kind: 'text', text: 'Fale do seu fim de semana.' },
			interaction: { type: 'type', payload: { accepted: ['Fale do seu fim de semana.'] } },
			grading: { mode: 'rubric', answerLang: 'target' }
		});
		expect(conferirItem(item, ingles)).toEqual([]);
	});
});

describe('cloze', () => {
	it('o texto da lacuna sem lacuna', () => {
		const item = questao({
			prompt: { kind: 'text', text: 'Eu tenho um gato.' },
			interaction: { type: 'cloze', payload: { masked: 'I have a cat.', accepted: ['have'] } },
			grading: { mode: 'tolerant' }
		});
		expect(codigos(item, ingles)).toEqual(['lacuna-ausente']);
	});

	it('a palavra da lacuna escrita na frase de apoio (o cognato)', () => {
		const item = questao({
			prompt: { kind: 'text', text: 'Eu fiquei no hotel.' },
			interaction: {
				type: 'cloze',
				payload: { masked: 'I stayed at the ___.', accepted: ['hotel'] }
			},
			grading: { mode: 'tolerant' }
		});
		expect(conferirItem(item, ingles)).toEqual([
			{ codigo: 'lacuna-no-apoio', gravidade: 'aviso', trecho: 'hotel' }
		]);
	});

	it('palavra curta igual por acaso não conta: o "a" do inglês não é o artigo do português', () => {
		const item = questao({
			prompt: { kind: 'text', text: 'Ela é a professora.' },
			interaction: { type: 'cloze', payload: { masked: 'She is ___ teacher.', accepted: ['a'] } },
			grading: { mode: 'tolerant' }
		});
		expect(conferirItem(item, ingles)).toEqual([]);
	});
});

describe('match, order e select', () => {
	it('match: o mesmo termo dos dois lados de duas linhas, e o par que se liga sozinho', () => {
		const item = questao({
			prompt: { kind: 'text' },
			interaction: {
				type: 'match',
				payload: {
					pairs: [
						{ left: 'book', right: 'livro' },
						{ left: 'notebook', right: 'livro' },
						{ left: 'hotel', right: 'hotel' }
					]
				}
			},
			grading: { mode: 'set' }
		});
		expect(ordenarProblemas(conferirItem(item, ingles))).toEqual([
			{ codigo: 'pares-repetidos', gravidade: 'erro', trecho: 'livro' },
			{ codigo: 'par-igual-nos-dois-lados', gravidade: 'aviso', trecho: 'hotel' }
		]);
	});

	it('order: duas falas iguais deixam a ordem ambígua', () => {
		const item = questao({
			prompt: { kind: 'text' },
			interaction: { type: 'order', payload: { lines: ['Hi!', 'Hello.', 'Hi'] } },
			grading: { mode: 'sequence' }
		});
		expect(codigos(item, ingles)).toEqual(['falas-repetidas']);
	});

	it('select: a palavra certa duas vezes na frase', () => {
		const item = questao({
			prompt: { kind: 'text', text: 'casa' },
			interaction: {
				type: 'select',
				payload: {
					segments: [
						{ text: 'The', selectable: true },
						{ text: ' ', selectable: false },
						{ text: 'house', selectable: true },
						{ text: ' ', selectable: false },
						{ text: 'is', selectable: true },
						{ text: ' ', selectable: false },
						{ text: 'a', selectable: true },
						{ text: ' ', selectable: false },
						{ text: 'House', selectable: true }
					],
					correctIndex: 2
				}
			}
		});
		expect(codigos(item, ingles)).toEqual(['palavra-certa-repetida']);
	});
});

describe('o registry', () => {
	it('toda interação registrada confere a si mesma', () => {
		for (const interacao of Object.values(interactionRegistry)) {
			expect(typeof interacao.conferir, interacao.id).toBe('function');
		}
	});

	it('payload que não passa no schema vira problema, nunca exceção', () => {
		const item = questao({
			prompt: { kind: 'text', text: 'x' },
			interaction: { type: 'choice', payload: { options: ['só uma'], correctIndex: 3 } }
		});
		expect(conferirItem(item, ingles)).toEqual([{ codigo: 'formato-invalido', gravidade: 'erro' }]);
	});
});

describe('na geração: a reprovada não entra sozinha', () => {
	const unidades: StoredContentUnit[] = [
		{ id: 'v1', kind: 'VocabItem', data: { term: 'la cometa', translation: 'la cometa' } },
		{ id: 'v2', kind: 'VocabItem', data: { term: 'el perro', translation: 'o cachorro' } },
		{ id: 'v3', kind: 'VocabItem', data: { term: 'la casa', translation: 'a casa' } },
		{ id: 'v4', kind: 'VocabItem', data: { term: 'el gato', translation: 'o gato' } }
	];
	const { groups, closing } = runGenerators(unidades, {
		targetProfile: esES,
		sourceProfile: ptBR,
		seed: 'geracao',
		capabilities: { asr: false, tts: false }
	});
	const reprovado = (item: Item) => temErro(conferirItem(item, espanhol));
	const plano = { target: 15, skills: ['reading', 'writing'] as ('reading' | 'writing')[] };

	it('vai para o FIM das de fora, e as limpas tomam a vaga', () => {
		const { dentro, fora } = separarPelaQuantidade(groups, plano, closing, reprovado);
		expect(dentro.some(reprovado)).toBe(false);
		const reprovadas = fora.filter(reprovado);
		expect(reprovadas.length).toBeGreaterThan(0);
		// Todas no fim: depois da primeira reprovada, nenhuma limpa.
		const primeira = fora.findIndex(reprovado);
		expect(fora.slice(primeira).every(reprovado)).toBe(true);
	});

	it('sem conferência, o comportamento é o de sempre', () => {
		const antes = separarPelaQuantidade(groups, plano, closing);
		expect(antes.dentro.some(reprovado)).toBe(true);
	});
});
