import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import type { Actions, PageServerLoad } from './$types';
import { enqueueAvisoEquipe } from '$lib/server/queue';
import { criarLimite } from '$lib/server/limite-por-ip';

/**
 * O formulário de contato. A mensagem vira um AVISO para a equipe (job
 * `aviso-equipe`, para `CONTATO_PARA`), com o e-mail de quem escreveu no
 * Reply-To — quem lê responde direto. Pela fila, e não na requisição: provedor
 * fora do ar vira retentativa, não erro na tela de quem escreveu.
 *
 * É também a porta de entrada do plano Scholar ("Falar sobre a escola"), então
 * `?assunto=escolas` chega com o assunto já escolhido.
 *
 * Duas defesas, porque cada mensagem é um e-mail e o plano grátis do Resend dá
 * 100 por dia: um campo-isca escondido (robô preenche tudo) e um limite por IP.
 */

const ASSUNTOS = [
	'Dúvida sobre a plataforma',
	'Problema técnico',
	'Problema com uma turma em aula agora',
	'Escolas e redes',
	'Privacidade e dados'
] as const;

const ATALHOS: Record<string, (typeof ASSUNTOS)[number]> = { escolas: 'Escolas e redes' };

const limite = criarLimite({ maximo: 5, janelaMs: 60 * 60 * 1000 });

const contatoSchema = z.object({
	nome: z.string().trim().min(1, 'Preencha nome, e-mail e mensagem.').max(120),
	email: z.string().trim().email('Esse e-mail não parece válido.').max(200),
	assunto: z.enum(ASSUNTOS).catch('Dúvida sobre a plataforma'),
	mensagem: z.string().trim().min(1, 'Preencha nome, e-mail e mensagem.').max(5_000)
});

export const load: PageServerLoad = ({ url }) => {
	const atalho = url.searchParams.get('assunto');
	return { assunto: (atalho && ATALHOS[atalho]) || ASSUNTOS[0], assuntos: [...ASSUNTOS] };
};

export const actions: Actions = {
	default: async ({ request, getClientAddress }) => {
		const data = await request.formData();

		// Campo-isca: invisível para pessoas, irresistível para robô. Preenchido,
		// a resposta finge sucesso — avisar o robô ensinaria a contornar.
		if (String(data.get('site') ?? '').trim()) return { ok: true };

		if (!limite.permitir(getClientAddress())) {
			return fail(429, {
				ok: false,
				error: 'Muitas mensagens em pouco tempo. Tente de novo mais tarde.'
			});
		}

		const lido = contatoSchema.safeParse({
			nome: data.get('nome'),
			email: data.get('email'),
			assunto: data.get('assunto'),
			mensagem: data.get('mensagem')
		});
		if (!lido.success) {
			return fail(400, { ok: false, error: lido.error.issues[0]?.message ?? 'Confira os campos.' });
		}
		const { nome, email, assunto, mensagem } = lido.data;

		await enqueueAvisoEquipe({
			assunto: `[contato] ${assunto} — ${nome}`,
			texto: [`De: ${nome} <${email}>`, `Assunto: ${assunto}`, '', mensagem].join('\n'),
			replyTo: email
		});
		return { ok: true };
	}
};
