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
pagamentos, o termômetro do bucket, os relatos de problema dos alunos e conceder/encerrar plano sem
vencimento. Processo, porta e banco de login próprios, com senha + autenticador obrigatórios e
lista de IPs.

Ela entra no banco do Spokke com o papel `spokke_intranet_leitor`, criado por
`../spokke-intranet/infra/papel-no-spokke.sql`: lê só as colunas listadas (nada de senha, sessão,
nome ou e-mail de aluno, resposta, conteúdo de material — a única exceção é o relato de problema,
que o aluno mandou para a equipe sabendo que ia a questão e a resposta dele) e insere só o job
`intranet`, por RLS.
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

**O roteiro do servidor está em `docs/deploy.md`** (da véspera do lançamento à rotina de atualizar,
backup e voltar versão), com os arquivos em `deploy/`. Em produção os composes conversam pela rede
Docker `spokke`, e não pelas portas do host como em desenvolvimento: as portas ficam presas ao
`127.0.0.1` e só o Caddy responde para fora.

- **Migrations**: `pnpm db:deploy` (`prisma migrate deploy`) antes de subir a versão nova. Nunca
  `migrate dev` nem `db push` em produção. O Prisma 7 não gera o cliente sozinho: o `postinstall`
  roda `prisma generate`.
- **Ordem**: migration → worker → web.
- **Bucket**: UMA regra de ciclo de vida — `fala/` (a voz do aluno) expira em **7 dias**. `tts/` (o
  áudio das atividades) NÃO tem prazo: sai quando a atividade é apagada. No lançamento a mídia fica
  no MinIO do próprio servidor, e o container `init` de `docker/minio.yml` escreve a regra; no R2
  (a migração planejada, `docs/deploy.md` "Depois do lançamento"), crie-a à mão. Só `tts/` tem
  leitura pública.

## Variáveis de ambiente

As de infraestrutura (banco, storage, áudio, e-mail) estão comentadas no `.env.example`. As do
produto:

| Variável                          | Para quê                                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------- |
| `BILLING_PROVIDER`                | Vazio/`manual`: "Assinar" vira pedido atendido no painel (adr-002)                                |
| `PLATFORM_ADMIN_IDS`              | IDs de `Teacher` com acesso ao `/admin` — IDs, nunca e-mails                                      |
| `CONTATO_PARA`                    | Caixa da equipe: pedidos de plano, contato e relatos de problema dos alunos                       |
| `GOOGLE_CLIENT_ID`                | Com `GOOGLE_CLIENT_SECRET`, liga "Continuar com o Google"; vazio desliga                          |
| `LLM_PROVIDER`                    | A fila da IA, em ordem: `claude,gemini` (o Gemini só se o Claude falhar); vazio desliga (adr-003) |
| `ANTHROPIC_API_KEY`               | Chave da API do Claude (console.anthropic.com)                                                    |
| `CLAUDE_MODEL`                    | Id do modelo do Claude, como `claude-opus-5-5`                                                    |
| `GEMINI_API_KEY`                  | Chave de projeto **com faturamento** (a política promete não treinar)                             |
| `GEMINI_MODEL`                    | Id do modelo — escolha o Flash estável vigente na página de modelos do Gemini                     |
| `TRANSLATE_PROVIDER`              | `audiotext` liga a tradução automática do material; vazio desliga (adr-006)                       |
| `WORKER_CONCURRENCY`              | Jobs em paralelo (padrão 3). Acelera e-mail, não TTS                                              |
| `PUBLIC_GA_ID`                    | ID do Google Analytics 4 ("G-…"); vazio desliga a medição (seção abaixo)                          |
| `PUBLIC_GOOGLE_SITE_VERIFICATION` | Meta tag do Search Console; vazio não emite nada                                                  |

## Analytics e Search Console

**Meio caminho andado** (novembro de 2026): o código está pronto e desligado. Sem `PUBLIC_GA_ID`, nenhum
script de terceiro carrega e nenhum aviso aparece. Com ele, as páginas públicas (home, `(site)` com o
blog, cadastro e exemplo) mostram um aviso de medição, e o Google Analytics 4 só carrega depois do
"Aceitar" (consentimento básico). O painel do professor e as atividades dos alunos nunca são medidos —
nem quando se chega a eles pelo link de uma página pública, sem recarregar: a cada troca de tela o
envio é desligado fora das páginas medidas (`ligarEnvio`, o `ga-disable-<ID>` do Google).
O código é `$lib/client/medicao.ts` e `MedicaoDoSite.svelte` (no layout raiz).

O que já é medido, quando a pessoa aceita:

| Evento          | Quando                                                               | Parâmetros                  |
| --------------- | -------------------------------------------------------------------- | --------------------------- |
| `page_view`     | cada página pública, inclusive nas trocas de tela do SvelteKit       | (os do GA)                  |
| `sign_up`       | cadastro de professor por e-mail concluído                           | `method`, `origem`          |
| `generate_lead` | formulário de contato enviado                                        | `assunto_inicial`, `origem` |
| `cta_blog`      | clique numa chamada do blog (bloco "No Spokke", faixa final, índice) | `rotulo`, `artigo`          |
| `copiar_lista`  | "Copiar a lista" num exemplo pronto do blog                          | `idioma`                    |

A `origem` é a do link que trouxe a pessoa (`?origem=blog-<artigo>`, docs/blog.md). O cadastro pelo
Google ainda não registra `sign_up` (a volta do OAuth não passa pela tela de cadastro).

**Depois do deploy, para ligar:**

1. No Google Analytics, criar uma propriedade GA4 para `spokke.com.br` e um fluxo de dados da Web.
   Copiar o ID de medição (`G-…`).
2. Pôr `PUBLIC_GA_ID` no ambiente de produção e reiniciar o web (é lido em tempo de execução, sem
   rebuild). Abrir o site, aceitar o aviso e conferir em "Relatórios > Tempo real" e no DebugView.
3. Em "Administrador > Eventos", marcar `sign_up` e `generate_lead` como eventos principais
   (conversões). Em "Definições personalizadas", criar as dimensões de evento `origem`, `artigo` e
   `rotulo`, para o relatório dizer qual artigo trouxe cada cadastro.
4. Em "Coleta de dados", conferir que "Indicadores do Google" e personalização de anúncios estão
   desligados (o site nega `ad_storage` no consentimento) e ajustar a retenção de dados.
5. No Search Console, adicionar a propriedade de **domínio** `spokke.com.br` e verificar pelo registro
   TXT no DNS (cobre o site inteiro). Sem acesso ao DNS, usar a propriedade de prefixo de URL com a
   meta tag: o `content` vai em `PUBLIC_GOOGLE_SITE_VERIFICATION`.
6. No Search Console, enviar `https://spokke.com.br/sitemap.xml` em "Sitemaps" e vincular a
   propriedade ao Google Analytics.
7. Opcional: o Bing Webmaster Tools importa a propriedade do Search Console; se preferir a meta tag,
   o valor vai em `PUBLIC_BING_SITE_VERIFICATION`.

**O texto legal já fala da medição** (política de privacidade e página de Cookies, em
`$lib/content/institucional.ts`): ela é descrita como opcional, com aceite. Se um dia o site medir
sem aviso, ou com outra ferramenta, os dois textos mudam junto.

## O primeiro admin

1. Crie a sua conta de professor pelo cadastro.
2. Pegue o id: `pnpm db:studio` (tabela `Teacher`) ou
   `SELECT id FROM "Teacher" WHERE email = 'voce@exemplo.com';`
3. Ponha em `PLATFORM_ADMIN_IDS` e reinicie o web. `/admin` responde 404 para todo o resto.

## Login com Google

Pronto e desligado: sem `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` as telas não mostram o botão.
Para ligar:

1. **Tela de consentimento.** No Google Cloud Console, "APIs e serviços" › "Tela de consentimento
   OAuth": tipo Externo, nome "Spokke", e-mail de suporte, o domínio e os links da política de
   privacidade e dos termos. Os escopos são os básicos (`openid`, `email`, `profile`), que não
   pedem verificação do Google.
2. **O cliente.** "Credenciais" › "Criar credenciais" › "ID do cliente OAuth", tipo **Aplicativo da
   Web**. Em "URIs de redirecionamento autorizados", as DUAS — professor e aluno são contas
   separadas, cada uma com a sua volta:
   - `https://<domínio>/api/auth/callback/google`
   - `https://<domínio>/api/auth-aluno/callback/google`

   Em desenvolvimento, as mesmas com `http://localhost:5173`. A origem tem de ser exatamente a do
   `BETTER_AUTH_URL` em produção.

3. **As chaves** no `.env` do web (o worker não precisa) e reinicie.

O que o login faz e não faz (auth.md "Login com Google"): guarda só nome, e-mail e o identificador
da conta Google — nenhum token, nenhuma foto. **Conta criada com senha não é ligada sozinha**: quem
tenta entrar pelo Google com um e-mail que já tem senha recebe a explicação e liga o Google por
dentro (Conta, no professor; a área do aluno, no aluno). Quem nasceu pelo Google cria uma senha
pelo link de "esqueci a senha" (o cartão Senha da Conta manda o link).

## Relatos de problema

O "Relatar problema" do Player (o ícone de bandeira no cabeçalho da questão) grava um
`ProblemReport` e põe um aviso para a equipe na fila (`aviso-equipe`, para `CONTATO_PARA`), com o
código `R-XXXXXX`, o motivo, a atividade e a questão. O relato inteiro — a questão com o gabarito, a
resposta que estava na tela, a correção refeita pelo servidor com a forma normalizada dos dois
lados, o aparelho e o diário de erros da página — fica na intranet, em **Relatos**, onde a equipe
marca como resolvido ou descarta (um job `intranet` aplicado pelo worker).

Sem o nome do aluno e sem IP. O relato vale **180 dias** (o worker apaga os vencidos de hora em
hora) e sai junto com a tentativa. Teto: 8 relatos por IP a cada 10 minutos, 15 por tentativa, e
a mesma questão não é relatada duas vezes em um minuto.

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
(`checkout_iniciado`, `plano_ativado`, `devolucao`).

**Troca de plano** (billing.md "Troca de plano"): trocar é assinar de novo, com o valor cheio, e
um job `mercadopago-troca` cancela a assinatura antiga no Mercado Pago e devolve a parte não usada
do último pagamento dela, depois de o plano novo estar pago. O log do worker diz
`[mercadopago] troca: N cancelada(s), N devolução(ões)` e, enquanto o primeiro pagamento da nova não
sai, `esperando o primeiro pagamento da nova` (ele confere de meia em meia hora, por um dia). **Se a
troca parar** — o Mercado Pago recusou cancelar ou devolver, ou o pagamento novo não saiu em um dia
—, chega um e-mail "Troca de plano parada no Mercado Pago" em `CONTATO_PARA`. Aí, no painel do
Mercado Pago: confira se a assinatura antiga do professor está cancelada e devolva à mão, no próprio
pagamento, a parte não usada do último pagamento dela. Devolução feita à mão não sai de novo: antes
de devolver, o job olha o que já voltou no pagamento.

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
- Dados reais da empresa em `src/lib/content/institucional.ts`. O domínio é `spokke.com.br`
  (decidido em 2026-11-10): os e-mails do site (`suporte@`, `privacidade@`, `escolas@`,
  `acessibilidade@`) já apontam para ele, e as caixas ainda precisam ser criadas.

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
