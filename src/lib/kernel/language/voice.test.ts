import { describe, expect, it } from 'vitest';
import { vozDaPronuncia, vozDoFalante, vozDoTexto } from './voice';
import { getProfile } from './profiles';

/**
 * A voz varia entre frases e é a MESMA para a mesma frase — é isso que permite
 * o áudio ser identificado só pelo conteúdo (db.md "MediaAsset") e o hash ser
 * recalculado em qualquer lugar sem consultar nada.
 */
describe('vozDoTexto', () => {
	const enUS = getProfile('en-US');

	it('é determinística — a mesma frase sempre na mesma voz', () => {
		const primeira = vozDoTexto(enUS, 'She has been working here since 2019.');
		expect(vozDoTexto(enUS, 'She has been working here since 2019.')).toBe(primeira);
		expect(vozDoTexto(enUS, 'She has been working here since 2019.')).toBe(primeira);
	});

	// O ponto da mudança de dono: a mesma frase noutro material, ou noutra
	// atividade, é o MESMO arquivo — e para isso a voz não pode depender de onde
	// ela veio.
	it('não depende de onde a frase está guardada', () => {
		const daBiblioteca = vozDoTexto(enUS, 'Good morning.');
		const coladaDeNovo = vozDoTexto(enUS, 'Good morning.');
		expect(daBiblioteca).toBe(coladaDeNovo);
	});

	it('sempre devolve uma voz do catálogo do idioma', () => {
		for (const frase of ['Hi.', 'Are you still working on that project?', 'Good night.']) {
			expect(enUS.tts.voices).toContain(vozDoTexto(enUS, frase));
		}
	});

	// Uma atividade inteira na mesma voz treina o aluno a entender AQUELA
	// pessoa, não o idioma. A voz de referência do inglês NÃO muda isto: ela é só
	// da palavra da Pronúncia.
	it('frases diferentes caem em vozes diferentes, mesmo no idioma com voz de referência', () => {
		expect(enUS.tts.referencia).toBe('af_heart');
		const frases = Array.from({ length: 40 }, (_, i) => `Sentence number ${i}.`);
		const usadas = new Set(frases.map((f) => vozDoTexto(enUS, f)));
		expect(usadas.size).toBe(enUS.tts.voices.length);
	});

	// O modelo de TTS não fala árabe. Lista vazia é a resposta honesta, e é o
	// que faz o gerador não produzir item de escuta nesse idioma.
	it('idioma sem voz devolve null', () => {
		expect(vozDoTexto(getProfile('ar-SA'), 'مرحبا')).toBeNull();
	});
});

/**
 * Pedido do dono do repositório: a melhor voz do modelo SÓ na questão de
 * Pronúncia. Ali o aluno imita o que ouviu e é corrigido som a som, às vezes com
 * rigor — o modelo não pode ser uma voz mediana.
 */
describe('vozDaPronuncia', () => {
	const enUS = getProfile('en-US');
	const ptBR = getProfile('pt-BR');

	it('em inglês americano, toda palavra da Pronúncia sai na voz de referência', () => {
		const palavras = ['priority', 'Beautiful', 'around', 'think', 'water', 'because'];
		expect(new Set(palavras.map((p) => vozDaPronuncia(enUS, p)))).toEqual(new Set(['af_heart']));
		// A mesma palavra, numa questão de escuta, segue na voz do texto.
		expect(palavras.some((p) => vozDoTexto(enUS, p) !== 'af_heart')).toBe(true);
	});

	it('sem voz de referência no idioma, vale a voz do texto', () => {
		expect(ptBR.tts.referencia).toBeUndefined();
		expect(vozDaPronuncia(ptBR, 'prioridade')).toBe(vozDoTexto(ptBR, 'prioridade'));
	});

	it('idioma sem voz devolve null', () => {
		expect(vozDaPronuncia(getProfile('ar-SA'), 'مرحبا')).toBeNull();
	});
});

describe('vozDoFalante', () => {
	const enUS = getProfile('en-US');

	it('cada pessoa do diálogo tem a sua voz, e a mesma em todas as falas', () => {
		const elenco = ['Sam', 'Ana'];
		const sam = vozDoFalante(enUS, elenco, 'Sam');
		const ana = vozDoFalante(enUS, elenco, 'Ana');
		expect(sam).not.toBe(ana);
		expect(enUS.tts.voices).toContain(sam);
		expect(enUS.tts.voices).toContain(ana);
		expect(vozDoFalante(enUS, elenco, 'Sam')).toBe(sam);
	});
});
