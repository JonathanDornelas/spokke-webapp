/**
 * Código de acesso da atividade — as 4 letras que o professor dita em aula.
 *
 * **Nunca derive o código do slug.** O slug é público (está no link), então um
 * código tirado dele não protege nada: quem tem o link tem o código. Era assim
 * que funcionava antes.
 *
 * O alfabeto não tem `I` nem `O`: ditado em voz alta e escrito num quadro,
 * eles viram 1 e 0 na mão do aluno.
 */

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const TAMANHO_CODIGO = 4;

export function gerarCodigoAcesso(): string {
	// `crypto` e não `Math.random`: o código é a única barreira de uma
	// atividade fechada, e um gerador previsível não é barreira nenhuma.
	const bytes = crypto.getRandomValues(new Uint8Array(TAMANHO_CODIGO));
	return Array.from(bytes, (b) => ALFABETO[b % ALFABETO.length]).join('');
}

/**
 * O que o professor digitou vira um código válido, ou `null`. Aceita minúscula
 * e espaço porque é assim que se digita; recusa letra fora do alfabeto em vez
 * de trocar por outra em silêncio.
 */
export function normalizarCodigoAcesso(bruto: string | undefined | null): string | null {
	if (!bruto) return null;
	const limpo = bruto.toUpperCase().replace(/[^A-Z]/g, '');
	if (limpo.length !== TAMANHO_CODIGO) return null;
	return [...limpo].every((letra) => ALFABETO.includes(letra)) ? limpo : null;
}

/** Comparação do lado do servidor — o aluno pode digitar em minúscula. */
export function codigoConfere(esperado: string | null, digitado: string): boolean {
	if (!esperado) return false;
	return normalizarCodigoAcesso(digitado) === esperado;
}

/**
 * O cookie que diz que este aparelho já passou pelo código de uma publicação
 * (24 h, `httpOnly`), seguido do slug. Lido pela entrada, pela tela do código e
 * por `iniciarTentativa`, que confere de novo: toda remote function é endpoint
 * público, e a tela de entrada ter mandado para o código não protege nada.
 */
export const COOKIE_DO_CODIGO = 'spokke_code_';

/**
 * A entrada manda para o código? **O código é a PRIMEIRA tela** de uma atividade
 * que pede um: a ordem antiga (nome, depois código, e de volta a uma entrada
 * vazia) fazia o aluno digitar o nome duas vezes. Quem tem tentativa neste
 * aparelho, pela metade ou terminada, já passou pelo código ao começar e não é
 * barrado de novo para continuar ou rever o que fez; começar outra passa por
 * ele outra vez.
 */
export function precisaDoCodigo(opcoes: {
	exige: boolean;
	codigo: string | null;
	doCookie: string | undefined;
	temTentativa: boolean;
}): boolean {
	if (!opcoes.exige || opcoes.temTentativa) return false;
	return !opcoes.codigo || opcoes.doCookie !== opcoes.codigo;
}
