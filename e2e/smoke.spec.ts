import { expect, test } from '@playwright/test';

// Roda contra o `preview` (4173), e ali a autenticação fica presa ao `BETTER_AUTH_URL`
// do `.env` (auth.md): nenhum cenário logado funciona sem trocar essa variável, e ele
// gravaria no banco de dev. O bloqueio por limite de quem está logado é coberto no
// nível do repositório (`cota.test.ts`); aqui fica o que a superfície pública promete.

test('a home abre com a promessa do produto', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('heading', { level: 1 })).toContainText('exercícios de idioma');
});

test('o painel interno responde 404 para quem não está logado', async ({ page }) => {
	const resposta = await page.goto('/admin');
	expect(resposta?.status()).toBe(404);
	// A MESMA tela de qualquer endereço que não existe, não um "Not found" em texto puro.
	await expect(page.getByRole('heading', { name: 'Esta página não existe.' })).toBeVisible();
});

test('subpágina do painel interno também cai na tela de página não encontrada', async ({
	page
}) => {
	const resposta = await page.goto('/admin/professores');
	expect(resposta?.status()).toBe(404);
	await expect(page.getByRole('heading', { name: 'Esta página não existe.' })).toBeVisible();
});

test('quem bate no limite chega aos planos sabendo por quê', async ({ page }) => {
	await page.goto('/planos?motivo=criar');
	await expect(page.getByText('Você chegou ao limite de atividades do seu plano')).toBeVisible();
});

test('motivo fora da lista fechada não vira texto na tela', async ({ page }) => {
	await page.goto('/planos?motivo=%3Cscript%3Ealert(1)%3C%2Fscript%3E');
	await expect(page.locator('main')).not.toContainText('alert(1)');
	await expect(page.getByText('Você chegou ao limite')).toHaveCount(0);
});

/** O conteúdo de uma meta tag no HTML INICIAL — o robô da prévia não roda JavaScript. */
function meta(html: string, chave: string): string | null {
	const tag = html.match(new RegExp(`<meta[^>]+(?:property|name)="${chave}"[^>]*>`))?.[0];
	return tag?.match(/content="([^"]*)"/)?.[1] ?? null;
}

test('a home sai com a prévia de compartilhamento no HTML inicial', async ({ request }) => {
	const resposta = await request.get('/');
	const html = await resposta.text();
	expect(meta(html, 'og:title')).toBeTruthy();
	expect(meta(html, 'og:description')).toBeTruthy();
	expect(meta(html, 'og:image')).toMatch(/^https?:\/\/.+\/og\/spokke\.png$/);
	expect(meta(html, 'og:locale')).toBe('pt_BR');
	expect(meta(html, 'twitter:card')).toBe('summary_large_image');
	expect(html).toMatch(/<link[^>]+rel="canonical"/);
	expect(meta(html, 'robots')).toBeNull();

	const imagem = await request.get('/og/spokke.png');
	expect(imagem.status()).toBe(200);
	expect(imagem.headers()['content-type']).toContain('image/png');
});

test('entrar fica fora da busca; o cadastro, não', async ({ request }) => {
	expect(meta(await (await request.get('/entrar')).text(), 'robots')).toBe('noindex');
	expect(meta(await (await request.get('/cadastro')).text(), 'robots')).toBeNull();
});
