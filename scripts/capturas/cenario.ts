/**
 * O CENÁRIO das capturas de tela da propaganda (docs/propaganda/captura-das-telas.md), montado no
 * banco de DESENVOLVIMENTO. Nada aqui roda em produção: o seed recusa `NODE_ENV=production`, e
 * tudo é fictício (e-mails em `exemplo.invalid`, que não entrega para ninguém).
 *
 * - A professora de demonstração, Marina Couto, no plano Super, com o semestre do seed.
 * - Uma conta de ALUNA com senha, a Ana Ribeiro, ligada a uma ficha do 8º A: as contas de aluno do
 *   seed não têm senha, e o mapa do módulo só aparece para quem entra com a conta ligada à ficha.
 *
 * Pede o servidor de desenvolvimento no ar (as contas nascem pelo cadastro de verdade, com os
 * hooks dele: trial, avatar sorteado). Rodar de novo recria o semestre do seed e religa a aluna.
 *
 *   pnpm tsx scripts/capturas/cenario.ts
 */
import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { prisma } from '../../src/lib/server/db/client.ts';
import { ALUNA, BASE, PROFESSORA, TURMA_DA_ANA } from './dados.ts';

/** Cadastra pelo endpoint de verdade; conta que já existe não é erro. */
async function cadastrar(caminho: string, conta: { nome: string; email: string; senha: string }) {
	const resposta = await fetch(`${BASE}${caminho}`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', origin: BASE },
		body: JSON.stringify({ name: conta.nome, email: conta.email, password: conta.senha })
	});
	if (!resposta.ok && resposta.status !== 422) {
		throw new Error(`${caminho} respondeu ${resposta.status}: ${await resposta.text()}`);
	}
}

if (process.env.NODE_ENV === 'production')
	throw new Error('O cenário das capturas não roda em produção.');

await cadastrar('/api/auth/sign-up/email', PROFESSORA);
const daqui60dias = new Date(Date.now() + 60 * 24 * 3600 * 1000);
await prisma.teacher.update({
	where: { email: PROFESSORA.email },
	data: {
		plan: 'super',
		subscriptionStatus: 'active',
		currentPeriodEnd: daqui60dias,
		cycleAnchor: new Date(),
		trialEndsAt: null
	}
});
console.log('professora: Marina Couto, plano Super');

execFileSync('npx', ['tsx', 'scripts/seed-demo.ts', PROFESSORA.email], {
	stdio: 'inherit',
	shell: true
});

await cadastrar('/api/auth-aluno/sign-up/email', ALUNA);
const conta = await prisma.studentAccount.findUniqueOrThrow({ where: { email: ALUNA.email } });

// A Ana das propagandas está no 8º A, a turma do vídeo dos módulos (toda quarta, a Frutas 1 abrindo
// no dia). O seed a põe no 7º B; aqui a conta dela assume uma ficha do 8º A que já tem conta e os
// links pessoais das fases liberadas ("Jogar" passa por eles), e a ficha ganha o nome dela. A Ana do
// 7º B continua como está, com a conta do seed.
const ficha = await prisma.student.findFirstOrThrow({
	where: {
		name: 'Júlia Costa',
		classroom: { name: TURMA_DA_ANA, teacher: { email: PROFESSORA.email } }
	},
	select: { id: true }
});
const anaDoSeed = await prisma.student.findFirstOrThrow({
	where: {
		name: ALUNA.nome,
		classroom: { name: '7º B — inglês', teacher: { email: PROFESSORA.email } }
	},
	select: { accountId: true }
});
await prisma.student.update({
	where: { id: ficha.id },
	data: { accountId: conta.id, name: ALUNA.nome }
});
// O rosto das outras propagandas: o avatar da conta do seed da Ana passa para a conta nova.
const rosto = anaDoSeed.accountId
	? await prisma.studentAccount.findUnique({
			where: { id: anaDoSeed.accountId },
			select: { avatar: true }
		})
	: null;
if (rosto?.avatar) {
	await prisma.studentAccount.update({ where: { id: conta.id }, data: { avatar: rosto.avatar } });
}
console.log(`aluna: ${ALUNA.nome}, ligada a uma ficha do ${TURMA_DA_ANA}`);

await prisma.$disconnect();
