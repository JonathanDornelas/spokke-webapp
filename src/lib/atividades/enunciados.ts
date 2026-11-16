/**
 * O enunciado que o aluno lê. O kernel só emite a CHAVE porque é agnóstico
 * de idioma; a copy fica aqui, na camada de apresentação. Hoje só existe em
 * português — quando o produto atender aluno de outra língua materna, isto
 * vira um mapa por `locale.source` (pendência, ver paginas.md).
 *
 * Mora fora de `$lib/server` porque o editor de questão troca o enunciado
 * padrão na tela quando o professor troca o formato; o Player o lê pelo
 * `server/player/runtime.ts`, que reexporta daqui.
 */
export const ENUNCIADOS: Record<string, string> = {
	'assemble-from-source': 'Monte a frase.',
	'translate-to-source': 'Traduza a frase.',
	'listen-and-assemble': 'Ouça e monte a frase.',
	'listen-and-type': 'Ouça e escreva o que você ouviu.',
	'listen-and-choose': 'Ouça e escolha o que você ouviu.',
	'fill-the-blank': 'Complete a frase.',
	'say-in-target': 'Diga esta frase em voz alta.',
	'choose-translation': 'Escolha a tradução.',
	'answer-about-passage': 'Responda sobre o texto.',
	'order-the-lines': 'Coloque as falas na ordem certa.',
	'match-pairs': 'Ligue cada um ao seu par.',
	'tap-the-word': 'Toque na palavra certa.',
	'answer-about-dialogue': 'Responda sobre o diálogo.',
	'choose-next-line': 'Escolha a próxima fala.',
	'assemble-next-line': 'Monte a próxima fala.',
	'say-next-line': 'Diga a próxima fala.',
	'pronounce-the-word': 'Pronuncie a palavra.',
	'choose-the-word': 'Escolha a palavra com este sentido.',
	'listen-and-choose-meaning': 'Ouça e escolha o significado.',
	'listen-and-type-word': 'Ouça e escreva a palavra.',
	'write-the-word': 'Escreva a palavra com este sentido.',
	'say-the-word': 'Diga esta palavra em voz alta.'
};

/** O enunciado por extenso. O professor nunca vê a chave crua. */
export function instructionText(key: string | undefined | null): string {
	return key ? (ENUNCIADOS[key] ?? '') : '';
}
