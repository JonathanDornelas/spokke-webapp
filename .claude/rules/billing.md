---
paths:
  - 'src/lib/server/billing/**'
  - 'src/lib/billing/**'
  - 'src/routes/api/mercadopago/**'
  - 'src/routes/(studio)/conta/**'
  - 'src/routes/(site)/planos/**'
  - 'src/routes/(admin)/**'
---

# Planos, limites e assinatura

Decisões e histórico: `docs/adr-002-billing.md` (planos e cobrança) e `docs/adr-003-ia-gemini.md`
(créditos). Aqui, as regras que o código segue.

## Os planos

| Plano     | Atividades                                    | Materiais | Créditos de IA / mês |
| --------- | --------------------------------------------- | --------- | -------------------- |
| `basico`  | 10                                            | 60        | — (sem IA)           |
| `pro`     | 30                                            | 300       | 300                  |
| `super`   | 80                                            | 1000      | 1000                 |
| `scholar` | contrato da escola (`docs/adr-005-escola.md`) |

Os números moram em **`src/lib/billing/catalogo.ts`** e em nenhum outro lugar. A vitrine
(`src/lib/content/planos.ts`) escreve os textos a partir dele; `catalogo.test.ts` falha se divergirem.
**O preço mora em `src/lib/billing/precos.ts`** (centavos) — é o que o checkout COBRA e o que a vitrine
MOSTRA (`planos.ts` escreve o texto a partir dele; `precos.test.ts` confere). Os valores continuam
placeholder.

**Os limites são de ESTOQUE** — contam o que existe agora. Atividade arquivada não conta; material
reaproveitado (`findEquivalent`) não ocupa vaga nova. Créditos renovam por ciclo mensal e não
acumulam.

## Um ponto de decisão

Não espalhe `subscriptionStatus === 'active'` pelo código.

- `entitlements.ts` (puro): `montarEstado`, `can(estado, capacidade)`, `cabe(estado, recurso, n)`,
  `motivoDoBloqueio`. **A situação sai das DATAS** (`trialEndsAt`, `currentPeriodEnd`,
  `gracePeriodEnd`) na leitura — nada de cron.
- `acesso.ts`: `acessoDoProfessor(teacher, db?)` busca linha, uso, créditos e escola e monta o
  `EstadoDeAcesso`. `resumoDoAcesso` é o DTO da tela, com as decisões já tomadas por `can()`.
- O `motivoDoBloqueio` usa a lista fechada de `src/lib/billing/motivos.ts`, a mesma que
  `/planos?motivo=` aceita.

## Cota: contar e criar na mesma trava

Toda criação que ocupa estoque passa por **`comCota`** (`cota.ts`): transação com
`SELECT … FOR NO KEY UPDATE` na linha do professor, leitura do estado com o `tx`, e a escrita com o
`tx`. Por isso os repositórios aceitam `db: Db` — usar o `prisma` global dentro dela é escrever por
outra conexão e travar no próprio lock. Nada de chamada de rede dentro da trava.

Material entra sempre por **`gravarMateriais`** (`src/lib/server/atividades/gravar-materiais.ts`):
reaproveita o igual, aceita o lote até onde cabe e devolve `foraDoLimite`.

## Um escritor da cobrança

**`assinaturas.ts`** é o único lugar que escreve `plan`, `subscriptionStatus`, `currentPeriodEnd` &
cia. Cada operação grava um `AuditEvent` na mesma transação, com o ator. Painel e (futuro) webhook
chamam as mesmas funções.

No Better Auth esses campos são **`input: false`**. Campo de cobrança novo nasce assim — sem isso o
corpo do cadastro escolhe o plano. Teste: `auth/campos.test.ts`. Os ids do gateway NÃO ficam no
`Teacher`: moram em `ProviderSubscription`, fora da sessão.

## Provedores: manual e Mercado Pago

`BillingProvider` devolve resultado discriminado (`redirecionar` | `pedido`). `BILLING_PROVIDER` vazio
é o **manual**: "assinar" vira `PlanRequest` + aviso à equipe, e o plano é ativado em
`/admin/pedidos`. `mercadopago` é o gateway (adr-002, seção 8), pronto e esperando credenciais
(`docs/operacao.md`); sem o token ele falha alto, nunca cai no manual em silêncio.

As três disciplinas:

1. **O webhook é a fonte da verdade, nunca o redirect.** E nem a notificação é a verdade: ela diz
   QUAL recurso mudou, e o worker o busca na API com o nosso token (`sincronizar.ts`). A volta do
   checkout também só RELÊ (`sincronizarPendentes`), e a tela diz "confirmando" até o provedor
   autorizar.
2. **O endpoint precisa do corpo cru** — `routes/api/mercadopago/+server.ts`, não form action nem
   remote function. Ele confere a `x-signature` (HMAC-SHA256 da linha
   `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`, com `MERCADOPAGO_WEBHOOK_SECRET`; sem o
   segredo, 503), enfileira o job `mercadopago` e responde 200 na hora.
3. **Idempotência**: aplicar o mesmo estado de assinatura não muda nada (o `jaVale` compara com a
   conta), e a fatura aprovada estende o período UMA vez — `ProviderEvent`
   (`mercadopago:fatura:<id>`) gravado na mesma transação da extensão.

## Mercado Pago — o que vale no código

- `src/lib/server/billing/mercadopago/`: `cliente.ts` (`fetch` + Zod, quatro chamadas),
  `webhook.ts` (assinatura e leitura da notificação, puro), `sincronizar.ts` (o estado do provedor
  aplicado à conta), `provider.ts` (o `BillingProvider`). Testes com cliente FALSO — o de verdade
  não entra em teste.
- **Assinatura sem plano associado**, `status: 'pending'`, `external_reference` = id do professor
  (conferido contra a `ProviderSubscription` em toda aplicação: divergiu, é ignorada).
- **`authorized`** ativa até `next_payment_date` (ou um ciclo); **fatura aprovada** estende um ciclo
  a partir do débito, sem dar mês de graça na primeira (que chega junto da autorização);
  **`cancelled`/`paused`** marcam o cancelamento no fim do período — só se for a assinatura em
  vigor: a antiga, cancelada pela troca de plano, chega depois e não pode derrubar a nova.
- **Cancelar no fim do período** chama `cancelarRenovacao` ANTES de `cancelar`. Lá, cancelada não
  volta (`podeDesfazerCancelamento: false`).
- **404 do provedor** termina o job sem erro (é o "testar notificação" do painel ou outro app).
- **A conferir no sandbox** antes de produção — a documentação não fecha: se as notificações de
  assinatura vêm pelo painel de Webhooks, a grafia que o `PUT` de cancelar aceita (`cancelled`) e
  o formato exato do corpo da notificação.

## Trial

Cadastro novo: `trialing` com `trialEndsAt = agora + TRIAL.dias`, carimbado em
`databaseHooks.user.create.before`. Nunca `defaultValue` em campo `input: false` (é copiado sem ser
chamado quando o corpo traz a chave). Trial usa os limites do básico.

**O teste exige cartão** (decisão do dono, 2026-11-02). Depende do gateway, porque o produto nunca
recebe número de cartão: quem guarda o cartão é o gateway (o checkout do Mercado Pago, com o PCI
do lado dele), e o nosso banco só fica com a referência da assinatura (`ProviderSubscription`). No
Mercado Pago o `free_trial` só está documentado no PLANO (`preapproval_plan`), então ligar isso é
um plano por (plano, ciclo) com teste grátis e o cadastro levando ao checkout (adr-002, seção 8). **Até lá o cadastro continua abrindo o teste sem pedir
cartão** e nenhuma tela promete "sem cartão": a copy diz só "14 dias grátis", que é verdade antes e
depois.

## Degradação, não desligamento

Plano vencido **não apaga nada e não derruba link publicado** — nunca, não só "até a carência".
O que pausa é criar e publicar. O Player não consulta `entitlements.ts`. Aluno no meio de uma
tentativa nunca é afetado pela cobrança do professor.
