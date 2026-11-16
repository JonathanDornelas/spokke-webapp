import type { Visema } from '$lib/kernel/language/pronuncia';

/**
 * A BOCA de cada visema, de frente, como DADO: largura, abertura, quanto os
 * lábios arredondam, quanto dos dentes aparece e onde está a língua. Um desenho
 * só (`desenharBoca`) transforma os números nos traços — os quinze quadros saem
 * da mesma mão, com o mesmo traço, e trocar a arte final é trocar este arquivo.
 *
 * O estilo segue a referência que o dono do repositório escolheu: ilustração
 * plana, fundo azul-claro, contorno na cor da marca, a boca escura com os dentes
 * brancos. O traçado é nosso.
 *
 * Coordenadas num quadro de 120 × 120, com a boca centrada em (60, 57).
 */

export type Lingua = 'nenhuma' | 'baixa' | 'alta' | 'entre' | 'fundo';

export interface FormaDaBoca {
	/** Meia largura da abertura, do centro ao canto. */
	largura: number;
	/** Altura da abertura. Zero é a boca fechada. */
	abertura: number;
	/** 0 é o lábio esticado (cantos em ponta); 1, o lábio em bico (a abertura vira um "o"). */
	arredondado: number;
	/** Quanto dos dentes de cima aparece, de 0 a 1. */
	dentesCima: number;
	dentesBaixo: number;
	lingua: Lingua;
	/** Lábio de baixo encostado nos dentes de cima (f, v). */
	labioNoDente?: boolean;
	/** Lábios apertados um contra o outro (m, b, p). */
	apertada?: boolean;
}

export const FORMAS: Record<Visema, FormaDaBoca> = {
	repouso: {
		largura: 27,
		abertura: 0,
		arredondado: 0.2,
		dentesCima: 0,
		dentesBaixo: 0,
		lingua: 'nenhuma'
	},
	mbp: {
		largura: 26,
		abertura: 0,
		arredondado: 0.1,
		dentesCima: 0,
		dentesBaixo: 0,
		lingua: 'nenhuma',
		apertada: true
	},
	fv: {
		largura: 28,
		abertura: 9,
		arredondado: 0,
		dentesCima: 1,
		dentesBaixo: 0,
		lingua: 'nenhuma',
		labioNoDente: true
	},
	th: {
		largura: 28,
		abertura: 10,
		arredondado: 0.05,
		dentesCima: 0.9,
		// Os de baixo à mostra: a língua só fica ENTRE os dentes se os dois aparecem.
		dentesBaixo: 1,
		lingua: 'entre'
	},
	tdn: {
		largura: 28,
		abertura: 9,
		arredondado: 0.1,
		dentesCima: 0.8,
		dentesBaixo: 0.6,
		lingua: 'alta'
	},
	l: {
		largura: 28,
		abertura: 15,
		arredondado: 0.1,
		dentesCima: 0.7,
		dentesBaixo: 0.5,
		lingua: 'alta'
	},
	sz: {
		largura: 31,
		abertura: 6,
		arredondado: 0,
		dentesCima: 1,
		dentesBaixo: 1,
		lingua: 'nenhuma'
	},
	sh: {
		largura: 21,
		abertura: 11,
		arredondado: 0.65,
		dentesCima: 0.9,
		dentesBaixo: 0.8,
		lingua: 'nenhuma'
	},
	r: {
		largura: 19,
		abertura: 11,
		arredondado: 0.75,
		dentesCima: 0.5,
		dentesBaixo: 0,
		lingua: 'fundo'
	},
	u: {
		largura: 12,
		abertura: 10,
		arredondado: 1,
		dentesCima: 0,
		dentesBaixo: 0,
		lingua: 'nenhuma'
	},
	o: {
		largura: 18,
		abertura: 19,
		arredondado: 0.9,
		dentesCima: 0.3,
		dentesBaixo: 0,
		lingua: 'baixa'
	},
	a: {
		largura: 28,
		abertura: 25,
		arredondado: 0.25,
		dentesCima: 0.6,
		dentesBaixo: 0.3,
		lingua: 'baixa'
	},
	e: {
		largura: 30,
		abertura: 14,
		arredondado: 0.1,
		dentesCima: 0.7,
		dentesBaixo: 0.4,
		lingua: 'baixa'
	},
	i: {
		largura: 33,
		abertura: 11,
		arredondado: 0,
		dentesCima: 1,
		dentesBaixo: 0.9,
		lingua: 'nenhuma'
	},
	kg: {
		largura: 27,
		abertura: 13,
		arredondado: 0.15,
		dentesCima: 0.6,
		dentesBaixo: 0.3,
		lingua: 'fundo'
	}
};

/** O nome do formato, para quem não vê o desenho (`aria-label`) e para o catálogo. */
export const NOME_DA_BOCA: Record<Visema, string> = {
	repouso: 'boca em repouso',
	mbp: 'lábios fechados, apertados',
	fv: 'dentes de cima no lábio de baixo',
	th: 'ponta da língua entre os dentes',
	tdn: 'ponta da língua atrás dos dentes de cima',
	l: 'boca entreaberta, língua erguida atrás dos dentes',
	sz: 'dentes quase juntos, lábios esticados',
	sh: 'lábios para a frente, dentes quase juntos',
	r: 'lábios um pouco arredondados, língua recuada',
	u: 'lábios em bico, abertura pequena e redonda',
	o: 'lábios redondos, boca aberta',
	a: 'boca bem aberta',
	e: 'boca meio aberta, lábios relaxados',
	i: 'lábios esticados, dentes à mostra',
	kg: 'boca entreaberta, fundo da língua erguido'
};

export const CX = 60;
export const CY = 57;

export interface DesenhoDaBoca {
	/** A abertura (o escuro), ou `null` com a boca fechada. */
	abertura: string | null;
	/** A linha onde os lábios se encontram, com a boca fechada. */
	linhaDosLabios: string | null;
	dentesCima: { y: number; altura: number } | null;
	dentesBaixo: { y: number; altura: number } | null;
	/**
	 * A língua. `atras`: ela vai ATRÁS dos dentes de cima, que a cobrem em parte —
	 * a ponta encostada no céu da boca (t, d, n, l). Sem isso, de frente, ela saía
	 * igual à do th, que fica na frente, entre os dentes: e "think" dito "tink" é
	 * justamente o erro que a questão existe para mostrar.
	 */
	lingua: {
		cx: number;
		cy: number;
		rx: number;
		ry: number;
		recortada: boolean;
		atras: boolean;
	} | null;
	/**
	 * O lábio de baixo DENTRO da abertura, subindo até os dentes de cima (f, v): o
	 * contato é o que separa o f do p. Sem ele sobrava um vão escuro sob os dentes,
	 * como numa boca entreaberta.
	 */
	labioNoDente: string | null;
	/** O contorno de fora dos lábios: o de cima (com o arco do meio) e o de baixo. */
	labioCima: string;
	labioBaixo: string;
}

const r = (n: number) => Math.round(n * 10) / 10;

/** A escala da boca no rosto: na referência ela ocupa mais da metade da largura. */
const ESCALA_LARGURA = 1.24;
const ESCALA_ABERTURA = 1.4;

export function desenharBoca(f: FormaDaBoca): DesenhoDaBoca {
	const w = f.largura * ESCALA_LARGURA;
	const a = f.abertura * ESCALA_ABERTURA;
	const topo = CY - a * 0.42;
	const fundo = CY + a * 0.58;

	let abertura: string | null = null;
	if (a > 0) {
		if (f.arredondado >= 0.6) {
			// Em bico, a abertura é uma elipse: cantos redondos, não em ponta.
			const ry = a / 2;
			const cy = (topo + fundo) / 2;
			abertura = `M${r(CX - w)} ${r(cy)} a${r(w)} ${r(ry)} 0 1 0 ${r(2 * w)} 0 a${r(w)} ${r(ry)} 0 1 0 ${r(-2 * w)} 0Z`;
		} else {
			const k = 0.82 - 0.4 * f.arredondado;
			abertura =
				`M${r(CX - w)} ${CY}` +
				` C${r(CX - w * k)} ${r(topo - a * 0.18)} ${r(CX + w * k)} ${r(topo - a * 0.18)} ${r(CX + w)} ${CY}` +
				` C${r(CX + w * k)} ${r(fundo + a * 0.22)} ${r(CX - w * k)} ${r(fundo + a * 0.22)} ${r(CX - w)} ${CY}Z`;
		}
	}

	const linhaDosLabios =
		a === 0
			? `M${r(CX - w)} ${CY} Q${CX} ${r(CY + (f.apertada ? 0.6 : 2))} ${r(CX + w)} ${CY}`
			: null;

	const alturaDente = Math.min(a * 0.38, 8.5);
	const dentesCima =
		a > 0 && f.dentesCima > 0
			? { y: r(topo - a * 0.2), altura: r(a * 0.2 + alturaDente * f.dentesCima) }
			: null;
	// Com a língua ENTRE os dentes, os de baixo precisam aparecer de fato: medidos
	// pelo `fundo`, eles ficavam escondidos sob o traço da boca, que não desce até
	// lá (a curva de baixo chega a 0,6 da abertura, não a 0,82).
	const entreOsDentes = f.lingua === 'entre';
	const dentesBaixo =
		a > 0 && f.dentesBaixo > 0
			? entreOsDentes
				? {
						y: r(CY + a * 0.6 - alturaDente * 0.75 * f.dentesBaixo),
						altura: r(alturaDente * f.dentesBaixo + a * 0.2)
					}
				: {
						y: r(fundo + a * 0.24 - alturaDente * f.dentesBaixo),
						altura: r(alturaDente * f.dentesBaixo + a * 0.2)
					}
			: null;

	let lingua: DesenhoDaBoca['lingua'] = null;
	if (a > 0) {
		const base = { cx: CX, recortada: true, atras: false };
		if (f.lingua === 'baixa')
			lingua = { ...base, cy: r(fundo + 1), rx: r(w * 0.62), ry: r(a * 0.3) };
		if (f.lingua === 'fundo') lingua = { ...base, cy: r(fundo), rx: r(w * 0.5), ry: r(a * 0.42) };
		// A ponta sobe para trás dos dentes de cima, e eles cobrem o topo dela.
		if (f.lingua === 'alta')
			lingua = {
				...base,
				cy: r(topo + alturaDente * f.dentesCima + 1.2),
				rx: r(w * 0.3),
				ry: 3.2,
				atras: true
			};
		// Na frente de tudo, maior, na altura em que os dentes se encontram.
		if (f.lingua === 'entre')
			lingua = { ...base, cy: r(CY + 1.6), rx: r(w * 0.44), ry: 4.4, recortada: false };
	}

	// O lábio de baixo, por dentro, da borda dos dentes de cima até o fundo.
	let labioNoDente: string | null = null;
	if (a > 0 && f.labioNoDente && dentesCima) {
		const borda = dentesCima.y + dentesCima.altura;
		labioNoDente =
			`M${r(CX - w - 2)} ${r(borda + 1.4)} Q${CX} ${r(borda - 1.2)} ${r(CX + w + 2)} ${r(borda + 1.4)}` +
			` L${r(CX + w + 2)} ${r(fundo + a)} L${r(CX - w - 2)} ${r(fundo + a)}Z`;
	}

	// Os lábios: o de cima sobe até o arco do meio; o de baixo desce mais (é mais
	// cheio). Em bico eles se afastam do centro; no f e no v o de baixo sobe e
	// encosta nos dentes de cima.
	const bico = 1 + f.arredondado * 0.25;
	const lc = (w + 6) * (f.arredondado >= 0.6 ? 1.06 : 1);
	const altoCima = topo - (f.apertada ? 5 : 8.5) * bico;
	const arco = altoCima + 2.6;
	const baixoBaixo = (f.labioNoDente ? fundo - 1.5 : fundo) + (f.apertada ? 7 : 11) * bico;
	const labioCima =
		`M${r(CX - lc)} ${CY}` +
		` C${r(CX - lc * 0.7)} ${r(altoCima + 1)} ${r(CX - 13)} ${r(altoCima - 1)} ${r(CX - 6)} ${r(altoCima)}` +
		` Q${CX} ${r(arco + 1.2)} ${r(CX + 6)} ${r(altoCima)}` +
		` C${r(CX + 13)} ${r(altoCima - 1)} ${r(CX + lc * 0.7)} ${r(altoCima + 1)} ${r(CX + lc)} ${CY}`;
	const labioBaixo =
		`M${r(CX + lc)} ${CY}` +
		` C${r(CX + lc * 0.75)} ${r(baixoBaixo)} ${r(CX - lc * 0.75)} ${r(baixoBaixo)} ${r(CX - lc)} ${CY}`;

	return {
		abertura,
		linhaDosLabios,
		dentesCima,
		dentesBaixo,
		lingua,
		labioNoDente,
		labioCima,
		labioBaixo
	};
}
