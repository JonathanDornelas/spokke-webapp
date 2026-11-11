# Spokke · como a tela de verdade entra no vídeo

Método comum aos vídeos desta pasta (`video-formas-de-montar.md`, `video-modulos-em-fases.md`,
`video-multiplataforma.md`). Cada brief tem a sua lista de capturas; este arquivo diz como
fazê-las.

## O problema

Os dois primeiros briefs (`animacao-celular.md`, `telas-e-funcionalidades.md`) descrevem as telas
em texto, e o Claude Design as redesenha. O desenho se afasta do produto nos detalhes que o
professor reconhece: o link com nome bonito que não existe, o rótulo trocado, o espaçamento de
outro sistema. Quem já usa o Spokke percebe na hora, e quem ainda não usa vai encontrar outra tela
quando entrar.

## A regra

**O vídeo parte da tela real, capturada do produto rodando, e nunca de um redesenho.** Se o
desenho e a captura discordarem, a captura vence.

O vídeo tem três camadas, e só a última é desenhada:

| Camada        | O que é                                                                                     | Quem faz                    |
| ------------- | ------------------------------------------------------------------------------------------- | --------------------------- |
| **Captura**   | A tela inteira em PNG, em alta resolução, tirada por script do produto rodando               | Playwright                  |
| **Recorte**   | Só o componente (o cartão de material, a folha da fase, o veredito), com fundo transparente | Playwright, por seletor     |
| **Movimento** | Legenda, moldura de aparelho, formas de ambiente, câmera, círculo de toque, transições      | O HTML da animação          |

O recorte resolve o conceito "o professor é painel": os cartões que flutuam sobre o fundo são o
componente de verdade, não uma imitação dele.

## Estado por estado

Uma interação vira uma **sequência de estados capturados**, cada um num PNG:

```
02-colar-vazio.png → 02-colar-colado.png → 02-colar-previa.png → 02-colar-adicionado.png
```

A animação passa de um estado para o outro com a câmera e o círculo de toque, nos tempos de
movimento do produto (`animacao-celular.md` seção 7). O que se mexe DENTRO da tela (uma letra
sendo digitada, a barra de áudio enchendo, o avatar andando) é refeito em HTML por cima do estado
capturado, com os mesmos tokens, e conferido lado a lado com a captura antes e depois.

A gravação de vídeo do Playwright (`recordVideo`) serve como referência de ritmo, não como imagem
final: ela grava no tamanho da janela em pixels de CSS, e um celular de 390 px esticado para o
palco de 1080 fica borrado. Os pixels finais saem dos PNGs.

## Preparar o cenário

1. **Uma conta de demonstração, nunca a conta do dono.** O nome e o avatar do professor aparecem
   no cabeçalho. Crie em `/cadastro` com um nome fictício (sugestão: Marina Couto) e um e-mail em
   `exemplo.invalid`.
2. **O seed:** `pnpm db:seed:demo <email-da-conta>` (`docs/operacao.md` "Dados de demonstração").
   Ele cria as atividades, as turmas, os alunos fictícios e os quatro módulos, com as datas
   contadas a partir de hoje. Rode o seed e capture no mesmo dia: as datas da tela saem do
   servidor.
3. **Os serviços que cada tela pede:**

   | Tela                                     | Precisa de                                                                |
   | ---------------------------------------- | ------------------------------------------------------------------------- |
   | Tradução automática                      | `TRANSLATE_PROVIDER=audiotext` e o `audiotext-service` no ar              |
   | Questão de escuta, áudio "3 de 4 prontos" | `TTS_PROVIDER=audiotext`                                                 |
   | Questão de fala                          | `ASR_PROVIDER=audiotext`                                                  |
   | Gerar com IA                             | `LLM_PROVIDER` com chave e a conta no plano Pro ou Super (ativar em `/admin`) |
   | Mapa do aluno com progresso              | Uma conta de aluno ligada à turma (abaixo)                               |

   O seed sozinho não gera escuta nem fala: sem o serviço de áudio, essas questões não existem.

4. **A conta de aluno para o mapa.** As contas de aluno do seed não têm senha e não servem para
   entrar. Para o mapa com progresso: na tela da turma **8º A**, mande o convite de conta para um
   aluno; sem `EMAIL_PROVIDER`, o link sai no log do worker. Abra o link num contexto separado do
   navegador, crie a conta com um nome fictício e responda as fases. Para pôr uma fase no estado
   que a cena pede, use **"Liberar agora"** na programação do módulo.

   Sem conta de aluno, o mapa ainda pode ser capturado pela prévia do professor
   (`/modulos/[id]/mapa?turma=`): mesma tela, com a programação da turma e nenhum progresso.

5. **O servidor de sempre, na 5173.** Outra porta quebra o login: a origem não bate com a que o
   Better Auth espera.

## Parâmetros fixos

Para duas capturas da mesma tela saírem idênticas:

| Parâmetro            | Valor                                                                       |
| -------------------- | --------------------------------------------------------------------------- |
| Celular              | 390 × 844, `deviceScaleFactor: 3` (imagem de 1170 × 2532)                   |
| Tablet               | 820 × 1180, `deviceScaleFactor: 2`                                          |
| Computador           | 1440 × 900, `deviceScaleFactor: 2`                                          |
| Tema                 | Claro. O tema do sistema não conta: o escuro só aparece com `localStorage['spokke-theme'] = 'dark'`, posto por `addInitScript` antes de abrir a página, e só onde o brief pedir |
| Idioma e fuso        | `locale: 'pt-BR'`, `timezoneId: 'America/Sao_Paulo'`                        |
| Antes de cada PNG    | esperar `document.fonts.ready`; `animations: 'disabled'` e `caret: 'hide'` |
| Toque                | `hasTouch: true` e `isMobile: true` no celular e no tablet. O leiaute vem da largura; isto só faz o navegador agir como aparelho de toque |

O leiaute de computador do Player (duas colunas e a legenda de atalhos) só aparece a partir de
1024 px de largura, que é o `lg:` do produto. Abaixo disso, a tela é a do celular.

## Onde os arquivos ficam

```
docs/propaganda/capturas/<video>/<nn>-<tela>-<estado>@<aparelho>.png
docs/propaganda/capturas/modulos/04-mapa-fase2-liberada@celular.png
```

As capturas **não vão para o git**: pesam, e mudam a cada ajuste de tela. Elas sobem para o projeto
do Claude Design junto com o brief. Quando o script existir, `docs/propaganda/capturas/` entra no
`.gitignore`.

## O script, quando for escrito

`scripts/capturar-telas.ts`, com o Playwright que o projeto já usa nos testes. Ele lê uma lista de
capturas (id, rota, aparelho, os passos até o estado, o seletor do recorte quando houver) e gera
os PNGs. As tabelas "Capturas" de cada brief são essa lista. Refazer todas as capturas depois de
um ajuste de tela vira um comando, e o vídeo acompanha o produto.

## Cuidados

- **Nenhum dado real.** Só a conta de demonstração e os alunos fictícios do seed (e-mails em
  `exemplo.invalid`). Nada de print da conta do dono nem de aluno de verdade.
- **Os dados ficam como estão.** Títulos e nomes de turma do seed ("Frutas 1 — vocabulário",
  "8º A — inglês") são conteúdo do professor e aparecem como estão. As legendas do vídeo seguem a
  voz do Spokke, sem travessão.
- **Rótulos com termo interno.** Dois botões ainda dizem "itens": "Gerar itens" (etapa de
  materiais) e "N itens propostos" (etapa Revisar). A propaganda diz "questões". Mude no produto
  antes de capturar. Se não der, a animação cobre o rótulo com o texto certo.
