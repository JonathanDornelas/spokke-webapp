# Módulos — as telas do professor

Brief funcional das telas de módulo do Studio, para quem vai redesenhá-las. Descreve **o que está
na tela, o que ela faz e o que não pode quebrar**, não a aparência: a aparência é o trabalho do
redesenho. O lado do aluno (o mapa do módulo) está em `docs/telas-modulos-aluno.md`.

Cada bloco diz em que estado está:

- **Hoje** — funciona de verdade, com loader real e banco.
- **Novo** — ainda não existe. A regra está decidida aqui ou marcada como **decisão em aberto**.

> **Implementado em outubro de 2026**, a partir do desenho do Claude Design. O que era **Novo**
> aqui existe; as decisões estão no fim e na atualização de `docs/adr-004-modulos-e-nivel.md`.
> Depois vieram os desenhos "Studio Modulos v2" (a lista com o aviso do topo, os 7 dias de todos os
> módulos, filtros com contagem e uma linha por turma), "Studio Calendario"
> (`(studio)/modulos/calendario`) e os "Próximos 7 dias" no módulo aberto — paginas.md "Módulos".

O que vale sobre tudo isto e não se repete aqui:

- **Tokens, tipografia, movimento e acessibilidade**: `.claude/rules/design-system.md`.
- **Componentes existentes** (`HeaderCard`, `Badge`, `Alert`, `Loading`, `Pagination`,
  `AmbientShapes`…): `.claude/rules/components.md`. Reutilize antes de inventar.
- **Regras de produto que atravessam telas**: `.claude/rules/paginas.md`. A decisão de origem é
  `docs/adr-004-modulos-e-nivel.md`.

Três coisas valem em TODAS estas telas:

1. **Estado nunca é comunicado só por cor.** Ícone e texto, sempre.
2. **Verde, âmbar e vermelho são reservados para a semântica de correção.** "Enviada" não é
   "acertou". Azul (#3659CB) é a marca, teal é áudio. Vermelho só aparece no estado que pede ação (o
   envio que não saiu).
3. **O Studio é desktop com sessão longa** e pode ser denso. Mas toda tela tem versão de celular,
   e ela não pode virar rolagem lateral.

---

## O que é um módulo

Uma **sequência ordenada de atividades** que andam juntas: "Intermediário", "Frutas", "Unidade 3".
A mesma atividade pode estar em vários módulos. Apagar o módulo não apaga atividade nenhuma: só o
agrupamento some.

Hoje o módulo serve para duas coisas: organizar a lista de atividades (filtro) e mandar tudo de
uma vez para uma turma. O redesenho acrescenta três:

| Novo                     | O que muda                                                                                            |
| ------------------------ | ----------------------------------------------------------------------------------------------------- |
| **Turma alocada**        | O módulo passa a ter turmas. **Só uma turma alocada recebe envio do módulo.**                         |
| **Programação de envio** | Por turma: quais atividades e quando, seja tudo agora, uma por semana, toda quinta ou em datas fixas. |
| **Mapa do aluno**        | O aluno com conta vê o módulo no painel dele, com o progresso em fases (`telas-modulos-aluno.md`).    |

Vocabulário da interface, para todas as telas falarem igual:

- **Módulo**: a coleção.
- **Turmas do módulo**: as turmas alocadas. Na tela, "alocar" vira **"Adicionar turma"**.
- **Programação**: o plano de envio de UMA turma.
- **Envio**: uma saída de e-mails, com uma ou mais atividades, para uma turma.
- **Fase**: palavra SÓ do aluno. O professor vê "atividade".

---

## 1. Módulos — listagem

`(studio)/modulos` · **Hoje**, com acréscimos **Novos**.

### O que a tela responde

"Quais módulos eu tenho, para quem estão indo e qual é o próximo envio."

### Na tela

- **Título + total** (`N módulos`) e **"Novo módulo"** como ação primária.
- **Um cartão por módulo**:

  | dado                                    | estado | por que está lá                                                        |
  | --------------------------------------- | ------ | ---------------------------------------------------------------------- |
  | Etiqueta de 2 letras + cor              | Hoje   | identidade visual rápida; a cor é escolhida na criação                 |
  | Nome                                    | Hoje   |                                                                        |
  | `N atividades · N no ar`                | Hoje   | "no ar" é o que de fato pode ser enviado                               |
  | Turmas do módulo (etiquetas das turmas) | Novo   | para quem ele está indo, sem abrir                                     |
  | **Próximo envio**                       | Novo   | "qui 16/10 · 8º A · Frutas 3". É a pergunta da semana do professor.    |
  | Programação pausada / envio que falhou  | Novo   | o único estado da listagem que pede ação, e por isso tem ícone e texto |

- **Criar** é um formulário curto na própria tela: nome e cor. As atividades e as turmas entram
  depois, no módulo aberto. Não vira um wizard: um módulo é barato de criar.
- **Vazio**: hero, como o de atividades e o de turmas. Diz o GANHO ("organiza a sua lista e manda
  tudo para a turma no ritmo que você escolher") e que **não é obrigatório**: as atividades
  continuam funcionando sozinhas.

### Cores de etiqueta

As mesmas cinco das turmas (`$lib/etiquetas.ts`): azul, teal, violeta, magenta e ardósia. Nunca
verde nem âmbar.

---

## 2. Módulo — detalhe

`(studio)/modulos/[id]` · **Hoje**, com três blocos **Novos**.

A tela mais densa. Ela responde, nesta ordem: o que é este módulo, o que tem dentro e em que
ordem, para quais turmas ele vai, e quando cada coisa sai.

### 2.1 Cabeçalho — Hoje

`HeaderCard`: etiqueta, "Módulo", nome, descrição (quando houver) e "Editar módulo".

Números hoje: `atividades` · `no ar` (azul) · `fora do ar` · `envios`. **Novo**: entram
`turmas` e `próximo envio` (data curta). `fora do ar` pode sair: o bloco da lista já diz isso
por linha. Máximo de quatro números.

**Editar** abre no lugar: nome, cor e descrição. A descrição existe no banco e hoje não é
editável pela tela; é uma lacuna a fechar.

**Apagar o módulo** fica no fim da tela, com a consequência dita em texto antes de perguntar. As
atividades ficam; **com programação ativa, os envios futuros são cancelados** (Novo); os já
enviados continuam valendo (o link é da atividade, não do módulo).

### 2.2 As atividades, na ordem — Hoje

Uma linha por atividade, com:

| dado                                     | por que está lá                                                       |
| ---------------------------------------- | --------------------------------------------------------------------- |
| Posição (mono)                           | é a ordem do e-mail e do mapa do aluno                                |
| Título (link para a atividade)           |                                                                       |
| Idioma · nível · N questões              | o nível é o rótulo CEFR (A1–C2), opcional                             |
| Estado: **no ar** / rascunho / arquivada | só "no ar" sai num envio; a pílula diz isso antes do professor tentar |
| Subir · descer · tirar do módulo         | ações da linha                                                        |

- **Reordenar é arrastar E as setas**, como o "ordenar" do Player. Arrastar é o gesto natural; as
  setas funcionam no teclado e no leitor de tela e dizem o que fazem. Quem arrasta é a linha
  inteira; a alça de pontinhos é decorativa.
- A ordem é salva ao soltar. Com programação ativa, **reordenar muda a ordem do que AINDA NÃO
  saiu** (Novo); o que já foi enviado não se mexe, e a tela diz isso.
- **"Acrescentar atividades"**: seleção múltipla das atividades do professor que ainda não estão
  no módulo. As arquivadas ficam fora, e cada uma mostra se está no ar e o nível. Entram no FIM.
  Com programação ativa, entram no fim da fila de cada turma (Novo).

### 2.3 Turmas do módulo — Novo

Lista das turmas alocadas e **"Adicionar turma"** (seleção entre as turmas do professor).

Por turma:

- etiqueta, nome e `N alunos · N com e-mail`;
- o resumo da programação dela: "toda quinta, 8h · 3 de 8 enviadas · próxima qui 16/10";
- o estado da programação: **Ativa**, **Pausada**, **Concluída** (todas enviadas), **Sem
  programação** (alocada, nada enviado ainda) ou **Com envio que não saiu** (o único em vermelho);
- ações: abrir a programação, pausar/retomar, tirar a turma do módulo.

**Tirar a turma do módulo** cancela os envios futuros dela. O que já foi enviado continua valendo,
porque o link é da atividade. O módulo some do mapa dos alunos daquela turma. A tela diz as três
coisas antes de perguntar.

> **Por que a alocação existe.** Hoje qualquer turma recebe o módulo num clique. A alocação é o
> que dá ao módulo uma relação durável com a turma: é ela que sustenta a programação (enviar
> depois exige saber para quem) e o mapa do aluno (o aluno só vê o módulo da turma dele). Enviar
> passa a exigir a turma alocada.

O mesmo vínculo aparece na **tela da turma** (`turmas/[id]`): um bloco "Módulos desta turma" com
o próximo envio e um atalho para a programação. O histórico da turma já marca "módulo X" nos
envios que vieram de um módulo (Hoje).

### 2.4 Programação de envio — Novo

O coração do redesenho. **Uma programação por turma**: o 8º A pode começar nesta semana e o 8º B
no mês que vem, com o mesmo módulo. "Copiar de outra turma" evita refazer.

Abre em painel ou tela própria, a partir da linha da turma. Tem três partes: **quais**,
**quando** e **a prévia**.

**Quais atividades.** Por padrão, todas, na ordem do módulo. O professor pode desmarcar
qualquer uma; a desmarcada não sai para esta turma e não aparece no mapa destes alunos. A ordem é
sempre a do módulo: reordenar se faz no bloco 2.2, num lugar só.

**Quando.** Quatro modos:

| modo                 | campos                                                                    | exemplo do professor                  |
| -------------------- | ------------------------------------------------------------------------- | ------------------------------------- |
| **Tudo agora**       | nenhum (é o envio de hoje)                                                | "manda tudo"                          |
| **Por semana**       | dia(s) da semana, horário, quantas por vez (1 de padrão), data de início  | "toda quinta", "segunda e quarta, 8h" |
| **Por intervalo**    | a cada N dias, semanas ou meses, horário, quantas por vez, data de início | "1 por semana", "1 por mês"           |
| **Datas escolhidas** | uma data e um horário por atividade                                       | "a 3 sai na véspera da prova"         |

- Horário com padrão de 8h, e o fuso escrito na tela (o do professor, ver "Notas").
- No "1 por mês", **dia 31 vira o último dia do mês**, a mesma regra do ciclo de créditos
  (`$lib/billing/ciclo.ts`). A prévia mostra a data real.
- Data de início no passado não existe: o primeiro envio é "agora" ou uma data futura.

**A prévia é a parte mais importante da tela.** É uma linha do tempo com cada atividade, a data
calculada e quantos e-mails saem naquele dia:

```
qui 16/10 · 08:00   Frutas 1 — vocabulário        28 e-mails
qui 23/10 · 08:00   Frutas 2 — na feira           28 e-mails
qui 30/10 · 08:00   Frutas 3 — receita            ⚠ ainda é rascunho
qui 06/11 · 08:00   Frutas 4 — diálogo            28 e-mails
```

Ela recalcula enquanto o professor mexe nos campos. É o único jeito de ele conferir "toda quinta,
uma por vez" antes de salvar, sem fazer conta de calendário de cabeça.

**Estados de cada linha da linha do tempo** (texto e ícone, sempre):

| estado       | significa                                                                      | ação na linha                                 |
| ------------ | ------------------------------------------------------------------------------ | --------------------------------------------- |
| Programada   | vai sair na data                                                               | adiar, pular, **enviar agora**                |
| Enviada      | saiu: data real e "N e-mails na fila", nunca "chegou"                          | reenviar para quem não abriu (Hoje, na turma) |
| **Não saiu** | chegou a hora e a atividade não pôde ir: rascunho, arquivada ou áudio faltando | o motivo escrito e "tentar de novo"           |
| Pulada       | o professor tirou só esta da fila                                              | desfazer                                      |
| Pausada      | a programação inteira está parada                                              | retomar                                       |

**O que acontece quando a atividade não está pronta na hora.** Ela **não é pulada em silêncio**.
O envio daquela data espera, a linha vira "Não saiu" com o motivo, e o cartão do módulo e a
listagem acendem o aviso. Áudio faltando é o caso comum e se resolve sozinho: o envio já pede a
síntese e tenta de novo em alguns minutos (a mesma regra de hoje, que barra o envio inteiro sem
áudio). Rascunho e arquivada precisam do professor. A prévia já avisa isso ANTES da data: na
linha do exemplo acima, a Frutas 3 ainda é rascunho.

**Editar uma programação ativa vale só para o que ainda não saiu.** O que foi enviado é fato, e a
tela mostra as linhas enviadas travadas, acima das futuras.

**Ações da programação inteira**: salvar, pausar/retomar e **"enviar a próxima agora"** (adianta a
próxima da fila sem mexer nas outras datas, ou empurrando as seguintes: **decisão em aberto**).

**O e-mail.** Continua sendo **um e-mail por aluno por envio**, com todas as atividades que saem
naquele envio, na ordem do módulo (job `convite-modulo`, Hoje). No modo "Tudo agora" é o e-mail
de hoje; numa programação semanal, cada quinta é um e-mail. Quem tem conta ganha, no e-mail, o
caminho para o mapa do módulo (`telas-modulos-aluno.md`). O link da atividade continua sendo o
caminho principal, e a conta continua opcional.

**Limite de e-mail.** O plano grátis do Resend dá 100 e-mails por dia (`server.md` "E-mail"). A
prévia soma os e-mails do dia, considerando as outras programações do professor, e avisa quando a
data passa do teto. Não bloqueia: a fila espera, e a tela diz isso.

### 2.5 Histórico de envios — Hoje (só o número) → Novo (a lista)

Hoje o cabeçalho só conta `envios`. Novo: uma lista curta por turma, com data, as atividades
daquele envio, `N e-mails` e abriram/terminaram, no mesmo desenho dos "Atividades enviadas" da
turma. Cada linha leva ao resultado da atividade.

### 2.6 "Ver como o aluno vê" — Novo, opcional

Prévia do mapa do aluno, sem progresso de ninguém: as fases na ordem, com os estados "liberada" e
"abre em…" da programação de uma turma escolhida. Ela ajuda a entender o que a programação produz
do outro lado. Não mostra dado de aluno nenhum.

---

## Hoje, e o que o redesenho precisa consertar

- O detalhe tem uma coluna principal (a lista) e uma lateral de 340px com "Enviar para turma"
  (escolher turmas + enviar) e "Acrescentar atividades". No celular, tudo empilha.
- **A confirmação de envio está em verde** (`text-success`). Isso fere a regra 2: "enviado" não é
  "acertou". Deve ser neutra ou azul, com ícone.
- A descrição do módulo não é editável pela tela (2.1).
- "Enviar para turma" hoje escolhe QUALQUER turma e manda tudo de uma vez. No redesenho, ele vira
  o modo "Tudo agora" de uma programação de turma alocada (2.3 e 2.4).

## Estados de espera e de erro

- **Todo botão que espera o servidor mostra a `fila`** (`Loading.svelte`) e fica desabilitado.
  Numa lista, o pendente é o **id** da linha, nunca um booleano.
- Envio sem nenhuma atividade no ar: recusado, com "Publique antes de enviar" e o caminho até a
  atividade.
- Turma sem nenhum aluno com e-mail: a programação pode ser salva. O mapa do aluno com conta
  continua funcionando, e a tela diz que nenhum e-mail sai. **Nunca** apresenta aluno sem e-mail
  como erro.

## A regra que não pode quebrar

- **Só atividade no ar sai num envio**, e áudio faltando barra o envio daquela data (`server.md`
  "TTS"). As duas checagens são do SERVIDOR, na hora do envio: a prévia avisa, mas não é ela que
  impede.
- **Convite e link aberto coexistem.** O módulo e a programação organizam o envio; nada disso
  tranca o link da atividade, que continua abrindo para quem o tiver, com ou sem turma.
- **Um e-mail por aluno por envio**, nunca um por atividade.
- **Toda remote function nova abre pelo guard**, e ligar módulo a turma confere **as duas pontas**
  (o módulo e a turma são do professor; `db.md` "Repositórios").

## Notas para implementação (não são da tela)

- `ModuleClassroom` (módulo × turma) carrega a programação: modo, dias, intervalo, horário,
  quantas por vez, início, pausada. As datas escolhidas e o estado de cada linha moram numa tabela
  de envios programados (módulo × turma × atividade × quando × estado).
- **O disparo é a fila que já existe**: `Job.runAfter` já agenda job para o futuro, e o worker já
  drena. Cada envio programado vira um job `envio-programado`, idempotente por (programação,
  atividade, data): rodar duas vezes não manda dois e-mails. Sem cron novo.
- **Fuso horário**: o `Teacher` não guarda fuso hoje. Ou `America/Sao_Paulo` fixo, ou um campo
  novo na conta (**decisão em aberto**).
- Turma ainda não alocada que já recebeu o módulo pelo envio de hoje: a migração pode alocá-la a
  partir dos `Delivery.moduleId` existentes.

## Decisões

Fechadas pelo desenho e pela implementação:

- **"Enviar a próxima agora" adianta só aquela.** As outras datas não mudam, porque a agenda é
  ancorada no início e a vaga da que saiu fica ocupada por ela.
- **Fuso fixo de Brasília** (`America/Sao_Paulo`), escrito na tela. O `Teacher` continua sem fuso
  próprio; se um dia houver, `instanteDe` é o único lugar a mudar.

Continuam em aberto:

1. **Aluno que entra na turma depois de a programação começar.** Hoje ele não recebe o que já
   saiu (não tem convite daquelas atividades), e o mapa dele mostra essas fases trancadas, sem
   data. Proposta mantida: "mandar as já enviadas para os novos" como ação explícita na turma.
2. **A mesma atividade em dois módulos alocados à mesma turma** ainda sai duas vezes (um envio
   por módulo). Proposta mantida: o segundo é pulado, com o motivo "já enviada por outro módulo".
