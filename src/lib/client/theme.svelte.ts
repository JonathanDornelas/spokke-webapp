import { browser } from '$app/environment';

/**
 * Um lugar só decide o tema do produto inteiro.
 *
 * **Claro é o padrão.** A preferência do sistema NÃO escolhe sozinha: quem
 * nunca tocou no botão vê o tema claro, sempre. Sem isso o app trocava de
 * tema conforme o horário do sistema operacional do professor, e trocava de
 * novo a cada navegação, porque só a home aplicava o valor guardado.
 *
 * A escolha vive em `localStorage` e é aplicada ANTES da primeira pintura
 * pelo script inline de `app.html` — este módulo cuida da troca em runtime.
 */

export type Tema = 'light' | 'dark';

export const CHAVE_TEMA = 'spokke-theme';

export function temaGuardado(): Tema {
	if (!browser) return 'light';
	const guardado = localStorage.getItem(CHAVE_TEMA);
	return guardado === 'dark' ? 'dark' : 'light';
}

class EstadoTema {
	atual = $state<Tema>('light');

	/** Lê o que o script inline já aplicou no <html>. */
	sincronizar() {
		if (!browser) return;
		this.atual = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
	}

	definir(tema: Tema) {
		this.atual = tema;
		if (!browser) return;
		document.documentElement.dataset.theme = tema;
		localStorage.setItem(CHAVE_TEMA, tema);
	}

	alternar() {
		this.definir(this.atual === 'light' ? 'dark' : 'light');
	}
}

export const tema = new EstadoTema();
