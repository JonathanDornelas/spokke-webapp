/**
 * Capturas do vídeo "sua sequência vira um mapa" (docs/propaganda/video-modulos-em-fases.md).
 * Pede o cenário (`cenario.ts`), o servidor, o worker e o serviço de áudio no ar.
 *
 * A turma é o 8º A, toda quarta às 08:00, como o seed a programa: a Frutas 1 abre no dia do seed e
 * as outras têm data. O mapa anda pelas ações de verdade da professora — "Liberar agora" na
 * Frutas 2, publicar a Frutas 3 (que era rascunho) e liberá-la, liberar a Frutas 4 — e a Ana
 * responde pelo link pessoal, com o gabarito lido do banco, como uma aluna que sabe a resposta.
 * As datas da tela saem do dia em que o cenário rodou.
 *
 *   pnpm tsx scripts/capturas/video-modulos.ts
 */
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import {
	abrirNavegador,
	ALUNA,
	contexto,
	entrar,
	foto,
	gabarito,
	ir,
	PASTA,
	prisma,
	PROFESSORA,
	responder,
	responderTudo
} from './comum.ts';
import { TURMA_DA_ANA } from './dados.ts';

const V = 'modulos';

const modulo = await prisma.module.findFirstOrThrow({
	where: { name: 'Frutas', teacher: { email: PROFESSORA.email } },
	select: { id: true }
});
const atividade = (titulo: string) =>
	prisma.activity.findFirstOrThrow({
		where: { title: titulo, teacher: { email: PROFESSORA.email } },
		select: { id: true }
	});
const mapa = `/aluno/modulos/${modulo.id}`;

const conta = await prisma.studentAccount.findUniqueOrThrow({
	where: { email: ALUNA.email },
	select: { id: true }
});
const ficha = await prisma.student.findFirstOrThrow({
	where: { accountId: conta.id },
	select: { id: true }
});

/** O botão "Programação" da linha de uma turma no módulo aberto. */
const programacaoDa = (page: Page, turma: string) =>
	page.locator(
		`xpath=//span[normalize-space(.)="${turma}"]/ancestor::div[.//button[normalize-space(.)="Programação"]][1]//button[normalize-space(.)="Programação"]`
	);

async function abrirMapa(page: Page) {
	await ir(page, mapa);
	// O avatar anda uma vez quando há fase nova: espera ele chegar.
	await page.waitForTimeout(1600);
}

/** Espera a liberação da atividade para a turma da Ana sair (quem libera é o worker, pela fila). */
async function esperarLiberacao(titulo: string) {
	for (let i = 0; i < 90; i++) {
		const envio = await prisma.moduleSend.findFirst({
			where: {
				activity: { title: titulo, teacher: { email: PROFESSORA.email } },
				allocation: { classroom: { name: TURMA_DA_ANA } }
			},
			select: { status: true }
		});
		if (envio?.status === 'enviada') return;
		await new Promise((r) => setTimeout(r, 1000));
	}
	throw new Error(`A liberação de "${titulo}" não saiu.`);
}

/** "Liberar agora", na linha da atividade na programação da turma da Ana. */
async function liberarAgora(prof: Page, titulo: string) {
	await ir(prof, `/modulos/${modulo.id}`);
	await programacaoDa(prof, TURMA_DA_ANA).click();
	await prof
		.getByRole('button', { name: `Liberar ${titulo}` })
		.first()
		.click();
	await esperarLiberacao(titulo);
	await prof.keyboard.press('Escape');
}

/** A Ana terminou esta atividade? (A ficha herdada do seed pode já ter feito a Frutas 1.) */
async function terminou(titulo: string) {
	const feitas = await prisma.attempt.count({
		where: {
			studentId: ficha.id,
			finishedAt: { not: null },
			publication: { activityVersion: { activity: { title: titulo } } }
		}
	});
	return feitas > 0;
}

// Sem sobras de uma rodada com outros nomes de arquivo.
rmSync(join(PASTA, V), { recursive: true, force: true });

const navegador = await abrirNavegador();
try {
	const prof = await (await contexto(navegador, 'computador')).newPage();
	await entrar(prof, 'professora');
	const ana = await (await contexto(navegador, 'celular')).newPage();
	await entrar(ana, 'aluna');

	/** Do mapa até a questão em que a fase está (a retomada cai na primeira sem resposta). */
	async function entrarNaFase(numero: number) {
		await abrirMapa(ana);
		await ana.getByRole('button', { name: new RegExp(`^Fase ${numero} de 4`) }).click();
		await ana.getByRole('link', { name: /^(Jogar|Continuar)$/ }).click();
		await ana.waitForURL(/\/a\/[^/]+(\/q\/\d+)?$/, { timeout: 30_000 });
		await ana.waitForLoadState('networkidle');
		if (!/\/q\/\d+$/.test(ana.url())) {
			await ana
				.getByRole('button', { name: /^(Começar|Continuar)/ })
				.first()
				.click();
		}
	}

	// ── 02 a 04: a professora monta a sequência e escolhe as turmas ──
	await ir(prof, '/modulos');
	await prof.getByRole('button', { name: 'Novo módulo' }).first().click();
	const bandeja = prof.getByRole('dialog');
	await bandeja.getByPlaceholder('Ex.: Unidade 4 — rotina').fill('Frutas');
	await bandeja
		.getByPlaceholder('O que este módulo cobre, numa linha.')
		.fill('Vocabulário de frutas, da feira à receita.');
	await bandeja.locator('label[title="Teal"]').click();
	await foto(prof, V, '02a-novo-modulo-nome', 'computador', bandeja);
	for (const t of [
		'Frutas 1 — vocabulário',
		'Frutas 2 — na feira',
		'Frutas 3 — receita',
		'Frutas 4 — diálogo'
	]) {
		await bandeja.getByText(t, { exact: true }).click();
		await prof.waitForTimeout(150);
	}
	await bandeja.getByText('Frutas 1 — vocabulário', { exact: true }).scrollIntoViewIfNeeded();
	await foto(prof, V, '02b-novo-modulo-ordem', 'computador', bandeja);
	// Fecha sem criar: o módulo Frutas do seed é o que segue no vídeo.
	await prof.keyboard.press('Escape');

	await ir(prof, `/modulos/${modulo.id}`);
	const ordem = prof
		.locator('section')
		.filter({ has: prof.getByRole('heading', { name: 'Atividades, na ordem' }) });
	await foto(prof, V, '03-atividades-na-ordem', 'computador', ordem.first());

	await prof.getByRole('button', { name: 'Adicionar turmas' }).first().click();
	const turmas = prof.getByRole('dialog');
	await foto(prof, V, '04-adicionar-turmas', 'computador', turmas);
	// Marcada e NÃO confirmada: o seed já pôs o módulo no 7º B e no 8º A.
	await turmas.getByText('9º C — inglês', { exact: true }).click();
	await foto(prof, V, '04-adicionar-turmas-marcada', 'computador', turmas);
	await prof.keyboard.press('Escape');
	await prof.waitForTimeout(400);

	// ── 05: a programação do 8º A: toda quarta, 08:00, e a prévia com uma data por atividade ──
	await programacaoDa(prof, TURMA_DA_ANA).click();
	const programacao = prof.getByRole('dialog');
	await foto(prof, V, '05a-programacao-ritmo', 'computador', programacao);
	// A rodinha rola o que está sob o ponteiro: ele vai para cima do painel antes.
	await programacao.getByText('Prévia', { exact: true }).scrollIntoViewIfNeeded();
	await programacao.getByText('Prévia', { exact: true }).hover();
	await prof.mouse.wheel(0, 600);
	await foto(prof, V, '05b-programacao-previa', 'computador', programacao);
	await prof.keyboard.press('Escape');

	// ── 00: o ponto de partida — a Frutas 1 (a que abriu) feita, as outras com data ──
	if (!(await terminou('Frutas 1 — vocabulário'))) {
		await entrarNaFase(1);
		await responderTudo(ana, 'Frutas 1 — vocabulário');
	}
	await abrirMapa(ana);
	await foto(ana, V, '00-mapa-antes', 'celular');

	// ── 01: "Liberar agora" na Frutas 2 ──
	await liberarAgora(prof, 'Frutas 2 — na feira');
	await abrirMapa(ana);
	await foto(ana, V, '01-mapa-fase-2-liberada', 'celular');

	// ── 06 a 08: a Ana joga a fase 2 e fica em dia ──
	await ana.getByRole('button', { name: /^Fase 2 de 4/ }).click();
	await ana.getByRole('link', { name: 'Jogar', exact: true }).waitFor();
	await foto(ana, V, '06-folha-da-fase', 'celular');
	await ana.getByRole('link', { name: 'Jogar', exact: true }).click();
	await ana.waitForURL(/\/a\/[^/]+(\/q\/\d+)?$/, { timeout: 30_000 });
	await ana.waitForLoadState('networkidle');
	if (!/\/q\/\d+$/.test(ana.url())) {
		await ana
			.getByRole('button', { name: /^(Começar|Continuar)/ })
			.first()
			.click();
	}
	await ana.waitForURL(/\/q\/1$/);
	const itensF2 = await gabarito('Frutas 2 — na feira');
	await responder(ana, itensF2[0]);
	await foto(ana, V, '07-questao-correta', 'celular');
	await ana
		.getByRole('button', { name: /Próxima questão|Ver o resultado/ })
		.first()
		.click();
	await responderTudo(ana, 'Frutas 2 — na feira', 2);
	await abrirMapa(ana);
	await foto(ana, V, '08-mapa-em-dia', 'celular');

	// ── 09: a professora publica a Frutas 3 (era rascunho) e a libera ──
	const f3 = await atividade('Frutas 3 — receita');
	await ir(prof, `/atividades/${f3.id}/publicar`);
	await prof.getByRole('button', { name: 'Publicar', exact: true }).waitFor({ state: 'visible' });
	await prof.waitForFunction(
		() => {
			const b = [...document.querySelectorAll('button')].find(
				(x) => x.textContent?.trim() === 'Publicar'
			);
			return b && !b.hasAttribute('disabled');
		},
		undefined,
		{ timeout: 120_000 }
	);
	await prof.getByRole('button', { name: 'Publicar', exact: true }).click();
	await prof.getByText('No ar', { exact: true }).first().waitFor({ timeout: 60_000 });
	await liberarAgora(prof, 'Frutas 3 — receita');
	await abrirMapa(ana);
	await foto(ana, V, '09-mapa-fase-3-liberada', 'celular');

	// ── 10: estrela só onde a professora liberou o resultado — a Frutas 2 fica sem placar ──
	const f2pub = await prisma.publication.findFirstOrThrow({
		where: {
			activityVersion: {
				activity: { title: 'Frutas 2 — na feira', teacher: { email: PROFESSORA.email } }
			}
		},
		orderBy: { createdAt: 'desc' },
		select: { id: true, settings: true }
	});
	await prisma.publication.update({
		where: { id: f2pub.id },
		data: { settings: { ...(f2pub.settings as Record<string, unknown>), showResult: false } }
	});
	await abrirMapa(ana);
	await foto(ana, V, '10-estrelas-e-sem-placar', 'celular');

	// ── 11: o castelo — a Frutas 3, e a Frutas 4 liberada e feita ──
	await entrarNaFase(3);
	await responderTudo(ana, 'Frutas 3 — receita');
	await liberarAgora(prof, 'Frutas 4 — diálogo');
	await entrarNaFase(4);
	await responderTudo(ana, 'Frutas 4 — diálogo');
	await abrirMapa(ana);
	await ana.waitForTimeout(1500);
	await foto(ana, V, '11-modulo-concluido', 'celular');

	// O roteiro responde em menos de um segundo; uma pessoa leva de 20 a 45 por questão. As respostas
	// da Ana ganham o tempo de uma pessoa, para o "Como você vem indo" da área do aluno (capturada no
	// vídeo multiplataforma) não denunciar o roteiro. Só esta conta, no banco de desenvolvimento,
	// como o seed já faz com a turma inteira.
	const respostas = await prisma.attemptItem.findMany({
		where: { attempt: { studentId: ficha.id } },
		orderBy: { createdAt: 'asc' },
		select: { id: true }
	});
	for (const [i, resposta] of respostas.entries()) {
		await prisma.attemptItem.update({
			where: { id: resposta.id },
			data: { ms: 20_000 + ((i * 7919) % 25_000) }
		});
	}

	// ── 12: do lado da professora, quem abriu e quem terminou ──
	await ir(prof, `/modulos/${modulo.id}`);
	const liberacoes = prof
		.locator('section')
		.filter({ has: prof.getByRole('heading', { name: 'Liberações' }) });
	await foto(prof, V, '12-liberacoes', 'computador', liberacoes.first());
} finally {
	await navegador.close();
	await prisma.$disconnect();
}
