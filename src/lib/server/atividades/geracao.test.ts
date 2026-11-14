import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Item } from '$lib/kernel/item';
import type { StoredContentUnit } from '$lib/kernel/generators';
import type { ProgressoDaGeracao } from '$lib/atividades/geracao';
import type { Tradutor } from '$lib/server/traducao';
import {
	esquecerGeracoes,
	executarGeracao,
	iniciarGeracao,
	progressoDaGeracao,
	type FontesDaGeracao
} from './geracao';

const frases: StoredContentUnit[] = [
	{
		id: 'm1',
		kind: 'SentencePair',
		data: { source: 'Ela trabalha aqui desde 2019.', target: 'She has worked here since 2019.' }
	},
	{
		id: 'm2',
		kind: 'SentencePair',
		data: { source: 'Eu já terminei o relatório.', target: 'I have already finished the report.' }
	},
	{
		id: 'm3',
		kind: 'SentencePair',
		data: { source: 'Nós moramos em Lisboa.', target: 'We live in Lisbon.' }
	}
];

function fontes(extra: Partial<FontesDaGeracao> = {}) {
	const gravado: { dentro: Item[]; fora: Item[] } = { dentro: [], fora: [] };
	const f: FontesDaGeracao = {
		activity: {
			id: 'atv_1',
			targetLang: 'en-US',
			sourceLang: 'pt-BR',
			itemTarget: 4,
			skills: ['listening', 'speaking', 'reading', 'writing'],
			tiposPorMaterial: null
		},
		materiais: async () => frases,
		capacidades: { tts: false, asr: false },
		tradutor: null,
		transcritorPara: async () => undefined,
		gravar: async (dentro, fora) => {
			gravado.dentro = dentro;
			gravado.fora = fora;
			return dentro;
		},
		pedirAudio: async () => 0,
		...extra
	};
	return { f, gravado };
}

afterEach(() => esquecerGeracoes());

describe('executarGeracao', () => {
	it('gera para todos e separa pela quantidade: o resto vai como fora', async () => {
		const { f, gravado } = fontes();
		const fim = await executarGeracao(f, () => {});
		expect(fim.estado).toBe('pronta');
		expect(gravado.dentro).toHaveLength(4);
		expect(gravado.fora.length).toBeGreaterThan(0);
		expect(fim.resultado).toEqual({ dentro: 4, fora: gravado.fora.length });
	});

	it('marca cada passo quando ele termina, na ordem', async () => {
		const { f } = fontes();
		const vistos: ProgressoDaGeracao[] = [];
		await executarGeracao(f, (p) => vistos.push(p));
		// Sem tradutor não há passo de pares nem de variantes.
		expect(vistos.at(-1)?.passos.map((p) => p.id)).toEqual([
			'lendo',
			'montando',
			'separando',
			'salvando'
		]);
		const feitos = vistos.map((p) => p.passos.filter((s) => s.estado === 'feito').length);
		expect(feitos).toEqual([...feitos].sort((a, b) => a - b));
		expect(vistos.at(-1)?.passos.every((p) => p.estado === 'feito')).toBe(true);
		expect(vistos.at(-1)?.passos[0]).toMatchObject({ id: 'lendo', numero: 3 });
	});

	it('com tradutor, entram os passos de pares e de outras traduções', async () => {
		const tradutor: Tradutor = {
			nome: 'falso',
			traduzir: async (textos) => textos.map(() => ''),
			alternativas: async (textos) => textos.map(() => [])
		};
		const { f } = fontes({ tradutor });
		const fim = await executarGeracao(f, () => {});
		expect(fim.passos.map((p) => p.id)).toEqual([
			'lendo',
			'pares',
			'montando',
			'separando',
			'variantes',
			'salvando'
		]);
	});

	it('cada material gera só os tipos dele', async () => {
		const { f, gravado } = fontes({
			activity: {
				id: 'atv_1',
				targetLang: 'en-US',
				sourceLang: 'pt-BR',
				itemTarget: 15,
				skills: ['reading', 'writing'],
				tiposPorMaterial: { m1: ['reading'], m2: [], m3: ['reading', 'writing'] }
			}
		});
		await executarGeracao(f, () => {});
		const todas = [...gravado.dentro, ...gravado.fora];
		expect(todas.some((i) => i.sourceContentId === 'm2')).toBe(false);
		// m1 só leitura: nada de digitar nem completar.
		expect(
			todas
				.filter((i) => i.sourceContentId === 'm1')
				.some((i) => i.interaction.type === 'type' || i.interaction.type === 'cloze')
		).toBe(false);
	});

	it('tipos que não geram nada viram um aviso, não um rascunho vazio', async () => {
		const gravar = vi.fn(async () => []);
		const { f } = fontes({
			gravar,
			activity: {
				id: 'atv_1',
				targetLang: 'en-US',
				sourceLang: 'pt-BR',
				itemTarget: 5,
				skills: ['speaking'],
				tiposPorMaterial: null
			}
		});
		await expect(executarGeracao(f, () => {})).rejects.toThrow();
		expect(gravar).not.toHaveBeenCalled();
	});
});

describe('o registro do andamento', () => {
	it('só o professor que pediu lê o andamento', async () => {
		const { f } = fontes();
		expect(iniciarGeracao('prof_a', f)).toEqual({ ok: true });
		await vi.waitFor(() => expect(progressoDaGeracao('prof_a', 'atv_1')?.estado).toBe('pronta'));
		expect(progressoDaGeracao('prof_b', 'atv_1')).toBeNull();
	});

	it('não começa outra geração enquanto uma anda', async () => {
		let soltar: () => void = () => {};
		const segura = new Promise<void>((r) => (soltar = r));
		const materiais = vi.fn(async () => {
			await segura;
			return frases;
		});
		const { f } = fontes({ materiais });
		iniciarGeracao('prof_a', f);
		iniciarGeracao('prof_a', f);
		soltar();
		await vi.waitFor(() => expect(progressoDaGeracao('prof_a', 'atv_1')?.estado).toBe('pronta'));
		expect(materiais).toHaveBeenCalledTimes(1);
	});

	it('falha vira mensagem, com os passos que chegaram a andar', async () => {
		const { f } = fontes({ materiais: async () => [] });
		iniciarGeracao('prof_a', f);
		await vi.waitFor(() => expect(progressoDaGeracao('prof_a', 'atv_1')?.estado).toBe('falhou'));
		expect(progressoDaGeracao('prof_a', 'atv_1')?.erro).toMatch(/material/);
	});

	it('andando sem notícia há muito tempo aparece como parada', () => {
		let soltar: () => void = () => {};
		const segura = new Promise<StoredContentUnit[]>((r) => (soltar = () => r(frases)));
		const { f } = fontes({ materiais: () => segura });
		const agora = Date.now();
		iniciarGeracao('prof_a', f, agora);
		expect(progressoDaGeracao('prof_a', 'atv_1', agora + 5 * 60_000)?.estado).toBe('falhou');
		soltar();
	});
});
