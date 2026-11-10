import { resolve } from '$app/paths';
import { TRIAL } from '$lib/billing/catalogo';
import type { Publico } from './tipos';

/**
 * Os destinos das chamadas do blog, num lugar só (docs/blog.md "Conversão").
 * Cadastro e contato levam `?origem=blog-<slug>` (ou `blog`, fora de um
 * artigo): sem analytics ainda, é o que vai dizer de qual artigo veio o
 * cadastro e o pedido da escola. O formulário de contato repassa a origem no
 * aviso para a equipe.
 */

function origem(slug?: string): string {
	return slug ? `blog-${slug}` : 'blog';
}

export function linkDeCadastro(slug?: string): string {
	return `${resolve('/(auth)/cadastro')}?origem=${origem(slug)}`;
}

export function linkDaConversaComAEscola(slug?: string): string {
	return `${resolve('/(site)/contato')}?assunto=escolas&origem=${origem(slug)}`;
}

export interface Chamada {
	rotulo: string;
	href: string;
}

export interface Conversao {
	titulo: string;
	nota: string;
	primaria: Chamada;
	secundaria: Chamada;
}

/**
 * A conversão segue o público. Professor: criar a conta, com a atividade de
 * exemplo ao lado. Escola: a conversa sobre o plano da escola, com os planos ao
 * lado. Os dois: as duas conversões, a do professor primeiro.
 */
export function conversaoDoPublico(publico: Publico, slug?: string): Conversao {
	const exemplo = { rotulo: 'Responder a atividade de exemplo', href: resolve('/exemplo') };
	const cadastro = { rotulo: 'Criar a conta grátis', href: linkDeCadastro(slug) };
	const conversa = {
		rotulo: 'Conversar sobre o plano da escola',
		href: linkDaConversaComAEscola(slug)
	};
	if (publico === 'escola') {
		return {
			titulo: 'Leve o Spokke para a equipe da sua escola.',
			nota: 'Um contrato para a escola. A coordenação acompanha as turmas em números, sem ver o nome nem a resposta de um aluno.',
			primaria: conversa,
			secundaria: { rotulo: 'Ver os planos', href: resolve('/(site)/planos') }
		};
	}
	return {
		titulo: 'Monte a próxima atividade com o material que você já tem.',
		nota: `${TRIAL.dias} dias grátis. Seus alunos não criam conta.`,
		primaria: cadastro,
		secundaria: publico === 'ambos' ? conversa : exemplo
	};
}
