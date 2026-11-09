# ADR-002 — Planos, limites e gestão de assinatura

**Estado:** aceito · outubro de 2026
**Substitui:** a seção "Trial provisório" de `.claude/rules/billing.md` e os planos de vitrine
(`livre` / `professor` / `escola`).

## Contexto

Os planos eram só vitrine (`src/lib/content/planos.ts`, preços inventados), `can()` decidia uma
coisa só ("publicar"), nenhum limite era aplicado e a cobrança estava em mock. Além disso, os campos
de cobrança do `Teacher` aceitavam valor vindo do corpo do cadastro e de `update-user`: qualquer
pessoa se dava `plan: "super"` com um POST.

O dono do repositório definiu:

| Plano     | Atividades                   | Materiais | Créditos de IA / mês | IA  |
| --------- | ---------------------------- | --------- | -------------------- | --- |
| `basico`  | 10                           | 60        | 0                    | não |
| `pro`     | 30                           | 300       | 300                  | sim |
| `super`   | 80                           | 1000      | 1000                 | sim |
| `scholar` | contrato da escola (ADR-005) |

## Decisões

### 1. Os limites são de ESTOQUE

Contam o que o professor **tem agora**, não o que criou no mês. Atividade arquivada não conta;
material reaproveitado (`findEquivalent`) não ocupa vaga nova. Créditos são a exceção: renovam por
ciclo mensal e não acumulam (ADR-003).

Consequência: é preciso um jeito de liberar vaga sem destruir resultado — daí **arquivar**
(`Activity.archivedAt`): sai do estoque, o link fecha para quem ainda não começou, quem já está
respondendo termina, e os resultados ficam. **Apagar de vez** existe também (com confirmação pelo
título), na ordem exigida pelos três FKs `RESTRICT` (tentativas → publicações → atividade).

Rebaixar de plano não apaga nada: quem está acima do limite só não cria até voltar para baixo dele.

### 2. Um catálogo, um ponto de decisão

- `src/lib/billing/catalogo.ts` — os limites, puros e isomórficos. A vitrine (`planos.ts`) escreve os
  números a partir dele; `catalogo.test.ts` garante que não divergem.
- `src/lib/server/billing/entitlements.ts` — puro: `montarEstado`, `can`, `cabe`,
  `motivoDoBloqueio`. **A situação sai das datas** (`trialEndsAt`, `currentPeriodEnd`,
  `gracePeriodEnd`), na leitura — sem cron que possa esquecer de rodar.
- `src/lib/server/billing/acesso.ts` — vai ao banco e monta o `EstadoDeAcesso` (linha, uso, créditos,
  escola). `resumoDoAcesso` é o DTO da tela, com as decisões já tomadas.

### 3. Cota com trava por professor

`comCota` (`src/lib/server/billing/cota.ts`) conta e cria na mesma transação, com
`SELECT … FOR NO KEY UPDATE` na linha do professor. `NO KEY` porque serializa quem disputa a cota sem
bloquear inserts que só referenciam o professor (sessão, mídia, respostas). Os repositórios aceitam o
`tx` (`db: Db`) — com o cliente global a escrita iria por outra conexão e travaria no próprio lock.

As cinco portas de material passam por `gravarMateriais`: o lote aceita até onde cabe e devolve
`foraDoLimite`, em vez de recusar tudo.

### 4. Sem gateway por enquanto — provedor manual

Decisão do dono: **não integrar Stripe agora**, mas deixar a estrutura pronta.

- `BillingProvider` devolve resultado **discriminado** (`redirecionar` | `pedido`), porque o
  provedor manual não tem para onde redirecionar.
- `manual-provider.ts`: "assinar" cria um `PlanRequest` e um aviso à equipe (job `aviso-equipe`);
  a equipe combina o pagamento e **atende pelo painel interno**, que ativa o plano.
- `assinaturas.ts` é o **único escritor** dos campos de cobrança, e cada operação grava um
  `AuditEvent` na mesma transação, com o ator (`admin:<id>`, `professor`, `sistema`, `provedor`).
- O webhook `routes/api/stripe` continua dormente. Quando um gateway entrar, ele implementa
  `BillingProvider` e o webhook chama `assinaturas.ts` — nenhuma tela muda.

**Por que não o plugin de Stripe do Better Auth agora:** ele traz tabela de assinatura e webhook
próprios, e o estado precisaria ser espelhado no `Teacher`; com a escola cobrada por contrato e um
possível gateway com Pix, a interface própria é o caminho de menor acoplamento. A decisão pode ser
revista quando o gateway for escolhido.

### 5. Trial

Cadastro novo nasce `trialing` com `trialEndsAt = agora + 14 dias` (`TRIAL.dias`), carimbado em
`databaseHooks.user.create.before` — nunca por `defaultValue` (com `input: false`, um default em
função é copiado sem ser chamado). As contas antigas ganharam 14 dias **a partir do deploy** na
própria migration, para ninguém que já publicava ser travado na hora.

### 6. Degradação, não desligamento

**Links publicados nunca saem do ar por cobrança.** Isso resolve o conflito antigo entre
`billing.md` ("até o fim da carência") e a vitrine ("nunca"): vale "nunca". O Player não consulta
`entitlements.ts`. O que pausa é criar e publicar.

### 7. Segurança

Todos os campos de cobrança e o `avatar` são `input: false` no Better Auth (o corpo com eles é
recusado com 400). Os ids do gateway moram em `ProviderSubscription`, fora da linha do professor e
fora da sessão. Teste: `src/lib/server/auth/campos.test.ts`.

### 8. Atualização (novembro de 2026) — o gateway é o Mercado Pago

Decisão do dono: **Mercado Pago**. O esqueleto do Stripe saiu (cliente, webhook dormente,
`stripeCustomerId` e `StripeEvent` — os dois vazios, conferido antes da migration).

- **Assinatura sem plano associado** (`POST /preapproval` com `status: 'pending'`): o professor
  digita o cartão no checkout do Mercado Pago (`init_point`); o produto nunca vê número de cartão.
  `external_reference` é o id do professor. O valor sai de `$lib/billing/precos.ts`, o mesmo que a
  vitrine mostra (`precos.test.ts`); o anual é `frequency: 12`.
- **`ProviderSubscription`** guarda cada assinatura criada (id do provedor, plano, ciclo, status
  cru). O webhook só traz o id; é esta linha que diz de quem é e o que foi escolhido.
- **O webhook (`routes/api/mercadopago`) confere a assinatura e enfileira**; o worker (job
  `mercadopago`) busca o recurso na API e aplica por `assinaturas.ts`, com o ator `provedor`.
  Autorizada ativa até a próxima cobrança; fatura aprovada estende um ciclo, uma vez por fatura
  (`ProviderEvent`); cancelada ou pausada para a renovação no fim do período. Troca de plano
  cancela a assinatura antiga lá.
- **A volta do checkout relê** as assinaturas pendentes recentes (`sincronizarPendentes`) e a
  Conta mostra "confirmando" até o Mercado Pago autorizar. O redirect nunca libera nada sozinho.
- **Cancelar no fim do período** cancela PRIMEIRO no Mercado Pago (se ele recusar, nada muda aqui).
  Lá, cancelada não volta: "Desfazer cancelamento" vira "Assinar de novo".
- **Por que `fetch` e não o SDK**: são quatro chamadas, e o SDK seria uma dependência a mais para o
  worker carregar. As respostas passam por Zod.
- **O teste com cartão continua pendente**: o `free_trial` só está documentado no plano
  (`preapproval_plan`), não na assinatura avulsa. O caminho é um plano por (plano, ciclo) com
  `free_trial` e o cadastro levando ao checkout — decisão de produto, porque muda a primeira tela
  depois do cadastro.

## Pendências

- Preços reais (os de `planos.ts` seguem placeholder).
- Ligar o Mercado Pago (credenciais e webhook — `docs/operacao.md`) e conferir no sandbox os
  pontos que a documentação não fecha (billing.md "Mercado Pago").
- O teste exigindo cartão (seção 8).
- Ações de conta que não são cobrança (trocar senha, encerrar conta) continuam em mock.
