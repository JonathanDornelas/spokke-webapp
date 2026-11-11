# Spokke

SaaS onde professores de idiomas criam exercícios interativos e publicam por link. O aluno abre o
link, digita o nome e responde — sem criar conta. Exercícios das quatro habilidades (escuta, fala,
leitura e escrita), em dez idiomas.

## Stack

SvelteKit (Svelte 5) com remote functions · Tailwind 4 · Prisma 7 sobre PostgreSQL 16 · Better Auth ·
fila em tabela Postgres com worker próprio · storage S3-compatível · TTS/ASR pelo `audiotext-service`
(Whisper + Kokoro) · geração de material por IA pelo Gemini · Vitest e Playwright.

## Primeira vez

```bash
docker compose -f docker/postgres.yml up -d
cp .env.example .env    # o .env.example explica cada variável
pnpm install
pnpm db:migrate
pnpm dev                # em outro terminal: pnpm worker
```

Sem o serviço de áudio, deixe `TTS_PROVIDER` e `ASR_PROVIDER` vazios: a atividade sai sem questões de
escuta e de fala, completa.

## Comandos

| Comando           | O que faz                                                |
| ----------------- | -------------------------------------------------------- |
| `pnpm dev`        | Servidor de desenvolvimento                              |
| `pnpm worker`     | Worker da fila (TTS, e-mails)                            |
| `pnpm test:unit`  | Vitest (os testes de repositório usam o banco do `.env`) |
| `pnpm test:e2e`   | Playwright                                               |
| `pnpm check`      | Tipos (svelte-check)                                     |
| `pnpm db:migrate` | Migration em desenvolvimento                             |
| `pnpm db:deploy`  | Migration em produção                                    |

## Onde está o resto

- [CLAUDE.md](./CLAUDE.md) — produto, estrutura e as regras invioláveis.
- [`.claude/rules/`](./.claude/rules/) — as regras por área (kernel, servidor, auth, cobrança, banco, telas, testes).
- [`docs/operacao.md`](./docs/operacao.md) — deploy, variáveis, rotina da equipe.
- ADRs: [cobrança e planos](./docs/adr-002-billing.md) · [IA e créditos](./docs/adr-003-ia-gemini.md) ·
  [módulos e nível](./docs/adr-004-modulos-e-nivel.md) · [escola](./docs/adr-005-escola.md).
