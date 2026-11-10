import { expect, test } from '@playwright/test';

/**
 * O celular da home mostra cada questão INTEIRA, sem rolar dentro dele —
 * antes de responder, nas quatro, e no celular de verdade também (é lá que o
 * player de áudio descia para duas linhas). A medida é a área da questão:
 * conteúdo (`scrollHeight`) contra o que cabe (`clientHeight`).
 */
for (const viewport of [
	{ width: 1440, height: 1000 },
	{ width: 390, height: 844 }
]) {
	test(`cada questão do celular da home cabe sem rolar (${viewport.width}px)`, async ({ page }) => {
		await page.setViewportSize(viewport);
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await page.goto('/');
		const celular = page.locator('section[aria-label="Exemplo para responder como aluno"]');
		await celular.scrollIntoViewIfNeeded();
		const pastilhas = celular.locator('div[class*="-mt-6"] > button');
		await expect(pastilhas).toHaveCount(4);
		const area = celular.locator('form .overflow-y-auto').first();

		for (let i = 0; i < 4; i++) {
			await pastilhas.nth(i).click();
			await expect(pastilhas.nth(i)).toHaveAttribute('aria-pressed', 'true');
			const { conteudo, visivel } = await area.evaluate((el) => ({
				conteudo: el.scrollHeight,
				visivel: el.clientHeight
			}));
			expect(conteudo, `questão ${i + 1}`).toBeLessThanOrEqual(visivel + 1);
		}
	});
}
