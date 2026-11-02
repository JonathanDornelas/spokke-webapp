/**
 * Os planos como a VITRINE os mostra, num arquivo só — o texto nunca fica solto
 * numa rota (paginas.md "Grupo (site)"). A home e `/planos` leem daqui.
 *
 * **Os NÚMEROS não moram aqui.** Atividades, materiais e créditos de cada plano
 * saem de `$lib/billing/catalogo.ts` — o mesmo arquivo que `can()` usa para
 * decidir acesso —, então o que a tabela PROMETE e o que a conta PODE fazer não
 * têm como divergir. `catalogo.test.ts` confere isso.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ OS PREÇOS SÃO PLACEHOLDER. Valor e ciclo NÃO FORAM DECIDIDOS — são   │
 * │ pendência de produto (CLAUDE.md "Pendências", adr-002-billing.md).   │
 * │ Não há gateway de pagamento: "Assinar" registra um PEDIDO que a      │
 * │ equipe atende pelo painel interno.                                   │
 * └──────────────────────────────────────────────────────────────────────┘
 */
import {
	LIMITES,
	NOME_DO_PLANO,
	TRIAL,
	type CicloDeCobranca,
	type PlanoId
} from '$lib/billing/catalogo';

/** Marca para o desenvolvedor: nenhum PREÇO deste arquivo foi aprovado. */
export const PRECOS_SAO_PLACEHOLDER = true;

export type { CicloDeCobranca, PlanoId };

export interface Recurso {
	label: string;
	/** Falso desenha o traço apagado, não um X vermelho: é ausência, não erro. */
	incluso: boolean;
}

export interface Plano {
	id: PlanoId;
	nome: string;
	/** Para quem é, em três palavras. Vai sob o nome. */
	para: string;
	/** Ícone: a tela escolhe o desenho. */
	icone: 'person' | 'spark' | 'bolt' | 'school';
	/** Preço por ciclo, já formatado — é texto de tela, não número de conta. */
	preco: Record<CicloDeCobranca, string>;
	/** A unidade ao lado do preço: "por mês", "por professor / mês". */
	unidade: string;
	/** A letra miúda do preço. Muda com o ciclo quando o anual tem outra regra. */
	nota: Record<CicloDeCobranca, string>;
	listaTitulo: string;
	recursos: Recurso[];
	cta: string;
	/** A linha sob o botão — o que acontece depois de clicar. */
	ctaNota: string;
	/** Um só por tabela: o plano em destaque. */
	destaque?: string;
	/** Contratado pela escola, não assinado pelo professor: o CTA leva ao contato. */
	porContrato?: boolean;
}

const fmt = (n: number) => n.toLocaleString('pt-BR');

/** As linhas de limite de um plano pago, escritas a partir do catálogo. */
function limites(id: 'basico' | 'pro' | 'super'): Recurso[] {
	const l = LIMITES[id];
	return [
		{ label: `Até ${fmt(l.atividades)} atividades ao mesmo tempo`, incluso: true },
		{ label: `Até ${fmt(l.materiais)} materiais na biblioteca`, incluso: true },
		l.ia
			? { label: `${fmt(l.creditosPorCiclo)} créditos de IA por mês`, incluso: true }
			: { label: 'Materiais gerados com IA', incluso: false }
	];
}

const COMUM: Recurso[] = [
	{ label: 'Escuta, fala, leitura e escrita', incluso: true },
	{ label: 'Turmas e convites por e-mail', incluso: true }
];

export const planos: readonly Plano[] = [
	{
		id: 'basico',
		nome: NOME_DO_PLANO.basico,
		para: 'para começar a dar aula',
		icone: 'person',
		preco: { mensal: 'R$ 29', anual: 'R$ 24' },
		unidade: 'por mês',
		nota: {
			mensal: `Começa com ${TRIAL.dias} dias de teste. Tudo menos a IA.`,
			anual: 'R$ 290 por ano, cobrados de uma vez. Equivale a dez meses.'
		},
		listaTitulo: 'O que você pode fazer',
		recursos: [...limites('basico'), ...COMUM],
		cta: 'Assinar o Básico',
		ctaNota: 'A equipe confirma o pagamento e ativa o plano.'
	},
	{
		id: 'pro',
		nome: NOME_DO_PLANO.pro,
		para: 'para quem dá aula toda semana',
		icone: 'spark',
		preco: { mensal: 'R$ 49', anual: 'R$ 41' },
		unidade: 'por mês',
		nota: {
			mensal: 'Cobrado mensalmente. Cancela quando quiser, sem multa.',
			anual: 'R$ 490 por ano, cobrados de uma vez. Equivale a dez meses.'
		},
		listaTitulo: 'Tudo do Básico, mais',
		recursos: [...limites('pro'), ...COMUM],
		cta: 'Assinar o Pro',
		ctaNota: 'A equipe confirma o pagamento e ativa o plano.',
		destaque: 'O mais escolhido'
	},
	{
		id: 'super',
		nome: NOME_DO_PLANO.super,
		para: 'para várias turmas e idiomas',
		icone: 'bolt',
		preco: { mensal: 'R$ 89', anual: 'R$ 74' },
		unidade: 'por mês',
		nota: {
			mensal: 'Cobrado mensalmente. Cancela quando quiser, sem multa.',
			anual: 'R$ 890 por ano, cobrados de uma vez. Equivale a dez meses.'
		},
		listaTitulo: 'Tudo do Pro, mais',
		recursos: [...limites('super'), ...COMUM],
		cta: 'Assinar o Super',
		ctaNota: 'A equipe confirma o pagamento e ativa o plano.'
	},
	{
		id: 'scholar',
		nome: NOME_DO_PLANO.scholar,
		para: 'para escolas e redes',
		icone: 'school',
		preco: { mensal: 'Sob proposta', anual: 'Sob proposta' },
		unidade: 'por contrato',
		nota: {
			mensal: 'Limites personalizados por escola e por professor. Uma fatura só.',
			anual: 'Limites personalizados por escola e por professor. Uma fatura só.'
		},
		listaTitulo: 'Para a escola',
		recursos: [
			{ label: 'Limites definidos no contrato', incluso: true },
			{ label: 'Professores convidados pela coordenação', incluso: true },
			{ label: 'Painel da coordenação com o uso de cada professor', incluso: true },
			{ label: 'Números por turma, sem expor nome de aluno', incluso: true },
			{ label: 'Uma fatura só, no nome da escola', incluso: true }
		],
		cta: 'Falar sobre a escola',
		ctaNota: 'A gente responde com uma proposta pelo número de professores.',
		porContrato: true
	}
];

/** O que não muda de plano — vai no rodapé da tabela. */
export const garantias: readonly string[] = [
	'Cancela quando quiser',
	'Links publicados nunca saem do ar',
	'Nada é apagado quando o plano vence'
];

export const tituloPadrao = 'Um preço por professor, sem cobrar do aluno';
export const ledePadrao =
	'O que muda entre os planos é quanto você guarda e quanto a IA te ajuda. O que os alunos veem é igual em todos.';

/**
 * A promessa que vale em qualquer plano, e que é desenho de produto e não
 * cortesia: a cobrança mexe no lado do PROFESSOR. É a regra que `can()`
 * implementa (billing.md "Degradação, não desligamento").
 */
export const alunoNaoPaga = {
	titulo: 'O aluno nunca paga, nem precisa de conta',
	texto:
		'Em qualquer plano, quem responde entra pelo link, pelo QR ou pelo código. Se o seu plano vencer, as atividades já publicadas continuam abrindo e recebendo respostas. O que pausa é criar e publicar, do seu lado.'
};

/** No anual, dois meses saem de graça — o selo ao lado do seletor de ciclo. */
export const vantagemDoAnual = 'No anual, dois meses saem de graça';
