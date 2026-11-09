import { browser } from '$app/environment';

/**
 * "Pronúncia nas teclas": a leitura sob cada tecla do teclado virtual e a
 * linha "Leitura" sob o campo (`kernel/language/leitura.ts`).
 *
 * **Ligada por padrão, e desligável.** Quem está aprendendo o alfabeto precisa
 * dela para achar a letra; quem já decorou tem a tecla poluída e, pior, passa a
 * ler a pronúncia em vez do caractere — que é justamente o que ele está ali
 * para aprender. A escolha vale por aparelho, como o volume (`sons.svelte.ts`),
 * e é uma só para o teclado e para o campo: as duas coisas dizem a mesma.
 */
export const CHAVE_PRONUNCIA = 'spokke-pronuncia';

class Pronuncia {
	ligada = $state(true);
	#sincronizado = false;

	/** Lê a preferência guardada. Idempotente — pode ser chamado de um `$effect`. */
	sincronizar() {
		if (!browser || this.#sincronizado) return;
		this.#sincronizado = true;
		try {
			const guardado = localStorage.getItem(CHAVE_PRONUNCIA);
			if (guardado !== null) this.ligada = guardado === '1';
		} catch {
			// Aba anônima, armazenamento bloqueado: fica o padrão.
		}
	}

	alternar() {
		this.ligada = !this.ligada;
		if (!browser) return;
		try {
			localStorage.setItem(CHAVE_PRONUNCIA, this.ligada ? '1' : '0');
		} catch {
			// Sem persistência a escolha vale só para esta sessão.
		}
	}
}

export const pronuncia = new Pronuncia();
