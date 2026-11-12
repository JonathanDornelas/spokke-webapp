/**
 * Um Gemini FALSO, só para as capturas de tela da propaganda (docs/propaganda/captura-das-telas.md).
 *
 *   node scripts/capturas/gemini-falso.mjs          # escuta em http://localhost:8787
 *
 * O servidor de desenvolvimento aponta para ele com `GOOGLE_GEMINI_BASE_URL` (o SDK `@google/genai`
 * lê essa variável), e todo o resto roda de verdade: débito e estorno de créditos, validação pelo
 * kernel, "você já tem", a lista de propostas. Só a resposta do modelo é inventada, e ela segue o
 * formato da API: um candidato com o JSON das propostas e o `usageMetadata` com os tokens que o
 * Gemini 3 contaria (1.120 por imagem, 25 por segundo de áudio).
 *
 * As propostas dependem do que chegou: o pedido escrito, a foto da página (`pagina-do-livro.jpg`,
 * gerada por `arquivos.ts`) ou a fala do vídeo de exemplo. Nunca chama nada fora desta máquina.
 */
import { createServer } from 'node:http';

const PORTA = Number(process.env.PORTA ?? 8787);

/** Do pedido escrito: rotina no presente simples, com negativa (o atalho que o professor tocou). */
const DO_PEDIDO = [
	['I wake up at six thirty.', 'Eu acordo às seis e meia.'], // igual a um material do seed: "você já tem"
	["She doesn't eat breakfast at home.", 'Ela não toma café da manhã em casa.'],
	['We take the bus at half past seven.', 'Nós pegamos o ônibus às sete e meia.'],
	['He goes to school at eight.', 'Ele vai para a escola às oito.'],
	["They don't watch TV in the morning.", 'Eles não assistem TV de manhã.'],
	['My class starts at a quarter past eight.', 'Minha aula começa às oito e quinze.'],
	['I have lunch at noon.', 'Eu almoço ao meio-dia.'],
	['She does her homework after school.', 'Ela faz a lição de casa depois da escola.'],
	["We don't go to bed late on weekdays.", 'Nós não vamos dormir tarde durante a semana.'],
	['He brushes his teeth after breakfast.', 'Ele escova os dentes depois do café da manhã.'],
	['My mother works from nine to five.', 'Minha mãe trabalha das nove às cinco.'],
	["I don't drink coffee in the afternoon.", 'Eu não tomo café à tarde.']
];

/** Da foto: o texto da página "Unit 4 · Maya's day". */
const DA_FOTO = [
	['Maya gets up at a quarter to seven.', 'A Maya se levanta às quinze para as sete.'],
	['She has a shower and gets dressed.', 'Ela toma banho e se veste.'],
	['She has breakfast with her brother.', 'Ela toma café da manhã com o irmão.'],
	['Maya walks to school with her friends.', 'A Maya vai a pé para a escola com os amigos.'],
	['Classes start at eight o’clock.', 'As aulas começam às oito horas.'],
	['She has lunch in the school canteen.', 'Ela almoça na cantina da escola.'],
	['After school, she plays volleyball.', 'Depois da escola, ela joga vôlei.'],
	['She does her homework before dinner.', 'Ela faz a lição de casa antes do jantar.'],
	['Maya usually goes to bed at ten.', 'A Maya geralmente vai dormir às dez.'],
	['On Saturdays, she gets up late.', 'Aos sábados, ela se levanta tarde.'],
	["She doesn't go to school on Sundays.", 'Ela não vai à escola aos domingos.'],
	['Her brother wakes up before her.', 'O irmão dela acorda antes dela.']
];

/** Da fala do vídeo de exemplo (o roteiro está em `arquivos.ts`). */
const DA_FALA = [
	['I wake up at half past six.', 'Eu acordo às seis e meia.'],
	['First, I have a cup of coffee.', 'Primeiro, eu tomo uma xícara de café.'],
	['I usually take the train to work.', 'Eu geralmente pego o trem para o trabalho.'],
	['My job starts at nine.', 'Meu trabalho começa às nove.'],
	['I never eat lunch at my desk.', 'Eu nunca almoço na minha mesa.'],
	['In the evening, I go for a run.', 'À noite, eu vou correr.'],
	['We have dinner at seven thirty.', 'Nós jantamos às sete e meia.'],
	['I read a book before bed.', 'Eu leio um livro antes de dormir.'],
	['On Fridays, I meet my friends.', 'Às sextas, eu encontro meus amigos.'],
	['I go to bed at eleven.', 'Eu vou dormir às onze.']
];

function responder(corpo) {
	const partes = (corpo.contents ?? []).flatMap((c) => c.parts ?? []);
	const anexo = partes.find((p) => p.inlineData)?.inlineData;
	const sistema = (corpo.systemInstruction?.parts ?? []).map((p) => p.text ?? '').join('\n');
	const quantos = Number(/até (\d+)/.exec(sistema)?.[1] ?? 10);

	let fonte = DO_PEDIDO;
	let entrada = 700;
	if (anexo?.mimeType?.startsWith('image/')) {
		fonte = DA_FOTO;
		entrada += 1120;
	} else if (anexo?.mimeType?.startsWith('audio/')) {
		fonte = DA_FALA;
		// WAV de 8 bits a 16 kHz: um byte por amostra, depois de 44 de cabeçalho.
		const segundos = Math.max(1, (Buffer.from(anexo.data, 'base64').length - 44) / 16_000);
		entrada += Math.round(segundos * 25);
	}
	const propostas = fonte.slice(0, quantos).map(([target, source]) => ({ target, source }));
	return {
		candidates: [
			{
				content: { role: 'model', parts: [{ text: JSON.stringify({ propostas }) }] },
				finishReason: 'STOP',
				index: 0
			}
		],
		usageMetadata: {
			promptTokenCount: entrada,
			candidatesTokenCount: 30 * propostas.length,
			totalTokenCount: entrada + 30 * propostas.length,
			thoughtsTokenCount: 0
		},
		modelVersion: 'gemini-falso'
	};
}

createServer((req, res) => {
	let dados = '';
	req.on('data', (pedaco) => (dados += pedaco));
	req.on('end', () => {
		if (req.method !== 'POST' || !req.url?.includes(':generateContent')) {
			res.writeHead(404).end();
			return;
		}
		try {
			const corpo = JSON.parse(dados);
			// Um instante de espera, para a captura pegar o "Gerando…" do botão.
			setTimeout(() => {
				res.writeHead(200, { 'content-type': 'application/json' });
				res.end(JSON.stringify(responder(corpo)));
			}, 1500);
		} catch {
			res.writeHead(400).end();
		}
	});
}).listen(PORTA, () => console.log(`gemini falso em http://localhost:${PORTA}`));
