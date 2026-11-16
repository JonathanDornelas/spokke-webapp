import { describe, expect, it } from 'vitest';
import { runGenerators, type GenerationOptions } from '$lib/kernel/generators';
import { buildRuntimeItem, type StoredItemRow } from './runtime';
import { ptBR } from '$lib/kernel/language/profiles/pt-BR';
import { enUS } from '$lib/kernel/language/profiles/en-US';
import { arSA } from '$lib/kernel/language/profiles/ar-SA';
import type { LanguageProfile } from '$lib/kernel/language/profile';

/**
 * Regra inviolável nº 1 no ponto exato onde ela quebra: o item passa pelo
 * gerador, é gravado como JSON e volta montado para o browser. Se um campo
 * de gabarito sobreviver a esse caminho, ele chega no aluno.
 */
const options: GenerationOptions = {
	targetProfile: enUS,
	sourceProfile: ptBR,
	seed: 'seed-de-geracao',
	capabilities: { asr: true, tts: true }
};

const materiais = [
	{
		id: 'cnt_1',
		kind: 'SentencePair' as const,
		data: { source: 'Ela trabalha aqui desde 2019.', target: 'She has worked here since 2019.' }
	},
	{
		id: 'cnt_2',
		kind: 'SentencePair' as const,
		data: { source: 'Eu já terminei o relatório.', target: 'I have already finished the report.' }
	}
];

function rows(): StoredItemRow[] {
	// `structuredClone` simula a ida e volta pelo Json do Postgres.
	return runGenerators(materiais, options)
		.groups.flatMap((g) => g.items)
		.map((item) => structuredClone({ ...item, id: `row_${item.id}` }) as StoredItemRow);
}

describe('buildRuntimeItem', () => {
	it('nunca entrega o texto que o áudio diz', () => {
		for (const row of rows()) {
			const runtime = buildRuntimeItem(row, 'seed-tentativa', new Map());
			const serialized = JSON.stringify(runtime);

			// A frase alvo só pode aparecer quando o aluno tem direito de vê-la
			// (nunca num item de escuta).
			if (runtime.interaction === 'type' && !runtime.passage) {
				expect(serialized).not.toContain('She has worked here since 2019.');
			}
		}
	});

	it('nunca entrega os campos de gabarito de nenhuma interação', () => {
		for (const row of rows()) {
			const serialized = JSON.stringify(buildRuntimeItem(row, 'seed-tentativa', new Map()));
			expect(serialized).not.toContain('accepted');
			expect(serialized).not.toContain('correctIndex');
			expect(serialized).not.toContain('distractors');
			expect(serialized).not.toContain('hints');
		}
	});

	it('item de escuta não manda o texto sintetizado nem como enunciado', () => {
		const listening = rows().filter((row) => {
			const prompt = row.prompt as { kind: string };
			return prompt.kind === 'audio';
		});
		expect(listening.length).toBeGreaterThan(0);

		for (const row of listening) {
			const runtime = buildRuntimeItem(row, 'seed-tentativa', new Map());
			expect(runtime.passage).toBeUndefined();
			// mas o enunciado existe, senão a tela fica muda
			expect(runtime.prompt.length).toBeGreaterThan(0);

			if (runtime.interaction === 'choice') {
				// Numa escuta com alternativas a frase certa PRECISA aparecer —
				// é uma das opções. O que não pode é dar para saber qual é.
				const options = runtime.options as { text: string }[];
				expect(options.length).toBeGreaterThan(1);
				expect(JSON.stringify(runtime)).not.toContain('correctIndex');
			} else {
				expect(JSON.stringify(runtime)).not.toContain('She has worked here since 2019.');
			}
		}
	});

	it('é determinístico: a mesma tentativa vê sempre a mesma ordem', () => {
		for (const row of rows()) {
			const a = buildRuntimeItem(row, 'seed-tentativa', new Map());
			const b = buildRuntimeItem(row, 'seed-tentativa', new Map());
			expect(a).toEqual(b);
		}
	});
});

/**
 * O teclado virtual chega pelo mesmo portão do resto do item. Ele não é
 * gabarito — é o alfabeto do idioma —, mas tem de aparecer SÓ onde serve: numa
 * questão de digitar cuja resposta é no idioma alvo. Na língua do aluno
 * (`translate-type`) o aparelho é dele; num item de montar, tocar ou falar não
 * há o que digitar.
 */
describe('teclado virtual no item', () => {
	function rowsDe(alvo: LanguageProfile, pares: { source: string; target: string }[]) {
		return runGenerators(
			pares.map((data, i) => ({ id: `cnt_${i}`, kind: 'SentencePair' as const, data })),
			{ ...options, targetProfile: alvo }
		)
			.groups.flatMap((g) => g.items)
			.map(
				(item) =>
					structuredClone({ ...item, id: `row_${item.id}` }) as StoredItemRow & {
						generatedBy: string | null;
					}
			);
	}

	const arabe = rowsDe(arSA, [
		{ source: 'Eu sou estudante.', target: 'أنا طالب في المدرسة' },
		{ source: 'Este é um livro.', target: 'هذا كتاب جميل جدا' },
		{ source: 'Ela fala árabe.', target: 'هي تتحدث العربية الآن' }
	]);

	it('vai na questão de digitar no idioma alvo', () => {
		const digitaNoAlvo = arabe.filter((row) => {
			const r = buildRuntimeItem(row, 's', new Map());
			return (
				(r.interaction === 'type' || r.interaction === 'cloze') &&
				row.generatedBy !== 'translate-type'
			);
		});
		expect(digitaNoAlvo.length).toBeGreaterThan(0);
		for (const row of digitaNoAlvo) {
			expect(buildRuntimeItem(row, 's', new Map()).teclado?.id).toBe('arabe');
		}
	});

	it('não vai na tradução para a língua do aluno', () => {
		const traducao = arabe.filter((row) => row.generatedBy === 'translate-type');
		expect(traducao.length).toBeGreaterThan(0);
		for (const row of traducao) {
			expect(buildRuntimeItem(row, 's', new Map()).teclado).toBeUndefined();
		}
	});

	it('não vai em questão em que não se digita', () => {
		const semDigitar = arabe.filter((row) => {
			const tipo = (row.interaction as { type: string }).type;
			return tipo !== 'type' && tipo !== 'cloze';
		});
		expect(semDigitar.length).toBeGreaterThan(0);
		for (const row of semDigitar) {
			expect(buildRuntimeItem(row, 's', new Map()).teclado).toBeUndefined();
		}
	});

	it('não vai em idioma que o aparelho já escreve', () => {
		for (const row of rows()) {
			expect(buildRuntimeItem(row, 's', new Map()).teclado).toBeUndefined();
		}
	});
});

describe('diálogo e Pronúncia: o que chega ao browser', () => {
	const dialogo = {
		id: 'dlg_1',
		kind: 'Dialogue' as const,
		data: {
			lines: [
				{ speaker: 'Ana', text: 'Hi, are you new here?' },
				{ speaker: 'Ben', text: 'Yes, I started this week.' },
				{ speaker: 'Ana', text: 'Welcome to the team!' },
				{ speaker: 'Ben', text: 'Thanks, everyone has been very kind.' }
			],
			questions: [
				{ question: 'When did Ben start?', answer: 'This week' },
				{ question: 'Who welcomes Ben?', answer: 'Ana' }
			]
		}
	};
	const itensDoDialogo = (nivel?: 'A1' | 'C1') =>
		runGenerators([dialogo], { ...options, nivel })
			.groups.flatMap((g) => g.items)
			.map((item) => structuredClone({ ...item, id: `row_${item.id}` }) as StoredItemRow);

	it('na próxima fala, o texto da fala do aluno nunca vai, nem as falas depois dela', () => {
		const paradas = itensDoDialogo().filter((r) => r.id.includes('dialogue-next-line'));
		expect(paradas.length).toBeGreaterThan(0);
		for (const linha of paradas) {
			const prompt = linha.prompt as { contexto: { ate: number; falas: { texto: string }[] } };
			const alvo = prompt.contexto.falas[prompt.contexto.ate]!.texto;
			const depois = prompt.contexto.falas.slice(prompt.contexto.ate + 1).map((f) => f.texto);
			const runtime = buildRuntimeItem(linha, 'tentativa', new Map());
			const contexto = JSON.stringify(runtime.contexto);
			expect(contexto).not.toContain(alvo);
			for (const fala of depois) expect(contexto).not.toContain(fala);
			expect(runtime.contexto?.tipo === 'dialogo' && runtime.contexto.vez).toBeTruthy();
		}
	});

	it('com "só áudio" (de B2 para cima) nenhuma fala vai em texto', () => {
		const linha = itensDoDialogo('C1').find((r) => r.id.includes('dialogue-comprehension'))!;
		const runtime = buildRuntimeItem(linha, 'tentativa', new Map());
		expect(runtime.contexto?.tipo).toBe('dialogo');
		if (runtime.contexto?.tipo === 'dialogo') {
			expect(runtime.contexto.falas.every((f) => f.texto === undefined)).toBe(true);
		}
		// A pergunta vai (o aluno precisa dela); a resposta certa, só como alternativa embaralhada.
		expect(runtime.pergunta).toBe('When did Ben start?');
		expect(runtime.passage).toBeUndefined();
	});

	it('cada fala ouvida tem a voz da PESSOA: as falas da mesma pessoa, o mesmo arquivo de voz', async () => {
		const { audiosDoItem } = await import('./runtime');
		const linha = itensDoDialogo().find((r) => r.id.includes('dialogue-comprehension'))!;
		const audios = audiosDoItem(linha, 'en-US').filter((a) => a.papel === 'fala');
		expect(audios).toHaveLength(4);
		expect(audios[0]!.voz).toBe(audios[2]!.voz);
		expect(audios[1]!.voz).toBe(audios[3]!.voz);
		expect(audios[0]!.voz).not.toBe(audios[1]!.voz);
	});

	it('a Pronúncia leva a boca passo a passo e as sílabas, e a palavra pede áudio', async () => {
		const { audiosDoItem } = await import('./runtime');
		const vocab = [
			{
				id: 'v1',
				kind: 'VocabItem' as const,
				data: { term: 'priority', translation: 'prioridade' }
			},
			{ id: 'v2', kind: 'VocabItem' as const, data: { term: 'kitchen', translation: 'cozinha' } }
		];
		const fonetica: Record<string, string> = {
			priority: 'P R AY0 AO1 R AH0 T IY0',
			kitchen: 'K IH1 CH AH0 N'
		};
		const linha = runGenerators(vocab, {
			...options,
			foneticaDe: (p) => fonetica[p]?.split(' ') ?? null
		})
			.groups.flatMap((g) => g.items)
			.filter((i) => i.generatedBy === 'vocab-pronuncia')
			.map((item) => structuredClone({ ...item, id: `row_${item.id}` }) as StoredItemRow)[0]!;
		const runtime = buildRuntimeItem(linha, 'tentativa', new Map());
		expect(runtime.silabas).toEqual([
			{ leitura: 'prai', tonica: false },
			{ leitura: 'aw', tonica: true },
			{ leitura: 'ruh', tonica: false },
			{ leitura: 'tee', tonica: false }
		]);
		expect(runtime.pronuncia?.passos.length).toBeGreaterThan(4);
		expect(runtime.gradingLabel).toBe('pronúncia');
		expect(audiosDoItem(linha, 'en-US').map((a) => a.papel)).toEqual(['palavra']);
		// A palavra da Pronúncia sai na voz de referência do inglês (a melhor do
		// modelo), e não na que o texto sortearia: é o modelo que o aluno imita.
		expect(audiosDoItem(linha, 'en-US')[0]!.voz).toBe('af_heart');

		// Sem a linha do tempo do áudio, a questão vai sem ela (a boca anda pelo peso).
		expect(runtime.pronuncia?.linha).toBeUndefined();

		// Com a linha do arquivo normal (a que o serviço de áudio devolveu para
		// "priority"), cada FONEMA do dicionário ganha o trecho dele; o devagar,
		// que não tem linha, fica sem. Cada passo da boca aponta para o seu fonema.
		const [palavra] = audiosDoItem(linha, 'en-US');
		const normal = palavra!.arquivos[0]!.hash;
		const sons = [
			['p', 0, 0.041],
			['ɹ', 0.041, 0.116],
			['aɪ', 0.116, 0.191],
			['ɔ', 0.191, 0.291],
			['ɹ', 0.291, 0.341],
			['ə', 0.341, 0.416],
			['ɾ', 0.416, 0.491],
			['i', 0.491, 0.674]
		].map(([s, inicio, fim]) => ({ s: s as string, inicio: inicio as number, fim: fim as number }));
		const comLinha = buildRuntimeItem(
			linha,
			'tentativa',
			new Map(),
			new Map([[normal, { fala: [0.03, 0.644] as [number, number], sons }]])
		);
		expect(comLinha.pronuncia?.linha?.fones).toHaveLength(8);
		expect(comLinha.pronuncia?.linha?.fones[3]).toEqual([0.191, 0.291]);
		expect(comLinha.pronuncia?.linha?.fala).toEqual([0.03, 0.644]);
		expect(comLinha.pronuncia?.linhaLenta).toBeUndefined();
		expect(comLinha.pronuncia?.passos.at(-1)?.fonema).toBe(7);
	});

	it('o rigor da Pronúncia sai do nível da atividade e aparece no rótulo e na dica', () => {
		const vocab = [
			{
				id: 'v1',
				kind: 'VocabItem' as const,
				data: { term: 'priority', translation: 'prioridade' }
			},
			{ id: 'v2', kind: 'VocabItem' as const, data: { term: 'kitchen', translation: 'cozinha' } }
		];
		const fonetica: Record<string, string> = {
			priority: 'P R AY0 AO1 R AH0 T IY0',
			kitchen: 'K IH1 CH AH0 N'
		};
		const naAtividade = (nivel?: 'A1' | 'B1' | 'C2') => {
			const item = runGenerators(vocab, {
				...options,
				nivel,
				foneticaDe: (p) => fonetica[p]?.split(' ') ?? null
			})
				.groups.flatMap((g) => g.items)
				.find((i) => i.generatedBy === 'vocab-pronuncia')!;
			return buildRuntimeItem(
				structuredClone({ ...item, id: `row_${item.id}` }) as StoredItemRow,
				'tentativa',
				new Map()
			);
		};
		const leve = naAtividade('A1');
		expect(leve.rigor).toBe('leve');
		expect(leve.gradingLabel).toBe('pronúncia leve');
		expect(leve.hint).toContain('correção leve');
		expect(naAtividade('B1').rigor).toBe('normal');
		expect(naAtividade().rigor).toBe('normal');
		const alto = naAtividade('C2');
		expect(alto.rigor).toBe('rigoroso');
		expect(alto.gradingLabel).toBe('pronúncia rigorosa');
	});
});
