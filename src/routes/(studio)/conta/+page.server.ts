import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import type { Actions, PageServerLoad } from './$types';
import { requireTeacher } from '$lib/server/auth/guard';
import { acessoDoProfessor, resumoDoAcesso } from '$lib/server/billing/acesso';
import { minhaAssinatura } from '$lib/server/db/repos/assinatura';
import { contaProfessor } from '$lib/server/db/repos/teachers';
import { textoDoEvento } from '$lib/billing/auditoria';
import { NOME_DO_PLANO, ehPlanoPago } from '$lib/billing/catalogo';
import { prisma } from '$lib/server/db/client';
import { nomeDoProvedor } from '$lib/server/billing';
import { sincronizarPendentes } from '$lib/server/billing/mercadopago/sincronizar';
import { tokenDoMercadoPago } from '$lib/server/billing/mercadopago/cliente';

/**
 * Conta E assinatura, numa tela só com duas abas. Precisa de loader próprio
 * mesmo sendo simples: o layout do Studio já publica uma chave `teacher`
 * (iniciais, nome, plano) com OUTRA forma, e sem este load a página receberia
 * aquela e mostraria o e-mail vazio.
 *
 * DTO explícito — nunca a entidade inteira do professor (auth.md
 * "Serialização"): os campos de cobrança e as assinaturas no gateway ficam aqui.
 *
 * O estado da assinatura sai de `acessoDoProfessor` → `can()`, a MESMA decisão
 * que barra criar e publicar (billing.md "Entitlements"). Antes havia aqui um
 * `estadoDoPlano` próprio que transformava qualquer status desconhecido em
 * "trial" — inclusive uma assinatura expirada.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	const teacher = requireTeacher(locals);
	const repo = minhaAssinatura(teacher);
	const provedor = nomeDoProvedor();

	// A volta do checkout do Mercado Pago (`back_url`). O redirect não é a
	// verdade (billing.md): aqui só se RELÊ no provedor, e a tela diz o que ele
	// respondeu — "confirmando" enquanto ele não autoriza. Antes do resto, para o
	// estado da conta já sair com a ativação, se ela aconteceu.
	const checkout =
		url.searchParams.get('checkout') === 'mercadopago' && tokenDoMercadoPago()
			? await sincronizarPendentes(teacher.id)
			: null;

	const [estado, pedido, eventos, perfil, turmas, alunos] = await Promise.all([
		acessoDoProfessor(teacher),
		repo.pedidoPendente(),
		repo.historico(),
		contaProfessor(teacher).perfil(),
		// Contagens do cabeçalho — agregado do próprio professor, escopado (db.md).
		prisma.classroom.count({ where: { teacherId: teacher.id } }),
		prisma.student.count({ where: { teacherId: teacher.id } })
	]);

	return {
		// A aba vem da URL para a barra lateral continuar apontando para a
		// assinatura: `/assinatura` redireciona para cá com `?aba=assinatura`.
		aba: url.searchParams.get('aba') === 'assinatura' ? 'assinatura' : 'dados',
		teacher: {
			name: teacher.name,
			email: teacher.email,
			// Troca de e-mail com confirmação pendente ainda não existe.
			pendingEmail: null,
			/** Dezoito números, ou nulo para cair nas iniciais (`$lib/avatar/montar.ts`). */
			avatar: teacher.avatar ?? null,
			/** O que ele ensina e a língua dos alunos — os PADRÕES das telas de criar. */
			idiomas: perfil.idiomas,
			idiomaDosAlunos: perfil.idiomaDosAlunos,
			desde: perfil.desde
		},
		contagens: { turmas, alunos },
		acesso: resumoDoAcesso(estado),
		cobranca: {
			provedor,
			// No Mercado Pago, cancelada é cancelada: o caminho de volta é assinar de novo.
			podeDesfazerCancelamento: provedor === 'manual'
		},
		checkout: checkout
			? {
					status: checkout.status,
					plano: ehPlanoPago(checkout.plano) ? NOME_DO_PLANO[checkout.plano] : checkout.plano
				}
			: null,
		pedido: pedido
			? {
					plano: ehPlanoPago(pedido.plano) ? NOME_DO_PLANO[pedido.plano] : pedido.plano,
					ciclo: pedido.ciclo,
					quando: pedido.createdAt
				}
			: null,
		historico: eventos.map((e) => ({
			id: e.id,
			texto: textoDoEvento(e.type, e.data),
			quando: e.createdAt
		}))
	};
};

export const actions: Actions = {
	/**
	 * "Seus dados": o NOME (o que aparece para os alunos no convite), os idiomas
	 * que ele ensina e a língua dos alunos. O e-mail é a credencial de entrada e
	 * trocá-lo pede confirmação no endereço novo, que ainda não existe; por isso
	 * ele não é lido aqui. Idioma fora da lista do produto é descartado no
	 * repositório — o corpo do pedido é do navegador.
	 */
	profile: async ({ locals, request }) => {
		const teacher = requireTeacher(locals);
		const form = await request.formData();
		const lido = z
			.object({
				name: z.string().trim().min(1, 'Escreva o seu nome.').max(120, 'Nome longo demais.'),
				idiomas: z.array(z.string().max(20)).max(20),
				idiomaDosAlunos: z.string().max(20)
			})
			.safeParse({
				name: form.get('name'),
				idiomas: form.getAll('idiomas'),
				idiomaDosAlunos: form.get('idiomaDosAlunos') ?? 'pt-BR'
			});
		if (!lido.success)
			return fail(400, { erro: lido.error.issues[0]?.message ?? 'Confira os campos.' });
		await contaProfessor(teacher).gravarPerfil(lido.data);
		return { salvo: true };
	}
};
