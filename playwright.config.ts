import { defineConfig } from '@playwright/test';

export default defineConfig({
	webServer: { command: 'npm run build && npm run preview', port: 4173 },
	testDir: 'e2e',
	testMatch: '**/*.spec.ts',
	// A semente do E2E do aluno (`e2e/semente.ts`): grava um professor e duas
	// atividades publicadas no banco do `.env`, e tira tudo no fim.
	globalSetup: './e2e/global-setup.ts',
	globalTeardown: './e2e/global-teardown.ts'
});
