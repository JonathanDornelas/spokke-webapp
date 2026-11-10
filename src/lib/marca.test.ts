import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ICONE, MARCA } from './marca';

/**
 * Os buracos do logo dependem da regra de preenchimento, não do traço: todos os
 * contornos de `marca.ts` giram no mesmo sentido (é como saíram da
 * vetorização). Este teste tranca as duas pontas — se o traço mudar de forma,
 * ou se alguém tirar o `evenodd` de quem desenha, o "p", o "o" e o "e" voltam a
 * sair cheios.
 */

/** Os pontos de ancoragem de cada subcaminho (bastam para o sinal da área). */
function subcaminhos(d: string): [number, number][][] {
	const toks = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? [];
	const out: [number, number][][] = [];
	let i = 0;
	let cmd = '';
	let cx = 0;
	let cy = 0;
	let inicio: [number, number] = [0, 0];
	const num = () => Number(toks[i++]);
	while (i < toks.length) {
		if (/[a-zA-Z]/.test(toks[i]!)) cmd = toks[i++]!;
		const rel = cmd === cmd.toLowerCase();
		const ir = (x: number, y: number) => {
			cx = rel ? cx + x : x;
			cy = rel ? cy + y : y;
		};
		switch (cmd.toLowerCase()) {
			case 'm':
				ir(num(), num());
				out.push([[cx, cy]]);
				inicio = [cx, cy];
				cmd = rel ? 'l' : 'L';
				break;
			case 'l':
				ir(num(), num());
				out.at(-1)!.push([cx, cy]);
				break;
			case 'c': {
				const a = [num(), num(), num(), num(), num(), num()];
				ir(a[4]!, a[5]!);
				out.at(-1)!.push([cx, cy]);
				break;
			}
			case 'z':
				[cx, cy] = inicio;
				break;
			default:
				throw new Error(`comando inesperado no traço: ${cmd}`);
		}
	}
	return out;
}

function area(p: [number, number][]): number {
	let a = 0;
	for (let j = 0; j < p.length; j++) {
		const [x1, y1] = p[j]!;
		const [x2, y2] = p[(j + 1) % p.length]!;
		a += x1 * y2 - x2 * y1;
	}
	return a / 2;
}

describe('a marca', () => {
	it('tem os contornos de dentro: os pontinhos do balão e o miolo do p, do o e do e', () => {
		// Ícone: o contorno de fora e os três pontinhos.
		expect(subcaminhos(ICONE.d)).toHaveLength(4);
		// Marca: o ícone (4), o p e o o (2 cada), os dois k (1 cada) e o e (2).
		expect(subcaminhos(MARCA.d)).toHaveLength(12);
	});

	it('gira tudo no mesmo sentido, então quem desenha precisa de evenodd', () => {
		for (const d of [ICONE.d, MARCA.d]) {
			const sinais = new Set(subcaminhos(d).map((p) => Math.sign(area(p))));
			expect(sinais.size).toBe(1);
		}
	});

	it('o Logo e o favicon declaram fill-rule evenodd', () => {
		const logo = readFileSync('src/lib/components/Logo.svelte', 'utf8');
		expect(logo).toMatch(/fill-rule="evenodd"/);
		const favicon = readFileSync('src/lib/assets/favicon.svg', 'utf8');
		expect(favicon).toMatch(/fill-rule:\s*evenodd/);
	});
});
