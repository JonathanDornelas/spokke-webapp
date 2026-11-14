/**
 * Capturas do vídeo "no aparelho que o aluno tiver" (docs/propaganda/video-multiplataforma.md).
 * Pede o cenário (`cenario.ts`), o servidor, o worker e o serviço de áudio no ar.
 *
 * A Present perfect das outras propagandas nasce pelo wizard, como a professora faria: as quatro
 * frases coladas (a quarta sem tradução) e o código KTRM. A atividade em árabe também, porque o
 * seed não tem nenhuma. Rodar de novo reaproveita as duas. A aluna entra pelo link aberto, sem
 * conta, em cada aparelho; a área do aluno é a da Ana Ribeiro, com o histórico que o roteiro dos
 * módulos deixou.
 *
 *   pnpm tsx scripts/capturas/video-multiplataforma.ts
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Browser, Page } from '@playwright/test';
import { toFile } from 'qrcode';
import {
	abrirComoAluno,
	abrirNavegador,
	contexto,
	DOMINIO,
	entrar,
	foto,
	gabarito,
	ir,
	PASTA,
	prisma,
	PROFESSORA,
	segurarRemotas,
	terminaCom,
	type Aparelho
} from './comum.ts';
import { atividadeNoAr, colarLista, criarAtividade, gerarQuestoes, publicar } from './wizard.ts';

const V = 'multiplataforma';

const PRESENT_PERFECT = {
	titulo: 'Present perfect',
	idioma: 'Inglês (EUA)',
	nivel: 'B1',
	codigo: 'KTRM',
	linhas: [
		'I have lived here for two years. | Eu moro aqui há dois anos.',
		'She has been working here since 2019. | Ela trabalha aqui desde 2019.',
		"We haven't finished yet. | Nós ainda não terminamos.",
		'Have you ever been to London?'
	]
};

// Saudações de livro didático. Antes de a peça ir ao ar, um falante confere.
// Todas com 3 palavras ou mais: a lacuna só existe com contexto dos dois lados (`cloze-target`),
// e é a lacuna que abre o teclado árabe. No rodízio do `selectItems`, quem ganha a lacuna é a
// SEGUNDA frase, e nela o buraco cai em "حالك".
const ARABE = {
	titulo: 'Árabe 1 — saudações',
	idioma: 'Árabe',
	nivel: 'A1',
	linhas: [
		'أنا من البرازيل | Eu sou do Brasil',
		'كيف حالك اليوم؟ | Como você está hoje?',
		'صباح الخير يا أستاذ | Bom dia, professor',
		'شكرا جزيلا يا صديقي | Muito obrigado, meu amigo',
		'إلى اللقاء غدا | Até amanhã'
	]
};

type Atividade = {
	titulo: string;
	idioma: string;
	nivel: string;
	linhas: string[];
	codigo?: string;
};

async function garantir(prof: Page, a: Atividade): Promise<{ id: string; slug: string }> {
	const pronta = await atividadeNoAr(a.titulo);
	if (pronta) return pronta;
	const id = await criarAtividade(prof, a);
	await colarLista(prof, id, a.linhas);
	await gerarQuestoes(prof);
	const slug = await publicar(prof, id, { codigo: a.codigo });
	console.log(`  criada: ${a.titulo} (/a/${slug})`);
	return { id, slug };
}

/** A posição (1, 2, …) da primeira questão daquele tipo, na ordem do Player. */
async function questao(titulo: string, tipo: string) {
	const itens = await gabarito(titulo);
	const indice = itens.findIndex((i) => i.tipo === tipo);
	if (indice < 0) throw new Error(`"${titulo}" saiu sem questão do tipo ${tipo}.`);
	return { n: indice + 1, item: itens[indice] };
}

/**
 * O bloco 1 põe as três telas lado a lado com a MESMA questão, e a ordem das alternativas sai da
 * seed da tentativa (regra nº 8). Cada aparelho abre a sua, então a seed da primeira passa para as
 * outras duas. Só no banco de desenvolvimento, e é um estado que o produto produz por acaso.
 */
let seedDaEscuta: string | null = null;
async function mesmaOrdem(slug: string) {
	const tentativa = await prisma.attempt.findFirstOrThrow({
		where: { publication: { slug } },
		orderBy: { startedAt: 'desc' },
		select: { id: true, seed: true }
	});
	if (seedDaEscuta === null) seedDaEscuta = tentativa.seed;
	else await prisma.attempt.update({ where: { id: tentativa.id }, data: { seed: seedDaEscuta } });
}

/** A escuta da Present perfect num aparelho: sem resposta, escolhida, verificando, veredito. */
async function escuta(navegador: Browser, aparelho: Aparelho, slug: string) {
	const { n, item } = await questao(PRESENT_PERFECT.titulo, 'choice');
	const certa = (item.payload.options as string[])[item.payload.correctIndex as number];
	const page = await (await contexto(navegador, aparelho)).newPage();

	await abrirComoAluno(page, slug, {
		codigo: PRESENT_PERFECT.codigo,
		// A entrada só no celular: é nele que a turma chega pelo QR.
		antes:
			aparelho === 'celular'
				? async (etapa) => {
						const nome = {
							codigo: '03-codigo',
							entrada: '03-entrada-vazia',
							nome: '03-entrada-nome'
						};
						await foto(page, V, nome[etapa], 'celular');
					}
				: undefined
	});
	await mesmaOrdem(slug);

	await ir(page, `/a/${slug}/q/${n}`);
	await foto(page, V, '01-escuta-sem-resposta', aparelho);

	const opcao = page
		.locator('button')
		.filter({ hasText: terminaCom(certa) })
		.first();
	const computador = aparelho === 'computador';
	// No computador a alternativa é escolhida pelo número dela, como a legenda da tela ensina.
	const tecla = computador ? /^\s*(\d)/.exec(await opcao.innerText())?.[1] : undefined;
	if (tecla) await page.keyboard.press(tecla);
	else await opcao.click();
	await foto(page, V, '01-escuta-escolhida', aparelho);

	// "Verificando…" dura uma ida e volta: a correção fica segura 2,5 s para a foto.
	const soltar = await segurarRemotas(page);
	if (computador) await page.keyboard.press('Enter');
	else await page.getByRole('button', { name: 'Verificar', exact: true }).click();
	await page.getByText('Verificando sua resposta').first().waitFor();
	await foto(page, V, '01-escuta-verificando', aparelho);
	await page
		.getByRole('button', { name: /Próxima questão|Ver o resultado/ })
		.first()
		.waitFor({ timeout: 20_000 });
	await soltar();
	await foto(page, V, '01-escuta-veredito', aparelho);
	if (tecla) console.log(`    no computador, a certa é a alternativa ${tecla}`);
	await page.context().close();
}

/** Uma lacuna no idioma estudado, no celular: o teclado do idioma, vazio e com a resposta. */
async function teclado(
	navegador: Browser,
	titulo: string,
	nome: string,
	{ grade }: { grade: boolean }
) {
	const { n, item } = await questao(titulo, 'cloze');
	const slug = (await atividadeNoAr(titulo))!.slug;
	const page = await (await contexto(navegador, 'celular')).newPage();
	await abrirComoAluno(page, slug);
	await ir(page, `/a/${slug}/q/${n}`);
	if (grade) {
		// A grade nasce oculta em toda questão; quem a chama é o aluno, pelo rodapé.
		await page.getByRole('button', { name: /Teclado/ }).click();
		await page.waitForTimeout(500);
		await foto(page, V, `${nome}-aberto`, 'celular');
	}
	await page
		.getByRole('textbox')
		.first()
		.fill((item.payload.accepted as string[])[0]);
	await foto(page, V, grade ? `${nome}-digitado` : nome, 'celular');
	await page.context().close();
}

/**
 * O QR da captura 02 leva a um endereço que só existe nesta máquina, e no vídeo alguém aponta a
 * câmera. Este é o mesmo desenho (as opções da tela de detalhe da atividade) apontando para a
 * atividade de exemplo, que existe no site, em tamanho de projeção: é ele que entra no vídeo.
 */
async function qrDoExemplo() {
	mkdirSync(join(PASTA, V), { recursive: true });
	await toFile(join(PASTA, V, '02-qr-do-exemplo.png'), 'https://spokke.com.br/exemplo', {
		margin: 1,
		width: 1056,
		errorCorrectionLevel: 'M'
	});
	console.log(`  ${V}/02-qr-do-exemplo.png`);
}

/**
 * Os blocos pelo nome na linha de comando, para refazer só o que a tela mudou:
 * `qr`, `escuta`, `teclados`, `resultados`, `aluno`. Sem nenhum, todos.
 */
const pedidos = process.argv.slice(2);
const quer = (bloco: string) => pedidos.length === 0 || pedidos.includes(bloco);

const navegador = await abrirNavegador();
try {
	const prof = await (await contexto(navegador, 'computador')).newPage();
	await entrar(prof, 'professora');

	// ── as duas atividades, pelo wizard (rodar de novo reaproveita), quando algum bloco as usa ──
	const usaAsAtividades = ['qr', 'escuta', 'teclados'].some(quer);
	const presentPerfect = usaAsAtividades
		? await garantir(prof, PRESENT_PERFECT)
		: { id: '', slug: '' };
	if (usaAsAtividades) await garantir(prof, ARABE);

	// ── 02: o cartão "Como a turma entra", com o QR e o código ──
	// Pelo endereço de produção: o link e o QR saem da origem do pedido (`DOMINIO`, comum.ts).
	if (quer('qr')) {
		const profNoDominio = await (await contexto(navegador, 'computador')).newPage();
		await entrar(profNoDominio, 'professora', DOMINIO);
		await ir(profNoDominio, `${DOMINIO}/atividades/${presentPerfect.id}`);
		const entrada = profNoDominio
			.locator('section')
			.filter({ has: profNoDominio.getByRole('heading', { name: 'Como a turma entra' }) })
			.first();
		await foto(profNoDominio, V, '02-no-ar-qr-e-codigo', 'computador', entrada);
		await profNoDominio.context().close();
		await qrDoExemplo();
	}

	// ── 01 e 03: a mesma escuta em três aparelhos ──
	if (quer('escuta')) {
		for (const aparelho of ['celular', 'tablet', 'computador'] as const) {
			await escuta(navegador, aparelho, presentPerfect.slug);
		}
	}

	// ── 04 a 06: o teclado de cada idioma ──
	if (quer('teclados')) {
		await teclado(navegador, 'Japonês 1 — cumprimentos', '04-japones-kana', { grade: true });
		await teclado(navegador, 'Español 1 — saludos', '05-espanhol-acentos', { grade: false });
		await teclado(navegador, ARABE.titulo, '06-arabe', { grade: true });
	}

	// ── 07 e 08: resultados, no computador, no celular e no escuro ──
	if (quer('resultados')) {
		// A atividade do seed com mais respostas e com lacuna (é a lacuna que dá o "quase").
		const viagem = await prisma.activity.findFirstOrThrow({
			where: { title: 'Viagem 2 — no hotel', teacher: { email: PROFESSORA.email } },
			select: { id: true }
		});
		const resultados = `/resultados/${viagem.id}`;
		await ir(prof, resultados);
		await foto(prof, V, '07-resultados', 'computador');

		const profCelular = await (await contexto(navegador, 'celular')).newPage();
		await entrar(profCelular, 'professora');
		await ir(profCelular, resultados);
		await foto(profCelular, V, '07-resultados', 'celular');
		await foto(profCelular, V, '07-resultados-pagina-inteira', 'celular', 'pagina');

		const profEscuro = await (await contexto(navegador, 'computador', { escuro: true })).newPage();
		await entrar(profEscuro, 'professora');
		await ir(profEscuro, resultados);
		await foto(profEscuro, V, '08-resultados-escuro', 'computador');
	}

	// ── 09: a área da aluna, no tablet e no celular ──
	if (quer('aluno')) {
		for (const aparelho of ['tablet', 'celular'] as const) {
			const ana = await (await contexto(navegador, aparelho)).newPage();
			await entrar(ana, 'aluna');
			await ir(ana, '/aluno');
			await foto(ana, V, '09-aluno', aparelho);
			await foto(ana, V, '09-aluno-pagina-inteira', aparelho, 'pagina');
		}
	}
} finally {
	await navegador.close();
	await prisma.$disconnect();
}
