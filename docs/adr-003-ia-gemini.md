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

### 6. Imagem e vídeo (2026-11-11)

As duas fontes que a tela já desenhava ao lado do prompt passaram a funcionar: a **foto** de uma
página (livro, lousa, caderno) e a **fala** de um vídeo. O resto do fluxo é o mesmo: a IA propõe, o
professor marca, nada entra antes da confirmação.

- **A foto vai inteira para a IA.** O navegador reduz a 1.568 px no lado maior e recodifica em JPEG
  (`$lib/client/arquivo-ia.ts`): a foto fica bem abaixo dos limites dos provedores e perde os
  metadados da câmera, inclusive a localização. O Claude e o Gemini leem imagem.
- **O vídeo nunca sobe.** O navegador decodifica o áudio já a 16 kHz e num canal, o professor
  escolhe o trecho, e só a fala dele vai, num WAV de 8 bits: dez minutos dão 9,6 MB, abaixo do
  `BODY_SIZE_LIMIT` de produção (10M) e do envio inline do Gemini, sem Files API. Os 8 bits são a
  troca consciente: com o pico normalizado a voz fica nítida, e a faixa de 16 kHz guarda as
  sibilantes que um áudio de telefone (8 kHz) perderia. A fala vai ao **Gemini**, que lê áudio; o
  Claude não lê, e a fila pula ele (`reserva.ts` só passa o pedido a quem `le` aquele tipo).
- **Teto de 10 minutos de fala por geração** (`MAXIMO_DE_FALA_S`). O vídeo pode ser mais longo; o
  trecho escolhido é que cabe no teto.
- **Por um endpoint, não uma remote function**: `POST /materiais/ia/arquivo`
  (`routes/(studio)/materiais/ia/arquivo/+server.ts`), multipart, com o guard do professor e a
  atividade pelo repositório escopado. O tipo da foto é decidido pelos BYTES, e a duração da fala
  sai do cabeçalho do WAV que chegou (`$lib/ia/arquivo.ts`, o mesmo módulo que o navegador usa para
  montar o arquivo).
- **Nada é guardado.** O arquivo vive na memória da requisição: não passa pelo bucket nem pelo
  banco. O `AiUsage` grava a fonte e os segundos de fala, nunca o arquivo.

**Os créditos.** Ler o arquivo custa além das propostas, e a conta é `custoDaGeracao`
(`$lib/billing/ia.ts`), a MESMA no botão da tela e no débito:

| Fonte  | Créditos                                                   |
| ------ | ---------------------------------------------------------- |
| Prompt | 1 por proposta                                             |
| Foto   | 1 por proposta + **1** pela leitura da foto                |
| Vídeo  | 1 por proposta + **1 por minuto de fala começado**         |

De onde saem os números, no preço do Gemini 3.8 Flash a partir de 1/1/2027 (o da conta dos planos,
adr-002 "Preços": US$ 1,50 por milhão de tokens de entrada, dólar a R$ 5,60 e IOF de 3,5%, ou
R$ 8,69 por milhão). A página de preços do Google dá UM preço de entrada para texto, imagem, vídeo e
áudio nesse modelo, e a de resolução de mídia diz quantos tokens cada coisa vira no Gemini 3:

- **Foto**: 1.120 tokens no nível padrão, que já é o mais alto dos comuns. R$ 0,0097 por foto.
- **Fala**: 25 tokens por segundo em qualquer nível, 1.500 por minuto. R$ 0,013 por minuto.

O pior caso de um crédito na conta dos planos é R$ 0,030 (textos em lote, raciocínio mínimo). Com
um crédito por foto e um por minuto, ler um arquivo nunca custa mais por crédito do que esse pior
caso, então a regra dos preços continua valendo sem mudar plano nenhum: gastar o ciclo inteiro em
vídeo sai mais barato por crédito do que gastá-lo em textos. A saída e o raciocínio de uma geração
com arquivo são os mesmos de uma com prompt, e já estão no crédito de cada proposta.

**Estorno**: as propostas que não servem voltam, como sempre. A leitura fica cobrada quando ao menos
uma proposta serviu (o modelo leu o arquivo inteiro, e o professor levou material); sem nenhuma,
volta TUDO, leitura junto. Arquivo que nenhum provedor ligado lê é recusado antes de cobrar.

Com o Claude na frente da fila, a mesma foto custa mais em dólar: no Opus 5.5 (US$ 4 por milhão),
uma foto de 1.568 × 1.176 px vira ~2.460 tokens, uns US$ 0,0098. Os créditos seguem a conta do
Gemini, que é a dos preços; o Claude é pago pelos créditos mensais da API (decisão do dono, seção 2).

**Medir**: `AiUsage.source` (`prompt`, `imagem`, `video`) e `AiUsage.mediaSeconds` separam, na
consulta de adr-002, os tokens de ler o arquivo dos de escrever as propostas.

## Privacidade

O pedido do professor e os nomes dos idiomas vão ao provedor (Claude ou Gemini); nenhum dado de
aluno. Com foto ou vídeo, vão também a foto e a fala do trecho escolhido, lidas uma vez e não
guardadas pelo Spokke; a tela pede material do professor ou didático, sem imagem nem voz de aluno. A
política de privacidade diz isso, e afirma o uso da **modalidade paga** das APIs (sem uso para
treinamento) — **quem opera precisa garantir que as chaves são de projetos com faturamento ativo**;
a camada gratuita do Gemini pode usar os dados para melhorar o produto.

## Pendências

- Medir no `AiUsage` os tokens reais de foto e de minuto de fala, e refazer a tabela da seção 6 se
  o medido passar do estimado.
- Vídeo maior que 1 GB não é aberto no navegador (ele carrega o arquivo inteiro para decodificar).
  Se virar queixa, extrair o áudio com WebCodecs, em partes.
