# Operação

Como subir, configurar e manter o Spokke. Para o produto e as regras de código, ver `CLAUDE.md` e
`.claude/rules/`. Para as decisões, os ADRs desta pasta.

## O que roda

| Peça             | Onde                                 | Ciclo de vida                                    |
| ---------------- | ------------------------------------ | ------------------------------------------------ |
| Web (SvelteKit)  | `docker-compose.yml` → serviço `web` | Reconstrói à vontade — não guarda dado           |
| Worker (fila)    | `docker-compose.yml` → `worker`      | Junto do web; **atualize antes ou junto dele**   |
| PostgreSQL 16    | `docker/postgres.yml`                | Volume próprio, nunca recriado no deploy do app  |
| MinIO (dev) / R2 | `docker/minio.yml`                   | Volume próprio; regras de ciclo de vida (abaixo) |
| Áudio e tradução | `../audiotext-service`               | Compose próprio; ~5 GB residentes (teto de 7)    |

Quatro composes de propósito: reconstruir a aplicação nunca encosta em dado do professor nem em
áudio publicado. Eles conversam pelas portas do host (`host.docker.internal`).

**O worker vem primeiro.** Tipo de job que ele não conhece lança erro e vai para `failed`. Os tipos de
hoje: `tts`, `convite`, `convite-escola`, `convite-conta`, `aviso-equipe`, `envio-programado`,
`redefinir-senha` (o link de "esqueci a senha" — sem o worker novo, ele falha e ninguém recupera a
senha), `mercadopago` e `intranet` (a ação pedida pelo painel interno).

## A intranet

O painel interno da equipe é o projeto `../spokke-intranet` (README de lá): números, clientes,
pagamentos, o termômetro do bucket e conceder/encerrar plano sem vencimento. Processo, porta e banco
de login próprios, com senha + autenticador obrigatórios e lista de IPs.

Ela entra no banco do Spokke com o papel `spokke_intranet_leitor`, criado por
`../spokke-intranet/infra/papel-no-spokke.sql`: lê só as colunas listadas (nada de senha, sessão,
nome ou e-mail de aluno, resposta, conteúdo de material) e insere só o job `intranet`, por RLS.
**Rode o script de novo depois de uma migration que a intranet precise ler.** O RLS em `"Job"` vale
para esse papel; o app do Spokke continua conectando como dono das tabelas, que o RLS ignora — se
um dia não for o dono, o papel do app precisa de `BYPASSRLS`.

## Desenvolvimento

```bash
docker compose -f docker/postgres.yml up -d
docker compose -f docker/minio.yml up -d      # opcional sem TTS
cp .env.example .env
pnpm install
pnpm db:migrate
pnpm dev                                      # e, noutro terminal:
pnpm worker
```

Sem `EMAIL_PROVIDER`, todo e-mail (convites, avisos) sai no log do worker, com o link inteiro.
Sem `LLM_PROVIDER`, "Gerar com IA" fica travado com o motivo escrito.

### Dados de demonstração

```bash
pnpm db:seed:demo <email-do-professor>            # (re)cria o cenário nessa conta
pnpm db:seed:demo <email-do-professor> --limpar   # só apaga o que o seed criou
```

`scripts/seed-demo.ts` enche uma conta que JÁ EXISTE com um semestre de mentira: 10 atividades
(uma em rascunho), 66 materiais, 5 turmas com 50 alunos (alguns com conta e avatar), 4 módulos
(programado por e-mail, só no mapa, pausado e sem turma, mais um envio que "não saiu" por causa do
rascunho), os envios que já saíram e ~70 tentativas. As datas são relativas a hoje — rodar de novo
apaga o cenário anterior e o recria recente. Recusa `NODE_ENV=production`.

- **Só apaga o que criou**: as linhas de topo têm id começando por `seed` + seis letras do id do
  professor (um cuid começa sempre por "c"). O que o professor cadastrou à mão não é tocado.
- **Não manda nada**: os alunos têm e-mail em `exemplo.invalid` (domínio que não entrega), o
  histórico é gravado já enviado, e os envios FUTUROS dos módulos ficam programados sem job na fila
  — só disparam se a programação for salva de novo pela tela.
- **As questões e as notas são as do produto**: geradores e corte do wizard, sem escuta nem fala
  (não depende do serviço de áudio), e cada resposta de aluno é corrigida pelo grader de verdade.
- **Conta no trial**: o cenário passa dos limites do básico (10 atividades, 60 materiais) — criar
  fica bloqueado até ativar um plano pelo `/admin`.

## Produção

- **Migrations**: `pnpm db:deploy` (`prisma migrate deploy`) antes de subir a versão nova. Nunca
  `migrate dev` nem `db push` em produção. O Prisma 7 não gera o cliente sozinho: o `postinstall`
  roda `prisma generate`.
- **Ordem**: migration → worker → web.
- **Bucket**: UMA regra de ciclo de vida precisa existir no R2 — `fala/` (a voz do aluno)
  expira em **7 dias**. `tts/` (o áudio das atividades) NÃO tem prazo: sai quando a atividade é
  apagada. Em dev o container `init` de `docker/minio.yml` escreve a regra; no R2, crie-a à mão.
  Só `tts/` tem leitura pública.

## Variáveis de ambiente

As de infraestrutura (banco, storage, áudio, e-mail) estão comentadas no `.env.example`. As do
produto:

| Variável             | Para quê                                                                      |
| -------------------- | ----------------------------------------------------------------------------- |
| `BILLING_PROVIDER`   | Vazio/`manual`: "Assinar" vira pedido atendido no painel (adr-002)            |
| `PLATFORM_ADMIN_IDS` | IDs de `Teacher` com acesso ao `/admin` — IDs, nunca e-mails                  |
| `CONTATO_PARA`       | Caixa da equipe: pedidos de plano e formulário de contato                     |
| `LLM_PROVIDER`       | `gemini` liga "Gerar com IA"; vazio desliga (adr-003)                         |
| `GEMINI_API_KEY`     | Chave de projeto **com faturamento** (a política promete não treinar)         |
| `GEMINI_MODEL`       | Id do modelo — escolha o Flash estável vigente na página de modelos do Gemini |
| `TRANSLATE_PROVIDER` | `audiotext` liga a tradução automática do material; vazio desliga (adr-006)   |
| `WORKER_CONCURRENCY` | Jobs em paralelo (padrão 3). Acelera e-mail, não TTS                          |

## O primeiro admin

1. Crie a sua conta de professor pelo cadastro.
2. Pegue o id: `pnpm db:studio` (tabela `Teacher`) ou
   `SELECT id FROM "Teacher" WHERE email = 'voce@exemplo.com';`
3. Ponha em `PLATFORM_ADMIN_IDS` e reinicie o web. `/admin` responde 404 para todo o resto.

## Mercado Pago — ligar o gateway

O código está pronto e desligado (`BILLING_PROVIDER` vazio = provedor manual). Para ligar:

1. **Credenciais.** No painel do Mercado Pago, "Suas integrações" › a aplicação › Credenciais.
   Comece pelas de TESTE, com contas de teste de comprador e vendedor (o Mercado Pago não deixa
   pagar a si mesmo). Ponha o Access Token em `MERCADOPAGO_ACCESS_TOKEN` — no web E no worker.
2. **Webhook.** Em "Suas integrações" › Webhooks, a URL é `https://<domínio>/api/mercadopago`, com
   os eventos de **assinaturas** (`subscription_preapproval` e
   `subscription_authorized_payment`). Copie a assinatura secreta para
   `MERCADOPAGO_WEBHOOK_SECRET`. Sem ela o endpoint responde 503.
3. **`BILLING_PROVIDER=mercadopago`** e reinicie web e worker. "Assinar" passa a levar ao checkout
   do Mercado Pago.
4. **Os preços** são os de `src/lib/billing/precos.ts` (PLACEHOLDER hoje). É o valor que o checkout
   cobra — troque antes de usar o token de produção.

O que conferir no sandbox na primeira vez, porque a documentação não fecha estes pontos (billing.md
"Mercado Pago"): se a notificação de assinatura chega pelo painel de Webhooks (há um trecho dizendo
que o painel não vale para Assinaturas — se não chegar, a volta do checkout ainda ativa o plano,
mas a renovação mensal depende do webhook); a grafia que o `PUT` de cancelar aceita (`cancelled`,
a mesma do status que a API devolve); e o formato do corpo das notificações.

Como acompanhar: os jobs `mercadopago` aparecem na fila (falhados, no painel interno, com "Tentar
de novo"); o log do worker diz o desfecho de cada notificação (`ativada`, `estendida`,
`cancelada`, `sem-mudanca`, `ignorada`); e a aba de assinatura do professor mostra o histórico
(`checkout_iniciado`, `plano_ativado`).

Com o gateway ligado, o painel continua podendo ativar, estender e cancelar à mão — as mesmas
funções, com o ator `admin:<id>`. Cuidado: cancelar pelo painel NÃO cancela no Mercado Pago (só o
botão do professor e a própria conta do pagador no Mercado Pago fazem isso).

## Rotina da equipe (sem gateway de pagamento)

- **Pedido de plano**: chega um e-mail em `CONTATO_PARA` com o Reply-To do professor. Combine o
  pagamento, abra `/admin/pedidos` e clique em "Atender" (opcionalmente com a data de fim combinada).
- **Trial**: `/admin/professores/<id>` estende ou encerra. Os que vencem em 3 dias aparecem na visão
  geral.
- **Escola**: `/admin/escolas` → nova escola (assentos e limites por professor) → convide a
  coordenação. A coordenação convida os professores em `/escola`.
- **Jobs falhados**: aparecem na visão geral do painel, com o erro e "Tentar de novo".

## Antes de abrir para o público

- Verificar um domínio no Resend (sem isso ele só entrega para o e-mail da conta).
- Preços reais em `src/lib/billing/precos.ts` (a vitrine e o checkout leem dali).
- Dados reais da empresa em `src/lib/content/institucional.ts`. O domínio `spokke.app` dos e-mails
  e links de exemplo é PLACEHOLDER, como era o `entendo.app`.

## Migração do nome (entendo → Spokke, novembro de 2026)

O projeto se chamava entendo. Na troca, a infra de desenvolvimento foi COPIADA para nomes novos,
e a antiga ficou parada como cópia de segurança:

| Antes                                   | Depois                                | Como                          |
| --------------------------------------- | ------------------------------------- | ----------------------------- |
| `entendo-postgres`, banco `entendo`     | `spokke-postgres`, banco `spokke`     | `pg_dump -Fc` → `pg_restore`  |
| volume `entendo-postgres-data`          | `spokke-postgres-data`                | volume novo                   |
| `entendo-minio`, bucket `entendo-midia` | `spokke-minio`, bucket `spokke-midia` | `mc mirror`                   |
| volume `entendo-minio-data`             | `spokke-minio-data`                   | volume novo                   |
| `entendo-web` / `entendo-worker`        | `spokke-web` / `spokke-worker`        | imagem `spokke-service:local` |

- **`MediaAsset.url` guarda a URL inteira, com o bucket dentro** — o Player a lê como está. As 92
  linhas foram reescritas de `/entendo-midia/` para `/spokke-midia/` no banco novo. Se um dia o
  bucket mudar de novo, é o mesmo `UPDATE`.
- O bucket antigo estava VAZIO na hora da cópia: todo áudio já tinha vencido pela regra dos 10
  dias. As linhas de `MediaAsset` continuam lá, vencidas, e a entrada do Player enfileira o áudio
  de novo quando alguém abrir o link (server.md "TTS").
- Cookies e chaves de `localStorage` também trocaram de prefixo (`entendo_*` → `spokke_*`): quem
  estava logado como aluno entra de novo, e o tema e o volume salvos voltam ao padrão uma vez.
- **Apagar o antigo**, depois de conferir que está tudo certo com o novo:

  ```bash
  docker rm entendo-postgres entendo-minio entendo-minio-init entendo-web entendo-worker
  docker volume rm entendo-postgres-data entendo-minio-data
  docker image rm entendo-service:local
  ```
