# Spokke · vídeo "sua sequência vira um mapa"

Brief para o Claude Design. Contexto e orientações básicas de um vídeo em motion sobre os
**módulos**: o professor junta atividades numa sequência, escolhe o ritmo de cada turma, e o
aluno com conta vê essa sequência como um mapa de fases em 8 bits, com o próprio avatar andando
até o castelo.

Anexos: `spokke-marca.svg`, `spokke-icone.svg` e as capturas da seção 5
(`captura-das-telas.md` diz como gerá-las).

---

## 1. Formato

| O quê     | Valor                                                      |
| --------- | ---------------------------------------------------------- |
| Proporção | **9:16**, 1080 × 1920 (Reels, Stories, TikTok, Shorts)     |
| Duração   | 36 a 40 s, com o último quadro voltando ao primeiro (loop) |
| Tema      | Claro. O cartão final usa a superfície escura              |
| Som       | Funciona no mudo                                           |
| Arquivo   | `spokke-modulos-9x16.mp4`                                  |

Especificação do `.mp4`, área segura e animação HTML determinística: seção 1 de
`animacao-celular.md`, sem mudança.

---

## 2. Contexto

Atividade solta resolve uma aula. Uma unidade inteira pede sequência: o vocabulário primeiro,
depois a feira, a receita e o diálogo. O módulo é essa sequência. O professor monta uma vez,
escolhe para quais turmas ela vai e em que ritmo, e cada atividade abre na data marcada.

Do outro lado, o aluno que tem conta na turma não recebe uma lista de links. Ele vê um **mapa**:
cada atividade é uma fase, o personagem é o avatar que ele mesmo montou, a fase trancada mostra o
dia em que abre, e a última leva ao castelo. É aqui que o vídeo mostra o jogo, com as regras que o
produto já tem: nada de ranking, e estrela só onde o professor liberou o resultado.

**O conceito dos dois lados continua o de `animacao-celular.md`:** o professor é **painel**
(cartões recortados flutuando no fundo claro) e o aluno é **celular** (a tela dentro do aparelho).
A pílula "Você / Seu aluno" no topo marca de quem é a vez.

**O 8 bits só existe dentro do celular, no mapa.** O painel do professor e o restante do vídeo
seguem o visual de sempre. O contraste entre os dois é o que vende a ideia: a mesma sequência,
séria de um lado e de jogo do outro.

**Os dados são os do seed de demonstração**, para a captura sair do produto:

| O quê  | Valor                                                                                  |
| ------ | -------------------------------------------------------------------------------------- |
| Módulo | **Frutas**, etiqueta teal, "Vocabulário de frutas, da feira à receita."                |
| Fases  | Frutas 1 — vocabulário · Frutas 2 — na feira · Frutas 3 — receita · Frutas 4 — diálogo |
| Turma  | **8º A — inglês**                                                                      |
| Ritmo  | Por semana, toda quarta, 08:00, horário de Brasília                                    |
| Aluna  | **Ana**, a mesma das outras propagandas, com o avatar em pixel art dela                |

---

## 3. Roteiro em blocos

Os tempos são o alvo; cada bloco pode variar em até 1 s.

### Bloco 1 · 0 a 3 s · O mapa (aluno)

O vídeo abre direto no celular da Ana, no mapa do módulo Frutas: o rótulo pixel **"MUNDO 1"**, o
caminho vertical com quatro fases, a bandeira de largada embaixo e o castelo no topo. O avatar dela
está parado na fase 2.

### Bloco 2 · 3 a 8 s · Montar a sequência (professor)

Pílula em "Você". A bandeja de criar módulo: nome **"Frutas"**, a etiqueta teal com a sigla, e as
quatro atividades marcadas uma a uma, na ordem, cada uma ganhando o número da posição. Depois, o
bloco **"Atividades, na ordem"** do módulo aberto, com uma linha sendo arrastada para a posição
certa (o arraste é refeito por cima da captura 03).

### Bloco 3 · 8 a 14 s · Turma e ritmo (professor)

**"Adicionar turmas"**, cada turma com o tamanho e o idioma, e uma delas marcada. Abre a
programação do **8º A**: em **"Quando sai"**, **"Por semana"** com a quarta marcada e o horário
08:00. A **"Prévia"** se monta linha a linha, uma data por atividade: a Frutas 1 já liberada, as
outras às quartas, e a Frutas 3 com o aviso de que ainda é rascunho. No topo do painel, a frase do
produto: a atividade abre no mapa do módulo, e ninguém recebe e-mail.

### Bloco 4 · 14 a 19 s · Trancada, com data (aluno)

Pílula em "Seu aluno". Volta o mapa: a fase 1 concluída (bandeira e estrelas azuis), a fase 2
liberada (o nó aceso, uma vez só), as fases 3 e 4 com cadeado e **"abre qua 25/11"** e
**"abre qua 02/12"**.

### Bloco 5 · 19 a 23 s · Jogar e ficar em dia (aluno)

A Ana toca na fase 2. Sobe a folha da fase com o título, o idioma, o nível, o número de questões
e o botão **"Jogar"**. Corte rápido para uma questão respondida com **"Correto."** e de volta ao
mapa: a fase 2 ganha a bandeira de concluída e aparece o aviso **"Você está em dia."** com
**"A próxima fase abre qua 25/11."** O avatar fica onde está: a fase 3 ainda não abriu.

### Bloco 6 · 23 a 27 s · Na quarta, a fase abre (aluno)

Salto para a quarta seguinte, marcado por uma folha de calendário passando ou pela data no canto.
O cadeado da fase 3 sai, o nó acende uma vez e o avatar anda da fase 2 até a 3, **uma vez**, e
para. É assim no produto: o avatar anda quando há uma fase nova para jogar.

### Bloco 7 · 27 a 30,5 s · Estrela só com permissão (aluno)

A câmera aproxima duas fases concluídas lado a lado: uma com estrelas, outra com o olho riscado e
**"concluída · sem placar"**. A diferença é o interruptor do professor.

### Bloco 8 · 30,5 a 33 s · O castelo (aluno)

Salto no tempo: as quatro fases concluídas, o avatar chega ao castelo e entra
**"Módulo concluído."** A comemoração acontece uma vez.

### Bloco 9 · 33 a 36 s · O professor acompanha (painel)

Pílula em "Você". O bloco **"Liberações"** do módulo: cada atividade, com quantos abriram e quantos
terminaram no 8º A.

### Bloco 10 · 36 a 40 s · Cartão final

Fundo escuro, logo claro, a legenda final e o CTA. Nos últimos 0,5 s o quadro volta ao tom do
bloco 1 para o loop fechar.

---

## 4. Texto na tela

Escrito com o Cérebro do agentic-seo (`../spokke-seo/project/brain/voice.md`, voz "direto e
confiante") e revisado com o checklist de `brain/review.md` e uma passada de humanização (lista no
fim desta seção). Use as frases exatamente; nenhuma outra legenda entra.

| Bloco | Legenda principal                                           | Linha menor                                     |
| ----- | ----------------------------------------------------------- | ----------------------------------------------- |
| 1     | Sua sequência vira um mapa.                                 | Cada atividade é uma fase.                      |
| 2     | Junte as atividades na ordem em que você ensina.            | Arraste para trocar a ordem.                    |
| 3     | Escolha a turma e o ritmo.                                  | A prévia mostra cada data antes de você salvar. |
| 4     | A próxima fase já tem data.                                 | O mapa aparece para quem tem conta na turma.    |
| 5     | Quem fez tudo o que abriu está em dia.                      | A tela diz quando vem a próxima, sem cobrar.    |
| 6     | Na quarta, a fase abre e o avatar segue.                    | O personagem é o avatar que o aluno montou.     |
| 7     | Estrela só onde você liberou o resultado.                   | Sem isso, a fase fica concluída, sem placar.    |
| 8     | A última fase leva ao castelo.                              |                                                 |
| 9     | Do seu lado, quantos abriram e quantos terminaram.          |                                                 |
| 10    | Você monta a sequência uma vez. A turma avança fase a fase. | Teste grátis por 14 dias · spokke.com.br        |

Os textos DENTRO das telas ("MUNDO 1", "Jogar", "Você está em dia.", "abre qua 25/11",
"concluída · sem placar", "Módulo concluído.") são os do produto e estão no roteiro.

**Palavras que o vídeo não usa**, nem na legenda nem em texto solto: gamificação, gamificado,
jornada do aluno, engajamento, experiência de aprendizado, transformar, revolucionar. O jogo é
mostrado pelo mapa, pela fase e pelo castelo, e não precisa ser nomeado.

**"Fase" é palavra do aluno.** Nas cenas do professor a legenda diz "atividade" (é como o
produto fala com ele).

Revisão aplicada às legendas:

- nenhuma promessa fora do produto (conferido em `docs/funcionalidades.md` e no código do mapa);
- nenhum travessão, exclamação, emoji ou superlativo;
- nenhuma pergunta retórica e nenhum "Não é X, é Y";
- no máximo uma enumeração por bloco, sem tríade de efeito;
- o sujeito muda de uma legenda para a outra (a sequência, você, a fase, o avatar); o produto
  nunca é sujeito;
- sem "permite", "possibilita" ou abertura de anúncio ("Descubra", "Imagine", "Chega de");
- frases de tamanhos diferentes, e a linha menor dando o fato concreto que a principal promete.

---

## 5. Como a tela aparece

O mapa é o centro do vídeo, e ele **não é redesenhado**: o caminho, os nós, o avatar e o castelo
saem da captura do produto (`captura-das-telas.md`). A animação refaz por cima só o que se mexe: o
avatar andando de um nó para o outro, a folha subindo e o castelo acendendo.

As capturas saem de `scripts/capturas/video-modulos.ts` (`captura-das-telas.md` diz como rodar),
em `capturas/modulos/`. O mapa é o da Ana de verdade, com a conta dela no 8º A, e anda pelas ações
de verdade da professora.

| Arquivo                                  | Bloco | Estado                                                                                                                                                 |
| ---------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `00-mapa-antes@celular`                  | 1, 4  | fase 1 concluída com três estrelas; 2, 3 e 4 trancadas: "abre qua 18/11", "qua 25/11", "qua 02/12"; "Você está em dia. A próxima fase abre qua 18/11." |
| `01-mapa-fase-2-liberada@celular`        | 4     | fase 2 liberada ("jogar"), 3 e 4 com cadeado e data                                                                                                    |
| `02a-novo-modulo-nome@computador`        | 2     | bandeja "Novo módulo": nome, descrição e a etiqueta teal                                                                                               |
| `02b-novo-modulo-ordem@computador`       | 2     | as quatro Frutas marcadas, com o número da posição (1 a 4)                                                                                             |
| `03-atividades-na-ordem@computador`      | 2     | o bloco "Atividades, na ordem" do módulo aberto                                                                                                        |
| `04-adicionar-turmas@computador`         | 3     | bandeja "Adicionar turmas", nada marcado                                                                                                               |
| `04-adicionar-turmas-marcada@computador` | 3     | a mesma, com o 9º C marcado (o seed já tem o módulo no 7º B e no 8º A)                                                                                 |
| `05a-programacao-ritmo@computador`       | 3     | programação do 8º A: "Por semana", quarta, 08:00                                                                                                       |
| `05b-programacao-previa@computador`      | 3     | a prévia: qua 11/11 liberada, qua 18/11, qua 25/11 (com o aviso de rascunho), qua 02/12                                                                |
| `06-folha-da-fase@celular`               | 5     | a folha da fase 2, com "Jogar"                                                                                                                         |
| `07-questao-correta@celular`             | 5     | "Monte a frase." da Frutas 2, com "Correto."                                                                                                           |
| `08-mapa-em-dia@celular`                 | 5     | fase 2 concluída; "Você está em dia. A próxima fase abre qua 25/11."                                                                                   |
| `09-mapa-fase-3-liberada@celular`        | 6     | fase 3 liberada, o avatar já nela                                                                                                                      |
| `10-estrelas-e-sem-placar@celular`       | 7     | fase 1 com estrelas, fase 2 "sem placar" (o resultado dela desligado)                                                                                  |
| `11-modulo-concluido@celular`            | 8     | as quatro concluídas e o castelo, "Módulo concluído."                                                                                                  |
| `12-liberacoes@computador`               | 9     | o bloco "Liberações": cada atividade, com quantos abriram e quantos terminaram                                                                         |

O avatar andando (bloco 6) é a animação entre as capturas 08 e 09: a posição de partida e a de
chegada saem do produto, e o passo entre elas é refeito por cima. A fase 3 abriu na captura por
"Liberar agora"; no vídeo ela abre na quarta, e o mapa fica igual nos dois casos.

**As datas são as da rodada de 11/11/2026**, a quarta em que a Frutas 1 abriu. Uma rodada noutro
dia traz outras datas, e o roteiro e as legendas acompanham as da captura nova.

---

## 6. Identidade e movimento

As seções 6 e 7 de `animacao-celular.md` valem inteiras. Para o mapa, as regras do próprio produto
(`docs/telas-modulos-aluno.md`):

- **Fase concluída é azul, nunca verde.** As estrelas também. Terminar não é acertar.
- **A fonte pixel (Silkscreen) só nos rótulos "MUNDO 1" e "FASE N".** Título de atividade e todo o
  resto seguem as fontes de sempre.
- **Estado nunca só por cor:** cada nó tem ícone e texto (bandeira, cadeado com a data, play).
- **O avatar anda uma vez e para.** Nada pula em loop, nada quica. O nó liberado acende uma vez.
- **Cenário nas bordas.** Nuvens e morros em pixel art ficam fora do texto das fases, como as formas
  de ambiente.
- **Transição para o mapa:** pode entrar com um efeito de pixels se dissolvendo, só quando o quadro
  passa do painel para o celular. Dentro do painel do professor não há 8 bits.

---

## 7. O que não pode

As regras da seção 8 de `animacao-celular.md` valem aqui. Para este vídeo:

- **Nenhum ranking e nenhum dado de outro aluno.** Nada de "fulano está na fase 6", pódio, placar
  da turma ou foto de colegas. Boa parte do público é menor de idade.
- **Nenhum e-mail ou notificação chegando no celular.** O módulo libera a fase no mapa; ele não
  manda e-mail nem aviso.
- **O mapa não é para todo aluno.** Ele aparece para quem tem conta ligada à turma; quem responde
  pelo link continua respondendo pelo link. O vídeo mostra a Ana com conta (o avatar é o sinal) e
  não sugere que o link aberto tem mapa.
- **O caminho não tranca o link.** A ordem é sugestão. Não desenhe a fase seguinte trancando porque
  a anterior não foi feita: o que tranca é só a data da programação.
- **Estrela nunca aparece numa fase "sem placar".**
- **Nenhum pedido de cartão, nenhum "sem cartão"**, nenhum número inventado como prova.

---

## 8. Entrega

1. `spokke-modulos-9x16.mp4`.
2. O HTML da animação, com os controles da seção 1 de `animacao-celular.md`.
3. Uma página com um quadro estático de cada bloco.
4. Se sobrar fôlego, um corte de 15 s com os blocos 1, 3, 6 e 10 (`spokke-modulos-9x16-15s.mp4`).
