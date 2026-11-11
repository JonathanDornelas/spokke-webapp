import { GoogleGenAI, ThinkingLevel, type ThinkingConfig } from '@google/genai';
import { instrucoesDoSistema, mensagemDoProfessor } from './prompt';
import { FalhaDoProvedor, type GeradorDeMateriais } from './provider';

/**
 * A IA pelo Gemini (`@google/genai`), com SAÍDA ESTRUTURADA: o JSON Schema da
 * resposta (saído do mesmo Zod que valida a volta, `schemas.ts`) vai em
 * `responseJsonSchema`, e o modelo responde no formato.
 *
 * O id do modelo NÃO está no código: vem de `GEMINI_MODEL`, porque o catálogo
 * do Gemini muda de nome com frequência — quem opera escolhe o Flash estável
 * vigente em ai.google.dev/gemini-api/docs/models (docs/operacao.md).
 */
export function criarGemini(config: { apiKey: string; model: string }): GeradorDeMateriais {
	const cliente = new GoogleGenAI({ apiKey: config.apiKey });
	const thinkingConfig = raciocinioMinimo(config.model);

	return {
		nome: `gemini:${config.model}`,
		async propor(pedido, { schema, timeoutMs }) {
			const abortar = new AbortController();
			const relogio = setTimeout(() => abortar.abort(), timeoutMs);
			try {
				const resposta = await cliente.models.generateContent({
					model: config.model,
					contents: mensagemDoProfessor(pedido),
					config: {
						systemInstruction: instrucoesDoSistema(pedido),
						responseMimeType: 'application/json',
						responseJsonSchema: schema,
						temperature: 0.7,
						...(thinkingConfig ? { thinkingConfig } : {}),
						abortSignal: abortar.signal
					}
				});
				const texto = resposta.text;
				if (!texto) throw new FalhaDoProvedor('O modelo não devolveu conteúdo.');
				let dados: unknown;
				try {
					dados = JSON.parse(texto);
				} catch {
					throw new FalhaDoProvedor('O modelo devolveu algo que não é JSON.');
				}
				const u = resposta.usageMetadata;
				return {
					dados,
					uso: u
						? {
								entrada: u.promptTokenCount ?? null,
								saida: u.candidatesTokenCount ?? null,
								raciocinio: u.thoughtsTokenCount ?? null
							}
						: null
				};
			} catch (e) {
				if (e instanceof FalhaDoProvedor) throw e;
				throw new FalhaDoProvedor(
					abortar.signal.aborted
						? 'O modelo demorou demais para responder.'
						: 'O provedor de IA recusou o pedido.'
				);
			} finally {
				clearTimeout(relogio);
			}
		}
	};
}

/**
 * O MENOR raciocínio que o modelo aceita. Os Flash recentes raciocinam por
 * padrão, e o Gemini cobra esses tokens como SAÍDA — para devolver frases num
 * JSON com schema isso não melhora nada e dobrava o pior caso dos créditos, que
 * é a conta dos preços (docs/adr-002-billing.md "Preços"). Mudar aqui é refazer
 * aquela conta.
 *
 * Cada geração do Gemini fala uma língua: a 2.5 mede o raciocínio em tokens
 * (`thinkingBudget`, e o Pro não desce de 128), a 3 em diante em nível
 * (`thinkingLevel`, e o Pro não tem o mínimo). Antes da 2.5 não há raciocínio,
 * e mandar a opção seria recusa. Pedir a coisa errada a um modelo é erro em
 * TODA geração, então a escolha sai do id que quem opera configurou.
 */
export function raciocinioMinimo(model: string): ThinkingConfig | undefined {
	const id = model.replace(/^models\//, '');
	const pro = /-pro\b/.test(id);
	if (/^gemini-(1\.|2\.0)/.test(id)) return undefined;
	if (id.startsWith('gemini-2.5')) return { thinkingBudget: pro ? 128 : 0 };
	return { thinkingLevel: pro ? ThinkingLevel.LOW : ThinkingLevel.MINIMAL };
}
