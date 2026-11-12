/**
 * Os ARQUIVOS DE ENTRADA das capturas: o que o professor escolhe nas fontes "Imagem" e "Vídeo" do
 * "Gerar com IA" (docs/propaganda/captura-das-telas.md). Os dois são nossos, sem material de
 * terceiros:
 *
 * - `pagina-do-livro.jpg`: uma página de livro didático escrita aqui, desenhada em HTML e
 *   fotografada "sobre a mesa", levemente torta, no tamanho de uma foto de celular (3024 × 4032).
 * - `aula-online-rotina.webm`: a gravação de uma aula online de 4:12, com fala em inglês. A fala sai
 *   do nosso TTS (o serviço de áudio precisa estar no ar) e a imagem é um quadro simples de aula; o
 *   navegador grava os dois juntos com o `MediaRecorder`, em TEMPO REAL: uns 4 min e meio. O vídeo
 *   tem de passar de 3:00 porque a cena escolhe o trecho de 0:30 a 3:00
 *   (docs/propaganda/video-formas-de-montar.md, degrau 7).
 *
 *   pnpm tsx scripts/capturas/arquivos.ts
 */
import 'dotenv/config';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const SAIDA = join(process.cwd(), 'docs', 'propaganda', 'capturas', '_entrada');
mkdirSync(SAIDA, { recursive: true });

/** A duração do vídeo, em segundos: 4:12. */
const DURACAO = 252;

/** A aula, que se repete até completar a duração (a última fala chama a repetição). */
const ROTEIRO = [
	"Good morning, everyone. Today we're talking about daily routines.",
	"Let's start with Emma. Listen carefully.",
	"Hi, I'm Emma, and this is my day.",
	'I wake up at half past six.',
	'First, I have a cup of coffee.',
	'I usually take the train to work.',
	'My job starts at nine.',
	'I never eat lunch at my desk.',
	'In the evening, I go for a run.',
	'We have dinner at seven thirty.',
	'I read a book before bed.',
	'On Fridays, I meet my friends.',
	'I go to bed at eleven.',
	'Now, a question for you. What time does Emma wake up?',
	'She wakes up at half past six.',
	'And how does she go to work?',
	'She usually takes the train.',
	'Remember: we use the present simple for things we do every day.',
	'I work. She works. He works.',
	"I don't drink tea. She doesn't drink tea.",
	'Do you have breakfast at home? Yes, I do.',
	"Does Emma eat lunch at her desk? No, she doesn't.",
	"Now it's your turn. Tell me about your morning.",
	'What time do you get up?',
	"I get up at seven o'clock.",
	'I brush my teeth and I have breakfast.',
	'I go to school by bus.',
	'Classes start at eight.',
	'After school, I do my homework.',
	"Very good. Let's listen to Emma one more time."
];

const PAGINA = `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;width:1200px;height:1600px;display:grid;place-items:center;
  background:radial-gradient(circle at 30% 20%,#8a6a4f,#5e4430 70%);font-family:Georgia,serif}
.folha{width:900px;height:1260px;background:#fbf8f1;transform:rotate(-2.2deg);padding:70px 80px;box-sizing:border-box;
  box-shadow:0 30px 60px rgba(0,0,0,.45);position:relative;color:#23211c}
.unidade{font:700 22px/1 Arial,sans-serif;color:#b8452b;letter-spacing:.08em;text-transform:uppercase}
h1{font-size:54px;margin:14px 0 30px}
p{font-size:27px;line-height:1.6;margin:0 0 22px}
.caixa{border:3px solid #b8452b;border-radius:14px;padding:22px 28px;margin-top:34px}
.caixa h2{font:700 24px/1.2 Arial,sans-serif;margin:0 0 12px;color:#b8452b}
.caixa li{font-size:24px;line-height:1.7}
.pagina{position:absolute;bottom:36px;right:60px;font:20px Arial,sans-serif;color:#7d776a}
.sombra{position:absolute;inset:0;background:linear-gradient(115deg,rgba(255,255,255,.18),transparent 40%,rgba(0,0,0,.06))}
</style></head><body><div class="folha"><div class="unidade">Unit 4 · Daily routines</div>
<h1>Maya's day</h1>
<p>Maya gets up at a quarter to seven. She has a shower, gets dressed and has breakfast with her brother. Her brother wakes up before her.</p>
<p>Maya walks to school with her friends. Classes start at eight o'clock, and she has lunch in the school canteen.</p>
<p>After school, she plays volleyball. She does her homework before dinner and usually goes to bed at ten. On Saturdays, she gets up late. She doesn't go to school on Sundays.</p>
<div class="caixa"><h2>Read and answer</h2><ol><li>What time does Maya get up?</li><li>How does she go to school?</li><li>What does she do after school?</li></ol></div>
<div class="pagina">42</div><div class="sombra"></div></div></body></html>`;

async function falar(texto: string): Promise<string> {
	const url = process.env.AUDIOTEXT_URL ?? 'http://localhost:8080';
	const resposta = await fetch(`${url}/v1/tts/speak`, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			...(process.env.AUDIOTEXT_TOKEN
				? { authorization: `Bearer ${process.env.AUDIOTEXT_TOKEN}` }
				: {})
		},
		body: JSON.stringify({ text: texto, voice: 'af_heart', speed: 1, format: 'wav' })
	});
	if (!resposta.ok) throw new Error(`TTS respondeu ${resposta.status}: suba o serviço de áudio.`);
	return Buffer.from(await resposta.arrayBuffer()).toString('base64');
}

const navegador = await chromium.launch();
try {
	// 3024 × 4032 (o desenho de 1200 × 1600 a 2,52×): o tamanho de uma foto de celular, que o
	// navegador do professor reduz antes de mandar para a IA.
	const pagina = await navegador.newPage({
		viewport: { width: 1200, height: 1600 },
		deviceScaleFactor: 2.52
	});
	await pagina.setContent(PAGINA);
	await pagina.screenshot({ path: join(SAIDA, 'pagina-do-livro.jpg'), type: 'jpeg', quality: 88 });
	console.log('pagina-do-livro.jpg');

	const falas: string[] = [];
	for (const frase of ROTEIRO) falas.push(await falar(frase));

	const tela = await navegador.newPage({ viewport: { width: 640, height: 360 } });
	await tela.setContent('<canvas width="1280" height="720"></canvas>');
	// O tsx embrulha as funções com um `__name` que o navegador não conhece.
	await tela.evaluate('window.__name = (f) => f');
	const webm = await tela.evaluate(
		async ({ wavs, total }: { wavs: string[]; total: number }) => {
			const ctx = new AudioContext();
			const buffers = await Promise.all(
				wavs.map((b64) =>
					ctx.decodeAudioData(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer)
				)
			);
			const destino = ctx.createMediaStreamDestination();
			const canvas = document.querySelector('canvas') as HTMLCanvasElement;
			const g = canvas.getContext('2d') as CanvasRenderingContext2D;
			const PAUSA = 1.1;
			const desenhar = (t: number) => {
				g.fillStyle = '#1f3b57';
				g.fillRect(0, 0, 1280, 720);
				g.fillStyle = '#ffffff';
				g.font = '700 84px Arial';
				g.fillText("Emma's day", 110, 300);
				g.font = '40px Arial';
				g.fillStyle = '#c9d8e6';
				g.fillText('Daily routines · Listening practice', 110, 380);
				g.fillStyle = '#35587a';
				g.fillRect(110, 560, 1060, 14);
				g.fillStyle = '#f2b23a';
				g.fillRect(110, 560, 1060 * Math.min(1, t / total), 14);
			};
			const video = canvas.captureStream(30);
			const fluxo = new MediaStream([
				...video.getVideoTracks(),
				...destino.stream.getAudioTracks()
			]);
			// O quadro é quase parado: pouca taxa de vídeo basta, e o arquivo fica leve.
			const gravador = new MediaRecorder(fluxo, {
				mimeType: 'video/webm;codecs=vp8,opus',
				videoBitsPerSecond: 200_000,
				audioBitsPerSecond: 64_000
			});
			const pedacos: Blob[] = [];
			gravador.ondataavailable = (e) => pedacos.push(e.data);
			const inicio = ctx.currentTime + 0.3;
			// A aula em volta, até a duração: nenhuma fala começa sem caber inteira.
			let t = inicio + 0.5;
			for (let i = 0; ; i++) {
				const b = buffers[i % buffers.length];
				if (t + b.duration > inicio + total - 0.5) break;
				const fonte = ctx.createBufferSource();
				fonte.buffer = b;
				fonte.connect(destino);
				fonte.start(t);
				t += b.duration + PAUSA;
			}
			gravador.start(1000);
			await new Promise<void>((pronto) => {
				const quadro = () => {
					const agora = ctx.currentTime - inicio;
					desenhar(agora);
					if (agora < total) requestAnimationFrame(quadro);
					else pronto();
				};
				quadro();
			});
			await new Promise<void>((pronto) => {
				gravador.onstop = () => pronto();
				gravador.stop();
			});
			const blob = new Blob(pedacos, { type: 'video/webm' });
			const bytes = new Uint8Array(await blob.arrayBuffer());
			let binario = '';
			for (let i = 0; i < bytes.length; i += 0x8000) {
				binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
			}
			return btoa(binario);
		},
		{ wavs: falas, total: DURACAO }
	);
	writeFileSync(join(SAIDA, 'aula-online-rotina.webm'), Buffer.from(webm, 'base64'));
	rmSync(join(SAIDA, 'aula-rotina.webm'), { force: true }); // o de 26 s, de antes
	console.log('aula-online-rotina.webm');
} finally {
	await navegador.close();
}
