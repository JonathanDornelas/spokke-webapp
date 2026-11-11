import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TAXA_DA_FALA, wavDaFala } from '$lib/ia/arquivo';
import type { AnexoDaIa } from '$lib/server/ia/provider';

/**
 * O endpoint de "Gerar com IA" a partir de arquivo, chamado como o SvelteKit chama: um `Request`
 * multipart e os `locals` da sessão. O `gerarPropostas` é trocado por um espião — a cobrança e o
 * provedor têm teste próprio (`server/ia/gerar.test.ts`), e aqui nenhum modelo pago é chamado. O que
 * importa é o que o ENDPOINT decide: quem passa, o que é recusado, e o anexo que ele monta dos bytes.
 */

const gerarPropostas = vi.fn(async () => ({
	ok: true as const,
	propostas: [],
	debitados: 0,
	estornados: 0,
	saldo: 300
}));
vi.mock('$lib/server/ia/gerar', () => ({ gerarPropostas }));

const { POST } = await import('./+server');

type Evento = Parameters<typeof POST>[0];

function pedido(
	campos: Record<string, string>,
	arquivo?: Blob,
	user: { id: string } | null = { id: 'prof' }
) {
	const corpo = new FormData();
	for (const [k, v] of Object.entries(campos)) corpo.set(k, v);
	if (arquivo) corpo.set('arquivo', arquivo, 'arquivo');
	const request = new Request('http://localhost/materiais/ia/arquivo', {
		method: 'POST',
		body: corpo
	});
	return { request, locals: { user } } as unknown as Evento;
}

const BASE = {
	requestId: crypto.randomUUID(),
	kind: 'SentencePair',
	quantos: '10',
	sourceLang: 'pt-BR',
	targetLang: 'en-US'
};
const JPEG = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70])]);
const fala = (segundos: number, taxa = TAXA_DA_FALA) =>
	new Blob([
		wavDaFala(new Float32Array(Math.round(segundos * taxa)).fill(0.2), taxa).buffer as ArrayBuffer
	]);

const anexoEnviado = (): AnexoDaIa =>
	(gerarPropostas.mock.calls.at(-1) as unknown as [unknown, { anexo: AnexoDaIa }])[1].anexo;

beforeEach(() => gerarPropostas.mockClear());

describe('POST /materiais/ia/arquivo', () => {
	it('sem sessão de professor, 401 — como toda remote function', async () => {
		await expect(POST(pedido({ ...BASE, fonte: 'imagem' }, JPEG, null))).rejects.toMatchObject({
			status: 401
		});
		expect(gerarPropostas).not.toHaveBeenCalled();
	});

	it('foto: o tipo vem dos BYTES, e o anexo chega inteiro ao gerador', async () => {
		const r = await POST(pedido({ ...BASE, fonte: 'imagem' }, JPEG));
		expect(await r.json()).toMatchObject({ ok: true });
		const anexo = anexoEnviado();
		expect(anexo).toMatchObject({ tipo: 'imagem', mime: 'image/jpeg' });
		expect(anexo.dados.byteLength).toBe(JPEG.size);
	});

	it('foto que não é imagem é recusada sem chegar ao gerador (nada é cobrado)', async () => {
		const svg = new Blob(['<svg xmlns="http://www.w3.org/2000/svg"></svg>']);
		const r = await POST(pedido({ ...BASE, fonte: 'imagem' }, svg));
		expect(await r.json()).toMatchObject({ ok: false });
		expect(gerarPropostas).not.toHaveBeenCalled();
	});

	it('vídeo: a duração que vale é a do cabeçalho do WAV, não a que a tela disse', async () => {
		const r = await POST(pedido({ ...BASE, fonte: 'video', segundos: '1' }, fala(150)));
		expect(await r.json()).toMatchObject({ ok: true });
		expect(anexoEnviado()).toMatchObject({ tipo: 'audio', mime: 'audio/wav', segundos: 150 });
	});

	it('vídeo fora do formato da fala, ou acima de dez minutos, é recusado antes de cobrar', async () => {
		const outraTaxa = await POST(pedido({ ...BASE, fonte: 'video' }, fala(5, 44_100)));
		expect(await outraTaxa.json()).toMatchObject({ ok: false });
		const longa = await POST(pedido({ ...BASE, fonte: 'video' }, fala(605)));
		expect(await longa.json()).toMatchObject({ ok: false });
		expect(gerarPropostas).not.toHaveBeenCalled();
	});

	it('sem arquivo, a tela recebe o motivo em texto', async () => {
		const r = await POST(pedido({ ...BASE, fonte: 'imagem' }));
		expect(await r.json()).toMatchObject({
			ok: false,
			error: 'Escolha um arquivo antes de gerar.'
		});
	});

	it('campos fora da lista fechada são 400 (quantidade, tipo, idioma)', async () => {
		await expect(
			POST(pedido({ ...BASE, quantos: '7', fonte: 'imagem' }, JPEG))
		).rejects.toMatchObject({
			status: 400
		});
		await expect(POST(pedido({ ...BASE, fonte: 'pdf' }, JPEG))).rejects.toMatchObject({
			status: 400
		});
		await expect(
			POST(pedido({ ...BASE, targetLang: 'xx-XX', fonte: 'imagem' }, JPEG))
		).rejects.toMatchObject({ status: 400 });
	});

	it('atividade que não é do professor (ou não existe) é 404, pelo repositório escopado', async () => {
		await expect(
			POST(pedido({ ...BASE, activityId: 'nao-existe', fonte: 'imagem' }, JPEG))
		).rejects.toMatchObject({ status: 404 });
		expect(gerarPropostas).not.toHaveBeenCalled();
	});
});
