import { createTransport, type Transporter } from 'nodemailer';
import type { EmailProvider } from './index';

/**
 * Envio por SMTP.
 *
 * **Por que SMTP e não a API de um provedor.** O convite é o único e-mail do
 * produto, e o professor que hospeda isto já tem um jeito de mandar e-mail —
 * Gmail com senha de app, o SMTP da hospedagem, Brevo, Resend, Mailgun, todos
 * falam SMTP. Escolher a API de um deles amarraria o produto a um fornecedor
 * para ganhar nada: não há webhook de entrega, nem template remoto, nem
 * segmentação. O HTML é montado aqui (`convite-aluno.ts`).
 *
 * `process.env` e NÃO `$env/dynamic/private`: o worker importa este módulo fora
 * do SvelteKit, e o alias `$env` não existe lá.
 */

let transporte: Transporter | null = null;

/**
 * A conexão, criada uma vez.
 *
 * Um transporte por e-mail refaria o handshake TLS a cada convite — numa turma
 * de trinta seriam trinta apertos de mão contra um.
 *
 * As opções de conexão vêm todas da URL, inclusive as de pool
 * (`?pool=true&maxConnections=2`): o nodemailer as lê da query string, e deixar
 * quem opera decidir é melhor do que fixar aqui um número que depende do
 * provedor — o Gmail corta quem abre muitos fluxos, um SMTP próprio não liga.
 */
function conexao(): Transporter {
	if (transporte) return transporte;

	const url = process.env.SMTP_URL;
	if (!url) {
		// Falhar aqui é melhor do que cair no log achando que enviou: o job vai
		// para `failed` e aparece para quem administra (server.md "Fila").
		throw new Error(
			'EMAIL_PROVIDER="smtp" exige SMTP_URL — algo como smtps://usuario:senha@smtp.exemplo.com:465'
		);
	}

	transporte = createTransport(url);
	return transporte;
}

/**
 * O remetente. Sai de `EMAIL_FROM` porque quase todo provedor exige que ele
 * seja um endereço verificado do domínio — não dá para derivar do professor,
 * que é quem MANDA mas não é quem assina o envelope. O nome do professor vai no
 * assunto e no corpo (`convite-aluno.ts`).
 */
function remetente(): string {
	return process.env.EMAIL_FROM || 'Spokke <nao-responda@localhost>';
}

export const smtpEmailProvider: EmailProvider = {
	async send(email) {
		await conexao().sendMail({
			from: remetente(),
			to: email.to,
			replyTo: email.replyTo,
			subject: email.subject,
			text: email.text,
			html: email.html,
			headers: {
				// A linha de pré-visualização já está no HTML; este cabeçalho é o
				// que alguns clientes usam para agrupar a conversa e o que evita o
				// convite cair como resposta de outra thread.
				'X-Entity-Ref-ID': crypto.randomUUID()
			}
		});
	}
};
