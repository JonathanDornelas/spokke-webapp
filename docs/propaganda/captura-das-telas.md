# Spokke · como a tela de verdade entra no vídeo

Método comum aos vídeos desta pasta (`video-formas-de-montar.md`, `video-modulos-em-fases.md`,
`video-multiplataforma.md`). Cada brief tem a sua lista de capturas; este arquivo diz como elas são
feitas e como refazê-las.

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

| Camada        | O que é                                                                                | Quem faz                |
| ------------- | -------------------------------------------------------------------------------------- | ----------------------- |
| **Captura**   | A tela inteira em PNG, em alta resolução, tirada por script do produto rodando         | Playwright              |
| **Recorte**   | Só o componente (o formulário de material, a folha da fase, a lista de propostas)      | Playwright, por seletor |
| **Movimento** | Legenda, moldura de aparelho, formas de ambiente, câmera, círculo de toque, transições | O HTML da animação      |

O recorte resolve o conceito "o professor é painel": os cartões que flutuam sobre o fundo são o
componente de verdade, não uma imitação dele.

## Estado por estado

Uma interação vira uma **sequência de estados capturados**, cada um num PNG:

```
02-lista-vazia → 02-lista-colada → 02-lista-previa → 02-lista-adicionada
```

A animação passa de um estado para o outro com a câmera e o círculo de toque, nos tempos de
movimento do produto (`animacao-celular.md` seção 7). O que se mexe DENTRO da tela (uma letra
sendo digitada, a barra de áudio enchendo, o avatar andando) é refeito em HTML por cima do estado
capturado, com os mesmos tokens, e conferido lado a lado com a captura antes e depois.

A gravação de vídeo do Playwright (`recordVideo`) serve como referência de ritmo, não como imagem
final: ela grava no tamanho da janela em pixels de CSS, e um celular de 390 px esticado para o
palco de 1080 fica borrado. Os pixels finais saem dos PNGs.

## Como gerar

As capturas saem de roteiros do Playwright em `scripts/capturas/`, um por vídeo. Cada roteiro entra
nas contas de demonstração e faz, pela interface, o que a professora e a aluna fariam: monta a
atividade no wizard, cola a lista, publica, responde pelo link. Refazer as capturas depois de um
ajuste de tela é rodar o roteiro de novo.

| Arquivo                             | O que faz                                                                                                                                                                                                                                                                             |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cenario.ts`                        | Cria a professora (Marina Couto, plano Super) e a aluna (Ana Ribeiro), roda o seed de demonstração e liga a conta da Ana a uma ficha do 8º A. Rodar de novo recria o semestre.                                                                                                        |
| `arquivos.ts`                       | Gera o que a professora escolhe no "Gerar com IA": a foto de uma página de livro (3024 × 4032) e a gravação de 4:11 de uma aula online com fala em inglês. Os dois são nossos, escritos aqui; a fala sai do nosso serviço de voz. Grava em tempo real (uns 4 min e meio), uma vez só. |
| `video-modulos.ts`                  | O módulo Frutas no 8º A: a bandeja, a ordem, as turmas, a programação e o mapa da Ana do começo ao castelo. Pede o cenário recém-criado, porque publica e libera fases.                                                                                                               |
| `video-multiplataforma.ts`          | Cria pelo wizard a Present perfect (código KTRM) e uma atividade em árabe, e captura a escuta em três aparelhos, os teclados, os resultados e a área da aluna. Aceita blocos pelo nome: `qr`, `escuta`, `teclados`, `resultados`, `aluno`.                                            |
| `video-formas-de-montar.ts`         | Uma atividade nova recebe material pelas sete portas da etapa 2 e termina na Revisar. Apaga a da rodada anterior antes.                                                                                                                                                               |
| `gemini-falso.mjs`                  | Um servidor local que responde no lugar do Gemini, com propostas fixas. Nenhuma chave de IA é usada.                                                                                                                                                                                  |
| `comum.ts`, `wizard.ts`, `dados.ts` | O que os roteiros compartilham: os aparelhos, as contas, a foto, as respostas da aluna e os passos do wizard.                                                                                                                                                                         |

**Passo a passo**, na raiz do projeto:

1. Postgres, MinIO e o serviço de áudio no ar (`docker/postgres.yml`, `docker/minio.yml` e
   `../audiotext-service`). O serviço de áudio faz a voz, a transcrição e a tradução automática.
2. Três processos, cada um no seu terminal:

   ```bash
   node scripts/capturas/gemini-falso.mjs
   EMAIL_PROVIDER= npx tsx worker/index.ts
   EMAIL_PROVIDER= LLM_PROVIDER=gemini GEMINI_API_KEY=chave-falsa GEMINI_MODEL=gemini-3.8-flash \
     GOOGLE_GEMINI_BASE_URL=http://localhost:8787 __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=spokke.com.br \
     npx vite dev --port 5173 --strictPort
   ```

   `EMAIL_PROVIDER` vai vazio porque o `.env` tem o SMTP de verdade: sem isso, o seed e os convites
   mandariam e-mail. O servidor fica na 5173, porque outra porta quebra o login.

3. Os roteiros, nesta ordem:

   ```bash
   npx tsx scripts/capturas/cenario.ts
   npx tsx scripts/capturas/video-modulos.ts
   npx tsx scripts/capturas/video-multiplataforma.ts
   npx tsx scripts/capturas/arquivos.ts          # só na primeira vez
   npx tsx scripts/capturas/video-formas-de-montar.ts
   ```

**As datas da tela saem do dia em que o cenário rodou** ("abre qua 25/11"). Rode o cenário e
capture no mesmo dia, e confira as datas nos briefs: eles citam as da rodada de 11/11/2026.

## O que é de verdade

Tudo o que aparece na tela é o produto rodando: a correção, a tradução automática, o áudio, a
transcrição, o débito de créditos. As exceções servem à foto, e nenhuma aparece nela:

- **A IA é o Gemini falso.** As propostas são fixas (`gemini-falso.mjs`); o resto do caminho é o de
  produção: o débito pela mesma conta de créditos, o "você já tem", o estorno.
- **Os estados de espera são segurados.** "Verificando…", "Traduzindo…" e "Gerando…" duram uma ida e
  volta ao servidor, e o roteiro atrasa a resposta em 2,5 a 3 s (`segurarRemotas`). "Preparando a
  foto…" e "Lendo o áudio do vídeo…" acontecem no navegador; naquele instante a aba roda com a CPU
  oito vezes mais lenta (`cpuLenta`).
- **A escuta tem a mesma ordem nos três aparelhos.** Cada aparelho abre uma tentativa, e a ordem das
  alternativas sai da seed dela. O roteiro dá às três a mesma seed, para o quadro lado a lado mostrar
  a mesma questão.
- **O link e o QR saem com `spokke.com.br`.** A tela os monta com o endereço do pedido. O navegador
  das capturas abre o app por `spokke.com.br` apontado para a própria máquina (a regra
  `--host-resolver-rules` do Chromium), e o roteiro confere que o endereço responde pelo servidor
  local antes de entrar. O QR fotografado leva a uma atividade que só existe na máquina; no vídeo
  entra o `02-qr-do-exemplo.png`, que leva à atividade de exemplo do site.
- **As respostas da Ana têm tempo de gente**, de 20 a 45 s por questão. O roteiro responde em menos
  de um segundo, e a área do aluno mostra o tempo médio.
- **A Ana está no 8º A.** O seed a põe no 7º B; o cenário liga a conta dela a uma ficha do 8º A, a
  turma do vídeo dos módulos.

## Parâmetros fixos

Para duas capturas da mesma tela saírem idênticas (`comum.ts`):

| Parâmetro         | Valor                                                                                                                                                       |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Celular           | 390 × 844, `deviceScaleFactor: 3` (imagem de 1170 × 2532)                                                                                                   |
| Tablet            | 820 × 1180, `deviceScaleFactor: 2`                                                                                                                          |
| Computador        | 1440 × 900, `deviceScaleFactor: 2`                                                                                                                          |
| Tema              | Claro. O tema do sistema não conta: o escuro só aparece com `localStorage['spokke-theme'] = 'dark'`, posto antes de abrir a página, e só onde o brief pedir |
| Idioma e fuso     | `locale: 'pt-BR'`, `timezoneId: 'America/Sao_Paulo'`                                                                                                        |
| Antes de cada PNG | o ponteiro sai de cima da tela; `document.fonts.ready`; `animations: 'disabled'` e `caret: 'hide'`                                                          |
| Toque             | `hasTouch: true` e `isMobile: true` no celular e no tablet. O leiaute vem da largura; isto só faz o navegador agir como aparelho de toque                   |

O leiaute de computador do Player (duas colunas e a legenda de atalhos) só aparece a partir de
1024 px de largura, que é o `lg:` do produto. Abaixo disso, a tela é a do celular.

## Onde os arquivos ficam

```
docs/propaganda/capturas/<video>/<nn>-<tela>-<estado>@<aparelho>.png
docs/propaganda/capturas/modulos/01-mapa-fase-2-liberada@celular.png
docs/propaganda/capturas/_entrada/        a foto e o vídeo que a professora escolhe
```

O nome diz o recorte. Sem sufixo, é a tela do aparelho; `-formulario`, `-painel`, `-lista`,
`-coluna` e `-previa` são o componente; `-formulario-inteiro` é o formulário sem a rolagem de dentro
(a coluna dele rola, e a janela cresce para ele caber); `-pagina-inteira` é a página toda, para a
animação rolar dentro da moldura.

As capturas **não vão para o git** (`.gitignore`): pesam, e mudam a cada ajuste de tela. Elas sobem
para o projeto do Claude Design junto com o brief.

## Cuidados

- **Nenhum dado real.** Só a conta de demonstração e os alunos fictícios do seed (e-mails em
  `exemplo.invalid`). Nada de print da conta do dono nem de aluno de verdade.
- **Os dados ficam como estão.** Títulos e nomes de turma do seed ("Frutas 1 — vocabulário",
  "8º A — inglês") são conteúdo do professor e aparecem como estão. As legendas do vídeo seguem a
  voz do Spokke, sem travessão.
- **"Itens" virou "questões" no produto antes das capturas:** "Gerar questões" (etapa de materiais),
  "N questões propostas" e "Criar questão do zero" (Revisar), "Questão N" (resultados da atividade).
