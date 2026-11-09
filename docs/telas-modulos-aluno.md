# Módulos — as telas do aluno (o mapa)

Brief funcional de uma tela **Nova**: o módulo no painel do aluno, com o progresso em fases, num
tema de **jogo em 8 bits** (a referência é o mapa de mundo do Mario). Descreve **o que está na
tela, o que ela faz e o que não pode quebrar**, não a aparência. As telas do professor, incluindo
a programação que decide quando cada fase abre, estão em `docs/telas-modulos-professor.md`.

> **Implementado em outubro de 2026**, a partir do desenho do Claude Design. O que era **Novo**
> aqui existe; as decisões estão no fim e na atualização de `docs/adr-004-modulos-e-nivel.md`.

O que vale sobre tudo isto e não se repete aqui:

- **Tokens, tipografia, movimento e acessibilidade**: `.claude/rules/design-system.md`.
- **Componentes existentes**: `.claude/rules/components.md`. Em especial `Avatar.svelte` (pixel
  art 16×16), `ProgressBar`, `AmbientShapes` e `VolumeControl`.
- **A área do aluno e a conta opcional**: `.claude/rules/paginas.md` "Área do aluno" e
  `.claude/rules/auth.md` "A conta do aluno".

---

## Onde a tela mora, e quem a vê

`/aluno` (o painel que já existe) ganha um bloco **"Seus módulos"**, e cada módulo abre o seu
mapa em `/aluno/modulos/[id]`.

**Só quem tem conta vê.** O aluno precisa de três coisas ao mesmo tempo: conta de aluno, a ficha
da turma ligada a ela (isso acontece pelo link pessoal do convite, `auth.md`) e a turma alocada ao
módulo. Quem responde pelo link aberto, sem conta, não vê mapa nenhum, **e isso é o caminho normal,
não uma falha**. O produto continua sendo "abre o link, digita o nome e responde", e o e-mail com
os links continua chegando para todo mundo. O mapa é um ganho de quem tem conta, nunca um
pré-requisito.

**A superfície é a do Player, não a do Studio**: celular fraco, 4G, aluno sem paciência. Alvo de
toque de 48px, e nenhuma dependência nova no bundle sem medir.

---

## O tema: jogo em 8 bits, dentro do sistema de design

O tema é deste mapa (e do cartão dele no painel), não do produto inteiro. Ele tem de caber nas
regras que já existem, e o projeto já tem um precedente: **o avatar é pixel art 16×16 gerada de
dezoito números**, em SVG com `shape-rendering="crispEdges"`.

| Regra do projeto                                                                | O que significa para o mapa                                                                                                                                                                 |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Azul é a marca; verde, âmbar e vermelho são da correção**                     | A fase concluída **não é verde**, e a bandeira do fim também não. "Terminou" não é "acertou" (a mesma regra dos estados da turma). Use o azul da marca, teal e as cores de etiqueta.        |
| **Tokens, nunca hex**                                                           | O mapa (caminho, chão, nós) sai dos tokens e muda sozinho com o tema escuro. A única exceção já existente é a paleta do avatar, que é cor de conteúdo.                                      |
| **Três papéis de fonte**                                                        | Uma fonte pixel seria um quarto papel: **decisão do dono**. Se entrar, só em rótulo decorativo ("FASE 3", "MUNDO 1"), nunca em corpo de texto. Conteúdo no idioma alvo é sempre Noto Sans.  |
| **Movimento: só `transform` e `opacity`; loop só para gravação e carregamento** | O avatar anda de uma fase para a outra UMA vez, ao chegar do resultado, e para. Nada fica pulando em loop. Com `prefers-reduced-motion` ele aparece direto no lugar.                        |
| **Ilustração não se desenha à mão em SVG**                                      | Os blocos do mapa (chão, caminho, nós, bandeira, castelo) seguem o modelo do avatar: uma grade de pixels como DADO, desenhada por código, com poucos tipos de bloco. Nada de imagem pesada. |
| **Formas de ambiente nunca atrás de texto**                                     | Vale para cenário também: nuvens e morros ficam nas bordas, e o texto das fases fica sobre fundo liso.                                                                                      |

**O personagem é o avatar do próprio aluno.** Ele já é pixel art, já existe na conta e é a única
coisa da conta que o aluno escolhe por gosto. Quem não montou um avatar anda com as iniciais num
bloco, o mesmo fallback do `Avatar.svelte`.

---

## 1. "Seus módulos" — o bloco no painel

Entra em `/aluno` **entre "Suas turmas" e "Como você vem indo"**: é sobre onde ele estuda, antes
de como vem indo.

Um cartão por módulo:

- nome do módulo, professor e turma;
- **"3 de 8 fases"** e uma trilha curta de quadradinhos, um por fase, com o estado de cada uma
  (ícone, não só cor);
- a próxima coisa a fazer: **"Continuar Frutas 3"**, ou **"A próxima abre qui 16/10"** quando ele
  está em dia;
- todo o cartão abre o mapa.

Sem nenhum módulo, o bloco **não aparece**. Conta nova não mostra caixa vazia (a mesma regra dos
cartões de "Como você vem indo").

---

## 2. O mapa do módulo

`/aluno/modulos/[id]` · **Novo.**

### O que a tela responde

"Onde eu estou neste módulo, o que já fiz, e o que vem agora."

### Na tela

- **Cabeçalho de uma linha**, como o resto da área: marca, voltar para o painel, volume.
- **Título**: o nome do módulo, com professor · turma · idioma · nível (quando a maioria das
  atividades tiver um).
- **Progresso**: "3 de 8 fases", com a barra em **degraus**, um por fase. Não é uma porcentagem:
  são fases.
- **O caminho**: um nó por atividade, **na ordem do módulo**, ligados por uma trilha. Do começo
  (bandeira de largada) ao fim (castelo, ou a bandeira de chegada). **No celular o caminho é
  vertical**, de baixo para cima ou de cima para baixo (decisão do design), e rola por dentro. No
  desktop pode serpentear na largura.
- **O avatar fica em pé na fase atual**: a primeira liberada que ele não terminou.

### Os estados de uma fase

Cada nó tem ícone, número e texto, nunca só cor:

| estado           | quando                                                        | o nó mostra                             | a ação          |
| ---------------- | ------------------------------------------------------------- | --------------------------------------- | --------------- |
| **Concluída**    | ele terminou ao menos uma tentativa                           | bandeira hasteada no nó                 | ver o resultado |
| **Em andamento** | começou e não terminou                                        | o avatar, com "continuar"               | **Continuar**   |
| **Liberada**     | a turma recebeu e ele ainda não abriu                         | o nó aceso, uma vez, sem loop           | **Jogar**       |
| **Trancada**     | ainda não foi enviada para a turma (programação do professor) | cadeado e **a data em que abre**        | nenhuma         |
| **Encerrada**    | foi arquivada depois de enviada, e ele não começou            | nó apagado e "encerrada pelo professor" | nenhuma         |

- **Atividade que o professor não programou para esta turma não aparece.** O mapa é o módulo
  DESTA turma, não o módulo inteiro.
- **Encerrada com tentativa terminada** continua **Concluída**: o resultado dele não some porque a
  atividade saiu do ar.
- **Trancada mostra a data. O título é decisão em aberto**: mostrar adianta o assunto ("Frutas 4 —
  diálogo"), esconder deixa a surpresa de jogo. Proposta: o título aparece, a data também.

### Tocar numa fase

Abre uma folha (de baixo, no celular) com o título, o idioma e o nível, `N questões`, o estado e a
ação. **"Jogar" e "Continuar" levam pelo link pessoal do convite** (`e/[token]`), não pelo link
aberto: é isso que liga a tentativa à ficha do aluno e faz o progresso contar. Pelo link aberto
ele responderia como anônimo e a fase não acenderia.

### O placar só existe onde o professor liberou

Esta é a regra que mais pesa no tema, porque jogo pede estrela e pontuação.

- **Com `showResult` ligado** naquela atividade, a fase concluída pode mostrar o acerto, em
  estrelas (1 a 3 por faixa de acerto) ou em número. As faixas são **decisão do design**, mas a
  cor das estrelas não é verde nem âmbar.
- **Com o resultado desligado**, a fase é só **Concluída**, com o ícone de olho riscado e "sem
  placar", o mesmo padrão do histórico de `/aluno`. Nenhuma estrela, nenhuma contagem. Mostrar
  estrela ali seria a porta dos fundos do interruptor do professor.
- O total do módulo ("3 de 8 fases") conta **fases concluídas, nunca acertos**, e por isso vale
  igual com o resultado ligado ou desligado.

### Terminar o módulo

Com a última fase concluída, uma comemoração **uma vez**: o avatar chega ao castelo e toca o som
`finish` (respeitando o `VolumeControl`, e o som nunca é o único canal), com "Módulo concluído" em
texto. Recarregar a página não repete a festa.

### Em dia, e esperando

Quando ele concluiu tudo o que foi liberado e ainda há fases trancadas, a tela diz isso com todas
as letras: "Você está em dia. A próxima fase abre qui 16/10". **Não é cobrança nem pendência.**

### Vazio

Módulo alocado com nada liberado ainda: o caminho todo trancado, e "A primeira fase abre qui
16/10".

---

## Acessibilidade — o mapa é uma lista

O mapa é visual; a estrutura por baixo é uma **lista ordenada** (`<ol>`), uma fase por item, e o
leitor de tela lê "Fase 3 de 8, Frutas 3, em andamento, continuar". A trilha, o cenário e o avatar
são `aria-hidden`.

- **Teclado**: Tab passa pelas fases que têm ação; as trancadas são lidas, mas não são alvo.
- O foco ao abrir a tela vai para a fase atual.
- Contraste de 4.5:1 no texto de cada nó, inclusive sobre o cenário.
- No celular o alvo de cada nó tem 48px, mesmo que o desenho do bloco seja menor.

## A regra que não pode quebrar

- **O mapa não tranca o link.** A ordem do caminho é uma sugestão, não uma barreira: a fase 4
  liberada abre mesmo com a 3 por fazer, porque o link do e-mail abriria de qualquer jeito, e um
  cadeado só no mapa seria um cadeado de mentira. **Quem tranca é só a programação do professor**
  (o que não foi enviado não aparece como jogável).
- **Nenhum dado de outro aluno.** Sem ranking, sem "fulano já está na fase 6", sem comparação por
  nome. Boa parte do público é menor de idade, e a turma inteira é dado pessoal (`auth.md` "Dados
  do aluno e LGPD").
- **Nenhuma coleta nova.** O progresso sai das tentativas que já existem; a tela não grava nada.
  Até a "festa já vista" pode ser derivada (módulo concluído antes da última visita) ou ficar no
  aparelho.
- **Nenhum gabarito.** A folha da fase não mostra questão nenhuma; quem mostra resposta é o
  resultado e a revisão do Player, com as regras de lá.
- **Escopo pelo aluno da sessão**, nunca por um id do corpo do pedido (`server.md`): o mapa é das
  fichas ligadas à conta logada, e só delas.

## Notas para implementação (não são da tela)

- A leitura parte da conta (`contaAluno`, `repos/student-accounts.ts`), passa pelas fichas, depois
  pelas turmas e pelos módulos alocados a elas. Para cada atividade programada, cruza o `Delivery`
  da turma (liberada e com qual token) com as tentativas da ficha ou da conta (em andamento ou
  concluída).
- A data de "abre em" sai da programação da turma (`telas-modulos-professor.md` 2.4).
- Pixel art como dado e SVG, no mesmo molde de `$lib/avatar/` (peças, paleta por token,
  composição pura e testada). Nenhum arquivo de imagem.

## Decisões

Fechadas pelo desenho e pela implementação:

- **Fonte pixel: sim, a Silkscreen** (`font-pixel`), só nos rótulos decorativos "MUNDO N" e
  "FASE N", sempre `aria-hidden` (design-system.md "Tipografia").
- **A fase trancada mostra o título e a data** em que abre ("abre qui 15/10").
- **Estrelas: 3 a partir de 90%, 2 a partir de 60%, 1 para concluída**, em azul, e só onde o
  professor liberou o resultado (`estrelasDe`, `$lib/modulos/mapa.ts`).
- **O tema fica no mapa e no cartão dele.** O resto de `/aluno` e o Player seguem o sistema de hoje.
- **"MUNDO N"** é a posição do módulo entre os do aluno, na ordem em que as turmas foram alocadas.
