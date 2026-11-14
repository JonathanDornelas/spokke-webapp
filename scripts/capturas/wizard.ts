/**
 * O wizard de criação pelos gestos da professora (docs/propaganda/captura-das-telas.md): os
 * detalhes, a lista colada, as questões geradas e a publicação. Quem precisa fotografar um estado
 * no meio do caminho (o vídeo das formas de montar) chama os passos um a um e faz a foto entre eles.
 */
import type { Page } from '@playwright/test';
import { ir, prisma, PROFESSORA } from './comum.ts';

export interface Detalhes {
	titulo: string;
	/** O rótulo do idioma no seletor, como a tela o mostra: "Inglês (EUA)", "Árabe". */
	idioma: string;
	/** Rótulo CEFR, como o chip da etapa 1 o mostra: "A1", "B1". */
	nivel?: string;
}

/** A atividade já publicada com este título na conta de demonstração, para rodar de novo sem duplicar. */
export async function atividadeNoAr(titulo: string): Promise<{ id: string; slug: string } | null> {
	const publicacao = await prisma.publication.findFirst({
		where: {
			activityVersion: { activity: { title: titulo, teacher: { email: PROFESSORA.email } } }
		},
		orderBy: { createdAt: 'desc' },
		select: { slug: true, activityVersion: { select: { activityId: true } } }
	});
	return publicacao ? { id: publicacao.activityVersion.activityId, slug: publicacao.slug } : null;
}

/** Etapa 1. Devolve o id da atividade, que a etapa 2 traz no endereço. */
export async function criarAtividade(page: Page, detalhes: Detalhes): Promise<string> {
	await ir(page, '/atividades/nova');
	await page.locator('input[name="title"]').fill(detalhes.titulo);
	await page.locator('select[name="targetLang"]').selectOption({ label: detalhes.idioma });
	if (detalhes.nivel) await page.getByRole('button', { name: detalhes.nivel, exact: true }).click();
	await page.getByRole('button', { name: /^Continuar/ }).click();
	await page.waitForURL(/\/atividades\/[^/?#]+\/materiais/, { timeout: 30_000 });
	await page.waitForLoadState('networkidle');
	return /\/atividades\/([^/?#]+)\/materiais/.exec(page.url())![1];
}

/** Quantos materiais a atividade tem: a lista da etapa 2 vem do banco. */
export async function materiaisDa(id: string): Promise<number> {
	const atividade = await prisma.activity.findUniqueOrThrow({
		where: { id },
		select: { _count: { select: { contentUnits: true } } }
	});
	return atividade._count.contentUnits;
}

/** Espera a gravação terminar: o lote passa pela tradução automática no servidor. */
export async function esperarMateriais(id: string, quantos: number): Promise<void> {
	for (let i = 0; i < 120; i++) {
		if ((await materiaisDa(id)) >= quantos) return;
		await new Promise((r) => setTimeout(r, 500));
	}
	throw new Error(`A atividade ${id} não chegou a ${quantos} materiais.`);
}

/** "Colar uma lista" no tipo escolhido (par de frases, de padrão), e "Adicionar N materiais". */
export async function colarLista(page: Page, id: string, linhas: string[]): Promise<void> {
	const antes = await materiaisDa(id);
	await page.getByRole('button', { name: 'Colar uma lista', exact: true }).click();
	await page.locator('textarea[name="raw"]').fill(linhas.join('\n'));
	await page
		.getByRole('button', { name: `Adicionar ${linhas.length} materiais`, exact: true })
		.click();
	await esperarMateriais(id, antes + linhas.length);
}

/** "Gerar questões": a etapa 3 abre com as propostas. */
export async function gerarQuestoes(page: Page): Promise<void> {
	await page.getByRole('button', { name: /Gerar questões/ }).click();
	await page.waitForURL(/\/revisar/, { timeout: 120_000 });
	await page
		.getByText(/\d+ questões propostas/)
		.first()
		.waitFor({ timeout: 120_000 });
}

/** O endereço que está no ar (a tela mostra o slug da publicação, não um derivado). */
export async function slugDa(id: string): Promise<string> {
	const publicacao = await prisma.publication.findFirstOrThrow({
		where: { activityVersion: { activityId: id } },
		orderBy: { createdAt: 'desc' },
		select: { slug: true }
	});
	return publicacao.slug;
}

/**
 * Etapa 4. O áudio sai pela fila do worker e a tela recarrega sozinha até ele ficar pronto; só
 * então o botão libera. Os interruptores são ligados DEPOIS disso, porque a recarga os
 * desfaria. Devolve o slug publicado.
 */
export async function publicar(
	page: Page,
	id: string,
	{ codigo }: { codigo?: string } = {}
): Promise<string> {
	await ir(page, `/atividades/${id}/publicar`);
	await page.waitForFunction(
		() => {
			const botao = [...document.querySelectorAll('button')].find(
				(b) => b.textContent?.trim() === 'Publicar'
			);
			return !!botao && !botao.hasAttribute('disabled');
		},
		undefined,
		{ timeout: 300_000, polling: 1000 }
	);
	if (codigo) {
		await page.locator('input[name="requireCode"]').check();
		await page.locator('input[name="accessCode"]').fill(codigo);
	}
	const resultado = page.locator('input[name="showResult"]');
	if (!(await resultado.isChecked())) await resultado.check();
	await page.getByRole('button', { name: 'Publicar', exact: true }).click();
	await page.getByText('No ar', { exact: true }).first().waitFor({ timeout: 60_000 });
	return slugDa(id);
}
