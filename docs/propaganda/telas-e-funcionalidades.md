# Spokke · telas e funcionalidades da propaganda

Brief para o Claude Design. Este arquivo diz **o que** a propaganda mostra: as telas do produto,
o que aparece dentro de cada uma e a funcionalidade que cada uma prova. Ele **não** diz em que
ordem elas entram, quanto tempo cada uma fica, como a câmera se move, como uma passa para a outra
nem o que vai escrito por cima. Isso fica com quem faz o vídeo.

O que este arquivo exige é **fidelidade**: toda tela, todo botão e todo texto dentro dela são do
produto como ele é hoje. Os textos entre aspas foram conferidos no código e entram exatamente
assim.

Formato: vídeo vertical 9:16 (1080 × 1920) para Reels, Stories, TikTok e Shorts. A maioria das
pessoas assiste sem som.

Anexos que acompanham este arquivo:

- `spokke-marca.svg`: o logo inteiro ("Spokke", com o ícone no lugar do S).
- `spokke-icone.svg`: só o ícone (o S com o balão de fala).

Se o design system do Spokke já estiver neste projeto do Claude Design (os desenhos "Player
Teclado", "Home Funcionalidades", "Faixa Letreiro" e "Studio Resultados v2" saíram daqui), use-o.
A seção 6 é a referência caso não esteja.

---

## 1. O produto, em quatro linhas

O Spokke é para professor de idiomas e para escola de idiomas. O professor cola as frases, o
vocabulário ou o texto que já usa em aula, e as questões saem prontas: escuta, fala, leitura e
escrita, com áudio gerado do texto. Ele publica e manda um link. O aluno abre no celular, digita o
nome e responde, **sem criar conta e sem instalar nada**, e a correção chega na hora, com um
estado que quase nenhuma ferramenta tem: o **quase**, para quem chegou perto.

---

## 2. Quem e o quê aparece

| O quê              | Valor                                                                      |
| ------------------ | -------------------------------------------------------------------------- |
| Professor          | Trabalha no painel, num computador                                         |
| Aluno              | Responde no celular. O nome dele é **Ana**                                 |
| Atividade          | **Present perfect** · idioma **Inglês** · nível **B1 · Intermediário**     |
| Link da atividade  | `spokke.com.br/a/cmhx4k2p70003qz8f1w6ty9be`                                |
| Código de acesso   | **KTRM**                                                                   |

**O link não tem nome bonito, e isso é o produto.** O endereço sai do identificador da atividade;
o professor não escolhe o texto dele. No campo do link ele aparece cortado com reticências, como
no produto. Não escreva `spokke.com.br/a/present-perfect`: essa forma não existe.

### O material que liga as telas

O professor cola estas quatro linhas, e são elas que viram as questões que a Ana responde. Quem
assiste precisa reconhecer no celular da Ana a frase que viu sendo colada no painel.

```
I have lived here for two years. | Eu moro aqui há dois anos.
She has been working here since 2019. | Ela trabalha aqui desde 2019.
We haven't finished yet. | Nós ainda não terminamos.
Have you ever been to London?
```

A quarta linha vem **sem tradução** de propósito: é ela que mostra a tradução automática.

---

## 3. As telas do professor

As telas do professor são do painel (desktop). Podem aparecer inteiras, recortadas ou ampliadas;
o enquadramento é livre. O que não muda é o conteúdo.

### P1 · Cadastrar o material, colando uma lista

**Funcionalidade:** o professor cola a lista que já tem, o Spokke separa cada linha em frase e
tradução, e a tradução que falta vem pronta.

O formulário de material, dentro da etapa "Materiais" da criação:

- Os quatro tipos em cartões, com **"Par de frases"** escolhido (os outros: "Vocabulário",
  "Texto", "Diálogo").
- O seletor em pílula "Como adicionar" com **"Colar uma lista"** escolhido.
- O rótulo **"Uma frase por linha"** e, ao lado, menor:
  **"a tradução depois do separador é opcional: sem ela, sai sozinha"**.
- A caixa de texto com as quatro linhas da seção 2, na fonte do conteúdo (Noto Sans).
- Logo abaixo, a **legenda dos separadores aceitos**, quatro pílulas neutras: `·` ponto, `|`
  barra, `-` hífen com espaços, `⇥` tabulação. Elas **não são botões e nenhuma fica
  selecionada**: os quatro valem ao mesmo tempo.
- A **prévia linha a linha**, que é o coração da tela:
  - no topo dela: **"4 linhas · 4 viram material"** e, ao lado,
    **"1 ganha tradução automática ao adicionar"**;
  - uma linha por frase: o número, a frase em inglês e, ao lado, a tradução em cinza, com um
    check no fim;
  - na quarta linha, no lugar da tradução, **"tradução automática"** em itálico.
- O botão **"Adicionar 4 materiais"**.

Depois de adicionar, a tela confirma:
**"4 adicionados. Uma tradução veio do tradutor automático: confira na lista."**
E na lista de materiais a quarta frase já aparece com a tradução
**"Você já esteve em Londres?"**.

> A tradução **não** aparece na prévia antes de adicionar. Na prévia a linha diz "tradução
> automática"; a frase em português surge na lista, depois do "Adicionar".

### P2 · Revisar as questões geradas

**Funcionalidade:** as questões saem do material sozinhas, e o professor só revisa.

- O indicador de etapas no topo: **Detalhes · Materiais · Revisar · Publicar**, com "Revisar"
  marcada e as duas anteriores com check.
- Enquanto gera, um esqueleto de carregamento (barras cinza com a forma dos cartões).
- Depois, os cartões de questão, agrupados pelo material de onde saíram (um rótulo pequeno
  **"De um par de frases"** e a frase entre aspas). Cada cartão tem o resumo da questão em cima e,
  embaixo, o tipo e a habilidade, por exemplo **"Escolher a alternativa · escuta"**.
- Os quatro cartões que importam para o vídeo (são as questões da seção 4):
  - **"Ouvir e escolher entre as opções"**
  - **"Completar a lacuna na frase"**
  - **"Montar a frase a partir da tradução"**
  - **"Falar a frase em voz alta"**
- O botão **"Aceitar todos"** e, em cada cartão, a ação de descartar.

O professor **nunca escolhe a habilidade** de uma questão: ela é calculada. Não desenhe campo,
seletor ou etiqueta editável de "habilidade".

### P3 · Publicar e mandar para a turma

**Funcionalidade:** o áudio das questões de escuta é gerado do texto, e a atividade vira um link,
um QR e um código.

Antes de publicar:

- O indicador de etapas com **"Publicar"** marcada.
- **"Habilidades treinadas"**: pílulas com o nome e a contagem de cada habilidade (Escuta, Fala,
  Leitura, Escrita). Elas são o resultado do cálculo, não uma escolha.
- Os interruptores **"Código de acesso"** ("Exige um código antes de o aluno começar.") e
  **"Mostrar o resultado ao aluno"**.
- O bloco do áudio, com progresso de verdade: **"3 de 4 áudios prontos"**, a barra em ciano,
  chegando a **"4 de 4 áudios prontos"**. Enquanto falta áudio, o botão de publicar fica
  desativado.
- O botão **"Publicar"**.

Depois de publicar, a mesma tela vira o desfecho:

- O cartão **"No ar"**, com o check em círculo.
- Dentro dele, o link em fonte mono com o botão **"Copiar"** (que vira **"Copiado"** ao tocar).
- Logo abaixo, o código: o rótulo **"Código"**, as letras **KTRM** grandes e espaçadas em azul, e
  ao lado **"Dite em aula. O link sozinho não abre."**
- Ao lado, o **QR da atividade** em tamanho de projeção, num quadro branco.

São três formas do mesmo endereço: o link para mandar, o QR para projetar na sala e o código para
ditar.

> **Código e entrada do aluno andam juntos.** Com o código ligado, o link sozinho não abre: a
> primeira tela da Ana é a do código (A1). Se o vídeo não for mostrar essa tela, a atividade é
> publicada sem código, e o cartão "No ar" mostra só o link e o QR.

### P4 · Ver o resultado

**Funcionalidade:** o professor fica sabendo quando o aluno termina, e quem chegou perto aparece
separado de quem errou.

- O **sino** do cabeçalho com o número **1** em azul (vermelho é erro; "tem algo novo" não é) e,
  aberto, o aviso **"Ana terminou Present perfect"**.
- A tela de resultados da atividade **"Present perfect"**, com a pílula **"No ar"**:
  - três números no topo: **tentativas**, **acerto médio** (o número em verde) e **parcial** (o
    número em âmbar);
  - a lista das questões **da que menos gente acertou para a que mais acertou**, cada uma com o
    rótulo do que o aluno fez e uma barra dividida em três faixas: certo em verde, quase em âmbar,
    errado em vermelho. "Completar a lacuna" fica no topo;
  - à direita, **"Tentativas recentes"**, com a sequência de questões de cada tentativa em
    barrinhas.
- A legenda das faixas usa ícone e palavra para cada uma, nunca só a cor.

Os números são de demonstração e só aparecem como interface. Nada de número como prova.

---

## 4. As telas do aluno

O aluno aparece **sempre dentro de um celular** (a moldura está na seção 6). O que está na tela do
aparelho é exatamente o que a Ana vê.

### A1 · Código da turma (só se o código for mostrado em P3)

- Título **"Digite o código da turma"** e, embaixo,
  **"Seu professor passou um código de 4 letras junto com o link."**
- Quatro caixas, uma letra em cada: K, T, R, M.
- Se o vídeo quiser mostrar o erro: **"Código incorreto. Confira com seu professor."**

### A2 · Entrada

**Funcionalidade:** o aluno só precisa do link e do nome. Sem conta, sem cadastro, sem app.

- O título da atividade **"Present perfect"**, a etiqueta do idioma **Inglês** e o nível
  **B1 · Intermediário**.
- Um cadeado pequeno com **"Você não precisa de conta"**.
- O campo **"Seu nome ou apelido"**, com **"Ana"** digitado.
- O botão **"Começar"**.

### Como é toda tela de questão

Vale para A3 a A6:

- **Topo:** a barra de progresso fina (anda a cada questão), o regulador de volume e a bandeira de
  relatar problema, os dois como ícones.
- **Meio:** o enunciado e a área de resposta. **Uma pergunta por tela.**
- **Rodapé fixo:** o botão principal em largura cheia, **"Verificar"**. Na questão de fala ele
  divide o rodapé com **"Pular"**.
- **Verificar não é instantâneo:** a correção acontece fora do aparelho. Enquanto ela chega, o
  botão diz **"Verificando…"** e um véu leve cobre a resposta com **"Verificando sua resposta"**.
- **O veredito** entra num bloco com ícone e palavra: **"Correto."** (check em círculo, verde),
  **"Quase."** (círculo meio cheio, âmbar) ou **"Não foi dessa vez."** (X em círculo, vermelho).
- **Depois do veredito, nada avança sozinho:** o botão vira **"Próxima questão"** e quem decide é
  o aluno. Na última, **"Ver o resultado"**.

### A3 · Escuta

**Funcionalidade:** o áudio é gerado do texto do professor, e o aluno repete quantas vezes
quiser, na velocidade que quiser.

- Enunciado: **"Ouça e escolha o que você ouviu."**
- O reprodutor de áudio em ciano: botão de tocar, a onda animando enquanto toca e o botão de
  velocidade, que alterna entre 1×, 0,75× e 0,5×. Nada toca sozinho: é preciso apertar o play.
- Três alternativas em cartões grandes:
  - I have lived here for two years.
  - I lived here two years ago.
  - I will live here for two years.
- A escolhida ganha contorno azul. Veredito: **"Correto."**

### A4 · Lacuna, com "quase" (a funcionalidade principal)

**Funcionalidade:** quem chegou perto recebe **quase**, não erro, e vê o que era esperado. É a
tela que vende o produto.

- Enunciado: **"Complete a frase."** Embaixo, a frase de apoio em português:
  **"Ela trabalha aqui desde 2019."**
- A frase com a lacuna, em fonte grande: **She \_\_\_\_\_\_ here since 2019.** A lacuna tem o
  tamanho da resposta, não um traço padrão.
- O teclado do próprio celular (em inglês o Spokke não mostra teclado próprio). Ana digita
  **has been workin**, sem o "g" final.
- Veredito em âmbar: o círculo meio cheio, **"Quase."** e, embaixo,
  **A resposta esperada era "has been working".**

### A5 · Montar a frase

**Funcionalidade:** o aluno monta a frase com peças, e as peças erradas vêm do próprio material
do professor.

- Enunciado: **"Monte a frase."** Apoio: **"Nós ainda não terminamos."**
- Seis peças em pílulas, embaralhadas: `finished`, `already`, `We`, `yet`, `didn't`, `haven't`.
- Tocando as peças, uma por vez, a linha de resposta forma **We haven't finished yet**.
  `already` e `didn't` sobram.
- Veredito: **"Correto."**

### A6 · Fala

**Funcionalidade:** o aluno fala em voz alta, vê o que foi entendido antes de enviar e pode
gravar de novo.

- Enunciado: **"Diga esta frase em voz alta."** Apoio: **"Você já esteve em Londres?"**
- O botão grande de microfone com **"Toque para gravar"**. Gravando, ele pulsa e barras de nível
  sobem da base. **A gravação para sozinha** quando a Ana para de falar.
- Antes de enviar, o quadro **"Entendemos"** com **"Have you ever been to London?"** entre aspas
  e, embaixo, **"Não foi isso? Toque no microfone e grave de novo."**
- **"Pular"** fica no rodapé o tempo todo, ao lado de "Verificar".
- Veredito: **"Correto."**

---

## 5. Funcionalidades, uma a uma

Use esta lista para conferir se o vídeo mostra o que precisa. A coluna da direita é o mínimo que
tem de estar visível para a funcionalidade ser entendida sem som.

| Funcionalidade                           | Tela    | O que precisa estar visível                                       |
| ---------------------------------------- | ------- | ----------------------------------------------------------------- |
| Colar a lista que o professor já tem     | P1      | A caixa com as linhas e a prévia separando frase e tradução       |
| Tradução automática                      | P1      | "tradução automática" na linha 4 e depois a frase traduzida       |
| As questões saem do material             | P2      | Os cartões gerados, com a frase de origem acima deles             |
| Quatro habilidades, calculadas           | P2, P3  | O tipo e a habilidade em cada cartão; as pílulas com contagem     |
| Áudio gerado do texto                    | P3, A3  | "3 de 4" chegando a "4 de 4"; o reprodutor tocando                |
| Link, QR e código                        | P3      | O cartão "No ar" com os três                                      |
| Aluno sem conta                          | A2      | O cadeado com "Você não precisa de conta" e o campo do nome       |
| Uma pergunta por tela                    | A3 a A6 | O celular com uma questão e o botão no rodapé                     |
| Correção de verdade, não instantânea     | A3 a A6 | "Verificando…" antes do veredito                                  |
| O **quase**                              | A4      | "Quase." em âmbar com a resposta esperada                         |
| Montar com peças                         | A5      | As peças sobrando depois de a frase estar montada                 |
| Fala com prévia do que foi entendido     | A6      | O quadro "Entendemos" antes do "Verificar"                        |
| O professor sabe quem terminou           | P4      | O sino com "Ana terminou Present perfect"                         |
| Quase separado de errado no resultado    | P4      | As três faixas, com o âmbar entre o verde e o vermelho            |

---

## 6. Identidade visual

### Cores

**Azul é a marca. Verde, âmbar e vermelho só existem para dizer certo, quase e errado**, e
aparecem só onde o produto os usa: o veredito, as faixas e os números de resultado, os checks da
prévia e o "No ar". Nunca como decoração, fundo, gradiente ou destaque. Ciano é só para áudio e
microfone.

| Papel                   | Claro                             | Escuro                            |
| ----------------------- | --------------------------------- | --------------------------------- |
| Marca, botão, foco      | `#3659CB`                         | `#608AFF`                         |
| Áudio, microfone        | `#0EA5B7`                         | `#35C4D4`                         |
| Certo                   | `#12855F`                         | `#3ECF98`                         |
| Quase                   | `#B26A00`                         | `#F2B23A`                         |
| Errado                  | `#C8324A`                         | `#FF7183`                         |
| Texto                   | `#111A31`                         | `#E7ECF8`                         |
| Fundo (100 / 200 / 300) | `#FFFFFF` / `#F2F5FC` / `#DEE6F9` | `#0F1420` / `#161C2D` / `#1E2842` |
| Borda de cartão         | `#D9E1F4`                         | `#26324F`                         |
| Cartão                  | `#FFFFFF`                         | `#13192A`                         |

O tema claro é o padrão do produto. Sombra dos cartões no claro: azul-tinta (`#111A31` com 10% a
18% de opacidade, desfocada), nunca preto puro.

### Tipografia

| Papel                                   | Fonte               |
| --------------------------------------- | ------------------- |
| Títulos e números grandes               | Bricolage Grotesque |
| Interface: botões, rótulos, etiquetas   | Plus Jakarta Sans   |
| O conteúdo em inglês (frases, palavras) | Noto Sans           |
| Link e código de acesso                 | JetBrains Mono      |

A frase em inglês é **sempre** Noto Sans, e nunca menor que o equivalente a 20 px de tela de
celular.

### Logo

Os dois SVGs anexos, preenchidos com `#3659CB` (ou `#608AFF` sobre fundo escuro). Não redesenhe,
não recolora com gradiente, não ponha sombra nem contorno.

### O celular

Um aparelho genérico, sem marca de fabricante, com borda grossa na cor `#111A31` e cantos bem
arredondados. Sem entalhe exagerado, sem botões laterais detalhados. A tela dentro é o produto,
desenhada com os tokens acima.

### Interface

- Raio de campo `10 px` e de cartão `14 px` (em tamanho de celular). Botões e seletores em pílula.
- Cartões com borda fina na cor de borda, fundo de cartão e a sombra azul-tinta.
- Ícones de traço de 2 px, cantos arredondados, sempre ao lado de um texto quando carregam
  significado.
- **Correção nunca é só cor.** Sempre ícone e palavra.
- Nada de mola elástica nem quique: o produto não balança.

### Formas de ambiente

O elemento decorativo da marca. Oito formas, e só elas: círculo, triângulo, hexágono, quadrado
arredondado, anel tracejado, arco, cruz e cápsula, em azul e ciano com opacidade abaixo de 35%.
Elas margeiam pelas bordas e **nunca passam por trás de texto**; na borda, somem em degradê. Ficam
fora da tela do celular, nunca dentro dele.

---

## 7. O que não pode

- **Nenhuma funcionalidade que o produto não tem.** Fora daqui: upload de áudio, imagem ou vídeo
  próprio; correção de redação por IA; ranking entre alunos; app para baixar; leitura em voz alta
  de texto; chat; link com nome escolhido pelo professor. Também não escreva "sem cartão".
- **Nenhum número inventado como prova.** Nada de "milhares de professores", nota de avaliação,
  depoimento ou logo de cliente.
- **Nenhuma marca de terceiros.** Nada de WhatsApp, Google Classroom, Instagram ou bandeira de
  país. Se o link aparecer chegando ao aluno, ele chega como pílula azul, não como mensagem de um
  aplicativo real.
- **Nenhum termo interno na tela:** Player, Studio, servidor, kernel, item, payload, versão.
  Atenção: dois rótulos do produto ainda dizem "itens" (o contador da etapa Revisar e o título da
  lista de dificuldade nos resultados). Na propaganda eles dizem **"questões"**: "4 questões
  propostas" e "Questões ordenadas por dificuldade".
- **Nenhuma resposta certa à mostra antes da hora.** Na escuta, a frase ouvida não aparece escrita
  até o veredito; no montar, as peças começam embaralhadas; na lacuna, a resposta só aparece no
  "Quase.".
- **Nenhum veredito sem o "Verificando…" antes.** A correção não é feita no aparelho.
- **Na copy fora das telas** (se houver): sem travessão, sem emoji, sem exclamação, sem
  superlativo ("o melhor", "o mais fácil", "revolucione").
