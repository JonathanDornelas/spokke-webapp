/**
 * As variações de tradução de um par de frases COMO VÃO SER GRAVADAS: aparadas,
 * sem vazias, sem a própria tradução, sem repetir, no máximo oito. Isomórfico:
 * o servidor grava com isto (`montarMaterial`) e o formulário compara com isto
 * para dizer "você já tem esta frase" — o servidor reaproveita material por
 * igualdade de jsonb, e as variações fazem parte dela.
 *
 * A comparação é por normalização Unicode (NFC), não pelo normalizador do
 * idioma: "café" e "cafe" são duas variações para o servidor, e o que o
 * normalizador iguala a correção já aceita sozinha.
 */
export const MAX_VARIACOES = 8;

export function limparVariacoes(lista: unknown, traducao: string): string[] {
	if (!Array.isArray(lista)) return [];
	const vistas = new Set([traducao.trim().normalize('NFC')]);
	const saida: string[] = [];
	for (const item of lista) {
		const v = typeof item === 'string' ? item.trim() : '';
		const chave = v.normalize('NFC');
		if (!v || vistas.has(chave)) continue;
		vistas.add(chave);
		saida.push(v);
	}
	return saida.slice(0, MAX_VARIACOES);
}
