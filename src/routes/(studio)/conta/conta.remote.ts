import { z } from 'zod';
import { command, getRequestEvent } from '$app/server';
import { requireTeacher } from '$lib/server/auth/guard';
import { getBillingProvider } from '$lib/server/billing';
import { acessoDoProfessor } from '$lib/server/billing/acesso';
import { cancelar, reativar } from '$lib/server/billing/assinaturas';
import { minhaAssinatura } from '$lib/server/db/repos/assinatura';
import { contaProfessor } from '$lib/server/db/repos/teachers';
import { removerDaEscola } from '$lib/server/escola/escolas';
import { CICLOS, PLANOS_PAGOS } from '$lib/billing/catalogo';

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
 * "Assinar" um plano. Sem gateway (docs/adr-002-billing.md), o provedor manual
 * registra o pedido e avisa a equipe; com gateway, a resposta seria a URL do
 * checkout. A tela trata as duas formas — e nenhuma delas libera nada: quem
 * libera é o painel (manual) ou o webhook (gateway).
 */
export const solicitarPlano = command(
	z.object({ plano: z.enum(PLANOS_PAGOS), ciclo: z.enum(CICLOS) }),
	async ({ plano, ciclo }) => {
		const teacher = teacherOf();
		const resultado = await getBillingProvider().iniciarAssinatura(
			{ id: teacher.id, name: teacher.name, email: teacher.email },
			plano,
			ciclo,
			{ origem: getRequestEvent().url.origin }
		);
		return resultado.tipo === 'redirecionar'
			? { tipo: 'redirecionar' as const, url: resultado.url }
			: { tipo: 'pedido' as const };
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
