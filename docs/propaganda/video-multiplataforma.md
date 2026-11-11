# Spokke · vídeo "no aparelho que o aluno tiver"

Brief para o Claude Design. Contexto e orientações básicas de um vídeo em motion que mostra o
Spokke **em várias telas**: o celular do aluno, o computador, o tablet, a tela da sala de aula. A
mesma atividade se ajusta a cada aparelho, e o vídeo mostra o que muda em cada um.

Anexos: `spokke-marca.svg`, `spokke-icone.svg` e as capturas da seção 5
(`captura-das-telas.md` diz como gerá-las).

---

## 1. Formato

| O quê       | Valor                                                                        |
| ----------- | ---------------------------------------------------------------------------- |
| Proporção   | **16:9**, 1920 × 1080: é o quadro em que três aparelhos cabem lado a lado    |
| Duração     | 35 a 45 s                                                                    |
| Corte extra | Opcional: 1:1, 1080 × 1080, com os blocos 1, 3, 4 e o final                  |
| Tema        | Claro, com uma passagem pelo escuro no bloco 7                               |
| Som         | Funciona no mudo                                                             |
| Arquivo     | `spokke-multiplataforma-16x9.mp4`                                            |

Especificação do `.mp4` e animação HTML determinística: seção 1 de `animacao-celular.md`. Área
segura em 16:9: 96 px nas laterais e 64 px em cima e embaixo para toda legenda.

---

## 2. Contexto

Escola pública e particular, curso livre, aula particular: o aparelho do aluno varia muito. Um é
celular simples com 4G, outro é o computador da sala de informática, outro é o tablet da família. O
professor não controla nada disso, e a atividade tem de abrir em todos.

O Spokke foi desenhado com dois orçamentos (`.claude/rules/design-system.md`, "Dois contextos"): a
tela do aluno pensa no celular fraco primeiro, e o painel do professor pensa no computador, com
uma versão de celular que cabe sem rolar de lado. O vídeo prova isso mostrando a **mesma tela em
aparelhos diferentes**, cada uma do jeito que o produto desenha para ela.

**A ideia visual: um quadro, vários aparelhos.** Molduras genéricas de celular, tablet e notebook
dividem o quadro. A câmera passa de um para o outro, e a mesma questão aparece em cada um. O que é
igual (a pergunta, a correção, o "quase") fica igual; o que muda (o leiaute, o jeito de responder)
é o assunto da cena.

**A atividade é a "Present perfect" das outras propagandas** (`telas-e-funcionalidades.md`
seção 2), criada à mão na conta de demonstração com as quatro frases de lá e publicada com o
serviço de áudio no ar. A captura usa o link de aluno dela (`/a/[slug]`), e não o `/exemplo`: a
atividade de exemplo do site tem leiaute próprio e não mostra a legenda de atalhos do computador.

---

## 3. Roteiro em blocos

### Bloco 1 · 0 a 3 s · A mesma questão em três telas

Celular, tablet e notebook lado a lado, cada um com a mesma questão de escuta da Present perfect,
no leiaute daquele aparelho. As três acendem juntas.

### Bloco 2 · 3 a 8 s · A sala de aula

Uma tela grande de sala (projetor ou TV, sem marca) mostra o cartão **"No ar"** com o QR em tamanho
de projeção e o código **KTRM**. Dois ou três celulares entram pela base do quadro e chegam à tela
de entrada da atividade, com o campo **"Seu nome ou apelido"**.

### Bloco 3 · 8 a 14 s · No celular

O celular ocupa o centro. Uma pergunta por tela: a barra de progresso em cima, a questão no meio e
o botão **"Verificar"** fixo no rodapé. A área do meio rola por dentro enquanto o topo e o rodapé
ficam parados (é a regra do produto: a página não rola). Toque na alternativa, "Verificar",
**"Verificando…"**, o veredito.

### Bloco 4 · 14 a 19 s · No computador

O notebook ocupa o centro, com a mesma questão em duas colunas: o áudio ou o apoio à esquerda, a
resposta à direita, e a ação na barra do cartão. Embaixo, a legenda de atalhos do produto
(**"1 2 3 escolher"**, **"Espaço tocar de novo"**, **"Enter verificar"**). Teclas desenhadas na camada de
movimento acendem quando "pressionadas": o 2 escolhe, o Enter verifica.

### Bloco 5 · 19 a 25 s · O teclado de cada idioma

Três celulares em sequência rápida, numa questão de escrever no idioma estudado:

- **japonês**: a grade de kana encaixada acima do rodapé;
- **espanhol**: a barra de acentos;
- **árabe**: o texto correndo da direita para a esquerda.

### Bloco 6 · 25 a 30 s · O professor, nos dois tamanhos

O notebook com o painel inteiro: a barra lateral e a tela de resultados de uma atividade. A câmera
passa para um celular com a mesma tela, a barra de abas embaixo (**Início · Atividades · Turmas ·
Resultados**) e o menu de três traços no topo.

### Bloco 7 · 30 a 33 s · Claro e escuro

No notebook, o professor toca no seletor de tema do painel, e a tela de resultados passa do claro
para o escuro com uma cortina na diagonal. As faixas de certo, quase e errado continuam dizendo a
mesma coisa nos dois. O tema é escolha do professor: o tema do sistema não muda nada, e a tela do
aluno não tem seletor.

### Bloco 8 · 33 a 37 s · A conta do aluno

A área do aluno (`/aluno`) no tablet e no celular, com o mesmo histórico nos dois: as atividades
respondidas, o avatar, "Como você vem indo".

### Bloco 9 · 37 a 41 s · Cartão final

Fundo escuro, logo claro, a legenda final e o CTA.

---

## 4. Texto na tela

Na voz do Spokke (`../spokke-seo/project/brain/voice.md`): direta, em segunda pessoa, sem
travessão, sem exclamação e sem superlativo.

| Bloco | Legenda principal                                    | Linha menor                                                    |
| ----- | ---------------------------------------------------- | -------------------------------------------------------------- |
| 1     | A mesma atividade, em qualquer tela.                 | Abre no navegador, sem nada para instalar.                     |
| 2     | Projete o QR e a turma entra pelo celular.           | Ou dite o código de 4 letras.                                  |
| 3     | No celular, uma pergunta por tela.                   | O botão de verificar fica no rodapé, ao alcance do polegar.    |
| 4     | No computador, dá para responder só pelo teclado.    | Números escolhem, Espaço repete o áudio, Enter verifica.       |
| 5     | Cada idioma traz o teclado de que precisa.           | Kana no japonês, pinyin com tom no mandarim, acentos no espanhol. |
| 6     | Você monta no computador e confere no celular.       | Os resultados cabem na tela pequena, entre uma aula e outra.   |
| 7     | Claro ou escuro, como você preferir.                 | A escolha fica guardada.                                       |
| 8     | Com conta, o aluno reencontra o histórico em qualquer aparelho. | Sem conta, o link continua bastando.                 |
| 9     | Funciona no celular que o aluno já tem.              | Teste grátis por 14 dias · spokke.com.br                       |

---

## 5. Como a tela aparece

**Neste vídeo a captura é a imagem, não a referência.** O assunto é o leiaute que se adapta, e um
redesenho provaria só que o desenho se adapta. Cada aparelho mostra o PNG do produto naquele
tamanho, dentro da moldura, e a animação põe por cima apenas a legenda, o círculo de toque, as
teclas do bloco 4 e a cortina do bloco 7 (`captura-das-telas.md`).

| #  | Tela                                           | Estados                                             | Aparelhos                     | Precisa de            |
| -- | ---------------------------------------------- | --------------------------------------------------- | ----------------------------- | --------------------- |
| 01 | `/a/[slug]/q/[n]` da Present perfect, a escuta | sem resposta · escolhida · "Verificando…" · veredito | celular, tablet, computador  | áudio                 |
| 02 | Detalhe de uma atividade publicada, "No ar"    | o QR e o código (recorte do cartão)                 | computador                    | seed, código ligado   |
| 03 | `/a/[slug]`, entrada                           | campo do nome vazio e preenchido                    | celular                       | seed                  |
| 04 | Questão de escrever em japonês                 | com a grade de kana aberta                          | celular                       | seed (Japonês 1)      |
| 05 | Questão de escrever em espanhol                | com a barra de acentos                              | celular                       | seed (Español 1)      |
| 06 | Questão em árabe                               | texto da direita para a esquerda                    | celular                       | uma atividade em árabe |
| 07 | `/resultados/[activityId]`                     | a mesma atividade                                   | computador, celular           | seed                  |
| 08 | A captura 07 no tema escuro                    | a mesma atividade                                   | computador                    | `spokke-theme` = `dark` |
| 09 | `/aluno`                                       | histórico com algumas atividades                    | tablet, celular               | conta de aluno        |

Observações para a captura:

- **O leiaute de computador do aluno começa em 1024 px.** O tablet em pé (820 px) mostra o leiaute
  de toque, mais largo; deitado (1180 px), mostra o de computador. Use o tablet em pé: ele mostra
  a terceira forma, a que não é nem celular nem notebook.
- **Japonês e espanhol precisam de uma questão de digitar.** Confira se as atividades do seed têm
  uma. Se não tiverem, crie uma atividade com o tipo de material que gera "digitar a tradução".
- **O seed não tem atividade em árabe.** Ela é criada à mão para a captura (sem serviço de voz, o
  árabe sai sem questão de escuta, e tudo bem). Se der trabalho, o árabe sai do bloco 5 e o
  mandarim entra no lugar.
- **A tela da sala de aula** é uma moldura genérica com a captura 02 ampliada dentro. O QR precisa
  continuar legível, sem desfoque.

---

## 6. Identidade e movimento

As seções 6 e 7 de `animacao-celular.md` valem inteiras. Neste vídeo, ainda:

- **Molduras genéricas, sem marca:** o celular de `animacao-celular.md`, um tablet com a mesma
  borda `#111A31` e cantos menores, e um notebook de borda fina, sem logo e sem teclado detalhado.
  A tela da sala é um retângulo escuro com borda fina.
- **A tela dentro da moldura nunca é recortada para caber.** Se não couber, a moldura diminui.
- **A câmera passa de um aparelho para o outro** de A para B (300 ms ou mais, curva suave nas duas
  pontas). Os aparelhos que saem de foco escurecem para 40%, sem desfoque.
- **As teclas do bloco 4** são pílulas neutras (`base-300`, JetBrains Mono), e acendem em azul da
  marca por 120 ms quando "tocadas".

---

## 7. O que não pode

As regras da seção 8 de `animacao-celular.md` valem aqui. Para este vídeo:

- **Nenhum app para baixar.** Não existe. Nada de ícone de loja, botão "instalar" ou tela inicial
  de celular com o ícone do Spokke.
- **Nenhuma marca de aparelho, sistema ou navegador.** Nada de entalhe reconhecível, barra de
  endereço de um navegador real ou teclado de um sistema real desenhado em detalhe.
- **Nenhuma tentativa pulando de um aparelho para o outro no meio.** O vídeo não mostra o aluno
  começando no celular e terminando no computador. O que a conta guarda é o histórico (bloco 8).
- **Nenhum número de desempenho** ("carrega em 1 segundo", "funciona em 2G"): não há medição
  publicada.
- **Atalho de teclado nunca como a única forma de responder.** No bloco 4 o mouse também aparece
  pelo menos uma vez, ou a legenda do produto fica visível.

---

## 8. Entrega

1. `spokke-multiplataforma-16x9.mp4`.
2. O HTML da animação, com os controles da seção 1 de `animacao-celular.md`.
3. Uma página com um quadro estático de cada bloco.
4. Se sobrar fôlego, o corte 1:1 (`spokke-multiplataforma-1x1.mp4`).
