import type { LayoutServerLoad } from './$types';
import { requireTeacher } from '$lib/server/auth/guard';
import { programacoes } from '$lib/server/db/repos/programacoes';
import { prisma } from '$lib/server/db/client';
import { acessoDoProfessor, resumoDoAcesso } from '$lib/server/billing/acesso';
import { ehCoordenacao } from '$lib/server/escola/guard';
import { avisarFimDoTrial } from '$lib/server/notificacoes';

// Só carrega dado de exibição — a barreira de verdade já rodou em
// hooks.server.ts antes deste load existir (auth.md: layout nunca é guarda).
// `requireTeacher` aqui não protege nada sozinho; só formata o DTO — nunca
// devolva a entidade do Teacher inteira para o browser (auth.md "Serialização").
export const load: LayoutServerLoad = async ({ locals }) => {
	const teacher = requireTeacher(locals);
	const initials = teacher.name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part[0]?.toUpperCase())
		.join('');

	// O card "Seu plano" da barra lateral: situação, uso do estoque e créditos.
	// Sai do MESMO estado que decide os bloqueios (`acessoDoProfessor` →
	// `can()`), nunca de uma comparação de status aqui (billing.md).
	const [acesso, coordena] = await Promise.all([
		acessoDoProfessor(teacher).then((estado) => resumoDoAcesso(estado)),
		// Só para MOSTRAR a entrada "Escola" — a barreira é `requireCoordenacao`.
		ehCoordenacao(teacher.id)
	]);

	// O aviso do fim do teste no sino (docs/notificacoes.md): três dias antes e no
	// último. Escrever num load é deliberado e idempotente — a chave é a data.
	if (acesso.origem === 'trial' && acesso.trialEndsAt && acesso.trialEndsAt > new Date()) {
		await avisarFimDoTrial(teacher.id, acesso.trialEndsAt, acesso.diasDeTrial ?? 99);
	}

	// Badge de "Resultados": respostas de escrita esperando o retorno do
	// professor. O critério é `reviewedAt` nulo, não `score: 0` — zero numa
	// resposta de rubrica é "ainda não corrigida", e pelo critério antigo a
	// resposta continuava contando depois de o professor ter dado nota zero a
	// ela. Escopado pelo professor dono da publicação.
	const aCorrigir = await prisma.attemptItem.count({
		where: {
			reviewedAt: null,
			item: {
				grading: { path: ['mode'], equals: 'rubric' },
				activityVersion: { activity: { teacherId: teacher.id } }
			}
		}
	});

	// Badge de "Módulos": turmas com um envio programado que não saiu.
	const modulosComFalha = await programacoes(teacher).comFalha();

	return {
		teacher: {
			initials: initials || '?',
			name: teacher.name,
			/** O avatar da conta (dezoito números, `$lib/avatar/`) — o ícone do professor no painel. */
			avatar: teacher.avatar ?? null,
			email: teacher.email,
			plan: acesso.rotulo
		},
		acesso,
		coordena,
		aCorrigir,
		modulosComFalha
	};
};
