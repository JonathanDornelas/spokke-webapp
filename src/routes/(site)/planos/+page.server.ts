import type { PageServerLoad } from './$types';
import { nomeDoProvedor } from '$lib/server/billing';
import { acessoDoProfessor, resumoDoAcesso } from '$lib/server/billing/acesso';
import { planoEmVigor } from '$lib/server/billing/mercadopago/troca';
import { minhaAssinatura } from '$lib/server/db/repos/assinatura';
import { ehMotivo, type MotivoDoBloqueio } from '$lib/billing/motivos';
import { NOME_DO_PLANO, ehPlanoPago } from '$lib/billing/catalogo';

/**
 * A tela de planos. Ela é DOIS lugares ao mesmo tempo:
 *
 * 1. A página pública de preços, para quem quer comparar antes de assinar.
 * 2. **O destino de quem bateu numa porta fechada** — o trial acabou, chegou ao
 *    limite de atividades, pediu material com IA. Aí ela chega com `?motivo=`,
 *    e a primeira coisa na tela é a resposta para "por que eu vim parar aqui",
 *    não a tabela.
 *
 * Sem essa explicação a pessoa cai numa página de preços sem entender o que
 * pediu, e a leitura mais natural é a pior: "o produto quebrou e me jogou na
 * cobrança".
 *
 * **`motivo` é validado contra uma LISTA FECHADA** (`$lib/billing/motivos.ts`),
 * como o `?voltar=` da prévia: um parâmetro de query que vira texto na tela é
 * texto que qualquer pessoa escolhe.
 */
const MOTIVOS: Record<MotivoDoBloqueio, { titulo: string; texto: string }> = {
	publicar: {
		titulo: 'Seu plano não permite publicar agora',
		texto:
			'A atividade continua salva como rascunho — nada do que você montou foi perdido. O que falta é um plano em vigor para gerar o link da turma.'
	},
	trial: {
		titulo: 'O período de teste acabou',
		texto:
			'Nada foi apagado: suas atividades e materiais continuam aqui, e os links já publicados seguem abrindo e recebendo respostas. Para criar e publicar de novo, escolha um plano.'
	},
	criar: {
		titulo: 'Você chegou ao limite de atividades do seu plano',
		texto:
			'O limite conta as atividades que existem agora. Arquive uma que já foi usada — os resultados dela ficam — ou escolha um plano com mais espaço.'
	},
	materiais: {
		titulo: 'Sua biblioteca chegou ao limite de materiais',
		texto:
			'Apagar um material não mexe em nenhuma atividade, nem nas que estão no ar. Libere espaço na biblioteca ou escolha um plano com mais materiais.'
	},
	ia: {
		titulo: 'Gerar material com IA é dos planos Pro e Super',
		texto:
			'Digitar e colar a lista continuam liberados em qualquer plano — o que muda é a IA propor o material a partir de um pedido seu.'
	},
	creditos: {
		titulo: 'Os créditos de IA deste ciclo acabaram',
		texto:
			'Eles renovam no começo do próximo ciclo mensal. Até lá, digitar e colar a lista continuam liberados — ou escolha um plano com mais créditos.'
	},
	escola: {
		titulo: 'Este recurso é do ambiente da escola',
		texto:
			'Coordenação de professores e limites personalizados vêm no plano Scholar, contratado pela escola. Suas turmas e convites continuam como estão.'
	}
};

export const load: PageServerLoad = async ({ locals, url }) => {
	// Rota PÚBLICA: `locals.user` pode ser nulo, e é o caso mais comum aqui.
	// Quem está logado ganha o cartão do próprio plano marcado e os números do
	// próprio uso; quem não está vê a tabela limpa.
	const teacher = locals.user;
	const parametro = url.searchParams.get('motivo');
	const motivo = ehMotivo(parametro) ? parametro : null;
	const gateway = nomeDoProvedor() === 'mercadopago';

	if (!teacher) {
		return {
			motivo,
			motivos: MOTIVOS,
			planoAtual: null,
			acesso: null,
			pedido: null,
			logado: false,
			gateway,
			planoEmVigor: null,
			contaDaEquipe: false
		};
	}

	const [estado, pedido] = await Promise.all([
		acessoDoProfessor(teacher),
		minhaAssinatura(teacher).pedidoPendente()
	]);
	const acesso = resumoDoAcesso(estado);

	return {
		gateway,
		// Com o Mercado Pago, quem paga o plano de agora decide o botão de cada
		// cartão: o mesmo plano e ciclo não abrem checkout, e os outros TROCAM
		// (ciclo novo + devolução, `$lib/billing/troca.ts`).
		planoEmVigor: gateway ? await planoEmVigor(teacher.id, estado.origem) : null,
		// A conta da equipe tem o produto inteiro e não assina nada (billing.md).
		contaDaEquipe: acesso.origem === 'equipe',
		motivo,
		motivos: MOTIVOS,
		// "Seu plano agora" só para quem TEM um plano em vigor — o trial usa os
		// limites do básico, mas marcar o cartão do Básico como "seu" diria que
		// ele já assinou.
		planoAtual: acesso.origem === 'assinatura' ? acesso.plano : null,
		acesso,
		pedido:
			pedido && ehPlanoPago(pedido.plano)
				? { id: pedido.plano, nome: NOME_DO_PLANO[pedido.plano], ciclo: pedido.ciclo }
				: null,
		logado: true
	};
};
