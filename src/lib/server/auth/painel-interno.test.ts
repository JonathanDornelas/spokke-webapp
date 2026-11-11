import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * O painel interno (`/admin`) responde 404 a quem não o administra, pela MESMA tela de
 * "página não encontrada" de qualquer endereço que não existe. Para isso o `hooks.server.ts`
 * deixa a NAVEGAÇÃO (GET) chegar até a rota, e quem barra é o `requirePlatformAdmin` no load
 * de cada página — o 404 dele cai no `src/routes/+error.svelte`.
 *
 * Isso só é seguro enquanto TODA página do painel tiver esse guard no próprio load. Uma página
 * sem `+page.server.ts` (ou com um load que esqueceu o guard) seria desenhada para qualquer
 * visitante, com o layout do painel em volta. Este teste é o que impede isso de acontecer em
 * silêncio. A guarda fica no load de cada página, não num `+layout.server.ts`: layout não é
 * barreira (auth.md).
 */

const PAINEL = join(process.cwd(), 'src', 'routes', '(admin)');

function arquivos(pasta: string): string[] {
	return readdirSync(pasta, { withFileTypes: true }).flatMap((item) =>
		item.isDirectory() ? arquivos(join(pasta, item.name)) : [join(pasta, item.name)]
	);
}

const todos = arquivos(PAINEL);
const nome = (caminho: string) => relative(PAINEL, caminho).replaceAll('\\', '/');

describe('painel interno: toda porta tem o guard', () => {
	it('acha as páginas do painel (o teste não passa por estar olhando a pasta errada)', () => {
		expect(todos.filter((f) => f.endsWith('+page.svelte')).length).toBeGreaterThan(0);
	});

	it('toda página tem um +page.server.ts que chama requirePlatformAdmin', () => {
		const semGuard = todos
			.filter((f) => f.endsWith('+page.svelte'))
			.map((pagina) => join(pagina, '..', '+page.server.ts'))
			.filter(
				(load) => !existsSync(load) || !/requirePlatformAdmin\(/.test(readFileSync(load, 'utf8'))
			)
			.map(nome);
		expect(semGuard).toEqual([]);
	});

	it('todo endpoint (+server.ts) do painel chama requirePlatformAdmin', () => {
		const semGuard = todos
			.filter((f) => f.endsWith('+server.ts'))
			.filter((f) => !/requirePlatformAdmin\(/.test(readFileSync(f, 'utf8')))
			.map(nome);
		expect(semGuard).toEqual([]);
	});

	it('nenhum load universal (+page.ts ou +layout.ts): ele roda no navegador, onde não há guard', () => {
		const universais = todos.filter((f) => /\+(page|layout)\.(ts|js)$/.test(f)).map(nome);
		expect(universais).toEqual([]);
	});
});
