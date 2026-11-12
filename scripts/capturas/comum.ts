/**
 * O que os roteiros de captura compartilham (docs/propaganda/captura-das-telas.md): o navegador,
 * os três aparelhos com os parâmetros fixos, a entrada de cada conta, a foto e o recorte, e a aluna
 * respondendo uma atividade com o gabarito lido do banco (como um aluno que sabe a resposta).
 */
import 'dotenv/config';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
	chromium,
	type Browser,
	type BrowserContext,
	type Locator,
	type Page,
	type Route
} from '@playwright/test';
import { prisma } from '../../src/lib/server/db/client.ts';
import { ALUNA, BASE, PROFESSORA } from './dados.ts';

export { BASE, PROFESSORA, ALUNA, prisma };

export const PASTA = join(process.cwd(), 'docs', 'propaganda', 'capturas');

export const APARELHOS = {
	celular: {
		viewport: { width: 390, height: 844 },
		deviceScaleFactor: 3,
		isMobile: true,
		hasTouch: true
	},
	tablet: {
		viewport: { width: 820, height: 1180 },
		deviceScaleFactor: 2,
		isMobile: true,
		hasTouch: true
	},
	computador: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }
} as const;
export type Aparelho = keyof typeof APARELHOS;

/**
 * O endereço de produção, como o navegador das capturas o vê. A tela que mostra o link da atividade
 * (e o QR dele) o monta com a origem do pedido, e `localhost:5173` numa propaganda não serve. A
 * regra do Chromium aponta `spokke.com.br` para o servidor local; o Vite precisa aceitar o host
 * (`__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=spokke.com.br`, docs/propaganda/captura-das-telas.md).
 */
export const DOMINIO = 'http://spokke.com.br';

export async function abrirNavegador(): Promise<Browser> {
	// `localhost`, não `127.0.0.1`: o Vite escuta no `::1` e recusa o IPv4.
	const porta = new URL(BASE).port || '80';
	return chromium.launch({ args: [`--host-resolver-rules=MAP spokke.com.br localhost:${porta}`] });
}

/**
 * Confere que o DOMINIO cai no servidor de DESENVOLVIMENTO antes de entrar nele: o Vite serve
 * `/@vite/client` e o site de verdade não. Sem a conferência, uma regra que não pegou mandaria a
 * senha da conta de demonstração para produção.
 */
export async function conferirDominio(page: Page): Promise<void> {
	const resposta = await page.goto(`${DOMINIO}/@vite/client`);
	if (!resposta?.ok()) {
		throw new Error(
			`${DOMINIO} não respondeu pelo servidor local (o Vite aceita o host? a regra pegou?). Nada foi enviado.`
		);
	}
}

/** Um contexto por aparelho, com idioma, fuso e tema fixos — duas capturas da mesma tela saem iguais. */
export async function contexto(
	navegador: Browser,
	aparelho: Aparelho,
	opcoes: { escuro?: boolean } = {}
): Promise<BrowserContext> {
	const ctx = await navegador.newContext({
		...APARELHOS[aparelho],
		locale: 'pt-BR',
		timezoneId: 'America/Sao_Paulo',
		colorScheme: 'light'
	});
	// O tsx embrulha as funções com um `__name` que a página não conhece; e o tema do produto
	// vem do `localStorage`, não do sistema (app.html).
	await ctx.addInitScript({
		content: `window.__name = (f) => f; try { localStorage.setItem('spokke-theme', '${opcoes.escuro ? 'dark' : 'light'}'); } catch {}`
	});
	return ctx;
}

/** Entra pela API de verdade do Better Auth: o cookie fica no contexto (e na origem `base`). */
export async function entrar(
	page: Page,
	quem: 'professora' | 'aluna',
	base: string = BASE
): Promise<void> {
	if (base === DOMINIO) await conferirDominio(page);
	await page.goto(`${base}/`);
	const conta = quem === 'professora' ? PROFESSORA : ALUNA;
	const caminho =
		quem === 'professora' ? '/api/auth/sign-in/email' : '/api/auth-aluno/sign-in/email';
	const status = await page.evaluate(
		async ([c, email, password]) =>
			(
				await fetch(c, {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ email, password })
				})
			).status,
		[caminho, conta.email, conta.senha]
	);
	if (status !== 200)
		throw new Error(`Entrar como ${quem} respondeu ${status}. Rodou o cenario.ts?`);
}

/** Abre a página e espera ela assentar (hidratação, fontes, animação de entrada). */
export async function ir(page: Page, caminho: string): Promise<void> {
	await page.goto(/^https?:/.test(caminho) ? caminho : `${BASE}${caminho}`);
	await page.waitForLoadState('networkidle');
	await assentar(page);
}

export async function assentar(page: Page, ms = 600): Promise<void> {
	await page.evaluate(() => document.fonts.ready);
	await page.waitForTimeout(ms);
}

/**
 * A foto: a tela do aparelho, o recorte de um componente, ou a página inteira (`'pagina'`, para a
 * animação rolar dentro da moldura — só faz sentido fora do Player, onde a página rola).
 */
export async function foto(
	page: Page,
	video: string,
	nome: string,
	aparelho: Aparelho,
	alvo?: Locator | 'pagina',
	/** Quanto esperar a tela assentar. Zero para o estado que dura menos que isso. */
	espera = 350
): Promise<void> {
	mkdirSync(join(PASTA, video), { recursive: true });
	const caminho = join(PASTA, video, `${nome}@${aparelho}.png`);
	// O ponteiro parado sobre uma linha deixa nela o destaque de "passar o mouse".
	await page.mouse.move(0, 0);
	await assentar(page, espera);
	const opcoes = { path: caminho, animations: 'disabled' as const, caret: 'hide' as const };
	if (alvo === 'pagina') await page.screenshot({ ...opcoes, fullPage: true });
	else if (alvo) await alvo.screenshot(opcoes);
	else await page.screenshot(opcoes);
	console.log(`  ${video}/${nome}@${aparelho}.png`);
}

/**
 * O aluno abre o link pelo caminho de sempre: o código (quando a atividade pede), o nome e
 * "Começar". Para na questão 1. `antes` deixa quem chama fotografar cada etapa.
 */
export async function abrirComoAluno(
	page: Page,
	slug: string,
	{
		codigo,
		nome = 'Ana',
		antes
	}: {
		codigo?: string;
		nome?: string;
		antes?: (etapa: 'codigo' | 'entrada' | 'nome') => Promise<void>;
	} = {}
): Promise<void> {
	await ir(page, `/a/${slug}`);
	if (/\/codigo$/.test(page.url())) {
		if (!codigo) throw new Error(`A atividade ${slug} pede código.`);
		for (const [i, letra] of [...codigo].entries()) {
			await page.getByLabel(`Letra ${i + 1} de 4`).fill(letra);
		}
		await antes?.('codigo');
		await page.getByRole('button', { name: 'Entrar', exact: true }).click();
		await page.waitForURL(new RegExp(`/a/${slug}$`));
		await page.waitForLoadState('networkidle');
		await assentar(page);
	}
	await antes?.('entrada');
	await page.locator('input[name="displayName"]').fill(nome);
	await antes?.('nome');
	await page.getByRole('button', { name: 'Começar', exact: true }).click();
	await page.waitForURL(/\/q\/1$/, { timeout: 30_000 });
	await page.waitForLoadState('networkidle');
}

/**
 * Segura as remote functions de escrita (POST em `/_app/remote/`) por `ms`: os estados de espera
 * do produto ("Verificando…", "Traduzindo…") duram uma ida e volta, curto demais para a foto.
 * A resposta chega igual, só depois. Devolve a função que solta.
 */
export async function segurarRemotas(page: Page, ms = 2500): Promise<() => Promise<void>> {
	const segurar = async (route: Route) => {
		if (route.request().method() === 'POST') await new Promise((r) => setTimeout(r, ms));
		await route.continue();
	};
	await page.route('**/_app/remote/**', segurar);
	return () => page.unroute('**/_app/remote/**', segurar);
}

/**
 * Desacelera a CPU da aba `vezes` vezes, para o que o NAVEGADOR faz sozinho e rápido demais para a
 * foto (reduzir a foto, decodificar o áudio do vídeo). Devolve a função que volta ao normal.
 */
export async function cpuLenta(page: Page, vezes: number): Promise<() => Promise<void>> {
	const cdp = await page.context().newCDPSession(page);
	await cdp.send('Emulation.setCPUThrottlingRate', { rate: vezes });
	return async () => {
		await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
		await cdp.detach();
	};
}

/** O texto do botão termina com `texto` (o número do par ou do atalho pode vir antes). */
export function terminaCom(texto: string): RegExp {
	return new RegExp(`(^|\\s)${texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);
}

interface ItemDoGabarito {
	tipo: string;
	payload: Record<string, unknown>;
}

/** Os itens da versão publicada da atividade, na ordem do Player (`items[n - 1]`), com o gabarito. */
export async function gabarito(titulo: string): Promise<ItemDoGabarito[]> {
	const publicacao = await prisma.publication.findFirstOrThrow({
		where: {
			activityVersion: { activity: { title: titulo, teacher: { email: PROFESSORA.email } } }
		},
		orderBy: { createdAt: 'desc' },
		select: {
			activityVersion: {
				select: { items: { orderBy: { order: 'asc' }, select: { interaction: true } } }
			}
		}
	});
	return publicacao.activityVersion.items.map((i) => {
		const interacao = i.interaction as { type: string; payload: Record<string, unknown> };
		return { tipo: interacao.type, payload: interacao.payload };
	});
}

/**
 * Responde a questão que está na tela com o gabarito dela, pelos mesmos gestos de um aluno:
 * tocar nas peças, digitar, mover as falas. Devolve o botão principal depois do veredito.
 */
export async function responder(page: Page, item: ItemDoGabarito): Promise<void> {
	if (item.tipo === 'assemble') {
		const certa = (item.payload.accepted as string[][])[0];
		for (const peca of certa) {
			// Só nas palavras DISPONÍVEIS: com peça repetida ("the" duas vezes), o primeiro botão com o
			// nome é o que já está na frase montada, e tocar nele o devolve.
			const literal = peca.includes('"') ? `'${peca}'` : `"${peca}"`;
			await page
				.locator(
					`xpath=//button[not(ancestor::*[@aria-label="Frase montada"])][normalize-space(.)=${literal}]`
				)
				.first()
				.click();
			await page.waitForTimeout(250);
		}
	} else if (item.tipo === 'choice') {
		const opcoes = item.payload.options as string[];
		const certa = opcoes[item.payload.correctIndex as number];
		await page
			.locator('button')
			.filter({ hasText: terminaCom(certa) })
			.first()
			.click();
	} else if (item.tipo === 'match') {
		// Duas colunas: toca no termo da esquerda e depois no par dele na direita.
		const colunas = page.locator('.grid.grid-cols-2 > div');
		for (const par of item.payload.pairs as { left: string; right: string }[]) {
			await colunas
				.nth(0)
				.locator('button')
				.filter({ hasText: terminaCom(par.left) })
				.first()
				.click();
			await colunas
				.nth(1)
				.locator('button')
				.filter({ hasText: terminaCom(par.right) })
				.first()
				.click();
			await page.waitForTimeout(200);
		}
	} else if (item.tipo === 'type' || item.tipo === 'cloze') {
		await page
			.getByRole('textbox')
			.first()
			.fill((item.payload.accepted as string[])[0]);
	} else if (item.tipo === 'order') {
		const certas = item.payload.lines as string[];
		for (let alvo = 0; alvo < certas.length; alvo++) {
			for (let tentativa = 0; tentativa < certas.length; tentativa++) {
				const atuais = await page.locator('[aria-label="Falas na ordem"] li').allInnerTexts();
				const posicao = atuais.findIndex((t) => t.includes(certas[alvo]));
				if (posicao <= alvo) break;
				await page.getByRole('button', { name: `Mover “${certas[alvo]}” para cima` }).click();
				await page.waitForTimeout(150);
			}
		}
	}
	await page.getByRole('button', { name: 'Verificar', exact: true }).click();
	await page
		.getByRole('button', { name: /Próxima questão|Ver o resultado/ })
		.first()
		.waitFor({ timeout: 20_000 });
}

/**
 * Responde o resto da atividade a partir da questão em que o Player está (a retomada abre na
 * primeira sem resposta) e para no resultado.
 */
export async function responderTudo(page: Page, titulo: string, inicio?: number): Promise<void> {
	const itens = await gabarito(titulo);
	// Sem `inicio`, a questão é a da URL depois da entrada (a retomada cai na primeira sem resposta).
	// Com ele, quem chama acabou de tocar em "Próxima questão" e a URL ainda é a da anterior.
	if (inicio === undefined) await page.waitForURL(/\/q\/\d+$/, { timeout: 20_000 });
	let n = inicio ?? Number(/\/q\/(\d+)$/.exec(page.url())?.[1] ?? 1);
	while (n <= itens.length) {
		await page.waitForURL(new RegExp(`/q/${n}$`), { timeout: 20_000 });
		await assentar(page, 400);
		const jaRespondida = await page
			.getByRole('button', { name: 'Próxima questão', exact: true })
			.isVisible()
			.catch(() => false);
		if (!jaRespondida) await responder(page, itens[n - 1]);
		await page
			.getByRole('button', { name: /Próxima questão|Ver o resultado/ })
			.first()
			.click();
		n++;
	}
	await page.waitForURL(/\/resultado/, { timeout: 20_000 });
}
