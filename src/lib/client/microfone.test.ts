import { describe, expect, it } from 'vitest';
import {
	IMPEDIMENTOS,
	ajudaDoMicrofone,
	ambienteDe,
	ehImpedimento,
	impedimentoDoErro
} from './microfone';

/**
 * O caminho da permissão sai do `userAgent`, e um caminho errado é pior que
 * nenhum: o aluno procura o "aA" num Android e desiste. Os `userAgent` são os
 * que cada navegador manda de verdade.
 */
const UA = {
	iphoneSafari:
		'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
	iphoneChrome:
		'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1',
	iphoneInstagram:
		'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 337.0.3.23.54 (iPhone14,5; iOS 17_5; pt_BR; pt; scale=3.00; 1170x2532; 614171398)',
	// O iPad se apresenta como Mac.
	ipad: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
	androidChrome:
		'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
	androidSamsung:
		'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
	androidFirefox: 'Mozilla/5.0 (Android 14; Mobile; rv:127.0) Gecko/127.0 Firefox/127.0',
	androidWebView:
		'Mozilla/5.0 (Linux; Android 14; SM-A546E; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36',
	windowsChrome:
		'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
	windowsEdge:
		'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
	windowsFirefox:
		'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
	macSafari:
		'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15'
};

describe('ambienteDe', () => {
	it('reconhece aparelho, navegador e o navegador de dentro de um app', () => {
		expect(ambienteDe(UA.iphoneSafari)).toEqual({
			sistema: 'ios',
			navegador: 'safari',
			dentroDeApp: false
		});
		expect(ambienteDe(UA.iphoneChrome)).toMatchObject({ sistema: 'ios', navegador: 'chrome' });
		expect(ambienteDe(UA.iphoneInstagram)).toMatchObject({ sistema: 'ios', dentroDeApp: true });
		expect(ambienteDe(UA.androidChrome)).toEqual({
			sistema: 'android',
			navegador: 'chrome',
			dentroDeApp: false
		});
		expect(ambienteDe(UA.androidSamsung).navegador).toBe('samsung');
		expect(ambienteDe(UA.androidFirefox)).toMatchObject({
			sistema: 'android',
			navegador: 'firefox'
		});
		expect(ambienteDe(UA.androidWebView).dentroDeApp).toBe(true);
		expect(ambienteDe(UA.windowsEdge)).toMatchObject({ sistema: 'windows', navegador: 'edge' });
		expect(ambienteDe(UA.windowsFirefox).navegador).toBe('firefox');
		expect(ambienteDe(UA.macSafari)).toMatchObject({ sistema: 'mac', navegador: 'safari' });
	});

	it('o iPad que diz ser Mac é iPad pela tela de toque', () => {
		expect(ambienteDe(UA.ipad, 5).sistema).toBe('ios');
		expect(ambienteDe(UA.ipad, 0).sistema).toBe('mac');
	});
});

describe('impedimentoDoErro', () => {
	it('separa recusa do site, do sistema, pedido fechado, sem microfone e microfone preso', () => {
		expect(impedimentoDoErro(new DOMException('Permission denied', 'NotAllowedError'))).toBe(
			'negado'
		);
		expect(
			impedimentoDoErro(new DOMException('Permission denied by system', 'NotAllowedError'))
		).toBe('negado-sistema');
		expect(impedimentoDoErro(new DOMException('Permission dismissed', 'NotAllowedError'))).toBe(
			'dispensado'
		);
		expect(impedimentoDoErro(new DOMException('', 'NotFoundError'))).toBe('sem-microfone');
		expect(impedimentoDoErro(new DOMException('', 'NotReadableError'))).toBe('ocupado');
		// O nome antigo do Chrome, que ainda aparece em WebView velho.
		expect(impedimentoDoErro({ name: 'PermissionDeniedError' })).toBe('negado');
		// O que não se conhece cai no caminho da permissão.
		expect(impedimentoDoErro(new Error('???'))).toBe('negado');
		expect(impedimentoDoErro(undefined)).toBe('negado');
	});
});

describe('ajudaDoMicrofone', () => {
	const passo = (ua: string, toque = 0) =>
		ajudaDoMicrofone('negado', ambienteDe(ua, toque)).passo ?? '';

	it('o caminho da permissão é o do navegador que o aluno tem na mão', () => {
		expect(passo(UA.iphoneSafari)).toContain('aA');
		expect(passo(UA.ipad, 5)).toContain('aA');
		expect(passo(UA.iphoneChrome)).toContain('Ajustes › Chrome');
		expect(passo(UA.androidChrome)).toContain('Permissões › Microfone');
		expect(passo(UA.androidFirefox)).toContain('cadeado');
		expect(passo(UA.windowsChrome)).toContain('ícone à esquerda do endereço');
		expect(passo(UA.windowsFirefox)).toContain('microfone riscado');
		expect(passo(UA.macSafari)).toContain('Ajustes para Este Site');
		// Ninguém recebe o caminho de outro aparelho.
		expect(passo(UA.androidChrome)).not.toContain('aA');
		expect(passo(UA.iphoneSafari)).not.toContain('Permissões');
	});

	it('dentro de um app, o caminho é sair dele', () => {
		const ajuda = ajudaDoMicrofone('negado', ambienteDe(UA.iphoneInstagram));
		expect(ajuda.passo).toContain('Abrir no navegador');
		expect(ajudaDoMicrofone('indisponivel', ambienteDe(UA.androidWebView)).passo).toContain(
			'Abrir no navegador'
		);
	});

	it('o bloqueio do sistema aponta para o sistema, não para o site', () => {
		expect(ajudaDoMicrofone('negado-sistema', ambienteDe(UA.windowsChrome)).passo).toContain(
			'Privacidade e segurança'
		);
		expect(ajudaDoMicrofone('negado-sistema', ambienteDe(UA.macSafari)).passo).toContain(
			'Ajustes do Sistema'
		);
		expect(ajudaDoMicrofone('negado-sistema', ambienteDe(UA.androidSamsung)).passo).toContain(
			'Apps › Samsung Internet'
		);
	});

	it('todo impedimento diz o que aconteceu e lembra que dá para pular', () => {
		const ambientes = Object.values(UA).map((ua) => ambienteDe(ua));
		for (const impedimento of IMPEDIMENTOS) {
			expect(ehImpedimento(impedimento)).toBe(true);
			for (const a of ambientes) {
				const ajuda = ajudaDoMicrofone(impedimento, a);
				expect(ajuda.titulo).toMatch(/pule esta questão\.$/);
				// Voz do produto: sem travessão.
				expect(`${ajuda.titulo} ${ajuda.passo ?? ''}`).not.toContain('—');
			}
		}
		expect(ehImpedimento('gravando')).toBe(false);
	});
});
