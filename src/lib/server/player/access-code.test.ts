import { describe, expect, it } from 'vitest';
import {
	codigoConfere,
	gerarCodigoAcesso,
	normalizarCodigoAcesso,
	precisaDoCodigo
} from './access-code';

describe('código de acesso', () => {
	it('é a PRIMEIRA tela de quem ainda não passou por ele', () => {
		const base = { exige: true, codigo: 'KQTP', temTentativa: false };
		expect(precisaDoCodigo({ ...base, doCookie: undefined })).toBe(true);
		// Cookie de outra publicação, ou de um código que o professor trocou ao republicar.
		expect(precisaDoCodigo({ ...base, doCookie: 'ABCD' })).toBe(true);
	});

	it('quem já passou, ou já tem tentativa neste aparelho, vai direto para a entrada', () => {
		const base = { exige: true, codigo: 'KQTP' };
		expect(precisaDoCodigo({ ...base, doCookie: 'KQTP', temTentativa: false })).toBe(false);
		expect(precisaDoCodigo({ ...base, doCookie: undefined, temTentativa: true })).toBe(false);
	});

	it('atividade sem código não tem portão', () => {
		expect(
			precisaDoCodigo({ exige: false, codigo: null, doCookie: undefined, temTentativa: false })
		).toBe(false);
	});

	it('o sorteio só usa o alfabeto sem I e O, e a conferência aceita minúscula e espaço', () => {
		for (let i = 0; i < 50; i++) expect(gerarCodigoAcesso()).toMatch(/^[A-HJ-NP-Z]{4}$/);
		expect(normalizarCodigoAcesso(' kq tp ')).toBe('KQTP');
		expect(normalizarCodigoAcesso('KQT0')).toBeNull();
		expect(codigoConfere('KQTP', 'kqtp')).toBe(true);
		expect(codigoConfere('KQTP', 'KQTA')).toBe(false);
		expect(codigoConfere(null, 'KQTP')).toBe(false);
	});
});
