import { describe, expect, it } from 'vitest';
import { languageLabels } from '$lib/kernel/language/profiles';
import { amostrasDaEtapa1, temAmostra } from './amostras';

describe('amostras da etapa 1', () => {
	it('todo idioma do produto tem amostra própria', () => {
		for (const tag of Object.values(languageLabels)) expect(temAmostra(tag), tag).toBe(true);
	});

	it('uma questão de cada tipo, na ordem do desenho', () => {
		const amostras = amostrasDaEtapa1('ja-JP', null);
		expect(amostras.map((a) => a.habilidade)).toEqual(['escuta', 'fala', 'leitura', 'escrita']);
		expect(amostras[0].corpo).toMatchObject({
			forma: 'ouvir-escolher',
			certa: 'わたしはがくせいです。'
		});
	});

	it('em inglês a frase acompanha o nível, como no desenho', () => {
		const a1 = amostrasDaEtapa1('en-US', 'A1')[1].corpo;
		const c2 = amostrasDaEtapa1('en-US', 'C2')[1].corpo;
		expect(a1).toEqual({ forma: 'falar', frase: 'She works here.' });
		expect(c2).not.toEqual(a1);
	});

	it('idioma sem voz mostra a escuta apagada', () => {
		const [escuta] = amostrasDaEtapa1('ar-SA', null, { semEscuta: true });
		expect(escuta.entra).toBe(false);
	});
});
