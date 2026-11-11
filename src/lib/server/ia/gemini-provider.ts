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
	// O raciocínio em uso. Começa no menor que a geração do modelo conhece e SOBE um degrau
	// quando o modelo recusa aquele nível — e fica nele, porque o gerador vive o processo
	// inteiro (`index.ts` o guarda). Foi o caso do `gemini-3.8-flash`: ele não aceita o
	// MINIMAL, e toda geração voltava "o provedor recusou o pedido".
	let raciocinio = raciocinioMinimo(config.model);

	return {
		nome: `gemini:${config.model}`,
		async propor(pedido, { schema, timeoutMs }) {
			const abortar = new AbortController();
			const relogio = setTimeout(() => abortar.abort(), timeoutMs);
			const chamar = () =>
				cliente.models.generateContent({
					model: config.model,
					contents: mensagemDoProfessor(pedido),
					config: {
						systemInstruction: instrucoesDoSistema(pedido),
						responseMimeType: 'application/json',
						responseJsonSchema: schema,
						temperature: 0.7,
						...(raciocinio ? { thinkingConfig: raciocinio } : {}),
						abortSignal: abortar.signal
					}
				});
			try {
				let resposta: Awaited<ReturnType<typeof chamar>>;
				let jaEsperou = false;
				for (;;) {
					try {
						resposta = await chamar();
						break;
					} catch (e) {
						// O modelo não aceita o raciocínio pedido: um degrau acima (a escada acaba).
						const acima = recusouORaciocinio(e) ? raciocinioAcima(raciocinio) : null;
						if (acima) {
							console.warn(
								`[ia] ${config.model} não aceita ${descrever(raciocinio)}; seguindo com ${descrever(acima)}.`
							);
							raciocinio = acima;
							continue;
						}
						// Sobrecarga do lado do Google ("high demand"): costuma passar em segundos, então
						// UMA nova tentativa, dentro do mesmo teto de tempo.
						if (provedorOcupado(e) && !jaEsperou) {
							jaEsperou = true;
							console.warn(`[ia] ${config.model} ocupado (503); tentando de novo em 2 s.`);
							await new Promise((pronto) => setTimeout(pronto, 2_000));
							continue;
						}
						throw e;
					}
				}
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
				// O motivo de verdade vai para o log de quem opera. Ele era descartado aqui, e
				// "o provedor recusou o pedido" na tela não dizia se era a chave, a cota ou uma
				// opção que o modelo não aceita. A mensagem da API não carrega a chave (ela vai
				// num cabeçalho, não na URL).
				if (!abortar.signal.aborted) console.warn(`[ia] o Gemini recusou: ${motivo(e)}`);
				// A frase diz o que o professor pode fazer: esperar uns minutos não é o mesmo que
				// o pedido ter algo errado.
				throw new FalhaDoProvedor(
					abortar.signal.aborted
						? 'O modelo demorou demais para responder.'
						: provedorOcupado(e)
							? 'O serviço de IA está sobrecarregado agora. Tente de novo em alguns minutos.'
							: limiteDoProvedor(e)
								? 'O serviço de IA atingiu o limite de uso por agora. Tente de novo mais tarde.'
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

/**
 * O degrau seguinte quando o modelo RECUSA o raciocínio pedido — nunca o padrão dele. Nulo
 * quando não há para onde subir. O teto é o MEDIUM de propósito: medido com o 3.8 Flash em
 * 2026-11-11, sem configuração uma chamada curta passou de dois minutos — além do teto de 45 s
 * da geração —, e o raciocínio é cobrado como saída (a conta dos preços, adr-002).
 */
export function raciocinioAcima(atual: ThinkingConfig | undefined): ThinkingConfig | null {
	if (!atual) return null;
	if (atual.thinkingLevel === ThinkingLevel.MINIMAL) return { thinkingLevel: ThinkingLevel.LOW };
	if (atual.thinkingLevel === ThinkingLevel.LOW) return { thinkingLevel: ThinkingLevel.MEDIUM };
	if (atual.thinkingBudget === 0) return { thinkingBudget: 128 };
	return null;
}

/** A recusa é por causa do raciocínio pedido? (400 com "thinking" na mensagem.) */
export function recusouORaciocinio(erro: unknown): boolean {
	const e = erro as { status?: unknown; message?: unknown } | null;
	return e?.status === 400 && /thinking/i.test(String(e?.message ?? ''));
}

/** Sobrecarga momentânea do Google (503, "high demand") — passa sozinha. */
export function provedorOcupado(erro: unknown): boolean {
	return (erro as { status?: unknown } | null)?.status === 503;
}

/** Cota da chave (429): a gratuita tem um teto diário baixo; esperar alguns minutos não basta. */
export function limiteDoProvedor(erro: unknown): boolean {
	return (erro as { status?: unknown } | null)?.status === 429;
}

function descrever(raciocinio: ThinkingConfig | undefined): string {
	if (!raciocinio) return 'o raciocínio padrão';
	if (raciocinio.thinkingLevel) return `o nível ${raciocinio.thinkingLevel}`;
	return `o orçamento de ${raciocinio.thinkingBudget} tokens`;
}

function motivo(erro: unknown): string {
	const e = erro as { status?: unknown; message?: unknown } | null;
	const status = typeof e?.status === 'number' ? `${e.status} ` : '';
	return `${status}${String(e?.message ?? erro)}`.slice(0, 500);
}
