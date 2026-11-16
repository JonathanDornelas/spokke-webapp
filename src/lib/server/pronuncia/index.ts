import type { LanguageProfile } from '$lib/kernel/language/profile';
import { tokenize } from '$lib/kernel/language/tokenize';
import { compararSons } from '$lib/kernel/language/pronuncia';
import { speakAuthoringSchema, type SpeakAnswer } from '$lib/kernel/interactions/speak';
import { AudiotextError, reconhecerFonemas } from '$lib/server/audiotext/client';
import { transcreverNoIdioma } from '$lib/server/asr/audiotext-provider';

/**
 * O dicionário de PRONÚNCIA, só no servidor — como o kuromoji do japonês
 * (`server/escrita`): é dado de idioma pesado demais para o bundle do aluno, e o
 * kernel não carrega dicionário. Hoje um só: o CMU Pronouncing Dictionary
 * (ARPAbet, inglês americano, 135 mil palavras, licença ISC), para o idioma
 * cujo profile declara `pronuncia.alfabeto === 'arpabet'`.
 *
 * Carrega na primeira vez que é pedido (são 4,7 MB) e fica na memória do
 * processo.
 */

type Dicionario = Record<string, string>;
let carregado: Promise<Dicionario> | null = null;

function dicionario(): Promise<Dicionario> {
	carregado ??= import('cmu-pronouncing-dictionary').then((m) => m.dictionary as Dicionario);
	return carregado;
}

/** A chave do dicionário: minúscula, sem a pontuação das pontas (o apóstrofo do meio fica). */
function chave(palavra: string): string {
	return palavra
		.normalize('NFC')
		.toLowerCase()
		.replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, '');
}

export type FoneticaDe = (palavra: string) => string[] | null;

/**
 * A consulta, pronta para a geração — que é síncrona dentro do gerador, então
 * o dicionário carrega ANTES. `undefined` quando o idioma não tem pronúncia (e
 * aí a questão de Pronúncia simplesmente não é gerada).
 */
export async function foneticaDoIdioma(profile: LanguageProfile): Promise<FoneticaDe | undefined> {
	if (profile.pronuncia?.alfabeto !== 'arpabet') return undefined;
	const d = await dicionario();
	return (palavra) => {
		const fonemas = d[chave(palavra)];
		// O formato do dicionário: fonemas ARPAbet separados por espaço. Não é texto
		// de idioma (a regra nº 5 é para tokenizar fala), é o separador do arquivo.
		return fonemas ? fonemas.split(' ') : null;
	};
}

/**
 * Depois de um 503 (motor desligado ou carregando) ou de um 404 (serviço de
 * áudio anterior ao reconhecedor), a Pronúncia vai direto para a reserva por um
 * minuto: sem isto, cada resposta pagaria uma ida e volta que já se sabe inútil.
 */
const PAUSA_DO_RECONHECEDOR_MS = 60_000;
let reconhecedorForaAte = 0;

function reconhecedorLigado(): boolean {
	return process.env.ASR_PROVIDER === 'audiotext' && Date.now() >= reconhecedorForaAte;
}

/**
 * O que se OUVIU numa gravação de questão de fala, já no formato da resposta do
 * `speak`. É o ÚNICO caminho dos dois lugares que corrigem a fala de uma
 * atividade (o Player e a prévia do aluno), para corrigirem igual:
 *
 * - **Na Pronúncia**, o reconhecedor de fonemas do serviço de áudio: os sons que
 *   o aluno produziu, com a certeza de cada um, e a leitura deles no rigor da
 *   questão ("prai · aw · ree · tee") como `transcript`, que é o que a tela
 *   mostra antes do "Verificar". O Whisper não roda: ele devolveria a palavra
 *   certa de uma pronúncia torta, e custa mais CPU que o reconhecedor.
 * - **Nas outras falas, e na Pronúncia com o reconhecedor fora**, o Whisper,
 *   com os fonemas do dicionário por cima na Pronúncia (`respostaDeFala`).
 *
 * Serviço de áudio fora do ar lança o erro do cliente: quem chama o transforma
 * em 503 com a mensagem de pular a questão.
 */
export async function ouvirFala(opcoes: {
	payload: unknown;
	bytes: Uint8Array;
	contentType: string;
	profile: LanguageProfile;
	hints: string[];
}): Promise<SpeakAnswer> {
	const { payload, bytes, contentType, profile, hints } = opcoes;
	const fala = speakAuthoringSchema.safeParse(payload);
	const pronuncia = fala.success ? fala.data.pronuncia : undefined;
	if (pronuncia && profile.pronuncia && reconhecedorLigado()) {
		try {
			const sons = await reconhecerFonemas(bytes, { contentType });
			const { ouvido } = compararSons(pronuncia, sons, profile.pronuncia, pronuncia.rigor);
			return { transcript: ouvido, sons };
		} catch (erro) {
			if (erro instanceof AudiotextError && (erro.status === 503 || erro.status === 404)) {
				reconhecedorForaAte = Date.now() + PAUSA_DO_RECONHECEDOR_MS;
			}
			console.warn('[pronuncia] sem o reconhecedor de fonemas, corrigindo pela transcrição', erro);
		}
	}
	const { text } = await transcreverNoIdioma(bytes, profile.asr.model, hints, contentType);
	return respostaDeFala(payload, text, profile);
}

/**
 * A resposta de uma questão de fala a partir da TRANSCRIÇÃO do Whisper: a
 * transcrição e, na Pronúncia, os fonemas do dicionário sobre o que se ouviu —
 * a correção de reserva, com o reconhecedor de fonemas fora (`ouvirFala`). A
 * resposta guardada já leva os fonemas, então a correção refeita no resultado
 * dá o mesmo veredito. (O exemplo da home não tem Pronúncia.)
 */
export async function respostaDeFala(
	payload: unknown,
	transcript: string,
	profile: LanguageProfile
): Promise<{ transcript: string; fonemas?: string[] }> {
	const fala = speakAuthoringSchema.safeParse(payload);
	if (!fala.success || !fala.data.pronuncia) return { transcript };
	const fonemas = await fonemasDoQueSeOuviu(transcript, profile);
	return fonemas ? { transcript, fonemas } : { transcript };
}

/**
 * Os fonemas do que o ASR OUVIU, para a correção rígida da Pronúncia comparar
 * som a som (`speak` com `pronuncia`). Várias palavras viram uma sequência só
 * (o aluno pode ter partido a palavra: "priori tea"). Qualquer palavra fora do
 * dicionário devolve `undefined`: sem os sons de tudo, a correção compara a
 * palavra inteira, e é melhor do que comparar meia transcrição.
 */
export async function fonemasDoQueSeOuviu(
	transcricao: string,
	profile: LanguageProfile
): Promise<string[] | undefined> {
	const fonetica = await foneticaDoIdioma(profile);
	if (!fonetica) return undefined;
	const palavras = tokenize(transcricao, profile);
	if (palavras.length === 0) return undefined;
	const sons: string[] = [];
	for (const palavra of palavras) {
		const fonemas = fonetica(palavra);
		if (!fonemas) return undefined;
		sons.push(...fonemas);
	}
	return sons;
}
