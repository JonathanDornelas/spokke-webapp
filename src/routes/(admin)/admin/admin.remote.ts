import { z } from 'zod';
import { command, getRequestEvent } from '$app/server';
import { requirePlatformAdmin } from '$lib/server/auth/guard';
import { admin } from '$lib/server/db/repos/admin';
import {
	ativarPlano,
	atenderPedido,
	cancelar,
	estenderTrial,
	reativar
} from '$lib/server/billing/assinaturas';
import { concederCreditos } from '$lib/server/billing/creditos';
import {
	PAPEIS,
	STATUS_DA_ESCOLA,
	convidarEEnviar,
	criarEscola,
	definirExcecao,
	editarEscola,
	removerDaEscola
} from '$lib/server/escola/escolas';
import { CICLOS, PLANOS_PAGOS } from '$lib/billing/catalogo';

/**
 * As escritas do painel interno. **Toda remote function é um endpoint HTTP
 * público** (regra nº 3) e não passa pelo `hooks.server.ts` — por isso cada uma
 * abre com `requirePlatformAdmin`, que responde 404 para quem não administra.
 *
 * Nenhuma escreve na cobrança direto: tudo passa por
 * `$lib/server/billing/assinaturas.ts`, com o ator `admin:<id>` — é o que faz o
 * histórico da conta dizer QUEM mudou o plano de alguém.
 */

function adminOf() {
	return requirePlatformAdmin(getRequestEvent().locals);
}

/** Uma data `AAAA-MM-DD` do formulário vira o FIM daquele dia, no fuso do Brasil. */
function fimDoDia(iso: string | undefined): Date | undefined {
	if (!iso) return undefined;
	const data = new Date(`${iso}T23:59:59-03:00`);
	return Number.isNaN(data.getTime()) ? undefined : data;
}

async function executar(fn: () => Promise<unknown>) {
	try {
		await fn();
		return { ok: true as const };
	} catch (e) {
		return { ok: false as const, error: e instanceof Error ? e.message : 'Não deu para concluir.' };
	}
}

const dataIso = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/)
	.optional();

export const ativarPlanoAdmin = command(
	z.object({
		teacherId: z.string(),
		plano: z.enum(PLANOS_PAGOS),
		ciclo: z.enum(CICLOS),
		ate: dataIso
	}),
	async ({ teacherId, plano, ciclo, ate }) => {
		const quem = adminOf();
		return executar(() =>
			ativarPlano(teacherId, { plano, ciclo, ate: fimDoDia(ate) }, `admin:${quem.id}`)
		);
	}
);

export const estenderTrialAdmin = command(
	z.object({ teacherId: z.string(), dias: z.number().int().min(-365).max(365) }),
	async ({ teacherId, dias }) => {
		const quem = adminOf();
		return executar(() => estenderTrial(teacherId, dias, `admin:${quem.id}`));
	}
);

export const cancelarAdmin = command(
	z.object({ teacherId: z.string(), noFimDoPeriodo: z.boolean() }),
	async ({ teacherId, noFimDoPeriodo }) => {
		const quem = adminOf();
		return executar(() => cancelar(teacherId, { noFimDoPeriodo }, `admin:${quem.id}`));
	}
);

export const reativarAdmin = command(z.object({ teacherId: z.string() }), async ({ teacherId }) => {
	const quem = adminOf();
	return executar(() => reativar(teacherId, `admin:${quem.id}`));
});

export const atenderPedidoAdmin = command(
	z.object({ pedidoId: z.string(), ate: dataIso }),
	async ({ pedidoId, ate }) => {
		const quem = adminOf();
		return executar(() => atenderPedido(pedidoId, quem.id, { ate: fimDoDia(ate) }));
	}
);

export const cancelarPedidoAdmin = command(
	z.object({ pedidoId: z.string() }),
	async ({ pedidoId }) => {
		const quem = adminOf();
		const ok = await admin(quem).cancelarPedido(pedidoId, quem.id);
		return ok
			? { ok: true as const }
			: { ok: false as const, error: 'Este pedido já foi resolvido.' };
	}
);

/** Créditos de cortesia: valem só no ciclo atual, como a franquia (adr-003-ia-gemini.md). */
export const concederCreditosAdmin = command(
	z.object({
		teacherId: z.string(),
		creditos: z.number().int().min(1).max(100_000),
		motivo: z.string().trim().max(200)
	}),
	async ({ teacherId, creditos, motivo }) => {
		const quem = adminOf();
		return executar(() => concederCreditos(teacherId, creditos, motivo, `admin:${quem.id}`));
	}
);

// ── Escolas (plano Scholar) — docs/adr-005-escola.md ──

const dadosDaEscola = z.object({
	name: z.string().trim().min(1).max(120),
	seats: z.number().int().min(1).max(10_000),
	atividadesPorProfessor: z.number().int().min(0).max(100_000),
	materiaisPorProfessor: z.number().int().min(0).max(1_000_000),
	creditosPorProfessor: z.number().int().min(0).max(1_000_000),
	contractEndsAt: dataIso,
	status: z.enum(STATUS_DA_ESCOLA).default('ativa')
});

export const criarEscolaAdmin = command(dadosDaEscola, async ({ contractEndsAt, ...dados }) => {
	const quem = adminOf();
	try {
		const escola = await criarEscola(
			{ ...dados, contractEndsAt: fimDoDia(contractEndsAt) ?? null },
			`admin:${quem.id}`
		);
		return { ok: true as const, id: escola.id };
	} catch (e) {
		return { ok: false as const, error: e instanceof Error ? e.message : 'Não deu para criar.' };
	}
});

export const editarEscolaAdmin = command(
	dadosDaEscola.extend({ schoolId: z.string() }),
	async ({ schoolId, contractEndsAt, ...dados }) => {
		const quem = adminOf();
		return executar(() =>
			editarEscola(
				schoolId,
				{ ...dados, contractEndsAt: fimDoDia(contractEndsAt) ?? null },
				`admin:${quem.id}`
			)
		);
	}
);

/** O primeiro coordenador (ou qualquer membro) convidado pelo painel. */
export const convidarParaEscolaAdmin = command(
	z.object({ schoolId: z.string(), email: z.string().trim().email(), role: z.enum(PAPEIS) }),
	async ({ schoolId, email, role }) => {
		adminOf();
		return convidarEEnviar(
			schoolId,
			email,
			role,
			'A equipe do Spokke',
			getRequestEvent().url.origin
		);
	}
);

const limiteOpcional = z.number().int().min(0).max(1_000_000).nullable();

export const definirExcecaoAdmin = command(
	z.object({
		membershipId: z.string(),
		atividadesMax: limiteOpcional,
		materiaisMax: limiteOpcional,
		creditosMax: limiteOpcional
	}),
	async ({ membershipId, ...limites }) => {
		const quem = adminOf();
		return executar(() => definirExcecao(membershipId, limites, `admin:${quem.id}`));
	}
);

export const removerDaEscolaAdmin = command(
	z.object({ schoolId: z.string(), teacherId: z.string() }),
	async ({ schoolId, teacherId }) => {
		const quem = adminOf();
		return removerDaEscola(schoolId, teacherId, `admin:${quem.id}`);
	}
);

export const reenfileirarJobAdmin = command(z.object({ jobId: z.string() }), async ({ jobId }) => {
	const quem = adminOf();
	const ok = await admin(quem).reenfileirarJob(jobId);
	return ok
		? { ok: true as const }
		: { ok: false as const, error: 'Este job não está mais falhado.' };
});
