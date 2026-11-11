# ADR-003 — Geração de material por IA (Gemini) e créditos

**Estado:** aceito · outubro de 2026

## Contexto

"Gerar com IA" existia só como tela em `MaterialForm.svelte`, com o botão travado. Os planos Pro e
Super vendem créditos de IA, então a geração precisava existir de verdade. O dono escolheu o
**Gemini**.

## Decisões

### 1. O que a IA faz — e o que não faz

A IA **propõe materiais** (pares de frases, vocabulário, textos com perguntas, diálogos) a partir de
um pedido do professor. Ela **não** gera exercícios: os exercícios continuam saindo dos geradores
determinísticos do kernel. Nada entra na biblioteca antes de o professor marcar e confirmar.

### 2. Atrás de interface própria

`src/lib/server/ia/` — `provider.ts` (interface), `gemini-provider.ts` (`@google/genai`),
`index.ts` (lê `LLM_PROVIDER`; vazio = IA desligada, como `TTS_PROVIDER`). Nenhum código de produto
importa o SDK.

- **Saída estruturada**: o JSON Schema vai em `responseJsonSchema`, gerado com `z.toJSONSchema` a
  partir do MESMO Zod que valida a volta (`schemas.ts`).
- **Tudo é revalidado** contra `contentUnitSchemas` do kernel — a régua da autoria manual. O schema da
  proposta não tem `note` (a nota é do professor) nem `imageMediaId`.
- **O id do modelo não está no código**: `GEMINI_MODEL`. O catálogo do Gemini muda de nome com
  frequência; quem opera escolhe o Flash estável vigente.
- **Raciocínio mínimo** (atualização de 2026-11-11): o modelo roda com o menor raciocínio que aceita
  (`raciocinioMinimo`), porque esses tokens são cobrados como saída e os preços dos planos foram
  calculados assim (`docs/adr-002-billing.md` "Preços"). Cada geração respondida grava os tokens que
  o Gemini informou em `AiUsage`.
- **O Claude na frente, o Gemini de reserva** (decisão do dono, 2026-11-11: os créditos mensais da
  API do Claude vêm primeiro). `LLM_PROVIDER` virou uma FILA em ordem (`"claude,gemini"`), e
  `reserva.ts` passa o mesmo pedido ao seguinte quando o anterior falha — sem créditos (o
  `billing_error` 402, lido pelo tipo do erro, nunca pelo texto), sobrecarga, recusa ou tempo. O
  crédito do professor é debitado uma vez, e falhar em todos estorna como sempre. O Claude
  (`claude-provider.ts`, `@anthropic-ai/sdk`) usa saída estruturada pelo MESMO Zod do envelope
  (`betaZodOutputFormat`), `effort: "low"` (o raciocínio não desliga nos Claude atuais; o esforço
  baixo é o mínimo) e a reserva do próprio servidor numa recusa de política (`fallbacks:
"default"`, só nos modelos que a oferecem). `AiUsage.model` grava quem respondeu de fato. O
  modelo vem de `CLAUDE_MODEL`; a política de privacidade cita a Anthropic junto do Google.
- **Nem todo modelo aceita o mínimo** (2026-11-11): o `gemini-3.8-flash` recusa o MINIMAL com 400, e
  o provedor sobe para o LOW sozinho (`raciocinioAcima`). O LOW gasta raciocínio que a conta dos
  preços não previa — com ele, a tabela de adr-002 vira estimativa por baixo até o `AiUsage` medir.
  O `gemini-3.6-flash` aceita o mínimo: medido, 3 pares de frases em 1,5 s, 182 tokens de entrada,
  118 de saída e nenhum de raciocínio.
- **Agnóstico de idioma**: o prompt (`prompt.ts`) só recebe rótulos de idioma do `LanguageProfile`.
  Um teste garante que a estrutura é a mesma para todo profile. O texto do professor vai delimitado,
  como dado, depois das instruções.

### 3. Créditos como livro-razão

`CreditEntry` guarda só lançamentos (débito, estorno, cortesia). Saldo = franquia do plano em vigor
**mais** a soma dos lançamentos do ciclo atual (`cicloInicio`). Não existe escrita de "reset":
virar o mês é só o ciclo mudar, e trocar de plano no meio do ciclo vale na hora.

O ciclo é mensal, ancorado no dia da ativação (`Teacher.cycleAnchor`; na escola, a data de entrada),
com dia 31 caindo no último dia dos meses curtos (`src/lib/billing/ciclo.ts`).

### 4. Fluxo e idempotência

`gerarPropostas` (`src/lib/server/ia/gerar.ts`):

1. Debita `quantos × CUSTO_IA` numa transação curta, sob a trava por professor. O `refKey` é o
   `requestId` gerado no cliente: clique duplo debita uma vez.
2. Chama o provedor **fora** da transação, com teto de 45 s.
3. Valida, remove repetidas e marca "você já tem" (`findEquivalent`).
4. Estorna o que não veio ou não serviu (`<requestId>:estorno`, no mesmo ciclo do débito).

Aceitar (`aceitarPropostasIa`) revalida no servidor e grava por `gravarMateriais` — com a cota de
estoque, igual à autoria manual.

### 5. Regras de plano

`can(estado, 'usar_ia')` exige plano com IA **e** saldo. O Básico não gera nem com crédito de
cortesia. Créditos de cortesia (painel interno) valem só no ciclo atual.

## Privacidade

O pedido do professor e os nomes dos idiomas vão ao Google; nenhum dado de aluno. A política de
privacidade diz isso, e afirma o uso da **modalidade paga** da API (sem uso para treinamento) —
**quem opera precisa garantir que a chave é de um projeto com faturamento ativo**; a camada gratuita
do Gemini pode usar os dados para melhorar o produto.

## Pendências

- Fonte por imagem e por vídeo (o Gemini aceita; falta upload e leitura de arquivo).
- Custo diferente por fonte, se imagem e vídeo entrarem (`CUSTO_IA`).
