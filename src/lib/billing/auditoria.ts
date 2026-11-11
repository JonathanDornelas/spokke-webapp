import { z } from 'zod';
import { NOME_DO_PLANO, ehPlanoPago } from './catalogo';

/**
 * A frase de cada evento de auditoria (`AuditEvent`), para a aba de assinatura
 * do professor e para o painel interno. Isomórfico; o `data` é JSON do banco e
 * passa pelo Zod antes de virar texto (db.md "JSON no Postgres").
 */

const dadosSchema = z
	.object({
		de: z.string().nullable(),
		para: z.string(),
		plano: z.string(),
		ciclo: z.string(),
		ate: z.string(),
		dias: z.number(),
		creditos: z.number(),
		motivo: z.string(),
		trialEndsAt: z.string()
	})
	.partial();

function nomeDoPlano(id: string | null | undefined): string {
	return ehPlanoPago(id) ? NOME_DO_PLANO[id] : 'sem plano';
}

function dataCurta(iso: string | undefined): string {
	if (!iso) return '';
	const d = new Date(iso);
	return Number.isNaN(d.getTime())
		? ''
		: d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function textoDoEvento(tipo: string, dadosBrutos: unknown): string {
	const lido = dadosSchema.safeParse(dadosBrutos);
	const d = lido.success ? lido.data : {};
	switch (tipo) {
		case 'trial_iniciado':
			return 'Período de teste começou';
		case 'trial_migrado':
			return `Período de teste definido até ${dataCurta(d.trialEndsAt)}`;
		case 'trial_estendido':
			return `Período de teste estendido até ${dataCurta(d.para)}`;
		case 'trial_encerrado':
			return 'Período de teste encerrado';
		case 'plano_solicitado':
			return `Pedido do plano ${nomeDoPlano(d.plano)} (${d.ciclo ?? 'mensal'})`;
		case 'checkout_iniciado':
			return `Checkout do plano ${nomeDoPlano(d.plano)} (${d.ciclo ?? 'mensal'}) aberto no Mercado Pago`;
		case 'plano_ativado':
			return d.de && d.de !== d.para
				? `Plano trocado de ${nomeDoPlano(d.de)} para ${nomeDoPlano(d.para)}, até ${dataCurta(d.ate)}`
				: `Plano ${nomeDoPlano(d.para)} ativo até ${dataCurta(d.ate)}`;
		case 'plano_sem_vencimento':
			return `Plano ${nomeDoPlano(d.para)} sem vencimento, concedido pela equipe${d.motivo ? `: ${d.motivo}` : ''}`;
		case 'sem_vencimento_encerrado':
			return `Plano sem vencimento encerrado pela equipe${d.motivo ? `: ${d.motivo}` : ''}`;
		case 'cancelamento_agendado':
			return 'Cancelamento agendado para o fim do período';
		case 'cancelamento_desfeito':
			return 'Cancelamento desfeito';
		case 'cancelado':
			return 'Assinatura encerrada';
		case 'creditos_concedidos':
			return `${d.creditos ?? 0} créditos de cortesia${d.motivo ? ` — ${d.motivo}` : ''}`;
		case 'escola_entrou':
			return 'Entrou numa escola';
		case 'escola_saiu':
			return 'Saiu da escola';
		default:
			return tipo.replaceAll('_', ' ');
	}
}
