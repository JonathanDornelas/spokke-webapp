# Spokke · animação de propaganda vertical

Brief para o Claude Design. Uma animação de 30 a 34 segundos, em formato de celular (9:16), que
mostra o produto funcionando de ponta a ponta: o professor cola o material da aula, as questões
saem prontas, o link chega ao aluno, o aluno responde no celular e o professor vê o resultado.

A animação é a propaganda. Ela vai para Reels, Stories, TikTok e Shorts, e a maioria das pessoas
vai assistir **sem som**: o texto na tela carrega a mensagem sozinho.

Anexos que acompanham este arquivo:

- `spokke-marca.svg`: o logo inteiro ("Spokke", com o ícone no lugar do S).
- `spokke-icone.svg`: só o ícone (o S com o balão de fala).

Se o design system do Spokke já estiver neste projeto do Claude Design (os desenhos "Player
Teclado", "Home Funcionalidades", "Faixa Letreiro" e "Studio Resultados v2" saíram daqui), use-o.
Os tokens da seção "Identidade visual" são a referência caso não esteja.

---

## 1. Formato

**O formato final é um arquivo `.mp4`.** É ele que sobe para as plataformas.

| O quê            | Valor                                                                  |
| ---------------- | ---------------------------------------------------------------------- |
| Arquivo final    | **`.mp4`**                                                             |
| Proporção        | 9:16, vertical                                                         |
| Resolução        | **1080 × 1920 px**                                                     |
| Duração          | 30 a 34 s, com o último quadro voltando ao primeiro sem corte (loop)   |
| Tema             | Claro (é o padrão do produto). Só o cartão final usa superfície escura |

**Especificação do `.mp4`** (aceita como está no Instagram, no TikTok, no YouTube Shorts e no
gerenciador de anúncios da Meta):

| Item               | Valor                                                              |
| ------------------ | ------------------------------------------------------------------ |
| Vídeo              | H.264 (perfil High, nível 4.1 ou 4.2)                              |
| Quadros            | **30 fps constantes** (sem taxa variável)                          |
| Cor                | `yuv420p`, BT.709                                                  |
| Taxa de bits       | 8 a 12 Mbps                                                        |
| Áudio              | AAC, 48 kHz, estéreo, **em silêncio** (a faixa existe por compatibilidade; o vídeo funciona no mudo) |
| Contêiner          | MP4 com o índice no começo do arquivo (`faststart`), para tocar antes de baixar inteiro |
| Tamanho do arquivo | Abaixo de 50 MB                                                    |
| Nome               | `spokke-propaganda-9x16-30s.mp4`                                   |

Nenhuma barra preta, nenhuma marca d'água, nenhuma tela de título do programa que exportou.
O primeiro quadro já é a cena 1, porque é ele que vira a capa na prévia das plataformas.

**Área segura.** As plataformas cobrem as bordas do vídeo com os próprios botões e a legenda.
Todo texto de legenda, o veredito de cada questão e o CTA final ficam dentro de:

- 250 px livres no topo e 420 px livres embaixo;
- 64 px livres à esquerda e 150 px livres à direita (a coluna de curtir e compartilhar).

O celular e os painéis podem passar desse limite. O que o espectador precisa ler não passa: se o
veredito cair fora, a câmera aproxima até ele ficar dentro.

**A fonte da animação.** O `.mp4` sai de uma animação em HTML (um arquivo só, com CSS e JS inline
e fontes do Google Fonts), num palco fixo de 1080 × 1920 escalado com CSS para caber na janela.
Se a exportação para vídeo não for direta, o `.mp4` é renderizado quadro a quadro a partir dela,
e por isso ela precisa ser determinística:

- toca sozinha ao abrir e repete em loop;
- `Espaço` pausa e continua, `R` reinicia, `←` e `→` andam 1 s;
- `?t=12.5` na URL abre parado no segundo 12,5;
- nenhum controle aparece dentro do palco; uma régua de tempo pode existir fora dele, escondida
  com `H`;
- nada depende de relógio real, de rede ou de sorteio: abrir duas vezes dá o mesmo vídeo, quadro
  a quadro.

---

## 2. O produto, em quatro linhas

O Spokke é para professor de idiomas e para escola de idiomas. O professor cola as frases, o
vocabulário ou o texto que já usa em aula, e as questões saem prontas: escuta, fala, leitura e
escrita, com áudio gerado do texto. Ele publica e manda um link. O aluno abre no celular, digita
o nome e responde, **sem criar conta e sem instalar nada**, e a correção chega na hora, com um
estado que quase nenhuma ferramenta tem: o **quase**, para quem chegou perto.

A referência de experiência é um app de idiomas com uma pergunta por tela e botões grandes, não
um formulário.

---

## 3. Conceito visual

**Dois personagens, duas superfícies.**

- **O professor é PAINEL.** O lado dele aparece como cartões grandes da interface (o painel de
  criação, a tela de publicar, os resultados), flutuando sobre o fundo, recortados e ampliados
  para serem lidos num celular. Sem moldura de computador e sem barra lateral.
- **O aluno é CELULAR.** O lado dele aparece sempre dentro de um aparelho, com a moldura da marca
  (seção 6). O espectador vê exatamente a tela que o aluno vê.

**A ponte entre os dois é o link.** Na cena 5 ele sai do cartão do professor e voa até o
celular do aluno. É o momento que resume o produto: você monta no seu painel, a turma responde
no bolso.

**Um marcador fixo diz de quem é a vez.** No topo, dentro da área segura, uma pílula com duas
opções, "Você" e "Seu aluno", com a parte selecionada deslizando de um lado para o outro quando
a cena troca de personagem (300 ms, curva de A para B). É o mesmo movimento do seletor em pílula
do produto.

**Câmera.** Zoom suave para aproximar o que importa (o veredito, o link, a barra de resultado) e
afastar de novo. Nenhum giro, nenhum tremor, nenhuma inclinação 3D exagerada.

---

## 4. Roteiro, cena a cena

Os tempos são o alvo; ajuste em até meio segundo por cena se o ritmo pedir. As frases entre aspas
na coluna "Legenda" são a copy exata e estão também na seção 5.

As questões do aluno são as da **atividade de exemplo do produto**, em inglês para quem fala
português. O material colado na cena 2 é o mesmo que vira as questões das cenas 7 a 10: o
espectador precisa reconhecer a frase que viu sendo colada.

### Cena 1 · 0,0 a 2,5 s · O gancho

- Fundo claro (`base-200`) com as formas de ambiente entrando pelas bordas.
- Legenda grande, centralizada, entrando palavra a palavra: **"Sua aula vira exercício."**
- O logo pequeno aparece embaixo da frase.

### Cena 2 · 2,5 a 7,0 s · Colar o material

Pílula em "Você".

Cartão do formulário de material, no modo **"Colar uma lista"**:

- Tipo selecionado no topo do cartão: **"Par de frases"**.
- Uma caixa de texto recebe o colar de uma vez (as linhas aparecem juntas, não digitadas):

  ```
  I have lived here for two years. | Eu moro aqui há dois anos.
  She has been working here since 2019. | Ela trabalha aqui desde 2019.
  We haven't finished yet. | Nós ainda não terminamos.
  Have you ever been to London?
  ```

- Fileira de separadores em pílula ao lado da caixa (`·`, `|`, `-`, `⇥`), com o `|` selecionado.
- Embaixo, a **prévia linha a linha** entra em sequência (60 ms entre linhas): cada linha vira
  duas colunas, a frase em inglês à esquerda e a tradução à direita.
- A quarta linha não tem tradução. Na coluna da direita aparece a etiqueta **"tradução
  automática"**, um carregamento curto, e então surge **"Você já esteve em Londres?"**.
  Sob o cartão: **"Tradução automática. Confira e ajuste se precisar."**
- Legenda: **"Cole as frases que você já usa."** e, logo abaixo, menor:
  **"A tradução vem pronta. Você só confere."**

### Cena 3 · 7,0 a 10,0 s · As questões saem prontas

- O cartão do formulário encolhe e dá lugar ao cartão da etapa **"Revisar"**, com o indicador de
  etapas no topo: Detalhes · Materiais · **Revisar** · Publicar.
- Primeiro um esqueleto de carregamento (barras cinza com a forma dos cartões), depois quatro
  cartões de questão entram em sequência, cada um com o enunciado e o tipo em etiqueta:
  - "Ouça e escolha o que você ouviu." · escuta
  - "Complete a frase." · escrita
  - "Monte a frase." · montar frase
  - "Diga esta frase em voz alta." · fala
- Acima dos cartões, quatro chips acendem um a um: **Escuta · Fala · Leitura · Escrita**.
- Legenda: **"As questões saem do seu material."**

### Cena 4 · 10,0 a 13,0 s · Publicar

- Cartão da etapa **"Publicar"**. Uma barra de progresso real: **"3 de 4 áudios prontos"**, que
  chega a **"4 de 4 áudios prontos"**. O botão "Publicar" acende e é tocado (afunda e volta).
- O cartão vira o desfecho, com **"Como a turma entra"** num bloco só:
  - o link, `spokke.com.br/a/present-perfect`, com o botão "Copiar";
  - um QR grande;
  - o código de acesso em letras grandes e espaçadas: **K T R M**.
- Legenda: **"Mande para a turma."** e, menor:
  **"Link, QR na projeção ou um código de 4 letras para ditar."**

### Cena 5 · 13,0 a 14,5 s · O link voa

- O botão "Copiar" é tocado. O link se destaca do cartão como uma pílula azul e voa em arco até
  um celular que entra pela direita.
- A pílula do topo desliza para "Seu aluno".
- Sem legenda. É a cena de respiro.

### Cena 6 · 14,5 a 16,5 s · O aluno entra

O celular ocupa o centro. Daqui até a cena 10 ele não sai.

- Tela de entrada do aluno: o título da atividade (**"Present perfect"**), a etiqueta do idioma
  (**Inglês**) e o nível (**B1 · Intermediário**), um campo **"Seu nome"** e o botão **"Começar"**.
- Um cadeado pequeno com a frase **"Você não precisa de conta."**
- O nome **"Ana"** é digitado no campo, letra a letra. "Começar" é tocado.
- Legenda: **"O aluno só precisa do link."** e, menor:
  **"Abre no celular, digita o nome e responde."**

### Cena 7 · 16,5 a 19,0 s · Escuta, certo

Anatomia de toda tela de questão (vale para as cenas 7 a 10):

- **Topo:** barra de progresso fina (anda a cada questão), regulador de volume e a bandeira de
  relatar problema, os dois como ícones.
- **Meio:** o enunciado e a área de resposta. Uma pergunta por tela.
- **Rodapé fixo:** o botão principal em largura cheia, **"Verificar"**. Depois da correção ele
  vira **"Próxima questão"**.

Nesta questão:

- Enunciado: **"Ouça e escolha o que você ouviu."**
- Um reprodutor de áudio na cor ciano (`accent`), com o botão de tocar, a forma de onda
  animando enquanto toca e o alternador de velocidade (normal e lenta).
- Três alternativas em cartões grandes:
  - I have lived here for two years.
  - I lived here two years ago.
  - I will live here for two years.
- O play é tocado, a onda anima, a primeira alternativa é escolhida (contorno azul), "Verificar"
  é tocado.
- Um instante de **"Verificando…"** dentro do botão, com um véu leve sobre a resposta e
  **"Verificando sua resposta"** no meio (a correção é feita fora do aparelho; ela não é
  instantânea).
- O veredito entra: ícone de check em círculo, **"Correto"**, em verde (`success`).
- Legenda: **"Repete o áudio quantas vezes quiser."**

### Cena 8 · 19,0 a 22,5 s · Lacuna, QUASE (o momento principal)

Esta é a cena que vende o produto. Dê a ela o tempo mais longo e a câmera mais próxima.

- Enunciado: **"Complete a frase."** Embaixo, a frase de apoio em português:
  **"Ela trabalha aqui desde 2019."**
- A frase com a lacuna, em fonte grande: **She \_\_\_\_\_\_ here since 2019.**
- O teclado do celular sobe. Ana digita **has been workin** (sem o "g" final) e toca
  "Verificar".
- **A câmera aproxima** do bloco de veredito, que entra em âmbar (`warning`): ícone de círculo
  meio cheio, **"Quase."** e, embaixo, **A resposta esperada era "has been working".**
- O "g" que faltou pode ganhar um sublinhado âmbar na resposta dela.
- Legenda em dois tempos: **"Faltou uma letra."** e depois **"A questão conta como quase."**

### Cena 9 · 22,5 a 24,5 s · Montar a frase, certo

Cena rápida, sem legenda, para mudar o ritmo.

- Enunciado: **"Monte a frase."** Apoio: **"Nós ainda não terminamos."**
- Seis palavras embaralhadas em pílulas: `finished`, `already`, `We`, `yet`, `didn't`,
  `haven't`.
- Quatro toques levam as pílulas, uma por vez, para a linha de resposta:
  **We haven't finished yet**. `already` e `didn't` ficam sobrando.
- "Verificar" → **"Correto"**, com o check verde.

### Cena 10 · 24,5 a 26,5 s · Fala, certo

- Enunciado: **"Diga esta frase em voz alta."** Apoio: **"Você já esteve em Londres?"**
- Um botão de microfone grande. Tocado, ele pulsa (é a única animação em loop permitida, enquanto
  grava) e barras de nível sobem e descem.
- A gravação para sozinha. Aparece o que foi entendido: **"Have you ever been to London?"**
- "Verificar" → **"Correto"**.
- Um botão **"Pular esta questão"** fica visível durante a gravação, discreto, embaixo do
  microfone (no produto ele sempre existe na fala).
- Legenda: **"E fala em voz alta."** e, menor: **"Vê o que foi entendido antes de enviar."**

### Cena 11 · 26,5 a 29,5 s · O professor vê

Pílula volta para "Você". O celular recua e sai; o cartão de resultados entra.

- Um sino no canto do cartão ganha um contador **1** e mostra o aviso **"Ana terminou Present
  perfect"**.
- O cartão de resultados da atividade **"Present perfect"**: três números no topo (tentativas,
  acerto médio, quase) e uma barra horizontal dividida em três faixas que **crescem da esquerda
  para a direita** (800 ms): certo em verde, quase em âmbar, errado em vermelho. A legenda da
  barra usa ícone e palavra para cada faixa, nunca só a cor.
- Abaixo, a lista "questões por dificuldade", com "Complete a frase" no topo (a que menos gente
  acertou).
- Legenda: **"Quem chegou perto fica separado de quem errou de vez."**

### Cena 12 · 29,5 a 33,5 s · Cartão final

- Fundo escuro (`panel`), formas de ambiente nas bordas.
- O logo grande, na versão para fundo escuro (azul claro `#608AFF`).
- **"Você precisa de uma conta. Seus alunos, não."**
- Botão azul: **"Teste grátis por 14 dias"**.
- Embaixo: **spokke.com.br**
- Nos últimos 0,5 s, o quadro escurece para o tom da cena 1, para o loop fechar sem pulo.

---

## 5. Todo texto que aparece na tela

Use estas frases exatamente. Nenhuma outra legenda entra.

| Cena | Legenda principal                                       | Linha menor                                                 |
| ---- | ------------------------------------------------------- | ----------------------------------------------------------- |
| 1    | Sua aula vira exercício.                                |                                                             |
| 2    | Cole as frases que você já usa.                         | A tradução vem pronta. Você só confere.                     |
| 3    | As questões saem do seu material.                       |                                                             |
| 4    | Mande para a turma.                                     | Link, QR na projeção ou um código de 4 letras para ditar.   |
| 6    | O aluno só precisa do link.                             | Abre no celular, digita o nome e responde.                  |
| 7    | Repete o áudio quantas vezes quiser.                    |                                                             |
| 8    | Faltou uma letra.                                       | A questão conta como quase.                                 |
| 10   | E fala em voz alta.                                     | Vê o que foi entendido antes de enviar.                     |
| 11   | Quem chegou perto fica separado de quem errou de vez.   |                                                             |
| 12   | Você precisa de uma conta. Seus alunos, não.            | Teste grátis por 14 dias · spokke.com.br                    |

Os textos DENTRO das telas (enunciados, botões, "Correto", "Quase.", "Verificando…", "3 de 4
áudios prontos") são os do produto e estão no roteiro.

Legendas: Bricolage Grotesque, peso 800, entre 64 e 88 px no palco de 1080, no máximo duas
linhas, alinhadas à esquerda ou centralizadas (escolha uma e mantenha). Linha menor em Plus
Jakarta Sans, peso 500, 36 a 42 px, com 70% de opacidade.

---

## 6. Identidade visual

### Cores

**Azul é a marca. Verde, âmbar e vermelho só existem para dizer certo, quase e errado.** Eles
nunca aparecem como decoração, fundo, gradiente ou destaque. Ciano é só para áudio e microfone.

| Papel                   | Claro     | Escuro    |
| ----------------------- | --------- | --------- |
| Marca, botão, foco      | `#3659CB` | `#608AFF` |
| Áudio, microfone        | `#0EA5B7` | `#35C4D4` |
| Certo                   | `#12855F` | `#3ECF98` |
| Quase                   | `#B26A00` | `#F2B23A` |
| Errado                  | `#C8324A` | `#FF7183` |
| Texto                   | `#111A31` | `#E7ECF8` |
| Fundo (100 / 200 / 300) | `#FFFFFF` / `#F2F5FC` / `#DEE6F9` | `#0F1420` / `#161C2D` / `#1E2842` |
| Borda de cartão         | `#D9E1F4` | `#26324F` |
| Cartão                  | `#FFFFFF` | `#13192A` |

Superfície escura do cartão final: fundo `#131E3D`, texto `#E7ECF8`, texto secundário `#9AA8C9`,
linha `#344369`.

Sombra dos cartões no claro: azul-tinta, nunca preto puro (`#111A31` com 10% a 18% de opacidade,
desfocada).

### Tipografia

| Papel                                   | Fonte                  |
| --------------------------------------- | ---------------------- |
| Legendas, títulos e números grandes     | Bricolage Grotesque    |
| Interface: botões, rótulos, etiquetas   | Plus Jakarta Sans      |
| O conteúdo em inglês (frases, palavras) | Noto Sans              |
| Link e código de acesso                 | JetBrains Mono         |

A frase do idioma que o aluno estuda é **sempre** Noto Sans, e nunca menor que o equivalente a
20 px de tela de celular.

### Logo

Os dois SVGs anexos, preenchidos com `#3659CB` (ou `#608AFF` sobre fundo escuro). Não redesenhe,
não recolora com gradiente, não ponha sombra nem contorno.

### O celular

É a moldura que o produto já usa no site: um aparelho genérico, sem marca de fabricante, com
borda grossa na cor `#111A31` (no palco de 1080, por volta de 22 px) e cantos bem arredondados
(por volta de 100 px). Sem entalhe exagerado, sem botões laterais detalhados. A tela dentro é o
produto, desenhada com os tokens acima.

### Interface

- Raio de campo `10 px` e de cartão `14 px` (em tamanho de celular; multiplique pela escala do
  palco). Botões e chips de seleção em pílula.
- Cartões com borda fina na cor de borda, fundo de cartão e a sombra azul-tinta.
- Ícones de traço de 2 px, cantos arredondados, sempre ao lado de um texto quando carregam
  significado.
- **Correção nunca é só cor.** Certo = check em círculo + "Correto". Quase = círculo meio cheio +
  "Quase.". Errado = X em círculo + "Incorreto".

### Formas de ambiente

O elemento decorativo da marca. Oito formas, e só elas: círculo, triângulo, hexágono, quadrado
arredondado, anel tracejado, arco, cruz e cápsula. Três a cinco por cena, em azul e ciano com
opacidade abaixo de 35%, girando e flutuando devagar.

Elas margeiam a cena pelas bordas (de cima, de baixo ou dos dois lados) e **nunca passam por trás
de texto**: nem da legenda, nem do enunciado, nem de uma alternativa. Na borda, somem em
degradê, nunca com corte reto.

---

## 7. Movimento

Os números são os do produto.

| O que se move                  | Duração  | Curva                                           |
| ------------------------------ | -------- | ----------------------------------------------- |
| Toque num botão                | 120 ms   | afunda; volta com ~4% de sobra                  |
| Cor, hover, saída de elemento  | 200 ms   | acelerando (`cubic-bezier(0.55, 0, 0.85, 0.5)`) |
| Painel, modal, bloco que abre  | 300 ms   | desacelerando (`cubic-bezier(0.22, 1, 0.36, 1)`) |
| Cartão grande, troca de cena   | 500 ms   | desacelerando                                   |
| Veredito da questão            | 220 ms   | desacelerando                                   |
| Barra de resultado crescendo   | 800 ms   | desacelerando                                   |
| Barra de progresso             | 1000 ms  | desacelerando                                   |
| De A para B (pílula, câmera)   | 300 ms+  | suave nas duas pontas (`cubic-bezier(0.65, 0, 0.35, 1)`) |

Regras:

- **Sair leva dois terços de entrar.** O que vai embora não prende o olho.
- **Troca de questão:** a questão atual sai para a esquerda em 200 ms, a próxima entra pela
  direita em 300 ms. Nunca as duas ao mesmo tempo.
- **Lista em sequência:** 60 ms entre itens, com teto no sexto.
- **Nada de mola elástica nem quique.** Enquanto balança, não se lê. O erro não tem sobra
  nenhuma; o feedback, no máximo 4%.
- Só o microfone gravando e os carregamentos ficam em loop. O resto anima uma vez.
- Toque do dedo: um círculo suave no ponto tocado (sem mão desenhada), para o espectador saber
  onde a interação aconteceu.

---

## 8. O que não pode

- **Nenhum número inventado como prova.** Nada de "milhares de professores", nota de avaliação,
  depoimento ou logo de cliente. Os números dentro da tela de resultados são de demonstração e
  aparecem só como interface.
- **Nenhuma funcionalidade que o produto não tem.** Fora do roteiro: upload de áudio, imagem ou
  vídeo próprio; correção de redação por IA; ranking entre alunos; app para baixar; leitura em voz
  alta de texto; chat. Também não escreva "sem cartão".
- **Nenhuma marca de terceiros.** Nada de WhatsApp, Google Classroom, Instagram ou bandeira de
  país. O link do aluno chega como pílula azul, não como mensagem de um aplicativo real.
- **Nenhum termo interno na tela:** Player, Studio, servidor, kernel, item, payload, versão.
- **Na copy:** sem travessão, sem emoji, sem exclamação, sem superlativo ("o melhor", "o mais
  fácil", "revolucione").
- **Nenhuma resposta certa à mostra antes da hora.** Na questão de escuta, a frase ouvida não
  aparece escrita até o veredito; na de montar, as pílulas começam embaralhadas.
- Verde, âmbar e vermelho fora do veredito e da barra de resultado.
- Texto sobre forma decorativa.

---

## 9. Entrega

1. **`spokke-propaganda-9x16-30s.mp4`**, na especificação da seção 1. É a entrega principal.
2. O HTML da animação que gerou o vídeo, com o palco de 1080 × 1920 e os controles da seção 1,
   para refazer o `.mp4` depois de um ajuste de texto ou de tempo.
3. Um quadro estático de cada cena (pode ser uma página com as doze miniaturas lado a lado),
   para revisar a composição sem dar play.
4. Se sobrar fôlego: uma versão de **15 s** com as cenas 1, 2, 6, 8 e 12, na mesma ordem, para
   anúncio curto, também em `.mp4` e na mesma especificação
   (`spokke-propaganda-9x16-15s.mp4`).
