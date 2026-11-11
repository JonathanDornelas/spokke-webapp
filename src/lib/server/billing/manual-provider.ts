import { prisma } from '$lib/server/db/client';
import { enqueueAvisoEquipe } from '$lib/server/queue';
import { NOME_DO_PLANO } from '$lib/billing/catalogo';
import { registrar } from './assinaturas';
import type { BillingProvider } from './provider';

/**
 * O provedor MANUAL — o que existe enquanto não há gateway de pagamento
 * (docs/adr-002-billing.md). "Assinar" vira um `PlanRequest` e um aviso para a
 * equipe; a equipe combina o pagamento fora do sistema e atende o pedido pelo
 * painel interno, que é quem ativa o plano (`atenderPedido`).
 *
 * Um pedido PENDENTE por professor: pedir outro plano substitui o anterior, em
 * vez de empilhar três pedidos que a equipe teria de adivinhar qual vale.
 */
export const manualBillingProvider: BillingProvider = {
	nome: 'manual',
	podeDesfazerCancelamento: true,

	async iniciarAssinatura(teacher, plano, ciclo) {
		const pedido = await prisma.$transaction(async (tx) => {
			await tx.planRequest.updateMany({
				where: { teacherId: teacher.id, status: 'pendente' },
				data: { status: 'cancelado', resolvedAt: new Date() }
			});
			const criado = await tx.planRequest.create({
				data: { teacherId: teacher.id, plano, ciclo }
			});
			await registrar(tx, {
				teacherId: teacher.id,
				actor: 'professor',
				type: 'plano_solicitado',
				data: { plano, ciclo, pedidoId: criado.id }
			});
			// Na MESMA transação: pedido sem aviso seria um pedido que ninguém vê
			// até abrir o painel.
			await enqueueAvisoEquipe(
				{
					assunto: `Pedido de plano: ${NOME_DO_PLANO[plano]} (${ciclo}) — ${teacher.name}`,
					texto: [
						`${teacher.name} <${teacher.email}> pediu o plano ${NOME_DO_PLANO[plano]}, ciclo ${ciclo}.`,
						'',
						'Combine o pagamento e atenda o pedido em /admin/pedidos — é isso que ativa o plano.'
					].join('\n'),
					replyTo: teacher.email
				},
				tx
			);
			return criado;
		});
		return { tipo: 'pedido', pedidoId: pedido.id };
	},

	async abrirPortal() {
		return { tipo: 'indisponivel' };
	},

	// Sem gateway não há cobrança automática a parar: a equipe só não renova.
	async cancelarRenovacao() {}
};
