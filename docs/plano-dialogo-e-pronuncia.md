# Diálogo e Pronúncia

Feito em 2026-11-15, a partir das quatro decisões abaixo, e no mesmo dia a Pronúncia ficou rigorosa
de verdade, com níveis (a quinta decisão). O que falta está no fim.

## As decisões

1. **A vez do aluno** é sorteada, de qualquer pessoa, nunca a primeira fala. Um mesmo diálogo rende
   mais de um tipo de questão (escolher, montar, dizer), como nos diálogos do Duolingo.
2. **O texto do diálogo** é uma opção por questão: "Texto e áudio", "Só áudio" ou "Só texto". Na
   geração ela sai do nível da atividade: até B1, e sem nível, os dois; do B2 em diante, só o áudio;
   sem voz no idioma, só o texto. O professor troca na revisão e na questão do zero.
3. **A rigidez da Pronúncia**: correto com todos os sons certos; quase com UMA sílaba diferente, em
   palavra de duas sílabas ou mais; senão incorreto, sempre dizendo qual sílaba.
4. **A arte**: sem PixelLab por enquanto. Os quinze visemas são placeholders desenhados por dado, em
   SVG, no estilo da referência escolhida (as ilustrações de pronúncia do Google, usadas só como
   referência): ilustração plana, fundo azul-claro, contorno na cor da marca, a boca escura com os
   dentes brancos. Nenhum arquivo do Google entra no repositório, e o traçado é nosso. A skill de
   geração de imagem só escreve prompts, então não serviu para os quadros.
5. **Mais rigor, com níveis** ("deixar mais rigoroso a pronúncia, talvez com níveis de
   dificuldade"): a correção passou a ouvir os SONS, com um reconhecedor de fonemas no serviço de
   áudio, e tem três rigores (leve, normal, rigoroso). O padrão sai do nível da atividade, como o
   texto do diálogo, e o professor troca no editor. O custo no servidor (~0,5 GB de memória, o teto
   do container de áudio de 7 para 7,5 GB) foi aprovado antes.

## O que está feito

### Diálogo

- **O áudio**: um arquivo por fala, na voz de quem fala (`vozDoFalante`), nas duas velocidades.
  `audiosDoItem` junta tudo o que uma questão toca, e a fila, a etapa 4, a limpeza e o envio contam
  as falas.
- **O contexto no prompt** (`Prompt.contexto`): o trecho de um texto ou o diálogo inteiro, com a
  parada (`ate`) e como o aluno recebe (`mostra`). O runtime nunca manda o texto da fala da vez nem
  as falas depois dela. A compreensão de texto passou a levar o trecho, que antes nunca chegava ao
  aluno.
- **As perguntas** do professor no diálogo, opcionais, e o gerador `dialogue-comprehension`.
- **A próxima fala** (`dialogue-next-line`): até três paradas, um tipo por parada, e as alternativas
  erradas da escolha saem só do que o aluno ainda não viu.
- **O Player**: balões, um lado por pessoa, "Ouvir o diálogo" inteiro ou fala a fala, "Devagar" e o
  balão "Sua vez". A pergunta abre a coluna da resposta.
- **O editor**: o painel "O diálogo" dentro dos formatos que já existiam (escolher, montar, falar),
  no lugar dos dois formatos novos que o plano previa. Ele tem "O aluno recebe", "A questão pede", a
  vez do aluno e, na questão nova, "Usar um diálogo desta atividade". Escuta e leitura viraram o
  mesmo formato com o diálogo ouvido ou lido.
- **O cartão resumido** "conversa", na prévia do material.
- Junto: a habilidade que nomeia a questão virou uma regra só (`habilidadePrincipal`), e o material
  com a escuta desligada gera o diálogo lido.

### Pronúncia

- **A fonética escrita** sai do servidor, e não do serviço de áudio: o CMU Pronouncing Dictionary
  (ARPAbet, licença ISC), carregado sob demanda. A silabação (ataque máximo), a leitura ("prai · AW ·
  ruh · tee") e os visemas são DADO do `LanguageProfile.pronuncia`. Só o `en-US` tem: o dicionário é
  americano, e o `en-GB` fica sem.
- **O gerador** `vocab-pronuncia`: termo de uma palavra, com ASR, que esteja no dicionário.
- **A boca** (`BocaDaPronuncia`, `formas.ts`): os quinze visemas de frente, desenhados por dado. Ela
  anda pelo PESO de cada som na fração do tempo do áudio, e não pela duração exata de cada fonema.
- **A correção por sílaba**, com a regra de rigidez acima e a sílaba grifada no veredito. Primeiro
  pelos fonemas do que o Whisper transcreveu; hoje pelos sons do reconhecedor (abaixo), com o Whisper
  de reserva.
- **No editor** a questão continua de Pronúncia ao salvar, trocar a palavra lê a nova no dicionário,
  e o rigor se escolhe ali.

### A rigidez de verdade: o reconhecedor de fonemas

O Whisper é modelo de língua: devolve a palavra mais provável, e "priority" dito torto voltava
"priority" e saía "Correto". Agora a Pronúncia ouve os SONS.

- **O motor**: `facebook/wav2vec2-xlsr-53-espeak-cv-ft` (Apache 2.0), o quarto motor do serviço de
  áudio (`app/fonemas.py`, `POST /v1/asr/phonemes`). Multilíngue de propósito: o brasileiro produz
  sons do português no meio do inglês, e um modelo que só ouviu inglês os puxaria para o inglês. Ele
  devolve um símbolo IPA por som, com a certeza e as alternativas que considerou.
- **O que custa, medido em 2 núcleos**: 0,16 a 0,26 s por palavra (o Whisper gasta ~1,4 s) e +0,5 GB
  residentes. O container de áudio subiu de 7 para 7,5 GB, e a conta da máquina de produção fecha em
  12,25 de 16. Duas armadilhas de memória ficaram no código e no README do serviço.
- **A correção** (`compararSons`, kernel.md "Correção"): alinha os sons esperados (o dicionário
  traduzido para o IPA do reconhecedor, `LanguageProfile.pronuncia.sons`) com os ouvidos, com custos
  de fonética (`language/fones.ts`), e cada rigor tem a sua tolerância (`TOLERANCIA`). A dúvida do
  reconhecedor entre dois sons vale a favor do aluno; o som a mais que não é som (a semivogal de
  passagem, o estalo da consoante final) não conta.
- **O "Ouvimos" mostra os sons** na escrita das sílabas ("prai · aw · huh · tee"), antes do
  "Verificar" e no veredito. O Whisper nem roda na Pronúncia.

**A bancada.** As vozes nativas do Kokoro (uma feminina e uma masculina) disseram treze palavras
certas e com os erros típicos de brasileiro, sintetizados a partir dos fonemas. O resultado, por
rigor (✓ passa, ✗ marca a sílaba):

| Caso                                   | Leve | Normal | Rigoroso |
| -------------------------------------- | ---- | ------ | -------- |
| as 26 pronúncias certas                | 26 ✓ | 24 ✓   | 20 ✓     |
| "r" de "rato" ("priority", "red")      | ✗    | ✗      | ✗        |
| "tink", "tought", "bery"               | ✗    | ✗      | ✗        |
| "fink" (f no th)                       | ✓    | ✗      | ✗        |
| "sheep" por "ship", "leave" por "live" | ✓    | ✗      | ✗        |
| "ket" por "cat"                        | ✓    | ✗      | ✗        |
| a vogal a mais ("dogi", "thinki")      | ✓    | ✗      | ✗        |
| "redji"                                | ✗    | ✗      | ✗        |
| "comfortable" soletrado                | ✗    | ✗      | ✗        |

As duas certas que erram no normal são da voz sintetizada: o [ɪ] de "ship" que o modelo ouviu
como [ɛ] numa voz, e o t final de "thought" que saiu [n] na outra. No rigoroso erram também o
vozeamento que o modelo confunde ([ʃ] ouvido [ʒ], [θ] ouvido [ð]) e a sílaba final de
"comfortable", que ele pede inteira. O "ket" por "cat" erra no leve numa das vozes, em que o t final
sumiu. Dois erros não aparecem em rigor nenhum, porque o modelo não os ouve na voz sintetizada: o
"i" longo de "think" e o "pree" de "priority" (ali ele hesita entre [iː] e [aɪ], e a dúvida vale
para o aluno). Os casos estão em `pronuncia.test.ts`.

## O que falta

1. **Calibrar com gravações de alunos de verdade.** A bancada é voz sintetizada, nativa, sem ruído
   de sala: ela prova o encanamento e dá a primeira régua, não a final. Com gravações reais de
   brasileiros (com autorização), o ajuste é na `TOLERANCIA` e nos `equivalentes` do perfil, e cada
   gravação vira um caso de `pronuncia.test.ts` (o `/v1/asr/phonemes` devolve os sons já no formato).
2. **O acento tônico.** O reconhecedor ouve os sons, não a força da sílaba: "PRAI-o-ri-ty" passa se
   os sons estiverem certos. Conferir a tônica pede medir duração e altura da vogal.
3. **A arte final** dos visemas e o **corte lateral** com a língua, o céu da boca e os dentes. Trocar a
   arte é trocar `formas.ts`, ou trocar o desenho por quadros prontos mantendo a tabela de visemas.
4. **A boca no tempo exato do som**: a duração de cada fonema, que o Kokoro calcula ao sintetizar,
   exposta pelo serviço de áudio junto do arquivo.
5. **Pronúncia em outros idiomas**: um dicionário (ou o `espeak-ng`) e as regras no profile (os
   `sons` e os `equivalentes` também), sem nenhum `if` de idioma. O reconhecedor já é multilíngue.
6. **O "Ouvir o diálogo" com o áudio sintetizado**: o serviço de áudio está no ar agora e a correção
   da fala foi conferida de ponta a ponta (endpoint e tela, com microfone simulado), mas a síntese das
   falas do diálogo não foi ouvida nesta rodada.
