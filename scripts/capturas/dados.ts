/** As contas e o endereço do cenário das capturas (docs/propaganda/captura-das-telas.md). Fictícios. */
export const BASE = process.env.CAPTURAS_URL ?? 'http://localhost:5173';

export const PROFESSORA = {
	nome: 'Marina Couto',
	email: 'marina.couto@exemplo.invalid',
	senha: 'demo-spokke-2026'
};

/** A aluna das propagandas, com conta e senha (`cenario.ts` a liga a uma ficha da turma abaixo). */
export const ALUNA = {
	nome: 'Ana Ribeiro',
	email: 'ana.ribeiro@exemplo.invalid',
	senha: 'demo-spokke-2026'
};

/** A turma da Ana no vídeo dos módulos: a do seed com o Frutas toda quarta. */
export const TURMA_DA_ANA = '8º A — inglês';
