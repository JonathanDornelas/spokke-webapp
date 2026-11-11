import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { instrucoesDoSistema, mensagemDoProfessor } from './prompt';
import { FalhaDoProvedor, type GeradorDeMateriais } from './provider';
import { envelopeDaResposta } from './schemas';

/**
 * A IA pelo Claude (`@anthropic-ai/sdk`), o provedor PRINCIPAL quando está na frente de
 * `LLM_PROVIDER` ("claude,gemini" — decisão do dono, 2026-11-11: os créditos mensais da API do
 * Claude vêm primeiro, e o Gemini é a reserva).
 *
 * **Saída estruturada pelo Zod**, não por JSON Schema escrito à mão: `betaZodOutputFormat`
 * recebe o MESMO envelope que valida a volta (`schemas.ts`), adapta o schema ao subconjunto que a
 * API aceita e devolve `parsed_output` já conferido. `gerar.ts` valida de novo, proposta por
 * proposta, contra o kernel — o provedor não é a régua.
 *
 * **Raciocínio no mínimo que o modelo aceita**: nos Claude atuais o raciocínio não desliga, e o
 * controle é o `effort` — `low`, pelo mesmo motivo do Gemini: devolver frases num JSON com schema
 * não melhora com raciocínio, e ele é cobrado como saída (adr-002 "Preços").
 *
 * O id do modelo NÃO está no código: vem de `CLAUDE_MODEL`, como o `GEMINI_MODEL`.
 */
export function criarClaude(config: { apiKey: string; model: string }): GeradorDeMateriais {
	// Uma nova tentativa do próprio SDK (429, 5xx, 529); depois disso a reserva assume.
	const cliente = new Anthropic({ apiKey: config.apiKey, maxRetries: 1 });
	const reservaDoServidor = aceitaReservaDoServidor(config.model);

	return {
		nome: `claude:${config.model}`,
		async propor(pedido, { timeoutMs }) {
			try {
				const resposta = await cliente.beta.messages.parse(
					{
						model: config.model,
						max_tokens: 16_000,
						system: instrucoesDoSistema(pedido),
						messages: [{ role: 'user', content: mensagemDoProfessor(pedido) }],
						output_config: {
							effort: 'low',
							format: betaZodOutputFormat(envelopeDaResposta(pedido.kind, pedido.quantos))
						},
						// Se o modelo recusar por política, o próprio servidor refaz o pedido num modelo
						// que aceite, na mesma chamada. Só nos modelos que oferecem isso.
						...(reservaDoServidor
							? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
							: {})
					},
					{ timeout: timeoutMs }
				);
				if (resposta.stop_reason === 'refusal') {
					throw new FalhaDoProvedor('O modelo recusou o pedido.');
				}
				if (resposta.stop_reason === 'max_tokens') {
					throw new FalhaDoProvedor('A resposta do modelo veio cortada.');
				}
				if (resposta.parsed_output === null) {
					throw new FalhaDoProvedor('O modelo devolveu algo fora do formato.');
				}
				return {
					dados: resposta.parsed_output,
					// O raciocínio já vem somado na saída — o Claude não o separa.
					uso: {
						entrada: resposta.usage.input_tokens,
						saida: resposta.usage.output_tokens,
						raciocinio: null
					},
					modelo: `claude:${resposta.model}`
				};
			} catch (e) {
				if (e instanceof FalhaDoProvedor) throw e;
				// O motivo de verdade vai para o log de quem opera — sem saldo, sobrecarga, chave.
				console.warn(`[ia] o Claude recusou: ${motivo(e)}`);
				throw new FalhaDoProvedor(mensagemDaFalha(tipoDaFalhaDoClaude(e)));
			}
		}
	};
}

/**
 * Os modelos que oferecem a reserva do PRÓPRIO servidor numa recusa (`fallbacks: "default"`).
 * Mandar o parâmetro a outro modelo seria recusa em toda geração.
 */
export function aceitaReservaDoServidor(model: string): boolean {
	return /^claude-(fable-5-[12]|opus-5|opus-5-5|sonnet-5-5)$/.test(model);
}

export type FalhaDoClaude = 'sem-creditos' | 'ocupado' | 'limite' | 'tempo' | 'outra';

/**
 * Por que o Claude falhou, pelo `status` e pelo `type` do erro da API — nunca pelo texto, que
 * muda. "Sem créditos" é o `billing_error` (402): o caso que manda a geração para o Gemini.
 */
export function tipoDaFalhaDoClaude(erro: unknown): FalhaDoClaude {
	if (
		erro instanceof Anthropic.APIConnectionTimeoutError ||
		erro instanceof Anthropic.APIUserAbortError
	) {
		return 'tempo';
	}
	const e = erro as { status?: unknown; type?: unknown } | null;
	if (e?.type === 'billing_error' || e?.status === 402) return 'sem-creditos';
	if (e?.type === 'overloaded_error' || e?.status === 529) return 'ocupado';
	if (e?.type === 'rate_limit_error' || e?.status === 429) return 'limite';
	return 'outra';
}

function mensagemDaFalha(tipo: FalhaDoClaude): string {
	switch (tipo) {
		case 'sem-creditos':
			return 'Os créditos do provedor de IA acabaram.';
		case 'ocupado':
			return 'O serviço de IA está sobrecarregado agora. Tente de novo em alguns minutos.';
		case 'limite':
			return 'O serviço de IA atingiu o limite de uso por agora. Tente de novo mais tarde.';
		case 'tempo':
			return 'O modelo demorou demais para responder.';
		case 'outra':
			return 'O provedor de IA recusou o pedido.';
	}
}

function motivo(erro: unknown): string {
	const e = erro as { status?: unknown; type?: unknown; message?: unknown } | null;
	const status = typeof e?.status === 'number' ? `${e.status} ` : '';
	const tipo = typeof e?.type === 'string' ? `${e.type}: ` : '';
	return `${status}${tipo}${String(e?.message ?? erro)}`.slice(0, 500);
}
