/**
 * ÁUDIO QUE FALTA — enfileira a síntese de todo áudio que as atividades pedem e
 * que ainda não existe, de todos os professores (`server/tts/pendencias.ts`).
 *
 *   pnpm audio:faltando                 enfileira o que falta e sai
 *   pnpm audio:faltando --contar        só diz quanto falta, sem enfileirar
 *   pnpm audio:faltando --esperar 20    enfileira e espera a fila de voz esvaziar,
 *                                       até 20 minutos
 *
 * Existe para quando a IDENTIDADE do áudio muda para muita coisa de uma vez — a
 * regra da voz trocou, um idioma ganhou voz. Sem isto, cada atividade só
 * descobriria o que falta na primeira abertura, com o link fechado enquanto o
 * worker sintetiza. O script de atualização o roda antes de trocar o web
 * (`deploy/scripts/atualizar.sh`), e no dia a dia ele não acha nada e sai.
 *
 * Quem sintetiza é o WORKER, não este script: ele só põe na fila e, com
 * `--esperar`, acompanha. Não manda e-mail e não apaga nada — o áudio antigo
 * fica no bucket até a limpeza de sempre (`limparAudioSemUso`), e é ele que
 * `voltar.sh` precisaria se a versão voltasse.
 */
import 'dotenv/config';
import { prisma } from '../src/lib/server/db/client.ts';
import { audioQueFalta, ttsNaFila } from '../src/lib/server/tts/pendencias.ts';

/** A fila parada por este tempo é serviço de áudio fora do ar: não adianta esperar. */
const PARADA_MS = 3 * 60_000;
const INTERVALO_MS = 5_000;

const args = process.argv.slice(2);
const soContar = args.includes('--contar');
const iEsperar = args.indexOf('--esperar');
const minutos = iEsperar >= 0 ? Number(args[iEsperar + 1]) || 20 : 0;

const dormir = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

async function esperarAFila(limiteMs: number): Promise<number> {
	const inicio = Date.now();
	let anterior = await ttsNaFila();
	let mudouEm = Date.now();
	while (anterior > 0) {
		if (Date.now() - inicio > limiteMs) break;
		if (Date.now() - mudouEm > PARADA_MS) {
			console.log('a fila de voz parou de andar: o serviço de áudio está no ar?');
			break;
		}
		await dormir(INTERVALO_MS);
		const agora = await ttsNaFila();
		if (agora !== anterior) {
			console.log(`faltam ${agora} na fila de voz`);
			anterior = agora;
			mudouEm = Date.now();
		}
	}
	return anterior;
}

try {
	const antes = await audioQueFalta({ enfileirar: !soContar });
	console.log(
		`${antes.atividades} atividades olhadas, ${antes.faltando} áudios faltando` +
			(soContar ? '' : `, ${antes.enfileirados} postos na fila`)
	);

	if (!soContar && minutos > 0 && antes.faltando > 0) {
		const naFila = await esperarAFila(minutos * 60_000);
		const depois = await audioQueFalta();
		console.log(
			depois.faltando === 0
				? 'todo o áudio está pronto'
				: `ainda faltam ${depois.faltando} áudios (${naFila} na fila): o worker segue gerando, e a atividade que ainda não tiver o dela abre quando ele chegar nela`
		);
	}
} finally {
	await prisma.$disconnect();
}
