import { describe, expect, it } from 'vitest';
import {
	compararPronuncia,
	compararSons,
	leituraDaPronuncia,
	passosDaBoca,
	pronunciaDe,
	RIGORES,
	silabar,
	type RigorDaPronuncia,
	type SomOuvido
} from './pronuncia';
import { segmentar, tracosDe } from './fones';
import { pronunciaEmInglesAmericano as regras } from './profiles/en-pronuncia';
import { speak } from '../interactions/speak';
import { enUS } from './profiles/en-US';

const PRIORITY = 'P R AY0 AO1 R AH0 T IY0'.split(' ');

describe('silabar', () => {
	it('divide pelo ataque máximo e marca a tônica: priority', () => {
		const silabas = silabar(PRIORITY, regras);
		expect(silabas.map((s) => s.leitura)).toEqual(['prai', 'aw', 'ruh', 'tee']);
		expect(silabas.map((s) => s.tonica)).toEqual([false, true, false, false]);
		expect(leituraDaPronuncia(pronunciaDe(PRIORITY, regras))).toBe('prai · AW · ruh · tee');
	});

	it('leva ao começo da sílaba seguinte só o ataque que o idioma aceita', () => {
		// "extra": K S T R entre as vogais; "str" começa sílaba, "k" fecha a anterior.
		const silabas = silabar('EH1 K S T R AH0'.split(' '), regras);
		expect(silabas.map((s) => s.leitura)).toEqual(['ehk', 'struh']);
		// "singer": o NG nunca começa sílaba.
		expect(silabar('S IH1 NG ER0'.split(' '), regras).map((s) => s.leitura)).toEqual([
			'sing',
			'ur'
		]);
	});

	it('palavra de uma sílaba é uma sílaba só, com as consoantes das pontas', () => {
		expect(silabar('TH AO1 T'.split(' '), regras).map((s) => s.leitura)).toEqual(['thawt']);
	});
});

describe('passosDaBoca', () => {
	it('um visema por som, dois no ditongo, e a vogal pesa mais', () => {
		const passos = passosDaBoca(pronunciaDe(PRIORITY, regras), regras);
		// P R AY(a+i) AO R AH T IY
		expect(passos.map((p) => p.visema)).toEqual(['mbp', 'r', 'a', 'i', 'o', 'r', 'e', 'tdn', 'i']);
		expect(passos.find((p) => p.visema === 'o')!.peso).toBeGreaterThan(
			passos.find((p) => p.visema === 'mbp')!.peso
		);
		// Cada passo sabe a sílaba em que cai.
		expect(passos.map((p) => p.silaba)).toEqual([0, 0, 0, 0, 1, 2, 2, 3, 3]);
	});
});

describe('compararPronuncia', () => {
	const esperada = pronunciaDe(PRIORITY, regras);

	it('os mesmos sons: nenhuma sílaba fora, e o acento não conta', () => {
		const r = compararPronuncia(esperada, 'P R AY1 AO2 R AH0 T IY1'.split(' '));
		expect(r.fora).toBe(0);
	});

	it('um som trocado marca só a sílaba dele', () => {
		// "prai · aw · ri · tee": o AH virou IH.
		const r = compararPronuncia(esperada, 'P R AY0 AO1 R IH0 T IY0'.split(' '));
		expect(r.silabas.map((s) => s.ok)).toEqual([true, true, false, true]);
		expect(r.fora).toBe(1);
	});

	it('som que faltou e som a mais também marcam a sílaba', () => {
		const faltou = compararPronuncia(esperada, 'P R AY0 AO1 R AH0 IY0'.split(' '));
		expect(faltou.silabas.map((s) => s.ok)).toEqual([true, true, true, false]);
		const sobrou = compararPronuncia(esperada, 'S P R AY0 AO1 R AH0 T IY0'.split(' '));
		expect(sobrou.silabas.map((s) => s.ok)).toEqual([false, true, true, true]);
	});
});

describe('speak com pronúncia: a correção rígida', () => {
	const payload = {
		target: 'priority',
		hints: [],
		pronuncia: pronunciaDe(PRIORITY, regras)
	};
	const corrigir = (transcript: string, fonemas?: string[]) => {
		const r = speak.grade(payload, { transcript, fonemas }, enUS, 's');
		if (!r.ok) throw new Error(r.error);
		return r.value;
	};

	it('a palavra certa é "Correto", com todas as sílabas marcadas certas', () => {
		const v = corrigir('Priority.');
		expect(v.value).toBe(1);
		expect(v.marks?.every((m) => m.ok)).toBe(true);
	});

	it('uma sílaba fora é "Quase", e o retorno diz qual', () => {
		const v = corrigir('priori tea', 'P R AY0 AO1 R IH0 T IY0'.split(' '));
		expect(v.value).toBe(0.5);
		expect(v.marks?.map((m) => m.ok)).toEqual([true, true, false, true]);
		expect(v.feedback).toContain('"ruh"');
	});

	it('duas sílabas fora é erro, sem o piso de 0,3 da fala comum', () => {
		const v = corrigir('prairie', 'P R EH1 R IY0'.split(' '));
		expect(v.value).toBe(0);
		expect(v.marks?.filter((m) => !m.ok).length).toBeGreaterThanOrEqual(2);
	});

	it('sem os sons do que se ouviu, vale a palavra', () => {
		expect(corrigir('banana').value).toBe(0);
		expect(corrigir('').feedback).toContain('Não deu para ouvir');
	});

	it('o runtime leva as sílabas e os fonemas, sem nada além do alvo que o aluno já vê', () => {
		const rt = speak.toRuntime(payload, 's');
		expect(rt.target).toBe('priority');
		expect(rt.silabas?.map((s) => s.leitura)).toEqual(['prai', 'aw', 'ruh', 'tee']);
		expect(rt.fonemas).toEqual(PRIORITY);
		// Sem rigor gravado (questão de antes dos níveis), vale o normal.
		expect(rt.rigor).toBe('normal');
	});
});

// O que o reconhecedor de fonemas OUVIU na bancada (docs/plano-dialogo-e-pronuncia.md):
// as vozes nativas do Kokoro dizendo a palavra certa e com os erros típicos de
// brasileiro, copiadas do resultado tal como saíram.
const BANCADA = {
	priorityCerto: [
		{ s: 'p', p: 0.98 },
		{ s: 'ɹ', p: 0.79 },
		{ s: 'aɪ', p: 0.89 },
		{
			s: 'oː',
			p: 0.35,
			alt: [
				{ s: 'ɔ', p: 0.22 },
				{ s: 'oʊ', p: 0.08 }
			]
		},
		{ s: 'ɹ', p: 0.82 },
		{
			s: 'ɪ',
			p: 0.57,
			alt: [
				{ s: 'ə', p: 0.13 },
				{ s: 'ᵻ', p: 0.08 }
			]
		},
		{ s: 'ɾ', p: 0.83 },
		{
			s: 'i',
			p: 0.63,
			alt: [
				{ s: 'iː', p: 0.13 },
				{ s: 'ɨ', p: 0.06 }
			]
		}
	],
	// A voz masculina põe um [j] de passagem entre o [aɪ] e o [o].
	priorityComPassagem: [
		{ s: 'p', p: 0.97 },
		{ s: 'ɹ', p: 0.89 },
		{ s: 'aɪ', p: 0.8 },
		{ s: 'j', p: 0.83 },
		{ s: 'oː', p: 0.22, alt: [{ s: 'oʊ', p: 0.13 }] },
		{ s: 'ɹ', p: 0.9 },
		{
			s: 'ɪ',
			p: 0.45,
			alt: [
				{ s: 'ᵻ', p: 0.12 },
				{ s: 'ə', p: 0.11 }
			]
		},
		{ s: 'ɾ', p: 0.67, alt: [{ s: 't', p: 0.17 }] },
		{
			s: 'i',
			p: 0.76,
			alt: [
				{ s: 'iː', p: 0.07 },
				{ s: 'ɪ', p: 0.06 }
			]
		}
	],
	priorityRDeRato: [
		{ s: 'p', p: 0.77 },
		{ s: 'ɹ', p: 0.67 },
		{
			s: 'aɪ',
			p: 0.21,
			alt: [
				{ s: 'ɑɨ', p: 0.08 },
				{ s: 'eɪ', p: 0.07 }
			]
		},
		{
			s: 'ɔ',
			p: 0.54,
			alt: [
				{ s: 'ɑː', p: 0.15 },
				{ s: 'oː', p: 0.08 }
			]
		},
		{ s: 'h', p: 0.81 },
		{
			s: 'ɨ',
			p: 0.26,
			alt: [
				{ s: 'iː', p: 0.25 },
				{ s: 'ɪ', p: 0.07 }
			]
		},
		{ s: 't', p: 0.59, alt: [{ s: 'd', p: 0.21 }] },
		{
			s: 'iː',
			p: 0.32,
			alt: [
				{ s: 'ɨ', p: 0.25 },
				{ s: 'i', p: 0.12 }
			]
		}
	],
	// O estalo do k final sai como um [ə] fraco.
	thinkCerto: [
		{
			s: 'θ',
			p: 0.41,
			alt: [
				{ s: 'ð', p: 0.36 },
				{ s: 'f', p: 0.06 }
			]
		},
		{ s: 'ɪ', p: 0.7, alt: [{ s: 'i', p: 0.06 }] },
		{ s: 'ŋ', p: 0.87, alt: [{ s: 'n', p: 0.07 }] },
		{ s: 'k', p: 0.98 },
		{
			s: 'ə',
			p: 0.38,
			alt: [
				{ s: 'ɐ', p: 0.07 },
				{ s: 'ɚ', p: 0.06 }
			]
		}
	],
	thinkComT: [
		{ s: 't', p: 0.88 },
		{
			s: 'ɪ',
			p: 0.16,
			alt: [
				{ s: 'ɛ', p: 0.16 },
				{ s: 'eː', p: 0.13 }
			]
		},
		{ s: 'ŋ', p: 0.85, alt: [{ s: 'n', p: 0.08 }] },
		{ s: 'k', p: 0.95 },
		{ s: 'ə', p: 0.43, alt: [{ s: 'ʌ', p: 0.18 }] }
	],
	thinkComF: [
		{ s: 'f', p: 0.97 },
		{ s: 'ɪ', p: 0.6 },
		{ s: 'ŋ', p: 0.9 },
		{ s: 'k', p: 0.97 }
	],
	thinkComI: [
		{ s: 'θ', p: 0.8 },
		{
			s: 'ɪ',
			p: 0.24,
			alt: [
				{ s: 'i', p: 0.09 },
				{ s: 'e', p: 0.09 }
			]
		},
		{ s: 'ŋ', p: 0.66, alt: [{ s: 'n', p: 0.25 }] },
		{ s: 'k', p: 0.96 },
		{
			s: 'i',
			p: 0.51,
			alt: [
				{ s: 'iː', p: 0.1 },
				{ s: 'ɨ', p: 0.06 }
			]
		}
	],
	sheep: [
		{
			s: 'ɕ',
			p: 0.56,
			alt: [
				{ s: 'ʃ', p: 0.17 },
				{ s: 's.', p: 0.06 }
			]
		},
		{ s: 'iː', p: 0.42, alt: [{ s: 'i5', p: 0.18 }] },
		{ s: 'p', p: 0.97 },
		{
			s: 'ʌ',
			p: 0.3,
			alt: [
				{ s: 'a', p: 0.13 },
				{ s: 'ɐ', p: 0.09 }
			]
		}
	],
	// "comfortable": a sílaba final, de [l] escuro, sai só como [ə].
	comfortableCerto: [
		{ s: 'k', p: 0.95 },
		{ s: 'ʌ', p: 0.87 },
		{ s: 'm', p: 0.97 },
		{ s: 'f', p: 0.98 },
		{
			s: 'ɚ',
			p: 0.49,
			alt: [
				{ s: 'ɜː', p: 0.06 },
				{ s: 'ᵻ', p: 0.06 }
			]
		},
		{ s: 'ɾ', p: 0.62, alt: [{ s: 't', p: 0.11 }] },
		{
			s: 'ə',
			p: 0.49,
			alt: [
				{ s: 'ʌ', p: 0.13 },
				{ s: 'ɪ', p: 0.07 }
			]
		},
		{ s: 'b', p: 0.98 },
		{
			s: 'ə',
			p: 0.22,
			alt: [
				{ s: 'ɚ', p: 0.11 },
				{ s: 'ʌ', p: 0.07 }
			]
		}
	],
	redComRDeRato: [
		{ s: 'h', p: 0.78 },
		{ s: 'ɛ', p: 0.81 },
		{ s: 'd', p: 0.93 }
	],
	veryComB: [
		{ s: 'b', p: 0.97 },
		{
			s: 'ɛ',
			p: 0.66,
			alt: [
				{ s: 'æ', p: 0.1 },
				{ s: 'eː', p: 0.08 }
			]
		},
		{ s: 'ɹ', p: 0.94 },
		{ s: 'i', p: 0.72, alt: [{ s: 'ɨ', p: 0.06 }] }
	],
	worldCerto: [
		{ s: 'w', p: 0.94 },
		{
			s: 'ɚ',
			p: 0.31,
			alt: [
				{ s: 'ɜː', p: 0.11 },
				{ s: 'ᵻ', p: 0.05 }
			]
		},
		{ s: 'l', p: 0.78 },
		{ s: 'd', p: 0.94 }
	],
	catComE: [
		{ s: 'k', p: 0.95 },
		{ s: 'ɛ', p: 0.68, alt: [{ s: 'æ', p: 0.16 }] },
		{ s: 't', p: 0.82 }
	]
} satisfies Record<string, SomOuvido[]>;

const palavra = (fonemas: string) => pronunciaDe(fonemas.split(' '), regras);
const fora = (p: string, sons: SomOuvido[], rigor: RigorDaPronuncia) =>
	compararSons(palavra(p), sons, regras, rigor)
		.silabas.filter((s) => !s.ok)
		.map((s) => s.leitura);

describe('compararSons: os sons que o reconhecedor ouviu', () => {
	const PRIORITY_ = PRIORITY.join(' ');

	it('a pronúncia certa da voz nativa passa nos três rigores, e se escreve como a da tela', () => {
		for (const rigor of RIGORES) {
			expect(fora(PRIORITY_, BANCADA.priorityCerto, rigor)).toEqual([]);
			expect(fora(PRIORITY_, BANCADA.priorityComPassagem, rigor)).toEqual([]);
		}
		// O [o] do "aw", o [ɪ] da átona e o tepe do t contam como o som certo,
		// e o que se ouviu sai na mesma grafia da pronúncia.
		expect(compararSons(palavra(PRIORITY_), BANCADA.priorityCerto, regras).ouvido).toBe(
			'prai · aw · ruh · tee'
		);
	});

	it('o "r" de "rato" no lugar do r inglês marca a sílaba em qualquer rigor, e diz o que se ouviu', () => {
		for (const rigor of RIGORES) {
			expect(fora(PRIORITY_, BANCADA.priorityRDeRato, rigor)).toEqual(['ruh']);
		}
		const c = compararSons(palavra(PRIORITY_), BANCADA.priorityRDeRato, regras);
		expect(c.ouvidoPorSilaba[2]).toBe('huh');
		expect(fora('R EH1 D', BANCADA.redComRDeRato, 'leve')).toEqual(['rehd']);
	});

	it('"tink" erra em qualquer rigor; "fink" passa só no leve', () => {
		const THINK = 'TH IH1 NG K';
		for (const rigor of RIGORES) expect(fora(THINK, BANCADA.thinkComT, rigor)).toEqual(['thingk']);
		expect(fora(THINK, BANCADA.thinkComF, 'leve')).toEqual([]);
		expect(fora(THINK, BANCADA.thinkComF, 'normal')).toEqual(['thingk']);
		// "bery" troca o modo do som, como o "tink".
		expect(fora('V EH1 R IY0', BANCADA.veryComB, 'leve')).toEqual(['veh']);
	});

	it('o estalo fraco da consoante final não é som a mais; o "i" de "thinki" é, menos no leve', () => {
		const THINK = 'TH IH1 NG K';
		expect(fora(THINK, BANCADA.thinkCerto, 'normal')).toEqual([]);
		expect(fora(THINK, BANCADA.thinkComI, 'leve')).toEqual([]);
		expect(fora(THINK, BANCADA.thinkComI, 'normal')).toEqual(['thingk']);
		expect(compararSons(palavra(THINK), BANCADA.thinkComI, regras).ouvido).toBe('thingkee');
		// No leve ele passa, mas aparece no "Ouvimos": o aluno vê o que disse.
		expect(compararSons(palavra(THINK), BANCADA.thinkComI, regras, 'leve').ouvido).toBe('thingkee');
		// O estalo fraco não aparece em rigor nenhum.
		expect(compararSons(palavra(THINK), BANCADA.thinkCerto, regras, 'rigoroso').ouvido).toBe(
			'thingk'
		);
	});

	it('"sheep" por "ship" e "ket" por "cat" passam no leve e erram no normal', () => {
		expect(fora('SH IH1 P', BANCADA.sheep, 'leve')).toEqual([]);
		expect(fora('SH IH1 P', BANCADA.sheep, 'normal')).toEqual(['ship']);
		expect(fora('K AE1 T', BANCADA.catComE, 'leve')).toEqual([]);
		// O reconhecedor via um pouco de [æ] (0,16 contra 0,68 do [ɛ]): longe demais
		// para a dúvida valer a favor do aluno.
		expect(fora('K AE1 T', BANCADA.catComE, 'normal')).toEqual(['kat']);
	});

	it('a dúvida do reconhecedor entre dois sons vale a favor do aluno quando é perto de empate', () => {
		const THINK = 'TH IH1 NG K';
		const duvida = (alternativa: number) => [
			{ s: 'θ', p: 0.9 },
			{ s: 'ɛ', p: 0.4, alt: [{ s: 'ɪ', p: alternativa }] },
			{ s: 'ŋ', p: 0.9 },
			{ s: 'k', p: 0.9 }
		];
		// 0,3 contra 0,4: dúvida para o normal, não para o rigoroso.
		expect(fora(THINK, duvida(0.3), 'normal')).toEqual([]);
		expect(fora(THINK, duvida(0.3), 'rigoroso')).toEqual(['thingk']);
		// 0,35 contra 0,4 é quase empate, e vale até no rigoroso.
		expect(fora(THINK, duvida(0.35), 'rigoroso')).toEqual([]);
	});

	it('a vogal de "bird" vale com a cor do r junto ou escrita à parte', () => {
		expect(fora('W ER1 L D', BANCADA.worldCerto, 'rigoroso')).toEqual([]);
		const separado = [
			{ s: 'b', p: 0.9 },
			{ s: 'ɜː', p: 0.8 },
			{ s: 'ɹ', p: 0.8 },
			{ s: 'd', p: 0.9 }
		];
		expect(fora('B ER1 D', separado, 'normal')).toEqual([]);
	});

	it('a sílaba final de "-ble" num som só passa no normal; o rigoroso a pede inteira', () => {
		const COMFORTABLE = 'K AH1 M F ER0 T AH0 B AH0 L';
		expect(fora(COMFORTABLE, BANCADA.comfortableCerto, 'normal')).toEqual([]);
		expect(fora(COMFORTABLE, BANCADA.comfortableCerto, 'rigoroso')).toEqual(['buhl']);
		expect(compararSons(palavra(COMFORTABLE), BANCADA.comfortableCerto, regras).ouvido).toBe(
			'kuhm · fur · tuh · buhl'
		);
	});

	it('o som que faltou marca a sílaba, e a leitura do que se ouviu fica sem ele', () => {
		const semT = BANCADA.priorityCerto.filter((s) => s.s !== 'ɾ');
		const c = compararSons(palavra(PRIORITY_), semT, regras, 'leve');
		expect(c.silabas.map((s) => s.ok)).toEqual([true, true, true, false]);
		expect(c.ouvido).toBe('prai · aw · ruh · ee');
	});
});

describe('speak com pronúncia pelos sons: o veredito e o rigor da questão', () => {
	const corrigir = (sons: SomOuvido[], rigor?: RigorDaPronuncia) => {
		const payload = {
			target: 'priority',
			hints: [],
			pronuncia: { ...pronunciaDe(PRIORITY, regras), ...(rigor ? { rigor } : {}) }
		};
		const r = speak.grade(payload, { transcript: '', sons }, enUS, 's');
		if (!r.ok) throw new Error(r.error);
		return r.value;
	};

	it('tudo certo é "Correto", com as sílabas marcadas', () => {
		const v = corrigir(BANCADA.priorityCerto);
		expect(v.value).toBe(1);
		expect(v.marks?.map((m) => m.ok)).toEqual([true, true, true, true]);
	});

	it('uma sílaba fora é "Quase", e o retorno diz qual', () => {
		const v = corrigir(BANCADA.priorityRDeRato);
		expect(v.value).toBe(0.5);
		expect(v.feedback).toBe('A sílaba "ruh" saiu diferente.');
	});

	it('nada ouvido é erro, dito assim', () => {
		const v = corrigir([]);
		expect(v.value).toBe(0);
		expect(v.feedback).toBe('Não deu para ouvir a palavra.');
	});

	it('o rigor gravado na questão decide: a mesma fala passa no leve e erra no rigoroso', () => {
		const vogaisDuvidosas = BANCADA.priorityCerto.map((s) =>
			s.s === 'aɪ' ? { s: 'a', p: 0.6 } : s
		);
		expect(corrigir(vogaisDuvidosas, 'leve').value).toBe(1);
		expect(corrigir(vogaisDuvidosas, 'rigoroso').value).toBe(0.5);
	});

	it('palavra de uma sílaba com a sílaba fora é erro, não "Quase"', () => {
		const payload = { target: 'think', hints: [], pronuncia: palavra('TH IH1 NG K') };
		const r = speak.grade(payload, { transcript: '', sons: BANCADA.thinkComT }, enUS, 's');
		expect(r.ok && r.value.value).toBe(0);
	});
});

describe('as regras do inglês americano cobrem o reconhecedor', () => {
	it('todo fonema do dicionário tem o som do reconhecedor, e todo som é um segmento conhecido', () => {
		for (const fonema of Object.keys(regras.leitura)) {
			const som = regras.sons[fonema];
			expect(som, fonema).toBeDefined();
			expect(segmentar(som!), fonema).toEqual([som]);
			expect(tracosDe(som!), fonema).not.toBeNull();
		}
	});

	it('os sons dos grupos e das outras leituras existem na fonética', () => {
		const todos = [
			...regras.equivalentes.flat(),
			...regras.equivalentesNaAtona.flat(),
			...regras.semPeso,
			...Object.keys(regras.leituraDeOutrosSons)
		];
		for (const som of todos) expect(tracosDe(som), som).not.toBeNull();
	});
});
