import { describe, expect, it } from 'vitest';
import { MAX_ITENS, TETO_POR_HABILIDADE, selectItems, separarPelaQuantidade } from './select';
import type { GenerationGroup } from './index';
import type { Item } from '../item';

/**
 * O filtro da etapa 1: quantas questões e quais habilidades. A habilidade de
 * cada item continua DERIVADA (kernel.md) — o que se testa aqui é o corte.
 */

let n = 0;
function item(tipo: 'leitura' | 'escuta' | 'fala' | 'escrita'): Item {
	n++;
	const base = {
		id: `itm_${n}`,
		sourceContentId: null,
		generatedBy: null,
		locale: { source: 'pt-BR', target: 'en-US' }
	};
	if (tipo === 'escuta') {
		// prompt de áudio → listening; `choice` não acrescenta writing.
		return {
			...base,
			prompt: { kind: 'audio', text: 'hello', instructionKey: 'listen-and-choose' },
			interaction: {
				type: 'choice',
				payload: { options: ['a', 'b'], correctIndex: 0 }
			},
			grading: { mode: 'exact' }
		} as Item;
	}
	if (tipo === 'fala') {
		return {
			...base,
			prompt: { kind: 'text', text: 'olá', instructionKey: 'say-in-target' },
			interaction: { type: 'speak', payload: { target: 'hello', hints: ['hello'] } },
			grading: { mode: 'asr' }
		} as Item;
	}
	if (tipo === 'escrita') {
		// text → reading, e `type` acrescenta writing.
		return {
			...base,
			prompt: { kind: 'text', text: 'olá', instructionKey: 'translate' },
			interaction: { type: 'type', payload: { accepted: ['hello'] } },
			grading: { mode: 'tolerant' }
		} as Item;
	}
	return {
		...base,
		prompt: { kind: 'text', text: 'olá', instructionKey: 'translate' },
		interaction: {
			type: 'assemble',
			payload: { tokens: ['hello'], distractors: [], accepted: [['hello']] }
		},
		grading: { mode: 'sequence' }
	} as Item;
}

function grupo(items: Item[]): GenerationGroup {
	return { contentId: `cnt_${items[0]?.id ?? '0'}`, kind: 'SentencePair', excerpt: '', items };
}

const TODAS = ['listening', 'speaking', 'reading', 'writing'] as const;

describe('selectItems', () => {
	it('respeita o alvo de questões', () => {
		const grupos = [grupo(Array.from({ length: 30 }, () => item('leitura')))];
		expect(selectItems(grupos, { target: 8, skills: [...TODAS] })).toHaveLength(8);
	});

	it('nunca passa do teto de 15, mesmo com alvo maior', () => {
		const grupos = [grupo(Array.from({ length: 40 }, () => item('leitura')))];
		expect(selectItems(grupos, { target: 99, skills: [...TODAS] })).toHaveLength(MAX_ITENS);
	});

	// Cada item de escuta é um par de arquivos de TTS a sintetizar, e cada um de
	// fala é uma gravação que o aluno precisa de silêncio para fazer.
	it('limita fala e escuta ao teto de cada uma', () => {
		const grupos = [
			grupo(Array.from({ length: 12 }, () => item('fala'))),
			grupo(Array.from({ length: 12 }, () => item('escuta')))
		];
		const escolhidos = selectItems(grupos, { target: MAX_ITENS, skills: [...TODAS] });
		const fala = escolhidos.filter((i) => i.interaction.type === 'speak').length;
		const escuta = escolhidos.filter((i) => i.prompt.kind === 'audio').length;
		expect(fala).toBe(TETO_POR_HABILIDADE.speaking);
		expect(escuta).toBe(TETO_POR_HABILIDADE.listening);
	});

	// "Ouça e escreva" é listening + writing: quem desmarcou escrita não quer
	// digitar, mesmo que o exercício também treine escuta.
	it('só aceita o item cujas habilidades foram TODAS pedidas', () => {
		const grupos = [grupo([item('escrita'), item('leitura')])];
		const so = selectItems(grupos, { target: 10, skills: ['reading'] });
		expect(so).toHaveLength(1);
		expect(so[0]?.interaction.type).toBe('assemble');
	});

	// Com 20 materiais e alvo de 12, pegar em sequência daria uma atividade
	// inteira sobre as duas primeiras frases.
	it('reparte entre os materiais em rodízio', () => {
		const grupos = [
			grupo([item('leitura'), item('leitura'), item('leitura')]),
			grupo([item('leitura'), item('leitura'), item('leitura')]),
			grupo([item('leitura'), item('leitura'), item('leitura')])
		];
		const escolhidos = selectItems(grupos, { target: 3, skills: [...TODAS] });
		const origens = new Set(
			escolhidos.map((escolhido) =>
				grupos.findIndex((g) => g.items.some((i) => i.id === escolhido.id))
			)
		);
		expect(origens.size).toBe(3);
	});

	// Pedido do dono do repositório: usar o máximo de materiais antes de repetir
	// um em outro tipo de questão. Dez frases e dez vagas têm de dar dez frases —
	// e não sete, com as três primeiras em dois exercícios cada, que era o que a
	// passada de cobertura provocava ao tirar as suas vagas dos primeiros
	// materiais sem que o rodízio descontasse isso.
	it('usa todos os materiais antes de repetir qualquer um', () => {
		const grupos = Array.from({ length: 10 }, () =>
			grupo([item('leitura'), item('escrita'), item('escuta'), item('fala')])
		);
		const escolhidos = selectItems(grupos, { target: 10, skills: [...TODAS] });
		const origem = (escolhido: Item) =>
			grupos.findIndex((g) => g.items.some((i) => i.id === escolhido.id));
		expect(new Set(escolhidos.map(origem)).size).toBe(10);

		// Com vagas sobrando, a segunda volta só começa depois de todos terem a primeira.
		const quinze = selectItems(grupos, { target: 15, skills: [...TODAS] });
		const contagem = new Map<number, number>();
		for (const escolhido of quinze)
			contagem.set(origem(escolhido), (contagem.get(origem(escolhido)) ?? 0) + 1);
		expect(contagem.size).toBe(10);
		expect(Math.max(...contagem.values())).toBe(2);
	});

	it('é determinístico — mesma entrada, mesma seleção', () => {
		const grupos = [grupo([item('leitura'), item('escuta'), item('fala'), item('escrita')])];
		const plano = { target: 3, skills: [...TODAS] };
		expect(selectItems(grupos, plano).map((i) => i.id)).toEqual(
			selectItems(grupos, plano).map((i) => i.id)
		);
	});

	// Bug real: o professor marcava só "fala" e recebia uma atividade VAZIA.
	// Todo item de fala mostra a frase escrita para o aluno dizer, então ele é
	// [reading, speaking] — e a regra literal exigia leitura marcada também.
	it('"fala" sozinha gera item de fala — ler o enunciado não é exigência', () => {
		const grupos = [grupo([item('leitura'), item('escrita'), item('fala')])];
		const so = selectItems(grupos, { target: 10, skills: ['speaking'] });
		expect(so).toHaveLength(1);
		expect(so[0]?.interaction.type).toBe('speak');
	});

	// A outra metade da mesma regra continua valendo: quem desmarcou escrita
	// não quer digitar, mesmo que o exercício também treine outra coisa.
	it('ainda recusa o item que exige uma habilidade não pedida', () => {
		const grupos = [grupo([item('escrita')])];
		expect(selectItems(grupos, { target: 10, skills: ['reading'] })).toHaveLength(0);
	});

	// Item cuja ÚNICA habilidade é leitura continua precisando dela marcada —
	// senão "leitura" deixaria de ser uma escolha.
	it('item só de leitura exige leitura pedida', () => {
		const grupos = [grupo([item('leitura')])];
		expect(selectItems(grupos, { target: 10, skills: ['speaking'] })).toHaveLength(0);
	});

	// Bug real: "escuta e fala" com 11 materiais devolvia 5 de escuta e nenhuma
	// de fala. O rodízio anda por POSIÇÃO, e o gerador de fala é o último da
	// fila — com mais materiais do que vagas, a vez dele nunca chegava.
	it('reserva uma vaga para cada habilidade pedida', () => {
		const grupos = Array.from({ length: 11 }, () => grupo([item('escuta'), item('fala')]));
		const escolhidos = selectItems(grupos, { target: 5, skills: ['listening', 'speaking'] });
		expect(escolhidos.some((i) => i.interaction.type === 'speak')).toBe(true);
		expect(escolhidos.some((i) => i.prompt.kind === 'audio')).toBe(true);
	});

	// Bug real: uma atividade de 5 questões saía com as 5 do mesmo gerador, uma
	// por frase — todo material entrega primeiro o mesmo exercício.
	it('varia o tipo de exercício entre os materiais', () => {
		const grupos = Array.from({ length: 6 }, () =>
			grupo([item('leitura'), item('escrita'), item('escuta')])
		);
		const escolhidos = selectItems(grupos, { target: 6, skills: [...TODAS] });
		const tipos = new Set(escolhidos.map((i) => i.prompt.kind + ':' + i.interaction.type));
		expect(tipos.size).toBeGreaterThan(1);
	});

	it('lista vazia de habilidades vale como "todas"', () => {
		const grupos = [grupo([item('leitura'), item('escrita'), item('fala')])];
		expect(selectItems(grupos, { target: 10, skills: [] })).toHaveLength(3);
	});
});

describe('tipos por material', () => {
	it('o material segue o bloco de cima quando não tem tipos próprios', () => {
		const a = grupo([item('leitura'), item('fala')]);
		const b = grupo([item('leitura'), item('fala')]);
		const escolhidos = selectItems([a, b], {
			target: 10,
			skills: ['reading'],
			skillsPorMaterial: {}
		});
		expect(escolhidos.every((i) => i.interaction.type === 'assemble')).toBe(true);
		expect(escolhidos).toHaveLength(2);
	});

	it('cada material gera só os tipos dele', () => {
		const a = grupo([item('leitura'), item('fala')]);
		const b = grupo([item('leitura'), item('fala')]);
		const escolhidos = selectItems([a, b], {
			target: 10,
			skills: ['reading', 'speaking'],
			skillsPorMaterial: { [a.contentId]: ['speaking'], [b.contentId]: ['reading'] }
		});
		const deA = escolhidos.filter((i) => a.items.includes(i));
		const deB = escolhidos.filter((i) => b.items.includes(i));
		expect(deA.map((i) => i.interaction.type)).toEqual(['speak']);
		expect(deB.map((i) => i.interaction.type)).toEqual(['assemble']);
	});

	it('material com todos os tipos desligados não gera nada', () => {
		const a = grupo([item('leitura'), item('escrita')]);
		const b = grupo([item('leitura')]);
		const escolhidos = selectItems([a, b], {
			target: 10,
			skills: [...TODAS],
			skillsPorMaterial: { [a.contentId]: [] }
		});
		expect(escolhidos.some((i) => a.items.includes(i))).toBe(false);
		expect(escolhidos).toHaveLength(1);
	});
});

describe('separarPelaQuantidade', () => {
	// A etapa de materiais não deixa questão de fora: gera para todos, e o que
	// passa do número pedido vai para a revisão como "fora".
	it('dentro é a seleção de sempre; fora é todo o resto que o professor quis', () => {
		const grupos = Array.from({ length: 4 }, () =>
			grupo([item('leitura'), item('escrita'), item('escuta')])
		);
		const plano = { target: 5, skills: [...TODAS] };
		const { dentro, fora } = separarPelaQuantidade(grupos, plano);
		expect(dentro).toEqual(selectItems(grupos, plano));
		expect(dentro.length + fora.length).toBe(12);
		const ids = [...dentro, ...fora].map((i) => i.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('fora não traz o que o professor desligou', () => {
		const a = grupo([item('leitura'), item('fala'), item('escrita')]);
		const { dentro, fora } = separarPelaQuantidade([a], {
			target: 1,
			skills: ['reading', 'writing'],
			skillsPorMaterial: { [a.contentId]: ['reading', 'writing'] }
		});
		expect([...dentro, ...fora].some((i) => i.interaction.type === 'speak')).toBe(false);
		expect(dentro.length + fora.length).toBe(2);
	});

	it('fora anda em rodízio: o primeiro de cada material, depois o segundo', () => {
		const a = grupo([item('leitura'), item('leitura'), item('leitura')]);
		const b = grupo([item('leitura'), item('leitura'), item('leitura')]);
		const { dentro, fora } = separarPelaQuantidade([a, b], { target: 2, skills: [...TODAS] });
		expect(dentro).toHaveLength(2);
		const origem = fora.map((i) => (a.items.includes(i) ? 'a' : 'b'));
		expect(origem).toEqual(['a', 'b', 'a', 'b']);
	});

	it('o fecho fica dentro e nunca aparece em fora', () => {
		const grupos = [grupo([item('leitura'), item('leitura'), item('leitura')])];
		const fecho = item('leitura');
		const { dentro, fora } = separarPelaQuantidade(
			grupos,
			{ target: 2, skills: [...TODAS] },
			fecho
		);
		expect(dentro.at(-1)).toBe(fecho);
		expect(fora).not.toContain(fecho);
	});
});
