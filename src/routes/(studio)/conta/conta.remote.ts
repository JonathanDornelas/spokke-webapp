import { z } from 'zod';
import { command, getRequestEvent } from '$app/server';
import { requireTeacher } from '$lib/server/auth/guard';
import { getBillingProvider, nomeDoProvedor } from '$lib/server/billing';
import { acessoDoProfessor } from '$lib/server/billing/acesso';
import { cancelar, reativar } from '$lib/server/billing/assinaturas';
import { planoEmVigor } from '$lib/server/billing/mercadopago/troca';
import { minhaAssinatura } from '$lib/server/db/repos/assinatura';
import { contaProfessor } from '$lib/server/db/repos/teachers';
import { removerDaEscola } from '$lib/server/escola/escolas';
import { CICLOS, PLANOS_PAGOS } from '$lib/billing/catalogo';
import { ehOPlanoEmVigor } from '$lib/billing/troca';

/**
 * As ações do professor sobre a PRÓPRIA assinatura. Toda remote function é um
 * endpoint HTTP público (regra nº 3): o id vem da SESSÃO, nunca do corpo — um
 * `teacherId` no input deixaria qualquer pessoa pedir ou cancelar o plano de
 * outra.
 */

function teacherOf() {
	return requireTeacher(getRequestEvent().locals);
}

/**
 * "Assinar" um plano — ou TROCAR, quando já há um. Sem gateway
 * (docs/adr-002-billing.md), o provedor manual registra o pedido e avisa a
 * equipe; com o Mercado Pago, a resposta é a URL do checkout. Nenhuma das duas
 * libera nada: quem libera é o painel (manual) ou a autorização do provedor.
 *
 * Com o Mercado Pago, trocar é assinar de novo (billing.md "Troca de plano"): o
 * checkout cobra o plano novo por inteiro e, autorizado, um job cancela lá a
 * assinatura antiga e devolve a parte não usada dela. Duas portas fecham aqui,
 * pela mesma regra da tela (`$lib/billing/troca.ts`): o plano e o ciclo que já
 * renovam sozinhos — seriam duas assinaturas iguais, a segunda cobrada por
 * inteiro — e a conta da equipe, que tem o produto inteiro sem assinatura.
 *
 * A recusa do provedor volta como `erro` com a frase da tela, e o motivo de
 * verdade vai para o log do web.
 */
export const solicitarPlano = command(
	z.object({ plano: z.enum(PLANOS_PAGOS), ciclo: z.enum(CICLOS) }),
	async ({ plano, ciclo }) => {
		const teacher = teacherOf();
		const estado = await acessoDoProfessor(teacher);
		if (estado.origem === 'equipe') {
			return {
				tipo: 'erro' as const,
				mensagem: 'A conta da equipe já tem o produto inteiro, sem assinatura.'
			};
		}
		const gateway = nomeDoProvedor() === 'mercadopago';
		if (gateway && ehOPlanoEmVigor(await planoEmVigor(teacher.id, estado.origem), plano, ciclo)) {
			return {
				tipo: 'erro' as const,
				mensagem: 'Você já está neste plano, e ele renova sozinho pelo Mercado Pago.'
			};
		}
		try {
			const resultado = await getBillingProvider().iniciarAssinatura(
				{ id: teacher.id, name: teacher.name, email: teacher.email },
				plano,
				ciclo,
				{ origem: getRequestEvent().url.origin }
			);
			return resultado.tipo === 'redirecionar'
				? { tipo: 'redirecionar' as const, url: resultado.url }
				: { tipo: 'pedido' as const };
		} catch (err) {
			console.error('[cobrança] não deu para abrir a assinatura', err);
			return {
				tipo: 'erro' as const,
				mensagem: gateway
					? 'O Mercado Pago não abriu o pagamento agora. Tente de novo em instantes.'
					: 'Não deu para enviar o pedido agora. Tente de novo em instantes.'
			};
		}
	}
);

export const cancelarPedido = command(async () => {
	const teacher = teacherOf();
	return { ok: await minhaAssinatura(teacher).cancelarPedido() };
});

/**
 * Cancelar NO FIM DO PERÍODO — quem pagou o mês usa o mês. É a única forma de
 * cancelar que o professor tem sozinho; encerrar na hora é decisão da equipe
 * (estorno, contrato). Só faz sentido com assinatura em vigor.
 */
export const agendarCancelamento = command(async () => {
	const teacher = teacherOf();
	const estado = await acessoDoProfessor(teacher);
	if (estado.origem !== 'assinatura' || estado.cancelAtPeriodEnd) {
		return { ok: false as const, error: 'Não há assinatura em vigor para cancelar.' };
	}
	// O provedor PRIMEIRO: se o Mercado Pago recusar, nada muda aqui — marcar
	// "cancelada" com o cartão ainda sendo cobrado seria o pior dos dois mundos.
	try {
		await getBillingProvider().cancelarRenovacao(teacher.id);
	} catch (err) {
		console.warn('[cobrança] cancelar no provedor', err);
		return {
			ok: false as const,
			error: 'Não deu para cancelar no Mercado Pago agora. Nada mudou — tente de novo em instantes.'
		};
	}
	await cancelar(teacher.id, { noFimDoPeriodo: true }, 'professor');
	return { ok: true as const };
});

/**
 * Sair da escola. O conteúdo fica com o professor; o que muda é que o contrato
 * da escola deixa de valer para ele e ele volta ao próprio plano. A última
 * pessoa da coordenação não sai por aqui — a escola ficaria sem quem convide.
 */
export const sairDaEscola = command(async () => {
	const teacher = teacherOf();
	const estado = await acessoDoProfessor(teacher);
	if (!estado.escola) return { ok: false as const, error: 'Você não faz parte de uma escola.' };
	return removerDaEscola(estado.escola.id, teacher.id, 'professor');
});

export const desfazerCancelamento = command(async () => {
	const teacher = teacherOf();
	const estado = await acessoDoProfessor(teacher);
	if (!estado.cancelAtPeriodEnd) {
		return { ok: false as const, error: 'Não há cancelamento agendado.' };
	}
	if (!getBillingProvider().podeDesfazerCancelamento) {
		return {
			ok: false as const,
			error:
				'No Mercado Pago, a assinatura cancelada não volta. Assine de novo pelos planos quando quiser.'
		};
	}
	await reativar(teacher.id, 'professor');
	return { ok: true as const };
});

/**
 * Os idiomas que o professor ensina, escolhidos NO CADASTRO — a tela de criar
 * conta chama logo depois do `signUp` (o cookie de sessão já existe). Não passa
 * pelo Better Auth de propósito: campo declarado lá viria do corpo do cadastro,
 * e aqui o repositório filtra pela lista de idiomas do produto. O id vem da
 * sessão, como em toda função deste arquivo.
 */
export const gravarMeusIdiomas = command(
	z.object({ idiomas: z.array(z.string().max(20)).max(20) }),
	async ({ idiomas }) => ({
		ok: true as const,
		idiomas: await contaProfessor(teacherOf()).gravarIdiomas(idiomas)
	})
);
