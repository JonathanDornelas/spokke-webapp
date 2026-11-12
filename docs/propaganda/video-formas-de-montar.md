# Spokke · vídeo "do jeito que o material estiver"

Brief para o Claude Design. Contexto e orientações básicas de um vídeo em motion que mostra
**todas as formas de o material da aula entrar no Spokke**, da frase digitada à mão até a IA, e
que termina no mesmo lugar: as questões prontas.

Anexos: `spokke-marca.svg`, `spokke-icone.svg` e as capturas da seção 5
(`captura-das-telas.md` diz como gerá-las).

---

## 1. Formato

| O quê       | Valor                                                           |
| ----------- | --------------------------------------------------------------- |
| Proporção   | **16:9**, 1920 × 1080 (site, YouTube, apresentação para escola) |
| Duração     | 45 a 60 s                                                       |
| Corte extra | Opcional: 9:16 de 30 s com os degraus 1, 2, 7 e o fechamento    |
| Tema        | Claro                                                           |
| Som         | Funciona no mudo; a legenda carrega a mensagem                  |
| Arquivo     | `spokke-formas-de-montar-16x9.mp4`                              |

A especificação do `.mp4` (H.264, 30 fps constantes, `faststart`) e a exigência de uma animação
HTML determinística são as da seção 1 de `animacao-celular.md`. Área segura em 16:9: 96 px livres
nas laterais e 64 px em cima e embaixo para toda legenda.

---

## 2. Contexto

O professor de idiomas já tem material: a lista de frases no caderno, o vocabulário da unidade, o
texto do livro, o diálogo da aula passada. A objeção dele não é "não sei fazer exercício", é
"não tenho tempo de digitar tudo de novo numa ferramenta".

O vídeo responde isso mostrando que **qualquer ponto de partida serve**. Cada forma de entrar é
um degrau, e a cada degrau o professor faz menos. No fim, todas desembocam na mesma tela de
questões geradas.

**A ideia visual: uma régua de esforço.** Uma barra discreta na base do quadro, de "Na mão" até
"Com IA", com um marcador que avança um degrau a cada cena. A régua é o fio do vídeo: o espectador
sabe onde está e quanto falta.

**O tema do material é um só, do começo ao fim: rotina no presente simples.** É o exemplo que o
próprio produto usa nos campos vazios ("She leaves home at eight.", "Frases sobre rotina no
presente simples, nível de 7º ano, com horas.").

---

## 3. Os degraus

Ordem obrigatória, do mais manual ao mais automático. Os textos entre aspas são os do produto.

### Degrau 1 · Um de cada vez

O formulário de material, tipo **"Par de frases"**, em **"Como adicionar" → "Um de cada vez"**.

- O professor digita **"She leaves home at eight."** no campo "Frase em inglês".
- A tradução aparece sozinha: **"Traduzindo…"** e depois **"Ela sai de casa às oito."**, com
  **"Tradução automática. Confira e ajuste se precisar."**
- Ao lado, **"O que o aluno vai ver"** monta a questão enquanto ele digita: **"Montar a frase"**,
  com as palavras embaralhadas em peças.

Prova: até o jeito mais manual é rápido, e o professor vê a questão antes de publicar.

### Degrau 2 · Colar uma lista

**"Colar uma lista"**. Cinco ou seis frases de rotina coladas de uma vez, uma por linha, algumas
com tradução depois do separador e outras sem.

- A legenda dos separadores aceitos (ponto, barra, hífen com espaços, tabulação), que não são
  botões.
- A prévia linha a linha, com o contador (**"6 linhas · 6 viram material"**, **"3 ganham tradução
  automática ao adicionar"**) e "tradução automática" nas linhas sem tradução.
- O botão **"Adicionar 6 materiais"** e a confirmação: **"6 adicionados. 3 traduções vieram do
  tradutor automático: confira na lista."**

Prova: a lista que ele já tem entra inteira.

### Degrau 3 · Os outros tipos

Montagem rápida dos quatro cartões de tipo: **"Par de frases"**, **"Vocabulário"**, **"Texto"**,
**"Diálogo"**. Dois deles ganham um segundo de tela:

- **Texto**: o trecho colado e duas perguntas de compreensão, campo a campo.
- **Diálogo**: falas de A e B, com reordenar.

Prova: texto e diálogo também viram questão. As perguntas do texto viram escolha; as falas do
diálogo, um exercício de pôr na ordem.

### Degrau 4 · Da biblioteca

Na etapa de materiais, **"Usar da biblioteca"**: o painel **"Da sua biblioteca"**, com busca,
filtro por tipo e por idioma, e seleção múltipla. Seis frases da aula passada marcadas,
**"Trazer 6"**, e elas entram na lista da atividade com a etiqueta **"biblioteca"**; o topo da
lista passa a dizer **"6 vindos da biblioteca"**.

Prova: o que já foi cadastrado não se digita de novo.

### Degrau 5 · Gerar com IA

**"Gerar com IA"**, com a fonte **"Prompt · você descreve"** escolhida.

- Em **"O que você quer treinar"**: **"Frases sobre rotina no presente simples, nível de 7º ano,
  com horas"**, e o atalho **"com negativa"** tocado, que acrescenta ", com negativa" ao pedido.
- **"Quantos gerar"** em 10 e o botão **"Gerar 10 propostas · 10 créditos"**, que vira
  **"Gerando…"**.
- A lista de propostas: **"10 propostas · 9 marcadas"**, uma delas com a etiqueta **"você já
  tem"** e desmarcada.
- Embaixo: **"A IA propõe; quem decide é você."** O professor desmarca uma e toca
  **"Adicionar 8 materiais"**.

Prova: sem material pronto, ele descreve e escolhe. Nada entra sem a marcação dele.

### Degrau 6 · A foto da página

No mesmo seletor de "Gerar com IA", a fonte **"Imagem · foto de página"**.

- A área **"Arraste uma foto ou toque para escolher"** recebe a foto de uma página de livro. Um
  instante de **"Preparando a foto…"** e a miniatura aparece, com **"Pronta para a IA ler. Toque
  para trocar."**
- O campo **"Foco do material · opcional"** fica em branco.
- O botão diz **"Gerar 10 propostas · 11 créditos"**, e a linha sob ele separa a conta: **"Saldo:
  N créditos. São 10 das propostas e 1 da leitura da foto. A proposta que não servir é
  devolvida."** (o saldo é o da conta na hora da captura).
- As propostas chegam com as frases da página.

Prova: a página que o professor já usa vira material sem digitar nada.

### Degrau 7 · A fala de um vídeo

A fonte **"Vídeo · com fala"**.

**A cena abre na aula, não no formulário.** Uma janela de videochamada genérica toca um trecho da
gravação de uma aula online: um professor sozinho na câmera, falando com a turma. A janela encolhe
até virar o cartão de um arquivo, **"aula-online-rotina.webm"**, que cai na área de arrastar do
formulário. Daí em diante, as capturas:

- **"Lendo o áudio do vídeo…"**, e a área mostra o nome do arquivo e **"Vídeo de 4:11. Toque para
  trocar."**
- Em **"Trecho a usar"**, de **0:30** até **3:00**. Embaixo: **"2:30 de fala vão para a IA."**
- O botão diz **"Gerar 10 propostas · 13 créditos"**, e a linha sob ele: **"Saldo: N créditos. São
  10 das propostas e 3 da leitura de 3 min de fala. A proposta que não servir é devolvida."**
- O aviso da tela fica visível por um instante: **"O vídeo não sai do seu computador. Só a fala do
  trecho vai para a IA, que a lê uma vez para propor o material, e nada fica guardado. Use um vídeo
  seu ou de material didático, sem gravação de aluno."**

Prova: um vídeo com fala também serve, e o professor escolhe o pedaço.

**O clipe da aula vem de banco de vídeo e é só a imagem da cena.** O áudio que a captura leu é o
nosso, gravado com o serviço de voz do Spokke (`scripts/capturas/arquivos.ts`).

- **Sugestão: "Teacher in online class", da Mixkit**
  (https://mixkit.co/free-stock-video/teacher-in-online-class-10443/): um professor sozinho diante do
  notebook, de fone, 10 s, até 4K, sem marca à vista. **Reserva:** Pexels 7013892 (cottonbro), uma
  professora numa aula online diante de uma tabela periódica; recorte o logo do notebook.
- **Confira a licença do banco antes de publicar.** A da Pexels proíbe sugerir que a pessoa do vídeo
  endossa a marca: nenhuma legenda diz ou insinua que aquele professor usa o Spokke.
- **Nenhuma marca de videochamada.** Nada de logo, cor ou botão do Zoom, do Meet ou do Teams: a
  moldura é genérica, com fundo escuro, o quadro de quem fala e um ícone de microfone.
- **Nenhum aluno na tela.** O vídeo de exemplo é material didático ou do professor, nunca uma aula
  com alunos, que é o que a própria tela pede.
- O nome no cartão do arquivo é **"aula-online-rotina.webm"**, o mesmo da captura.

### Fechamento · Tudo chega ao mesmo lugar

Os cartões de cada degrau convergem para a lista **"Materiais desta atividade"**. O botão
**"Gerar questões"** é tocado e espera com **"Gerando…"**, e a etapa **"Revisar"** abre com
**"12 questões propostas"**: cartões de questão, cada um com o que o aluno faz e a habilidade
(escuta, fala, leitura, escrita). Depois, o cartão final.

---

## 4. Texto na tela

Na voz do Spokke (`../spokke-seo/project/brain/voice.md`): direta, em segunda pessoa, sem
travessão, sem exclamação e sem superlativo. Ajustes de ritmo são bem-vindos; promessa nova não.

| Cena       | Legenda principal                              | Linha menor                                                                |
| ---------- | ---------------------------------------------- | -------------------------------------------------------------------------- |
| Abertura   | Seu material entra do jeito que estiver.       | Digitado, colado, fotografado ou falado num vídeo.                         |
| Degrau 1   | Digite a frase. A tradução vem sozinha.        | Ao lado, a questão que o aluno vai responder.                              |
| Degrau 2   | A lista da aula passada entra inteira.         | Uma frase por linha. Você vê o que vira material antes de adicionar.       |
| Degrau 3   | Texto e diálogo também viram questão.          | As perguntas do texto viram escolha. O diálogo vira uma ordem para montar. |
| Degrau 4   | O que você já cadastrou não se digita de novo. | Marque na biblioteca e traga tudo de uma vez.                              |
| Degrau 5   | A IA propõe. Quem escolhe é você.              | Nos planos Pro e Super. Proposta que não serve devolve o crédito.          |
| Degrau 6   | A página do livro vira material.               | Tire a foto, e a IA lê o texto dela.                                       |
| Degrau 7   | Um vídeo com fala também serve.                | Você escolhe o trecho, e só a fala vai para a IA.                          |
| Fechamento | Do jeito que entrar, as questões saem prontas. | Com áudio gerado do texto.                                                 |
| Final      | Comece pelo material que você já tem.          | Teste grátis por 14 dias · spokke.com.br                                   |

Rótulos da régua: **"Na mão"** numa ponta, **"Com IA"** na outra. Nada escrito entre elas além
dos pontos dos degraus.

---

## 5. Como a tela aparece

O lado do professor é **painel**: a tela do computador recortada, sem moldura de notebook, com o
componente ampliado para ser lido. O formulário de material é o centro do vídeo, e ele aparece
sempre pelo **recorte** do componente real, nunca redesenhado (`captura-das-telas.md`).

As capturas saem de `scripts/capturas/video-formas-de-montar.ts` (`captura-das-telas.md` diz como
rodar), em `capturas/formas-de-montar/`, todas em computador (1440 × 900, escala 2), na etapa de
materiais de uma atividade nova em inglês para quem fala português ("Rotina 3 — meu dia"). Cada
estado tem a tela inteira e o recorte do formulário (`-formulario`); os principais têm também o
formulário inteiro, sem a rolagem de dentro (`-formulario-inteiro`).

| #   | Tela                      | Arquivos, na ordem dos estados                                                                                                   |
| --- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 01  | "Um de cada vez"          | `01-um-vazio` · `01-um-digitado` · `01-um-traduzindo` · `01-um-traduzido` · `01-um-previa` (a prévia do aluno, "Montar a frase") |
| 02  | "Colar uma lista"         | `02-lista-vazia` · `02-lista-colada` · `02-lista-previa` · `02-lista-adicionada`                                                 |
| 03  | Os tipos, Texto e Diálogo | `03-tipos` (os quatro cartões) · `03-texto` ("Leo's morning", duas perguntas) · `03-dialogo` (quatro falas de A e B)             |
| 04  | "Usar da biblioteca"      | `04-biblioteca-aberta` · `04-biblioteca-seis-marcadas` (com `-painel`) · `04-biblioteca-na-lista` (com `-coluna`)                |
| 05  | "Gerar com IA", Prompt    | `05-ia-prompt` · `05-ia-gerando` · `05-ia-propostas` (com `-lista`) · `05-ia-desmarcada` ("Adicionar 8 materiais")               |
| 06  | "Gerar com IA", Imagem    | `06-foto-vazia` · `06-foto-preparando` · `06-foto-pronta` (11 créditos) · `06-foto-propostas`                                    |
| 07  | "Gerar com IA", Vídeo     | `07-video-vazio` · `07-video-lendo` · `07-video-trecho` (2:30 de fala, 13 créditos) · `07-video-propostas`                       |
| 08  | Fechamento                | `08-materiais-desta-atividade` · `08-gerando` ("Gerando…" no botão) · `08-revisar` (com `-pagina-inteira`)                       |

A geração das questões é síncrona: a espera que aparece é o **"Gerando…"** do botão, e a Revisar
abre já com as questões. Não há esqueleto de carregamento nessa passagem.

A IA das capturas é um servidor local com propostas fixas, e o resto é o produto: a conta de
créditos, o "você já tem", a tradução automática ("O que é de verdade", em
`captura-das-telas.md`).

Os créditos que aparecem nos botões são os que o produto calcula (`custoDaGeracao`): 1 por
proposta, mais 1 pela leitura da foto, ou 1 por minuto de fala começado. Com 10 propostas: 10 no
prompt, 11 na foto e 13 nos 2:30 de fala (3 minutos começados). Se a captura usar outra quantidade
ou outro trecho, o número da tela muda junto; nunca escreva um número que a tela não mostrou.

---

## 6. Identidade e movimento

Valem inteiras as seções 6 (cores, tipografia, logo, interface, formas de ambiente) e 7
(movimento) de `animacao-celular.md`. Neste vídeo, ainda:

- **A régua de esforço** é azul da marca (`#3659CB`) sobre `base-300`. O marcador anda de A para
  B em 300 ms, com a curva suave nas duas pontas.
- **O cartão do degrau sai para a esquerda e o próximo entra pela direita**, nunca os dois ao
  mesmo tempo, como a troca de questão do produto.
- **Na leitura do vídeo, nada de barra de upload com porcentagem**: o vídeo não sobe. A espera é a
  do produto, "Lendo o áudio do vídeo…" com a fila de formas.
- Verde só onde o produto já usa verde: o check da prévia e a confirmação de "adicionados".

---

## 7. O que não pode

As regras da seção 8 de `animacao-celular.md` valem aqui. Para este vídeo:

- **Nenhum vídeo nem foto com aluno.** O vídeo de exemplo é material didático ou do professor; a
  foto é de livro, lousa ou caderno, sem rosto.
- **A foto e o vídeo não ficam guardados nem entram na atividade.** Eles viram material de texto.
  Nada de mostrar a foto dentro de uma questão do aluno.
- **Nenhuma importação de planilha ou PDF**: não existe. O professor cola texto, fotografa a página
  ou escolhe um vídeo.
- **A IA não corrige nem publica nada sozinha.** Ela propõe material, o professor marca e
  confirma. Nada de "a IA cria a atividade inteira".
- **Gerar com IA é dos planos Pro e Super.** Se a cena da IA ficar sem a linha menor, a
  informação vai no cartão final.
- **Nenhum termo interno:** "itens" vira "questões" (`captura-das-telas.md`, "Cuidados").

---

## 8. Entrega

1. `spokke-formas-de-montar-16x9.mp4`.
2. O HTML da animação, com os controles da seção 1 de `animacao-celular.md`.
3. Uma página com um quadro estático de cada degrau, para revisar sem dar play.
4. Se sobrar fôlego, o corte 9:16 de 30 s (`spokke-formas-de-montar-9x16-30s.mp4`).
