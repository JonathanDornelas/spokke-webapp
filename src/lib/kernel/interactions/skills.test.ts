import { describe, expect, it } from 'vitest';
import { habilidadePrincipal } from './skills';

describe('habilidadePrincipal', () => {
	it('falar vence ouvir, ouvir vence escrever, e a leitura só nomeia sozinha', () => {
		// "Diga a próxima fala" com o diálogo em áudio e texto.
		expect(habilidadePrincipal(['listening', 'reading', 'speaking'])).toBe('speaking');
		// "Ouça e escreva".
		expect(habilidadePrincipal(['listening', 'writing'])).toBe('listening');
		// "Complete a frase".
		expect(habilidadePrincipal(['reading', 'writing'])).toBe('writing');
		expect(habilidadePrincipal(['reading', 'speaking'])).toBe('speaking');
		expect(habilidadePrincipal(['reading'])).toBe('reading');
		expect(habilidadePrincipal([])).toBe('reading');
	});
});
