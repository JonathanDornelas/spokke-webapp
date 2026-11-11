import { FalhaDoProvedor, type GeradorDeMateriais } from './provider';

/**
 * A fila de provedores: o primeiro tenta, e se FALHAR — sem créditos, sobrecarga, recusa, tempo
 * — o seguinte tenta o mesmo pedido. É o "Claude primeiro, Gemini se o Claude não der" do dono
 * (`LLM_PROVIDER="claude,gemini"`, 2026-11-11).
 *
 * Só `FalhaDoProvedor` passa a vez: é como todo provedor diz "não consegui". Qualquer outro erro
 * é defeito do código e sobe — trocar de provedor ali esconderia o bug.
 *
 * O crédito do professor é um só, debitado antes (`gerar.ts`): passar ao seguinte não cobra de
 * novo, e falhar em todos estorna tudo, como sempre. Cada um tem o teto de tempo inteiro — no
 * pior caso, o primeiro estoura o teto e o segundo ainda pode responder.
 */
export function comReserva(geradores: GeradorDeMateriais[]): GeradorDeMateriais {
	if (geradores.length === 1) return geradores[0];
	return {
		nome: geradores.map((g) => g.nome).join(' → '),
		async propor(pedido, opcoes) {
			let ultima: FalhaDoProvedor | null = null;
			for (const [i, gerador] of geradores.entries()) {
				try {
					const resposta = await gerador.propor(pedido, opcoes);
					// Quem respondeu é o que vai para o `AiUsage`, não a fila inteira.
					return { ...resposta, modelo: resposta.modelo ?? gerador.nome };
				} catch (e) {
					if (!(e instanceof FalhaDoProvedor)) throw e;
					ultima = e;
					const seguinte = geradores[i + 1];
					if (seguinte) {
						console.warn(`[ia] ${gerador.nome} falhou (${e.message}); tentando ${seguinte.nome}.`);
					}
				}
			}
			throw ultima ?? new FalhaDoProvedor('O provedor de IA recusou o pedido.');
		}
	};
}
