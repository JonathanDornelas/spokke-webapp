---
paths:
  - '**/*.test.ts'
  - '**/*.spec.ts'
  - 'e2e/**'
---

# Testes

Vitest para unidade e integração, Playwright para o fluxo do aluno.

O kernel é onde a cobertura importa. Componente de UI raramente merece teste unitário; grader e
tokenização merecem sempre.

## Obrigatório por tipo de interação

Nenhum tipo novo entra sem estes quatro:

1. `grade()` com resposta **certa**, **errada** e **quase certa** (a terceira é a que pega bug).
2. `toRuntime()` provando que nenhum elemento de `accepted` aparece na saída. Este é o teste que
   sustenta a regra inviolável nº 1 — sem ele o gabarito vaza mais cedo ou mais tarde.
3. Pelo menos um idioma **sem espaço entre palavras** (`ja`, `zh` ou `th`).
4. Pelo menos um idioma com **diacrítico**, testado nas formas composta e pré-composta do mesmo
   caractere. Este teste existe porque `é` digitado como `e` + acento não é o mesmo code point
   que `é` pré-composto, e sem normalização o aluno vê "errado" numa resposta certa.

## Obrigatório em repositório

Todo repositório precisa de um teste provando que ele **não** devolve dado de outro professor.
É a regra inviolável nº 4, e é o cenário de vazamento mais provável do produto. O sino também
(`repos/notificacoes.test.ts`): o de um não aparece nem se marca pelo outro, a mesma chave agrupa
só enquanto não lida, e ligar a conta avisa uma vez só. E o convite de conta
(`repos/convites-de-conta.test.ts`): o professor só gera convite da própria chamada, o token é o
que diz qual ficha, e ficha ligada não muda de dono.

Vale também para LEITURA que junta várias áreas: o início do Studio (`server/inicio/painel.test.ts`)
procura o nome da aluna, o título da atividade e o nome da turma do outro professor no JSON
INTEIRO, não só nas contagens — é a tela onde um `teacherId` esquecido apareceria primeiro.

## Obrigatório em cota, crédito e acesso

O que protege dinheiro e acesso tem teste contra o banco, não só unitário:

- **Corrida na última vaga**: duas criações simultâneas com uma vaga — exatamente uma passa
  (`billing/cota.test.ts`). Vale para assento de escola também (`escola/escola.test.ts`).
- **Programação de envio de módulo**: a conta das datas é pura e tem os casos de calendário
  (`modulos/programacao.test.ts`: toda quinta, duas por vez, dia 31 no mês curto, agenda atrasada
  recomeçando de hoje, fuso de Brasília); o envio, contra o banco (`repos/modules.test.ts`): alocar
  confere as duas pontas, outro professor não programa, "tudo agora" LIBERA só o que está no ar,
  para todos os alunos (o sem e-mail também) e sem nenhum job de e-mail, processar de novo não manda nada duas vezes, e o futuro não sai antes. A
  AGENDA (calendário e "próximos 7 dias") tem a parte pura em `modulos/agenda.test.ts` (dia e hora
  de Brasília, um cartão por turma por dia, mês começando na segunda) e a do banco no mesmo
  `modules.test.ts`: outro professor não lê, programação pausada some, o que saiu fica no dia em
  que saiu, e duplicar não leva turma. E a programação antiga, gravada com o `canal` "por
  e-mail", também só libera.
- **Créditos**: débitos simultâneos nunca passam do saldo, o mesmo `requestId` debita uma vez, e falha
  do provedor estorna tudo (`ia/gerar.test.ts`, com provedor FALSO — o Gemini de verdade não entra em
  teste).
- **Campos de cobrança** não vêm do corpo do cadastro nem de `update-user` (`auth/campos.test.ts`).
- **Leituras entre professores** não carregam dado de aluno: o painel (`admin.test.ts`) e a
  coordenação (`escola.test.ts`) são conferidos procurando o nome e a resposta da aluna no JSON.
- A matriz de situações de `entitlements.ts` (trial, carência, cancelada, escola) é unitária e pura.

## Geradores

Gerador é função pura: mesmo `ContentUnit` e mesmo `LanguageProfile` produzem o mesmo `Item[]`.
Teste inclui o caso de conjunto pequeno demais para gerar distratores — o esperado é
**retornar menos itens**, nunca inventar distrator.

## Idiomas

Três arquivos, e cada um responde uma pergunta diferente:

- **`language/profiles.test.ts`** — a COERÊNCIA do cadastro. Toda voz existe no catálogo do
  Kokoro e pertence àquele idioma (voz de outro idioma não dá erro: ela sintetiza, com o sotaque
  errado); todo idioma tem rótulo e o rótulo volta na tag; nenhum idioma do provedor ficou de
  fora; `lowercase` só onde existe caixa; nenhuma variante de `equivalences` está fora da forma
  normalizada. O mapa tag → letra do Kokoro mora NO TESTE, não no profile — se morasse no
  profile, ele concordaria consigo mesmo e o teste não provaria nada.
- **`language/normalize-idiomas.test.ts`** — a DECISÃO de `diacritics`, um bloco por escrita. É
  onde mora a regressão do dakuten japonês (ver kernel.md): `が` ≠ `か`, `ば` ≠ `ぱ`, e o mesmo
  para matra e virama em devanágari e para tom em pinyin. Duas palavras diferentes não podem
  comparar iguais; a mesma palavra escrita de duas formas legítimas tem de comparar igual.
- **`generators/atividade-por-idioma.test.ts`** — uma atividade INTEIRA em cada um dos nove
  idiomas do Kokoro, mais o árabe como controle. O payload é o que o gerador produziu, não um
  exemplo à mão, e é por isso que ele pega o que os testes por interação não pegam: gabarito
  atravessando `toRuntime` pelo caminho real, escuta gerada em idioma sem voz, voz de outro
  idioma, tokenização que devolve a frase inteira como um token.
- **`language/teclados.test.ts`** — o TECLADO contra o profile que o usa. A pergunta não é "o
  layout está bonito", é "o que ele oferece chega à correção?": toda letra que ele ESCREVE (em
  cada variante e pelas teclas de ação) sobrevive ao normalizador, nenhuma vira outra onde a
  marca é `significant`, dígito de outro sistema só onde o profile o liga ao ocidental, tecla de
  ação desfaz a si mesma. E o ALCANCE: kana alcança `おはよう` e não alcança `私`; pinyin
  alcança `wǒmen` e não alcança `我们`. Junto, `atividade-por-idioma.test.ts` prova que nada
  fora do alcance é pedido quando não há transcritor; `leitura.test.ts`, que a linha "Leitura"
  não mente (`っ`, `きゃ`, o "a" implícito do devanágari); e `runtime.test.ts`, que o teclado só
  vai no item certo.
- **`language/escrita.test.ts`** + **`server/escrita/escrita.test.ts`** — a LEITURA no gabarito.
  O primeiro prova a regra com um transcritor de mentira (quando pedir, o contexto da lacuna, a
  leitura do professor vence). O segundo usa o kuromoji e o pinyin-pro de verdade, com as
  armadilhas de leitura de livro didático (`今日`, `会い`, `银行`), e fecha o circuito: a questão
  existe, e a resposta escrita com o teclado do idioma leva nota 1 — inclusive numa questão
  antiga, com o gabarito só em kanji. Uma leitura errada ali reprova quem acertou.

**O árabe é o caso de controle e não pode sair da lista**: sem voz, a atividade tem de sair
COMPLETA e sem nenhum item de escuta. É isso que faz "idioma sem TTS" ser um estado normal em vez
de uma publicação travada.

## E2E

Um cenário mínimo que precisa passar sempre: abrir link publicado, digitar nome, responder itens
de três interações diferentes, ver resultado. E o mesmo fluxo com feedback desabilitado,
confirmando que nada de gabarito chega ao browser.

Teste de determinismo: duas cargas da mesma tentativa produzem a mesma ordem de alternativas.

**Os três estão em `e2e/aluno.spec.ts`** (`pnpm test:e2e`, contra o `preview` na 4173 e o banco do
`.env`). A semente (`e2e/semente.ts`, via `globalSetup`/`globalTeardown`) cria um professor
descartável e duas atividades publicadas só de texto — escolher, montar e digitar, sem áudio, para
não depender da fila de TTS —, uma com o resultado liberado e outra sem, e tira tudo no fim,
tentativas incluídas. O cenário sem resultado guarda o corpo de TODA resposta (HTML e remote
functions) e procura a frase do gabarito, `correctIndex` e `accepted`. Duas coisas que custaram
falha: **esperar a questão nova** antes de clicar (a troca anima a saída, e o clique cai na que vai
embora) e que **sem resultado a tela segue sozinha** depois de "Verificar" — `seguir()` cobre os dois
modos. Cenário de professor LOGADO continua fora: no `preview` a autenticação fica presa ao
`BETTER_AUTH_URL` do `.env` (auth.md).
