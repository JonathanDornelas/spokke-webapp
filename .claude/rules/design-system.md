---
paths:
  - 'src/**/*.svelte'
  - 'src/lib/components/**'
  - 'src/app.css'
  - 'src/app.html'
---

# UI

Tailwind 4 puro — **sem framework de componentes**. Componente de UI não contém regra de
negócio: chama o kernel ou uma remote function, e só.

## Tema

Use os tokens semânticos definidos em `app.css` (`primary`, `base-100`, `error`, ...) e nunca
cor literal do Tailwind (`bg-blue-500`) em componente de produto. Se falta um token, adicione ao
tema — nunca hardcode um hex no componente.

O tema é um bloco `@theme` comum do Tailwind 4: cada `--color-*` gera sozinho as utilities
(`bg-primary`, `text-primary`, `border-primary`, `bg-primary/30`, ...) — não existe plugin nem
build step próprio. Dark mode é a mesma variável com outro valor: uma vez sob
`@media (prefers-color-scheme: dark)` (guardado por `:not([data-theme="light"])`) e de novo sob
`:root[data-theme="dark"]`, para o toggle manual vencer dos dois lados. Nunca dê a uma cor sua
única definição dentro de um desses blocos — a versão clara mora solta no `@theme`.

**Claro é o padrão, e a escolha do professor manda.** A preferência do sistema não decide
sozinha: quem nunca tocou no botão vê o tema claro. O botão é o `ThemeToggle.svelte`, e ele
está na home **e no Studio**, sempre no cabeçalho do topo (desktop e celular) — o professor
passa o dia no painel, que é justamente onde a escolha importa mais. Na barra lateral ele não
fica: ali o lugar é da navegação. Um script inline no `<head>` de `app.html`
lê `localStorage` e escreve `data-theme` **antes da primeira pintura** — sem ele a página nasce
clara e pisca para escura no primeiro frame. A troca em runtime é de
`$lib/client/theme.svelte.ts`, e **nenhuma tela guarda tema por conta própria**: era isso que
fazia o tema trocar a cada navegação, porque só a home aplicava o valor salvo.

Referência visual navegável: `docs/design-system.html` (abrir no browser; tem tokens,
componentes, os estados de correção, as seis interações do Player e as telas do Studio).
Catálogo vivo, testável em cada estado, com toggle de tema: `/dev/components` (só em `pnpm dev`,
ver `src/routes/dev/components/`).

**Azul (#3659CB) é a marca. Verde, âmbar e vermelho são reservados para a semântica de correção** —
nunca aparecem como decoração, gradiente ou destaque de marca.

| Papel              | Token              | Claro                       | Escuro                      |
| ------------------ | ------------------ | --------------------------- | --------------------------- |
| Marca, ação, foco  | `primary`          | #3659CB                     | #608AFF                     |
| Áudio, mídia, ASR  | `accent`           | #0EA5B7                     | #35C4D4                     |
| Correto            | `success`          | #12855F                     | #3ECF98                     |
| Parcial            | `warning`          | #B26A00                     | #F2B23A                     |
| Incorreto          | `error`            | #C8324A                     | #FF7183                     |
| Texto              | `base-content`     | #111A31                     | #E7ECF8                     |
| Superfícies        | `base-100/200/300` | #FFFFFF / #F2F5FC / #DEE6F9 | #0F1420 / #161C2D / #1E2842 |
| Borda de cartão    | `line`             | #D9E1F4                     | #26324F                     |
| Superfície de card | `card`             | #FFFFFF                     | #13192A                     |
| Véu de modal       | `overlay`          | preto a 55%                 | preto a 55%                 |
| Só etiqueta        | `violeta`          | #5A3FF3                     | #8B7BFF                     |

`line` é a borda de cartão, campo e divisor — **não** `base-300`, que é preenchimento (trilha de
progresso, chip). `card` é a superfície de um cartão — no claro é igual a `base-100`, no escuro
fica um degrau acima do fundo da página (`card` #13192A vs `base-100` #0F1420). Confundir os dois
pares é o erro mais comum ao portar um componente.

`violeta` foi a marca até a troca para #3659CB (novembro de 2026) e ficou só como uma das cinco
cores de etiqueta de turma e módulo (`$lib/etiquetas.ts`). Nunca use em botão, foco ou destaque:
ali é `primary`.

Raios: `--radius-field: 0.625rem`, `--radius-box: 0.875rem`, seletores em pill
(`--radius-selector`). Como são tokens `@theme`, viram `rounded-field`/`rounded-box`/
`rounded-selector` de graça.

## Primitivos — nossos, não de um framework

Não há DaisyUI nem outro kit de componentes. `.btn`, `.btn-primary`, `.btn-outline`,
`.btn-ghost`, `.btn-neutral`, `.btn-plain` (o neutro um degrau mais claro, para sentar sobre um
cartão em `base-200`), `.btn-accent`, `.btn-error` (a única ação vermelha sólida: consertar o
e-mail que voltou, gerar o áudio de novo, confirmar um apagar), `.btn-outline-error` (a
destrutiva ainda não confirmada), `.btn-sm`/`.btn-lg`/`.btn-circle`, `.btn-disabled`
(para um link que precisa parecer desabilitado — `<a>` não aceita o atributo `disabled`),
`.input`, `.input-error`, `.select`, `.textarea`, `.toggle`/`.toggle-primary`/`.toggle-xs`,
`.checkbox`/`.checkbox-primary`, `.radio` (redondo, com ponto — escolha única precisa parecer
diferente da múltipla), `.fieldset`, `.fieldset-legend` e `.fieldset-label` são
`@utility` próprias, definidas em
`app.css` logo depois do tema. A API de classes existe para manter os componentes legíveis
(`class="btn btn-primary"` em vez de uma pilha de utilities soltas), mas o CSS por trás é nosso
e lê exatamente os tokens da tabela acima.

**Ao mudar um desses primitivos, edite o `@utility` em `app.css` — nunca sobrescreva com uma
classe Tailwind solta no componente.** Se falta uma variante, adicione o `@utility`; não invente
uma combinação ad hoc de bordas/sombras num único componente. Snippets canônicos:
`.claude/rules/components.md`.

`:disabled` do `.btn` é mais específico que qualquer `.btn-variant` (duas classes contra uma) e
sempre vira o mesmo cinza neutro — nunca a cor da variante apagada em opacidade. `:focus-visible`
usa borda `primary` de 2px mais halo `outline` de 3px em `base-300`; não confundir com o
`box-shadow` de foco do `.input` (esse é um anel suave em `primary` 22%).

O celular do Player (frame de preview) usa borda grossa (`border-[9px] border-base-content`,
`rounded-[40px]`) para simular um bezel real — troca de cor sozinha com o tema, sem token
próprio. Ver as seis composições em `/dev/components#player`.

## Tipografia — três papéis, sem exceção

- `font-display` **Bricolage Grotesque** — títulos e números grandes. Nunca abaixo de 20px.
- `font-sans` **Plus Jakarta Sans** — interface, rótulos, corpo.
- `font-content` **Noto Sans** — **sempre** o conteúdo do idioma alvo. Cobre árabe, hebraico,
  CJK e tailandês sem cair no fallback do sistema. Aplicada no container que recebe `dir`
  (`[data-content-lang]` no `app.css`).
- `font-mono` **JetBrains Mono** — slugs, IPA, código.

**A exceção, e a única: `font-pixel` (Silkscreen), decorativa.** Existe só nas duas telas de tema
de jogo em 8 bits: o mapa do módulo do aluno (`MapaDoModulo.svelte`, nos rótulos "MUNDO 1" e
"FASE 3") e o editor de avatar (`AvatarEditor.svelte`, no contador "03/16" do seletor) — sempre
`aria-hidden` e ao lado do texto de verdade em Plus Jakarta Sans (no editor, um `sr-only` diz
"3 de 16"). Nunca corpo de texto, nunca título, nunca conteúdo do idioma alvo (esse é sempre Noto
Sans). O mesmo tema traz pixel art como DADO (`$lib/modulos/pixel.ts`, grade de letras virando
`path` com `crispEdges` e cor por token — os ícones do editor de avatar são o mesmo molde, em
`$lib/avatar/icones.ts`, e são a única exceção ao traço de 2px de "Ícones"), e os movimentos dele
usam `steps()` em vez de curva — rodando uma vez só, como manda "Movimento".

Escala: display 56 / title 32 / content 22 (mínimo 20 no Player) / body 16 / label 12 caixa alta.

**Os tamanhos grandes são FLUIDOS, não um par de px por breakpoint.** `text-display`,
`text-title`, `text-section` e `text-lede` são tokens `@theme` em `clamp()`: o meio da fórmula
cresce com a largura da viewport e os extremos garantem legibilidade num celular estreito e
tamanho sensato num monitor. `text-[28px] lg:text-[34px]` tinha só DOIS tamanhos e ficava errado
em toda largura entre eles. O mesmo vale para o respiro de borda: `px-gutter` e `px-gutter-sm`
no lugar de `px-6 lg:px-16`.

## Scroll

**Um desenho para a aplicação inteira**, em `app.css` (`@layer base`): barra fina (10px, com o
polegar de 4px no meio), trilho transparente, polegar na cor do texto a 22% — 38% sob o mouse.
Sai de `--color-base-content`, então acompanha o tema sozinho. Antes não havia estilo nenhum:
cada browser desenhava o dele, e no Windows era a barra cinza de 17px do sistema cortando o
cartão do Player e as tabelas do Studio.

- **Cada motor lê UMA sintaxe.** Chrome, Edge e Safari: `::-webkit-scrollbar`. Firefox:
  `scrollbar-width`/`scrollbar-color`, atrás de `@supports not selector(::-webkit-scrollbar)`.
  Sem o `@supports`, o padrão VENCE no Chrome e ele desenha a barra fina do Windows com setinhas
  nas pontas e polegar quadrado.
- **Nenhuma tela estiliza ou esconde a própria barra.** Quem precisa rolar precisa saber que dá;
  uma área rolável sem barra é conteúdo que parece cortado. Se um caso pedir outro desenho,
  ele entra aqui, não na tela.

## Ícones

Traço de 2px, grade de 24px, `currentColor`, **inline no markup**. Sem fonte de ícone e sem
pacote de ícones no bundle do Player. 16 e 20 no Studio; 24 e 32 no Player, sempre dentro de um
alvo de toque de 48px. Todo ícone que carrega significado vem com texto ao lado. Catálogo dos
ícones já em uso: seção "Ícones" de `/dev/components`.

Ilustração é conteúdo, não decoração: imagem otimizada com `width`/`height` fixos. Não desenhe
SVG ilustrativo à mão.

## Largura das telas do Studio

**Toda tela do painel usa o mesmo invólucro, `pagina-studio`** (`@utility` em `app.css`): largura
INTEIRA do `<main>`, 16px de respiro no celular e 28px no desktop. Nada de `max-w-[…] mx-auto` na
página — cada tela tinha a sua medida e trocar de aba fazia o conteúdo pular. Leitura confortável
é responsabilidade do PARÁGRAFO (`max-w-[60ch]`), e formulário largo demais se resolve com
COLUNAS — na Conta, o formulário ao lado das ações, e campos curtos lado a lado —, nunca
estreitando a página. Blocos que se repetem (o uso da assinatura) dividem a linha com
`grid-cols-[repeat(auto-fit,minmax(13rem,1fr))]`: três cabem lado a lado, nenhum fica sozinho pela
metade. Telas de cabeçalho próprio (Resultados) alinham o cabeçalho pelo mesmo respiro
(`px-4 lg:px-7`). As telas de TAREFA ÚNICA fora do painel (wizard, prévia) continuam
com a coluna focada delas: ali o estreitamento é a intenção. **Formulário de criar e editar que
não é atividade não é tela: é a `Bandeja`** (components.md), a ~40% da largura, sobre a lista de
onde veio — "nova turma" foi uma página e deixou de ser.

## Dois contextos, dois orçamentos

**Studio** pode ser rico. É desktop, usuário logado, sessão longa. Barra lateral FIXA (`sticky`
com `h-dvh` e `self-start`, não `fixed`: ela continua ocupando a coluna do flex, então nenhum
leiaute precisa de margem compensatória), tabelas densas, painel de contexto à direita.

**Player** é a superfície crítica: celular fraco, 4G, aluno sem paciência. Uma pergunta por
tela, ação principal fixa no rodapé, alvo de toque de 48px (`[data-surface="player"]`).

**A PÁGINA do Player não rola — o conteúdo rola por dentro.** A casca é `h-dvh` (não
`min-h-dvh`) e quem ganha `overflow-y-auto` é a área da questão; cabeçalho com o progresso e
rodapé com a ação principal ficam onde estão. Com a página rolando, a barra de progresso subia
para fora da tela e o botão de verificar ficava abaixo da dobra.
Duas armadilhas de flexbox, as duas já custaram um bug aqui: **todo pai entre a casca e a área
rolável precisa de `min-h-0`** (item de flex não encolhe abaixo do próprio conteúdo, então a
área rolável nunca fica com altura limitada e o conteúdo é CORTADO em vez de rolar), e a
centralização vertical usa `[align-content:safe_center]` — com `center` puro, conteúdo mais
alto que a área transborda para os dois lados e o topo fica inalcançável. Antes de
adicionar qualquer dependência a um componente do Player, verifique o impacto no bundle. A
pergunta padrão é "dá para fazer com CSS e o que já temos?".

## Movimento

Só `transform` e `opacity` (e as propriedades individuais `translate`/`scale`, que o Tailwind 4
usa). Nenhuma biblioteca de animação — os keyframes `en-*` estão no `app.css`. **Nada de
`transition-all`**: ele anima qualquer propriedade que mudar, inclusive as de layout.

**Os números são TOKENS, e duas fontes os espelham**: o `app.css` (`--duration-*`, `--ease-*`,
`--stagger`, as `animate-*`) e `$lib/movimento.ts` (para as transições do Svelte e as esperas em
JS). `movimento.test.ts` lê o CSS e falha se os dois divergirem. Duração escrita à mão numa tela é
bug: a mesma `en-fade-up` chegou a existir com treze durações. As regras saíram de um levantamento
do catálogo Motion Reference (takayustudio.jp), filtrado pelo que este produto pede:

- **A duração vai pelo TAMANHO do que se move.** Toque 120 (`--duration-tap`), micro 200 (`curta`:
  cor, hover, a saída), painel e modal 300 (`media`), tela e cartão grande 500 (`longa`), gráfico
  que cresce 800 (`grafico`), progresso 1 s. A mesma duração para tudo faz o grande parecer leve e o
  pequeno, lento.
- **A curva vai pelo PAPEL.** Entrada desacelera (`--ease-out-soft`, easeOutQuint); saída acelera
  (`--ease-in-soft`); movimento de A para B na tela é suave nas duas pontas (`--ease-in-out-soft`, a
  pílula do `Alternador`); o retorno com sobra é `--ease-out-back`.
- **Sair leva ~2/3 de entrar** (200 contra 300): o que vai embora não pode prender o olho.
- **Orçamento de sobra**: 0% em erro, ~4% em feedback (soltar o botão); mais que isso só em festa.
  Nada de mola elástica nem quique em interface — enquanto balança, o valor não se lê.
- **Lista em sequência: 60 ms entre itens, com teto no 6º** (`em-sequencia`, `reveal-row`). Com
  intervalo fixo, uma lista longa demora demais para terminar de aparecer.
- **Transição sem duração explícita cai no token**: `--default-transition-duration` e
  `--default-transition-timing-function` são 200 ms na curva de entrada, não os 150 ms do Tailwind.

| Intenção            | Token                                                 | Curva                              |
| ------------------- | ----------------------------------------------------- | ---------------------------------- |
| Toque               | `motion-tap`: afunda em `tap`, volta em `curta`       | entrada / `ease-out-back` (~4%)    |
| Hover de cartão     | `cartao-interativo`: sobe 3 px em `curta`             | entrada                            |
| Correção do item    | `feedback-in` (`--duration-feedback`, 220 ms)         | entrada                            |
| Troca de questão    | `q-out` em `curta` / `q-in` em `media`                | saída / entrada                    |
| Modal, painel       | `transicoes.ts`, `animate-veu*`: `media` / `curta`    | entrada / saída                    |
| Teclado virtual     | `teclado-in` em `media` / `teclado-out` em `curta`    | entrada / saída                    |
| Bloco que abre      | `animate-entrada-curta` (`media`)                     | entrada                            |
| Tela, cartão grande | `animate-entrada` (`longa`), `reveal-row`             | entrada                            |
| Barra que cresce    | `animate-crescer-x` / `animate-crescer-y` (`grafico`) | entrada                            |
| Progresso           | `animate-progresso` (1 s), `ProgressBar`              | entrada (por `scaleX`, sem reflow) |
| Seletor em pílula   | `Alternador`: a pílula desliza em `media`             | `ease-in-out-soft`                 |
| Peça do avatar      | `animate-salto` (`media`), por `{#key}`               | `steps(3, end)` (tema 8 bits)      |
| Gravação, skeleton  | infinito                                              | ease-in-out / linear               |

**Troca de questão**: a questão SAI antes de a próxima entrar — sem esse intervalo a troca era um
corte seco, porque `/q/1` e `/q/2` são a mesma rota e o componente só re-renderizava com outro
conteúdo. O deslocamento vem de `--q-shift`, que a tela define a partir do `dir` do CONTEÚDO
(não da interface): a transição inverte sozinha em árabe e hebraico, sem `if` na tela.

Três detalhes que separam uma troca natural de uma travada:

- **A busca do dado corre JUNTO com a saída** (`preloadData` antes de animar). Buscar depois
  deixava o cartão vazio pelo tempo do request, e era isso que fazia a transição parecer presa.
- **Saída e entrada não têm a mesma curva.** Sai em `curta` (200 ms) acelerando, entra em `media`
  (300 ms) desacelerando — e a espera do JS é `DURACAO.curta`, o mesmo número: quem está saindo some rápido e não arrasta o olho; quem entra é onde a atenção
  pousa. Mesma duração nos dois sentidos lê como pisca-pisca.
- **O avanço NÃO tem cronômetro: quem decide quando a leitura acabou é o aluno.** Corrigido o
  item, a tela PARA no feedback e a ação principal vira "Próxima questão". Havia uma pausa
  automática (0,9s no acerto, 2,2s no erro) que dava o mesmo tempo para "Correto." e para uma
  explicação de três linhas — e quem lê devagar perdia justamente a da questão que errou.
- **A ação principal fica travada do clique até a resposta do servidor chegar**, e o indicador de
  espera continua no botão o tempo todo: ele não pode voltar a parecer clicável no meio do
  caminho, senão dá para reenviar a mesma resposta ali. Respondida a questão o botão volta a ser
  clicável — mas para AVANÇAR, nunca para verificar de novo.

Com `prefers-reduced-motion` não existe espera nenhuma — segurar a navegação para animar o que
não vai animar seria só atraso.

**Espera** é `Loading.svelte`, em três variantes com lugares distintos, mais `skeleton` e
`LoadingBar.svelte` para os dois casos que não pedem forma girando. Regras e quando usar cada
uma: `components.md` "Espera". Nenhuma delas depende do movimento para ser compreendida.

**Correção do item** usa a utility `feedback-in` (`app.css`) num bloco envolvido por
`{#key state}` no `CorrectionState.svelte` — o `{#key}` remonta o bloco quando o estado muda, o
que dispara a animação de entrada de novo. Sem isso a troca de estado é instantânea e o aluno
não percebe o feedback chegando.

Entrada em scroll usa a utility `reveal-row` + a action `reveal` (`src/lib/actions/reveal.ts`).
A animação nasce **rodando** no CSS; a action só marca `animation-play-state: paused` no
elemento e volta a `running` quando ele entra na viewport via `IntersectionObserver`. Nunca
prenda um bloco em `opacity: 0` esperando JS — se o script falhar (ou o observer não existir no
browser), o conteúdo aparece normalmente. Dispara uma vez, nunca em loop, nunca ao sair. Dentro
de uma grade, passe a ORDEM do cartão (`use:reveal={{ ordem: i }}`): o atraso sai do `--stagger`, com
o mesmo teto de toda lista; o bloco da seção em si entra sem atraso. Estado selecionado usa `en-pulse-primary` (halo, sem escala) — só um por
tela.

Hover: linha de tabela troca para `base-200`; o CARTÃO clicável inteiro usa `cartao-interativo` (sobe
3 px, borda puxando para a cor da marca, sombra na cor da marca); controle pequeno — chip, opção — sobe 2 px
com `hover:-translate-y-0.5`. **No Tailwind 4, `-translate-y-*` e `scale-*` mexem em `translate` e
`scale`, não em `transform`**: uma `transition-[transform]` não os anima e o hover PULA — a lista
precisa dizer `translate` e `scale` (estava errada em dezoito lugares). Botão responde ao toque com
`motion-tap`.

Repetição infinita só para gravação e carregamento. Nada mais fica em loop.

**Formas de ambiente**: a faixa é uma BORDA da tela — ela margeia o conteúdo, não divide a tela
ao meio. A altura padrão é `clamp(9rem, 21vh, 12.5rem)`: em porcentagem pura ela crescia com o
container até as formas flutuarem por trás do texto, e em px fixo errava entre um celular e um
monitor. De que lado ela entra segue o LEIAUTE (`edges`), não o gosto: 'both' onde o conteúdo
fica no meio, 'bottom' onde ele começa no topo. As formas em si também crescem por `clamp()`.
Oito formas apenas — círculo, triângulo, hexágono, quadrado
arredondado, anel tracejado, arco, cruz e cápsula. Três a cinco por tela, 12 a 24s, opacidade
abaixo de 0.35, sempre `aria-hidden` e `pointer-events: none`. Entram em: capa do exercício,
tela do nome do aluno, tela de resultado, espera de correção. **Não entram atrás de enunciado,
alternativa ou campo de texto** — a faixa decorativa fica confinada a uma região sem texto, e
sua borda é resolvida com `mask-image` em fade, nunca com corte reto.

`prefers-reduced-motion` desliga tudo (já tratado no `app.css`). Nenhum layout depende de
animação.

## Acessibilidade — não é opcional aqui

Sem framework de UI: foco preso, anúncio pra leitor de tela e drag-and-drop acessível são todos
nossos, não vêm de graça.

- **Toda interação funciona pelo teclado.** A interação `assemble` (montar frase com tokens) é a
  mais fácil de errar: se só funcionar com mouse, ela exclui parte dos alunos. Use
  `svelte-dnd-action`, que tem suporte a teclado, e ofereça sempre a alternativa por clique.
- **Certo/errado nunca é comunicado só por cor.** Ícone e texto, sempre. Daltonismo é comum e o
  feedback é o momento mais importante do exercício.
- **Anuncie o resultado para leitor de tela** com uma live region ao corrigir cada item.
- **Foco vai para o início da nova questão** ao avançar, não fica perdido no botão anterior.
- Foco visível em tudo: `:focus-visible` com outline `primary` de 2px (já no `.btn`/`.input`).
- Contraste mínimo 4.5:1 para corpo de texto. Forma decorativa atrás de texto quebra isso —
  por isso a regra acima existe.
- Áudio tem controle de reprodução visível e velocidade alternável. Nada de autoplay.
- **Som de retorno é reforço, nunca o veredito.** Os sons de acerto, erro e fim do Player
  (`VolumeControl.svelte`) somam ao ícone e ao texto que já estão na tela — pela mesma razão
  de cor sozinha não comunicar correção. Com o volume em zero o exercício não perde nada, e
  o regulador fica visível desde a entrada da atividade, antes da primeira questão.

## Direção do texto

O idioma alvo pode ser RTL (árabe, hebraico). O container do conteúdo recebe `dir` a partir do
`LanguageProfile`. Nunca assuma `ltr` no CSS — use propriedades lógicas (`ms-`, `me-`,
`text-start`, `text-end`, `inset-inline-*`, `border-inline-*`), nunca `ml-`, `mr-`, `text-left`.

O Player pode ter a interface em uma direção e o conteúdo em outra: um brasileiro estudando
árabe vê interface LTR com conteúdo RTL. Isso precisa funcionar. A transição entre questões
segue o eixo do `dir` do conteúdo, então inverte sozinha em RTL.

## Estado de correção

Três estados visuais por item, mais o neutro:

| Estado         | Cor       | Ícone              | Texto                               |
| -------------- | --------- | ------------------ | ----------------------------------- |
| Não respondido | neutro    | círculo tracejado  | —                                   |
| Correto        | `success` | check em círculo   | "Correto"                           |
| Parcial        | `warning` | círculo meio cheio | "Quase — falta ..."                 |
| Incorreto      | `error`   | x em círculo       | "Incorreto" + gabarito se permitido |

**Parcial existe** — é o resultado normal de `tolerant` e de `asr`, e tratá-lo como erro seco
frustra o aluno. Mostre o que faltou, não só que errou. Em relatório do professor, parcial é
faixa própria no gráfico: somar ao erro esconde exatamente o que ele precisa ver.

Em `speak`, o botão de pular está sempre visível. Ver `.claude/rules/kernel.md`.
