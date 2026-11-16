import type { LanguageProfile } from './profile';

/**
 * Qual voz sintetiza um TEXTO.
 *
 * **Por que varia.** Uma atividade inteira na mesma voz treina o aluno a
 * entender aquela pessoa, não o idioma. Alternando entre os materiais, uma
 * atividade de dez questões chega com três ou quatro timbres — que é o mais
 * perto de sala de aula que dá para chegar sem gravar gente de verdade.
 *
 * **Por que é o TEXTO que decide, e não o material nem a atividade.** O áudio
 * é identificado pelo conteúdo (db.md "MediaAsset"): a mesma frase é o MESMO
 * arquivo, venha de onde vier. Se a voz saísse do material, a mesma frase em
 * dois materiais seriam dois arquivos — e apagar um material mexeria na voz de
 * uma atividade no ar. Como consequência boa, a frase soa igual toda vez que o
 * aluno a encontra.
 *
 * **Determinística e sem estado.** Servidor, worker e Player chegam à mesma
 * resposta sem consultar nada — é o que permite o hash do áudio
 * (`hash(texto, voz, velocidade)`) ser recalculado em qualquer lugar (regra
 * inviolável nº 8, e server.md "TTS").
 */
export function vozDoTexto(profile: LanguageProfile, texto: string): string | null {
	const vozes = profile.tts.voices;
	// Sem voz para este idioma não existe item de escuta — quem checa isso são
	// os geradores, e este `null` é o que eles leem.
	if (vozes.length === 0) return null;
	return vozes[indiceEstavel(texto, vozes.length)]!;
}

/**
 * Qual voz diz a PALAVRA da questão de Pronúncia: o modelo que o aluno imita.
 *
 * **É a voz de referência do idioma, quando ele tem uma**
 * (`LanguageProfile.tts.referencia`), e não a que o texto sortearia. Pedido do
 * dono do repositório: a Pronúncia corrige som a som, às vezes com rigor, e o
 * modelo que o aluno ouve antes de falar tem de ser o melhor que o TTS oferece —
 * uma voz mediana ensinaria o som torto que depois é cobrado. Hoje só o inglês
 * americano tem (`af_heart`, a única nota A do Kokoro).
 *
 * **Só a Pronúncia.** A frase da escuta e a palavra de "ouça e escolha"
 * continuam variando de voz (`vozDoTexto`), e o diálogo segue com uma voz por
 * pessoa (`vozDoFalante`). Por isso a mesma palavra pode ter dois arquivos: o
 * da escuta, na voz do texto, e o da Pronúncia, na de referência.
 *
 * Sem voz de referência no idioma, vale a do texto. Determinística como as
 * outras: o hash do áudio é recalculado em qualquer lugar.
 */
export function vozDaPronuncia(profile: LanguageProfile, palavra: string): string | null {
	if (profile.tts.voices.length === 0) return null;
	return profile.tts.referencia ?? vozDoTexto(profile, palavra);
}

/**
 * Qual voz fala por uma PESSOA de um diálogo.
 *
 * No diálogo a voz sai do falante, e não do texto: com `vozDoTexto` cada fala
 * de "Ana" sairia num timbre, e o aluno não acompanharia quem diz o quê.
 * Duas pessoas nunca dividem a voz enquanto o idioma tiver vozes para todas:
 * o elenco inteiro (na ordem em que aparece) escolhe um ponto de partida, e
 * cada pessoa anda um passo primo com o total de vozes a partir dele. O passo
 * é perto da metade da lista porque as listas vêm agrupadas por timbre
 * (as femininas, depois as masculinas): duas pessoas tendem a soar diferentes.
 *
 * Determinística como a outra: o mesmo diálogo dá as mesmas vozes no
 * servidor, no worker e no Player, e a mesma fala na mesma voz é o mesmo
 * arquivo (db.md "MediaAsset").
 */
export function vozDoFalante(
	profile: LanguageProfile,
	falantes: string[],
	falante: string
): string | null {
	const vozes = profile.tts.voices;
	if (vozes.length === 0) return null;
	const elenco = [...new Set(falantes.map((f) => f.trim()))];
	const posicao = Math.max(0, elenco.indexOf(falante.trim()));
	const n = vozes.length;
	const partida = indiceEstavel(elenco.join('|'), n);
	return vozes[(partida + posicao * passoPrimo(n)) % n]!;
}

function passoPrimo(n: number): number {
	if (n <= 2) return 1;
	let passo = Math.floor(n / 2);
	while (mdc(passo, n) !== 1) passo += 1;
	return passo;
}

function mdc(a: number, b: number): number {
	return b === 0 ? a : mdc(b, a % b);
}

/**
 * Um índice estável a partir de uma string. FNV-1a de 32 bits: pequeno,
 * síncrono e isomórfico — o kernel não importa `node:crypto`, e um `hash`
 * assíncrono aqui contaminaria todo o caminho de montagem do item.
 *
 * Não é criptográfico e não precisa ser: o que se pede dele é espalhar os ids
 * pelas vozes, não resistir a colisão.
 */
function indiceEstavel(texto: string, modulo: number): number {
	let hash = 0x811c9dc5;
	for (let i = 0; i < texto.length; i++) {
		hash ^= texto.charCodeAt(i);
		// O multiplicador do FNV-1a, escrito como somas de deslocamentos para não
		// estourar a precisão de inteiro do JavaScript no meio da conta.
		hash = (hash + (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)) >>> 0;
	}
	return hash % modulo;
}
