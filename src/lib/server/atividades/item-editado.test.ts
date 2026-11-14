import { describe, expect, it } from 'vitest';
import { acharTrecho, montarQuestao, questaoDoItem, type ContextoDaQuestao } from './item-editado';
import { readableAnswerKey } from '$lib/server/studio/answer-key';
import { getInteraction } from '$lib/kernel/interactions/registry';
import { enUS } from '$lib/kernel/language/profiles/en-US';
import { jaJP } from '$lib/kernel/language/profiles/ja-JP';
import { ptBR } from '$lib/kernel/language/profiles/pt-BR';
import type { Questao } from '$lib/atividades/questao';

const ligado = { tts: true, asr: true };
const ctx = (extra: Partial<ContextoDaQuestao> = {}): ContextoDaQuestao => ({
	alvo: enUS,
	capacidades: ligado,
	...extra
});

/** "Traduza a frase": lê em inglês, escreve em PORTUGUÊS (`answerLang: 'source'`). */
const traduza = {
	prompt: { kind: 'text', text: 'She is late.', instructionKey: 'translate-to-source' },
	interaction: { type: 'type', payload: { accepted: ['Ela está atrasada.'] } },
	grading: { mode: 'tolerant', tolerance: 0.9, answerLang: 'source' }
};

/** "Ouça e escreva": o texto do áudio é a resposta. */
const ouca = {
	prompt: {
		kind: 'audio',
		text: 'She is late.',
		mediaId: 'med_1',
		instructionKey: 'listen-and-type'
	},
	interaction: { type: 'type', payload: { accepted: ['She is late.'] } },
	grading: { mode: 'tolerant', tolerance: 0.9 }
};

/** "Monte a frase" gerado: a frase inteira não fica no item, só as peças. */
const monte = {
	prompt: { kind: 'text', text: 'Ela está atrasada.', instructionKey: 'assemble-from-source' },
	interaction: {
		type: 'assemble',
		payload: {
			tokens: ['She', 'is', 'late'],
			distractors: ['was'],
			accepted: [
				['She', 'is', 'late'],
				['is', 'She', 'late']
			]
		}
	},
	grading: { mode: 'sequence' }
};

function ok(r: ReturnType<typeof montarQuestao>) {
	if (!r.ok) throw new Error(r.error);
	return r;
}

describe('montarQuestao', () => {
	it('salvar sem mudar nada PRESERVA a língua da resposta', () => {
		const r = ok(montarQuestao(questaoDoItem(traduza), ctx({ atual: traduza })));
		// O bug antigo: gravava `{ mode }` e a resposta em português passava a ser
		// corrigida com as regras do inglês (e ganhava o teclado do inglês).
		expect(r.grading).toEqual({ mode: 'tolerant', tolerance: 0.9, answerLang: 'source' });
		expect(r.interaction.payload).toEqual({ accepted: ['Ela está atrasada.'] });
		expect(r.prompt.instructionKey).toBe('translate-to-source');
	});

	it('o enunciado igual ao padrão não é gravado como texto do professor', () => {
		const r = ok(montarQuestao(questaoDoItem(traduza), ctx({ atual: traduza })));
		expect(r.prompt.instruction).toBeUndefined();
		const escrito = ok(
			montarQuestao(
				{ ...questaoDoItem(traduza), enunciado: 'Passe para o português.' },
				ctx({ atual: traduza })
			)
		);
		expect(escrito.prompt.instruction).toBe('Passe para o português.');
	});

	it('escuta sem a frase do áudio é recusada', () => {
		const r = montarQuestao({ ...questaoDoItem(ouca), texto: ' ' }, ctx({ atual: ouca }));
		expect(r.ok).toBe(false);
	});

	it('mudar a frase do áudio pede áudio novo e larga o arquivo antigo', () => {
		const igual = ok(montarQuestao(questaoDoItem(ouca), ctx({ atual: ouca })));
		expect(igual.audioMudou).toBe(false);
		expect(igual.prompt.mediaId).toBe('med_1');

		const outra = ok(
			montarQuestao({ ...questaoDoItem(ouca), texto: 'He is late.' }, ctx({ atual: ouca }))
		);
		expect(outra.audioMudou).toBe(true);
		expect(outra.prompt.mediaId).toBeUndefined();
		// Na escuta, a frase ouvida é a resposta principal.
		expect(outra.interaction.payload).toEqual({ accepted: ['He is late.', 'She is late.'] });
	});

	it('sem voz, a escuta nova é recusada', () => {
		const r = montarQuestao(
			{
				tipo: 'escuta',
				enunciado: '',
				texto: 'Hello there',
				campos: { interacao: 'type', aceitas: [], corrigeVoce: false }
			},
			ctx({ capacidades: { tts: false, asr: true } })
		);
		expect(r.ok).toBe(false);
	});

	it('formato que não existe no tipo é recusado', () => {
		const r = montarQuestao(
			{ tipo: 'fala', enunciado: '', texto: '', campos: { interacao: 'order', falas: ['a', 'b'] } },
			ctx()
		);
		expect(r.ok).toBe(false);
	});

	describe('lacuna', () => {
		const lacuna = (frase: string, trecho: string, alvo = enUS): Questao['campos'] => {
			const r = ok(
				montarQuestao(
					{
						tipo: 'escrita',
						enunciado: '',
						texto: '',
						campos: { interacao: 'cloze', frase, aceitas: [trecho] }
					},
					ctx({ alvo })
				)
			);
			return r.interaction.payload as Questao['campos'];
		};

		it('acha a palavra inteira, não um pedaço de outra', () => {
			expect(lacuna('I have a cat.', 'a')).toEqual({ masked: 'I have ___ cat.', accepted: ['a'] });
		});

		it('aceita um trecho de várias palavras', () => {
			expect(lacuna('She has been working here.', 'has been working')).toEqual({
				masked: 'She ___ here.',
				accepted: ['has been working']
			});
		});

		it('funciona sem espaço entre as palavras (japonês)', () => {
			expect(acharTrecho('明日友達に会います', '友達', jaJP)).toBe(2);
		});

		it('trecho que não está na frase é recusado', () => {
			const r = montarQuestao(
				{
					tipo: 'escrita',
					enunciado: '',
					texto: '',
					campos: { interacao: 'cloze', frase: 'I have a cat.', aceitas: ['av'] }
				},
				ctx()
			);
			expect(r.ok).toBe(false);
		});
	});

	describe('montar', () => {
		it('a frase vira peças pelo segmentador do idioma', () => {
			const r = ok(
				montarQuestao(
					{
						tipo: 'leitura',
						enunciado: '',
						texto: '明日、友達に会います。',
						campos: { interacao: 'assemble', frase: '明日友達に会います', distratores: [] }
					},
					ctx({ alvo: jaJP })
				)
			);
			const payload = r.interaction.payload as { tokens: string[] };
			expect(payload.tokens.length).toBeGreaterThan(2);
			expect(payload.tokens.join('')).toBe('明日友達に会います');
		});

		it('sem frase escrita, as peças e as ordens aceitas gravadas continuam', () => {
			const q = questaoDoItem(monte);
			expect(q.campos).toEqual({ interacao: 'assemble', frase: '', distratores: ['was'] });
			const r = ok(montarQuestao(q, ctx({ atual: monte })));
			expect(r.interaction.payload).toMatchObject({
				tokens: ['She', 'is', 'late'],
				accepted: monte.interaction.payload.accepted
			});
		});

		it('a frase do material abre o editor com a frase inteira', () => {
			const q = questaoDoItem(monte, { fraseDoMaterial: 'She is late.' });
			expect(q.campos).toMatchObject({ frase: 'She is late.' });
		});
	});

	describe('escolher', () => {
		const escolha = (
			opcoes: string[],
			certa: number,
			tipo: Questao['tipo'] = 'leitura',
			texto = ''
		) =>
			montarQuestao(
				{ tipo, enunciado: '', texto, campos: { interacao: 'choice', opcoes, certa } },
				ctx({ alvo: ptBR })
			);

		it('alternativas vazias saem e a certa continua apontando para ela', () => {
			const r = ok(escolha(['', 'gato', '', 'cachorro'], 3, 'leitura', 'dog'));
			expect(r.interaction.payload).toEqual({ options: ['gato', 'cachorro'], correctIndex: 1 });
		});

		it('alternativas iguais são recusadas, inclusive com o acento em duas formas', () => {
			// "café" pré-composto contra "cafe" + acento combinante (regra nº 6).
			expect(escolha(['café', 'café'], 0, 'leitura', 'coffee').ok).toBe(false);
		});

		it('na leitura, escolher sem nada para ler é recusado', () => {
			expect(escolha(['gato', 'cachorro'], 0)).toEqual({
				ok: false,
				error: 'Escreva o que o aluno lê: a frase, o termo ou a pergunta.'
			});
		});

		it('na escuta, a certa é a frase do áudio', () => {
			expect(escolha(['She is late.', 'He is late.'], 1, 'escuta', 'She is late.').ok).toBe(false);
			expect(escolha(['She is late.', 'He is late.'], 0, 'escuta', 'She is late.').ok).toBe(true);
		});
	});

	describe('associar, ordenar, tocar, falar', () => {
		it('par incompleto, par repetido e pares demais são recusados', () => {
			const par = (pares: { esquerda: string; direita: string }[]) =>
				montarQuestao(
					{ tipo: 'leitura', enunciado: '', texto: '', campos: { interacao: 'match', pares } },
					ctx()
				);
			expect(
				par([
					{ esquerda: 'dog', direita: '' },
					{ esquerda: 'cat', direita: 'gato' }
				]).ok
			).toBe(false);
			expect(
				par([
					{ esquerda: 'dog', direita: 'cão' },
					{ esquerda: 'dog', direita: 'cachorro' }
				]).ok
			).toBe(false);
			expect(
				par(Array.from({ length: 6 }, (_, i) => ({ esquerda: `a${i}`, direita: `b${i}` }))).ok
			).toBe(false);
			expect(
				ok(
					par([
						{ esquerda: 'dog', direita: 'cão' },
						{ esquerda: 'cat', direita: 'gato' },
						{ esquerda: '', direita: '' }
					])
				).grading.mode
			).toBe('set');
		});

		it('ordenar recusa falas repetidas', () => {
			const r = montarQuestao(
				{
					tipo: 'leitura',
					enunciado: '',
					texto: '',
					campos: { interacao: 'order', falas: ['Hi!', 'hi', 'Bye'] }
				},
				ctx()
			);
			expect(r.ok).toBe(false);
		});

		it('tocar na palavra guarda os espaços e volta à mesma frase', () => {
			const r = ok(
				montarQuestao(
					{
						tipo: 'leitura',
						enunciado: '',
						texto: 'Qual é o verbo?',
						campos: { interacao: 'select', frase: 'She works here.', certa: 'works' }
					},
					ctx()
				)
			);
			const payload = r.interaction.payload as {
				segments: { text: string; selectable: boolean }[];
				correctIndex: number;
			};
			expect(payload.segments[payload.correctIndex]).toEqual({ text: 'works', selectable: true });
			expect(payload.segments.find((s) => s.text === ' ')?.selectable).toBe(false);
			const volta = questaoDoItem({
				prompt: r.prompt,
				interaction: r.interaction,
				grading: r.grading
			});
			expect(volta.campos).toEqual({
				interacao: 'select',
				frase: 'She works here.',
				certa: 'works'
			});
		});

		it('tocar na palavra pede uma pista ou um enunciado próprio: "a palavra certa" não diz qual', () => {
			const tocar = (texto: string, enunciado = '') =>
				montarQuestao(
					{
						tipo: 'leitura',
						enunciado,
						texto,
						campos: { interacao: 'select', frase: 'She works here.', certa: 'works' }
					},
					ctx()
				);
			expect(tocar('')).toEqual({
				ok: false,
				error: 'Diga ao aluno qual palavra tocar: escreva uma pista ou um enunciado seu.'
			});
			expect(tocar('trabalha').ok).toBe(true);
			expect(tocar('', 'Toque no verbo.').ok).toBe(true);
		});

		it('fala nova sem transcrição ligada é recusada', () => {
			const fala: Questao = {
				tipo: 'fala',
				enunciado: '',
				texto: '',
				campos: { interacao: 'speak', frase: 'Good morning' }
			};
			expect(montarQuestao(fala, ctx({ capacidades: { tts: true, asr: false } })).ok).toBe(false);
			expect(ok(montarQuestao(fala, ctx())).grading.mode).toBe('asr');
		});

		it('digitar com "você corrige" vira escrita livre', () => {
			const r = ok(
				montarQuestao(
					{
						tipo: 'escrita',
						enunciado: 'Conte o seu fim de semana.',
						texto: '',
						campos: { interacao: 'type', aceitas: ['I went to the beach.'], corrigeVoce: true }
					},
					ctx()
				)
			);
			expect(r.grading.mode).toBe('rubric');
		});

		it('digitar no texto sem enunciado próprio é recusado: não há padrão', () => {
			const r = montarQuestao(
				{
					tipo: 'escrita',
					enunciado: '',
					texto: 'Bom dia',
					campos: { interacao: 'type', aceitas: ['Good morning'], corrigeVoce: false }
				},
				ctx()
			);
			expect(r.ok).toBe(false);
		});
	});

	it('toda questão montada valida no authoringSchema e não leva gabarito ao aluno', () => {
		const r = ok(
			montarQuestao(
				{
					tipo: 'leitura',
					enunciado: '',
					texto: 'gato',
					campos: { interacao: 'choice', opcoes: ['cat', 'dog'], certa: 0 }
				},
				ctx()
			)
		);
		const tipo = getInteraction(r.interaction.type);
		expect(tipo.authoringSchema.safeParse(r.interaction.payload).success).toBe(true);
		expect(JSON.stringify(tipo.toRuntime(r.interaction.payload, 'seed'))).not.toContain(
			'correctIndex'
		);
	});
});

describe('readableAnswerKey', () => {
	it('as variantes são o que é aceito ALÉM da resposta principal', () => {
		// Com a principal repetida nas variantes, corrigir "teh" para "the" no
		// editor deixava "teh" aceito.
		expect(readableAnswerKey('type', { accepted: ['the', 'thee'] })).toEqual({
			answer: 'the',
			variants: ['thee']
		});
		expect(readableAnswerKey('choice', { options: ['a', 'b'], correctIndex: 1 })).toEqual({
			answer: 'b',
			variants: []
		});
	});
});
