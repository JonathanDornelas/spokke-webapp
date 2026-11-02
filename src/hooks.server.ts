import type { Handle } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import { building, dev } from '$app/environment';
// Renomeado: o handle abaixo já desestrutura um `resolve` próprio (o
// resolvedor de request do SvelteKit) — importar com o mesmo nome faria um
// sombrear o outro silenciosamente.
import { resolve as resolvePath } from '$app/paths';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { auth } from '$lib/server/auth';
import { authAluno } from '$lib/server/auth/aluno';
import { ehAdminDaPlataforma } from '$lib/server/auth/guard';

// Rotas que não exigem professor autenticado: capa pública, Player do aluno
// (a/[slug]), o webhook do Stripe e o catálogo de componentes de dev. Tudo
// mais é Studio e exige sessão — ver .claude/rules/auth.md "Onde a guarda
// mora". Isto é defesa em profundidade: a proteção de verdade é o
// requireTeacher() em cada remote function.
const PUBLIC_PATHS = [
	'/entrar',
	'/cadastro',
	'/esqueci-senha',
	'/redefinir-senha',
	'/privacidade',
	// Planos é público por dois motivos, e o segundo é o que morde se esquecer:
	// é página de preço (quem nem tem conta precisa comparar antes de criar uma)
	// e é o DESTINO de quem bate num bloqueio. Fora desta lista, a tela que
	// deveria explicar o bloqueio redirecionava para o login.
	'/planos',
	'/contato',
	'/sobre',
	'/ajuda',
	'/status',
	'/termos',
	'/cookies',
	'/acessibilidade'
];

function isPublicPath(pathname: string): boolean {
	if (pathname === '/') return true;
	if (pathname.startsWith('/a/')) return true;
	// O link pessoal do convite. É a porta do ALUNO: ele não tem conta, então
	// mandá-lo para `/entrar` seria pedir uma senha que não existe.
	if (pathname.startsWith('/e/')) return true;
	if (pathname.startsWith('/api/stripe')) return true;
	if (pathname.startsWith('/api/auth')) return true;
	// A área do aluno: conta OPCIONAL, identidade separada da do professor. Ela
	// tem guard próprio (`requireAluno`) — mandar quem não está logado para
	// `/entrar` daria a tela de login do PROFESSOR a um aluno.
	if (pathname.startsWith('/aluno')) return true;
	if (pathname.startsWith('/dev')) return true;
	// A atividade de exemplo e a fala dela: o "Responder um exemplo" da home é
	// para quem ainda não tem conta.
	if (pathname === '/exemplo' || pathname.startsWith('/exemplo/')) return true;
	if (PUBLIC_PATHS.includes(pathname)) return true;
	return false;
}

export const handle: Handle = async ({ event, resolve }) => {
	// O catálogo de componentes nunca existe fora de `pnpm dev`. Bloqueado aqui
	// (não em +layout.server.ts) porque layout não é barreira — ver auth.md.
	if (event.url.pathname.startsWith('/dev') && !dev) {
		return new Response('Not found', { status: 404 });
	}

	// As duas identidades são resolvidas juntas e guardadas separadas: o mesmo
	// browser pode ter as duas (o professor testando a própria atividade), e uma
	// NUNCA vira a outra. Cada instância lê o seu cookie (`entendo-aluno` para o
	// aluno) — ver `server/auth/aluno.ts`.
	const [result, sessaoAluno] = await Promise.all([
		auth.api.getSession({ headers: event.request.headers }),
		authAluno.api.getSession({ headers: event.request.headers })
	]);
	event.locals.user = result?.user ?? null;
	event.locals.session = result?.session ?? null;
	event.locals.aluno = sessaoAluno?.user ?? null;

	// O painel interno não existe para quem não o administra: 404 para todo
	// mundo, inclusive para quem não está logado — e por isso ANTES do
	// redirecionamento de login, que confirmaria que há algo ali. É defesa em
	// profundidade: a barreira de verdade é `requirePlatformAdmin` em cada load
	// e remote function (que nem passam por aqui: `/_app/remote/...`).
	if (event.url.pathname.startsWith('/admin') && !ehAdminDaPlataforma(event.locals.user?.id)) {
		return new Response('Not found', { status: 404 });
	}

	// URL que não casa com rota nenhuma (`route.id === null`) é 404, não área
	// protegida: sem esta linha, qualquer endereço digitado errado jogava um
	// visitante deslogado na tela de login em vez do 404 (paginas.md
	// "+error.svelte — 404 e 500").
	const rotaExiste = event.route.id !== null;

	if (rotaExiste && !isPublicPath(event.url.pathname) && !event.locals.user) {
		// GET (navegação de página ou o fetch de dado que o router do SvelteKit
		// dispara ao trocar de rota): manda pra tela de entrar, com o caminho
		// original pra voltar depois do login — SvelteKit segue redirect() de
		// hooks tanto no document quanto no data request. POST (form action,
		// remote function): 401 puro, quem chama é sempre código nosso que já
		// trata esse erro via requireTeacher() (defesa em profundidade, auth.md).
		if (event.request.method === 'GET' && !event.isSubRequest) {
			const target = `${resolvePath('/(auth)/entrar')}?redirectTo=${encodeURIComponent(event.url.pathname)}`;
			redirect(303, target);
		}
		return new Response('Não autenticado', { status: 401 });
	}

	// Cada instância atende o SEU base path. A do aluno vem primeiro porque
	// `/api/auth-aluno` também começa com `/api/auth`, e o handler do professor
	// engoliria a rota dele.
	if (event.url.pathname.startsWith('/api/auth-aluno')) {
		return svelteKitHandler({ event, resolve, auth: authAluno, building });
	}
	return svelteKitHandler({ event, resolve, auth, building });
};
