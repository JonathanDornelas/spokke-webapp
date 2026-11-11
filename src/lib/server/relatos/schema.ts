import { z } from 'zod';
import { MOTIVOS } from '$lib/relatos';

/**
 * O que o NAVEGADOR manda num relato de problema. É endpoint público (regra nº
 * 3), então tudo tem teto: tamanho de texto, quantidade de entradas, e o JSON
 * livre (a resposta que estava na tela, o veredito que ela mostrava) com limite
 * de caracteres. O que o servidor acrescenta — a questão, o gabarito, a
 * correção refeita — não vem daqui: sai do banco (`./index.ts`).
 */

const texto = (max: number) => z.string().max(max);

/** JSON livre, mas com teto: o que não cabe em `max` caracteres é recusado. */
const jsonPequeno = (max: number) =>
	z.unknown().refine((valor) => {
		try {
			return JSON.stringify(valor ?? null).length <= max;
		} catch {
			return false;
		}
	}, `Grande demais (máximo de ${max} caracteres).`);

/** O aparelho e o navegador — o que ajuda a reproduzir o erro, nada que identifique o aluno. */
export const aparelhoSchema = z.object({
	navegador: texto(400),
	idiomas: z.array(texto(40)).max(10),
	plataforma: texto(80).optional(),
	celular: z.boolean().optional(),
	tela: z.object({ largura: z.number(), altura: z.number(), dpr: z.number() }),
	janela: z.object({ largura: z.number(), altura: z.number() }),
	orientacao: texto(40).optional(),
	toque: z.number().int().min(0).max(32),
	online: z.boolean(),
	conexao: z
		.object({
			tipo: texto(20).optional(),
			mbps: z.number().optional(),
			economia: z.boolean().optional()
		})
		.optional(),
	memoriaGb: z.number().optional(),
	fuso: texto(64),
	horaLocal: texto(80),
	tema: texto(20).optional(),
	menosMovimento: z.boolean(),
	volume: z.number().min(0).max(1).optional(),
	/** A versão do app que estava no navegador (pode ser mais velha que a do servidor). */
	versao: texto(64),
	caminho: texto(300)
});

/** O estado da questão na hora do relato. */
export const telaSchema = z.object({
	/** A resposta que estava NA TELA (pode ainda não ter sido enviada). */
	respostaNaTela: jsonPequeno(6000),
	/** O veredito que a tela mostrava, quando mostrava. */
	feedbackNaTela: jsonPequeno(6000).optional(),
	jaRespondida: z.boolean(),
	verificando: z.boolean(),
	tecladoAberto: z.boolean(),
	audioTocado: z.number().int().min(0).max(10_000),
	/** O estado do microfone, nas questões de fala. */
	gravacao: texto(20).optional(),
	/** O que o serviço entendeu da gravação, antes de enviar. */
	ouvido: texto(600).nullable().optional(),
	msNaQuestao: z.number().int().min(0)
});

/** Uma linha do diário da tela: erros do navegador, arquivos que não carregaram, passos. */
export const entradaDoDiarioSchema = z.object({
	em: z.number(),
	tipo: texto(40),
	texto: texto(800)
});

export const relatoSchema = z.object({
	attemptId: z.string().min(1).max(64),
	itemId: z.string().min(1).max(64),
	motivo: z.enum(MOTIVOS),
	descricao: z.string().trim().max(1000).optional(),
	tela: telaSchema,
	aparelho: aparelhoSchema,
	diario: z.array(entradaDoDiarioSchema).max(30)
});

export type RelatoDoCliente = z.infer<typeof relatoSchema>;
