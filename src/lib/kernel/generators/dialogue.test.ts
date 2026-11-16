import { describe, expect, it } from 'vitest';
import { runGenerators, type GenerationOptions, type StoredContentUnit } from './index';
import { mostraDoDialogo } from './dialogue';
import { ptBR } from '../language/profiles/pt-BR';
import { enUS } from '../language/profiles/en-US';
import { arSA } from '../language/profiles/ar-SA';
import { promptSkills } from '../interactions/skills';
import { getInteraction } from '../interactions/registry';
import type { Item } from '../item';

const options: GenerationOptions = {
	targetProfile: enUS,
	sourceProfile: ptBR,
	seed: 'seed-dialogo',
	capabilities: { asr: true, tts: true }
};

const dialogo: StoredContentUnit = {
	id: 'dlg_1',
	kind: 'Dialogue',
	data: {
		lines: [
			{ speaker: 'Ana', text: 'Hi, are you new here?' },
			{ speaker: 'Ben', text: 'Yes, I started this week.' },
			{ speaker: 'Ana', text: 'Welcome to the team!' },
			{ speaker: 'Ben', text: 'Thanks, everyone has been very kind.' },
			{ speaker: 'Ana', text: 'Let me show you the kitchen.' },
			{ speaker: 'Ben', text: 'That would be great.' }
		],
		questions: [
			{ question: 'When did Ben start?', answer: 'This week' },
			{ question: 'What will Ana show him?', answer: 'The kitchen' }
		]
	}
};

const itensDe = (unidades: StoredContentUnit[], extra: Partial<GenerationOptions> = {}): Item[] =>
	runGenerators(unidades, { ...options, ...extra }).groups.flatMap((g) => g.items);

describe('mostraDoDialogo', () => {
	it('até B1 (e sem nível) o texto vem junto do áudio; de B2 para cima, só o áudio', () => {
		expect(mostraDoDialogo(null, true)).toBe('ambos');
		expect(mostraDoDialogo('A1', true)).toBe('ambos');
		expect(mostraDoDialogo('B1', true)).toBe('ambos');
		expect(mostraDoDialogo('B2', true)).toBe('audio');
		expect(mostraDoDialogo('C2', true)).toBe('audio');
	});

	it('sem voz, só o texto, em qualquer nível', () => {
		expect(mostraDoDialogo('C1', false)).toBe('texto');
	});
});

describe('dialogue-comprehension', () => {
	it('uma questão por pergunta, com o diálogo inteiro antes e as outras respostas de erradas', () => {
		const perguntas = itensDe([dialogo]).filter((i) => i.generatedBy === 'dialogue-comprehension');
		expect(perguntas).toHaveLength(2);
		const [primeira] = perguntas;
		expect(primeira!.prompt.text).toBe('When did Ben start?');
		expect(primeira!.prompt.contexto).toMatchObject({ tipo: 'dialogo', mostra: 'ambos' });
		expect(
			primeira!.prompt.contexto?.tipo === 'dialogo' && primeira!.prompt.contexto.ate
		).toBeFalsy();
		expect(primeira!.interaction.payload).toMatchObject({ options: ['This week', 'The kitchen'] });
	});
});

describe('dialogue-next-line', () => {
	const paradas = () => itensDe([dialogo]).filter((i) => i.generatedBy === 'dialogue-next-line');

	it('para em falas sorteadas, nunca na primeira, de qualquer pessoa', () => {
		const itens = paradas();
		expect(itens.length).toBeGreaterThanOrEqual(2);
		expect(itens.length).toBeLessThanOrEqual(3);
		for (const item of itens) {
			const contexto = item.prompt.contexto;
			expect(contexto?.tipo).toBe('dialogo');
			if (contexto?.tipo === 'dialogo') expect(contexto.ate).toBeGreaterThanOrEqual(1);
		}
	});

	it('o mesmo diálogo rende tipos diferentes de questão', () => {
		const tipos = new Set(paradas().map((i) => i.interaction.type));
		expect(tipos.size).toBeGreaterThanOrEqual(2);
	});

	it('é determinística: a mesma seed dá as mesmas paradas', () => {
		expect(paradas()).toEqual(paradas());
	});

	it('sem ASR, nenhuma parada pede para falar', () => {
		const itens = itensDe([dialogo], { capabilities: { asr: false, tts: true } }).filter(
			(i) => i.generatedBy === 'dialogue-next-line'
		);
		expect(itens.every((i) => i.interaction.type !== 'speak')).toBe(true);
		expect(itens.length).toBeGreaterThan(0);
	});

	it('a fala da parada não está em nenhuma alternativa errada nem nas peças a mais', () => {
		for (const item of paradas()) {
			const contexto = item.prompt.contexto;
			if (contexto?.tipo !== 'dialogo' || contexto.ate === undefined) continue;
			const alvo = contexto.falas[contexto.ate]!.texto;
			if (item.interaction.type === 'choice') {
				const { options: opcoes } = item.interaction.payload as { options: string[] };
				expect(opcoes.filter((o) => o === alvo)).toHaveLength(1);
			}
		}
	});

	it('as erradas da escolha nunca são falas que já estão na tela', () => {
		let escolhas = 0;
		for (const seed of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
			for (const item of itensDe([dialogo], { seed })) {
				const contexto = item.prompt.contexto;
				if (item.interaction.type !== 'choice' || contexto?.tipo !== 'dialogo') continue;
				if (contexto.ate === undefined) continue;
				escolhas++;
				const ditas = contexto.falas.slice(0, contexto.ate).map((f) => f.texto);
				const { options: opcoes } = item.interaction.payload as { options: string[] };
				expect(opcoes.filter((o) => ditas.includes(o))).toEqual([]);
			}
		}
		expect(escolhas).toBeGreaterThan(0);
	});

	it('sem fala que o aluno ainda não viu, a parada não vira escolha (nunca inventa errada)', () => {
		const curto: StoredContentUnit = {
			id: 'dlg_curto',
			kind: 'Dialogue',
			data: {
				lines: [
					{ speaker: 'Ana', text: 'Hi there!' },
					{ speaker: 'Ben', text: 'Hello, nice to meet you.' }
				],
				questions: []
			}
		};
		for (const seed of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
			const itens = itensDe([curto], { seed }).filter(
				(i) => i.generatedBy === 'dialogue-next-line'
			);
			expect(itens).toHaveLength(1);
			expect(itens[0]!.interaction.type).not.toBe('choice');
		}
	});

	it('a habilidade sai do que o aluno recebe: de B2 para cima é escuta sem leitura', () => {
		const item = itensDe([dialogo], { nivel: 'C1' }).find(
			(i) => i.generatedBy === 'dialogue-next-line' && i.interaction.type !== 'speak'
		)!;
		expect(promptSkills(item.prompt)).toEqual(['listening']);
		const facil = itensDe([dialogo], { nivel: 'A2' }).find(
			(i) => i.generatedBy === 'dialogue-next-line' && i.interaction.type !== 'speak'
		)!;
		expect(promptSkills(facil.prompt)).toEqual(['listening', 'reading']);
	});

	it('idioma sem voz recebe o diálogo só em texto (leitura)', () => {
		const semVoz: StoredContentUnit = { ...dialogo, id: 'dlg_ar' };
		const item = itensDe([semVoz], { targetProfile: arSA }).find(
			(i) => i.generatedBy === 'dialogue-next-line'
		);
		expect(item?.prompt.contexto).toMatchObject({ mostra: 'texto' });
	});

	it('material sem escuta recebe o diálogo LIDO (senão o corte tiraria todas as questões dele)', () => {
		const semEscuta = itensDe([dialogo], { pedidasPara: () => ['reading', 'speaking'] }).filter(
			(i) => i.prompt.contexto?.tipo === 'dialogo'
		);
		expect(semEscuta.length).toBeGreaterThan(0);
		for (const item of semEscuta) expect(item.prompt.contexto).toMatchObject({ mostra: 'texto' });
		const comEscuta = itensDe([dialogo], { pedidasPara: () => ['listening'] }).find(
			(i) => i.prompt.contexto?.tipo === 'dialogo'
		);
		expect(comEscuta?.prompt.contexto).toMatchObject({ mostra: 'ambos' });
	});

	it('cada parada é uma questão válida no registry', () => {
		for (const item of paradas()) {
			const interacao = getInteraction(item.interaction.type);
			expect(() => interacao.toRuntime(item.interaction.payload, 'seed')).not.toThrow();
		}
	});
});

describe('passage-comprehension', () => {
	it('leva o TRECHO junto da pergunta (antes só a pergunta chegava ao aluno)', () => {
		const texto: StoredContentUnit = {
			id: 'psg_1',
			kind: 'Passage',
			data: {
				title: 'Maria',
				text: 'Maria has lived in Lisbon since 2019.',
				questions: [
					{ question: 'Where does Maria live?', answer: 'In Lisbon' },
					{ question: 'Since when?', answer: 'Since 2019' }
				]
			}
		};
		const item = itensDe([texto]).find((i) => i.generatedBy === 'passage-comprehension')!;
		expect(item.prompt.contexto).toEqual({
			tipo: 'texto',
			texto: 'Maria has lived in Lisbon since 2019.'
		});
		expect(promptSkills(item.prompt)).toEqual(['reading']);
	});
});
