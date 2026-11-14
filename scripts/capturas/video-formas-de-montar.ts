/**
 * Capturas do vídeo "do jeito que o material estiver" (docs/propaganda/video-formas-de-montar.md).
 * Pede o cenário (`cenario.ts`), os arquivos de entrada (`arquivos.ts`) e, no ar, o servidor com o
 * Gemini falso (captura-das-telas.md), o worker e o serviço de áudio, que faz a tradução automática.
 *
 * Uma atividade nova recebe material pelas sete portas da etapa 2, na ordem do vídeo, e termina na
 * Revisar. Rodar de novo apaga a da rodada anterior e os materiais que só ela usava: sem isso, a
 * lista colada voltaria marcada como "biblioteca".
 *
 *   pnpm tsx scripts/capturas/video-formas-de-montar.ts
 */
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import {
	abrirNavegador,
	contexto,
	cpuLenta,
	entrar,
	foto,
	ir,
	PASTA,
	prisma,
	PROFESSORA,
	segurarRemotas
} from './comum.ts';
import { criarAtividade, esperarMateriais, materiaisDa } from './wizard.ts';

const V = 'formas-de-montar';
const TITULO = 'Rotina 3 — meu dia';
const ENTRADA = join(PASTA, '_entrada');

/** A lista da aula passada: metade com tradução, metade sem (a tradução automática completa). */
const LISTA = [
	'I wake up at seven. | Eu acordo às sete.',
	'He takes the bus to school.',
	'We have lunch at noon. | Nós almoçamos ao meio-dia.',
	'They do their homework after dinner.',
	"She doesn't drink coffee. | Ela não bebe café.",
	'I go to bed at ten.'
];

/**
 * As seis da biblioteca: a Rotina 1 do seed, MENOS "I wake up at six thirty.", que é a proposta
 * que a IA devolve como "você já tem" (gemini-falso.mjs).
 */
const DA_BIBLIOTECA = [
	'She has breakfast with her family.',
	'We go to school by bus.',
	"He doesn't work on Saturdays.",
	'Do you study at night?',
	'My brother plays soccer after class.',
	'They have dinner at eight.'
];

/** Apaga a atividade da rodada anterior e os materiais que só ela usava (o seed fica). */
async function limparRodadaAnterior() {
	const professora = await prisma.teacher.findUniqueOrThrow({
		where: { email: PROFESSORA.email },
		select: { id: true }
	});
	const antigas = await prisma.activity.findMany({
		where: { title: TITULO, teacherId: professora.id },
		select: { id: true, contentUnits: { select: { id: true } } }
	});
	for (const antiga of antigas) {
		// Os passos do `apagarDeVez` do repositório: tentativa, publicação, atividade.
		const dono = { id: antiga.id, teacherId: professora.id };
		await prisma.$transaction(async (tx) => {
			await tx.attempt.deleteMany({
				where: { publication: { activityVersion: { activity: dono } } }
			});
			await tx.publication.deleteMany({ where: { activityVersion: { activity: dono } } });
			await tx.activity.deleteMany({ where: dono });
		});
		await prisma.contentUnit.deleteMany({
			where: { id: { in: antiga.contentUnits.map((c) => c.id) }, activities: { none: {} } }
		});
	}
}

/** Um estado que dura um instante: se escapar, a rodada segue e diz qual faltou. */
async function instante(descricao: string, fotografar: () => Promise<void>) {
	try {
		await fotografar();
	} catch {
		console.log(`    (escapou: ${descricao})`);
	}
}

await limparRodadaAnterior();
const navegador = await abrirNavegador();
try {
	const page: Page = await (await contexto(navegador, 'computador')).newPage();
	await entrar(page, 'professora');
	const id = await criarAtividade(page, { titulo: TITULO, idioma: 'Inglês (EUA)', nivel: 'A2' });

	const formulario = page.locator('form:has(input[name="activityId"])');
	const lista = page.locator('form:has(input[name="activityId"]) + div');
	const previa = page.locator('xpath=//h3[normalize-space(.)="O que o aluno vai ver"]/parent::div');
	const propostas = page.locator(
		'xpath=//span[contains(normalize-space(.), "propostas ·")]/ancestor::div[contains(@class, "rounded-box")][1]'
	);
	const tipo = (rotulo: string) =>
		formulario.getByRole('button', { name: new RegExp(`^${rotulo}`) }).first();
	const modo = (rotulo: string) => formulario.getByRole('button', { name: rotulo, exact: true });
	const adicionarAqui = () =>
		formulario.getByRole('button', { name: 'Adicionar à atividade', exact: true });
	const gerarIa = () => formulario.getByRole('button', { name: /^Gerar \d+ propostas/ });
	const aceitarIa = () => formulario.getByRole('button', { name: /^Adicionar \d+ materiais$/ });

	/**
	 * O banco recebe o material antes de a tela terminar: ela ainda espera a resposta, recarrega a
	 * lista e limpa o formulário. Um toque nesse meio-tempo some na limpeza.
	 */
	async function salvou(quantos: number, antes: number) {
		await esperarMateriais(id, antes + quantos);
		await formulario
			.getByRole('button', { name: /Salvando…/ })
			.waitFor({ state: 'detached', timeout: 30_000 })
			.catch(() => {});
		await page.waitForLoadState('networkidle');
		await page.waitForTimeout(700);
	}

	/**
	 * O formulário INTEIRO numa imagem: a coluna rola por dentro, então a janela cresce o que falta
	 * para o corpo caber, e volta depois.
	 */
	async function formularioInteiro(nome: string) {
		const escondido = await formulario.evaluate((form) => {
			const rolavel = [...form.querySelectorAll<HTMLElement>('*')].find(
				(el) => getComputedStyle(el).overflowY === 'auto' && el.scrollHeight > el.clientHeight
			);
			return rolavel ? rolavel.scrollHeight - rolavel.clientHeight : 0;
		});
		await page.setViewportSize({ width: 1440, height: 900 + escondido });
		await page.waitForTimeout(400);
		await foto(page, V, nome, 'computador', formulario);
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.waitForTimeout(400);
	}

	/** Uma fonte do "Gerar com IA" numa etapa recém-aberta: sem o pedido nem o resultado de antes. */
	async function iaComFonte(fonte: 'Imagem' | 'Vídeo') {
		await ir(page, `/atividades/${id}/materiais`);
		await escolherTipo('Par de frases', 'source');
		await modo('Gerar com IA').click();
		await formulario.getByRole('button', { name: new RegExp(`^${fonte}`) }).click();
		await formulario.locator('input[type="file"]').waitFor({ state: 'attached' });
	}

	/** Troca o tipo e confere que o formulário dele apareceu (`campo`); toca de novo se não. */
	async function escolherTipo(rotulo: string, campo: string) {
		for (let vez = 0; vez < 3; vez++) {
			await tipo(rotulo).click();
			const apareceu = await formulario
				.getByLabel(campo, { exact: true })
				.or(formulario.locator(`[name="${campo}"]`))
				.first()
				.waitFor({ timeout: 3000 })
				.then(() => true)
				.catch(() => false);
			if (apareceu) return;
		}
		throw new Error(`O formulário de "${rotulo}" não apareceu.`);
	}

	// ── degrau 1: um de cada vez, com a tradução automática ──
	await foto(page, V, '01-um-vazio', 'computador');
	await foto(page, V, '01-um-vazio-formulario', 'computador', formulario);
	// "Traduzindo…" dura o tempo do tradutor; segurado, cabe na foto.
	const soltarTraducao = await segurarRemotas(page, 3000);
	await formulario.locator('input[name="target"]').fill('She leaves home at eight.');
	// Antes da pausa de 650 ms que chama o tradutor: a frase digitada, ainda sem tradução.
	await foto(page, V, '01-um-digitado-formulario', 'computador', formulario, 0);
	await instante('Traduzindo…', async () => {
		await formulario.getByText('Traduzindo…').waitFor({ timeout: 5000 });
		await foto(page, V, '01-um-traduzindo-formulario', 'computador', formulario, 100);
	});
	await formulario
		.getByText('Tradução automática. Confira e ajuste se precisar.')
		.waitFor({ timeout: 60_000 });
	await soltarTraducao();
	console.log(`    tradução: ${await formulario.locator('input[name="source"]').inputValue()}`);
	await foto(page, V, '01-um-traduzido', 'computador');
	await foto(page, V, '01-um-traduzido-formulario', 'computador', formulario);
	await formularioInteiro('01-um-traduzido-formulario-inteiro');
	await previa.scrollIntoViewIfNeeded();
	await foto(page, V, '01-um-previa', 'computador', previa);
	await adicionarAqui().click();
	await salvou(1, 0);

	// ── degrau 2: colar uma lista ──
	await modo('Colar uma lista').click();
	await foto(page, V, '02-lista-vazia', 'computador');
	await foto(page, V, '02-lista-vazia-formulario', 'computador', formulario);
	await formulario.locator('textarea[name="raw"]').fill(LISTA.join('\n'));
	await foto(page, V, '02-lista-colada-formulario', 'computador', formulario);
	await formulario.getByLabel('Prévia das linhas coladas').scrollIntoViewIfNeeded();
	await foto(page, V, '02-lista-previa-formulario', 'computador', formulario);
	const antesDaLista = await materiaisDa(id);
	await formulario
		.getByRole('button', { name: `Adicionar ${LISTA.length} materiais`, exact: true })
		.click();
	await salvou(LISTA.length, antesDaLista);
	const confirmacao = formulario.getByText(/\d+ adicionados/).first();
	await confirmacao.waitFor({ timeout: 30_000 });
	await confirmacao.scrollIntoViewIfNeeded();
	await foto(page, V, '02-lista-adicionada', 'computador');
	await foto(page, V, '02-lista-adicionada-formulario', 'computador', formulario);

	// ── degrau 3: os quatro tipos, e o texto e o diálogo campo a campo ──
	await tipo('Par de frases').scrollIntoViewIfNeeded();
	await foto(page, V, '03-tipos', 'computador', tipo('Par de frases').locator('xpath=..'));
	await foto(page, V, '03-tipos-formulario', 'computador', formulario);

	await escolherTipo('Texto', 'Pergunta 1');
	await formulario.locator('input[name="target"]').fill("Leo's morning");
	await formulario
		.locator('textarea[name="raw"]')
		.fill(
			'Leo is a nurse. He gets up at six o’clock and has a quick breakfast. He takes the bus to the hospital at half past six, and his shift starts at seven. He usually has lunch at one o’clock with his friends.'
		);
	await formulario.getByLabel('Pergunta 1', { exact: true }).fill('What time does Leo get up?');
	await formulario.getByLabel('Resposta da pergunta 1').fill('At six o’clock.');
	await formulario.getByRole('button', { name: 'Adicionar pergunta' }).click();
	await formulario
		.getByLabel('Pergunta 2', { exact: true })
		.fill('How does he go to the hospital?');
	await formulario.getByLabel('Resposta da pergunta 2').fill('By bus.');
	await formulario.getByLabel('Resposta da pergunta 2').scrollIntoViewIfNeeded();
	await foto(page, V, '03-texto-formulario', 'computador', formulario);
	const antesDoTexto = await materiaisDa(id);
	await adicionarAqui().click();
	await salvou(1, antesDoTexto);

	await escolherTipo('Diálogo', 'Fala 1');
	await formulario.getByLabel('Fala 1', { exact: true }).fill('What time do you get up?');
	await formulario.getByLabel('Fala 2', { exact: true }).fill('I get up at seven.');
	await formulario.getByRole('button', { name: /^Adicionar fala de/ }).click();
	await formulario.getByLabel('Fala 3', { exact: true }).fill('Do you have breakfast at home?');
	await formulario.getByRole('button', { name: /^Adicionar fala de/ }).click();
	await formulario.getByLabel('Fala 4', { exact: true }).fill('Yes, I have toast and milk.');
	await formulario.getByLabel('Fala 4', { exact: true }).scrollIntoViewIfNeeded();
	await foto(page, V, '03-dialogo-formulario', 'computador', formulario);
	const antesDoDialogo = await materiaisDa(id);
	await adicionarAqui().click();
	await salvou(1, antesDoDialogo);

	// ── degrau 4: da biblioteca ──
	await page.getByRole('button', { name: 'Usar da biblioteca', exact: true }).first().click();
	await lista.getByLabel('Buscar na biblioteca').waitFor();
	await foto(page, V, '04-biblioteca-aberta', 'computador');
	await foto(page, V, '04-biblioteca-aberta-painel', 'computador', lista);
	for (const alvo of DA_BIBLIOTECA) {
		await lista.locator('button[aria-pressed]').filter({ hasText: alvo }).first().click();
	}
	await foto(page, V, '04-biblioteca-seis-marcadas', 'computador');
	await foto(page, V, '04-biblioteca-seis-marcadas-painel', 'computador', lista);
	const antesDaBiblioteca = await materiaisDa(id);
	await lista.getByRole('button', { name: /^Trazer/ }).click();
	await salvou(DA_BIBLIOTECA.length, antesDaBiblioteca);
	// O painel fica aberto depois de trazer (dá para trazer mais); fechado, aparece a lista com a
	// etiqueta "biblioteca" e o "6 vindos da biblioteca" no topo.
	await lista.getByRole('button', { name: 'Fechar', exact: true }).click();
	await lista.getByText(/vindos da biblioteca/).waitFor();
	await foto(page, V, '04-biblioteca-na-lista', 'computador');
	await foto(page, V, '04-biblioteca-na-lista-coluna', 'computador', lista);

	// ── degrau 5: gerar com IA, pelo prompt ──
	await escolherTipo('Par de frases', 'source');
	await modo('Gerar com IA').click();
	// Sem o ponto final: o atalho acrescenta ", com negativa" ao que estiver escrito.
	await formulario
		.locator('#mf-prompt')
		.fill('Frases sobre rotina no presente simples, nível de 7º ano, com horas');
	await formulario.getByRole('button', { name: 'com negativa', exact: true }).click();
	await gerarIa().scrollIntoViewIfNeeded();
	await foto(page, V, '05-ia-prompt', 'computador');
	await foto(page, V, '05-ia-prompt-formulario', 'computador', formulario);
	await gerarIa().click();
	await instante('Gerando… (prompt)', async () => {
		await formulario.getByText('Gerando…').first().waitFor({ timeout: 3000 });
		await foto(page, V, '05-ia-gerando-formulario', 'computador', formulario, 100);
	});
	await formulario.getByText(/\d+ propostas · \d+ marcadas/).waitFor({ timeout: 60_000 });
	await propostas.scrollIntoViewIfNeeded();
	await foto(page, V, '05-ia-propostas', 'computador');
	await foto(page, V, '05-ia-propostas-lista', 'computador', propostas);
	// A professora desmarca uma: "Adicionar 8 materiais".
	await propostas
		.locator('button')
		.filter({ hasText: 'My class starts at a quarter past eight.' })
		.first()
		.click();
	await foto(page, V, '05-ia-desmarcada-lista', 'computador', propostas);
	await foto(page, V, '05-ia-desmarcada-formulario', 'computador', formulario);
	console.log(`    ${await aceitarIa().innerText()}`);
	const antesDoPrompt = await materiaisDa(id);
	const marcadas = Number(/\d+/.exec(await aceitarIa().innerText())?.[0]);
	await aceitarIa().click();
	await salvou(marcadas, antesDoPrompt);

	// ── degrau 6: a foto da página, com o foco em branco ──
	await iaComFonte('Imagem');
	await foto(page, V, '06-foto-vazia-formulario', 'computador', formulario);
	const cpuDaFoto = await cpuLenta(page, 8);
	await formulario
		.locator('input[type="file"]')
		.setInputFiles(join(ENTRADA, 'pagina-do-livro.jpg'));
	await instante('Preparando a foto…', async () => {
		await formulario.getByText('Preparando a foto…').waitFor({ timeout: 5000 });
		await foto(page, V, '06-foto-preparando-formulario', 'computador', formulario, 0);
	});
	await cpuDaFoto();
	await formulario.getByText(/Pronta para a IA ler/).waitFor({ timeout: 30_000 });
	await gerarIa().scrollIntoViewIfNeeded();
	console.log(`    ${await gerarIa().innerText()}`);
	await foto(page, V, '06-foto-pronta', 'computador');
	await foto(page, V, '06-foto-pronta-formulario', 'computador', formulario);
	await formularioInteiro('06-foto-pronta-formulario-inteiro');
	await gerarIa().click();
	await formulario.getByText(/\d+ propostas · \d+ marcadas/).waitFor({ timeout: 60_000 });
	await propostas.scrollIntoViewIfNeeded();
	await foto(page, V, '06-foto-propostas', 'computador');
	await foto(page, V, '06-foto-propostas-lista', 'computador', propostas);
	const antesDaFoto = await materiaisDa(id);
	const daFoto = Number(/\d+/.exec(await aceitarIa().innerText())?.[0]);
	await aceitarIa().click();
	await salvou(daFoto, antesDaFoto);

	// ── degrau 7: a fala de um vídeo, de 0:30 a 3:00 ──
	await iaComFonte('Vídeo');
	await foto(page, V, '07-video-vazio-formulario', 'computador', formulario);
	const cpuDoVideo = await cpuLenta(page, 8);
	await formulario
		.locator('input[type="file"]')
		.setInputFiles(join(ENTRADA, 'aula-online-rotina.webm'));
	await instante('Lendo o áudio do vídeo…', async () => {
		await formulario.getByText('Lendo o áudio do vídeo…').waitFor({ timeout: 5000 });
		await foto(page, V, '07-video-lendo-formulario', 'computador', formulario, 0);
	});
	await cpuDoVideo();
	await formulario
		.getByText(/^Vídeo de \d+:\d\d\. Toque para trocar\./)
		.waitFor({ timeout: 60_000 });
	await formulario.getByLabel('Início do trecho').fill('0:30');
	await formulario.getByLabel('Fim do trecho').fill('3:00');
	await formulario.getByText(/de fala vão para a IA\./).waitFor();
	await gerarIa().scrollIntoViewIfNeeded();
	console.log(`    ${await gerarIa().innerText()}`);
	await foto(page, V, '07-video-trecho', 'computador');
	await foto(page, V, '07-video-trecho-formulario', 'computador', formulario);
	await formularioInteiro('07-video-trecho-formulario-inteiro');
	await gerarIa().click();
	await formulario.getByText(/\d+ propostas · \d+ marcadas/).waitFor({ timeout: 90_000 });
	await propostas.scrollIntoViewIfNeeded();
	await foto(page, V, '07-video-propostas', 'computador');
	await foto(page, V, '07-video-propostas-lista', 'computador', propostas);
	const antesDoVideo = await materiaisDa(id);
	const doVideo = Number(/\d+/.exec(await aceitarIa().innerText())?.[0]);
	await aceitarIa().click();
	await salvou(doVideo, antesDoVideo);

	// ── fechamento: tudo na lista, e as questões ──
	await foto(page, V, '08-materiais-desta-atividade', 'computador');
	await foto(page, V, '08-materiais-desta-atividade-coluna', 'computador', lista);
	// A geração é síncrona: o que se vê esperando é o "Gerando…" do botão. Segurado para a foto.
	const soltarGeracao = await segurarRemotas(page, 2500);
	await page.getByRole('button', { name: /Gerar questões/ }).click();
	await instante('Gerando… (questões)', async () => {
		await page.getByRole('button', { name: /Gerando…/ }).waitFor({ timeout: 3000 });
		await foto(page, V, '08-gerando', 'computador', undefined, 100);
	});
	await page.waitForURL(/\/revisar/, { timeout: 120_000 });
	await soltarGeracao();
	await page
		.getByText(/\d+ questões propostas/)
		.first()
		.waitFor({ timeout: 60_000 });
	await foto(page, V, '08-revisar', 'computador');
	await foto(page, V, '08-revisar-pagina-inteira', 'computador', 'pagina');
	console.log(`    materiais na atividade: ${await materiaisDa(id)}`);
} finally {
	await navegador.close();
	await prisma.$disconnect();
}
