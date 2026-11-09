import { expect, test, type Page } from '@playwright/test';
import { GABARITO } from './semente.ts';

/**
 * O cenário mínimo de testing.md "E2E", contra o `preview` e o banco do `.env`
 * (a semente é de `global-setup.ts` e sai em `global-teardown.ts`):
 *
 * 1. abrir o link publicado, digitar o nome, responder três interações
 *    diferentes (escolher, montar, digitar) e ver o resultado;
 * 2. o mesmo com o resultado DESLIGADO, conferindo que nada do gabarito chega
 *    ao navegador — nem no HTML, nem nas respostas das remote functions;
 * 3. determinismo: recarregar a questão não muda a ordem das alternativas.
 */

const slugCom = () => process.env.E2E_SLUG_COM_RESULTADO ?? '';
const slugSem = () => process.env.E2E_SLUG_SEM_RESULTADO ?? '';

async function comecar(page: Page, slug: string, nome: string) {
	await page.goto(`/a/${slug}`);
	await page.getByLabel('Seu nome ou apelido').fill(nome);
	await page.getByRole('button', { name: 'Começar', exact: true }).click();
	await expect(page).toHaveURL(new RegExp(`/a/${slug}/q/1`));
}

function banco(page: Page, rotulo: 'Palavras disponíveis' | 'Escolha uma resposta') {
	return page.locator('p', { hasText: rotulo }).locator('xpath=following-sibling::*[1]');
}

/** O banco de palavras, e não a frase montada: o mesmo texto aparece nos dois. */
function palavraDisponivel(page: Page, palavra: string) {
	return banco(page, 'Palavras disponíveis').getByRole('button', { name: palavra, exact: true });
}

/**
 * Chega à próxima questão como a tela levar. Com o resultado liberado ela PARA
 * no veredito e o aluno avança pelo botão; sem ele não há veredito para ler, e
 * ela segue sozinha depois de "Verificar". E espera a questão nova estar na
 * tela: a troca anima a saída antes de a nova entrar (design-system.md "Troca de
 * questão"), e um clique nesse meio cai na questão que está indo embora.
 */
async function seguir(page: Page, para: number | 'resultado') {
	const destino = para === 'resultado' ? /\/resultado/ : new RegExp(`/q/${para}$`);
	const botao = page.getByRole('button', {
		name: para === 'resultado' ? 'Ver o resultado' : 'Próxima questão'
	});
	await expect(async () => {
		if (!destino.test(page.url()) && (await botao.isVisible())) await botao.click();
		expect(page.url()).toMatch(destino);
	}).toPass({ timeout: 10_000 });
	if (para !== 'resultado') {
		await expect(page.getByRole('button', { name: 'Verificar' })).toBeVisible();
	}
}

test('o aluno responde três interações e vê o resultado', async ({ page }) => {
	await comecar(page, slugCom(), 'Juliana E2E');

	// 1. escolher
	await page.getByRole('button', { name: new RegExp(GABARITO.escolha) }).click();
	await page.getByRole('button', { name: 'Verificar' }).click();
	await expect(page.getByText('Correto', { exact: false }).first()).toBeVisible();
	await seguir(page, 2);

	// 2. montar a frase
	for (const palavra of GABARITO.montar) await palavraDisponivel(page, palavra).click();
	await expect(page.getByRole('list', { name: 'Frase montada' }).getByRole('button')).toHaveCount(
		GABARITO.montar.length
	);
	await page.getByRole('button', { name: 'Verificar' }).click();
	await expect(page.getByText('Correto', { exact: false }).first()).toBeVisible();
	await seguir(page, 3);

	// 3. digitar
	await page.getByPlaceholder('Digite sua resposta').fill(GABARITO.digitar);
	await page.getByRole('button', { name: 'Verificar' }).click();
	await expect(page.getByText('Correto', { exact: false }).first()).toBeVisible();
	await seguir(page, 'resultado');
	await expect(page.getByText('Você acertou 3 de 3')).toBeVisible();
});

test('com o resultado desligado, nada do gabarito chega ao navegador', async ({ page }) => {
	const corpos: string[] = [];
	page.on('response', async (resposta) => {
		const tipo = resposta.headers()['content-type'] ?? '';
		if (!/html|json|javascript|text/.test(tipo)) return;
		try {
			corpos.push(await resposta.text());
		} catch {
			// Redirecionamento e resposta sem corpo: nada a guardar.
		}
	});

	await comecar(page, slugSem(), 'Pedro E2E');
	// Responde ERRADO de propósito: é o caminho em que um veredito com gabarito
	// ("a resposta esperada era…") teria motivo para aparecer.
	await page.getByRole('button', { name: /orange juice/ }).click();
	await page.getByRole('button', { name: 'Verificar' }).click();
	await seguir(page, 2);
	await palavraDisponivel(page, GABARITO.distrator).click();
	await palavraDisponivel(page, 'I').click();
	await expect(page.getByRole('list', { name: 'Frase montada' }).getByRole('button')).toHaveCount(
		2
	);
	await page.getByRole('button', { name: 'Verificar' }).click();
	await seguir(page, 3);
	await page.getByPlaceholder('Digite sua resposta').fill('Green dancing horses');
	await page.getByRole('button', { name: 'Verificar' }).click();
	await seguir(page, 'resultado');
	await expect(page.getByText('o professor desligou o feedback')).toBeVisible();

	const tudo = corpos.join('\n');
	expect(tudo.length).toBeGreaterThan(0);
	expect(tudo).not.toContain(GABARITO.digitar);
	expect(tudo).not.toContain('correctIndex');
	expect(tudo).not.toContain('"accepted"');
	await expect(page.locator('body')).not.toContainText(GABARITO.digitar);
});

test('recarregar a questão não muda a ordem das alternativas nem das palavras', async ({
	page
}) => {
	await comecar(page, slugCom(), 'Ana E2E');
	const opcoes = banco(page, 'Escolha uma resposta').getByRole('button');
	await expect(opcoes).toHaveCount(3);
	const antes = await opcoes.allInnerTexts();
	await page.reload();
	await expect(opcoes).toHaveCount(3);
	expect(await opcoes.allInnerTexts()).toEqual(antes);

	await page.getByRole('button', { name: new RegExp(GABARITO.escolha) }).click();
	await page.getByRole('button', { name: 'Verificar' }).click();
	await seguir(page, 2);
	const palavras = banco(page, 'Palavras disponíveis').getByRole('button');
	await expect(palavras).toHaveCount(GABARITO.montar.length + 1);
	const ordem = await palavras.allInnerTexts();
	await page.reload();
	await expect(palavras).toHaveCount(GABARITO.montar.length + 1);
	expect(await palavras.allInnerTexts()).toEqual(ordem);
});

test('o link da atividade tem prévia própria, fora da busca e sem gabarito', async ({
	request
}) => {
	const html = await (await request.get(`/a/${slugCom()}`)).text();
	const titulo = html.match(/<meta[^>]+property="og:title"[^>]*content="([^"]*)"/)?.[1];
	const descricao = html.match(/<meta[^>]+property="og:description"[^>]*content="([^"]*)"/)?.[1];
	expect(titulo).toBe('E2E com resultado');
	expect(descricao).toContain('3 questões');
	expect(html).toMatch(/<meta[^>]+name="robots"[^>]*content="noindex"/);
	expect(html).toMatch(/<meta[^>]+property="og:image"[^>]*content="[^"]*\/og\/atividade\.png"/);
	expect(html).not.toMatch(/<link[^>]+rel="canonical"/);
	expect(html).not.toContain(GABARITO.digitar);
});
