---
paths:
  - 'src/routes/**'
  - 'src/lib/components/interactions/**'
---

# Rotas — Spokke

Todas as telas do produto. Estilo, movimento e semântica de correção vêm de
`design-system.md`; os snippets base, de `components.md`. Este arquivo cobre só o que é
específico de rota. Contexto completo de cada página (dados, estados, regras que amarram):
`docs/mapa-de-paginas.md`.

## Mapa

| Rota                                                                                 | Papel                                                   |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| `/`                                                                                  | Home pública (regras em `home.md`)                      |
| `(auth)/entrar` `cadastro` `esqueci-senha` `redefinir-senha`                         | Acesso — professor e aluno, num seletor                 |
| `+error.svelte`                                                                      | 404 e 500                                               |
| `(site)/planos`                                                                      | Planos e preços — e o destino de quem bate num bloqueio |
| `(site)/contato` `sobre` `ajuda` `privacidade` `termos` `cookies` `acessibilidade`   | Páginas institucionais                                  |
| `(site)/blog` → `pagina/[n]` · `tema/[tema]` · `para-escolas` · `[slug]`             | Blog (`docs/blog.md`): índice, hubs e artigo, sem autor |
| `sitemap.xml` (índice) · `sitemap-paginas.xml` · `sitemap-blog.xml` · `blog/rss.xml` | Sitemaps do site (docs/seo) e o feed do blog            |
| `(studio)/inicio`                                                                    | Início — uma peça por área; é para onde o login leva    |
| `(studio)/atividades`                                                                | Lista — **com zero atividades vira o onboarding**       |
| `(studio)/atividades/[id]`                                                           | A atividade aberta: questões, link, QR, envios          |
| `(studio)/atividades/nova` → `[id]/materiais` → `revisar` → `publicar`               | Wizard de criação                                       |
| `(studio)/atividades/[id]/itens/[itemId]`                                            | Editor de item                                          |
| `(studio)/atividades/[id]/previa`                                                    | Prévia do aluno, sem criar tentativa                    |
| `(studio)/materiais`                                                                 | Biblioteca reusável                                     |
| `(studio)/resultados` → `[activityId]` → `[attemptId]`                               | Resultados — e a correção, na própria resposta          |
| `(studio)/turmas` → `[id]` (`nova` só redireciona para a bandeja)                    | Turmas e alunos                                         |
| `(studio)/alunos/[id]`                                                               | O aluno e o histórico de respostas dele                 |
| `(studio)/modulos` → `[id]` → `[id]/mapa` · `calendario`                             | Módulos, turmas e programação de envio · calendário     |
| `(studio)/escola` · `escola/convite/[token]`                                         | Coordenação da escola (só números) · aceite do convite  |
| `(studio)/conta` (`?aba=assinatura`; `/assinatura` redireciona)                      | Conta e assinatura, em duas abas                        |
| `(admin)/admin` → `professores` `pedidos` `escolas`                                  | Painel interno da plataforma (404 para os outros)       |
| `a/[slug]` `codigo` `q/[n]` `resultado` `revisao`                                    | Player                                                  |
| `exemplo`                                                                            | Atividade de exemplo, pública e sem gravar nada         |
| `e/[token]`                                                                          | Link pessoal do convite (redireciona, não é tela)       |
| `aluno` (`aluno/entrar` só redireciona para `/entrar?como=aluno`)                    | Área do aluno: conta OPCIONAL e histórico dele          |
| `aluno/modulos/[id]`                                                                 | O mapa do módulo do aluno, no tema 8 bits               |
| `aluno/convite/[token]`                                                              | Convite de conta: criar/entrar e ligar à turma (botão)  |

## Regras que atravessam várias telas

**O professor nunca escolhe a habilidade.** Escuta, fala, leitura e escrita são
derivadas de material × interação × correção. Não existe campo "habilidade" em nenhum
formulário; elas aparecem já calculadas na etapa de publicar.

**O professor nunca vê JSON.** Três níveis de autoria (kernel.md): colar material (etapa 2),
revisar um resumo legível de cada item gerado (etapa 3), e o editor de item com formulário
derivado do `authoringSchema` da interação (nível 3). Um textarea de JSON em qualquer lugar é
um bug. Quem traduz "o gerador `listen-type` produziu um item" para "digitar a frase ao ouvir o
áudio" é `$lib/server/atividades/resumo.ts` — módulo compartilhado porque a etapa 3 e a tela de
detalhes mostram a MESMA frase, e um `+page.server.ts` não pode exportar nada além de `load`,
`actions` e as opções de rota (o `vite build` recusa; o `pnpm dev` não).

**O gabarito não sai do servidor.** No editor ele vive numa moldura âmbar com cadeado. A
prévia ao lado renderiza o resultado de `toRuntime()` — o mesmo payload que o browser do
aluno recebe. Se o gabarito aparecesse na prévia, estaria vazando de verdade.

**A versão publicada é imutável — e o professor nunca vê isso como versão.** O snapshot existe
para que ninguém tenha as perguntas trocadas no meio da tentativa: quem está respondendo agora
termina com o que abriu, e nenhuma tentativa antiga muda de resultado. Mas ele é INTERNO. Na
interface a atividade é uma só, com estado — rascunho, no ar, no ar com mudanças por publicar —
e nenhuma tela numera versão, nem no botão, nem em badge, nem em filtro de resultados. Numerar
fazia uma atividade recém-criada nascer na "versão 2" e o professor perguntar o que era a 1.
Apagar um material da biblioteca não toca no que já está no ar — aquilo guarda uma cópia
congelada.

**Parcial tem faixa própria** em todo gráfico e toda contagem (`ScoreBar.svelte`,
`ResultTrack.svelte`). Somar parcial ao erro esconde exatamente o que o professor precisa ver.

**Mensagem de credencial é genérica.** "E-mail ou senha incorretos", nunca "e-mail não
encontrado". A confirmação de recuperação também: "se esse e-mail existir". As duas coisas
existem para não vazar quem tem conta.

**"Continuar com o Google" vem antes do e-mail** em entrar e em criar conta, para professor e
aluno (`(auth)/BotaoGoogle.svelte`), e só existe com o Google ligado no servidor. Em entrar, uma
linha diz que a primeira vez cria a conta, com os Termos e a Política. A volta com problema
(`?error=`) vira frase com o próximo passo (`(auth)/erro-do-google.ts`) — a mais comum é "este
e-mail já tem conta com senha: entre com ela e ligue o Google por dentro".

**Cobrança não afeta o aluno.** Pagamento atrasado bloqueia criar e publicar; os links já
publicados continuam funcionando. Voltar do checkout não significa pago — a confirmação vem
do provedor, e existe um estado "confirmando" para isso.

## Studio

**Toda tela do painel ocupa a largura INTEIRA** do `<main>`, pelo mesmo invólucro
(`pagina-studio`, design-system.md "Largura das telas do Studio"): nenhuma página tem `max-w` +
`mx-auto` próprio. Cada uma tinha a sua medida — 820px na conta, 900 no módulo, 1000 na lista de
módulos — e trocar de aba fazia o conteúdo pular. O que limita leitura é a medida do parágrafo.

Barra lateral fixa em `(studio)/+layout.svelte`. **O wizard de criação não usa esse layout** —
durante a criação o professor tem uma tarefa só, e o `Stepper` substitui a navegação. Na
prática isso é o reset de layout avançado do SvelteKit: as seis telas do wizard
(`atividades/nova`, `[id]/materiais`, `[id]/revisar`, `[id]/publicar`,
`[id]/itens/[itemId]`, `[id]/previa`) são arquivos `+page@.svelte` — o `@` sem sufixo reseta para o layout
raiz (`src/routes/+layout.svelte`, que só monta `app.css` e o favicon), pulando o
`(studio)/+layout.svelte` mesmo estando fisicamente aninhadas sob `(studio)/atividades/`.

**A etapa 2 e a biblioteca usam UM formulário** — `MaterialForm.svelte` (components.md). Aqui
ele é coluna fixa à esquerda da lista; na biblioteca, painel sobre ela. Enquanto cada tela tinha a
sua cópia, as duas divergiam no primeiro ajuste de layout. **A etapa ocupa a altura da tela e cada
coluna rola por dentro** (`WizardShell` com `rolagem="colunas"`): o corpo do formulário rola com o
cabeçalho e o botão de adicionar parados, como na bandeja. Numa coluna sem altura o corpo crescia
até o fim do conteúdo, o botão ia para baixo da dobra e a rodinha sobre a coluna não rolava nada —
o `overscroll-contain` do corpo segurava o gesto. A lista também é uma
(`MaterialList.svelte`): muda só a quarta coluna ("Origem" aqui, "Em uso" lá) e o que remover
significa. No celular só um dos dois cabe: o formulário cobre a lista, e "Ver os N materiais" /
"Adicionar" alternam entre eles.

**Os quatro tipos aparecem PELO EXERCÍCIO que produzem** ("montar, traduzir, completar, ouvir e
falar"), não pelo formato do dado — a dúvida do professor é "o que eu quero que o aluno faça".
Cada tipo tem os SEUS campos, não um campo genérico: par de frases é
alvo + tradução + nota (a nota é do professor, nunca vai para o aluno); vocabulário troca a nota
por frase de exemplo; texto tem as perguntas de compreensão campo a campo; e diálogo é uma lista
de falas com falante, com reordenar e remover — colado num bloco só, uma linha sem "Nome:" caía
em A/B alternado sem o professor saber. Na edição o tipo fica TRAVADO com o motivo escrito, e
um aviso diz em quantas atividades o material está — salvar muda o que os rascunhos veem, o que
está no ar não.

**"O que o aluno vai ver"** fecha o formulário: o exercício montado com o que o professor digitou
(a frase tokenizada pelo `Intl.Segmenter` do idioma alvo e embaralhada com seed, a escolha com a
alternativa errada tirada de OUTRO termo do conjunto, as falas fora de ordem). É a única forma de
entender o produto sem publicar antes — e a alternativa certa aparece marcada porque é a tela do
PROFESSOR, não do aluno.

Perguntas e falas viajam como JSON num campo escondido, montado pelo componente. Isso não
contradiz "o professor nunca vê JSON": ele preenche campo a campo, como no `payload` de
`salvarItem`.

**Trazer da biblioteca é uma escolha, não um clique por linha**: o painel tem busca, filtro por
tipo e seleção múltipla, e `usarDaBiblioteca` recebe uma LISTA de ids. O professor marca as
frases da aula passada e traz de uma vez, em vez de uma viagem ao servidor por material.

Par de frases e vocabulário têm ainda o modo **"Colar uma lista"** (`adicionarMateriaisEmLote`),
que é como o professor tem o material de verdade. A prévia usa o MESMO parser do servidor
(`previewRawLines`, ao lado de `parseRawMaterial`) e mostra as linhas DE VERDADE, não só
contadores: cada uma com o que virou esquerda e direita, e as sem separador riscadas, com
"Corrigir" levando o cursor até ela — a versão antiga descartava linha sem separador em silêncio
e a etapa travava sem explicação. Os chips de separador saem de `RAW_SEPARATORS`, do mesmo
arquivo do parser.

**A tradução sai sozinha** quando há tradutor (`TRANSLATE_PROVIDER`, server.md "Tradução do
material", adr-006): o professor escreve a frase no idioma que ensina e o campo da tradução vem
preenchido depois de uma pausa na digitação, com "Tradução automática. Confira e ajuste se
precisar." embaixo e o rótulo "sai sozinha, você confere". **A dele nunca é trocada**: escreveu,
o campo é dele, e a sugestão não volta por cima mesmo que a frase mude — "Traduzir de novo"
troca a pedido. O botão de salvar não espera a tradução: o que chegar em branco é traduzido no
servidor. Colando uma lista, a tradução depois do separador vira OPCIONAL: a linha só no idioma
alvo aparece na prévia com "tradução automática" (não riscada), e o resultado diz quantas
traduções vieram do tradutor, para ele conferir na lista. Na biblioteca o destino é a língua do
aluno da página (a mesma da IA), e material "sem idioma" não tem de onde traduzir. Sem tradutor,
tudo volta ao de antes: a tradução é obrigatória e a linha sem separador fica de fora.

**"Gerar com IA" é o terceiro modo de entrada, ao lado de digitar e colar** — não um lugar
separado. Três fontes: o **prompt** (o professor descreve), a **foto** de uma página e a **fala de
um vídeo** (adr-003, seção 6). A regra é a mesma nas três: a IA propõe, nada é gravado antes de o
professor marcar e confirmar, e o que ele já tem é reaproveitado.

- **A área de arrastar é o seletor de arquivo**: tocar abre o do aparelho, arrastar também serve,
  e o input escondido continua focável pelo Tab. A foto aparece em miniatura; o vídeo mostra a
  duração e ganha os campos de TRECHO ("2:30", em branco é o vídeo inteiro), que dizem embaixo
  quanto de fala vai para a IA, ou o que está errado. O teto é de 10 minutos de fala por geração.
- **O arquivo é preparado no navegador**: a foto reduzida, e do vídeo só a fala do trecho. O aviso
  sob a área diz isso, e pede material do professor ou didático, sem imagem nem voz de aluno.
- **O botão diz o custo TOTAL** ("Gerar 10 propostas · 13 créditos"), e a linha sob ele separa as
  propostas da leitura do arquivo. É a mesma conta que o servidor debita (`custoDaGeracao`).
- **Fonte que a IA ligada não lê** (vídeo com só o Claude configurado) continua selecionável, e a
  linha sob o botão diz por que ele está travado: `EstadoDaIa.fontes` vem do servidor.
- O campo de texto vira "Foco do material · opcional" nas fontes de arquivo.

**Repetido é dito ENQUANTO digita**, não depois de enviar: "você já tem esta frase" (ou "já está
nesta atividade") aparece sob o campo. A comparação espelha a do servidor — os campos como vão ser
gravados, só aparados, INCLUINDO nota e exemplo, porque `findEquivalent` compara o jsonb inteiro.
Não passa pelo normalizador de propósito: "café" e "cafe" são dois materiais para o servidor, e
prometer reaproveitar para depois gravar outro seria mentir. É por isso que `materiaisDisponiveis`
devolve `note` e `example`.

Cada tipo mostra também **o que o conjunto já rende** — o bloco sob os cartões de tipo, com tom
de aviso quando falta ("1 de 2 perguntas no conjunto"): distrator sai sempre do próprio conjunto
(kernel.md), então um termo sozinho não vira exercício de escolha — e isso só aparecia na etapa
3, depois de gerar. A conta é `estimarRendimento` (`kernel/content/rendimento.ts`), que espelha
o piso de cada gerador; o rodapé do wizard usa a mesma ("dá para gerar ao menos N questões" —
"ao menos" porque escuta e fala dependem do provedor).

Descartar um item **marca** (`Item.discarded`), não apaga: "Restaurar" precisa dele, e a
publicação é que remove os descartados de vez. "Pré-visualizar tudo" é uma rota do professor
(`[id]/previa`), não `/a/[slug]`: antes de publicar aquele link não existe, e depois de
publicar abri-lo criaria uma tentativa de aluno no relatório dele. A prévia monta cada item com
o mesmo `buildRuntimeItem` do Player — se o gabarito aparecesse ali, estaria vazando de verdade.

**A prévia é uma tela FECHADA sobre de onde veio**, não uma etapa: sem barra lateral e sem
Stepper, e a saída é um X (mais Esc) — não um "voltar para Publicar". Ela é aberta de dois
lugares, o wizard e a tela de detalhes, e devolver todo mundo para o wizard largava no meio de um
fluxo o professor que nem estava nele. O destino vem de `?voltar=`, validado no loader contra uma
LISTA FECHADA de tokens (`detalhe` | `publicar`, com `publicar` de padrão): `?voltar=` aceitando
endereço livre é redirecionamento aberto de manual.

**"Cancelar" mora no `WizardShell`, não em cada etapa.** Sair da criação é a mesma saída nas
quatro, e enquanto ele existia só na primeira o professor que mudava de ideia na etapa 3 só tinha
o "voltar" — um passo por vez até o começo. Não apaga nada: o rascunho continua salvo e a
atividade aparece na lista como rascunho, e é por isso que o rótulo é "Cancelar" e não
"Descartar".

**A etapa 1 pergunta QUANTAS questões e QUAIS habilidades.** Isso não contradiz "o professor
nunca escolhe a habilidade": ele não marca a habilidade de cada exercício — ela continua derivada
—, ele diz o que a ATIVIDADE treina, e `selectItems` (kernel.md) filtra o que os geradores
produziram. Sem esse corte, 20 frases viravam cem exercícios e ele descartava 88 na mão. Fala e
escuta têm teto de 5 cada, escrito no próprio chip: cada item de escuta é um par de arquivos de
TTS a sintetizar e cada um de fala é uma gravação que o aluno precisa de silêncio para fazer.
Desmarcar a última habilidade não é possível — geraria uma atividade vazia, e o erro só
apareceria na etapa 3.

**Material igual ao que o professor já tem é REAPROVEITADO, não duplicado.** `createForActivity`
procura um equivalente (igualdade de `jsonb`, mesmo `kind`) e liga aquele à atividade. A linha
ganha a etiqueta **biblioteca** — sem ela o contador não subia e parecia que a frase não tinha
sido salva. Colar a lista da aula passada de novo é comum, então o lote diz quantas linhas já
existiam.

Esperas são reais e assíncronas, e cada uma usa a variante certa de `Loading.svelte`
(components.md "Espera"): gerar itens é `orbita` em `pace="devagar"` mais `skeleton`, porque a
estrutura do que vem é conhecida; salvar item, publicar, regerar e enviar convites são `fila`
dentro do próprio botão; a fila de e-mail é `LoadingBar`. Gerar áudio bloqueia a publicação com
progresso REAL (x de y áudios prontos), que é o único caso em que existe número para mostrar.
Nenhuma delas tem prazo estimado.

Esse progresso é o único número do wizard que muda **sem o professor fazer nada** — quem
sintetiza é o worker, noutro processo. Por isso a etapa 4 recarrega sozinha enquanto falta
áudio, e para quando termina; e por isso a síntese começa na GERAÇÃO dos itens, não na
publicação (server.md "TTS"). Enfileirar só ao publicar era um impasse: o botão exigia o áudio
pronto, e o áudio só era pedido por quem apertasse o botão.

**A prévia do editor de questão é a de VERDADE**: `previaDoItem` monta a questão com o que está
no formulário — antes de salvar — pelo mesmo `montarItemEditado` do `salvarItem` e pelo mesmo
`buildRuntimeItem` do Player, e quem desenha são os componentes do Player
(`PreviaDaQuestao.svelte`, o mesmo da prévia da atividade inteira). A versão anterior era um
desenho à mão que se dizia `toRuntime()` e não era: numa lacuna ela escondia a tradução de apoio
que o aluno vê. **E é um celular**: moldura de bezel de 340px por 560px de
altura MÍNIMA, centrada na coluna de 420px, com a ação no rodapé. Antes ela tinha a altura do
próprio conteúdo, então uma questão curta virava uma tirinha e o professor não via o respiro que
o aluno vê. **As formas de ambiente ficam no PAINEL, nunca dentro do aparelho** — dentro dele
caem atrás do enunciado e do campo de resposta —, ancoradas embaixo (`edges="bottom"`, 190px) e
com `scale={0.62}`, porque elas crescem com `vw` e numa coluna estreita sairiam do tamanho de uma
tela inteira (components.md "Formas de ambiente").

## Player

Uma pergunta por tela. Alvo de toque de 48px — **inclusive no desktop**. A correção acontece
no servidor, então "Verificando…" é um estado real: nada de veredito otimista no cliente.

**Desktop (`lg:`):** mídia à esquerda e resposta à direita, ação principal na barra do cartão
em vez de fixa na viewport. Os atalhos (números escolhem alternativa, Espaço repete o áudio,
Enter verifica) **só existem aqui** e sempre como legenda — nunca a única forma de responder.

Quem decide "é desktop" é `$lib/client/viewport.svelte.ts`, não o servidor: o número dentro da
alternativa é CONTEÚDO, não estilo, e só faz sentido junto do atalho numérico. O loader devolvia
`desktop: false` fixo, então no desktop a tela nunca saía da versão de celular. A consulta do
rune é a mesma do `lg:` (64rem) — duas fontes de verdade dariam uma faixa de larguras com a
legenda de teclado sem o leiaute de duas colunas.

Cada tela do Player é um cartão com **cabeçalho e rodapé próprios**: marca e estado em cima,
frase de contexto e ação principal embaixo — e **a página não rola**, quem rola é a área do
meio (design-system.md "Dois contextos"). **Quem está logado vê o próprio avatar e o nome no cabeçalho, e
ele é a porta do painel do aluno** (`/aluno`) — na entrada, no lugar do cadeado "você não precisa
de conta", e no resultado. Sem conta é só o nome (ou o cadeado): a área não existe para quem não
a tem, e o Player não é o lugar de oferecê-la. No cabeçalho mora também o **regulador de volume**
do som de retorno (entrada, questão e resultado), para o aluno numa sala cheia desligar antes
da primeira questão — regras em components.md "Volume do retorno". O corpo tem faixas decorativas em cima E embaixo
(`AmbientShapes edges="both"`) — uma faixa só deixa a metade de baixo chapada.

O item carrega, além do enunciado, uma `hint` de uma linha com a REGRA da questão ("a velocidade
mais lenta não conta como erro", "acento e caixa são ignorados"). Ela sai de
`server/player/runtime.ts` a partir do prompt, do modo de correção e do `LanguageProfile` —
dizer "acento é ignorado" sem olhar o profile seria mentira em `pt-BR`.

Cada interação é um componente em `$lib/components/interactions/`, tipado contra
`$lib/components/interactions/types.ts` — o formato que `toRuntime()` produz de verdade hoje
(as oito estão no registry). Quem monta o item seguro é `server/player/runtime.ts`: nenhum
componente recebe payload de autoria.

**O veredito é UM, fora da interação** (`AnswerFeedback.svelte`, renderizado pela `/q/[n]`). Ele
morava dentro do `ClozeInteraction`, então quem errava um "Monte a frase" não via feedback
nenhum: a tela esperava os 2,2 s de leitura e passava para a próxima questão. As outras sete
interações não tinham onde mostrar o resultado. Ícone e texto, nunca só cor — daltonismo é comum
e este é o momento mais importante do exercício. O som (`correct` / `almost` / `incorrect`, e
`finish` na tela de desfecho) entra junto como reforço, jamais no lugar deles.

**Em "montar a frase", "ordenar" e "associar", o veredito GRIFA em vez de contar.** O feedback
traz a resposta que o aluno montou com o que saiu do lugar sublinhado (`Score.marks`,
kernel.md) **e, logo abaixo, como deveria ficar** ("O certo era:", `Score.expected`). Antes ele
lia "8 de 9 palavras na posição certa; a primeira fora de lugar é a 5ª" e tinha de recontar a
própria frase para descobrir qual era a 5ª — e mesmo com o grifo, sem a resposta certa ao lado
ele sabia ONDE errou sem saber o QUE era. O sublinhado ondulado vem acompanhado de uma linha
`sr-only` dizendo quais palavras estão fora — grifo é visual e não se anuncia sozinho.

**E a tela PARA nele.** Corrigido o item, o rodapé vira "Próxima questão" ("Ver o resultado" na
última) e nada avança sozinho — quem decide quando a leitura acabou é o aluno. O cronômetro
anterior dava os mesmos 2,2 s para "Correto." e para um "Quase, faltou o acento" de três linhas.
Enquanto o feedback está na tela o "Pular esta questão" some (a questão já foi respondida, pular
seria a mesma ação com outro nome) e o Enter do desktop passa a significar "continuar" — a
legenda muda junto, senão o atalho reenviaria o que já foi corrigido.

**Voltar não apaga nada.** A resposta já está gravada em `AttemptItem` — é o que o professor vê
e o que sustenta a retomada —, então o loader a devolve em `answered` e a tela a restaura. Não
existe cópia em `sessionStorage`: seria uma segunda verdade, divergindo no primeiro F5 em outro
aparelho. Numa questão já respondida a ação vira "Próxima questão", porque não há o que
verificar de novo, e o veredito só volta se o professor deixou `showResult` ligado — voltar não
pode ser a porta dos fundos para descobrir se acertou.

**Toda troca de questão passa por `trocarPara`, inclusive o "Anterior"** (que por isso é botão,
não `<a>`). O `saindoDe` guarda o CAMINHO de onde se saiu: com o índice, voltar devolvia o mesmo
número de onde se tinha saído e a questão anterior reaparecia transparente e deslocada — a
animação de saída rodando na chegada. Com o caminho, o valor velho sempre aponta para a página
que ficou para trás, e isso só fecha porque as duas direções passam pelo mesmo lugar.

**A rota `/q/[n]` reusa o mesmo componente entre as questões** (é a mesma rota). Sem zerar o
estado quando `index` muda, o feedback da questão anterior sobrevive e deixa o campo
desabilitado — foi um bug real. Três merecem nota:

- **assemble** — `AssembleInteraction.svelte` usa `svelte-dnd-action` de verdade (a versão do
  pacote de entrega prometia isso no comentário mas só tinha clique) mais o clique como
  alternativa equivalente — design-system.md exige as duas.
- **match** — o número no par substitui a linha desenhada: funciona em tela estreita,
  sobrevive a RTL e é anunciável por leitor de tela. Correção por conjunto. Quem produz um
  item destes é o `closing-match` (kernel.md), que fecha toda atividade com uma revisão do
  material que apareceu no caminho — até ele existir, a interação estava no registry e nenhum
  aluno via uma.
  **A correção dele acontece nos CARTÕES, não no veredito**: cada ligação errada pinta os dois
  cartões dela de vermelho, e o `AnswerFeedback` fica só com a linha de estado. As colunas
  estão na tela — repetir "bookshop → relatório" num texto embaixo diria a mesma coisa duas
  vezes, a segunda sem as colunas ao lado. E aqui o `expected` **não** é enviado: entregar o
  pareamento certo por escrito resolve o exercício inteiro, e diferente de uma frase o aluno
  não teria como reconstruí-lo de memória. Quem acertou continua na cor da marca, não em verde —
  pintar de verde o que sobrou seria dizer "estes estão certos" mesmo com o resultado
  desligado.
- **order** — **arrastar e as setas, as duas**, e isso não é redundância: arrastar é o gesto
  natural de reordenar, e as setas são o caminho que funciona no teclado, no leitor de tela e
  para quem tem dificuldade motora. `svelte-dnd-action` tem suporte a teclado nativo, mas as
  setas ficam porque elas DIZEM o que fazem — um alvo arrastável não. Quem arrasta é a linha
  inteira; a alça de pontinhos é decorativa, porque num celular ela sozinha seria um alvo de
  20px. Correção por sequência.
- **speak** — compõe o `Recorder.svelte` existente (`size="lg"`) em vez de duplicar o botão de
  gravação. Pular está sempre visível, mas mora no rodapé da casca (é navegação, não da
  interação). Sem provedor de ASR configurado, o servidor omite o item do payload.
  **Quem fala com o `MediaRecorder` é a TELA** (`client/gravacao.svelte.ts`), porque o
  `Recorder` é controlado por desenho — o componente recebe estado e um `ontoggle`. A gravação
  para sozinha aos 30 s e o contador fica na tela: sem ele o aluno é cortado no meio da frase
  sem entender por quê. Microfone negado, aparelho sem entrada e navegador que não grava têm
  cada um a sua mensagem, e nenhuma delas trava o exercício.
  **A resposta é a única do Player que sobe binário** — vai por `POST /a/[slug]/fala`, não por
  remote function (server.md "ASR"): o `answerSchema` do `speak` é `{ transcript }`, e deixar o
  browser preenchê-lo era deixar o aluno digitar a própria resposta. O veredito volta com **o
  que o serviço ENTENDEU** (`heard` no `AnswerFeedback`), e isso é metade do retorno: "Quase."
  sem dizer o que se ouviu não diz ao aluno se ele pronunciou torto ou se o microfone cortou.
  **E ele vê isso ANTES de enviar**: a gravação para sozinha, sobe em `modo=ouvir` e a frase
  entendida aparece sob o microfone ("Entendemos: …"), com a saída de regravar — o aluno decide
  se manda aquilo. O "Verificar" reaproveita a transcrição (server.md "ASR"), então a correção
  chega na hora.
  **Os atalhos de teclado não valem com um campo de texto focado** (`digitando()`): o Espaço que
  repete o áudio engolia o espaço entre as palavras de "Ouça e escreva" — dava para digitar
  qualquer coisa, menos uma frase.

**"Relatar problema" mora no cabeçalho de toda questão** — a bandeira ao lado do volume, com
"Relatar problema" escrito no desktop. No cabeçalho e não no rodapé: o rodapé é da ação principal, e
o relato vale antes e depois de responder. Abre um `<dialog>` (`q/[n]/RelatarProblema.svelte`,
baixado só no primeiro clique — orçamento de peso do Player) com o motivo em rádios (o áudio só
aparece em questão com áudio; o microfone, só na de fala), um campo opcional e, ANTES do botão, o
que vai junto e que o nome não vai (auth.md "Dados do aluno e LGPD"). Enviado, a tela mostra o
código `R-XXXXXX` em azul, nunca em verde (não é acerto). O relato leva o que só o navegador sabe —
a resposta NA TELA (pode não ter sido enviada), o veredito mostrado, o microfone, o teclado, o
aparelho e o diário de erros (`$lib/client/diario.ts`) —, e o servidor acrescenta a questão com o
gabarito e a correção refeita (`server/relatos`). Vai para a equipe (intranet "Relatos"), nunca
para o professor.

**Toda questão de escrever no idioma alvo vem com o teclado dele — e só ela.** Em japonês (kana),
mandarim (pinyin com tom), árabe e híndi a questão de digitar mostra a grade do script
**encaixada acima do rodapé**, no lugar do teclado do aparelho — a questão rola por cima dela e
ela não sai do lugar. **Toda questão começa com ela OCULTA**: o aluno a chama pelo botão
"Teclado" do rodapé, e ela sobe de baixo como a de um celular. Em português, espanhol,
francês e italiano, uma barra de acentos sob o campo (components.md "Teclado virtual"). Sob o
campo da grade vem a **"Leitura"** do que o aluno digitou (`おはよう` → `ohayou`), junto da chave
"Pronúncia nas teclas"; no pinyin as duas somem, porque o texto já é a pronúncia. Em japonês e
mandarim o aluno escreve a LEITURA da frase e ela é certa: o servidor a põe no gabarito
(kernel.md "Entrada"), inclusive nas atividades publicadas antes disso. Traduzir para a língua
do aluno nunca tem teclado: ali o aparelho é dele. Respondida a questão, a grade some: não há
mais o que digitar.

Não existe um 9º tipo de interação "escrita longa": é `type` com `grading.mode === 'rubric'`
(exposto ao Player como `item.gradedLater`), renderizado por `WritingInteraction.svelte` em vez
de `ClozeInteraction.svelte`. Kernel.md define só oito interações — inventar uma nona no nível
da UI quebraria o princípio central do kernel.

Em `match` e `order` a ordem inicial vem da seed da tentativa e não reembaralha a cada render.

`a/[slug]/revisao` é a tela de "Rever minhas respostas" do resultado — o botão existia desde a
entrega e apontava para uma rota que não existia. É a ÚNICA tela do Player em que o gabarito
aparece, e só quando o professor ligou `showResult`: com o resultado desligado, revisar seria o
mesmo vazamento pela porta dos fundos, então o loader redireciona em vez de esconder um pedaço
da tela. Questão ainda não respondida não entra na lista (seria gabarito adiantado). A resposta
do aluno vira texto em `server/player/readable-answer.ts`, que lê o payload de `toRuntime()` —
em `assemble`, `match` e `order` a resposta guardada é uma lista de ids embaralhados, e o
payload de autoria daria o mesmo texto trazendo o gabarito junto.

**Quem já entregou vê o RESULTADO, não o formulário de começar.** A entrada procura uma
tentativa terminada deste aparelho (`anonId`) ou desta conta — a conta é o que atravessa a
troca de celular, o cookie não — e, achando, troca a tela: o que ele respondeu, quando, e um
"Ver meu resultado". A contagem de ACERTOS não aparece aí: o professor pode ter desligado o
resultado, e adiantar o número seria a porta dos fundos daquele interruptor.

É informação de TELA, **não uma tranca**: a identidade ali é um cookie de aparelho, e bloquear
no servidor deixaria sem recurso quem limpou o navegador ou trocou de celular — a atividade é
do professor, que pode pedir para refazer. `iniciarTentativa` continua aceitando uma tentativa
nova; o que mudou é o que a tela oferece primeiro.

A tela de resultado acompanha: sem o cookie da tentativa, ela procura a terminada pelo mesmo
caminho, senão "Ver meu resultado" devolvia para a entrada, em círculo.

**O resultado tem quatro blocos, em ordem de pergunta**: quanto eu fiz (anel de acerto, a trilha
por item e a legenda em texto), como foi meu percurso, em que eu fui bem, e o que aconteceu em cada
questão.

**O tempo entra como informação de ESTUDO, nunca como cobrança.** A média por questão vem ao lado
da média da turma (`avgMsPorQuestao`, só de tentativas terminadas e sem a do próprio aluno —
comparar-se consigo é comparar com nada; sem ninguém para comparar a linha simplesmente não
aparece), e a questão mais demorada é rotulada **"onde você pensou mais"**, em âmbar e não em
vermelho: quem leva o dobro do tempo e acerta não errou nada. O quarto cartão é a tentativa ("2 de
2") com o que ele fez na primeira — o percurso é o que dá sentido ao número de hoje.

**"Por habilidade"** agrupa pelo `rotuloDoItem` (`server/player/rotulo.ts`) — a MESMA palavra da
lista de questões. Item pendente fica fora: sem veredito, contá-lo como não-acerto reprovaria o
aluno por uma fila do professor.

**"Questão a questão" é a lista INTEIRA**, não só os destaques, com o filtro "Todas · N / Para
rever · N" (o filtro só aparece quando há algo a rever). Cada linha errada ou parcial abre com a
resposta esperada e um **"Por quê"** — e esse texto vem do `Score.feedback` do GRADER, recorrigido
no loader, não de uma frase montada na tela: `AttemptItem` guarda só o número, e o kernel já sabe
dizer "faltou o acento". Recorrigir é determinístico e roda no servidor, onde a correção sempre
aconteceu.

**O rótulo de cada questão é o que o ALUNO fez** — "escuta", "montar frase", "escrita longa" —, não
a chave técnica. O rótulo era `` `${interaction.type} · ${itemSkills(item).join(' + ')}` ``, que
chega na tela como "cloze · writing"; `rotuloDoItem` é compartilhado com a `revisao`, que tinha o
mesmo problema.

**Sem feedback o aluno ainda vê o PERCURSO**: quantas respondeu, quanto levou, que tentativa é
esta. Nenhum acerto vaza nisso — são números que existem igual com o resultado ligado ou desligado
—, e a frase embaixo diz exatamente o que eles são. Antes ele recebia só "enviado", o que é verdade
e é pouco.

A retomada (`retomarTentativa` / `recomecarTentativa`) é real: "Continuar de onde parei" volta
para a primeira questão SEM resposta (não a seguinte à última gravada, senão pular uma deixa
buraco) e "Começar de novo" apaga a tentativa inacabada deste aparelho. Antes eram dois
`<form action="?/resume">` para ações que nunca existiram.

**O código de acesso NÃO sai do slug.** O slug está no link, então derivar o código dele
deixaria os dois públicos juntos — era assim que funcionava, e não protegia nada. O código são 4
letras sorteadas com `crypto` (`server/player/access-code.ts`), sem `I` nem `O` porque ditado em
aula eles viram 1 e 0. O professor pode digitar o dele; em branco, o servidor sorteia. A tela de
publicar mostra o código junto do link e do QR, que é como ele chega na turma.

**Com código, ele é a PRIMEIRA tela; o nome vem depois.** A entrada manda para `/codigo` quem ainda
não passou por ele neste aparelho (cookie de 24 h), e o código certo devolve para a entrada, que aí
pede o nome ou cumprimenta a conta. Era o contrário: o aluno digitava o nome, `iniciarTentativa`
mandava para o código, e o código certo devolvia para uma entrada vazia — o nome duas vezes. Quem
tem tentativa neste aparelho, pela metade ou terminada, não é barrado de novo para continuar ou
rever o que fez; começar outra passa pelo código. `/codigo` sem código a pedir volta para a entrada.

**Link indisponível tem quatro causas e quatro mensagens** (`a/[slug]/+error.svelte`, via
`page.error.reason`, tipado em `src/app.d.ts`): `notFound`, `unpublished`, `audioPending`,
`attemptLost`. Uma mensagem genérica deixa o aluno sem saber se erra o link, se espera, ou se
avisa o professor.

## Exemplo

`/exemplo` é o destino do "Responder um exemplo" da home: uma atividade de inglês de cinco
questões (ouvir e escolher, completar, montar, falar, ligar os pares) na casca do Player, para o
professor sentir o que o aluno recebe antes de criar conta. Pública (`hooks.server.ts`).

- **Itens de verdade, sem banco.** Moram em `$lib/server/exemplo`, no formato da tabela `Item`, e
  passam pelo mesmo `buildRuntimeItem` e pelo mesmo `grade` do Player. Uma demonstração desenhada
  à mão divergiria do produto no primeiro ajuste de correção. O gabarito fica no servidor como em
  qualquer atividade (`exemplo.test.ts` confere).
- **Nada é gravado**: sem nome, sem tentativa, sem professor. A seed é fixa (`exemplo`), então
  todo mundo vê a mesma ordem, e o veredito está sempre ligado, porque é o que se veio ver.
- **A fala é transcrita de verdade** (`exemplo/fala/+server.ts`, mesmo motor e mesmo
  `modo=ouvir` do Player) e descartada na mesma requisição; a tela diz isso sob o microfone. Como
  qualquer visitante pode gravar, ela tem teto por IP (20 transcrições em 10 min) e gravação de
  até 2 MB. A correção (`corrigirExemplo`) também tem teto por IP.
- Três telas na mesma rota: a entrada (o que vem pela frente e o aviso do microfone), as
  questões, e o fim com a trilha por item e a legenda em texto. A troca de questão é estado da
  página, não navegação: não há dado novo a buscar.
- **No fim, os planos abrem num modal** (`PlanosModal.svelte`, um `<dialog>` como o do avatar),
  depois de a tela final entrar: primeiro a pessoa vê como foi, depois quanto custa levar para a
  turma. É a MESMA `PlanosTabela`: sem conta o botão leva ao cadastro (trial); com professor
  logado vira pedido, como em `/planos`. Fechar devolve a tela final, que tem "Ver os planos".
- O celular da home tem **344 × 600, com a tela em `zoom: 0.85`** (home.md) e cada questão cabe nele
  INTEIRA, sem rolar — antes e depois de responder (`e2e/home.spec.ts` mede). Para isso a resposta
  vai `compacto`: o player de
  áudio numa linha só em qualquer tela (`AudioPlayer emLinha`), sem a dica de teclado do "montar",
  e, corrigida, sem as peças que sobraram e sem o microfone (não há como regravar ali).
- O celular da home usa as quatro primeiras questões (`QUESTOES_DA_HOME`) com os mesmos
  componentes (`EnunciadoDaQuestao`, `RespostaDaQuestao`, `RespostaDoExemplo`).
- O áudio da escuta é estático (`static/demo/exemplo-escuta*.mp3`), gerado pelo serviço de áudio
  com a voz que `vozDoTexto` escolhe para a frase. Mudar a frase pede gerar os dois de novo.

## O que falta

Rotas **ligadas ao banco** (loader real + remote functions): `(studio)/atividades`, as quatro
etapas do wizard, o editor de item, e as quatro telas do Player. O fluxo fecha ponta a ponta —
professor cola frases, gera itens, publica; aluno abre o link, responde e vê o resultado.

Continua **em mock** em `(studio)/conta` só encerrar a conta. Trocar senha é real (auth.md
"Senha": abre no próprio cartão, pede a senha atual e desconecta os outros aparelhos). O resto é real — o
nome salva (action `profile`), e a aba de assinatura pede plano, cancela no fim do período e mostra
o histórico (docs/adr-002-billing.md). Não há checkout nem portal porque não há gateway.

Cada tela declara em `$props()` a forma de `data` que espera e usa `withMock` como default.
**Atenção**: `withMock` só aceita o dado real quando ele traz TODAS as chaves do mock — um
loader que esquece um campo faz a tela cair no mock inteiro, silenciosamente.

Pendências dentro do que já está ligado:

- **O editor de questão** (`atividades/[id]/itens/[itemId]`) pergunta na ordem em que o aluno lê:
  o que ele FAZ, o enunciado, o que ele VÊ (ou ouve), a resposta certa (moldura âmbar, só o
  professor vê) e como é corrigida. O que dá para mudar é UMA lista de regras
  (`$lib/atividades/editor-item.ts`) que a tela e o servidor (`montarItemEditado`) usam — a tela
  não oferece o que o servidor recusaria. O que estava errado, e por quê:
  - **Salvar apagava a língua da resposta.** O `salvarItem` gravava `grading: { mode }` e um
    prompt montado só com quatro campos: salvar uma "traduza para o português" sem mudar nada
    tirava o `answerLang: 'source'`, a resposta passava a ser corrigida com as regras do inglês e
    ganhava o teclado do idioma alvo. Agora o que o formulário não edita é PRESERVADO (teste em
    `item-editado.test.ts`).
  - **A resposta principal vinha repetida nas variantes** (`readableAnswerKey`): corrigir "teh"
    para "the" deixava "teh" aceito.
  - **Seis modos de correção, e só um mudava a nota.** O corretor de digitar e de lacuna é sempre o
    tolerante; "exata", "sequência", "conjunto" e "ASR" só trocavam a dica, e "rubrica" numa
    questão de escolha desligava a correção dela. Hoje digitar oferece "Automática" ou "Você
    corrige" (escrita livre); os outros tipos dizem como são corrigidos, sem escolha.
  - **O seletor de prompt** deixava escolher "Imagem" e "Composto", que não existem (não há
    upload), e trocar texto por áudio sem gerar áudio. Saiu: o tipo de prompt é o do item.
  - **"Sugestão: aceitar também…"** propunha a resposta normalizada, que a correção já aceita
    sozinha — um clique que não mudava nada. Saiu; no lugar, uma linha diz o que a correção já
    ignora no idioma DA RESPOSTA (maiúscula, pontuação, acento).
  - **O enunciado padrão era congelado** como texto do professor a cada salvar, e trocando de tipo
    a questão levava "Ouça e escreva" para uma lacuna. Agora igual ao padrão não é gravado; o
    padrão acompanha o tipo; "Voltar ao padrão" desfaz uma personalização. Digitar com texto não
    tem padrão, e o professor escreve o dele.
  - **Sair perdia o que estava digitado.** "Próxima" é um link; agora o guarda barra a saída com
    "Salvar e sair", "Descartar e sair" ou "Continuar editando", e "mudanças não salvas" aparece na
    barra.
  - **O texto da questão** é editável só onde não descola do gabarito: num áudio de "monte" ou
    "escolha" as peças saíram dele, então ali ele é só leitura. Num áudio de digitar, a tela avisa
    quando o que o aluno ouve e a resposta esperada não batem, e mudar o texto pede o TTS novo ao
    salvar. O texto que existia não pode ser apagado — numa "traduza" ele é a própria questão.
  - **Lacuna**: selecionar a palavra na frase e "Lacuna na seleção" marca o buraco e preenche a
    resposta de uma vez (antes eram dois campos que precisavam bater). Lacuna → digitar passa a
    resposta para a frase inteira; "traduza para o português" não vira lacuna.
  - Questão descartada abre com o aviso e "Restaurar".
    Continua pendente o formulário campo a campo das outras seis interações (kernel.md "Nível 3"):
    nelas o gabarito aparece só para leitura, e trocá-lo é editar o material e gerar de novo.
- `Prompt.instruction` é o enunciado que o professor escreve no editor; sem ele vale a copy
  padrão da `instructionKey`. Quem resolve os dois num só é `promptInstruction()`
  (`server/player/runtime.ts`) — a prévia e o Player têm que mostrar a mesma frase.
- Sem rate limit por IP em `iniciarTentativa`/`responderItem` (server.md pede) — mesmo padrão
  provisório do formulário de contato.
- "Criar item do zero" nasce com um texto MARCADOR ("Escreva a frase e marque a lacuna com
  ___"), não vazio: `clozeAuthoringSchema` exige `masked` e `accepted` não vazios, e um payload
  que não valida rebenta em `toRuntime()` — ou seja, na tela do aluno. Por segurança a prévia
  isola item por item e `publicarAtividade` recusa publicar qualquer um que não valide, já que
  versão publicada é imutável e não teria conserto.

## Início

`(studio)/inicio` (o desenho "Studio Dashboard", variante 1b — "mapa da conta") é para onde o
**login** leva e o primeiro item do menu (no celular, a primeira aba; a conta saiu da barra de abas
porque o avatar do cabeçalho já leva a ela). O **cadastro** continua indo para `atividades`: com
zero atividades ela é o onboarding, e um início todo zerado não diz a quem acabou de chegar o que
fazer primeiro.

É uma tela de LEITURA, em grade: uma peça por área, cada uma com o número principal, um detalhe
visual próprio e uma linha de contexto, e a peça inteira leva à tela da área — as ações moram lá.

- **Topo**: o dia, "Bom dia/Boa tarde/Boa noite" no relógio de Brasília, e as duas criações sem
  botão na barra lateral — "Novo módulo" (`modulos?novo=1` abre o formulário) e "Criar com IA"
  (`materiais?novo=ia` abre a biblioteca já no modo da IA). **"Criar com IA" só aparece com
  provedor configurado E o plano deixando** (`acesso.pode.usarIa`); sem isso o principal é "Nova
  atividade" — um botão principal que leva a "não disponível no seu plano" é pior que nenhum.
- **Esta semana** (segunda a domingo): envios na fila até domingo (um por turma por dia, a unidade
  dos "Próximos 7 dias"), tentativas e acerto da semana, e as tentativas por dia em colunas. Cada
  coluna leva UMA marca — hoje, o dia mais movimentado, um dia com envio, nessa ordem — e a legenda
  só explica a marca que está na tela. O gráfico se anuncia por texto (`descricaoDasBarras`). Sem
  formas de ambiente: o cartão é gráfico e legenda de ponta a ponta.
- **Tentativas recentes**: as cinco últimas de todas as turmas, com avatar, sigla da turma, acerto
  (só das respostas corrigidas) e o estado — "para corrigir" em âmbar vence "em andamento" e
  "terminou". Cada uma abre a tentativa.
- **As seis peças**: atividades (no ar, as três editadas por último com o estado), módulos (a barra
  dos grupos — programado, envio que não saiu em vermelho, pausado ou concluído, sem programação — e
  o próximo envio), turmas (a fileira de rostos, quem tem avatar primeiro, e quem recebe e-mail),
  resultados (o acerto médio com as três faixas e o menor acerto), materiais (por tipo e quantos
  ainda cabem no plano) e assinatura (o plano, UMA barra — créditos de IA quando o plano tem, senão
  atividades — e quando renova ou termina).

**Os números são os das telas de cada área, nunca recalculados**: o acerto médio sai de
`listaDeResultados` (o mesmo de Resultados), o estado do módulo de `estadoDoModulo` (o mesmo da
lista de módulos), a agenda de `eventosDaAgenda`. A leitura inteira é `painelDoInicio`
(`$lib/server/inicio/painel.ts`), com teste de isolamento; a semana e a saudação são puras
(`$lib/inicio/semana.ts`).

Celular: uma coluna, e os três números da semana em três colunas sem o ícone. Tablet: duas
colunas, com a semana e as tentativas em largura inteira. A partir de `xl`, a grade de doze do
desenho (semana 8 + tentativas 4; peças 4·4·4 e 6·3·3).

## Resultados — e a correção

**A lista é uma TABELA** (o desenho "Studio Resultados v2"): uma linha por atividade publicada, com
tentativas, acerto médio (barra CURTA com certo/parcial/errado, para comparar linha com linha) e a
data da última tentativa. No topo, três números: atividades publicadas, tentativas e o acerto médio
PESADO POR TENTATIVA. Busca, ordem (menor acerto · mais recentes · mais tentativas) e **"Agrupar por
idioma"** (ligado de padrão, com a tag e os totais de cada idioma no cabeçalho do grupo) são de
tela. Menos de 3 tentativas avisa "pouco para ler". Atividade sem tentativa não vira número: a linha
diz "mandar o link" e leva ao detalhe da atividade, onde estão o link e o QR. O "CSV" é montado no
navegador com o que a tela mostra (`$lib/csv.ts`), sem endpoint.

A página de UMA atividade: números (tentativas, acerto médio, parcial), os itens por dificuldade com
o rótulo do que o aluno fez (`rotuloDoItem`, o mesmo do Player — nunca "type"), e à direita as
tentativas recentes com a sequência de questões em barrinhas. **Nenhuma das duas mostra versão** e
**nenhuma mostra a fila de correção**: o retorno do professor mora na tela da tentativa (abaixo).

**Não existe mais fila de correção.** `(studio)/correcao` foi removida: comentar e dar nota
acontecem na tela da TENTATIVA, em cima da própria resposta. A fila obrigava o professor a
decidir sem ver o resto do que aquele aluno respondeu, e as respostas que não eram por rubrica
não tinham onde receber um comentário nenhum. Clicar numa resposta abre o comentário ali; nas de
escrita por rubrica a rubrica (Não atende / Atende em parte / Atende) aparece junto.

**Na questão de fala ele OUVE o aluno** — quando o aluno autorizou guardar a gravação
(auth.md). O áudio aparece dentro da resposta, junto da transcrição, e as duas coisas ficam
lado a lado de propósito: o que o serviço ENTENDEU e o que ele DISSE são diferentes, e é na
diferença entre elas que mora o retorno de pronúncia.

**As gravações somem em 7 dias, e a tela avisa.** Um selo no topo da tentativa diz quantas e
quando — diferente do áudio da atividade, esta NÃO se regenera: é a voz de uma pessoa, gravada
uma vez. Se o professor for dar retorno de pronúncia, é dentro do prazo, e o aviso precisa estar
onde ele decide.

**A nota do professor é guardada SEPARADA da automática** (`reviewedScore`, nunca por cima de
`score`). É isso que deixa desfazer a correção manual sem recorrigir, e é a razão de existirem
as duas colunas em vez de uma.

**Zero numa resposta de rubrica é "ainda não corrigida", não "errou".** Ela conta como
_a comentar_, fica fora do acerto médio e não vira faixa vermelha em gráfico nenhum — chamar
isso de incorreto seria reprovar o aluno por uma fila do professor. O badge da barra lateral
segue `reviewedAt` nulo: pelo critério antigo (`score: 0`), a resposta continuava contando
depois de o professor ter dado zero a ela de propósito.

**Uma atividade republicada tem mais de uma publicação** (o slug antigo é arquivado, db.md), e as
tentativas de todas elas contam junto — senão o número do professor cai sozinho toda vez que ele
republica. A trilha por item de cada tentativa usa a versão que ELA respondeu, nunca a atual, ou
uma tentativa antiga apareceria com buracos que não existem.

**"Ordenados por dificuldade" é literal**: o que menos gente acertou vem primeiro, porque é o que
o professor revê na aula seguinte. Item ainda sem resposta vai para o fim — 0% ali é ausência,
não erro.

## Tags de idioma

Atividade, turma e material têm uma **tag de idioma** — o idioma que o aluno aprende, um por item
(`$lib/idiomas.ts`, que lê `languageLabels`: idioma novo no kernel aparece aqui sem editar nada).
Atividade sempre tem (`targetLang`); turma e material podem não ter, e aí a tag diz "sem idioma".

- **Um desenho em todo lugar** (`IdiomaTag.svelte`, components.md): lista e detalhe de atividade,
  lista e cabeçalho da turma, chamada de envio, biblioteca, seletor do wizard, linhas do módulo,
  busca do cabeçalho e resultados.
- **Filtros onde a lista mostra idioma** (`FiltroIdioma.svelte`): atividades e turmas (select),
  biblioteca e os dois seletores de "trazer"/"enviar" (chips). Só oferece os idiomas PRESENTES, e
  some quando há um só.
- **Os seletores nascem no idioma certo**: "trazer da biblioteca" no idioma da atividade, "enviar
  atividade" no idioma da turma — trazer frase de espanhol para atividade de inglês é quase sempre
  engano, mas não é proibido.

## Biblioteca de materiais

`(studio)/materiais` lista TUDO que o professor cadastrou, inclusive o que ele colou dentro de
uma atividade — é o caminho normal de o material entrar (db.md "ContentUnit.activities").

**"Novo material" abre uma bandeja** (`Bandeja.svelte`, components.md), não outra tela: cadastrar
não pode tirar o professor da lista, que é onde ele confere se o que acabou de digitar já estava
lá. O formulário dentro dela é o MESMO
`MaterialForm.svelte` da etapa 2 (ver "Studio" acima: cartões de tipo, rendimento, os três modos,
"o que o aluno vai ver"), e grava pelo MESMO `montarMaterial`
(`$lib/server/atividades/material-form.ts`) — cadastrar aqui e cadastrar lá dentro de uma
atividade não podem produzir dados de formas diferentes, senão "trazer da biblioteca" traria um
dado de outro formato. Um material salvo fecha a bandeja; o lote fica aberto mostrando quantas
linhas entraram, porque colar a lista seguinte é o gesto natural. Esc fecha.

**Cada material tem a sua tag de idioma** (`ContentUnit.targetLang`, ver "Tags de idioma" abaixo):
no wizard é a da atividade; na biblioteca o formulário tem o seletor "Idioma", que nasce no idioma
que o professor mais usa e vale também para a prévia (tokenizar, direção), para os rótulos ("Frase
em japonês") e para a IA. Material que já está em atividade tem o idioma TRAVADO, com o motivo
escrito. Sem tag, "sem idioma" — nunca um idioma inventado.

**Apagar um material não alcança atividade nenhuma.** Ele sai da biblioteca e dos rascunhos; o
que está no ar continua intacto, porque a versão publicada guarda uma cópia congelada (regra
nº 7) — e o ÁUDIO também, porque ele é identificado pelo conteúdo e escopado por professor, sem
ligação com o material (db.md "MediaAsset"). Houve uma versão em que havia essa ligação, e
apagar um material derrubava o link de uma atividade publicada para sempre. A tela diz isso
ANTES de perguntar.

Material é FACILITADOR de montagem: serve para o professor não redigitar a frase da aula
passada. Depois de gerada a atividade, nada nela depende dele.

## Sino do cabeçalho

`NotificacoesSino.svelte`, no topo do desktop e do celular, no lugar do ícone que só acendia um
ponto. O número é o de não lidas, na cor da MARCA (vermelho é erro, e "tem algo novo" não é); abrir
mostra as últimas vinte, as não lidas primeiro, cada uma com o que aconteceu, uma linha de contexto
e "há 2 h". Abrir uma a marca como lida e leva à tela onde a coisa se resolve — o sino aponta, não
resolve. Atualiza ao abrir e a cada minuto com a aba à vista. O que entra e o que fica de fora:
`docs/notificacoes.md`.

**Os mesmos avisos numeram a barra lateral**: Resultados (quem terminou, em azul, ao lado do âmbar
de "para corrigir"), Turmas (quem entrou com a conta), Atividades (áudio que falhou, em vermelho),
Escola e Assinatura. Abrir a tela de destino conta como ver — a página marca quando monta, nunca o
loader, por causa do pré-carregamento ao passar o ponteiro —, e a lista de Resultados mostra
"N novas" na atividade onde está a novidade (docs/notificacoes.md "Na barra lateral").

## Busca do cabeçalho

Uma caixa para as três coisas que o professor procura — atividade, material e turma —, com o
resultado em bandeja e **a categoria escrita em cada linha**: "Present perfect" pode ser o título
de uma atividade e o começo de um material, e sem o rótulo os dois ficam iguais na lista. Os
chips da bandeja filtram por categoria.

A consulta é do servidor (`buscarNoStudio`), escopada por `teacherId` nas três tabelas — buscar
sem escopo seria o vazamento mais fácil de escrever do produto inteiro. Duas letras no mínimo, e
um atraso de 220 ms: uma ida por tecla seria uma consulta por letra sem ganho nenhum. Resposta
que chega fora de ordem é descartada, senão a consulta lenta sobrescreve o resultado da rápida.

Material não tem tela própria — o resultado leva à biblioteca, onde ele se edita. Atividade e
material são buscados de formas diferentes por um motivo de banco: título é coluna, o conteúdo do
material é `jsonb` e este produto mistura idiomas na mesma tabela (db.md), então o filtro de
texto do material acontece em memória, sobre um teto, nunca sobre a biblioteca inteira.

## Turmas e alunos

A regra que atravessa tudo: **convite e link aberto coexistem**. Cadastrar a turma serve para o
aluno chegar com o nome certo no relatório e para o professor não redistribuir link toda semana
— nunca para trancar quem não está cadastrado. Nenhuma tela transforma o envio por e-mail no
caminho obrigatório, e aluno anônimo nunca é apresentado como erro ou dado incompleto.

**Aluno é cadastro, não conta.** Ele não tem senha e nunca faz login. A identidade dele no
Player é o token do convite (`e/[token]`), que grava um cookie por publicação — o cookie não dá
acesso a nada do professor nem a outra atividade. `Student.email` é canal, não credencial, e é
opcional: aluno sem e-mail existe na chamada e nos resultados, só não recebe convite.

**Responder sem conta e aparecer com o nome certo são as duas coisas ao mesmo tempo.** A
tentativa nasce com `studentId` nulo — que é o caminho normal — e vale igual no relatório. Abrir
o link pessoal depois VINCULA as respostas já feitas naquele aparelho (`claimAttempts`, casando
por `anonId` + publicação): o que muda é o nome na lista, não o que foi respondido. Quem chega
pelo link pessoal não digita nome nenhum: a entrada cumprimenta e oferece "não sou eu", que cai
de volta no fluxo anônimo — aparelho de laboratório é compartilhado.

**A gravação de voz é guardada só com autorização, pedida na ENTRADA.** Um checkbox
desmarcado, antes da primeira questão, e só quando a atividade tem questão de fala — numa
atividade de leitura a pergunta seria ruído, e pior: um pedido de permissão sem motivo ensina a
marcar sem ler. O prazo (7 dias) vai escrito no rótulo, não atrás de um link de política: quem
está prestes a gravar a própria voz merece saber quanto tempo ela fica, na mesma linha em que
decide. Sem a marca o exercício funciona igual — a fala é transcrita, corrigida e descartada.

**A conta do aluno é OFERTA, nunca exigência — mas oferta VISÍVEL.** Na entrada da atividade ela
aparece DEPOIS do campo de nome, num cartão com dois botões de verdade ("Entrar" e "Criar conta")
e "É opcional" escrito; quem já está logado vê "Ver minhas atividades" como botão, não como link
de 12px no fim de uma frase cinza — ninguém achava por onde entrar. Um convite antes do campo
leria como pré-requisito, que
é o oposto do produto. Quem está logado não digita nome — o da conta vale — e quem não está segue
o caminho de sempre. A retomada ganha da saudação (o que importa ali é continuar), mas quem
entrou depois de começar vê uma linha dizendo em qual conta está, senão parece que o login não
pegou. Regras da identidade, do vínculo e dos guards: `auth.md` "A conta do aluno".

A chamada marca **"com conta"** quem já ligou as duas coisas, e **"convidado"** quem recebeu o
convite para a conta por e-mail e ainda não entrou. No cabeçalho da chamada, "Convidar os N sem
conta" manda o convite a quem tem e-mail e ainda não tem conta — sempre com a contagem. É informação, não estado: aluno com
conta e aluno sem conta participam igual, e por isso não entra na contagem de estados nem muda o
que o professor pode fazer. O e-mail da conta pode ser outro que não o digitado pelo professor —
os dois são verdade e a tela mostra o do cadastro com o da conta no `title`.

**Clicar no nome de um aluno abre o histórico dele** (`alunos/[id]`), de qualquer lista. Olhando
a chamada, a pergunta seguinte é "como este aqui está indo" — o nome é link em toda lista, e a
linha inteira não vira link onde já existe o botão de apagar dentro (âncora dentro de âncora não
existe). A tela é o MESMO molde da turma: um cartão de cabeçalho com as formas de ambiente, as
ações e os quatro números (tentativas, terminadas, acerto médio em azul, turma), depois o
histórico por atividade como TABELA — quando, respondidas, a distribuição certo/parcial/errado
com os três números escritos, e o acerto — e, por último, a caixa que diz **em texto** que só o
que está LIGADO a ele aparece ali: responder pelo link aberto sem abrir o pessoal continua valendo
para a turma e fica sem dono. A média é só das tentativas TERMINADAS — e a regra vai escrita sob
o número ("só das terminadas"): incluir quem parou na segunda questão puxaria o número para
baixo por um motivo que não é desempenho.

**"Editar cadastro" mora aqui também**, na MESMA bandeja da chamada (`turmas/EditarAluno.svelte`):
corrigir um e-mail digitado errado a partir da ficha exigia voltar à turma, achar a linha e abrir a
edição lá. Quando o aluno tem conta, um cartão mostra os DOIS e-mails lado a lado
("no seu cadastro" / "na conta") com a frase que resolve a dúvida: os dois são verdade, o
convite vai para o do cadastro e a entrada é com o da conta.

**Vincular a tentativa troca o nome dela.** `claimAttempts` grava `studentId` **e** `name`: sem o
nome, a tentativa ficava ligada à Juliana e continuava listada como "ju", que é exatamente o que
o link pessoal existe para resolver. O que foi respondido não muda — muda de quem é e como
aparece. Quando o nome digitado sobrevive diferente do cadastro, a tela do aluno mostra
"respondeu como …" em vez de esconder: o professor precisa entender de onde a linha veio.

**Os estados de aluno** têm texto próprio e ícone, nunca só cor: Vai receber, Enviado,
Disponível, Começou, Terminou, Sem e-mail e Voltou. **"Disponível" é o envio de módulo sem e-mail**
(`Delivery.porEmail` falso): a atividade abriu no mapa e o link pessoal existe, mas ninguém foi
avisado — "Enviado" ali afirmaria um e-mail que não saiu; o cartão do envio diz "no mapa, sem
e-mail" no lugar de "não abriram", e o "Reenviar para quem não abriu" some. **"Sem e-mail" é sobre o CADASTRO; "Vai receber" é sobre a turma
ainda não ter recebido nada** — juntar os dois marcava como "sem e-mail" um aluno que tem e-mail
e só não foi convidado ainda. Verde e âmbar ficam FORA (são a semântica de correção, e
"terminou" não é "acertou"); vermelho aparece só em Voltou, o único que pede ação. As etiquetas
de cor das turmas seguem a mesma regra: azul, teal, violeta, magenta e ardósia.

**A turma aberta tem o mesmo cartão de cabeçalho da atividade** (`HeaderCard.svelte`): etiqueta,
nome, idioma e data de criação, "Editar turma" (a bandeja de nome, idioma e cor, por `editarTurma`)
e "Enviar atividade", com os quatro números embaixo — alunos, com e-mail (em
azul: é o que recebe convite), atividades enviadas e e-mails que voltaram. Depois vêm os outros
dois blocos NA MESMA rolagem — a chamada e as atividades enviadas —, e só no celular um seletor
escolhe qual aparece, para a tela não virar uma rolagem infinita.

**Criar e editar abrem em BANDEJA** (`Bandeja.svelte`, components.md): nova turma (sobre a lista),
editar turma, adicionar aluno, editar cadastro e enviar atividade. Eram formulários que abriam no
meio da página empurrando a chamada para baixo; agora a chamada fica à vista atrás do véu. **O
idioma da turma é um SELETOR das tags do produto** (`campoIdioma`), igual em criar e editar: foi um
campo de texto livre, e qualquer rótulo que não fosse exatamente o cadastrado derrubava o salvar com 500. "Adicionar aluno" fica aberta depois de adicionar e lista quem entrou naquela rodada — cadastrar
uma turma é um nome depois do outro. **Ela pergunta como o convite para a CONTA chega** — "Por
e-mail" (o Spokke manda; o e-mail vira obrigatório) ou "Eu mando o link" (o e-mail continua
opcional) —, e cada aluno de "Entraram agora" tem "Copiar link". A escolha vale para a rodada
inteira. Toda recusa do servidor é ESCRITA no rodapé da bandeja: "Enviar"
recusado (áudio não pronto, atividade arquivada) diz o motivo, em vez de o clique parecer não fazer
nada.

**A chamada é uma tabela**: aluno, e-mail em mono (ou "sem e-mail" em itálico), a pílula do estado
no último envio e até quatro ícones por linha — o convite para a conta (só em quem não tem conta: a
bandeja `turmas/ConviteDeConta.svelte`, com o link para copiar, "Mandar por e-mail" e "Gerar outro
link"), e — reenviar só para aquele aluno (`reenviarConvite`),
editar nome e e-mail (`salvarAluno`, na bandeja, com a chamada atrás) e apagar — que confirma NA LINHA,
com a consequência escrita, e não no `confirm()` do navegador. Embaixo, "Mostrando N
de M" e a legenda dos estados, com o quadradinho da cor de cada um. **E-mail que voltou ganha uma
faixa vermelha por aluno** acima da tabela, com "Corrigir e-mail e reenviar": abre a bandeja de
edição com o aviso do e-mail que voltou e a caixa "Reenviar o convite ao salvar" já marcada — o
reenvio é uma escolha visível, não um modo escondido do botão. É o único estado que pede ação, e
escondê-lo dentro da pílula deixava o professor descobrir pelo aluno que o convite nunca chegou.

**"Atividades enviadas" são cartões clicáveis** (abrem o resultado da atividade): título, uma
pílula dizendo se todos abriram ou quantos não, "há N dias · N convites", abriram/terminaram em
mono e uma barra com dois segmentos — quem terminou e quem começou e parou.

**Reenviar é renovar o token E enfileirar o e-mail.** Houve uma versão em que `reenviarNaoAbertos`
só trocava o token, e o efeito era o pior possível: o link antigo parava de valer e nenhum novo
chegava. Os dois reenvios (`reenviarNaoAbertos`, por envio, e `reenviarConvite`, por aluno)
remontam o MESMO job de e-mail do envio original a partir do que o convite carrega.

**A lista vazia de turmas é um hero, como a de atividades**: eyebrow, título, o ganho em uma
frase, a caixa dizendo que não é obrigatório, e dois caminhos — criar do zero ou "Colar uma lista de
alunos", que abre a bandeja já no modo colar. Quem chega de fora usa `turmas?nova=1` (ou
`?nova=lote`); o antigo `turmas/nova` é só um redirecionamento para isso. O vazio é escolha
legítima do professor, não pendência.

**"Nova turma" pergunta na ordem da decisão**: QUAL é a turma (nome, idioma, cor — a etiqueta do
cabeçalho da bandeja muda junto, é como ela vai aparecer na lista) e, num bloco separado, QUEM está
nela, com "opcional · dá para adicionar depois" no título do bloco. O rodapé diz quantos alunos
entram e quantos vão receber convite.

**Prévia antes de criar.** No modo colar, a tela usa o MESMO `parseAlunos` do servidor e mostra
cada linha que fica de fora com o número da linha e o motivo. Linha só com o nome não é erro.

**Escolher a atividade acontece na turma**, não fora dela: o botão "Enviar atividade" abre a
bandeja com as atividades PUBLICADAS (`atividadesPublicadas`), busca pelo título e o filtro de
idioma. **A lista ESCOLHE (rádio) e o rodapé envia**: cada linha tinha o seu "Enviar para 22", e um
clique distraído mandava trinta e-mails; agora o rodapé diz qual atividade e para quantos antes do
botão. Mandar o professor para a
lista de atividades o deixava sozinho, e ele voltava sem ter enviado. Rascunho não aparece:
enviar um rascunho daria ao aluno um link que não existe.

**Publicar reseta o formulário.** O `bind:value` do campo de link zerava o slug junto, e a
publicação seguinte saía com o campo vazio — o schema recusava com "expected string to have >=3
characters" e nada aparecia na tela. O valor é restaurado no `enhance`.

**"Editar atividade" abre uma cópia editável do que está no ar.** O loader de `revisar` chama
`draftFromPublished`, não `draft`: publicar apaga o rascunho, e sem isso a tela abria vazia —
o professor clicava em editar e a atividade dele sumia. A versão no ar continua intacta.

**Os filtros da lista de atividades filtram.** Todas / Publicadas / Rascunhos eram três chips
DECORATIVOS — nenhum `onclick`, e o primeiro sempre pintado como ativo. O loader manda a lista
inteira e a tela filtra e pagina em cima dela (8 por página, `Pagination.svelte`): é dado do
próprio professor e a troca fica instantânea. O "Ver todas" ao pé da tabela, que também não
fazia nada, deu lugar à paginação de verdade.

**Abrir uma atividade da lista leva ao DETALHE, não aos resultados.** `atividades/[id]` responde
"o que é isto": estado, as questões numa lista clicável (cada uma abre o editor dela), link, QR,
código e para quais turmas foi, com os números de cada envio. Antes a lista pulava direto para
`resultados/[activityId]`, que responde "como foi" — a pergunta seguinte, e numa atividade sem
nenhuma tentativa uma tela vazia. Os resultados continuam a um clique, no cartão de respostas e
no botão do cabeçalho.

É uma tela de LEITURA: toda ação leva para onde ela já existe (o wizard para editar, a etapa de
publicar para reenviar, os resultados para o relatório), e nada é editado no lugar.

**Uma coluna, seis blocos, nesta ordem**: o cartão de cabeçalho (`HeaderCard.svelte`: ícone,
título, "idioma · criada em DATA · editada há N dias", "Editar no wizard" e "Enviar para turma",
e os quatro números — questões, tentativas em azul, terminadas, turmas que receberam), o
cartão de estado e áudio, "Como a turma entra" (QR, link e código NUM cartão só — são três formas
do mesmo endereço, e separados pareciam três coisas), as questões e "Quem recebeu e quem
respondeu". Havia uma segunda coluna de contexto; ela empurrava o QR para um canto e o
professor rolava a página procurando o link.

**O cartão de estado tem uma pílula e uma frase sobre o ALUNO** ("O link responde. Quem abrir
agora faz exatamente esta versão."), e nos dois estados que não são "no ar" o botão de publicar
mora nele — é o cartão que diz que falta publicar, então é ele que oferece. A linha do áudio vem
embaixo, no mesmo cartão: neutra quando está pronto, vermelha quando falta — e só aí aparece
"Gerar áudio de novo", com o custo dito na linha seguinte (o link
sai do ar por alguns minutos).

**As questões são uma tabela**: número em mono, o que o aluno faz, uma pílula de TIPO (escuta,
fala, escrita, escolha, montar — `tipoDoItem`, que sai do prompt e da interação juntos) e a
habilidade derivada. Cada linha abre o editor do item. A contagem por habilidade cabe na linha do
título ("3 questões · Leitura 3, Escrita 3"): o bloco "Habilidades treinadas" que vinha depois
repetia a coluna da tabela e saiu. "Quem recebeu e quem respondeu" abre com a distribuição das
respostas (barra com as três faixas e a legenda em porcentagem) e lista os envios por turma com
abriram/terminaram e uma barra do que terminou.

**O cartão de estado diz também como está o ÁUDIO.** Ele é a única parte da atividade que vive
fora do banco — num bucket — e portanto a única que pode estar faltando sem nada na tela avisar
(síntese na fila, job que falhou). É aqui que o professor volta dias depois para reenviar o link,
então é aqui que ele precisa ver "faltam 4 de 10" antes de mandar para a turma. Atividade sem
questão de escuta não mostra linha nenhuma: "0 de 0" seria inventar um problema. **O áudio não
vence** (server.md "TTS"): pronto, a linha diz que os arquivos ficam enquanto a atividade existir.
Houve um aviso "vence em N dias", âmbar a três dias do fim; ele saiu junto com o prazo.

**"Gerar áudio de novo" só aparece quando o áudio FALTA.** Numa atividade
saudável o botão era ruído, e pior: um convite a refazer trabalho já feito, deixando o link fora
do ar por alguns minutos à toa. Regerar deixa o link fora do ar enquanto a fila anda, e a tela
diz isso antes.

**Áudio faltando barra as duas saídas.** O link não abre (503 `audioPending`) e o envio para as
turmas é recusado — mandar trinta e-mails de uma atividade que não responde é fazer a turma
inteira bater numa porta fechada. As duas checagens são de SERVIDOR (server.md "TTS"): a tela
avisa, mas não é ela que impede.

O estado segue os mesmos três nomes do resto do produto — **no ar**, **mudanças por publicar**,
**rascunho** —, e cada um diz o que o ALUNO encontra ao abrir o link, que é a pergunta que o
professor tem ali. **No rascunho nunca publicado não há link nenhum**: o bloco "Como a turma
entra" vira uma caixa dizendo que o link, o QR e o código nascem na publicação, com o botão de
publicar — mostrar um endereço que ainda não abre era o que o professor colava no grupo.

**Clicar numa questão abre o editor dela, inclusive numa atividade no ar.** A tela lista a versão
PUBLICADA, e o editor trabalha no rascunho — os ids são de linhas diferentes, então o link dava 404. O loader do editor resolve isso: id que não está no rascunho é procurado na versão no ar e,
se estiver lá, ele abre a cópia editável (`draftFromPublished`) e redireciona para o item
EQUIVALENTE. O que liga um id ao outro é a POSIÇÃO — o clone copia na mesma ordem —, nunca o id.

**O professor não escolhe o link.** O endereço sai do id da atividade (`server/player/slug.ts`),
e por isso é único por construção e estável entre publicações. Antes havia um campo de slug, uma
consulta de disponibilidade a cada tecla e um erro possível na publicação — três coisas para
decidir um texto que ninguém lê: quem recebe o link clica nele ou lê o QR. A tela mostra o
endereço pronto com "Copiar" — **só depois da primeira publicação**. O endereço até existiria
antes (sai do id), mas um link visível que ainda não abre é um link que vai para o grupo da turma
antes da hora; a etapa 4 e a tela de detalhes dizem que ele é criado ao publicar, e o mostram na
hora em que isso acontece. **O que a tela mostra é o slug que está NO AR** (`publicacao.slug`),
não o derivado: atividades publicadas antes de o endereço passar a sair do id têm outro slug, e
mostrar o derivado era projetar um QR que respondia 404.
`publicarAtividade` não aceita `slug` no schema: aceitar um do cliente seria aceitar que alguém
escolhesse o endereço de outra pessoa por um POST direto.

**O botão de publicar tem três textos, e nenhum deles é um número.** Nunca publicada é
"Publicar"; no ar com mudanças pendentes é "Publicar mudanças"; no ar e sem nada pendente o
wizard ACABOU — a ação é **"Concluir"**, que fecha o fluxo e leva para a lista de atividades.
Mandar de volta para "Editar atividade" ali era devolver o professor ao começo do que ele acabou
de terminar; editar continua a um clique pelo "Revisar" do cabeçalho e pela lista. O loader
entrega `published` (no ar e limpa) e `jaNoAr` (existe link no ar) — nunca `nextVersion`. Na
lista de atividades e no cabeçalho de resultados o mesmo vale: o badge é "No ar", não "v3 no ar",
e o filtro por versão saiu da tela de resultados.

**Publicada, a etapa 4 vira uma tela de desfecho.** Sem nada a publicar, o formulário não teria
como ser enviado, então os interruptores de código e de resultado dariam a impressão de mudar
algo — eles viram o RESUMO do que está valendo, e mudar passa por editar e publicar de novo. O
aviso "isto cria/atualiza o link" some junto: ele descreve o efeito de publicar, e ali não há o
que publicar.

**O QR tem lugar próprio, em tamanho de projeção.** É como a atividade chega numa sala de aula
— o professor projeta e a turma aponta a câmera —, e a 66px dentro de outro cartão ele era
ilegível a três metros do quadro. Ele ocupa a coluna esquerda do cartão "Como a turma entra", num
quadro branco de 240px, esmaecido no rascunho (existe, só não abre ainda); no celular passa a
ocupar a largura inteira acima do link, porque projetar é justamente o que se faz com o celular
na mão. Houve botões de "Compartilhar" (`navigator.share`) e "Baixar" ao lado dele; saíram no
redesenho — o link com "Copiar" é o caminho, e o QR se salva pela própria tela.

**Envio é assíncrono.** Os convites saem pela fila (`type: 'convite'`), e a confirmação dá o
número real e diz que a fila está andando — nunca que chegou. Reenvio é ação separada e sempre
com contagem; ele TROCA o token (o link antigo para de valer) E enfileira o e-mail de novo. Sem
`EMAIL_PROVIDER` o convite vai para o log do servidor com o link inteiro, mesmo padrão do TTS.

**Privacidade (vale como requisito de tela).** O cadastro pede nome e e-mail e mais nada. A tela
da turma tem caminho visível para apagar um aluno e para apagar a turma, com a consequência
dita em texto. Apagar leva junto as respostas do aluno CADASTRADO; as tentativas feitas pelo
link aberto têm `studentId` nulo e não são tocadas (`onDelete: SetNull`).

## Conta e assinatura

Uma tela, duas abas no TOPO (`conta` e `conta?aba=assinatura`; `/assinatura` só redireciona,
porque a barra lateral, o cartão de trial e qualquer link antigo apontam para lá). Abas laterais
seriam uma segunda navegação vertical ao lado da barra do Studio, disputando o mesmo olhar. A aba
vem da URL, não de estado de componente: é o que deixa a barra lateral apontar direto para a
assinatura.

**O topo é o da CONTA, não o de uma aba** — o mesmo `HeaderCard` das telas de turma e de atividade:
o avatar grande (com "Montar avatar" ao lado), o nome, o e-mail, "no Spokke
desde…" e quatro números (atividades, materiais, turmas, alunos). No celular, uma informação por
linha. As abas vêm depois dele.

**"Seus dados" são duas colunas no desktop**: o formulário à esquerda (nome e e-mail lado a lado,
os idiomas que ensina em chips, a língua dos alunos e o "Salvar alterações" no rodapé do cartão) e,
à direita, Senha e Encerrar conta empilhados. O e-mail é TEXTO, não campo somente-leitura — como
campo ele parecia editável e não era. **A assinatura** é o plano em largura inteira, o uso em
BLOCOS que dividem a linha (no trial entra o bloco dos dias que faltam) e, lado a lado, "O que
você pode fazer" e o histórico em linha do tempo. No celular, tudo numa coluna, na mesma ordem.

**O perfil tem dois dados além de nome e e-mail, os dois opcionais e os dois PADRÕES**: os idiomas
que o professor ensina (o primeiro vira o alvo da atividade nova; com um só, a turma nova nasce
nele; sem material ainda, a biblioteca também) e a língua dos alunos (a "língua do aluno" da
atividade nova). Os idiomas podem ser escolhidos já no cadastro. Nada mais foi pedido de propósito:
escola, telefone ou faixa etária não teriam uso no produto, e a política promete o mínimo.
`Teacher.idiomas` guarda a ORDEM: salvar pela conta mantém o primeiro onde estava. Senha e Encerrar conta têm cada um o seu cartão, e o de encerrar diz em texto o que
a tela AINDA NÃO SABE (o destino dos links publicados, Apêndice A) em vez de afirmar qualquer
coisa.

**Senha e Google.** O cartão "Senha" troca a senha de quem tem uma; quem nasceu pelo Google não tem
senha atual para conferir, e o cartão manda o link de criar uma (o mesmo de "esqueci a senha"). O
cartão "Entrar com o Google" (`LigarGoogle.svelte`, só com o Google ligado no servidor) liga o
Google na conta — é para onde a tela de entrar manda quem tentou o Google num e-mail com senha — e
desliga quando sobra a senha (auth.md "Login com Google").

**"Seu avatar" vem ANTES de nome e e-mail**, e é a única ação desta tela que já grava de verdade
(`gravarMeuAvatar`, em `studio.remote.ts`). A ordem não é arbitrária: o avatar é o que o ALUNO vê
— ele aparece na turma e no convite —, e nome e e-mail são o que o professor confere. Dezoito
números, nunca imagem (`$lib/avatar/montar.ts`) — o que NÃO se escreve na tela; "Montar avatar",
no topo ao lado do avatar, abre o `AvatarEditor`, e sortear acontece lá dentro (o "Sortear" do
palco). Houve um "Sortear outro" ao lado dele, que gravava direto; saiu.

**Assinatura** desenha as situações do `ResumoDoAcesso` — trial (com os dias que faltam), ativa
(ou "encerra no fim do período"), renovação pendente (carência), pausada (trial ou plano vencido),
cancelada e plano da escola —, cada uma com pílula, título e uma frase. O pedido de plano pendente
aparece ANTES, num aviso com "Cancelar pedido": sem gateway, escolher um plano não libera nada sozinho.

Depois: **"Seu uso agora"** (atividades, materiais e créditos contra o limite, com a regra escrita —
arquivar ou apagar libera vaga), **"O que você pode fazer"** (de `can()`, a mesma decisão que
barra cada botão, numa grade de quatro; "links publicados e respostas nunca param" virou a frase
da seção, porque eram duas linhas sempre verdes) e o
**histórico** real (`AuditEvent`) no lugar de uma lista de faturas inventada.

Ações reais: "Escolher/Trocar de plano" leva a `/planos`; "Cancelar no fim do período" e
"Desfazer cancelamento"; "Sair da escola" para quem tem o plano da escola. Encerrar agora é decisão da
equipe (painel interno).

## Planos e preços

`(site)/planos` é DOIS lugares ao mesmo tempo: a página pública de comparação, e **o destino de
quem bateu numa porta fechada** — tentou publicar sem assinatura, pediu material com IA, abriu
algo que o plano não cobre. Aí ela chega com `?motivo=`, e a primeira coisa na tela é a resposta
para "por que eu vim parar aqui", não a tabela: cair numa página de preços sem entender o que se
pediu tem uma leitura só, e é a pior — "quebrou e me jogou na cobrança". O aviso diz também o que
NÃO se perdeu (o rascunho continua salvo, os links continuam no ar).

**`motivo` é validado contra uma LISTA FECHADA** no loader, como o `?voltar=` da prévia: um
parâmetro de query que vira texto na tela é texto que qualquer pessoa escolhe.

A tabela é **UM componente** (`PlanosTabela.svelte`, um CARROSSEL que abre no Pro — components.md),
usado na home (seção `#planos`), no modal do exemplo e aqui —
duas cópias divergiriam no primeiro ajuste de preço. Quem tem o plano marcado ganha "Seu plano
agora", e esse selo VENCE o "o mais escolhido": propaganda no cartão de quem já assinou aquele
plano é propaganda para dentro.

**Os planos são Básico, Pro, Super e Scholar**, e os NÚMEROS de cada um saem de
`$lib/billing/catalogo.ts` — o mesmo arquivo que decide o acesso; `catalogo.test.ts` garante que o
cartão não promete outra coisa. **Os PREÇOS saem de `$lib/billing/precos.ts`** (o que o checkout
cobra); o Scholar não tem preço na tela, só "Sob proposta" e o contato.

O CTA depende de quem lê: logado, ele chama `solicitarPlano` pela página (`onescolher`) — sem gateway,
registra um pedido e a tela diz que a equipe vai entrar em contato; deslogado, leva ao cadastro; o
Scholar leva sempre ao contato com `?assunto=escolas`. O componente não conhece remote function: a
página decide o que "escolher" faz.

**Com o Mercado Pago, quem já paga um plano por ele TROCA** (billing.md "Troca de plano"): o cartão
do mesmo plano e ciclo diz "Seu plano agora" e não tem ação (renova sozinho), e os outros dizem
"Mudar para o Super" / "Mudar para o anual" ("Assinar de novo" quando a renovação foi cancelada),
com a linha de baixo dizendo o que acontece: ciclo novo hoje, com o valor cheio, e a parte não
usada do plano atual de volta no cartão. A conta da equipe vê os cartões sem ação. Recusa do
servidor (mesmo plano, equipe, provedor fora) aparece escrita acima da tabela.

Motivo de LIMITE (`criar`, `materiais`, `creditos`) mostra "seu plano permite N, você tem M" e o
caminho (arquivar uma atividade, abrir a biblioteca), nunca "sua assinatura está ativa".

## Módulos

Os briefings são `docs/telas-modulos-professor.md` e `docs/telas-modulos-aluno.md`; as decisões, a
atualização de `docs/adr-004-modulos-e-nivel.md`.

`(studio)/modulos` (o desenho "Studio Modulos v2") responde três perguntas sem abrir nada: **o que
precisa de mim** (um aviso no topo, o único vermelho da tela: o envio que não saiu há mais tempo, com o
atalho para resolver e, se a mesma atividade vai para outra turma nesta semana, isso escrito), **o que
sai esta semana** (os "Próximos 7 dias" de TODOS os módulos) e **como cada módulo anda em cada turma**.
Cada cartão tem a pílula de estado do módulo (envio programado, que não saiu, pausado, tudo enviado,
sem programação, sem turma — vermelho só no que não saiu), a sequência numerada (no ar em azul,
rascunho tracejado), os 7 dias daquele módulo e uma linha por turma: ritmo, enviadas (barra e "2 de 8"),
próximo envio e quantos terminaram a última. Filtros com contagem e busca por módulo **ou** turma são de
tela. Criar e editar são a MESMA bandeja (`modulos/ModuloBandeja.svelte`): nome, descrição e a
etiqueta de cor já com a sigla — e, ao criar, as atividades, opcionais, na ordem em que forem
marcadas (o módulo nascia vazio e a primeira coisa a fazer no módulo aberto era abrir outro
seletor). O "⋯" do cartão edita (a bandeja), duplica (atividades e ordem, **nunca** turmas nem programação — duplicar não
manda e-mail) e apaga com a consequência escrita antes. O vazio é um hero com os três passos.

**Os "Próximos 7 dias" são um componente** (`SemanaDeEnvios.svelte`): um cartão por turma por dia (é
uma liberação por turma por data), o dia com liberação largo e o vazio estreito, rascunho tracejado e com o
aviso escrito, e cada cartão abre a programação daquela turma. No celular a faixa rola de lado. Os
eventos saem do banco (`ModuleSend`, via `$lib/server/modulos/agenda.ts`), não de uma conta na tela:
o que já saiu aparece no dia em que saiu, o programado no dia marcado, e **programação pausada fica
fora** — mostrar as datas dela seria prometer o que não vai acontecer.

`(studio)/modulos/calendario` (o desenho "Studio Calendario") junta todos os módulos e turmas num mês:
cada envio na cor do MÓDULO com a sigla da TURMA; rascunho com contorno, enviado neutro, vermelho só no
que não saiu. Clicar num dia abre o detalhe ao lado, e cada envio leva à programação da turma — o
calendário é LEITURA, mudar uma data é na programação. Filtros de módulo (chips), turma e "mostrar
enviados" valem para a grade e para a lista; "Mês | Lista" no desktop, e no celular só a lista (por
CSS, sem trocar uma pela outra na hidratação). As pausadas aparecem em "Fora do calendário".
`?modulo=` abre só com aquele módulo (o "Ver no calendário" do módulo aberto) e `?mes=AAAA-MM` noutro
mês; valor que não é do professor é ignorado.

`(studio)/modulos/[id]`, nesta ordem: cabeçalho (atividades, no ar, turmas, próximo envio; "Editar
módulo" abre a mesma bandeja da lista); o aviso do envio que não saiu, com o motivo e o atalho para resolver; os
**"Próximos 7 dias"** daquele módulo em todas as turmas, com "Ver no calendário";
**"Atividades, na ordem"** (arrastar **e** setas, como "ordenar" do Player — é a ordem do e-mail e do
mapa do aluno, e reordenar muda só o que ainda não saiu; "Acrescentar atividades" é uma bandeja com
o `SeletorDeAtividades`); **"Turmas do módulo"** (só turma alocada recebe envio; "Adicionar turmas"
é uma bandeja de seleção MÚLTIPLA, com o tamanho e o idioma de cada turma, e nada é enviado ao
adicionar; tirar a turma diz as três consequências antes); **"Liberações"** (o que já abriu, por
atividade e turma, com abriram/terminaram); "Ver como o aluno vê"; e apagar.

**A programação abre numa bandeja** (`ProgramacaoPainel.svelte` sobre `Bandeja.svelte`), a partir
da linha da turma ou de `?turma=<alocação>` (é para onde a tela da turma leva). A frase do
cabeçalho diz a regra que mais confunde: datas valem ao salvar; liberar agora e pausar valem na hora.
**Módulo não manda e-mail: ele LIBERA** — na data, a atividade abre no mapa de quem tem conta
ligada à turma (houve uma escolha "por e-mail ou só disponibilizar"; o e-mail saiu a pedido do dono
do repositório, e uma linha no topo do painel diz isso). Três partes, cada uma uma pergunta:
**quais** (um resumo "4 de 4" que abre a lista em "Escolher": os títulos já estão
na prévia, uma vez só; desmarcar tira a atividade desta turma e do mapa destes alunos), **quando
sai** (tudo agora, por semana, por intervalo, datas escolhidas; horário de Brasília escrito; o
"Copiar de outra turma" mora aqui, porque copia o ritmo) e **a prévia**, a parte mais importante.
Ela recalcula a cada mudança com a MESMA `agendar` do servidor: as liberadas travadas em cima, as
que não liberaram ("Não liberada", com o motivo) com "Tentar de novo", e cada data futura com
"Adiar", "Pular", "Liberar agora" e o aviso de rascunho. Adiar e pular valem ao salvar; liberar
agora, tentar de novo e pausar são imediatos. Confirmação NUNCA em verde.

O menu "Módulos" leva um número vermelho com as turmas que têm liberação que não aconteceu. A tela da turma
tem o bloco **"Módulos desta turma"**, com a programação de cada um e "Programação" (ou "Resolver").

`(studio)/modulos/[id]/mapa?turma=` é a prévia do mapa do aluno para o professor: tela fechada (sem
barra lateral, X volta ao módulo), com a programação daquela turma e nenhum progresso de aluno.

Uma atividade pode estar em vários módulos: o detalhe dela mostra os chips e "Acrescentar a um
módulo"; a lista de atividades filtra por módulo e por nível. O histórico da turma marca "módulo X"
nos envios que vieram de um módulo.

### O mapa do aluno

`aluno/modulos/[id]` (e o bloco **"Seus módulos"** em `/aluno`, entre as turmas e "Como você vem
indo", que só aparece quando há algum). Só para quem tem conta com a ficha da turma ligada — quem
entra pelo link aberto não tem mapa, e isso é o caminho normal. A superfície é a do Player: alvo de
48px, cabeçalho de uma linha (voltar, marca, volume) e, no celular, a página não rola — o mapa rola
por dentro e abre na fase atual.

- **O tema 8 bits é só do mapa e do cartão dele** (`MapaDoModulo.svelte`): pixel art como dado, o
  avatar do aluno como personagem, e a fonte pixel só em rótulo decorativo (design-system.md).
- Cada fase tem ícone e texto de estado: concluída (azul, nunca verde), em andamento, liberada,
  trancada com a data em que abre, encerrada. Por baixo do desenho há uma `<ol>`.
- Tocar abre a folha da fase; "Jogar" e "Continuar" vão pelo link pessoal do convite, para a
  tentativa contar. **O mapa não tranca o link**: a ordem é sugestão.
- **Estrelas só onde o professor liberou o resultado**; sem isso, "concluída · sem placar".
- O avatar anda uma vez quando o aluno avançou e a festa do módulo concluído toca uma vez,
  lembrados no aparelho. Nenhum ranking, nenhum dado de outro aluno.

## Nível

Rótulo CEFR opcional (A1–C2), escolhido em chips na etapa 1 e trocado no cabeçalho do detalhe, sem
republicar. Aparece na lista (com filtro), na entrada do Player ao lado do idioma, no histórico do
aluno e no seletor de atividades da turma. **Não muda os exercícios.**

## Arquivar e apagar

Os limites do plano são de ESTOQUE, então o detalhe da atividade termina em "Arquivar ou apagar".
Arquivar fecha o link para quem não começou (a entrada responde `unpublished`; quem está no meio
termina), guarda os resultados e libera a vaga; desarquivar exige vaga. Apagar de vez pede o título
digitado e diz quantas tentativas vão junto. Arquivadas saem de "Todas" e ganham chip próprio.

A etapa 1 mostra o bloqueio ANTES dos campos quando não cabe uma atividade nova — com o número, o
caminho (arquivar) e `/planos?motivo=`. Material que não cabe aparece como "N ficaram de fora".

## Escola (coordenação)

`(studio)/escola` só existe para a coordenação (`requireCoordenacao`, 404 para os outros; a entrada
na barra lateral aparece só para ela). Mostra o contrato, os professores com o uso contra o limite,
as turmas **só em números** — a tela diz isso — e, à direita, os assentos e os convites em aberto.
**Convidar abre uma bandeja**: o e-mail e o papel em dois cartões que dizem o que cada um faz
("Coordenação: também vê os números da escola… nunca vê nome de aluno nem resposta") — um `<select>`
com "professor/coordenação" não dizia a diferença.

`(studio)/escola/convite/[token]`: o aceite. Diz o que muda antes do botão (plano da escola; a
coordenação vê números; o conteúdo continua seu) e trata cada caso — vencido, usado, sem assento,
já em outra escola — com a sua frase. Quem não está logado passa por entrar/cadastro e volta.

## Painel interno

`(admin)/admin` é da equipe que opera a plataforma, com layout próprio e sóbrio. Visão geral (pedidos,
trials vencendo, jobs falhados com "Tentar de novo"), professores (ativar plano, trial, cancelar,
créditos de cortesia, histórico), pedidos (atender = ativar o plano) e escolas (contrato, membros com
exceção de limite, convites). Nunca mostra dado de aluno.

## Área do aluno

`aluno` é a superfície do PLAYER, não do Studio: uma coluna, cabeçalho de uma linha (marca,
e-mail, sair) e seis blocos, **em ordem de pergunta**: onde eu estudo, como venho indo, e o que
respondi. O cartão de boas-vindas diz em uma frase para que a área serve — reencontrar o que
respondeu em outro aparelho — e que os links funcionam sem ela; embaixo, tentativas, terminadas e
turmas, e o avatar no lugar das iniciais.

**Adotar as tentativas soltas é um CONVITE, não automático.** Entrar e criar conta não adotam mais
nada sozinhos: a suposição estava errada mais vezes do que parecia — celular de laboratório,
tablet de casa, o irmão que respondeu antes —, e a conta acabava com respostas de outra pessoa
dentro sem ninguém ter dito nada. O convite fica no topo da área, com a CONTAGEM
(`tentativasSoltas`, escopada pelo `anonId` do cookie), e some quando não há nada solto neste
aparelho. `adotarMinhasTentativas` continua sendo a única escrita de histórico da área.
O `e/[token]` (link pessoal) segue vinculando sozinho — ali a identidade vem do professor, não de
um palpite sobre o aparelho.

**"Entrar com o Google"** vem depois do avatar, com o mesmo componente da Conta do professor: ligar
o Google numa conta de aluno criada com senha. Só aparece com o Google ligado no servidor.

**"Seu avatar"** é a outra escrita: dezoito números, nunca uma imagem (`$lib/avatar/montar.ts`).
"Sortear" grava direto; "Montar peça por peça" abre o `AvatarEditor`.

**"Como você vem indo"** fica ENTRE as turmas e o histórico porque responde antes da lista — a
tendência das últimas três diz mais que qualquer nota isolada. Quatro números (acerto médio,
tendência, tempo médio, semanas seguidas) e o "por habilidade" somando tudo. **Tudo aí é só das
atividades com resultado LIBERADO**, e cada cartão só aparece quando tem dado: conta nova não
mostra "0%" nem "—", mostra nada. Resposta de rubrica sem nota do professor fica fora — contá-la
como não-acerto reprovaria o aluno por uma fila que não é dele.

O histórico tem título, "professor · idioma · quando", "N de N" e uma pílula com o acerto — ou
"Sem placar", com ícone de olho riscado, quando o professor desligou o resultado. **Cada linha
ABRE em detalhe**: a distribuição certas/parciais/erradas com os três números escritos, o tempo,
qual tentativa foi, e "Ver questão a questão" (ou "Continuar", na que ficou pela metade). Onde o
professor não liberou resultado, o detalhe DIZ isso em vez de mostrar barra vazia. A nota do
rodapé explica a regra em texto: a conta guarda o histórico, não contorna o que ele decidiu
mostrar.

## Pendências de produto (Apêndice A)

Marcadas nas próprias telas, não resolvidas por conta própria:

- **Trial** — 14 dias com os limites do básico (`TRIAL` em `$lib/billing/catalogo.ts`). Vai exigir cartão, cadastrado no gateway, quando ele existir (billing.md "Trial").
- **Encerrar conta** — o que acontece com os links já publicados.
- **Retomada** — o mecanismo de identificação do aparelho. A tela cobre os dois caminhos.

## Grupo (site) — páginas institucionais

Públicas, fora do Studio e do Player. `(site)/+layout.svelte` monta `SiteHeader` + `SiteFooter`;
a home usa os mesmos dois componentes, então cabeçalho e rodapé são um desenho só — a home só
acrescenta o toggle de tema manual (home.md) via `<SiteHeader>{#snippet extra()}...{/snippet}</SiteHeader>`,
o único ponto de extensão do componente.

| Rota                                                  | Layout                                                                              |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `/contato`                                            | Formulário + canais diretos. Consentimento junto do botão, não no rodapé.           |
| `/sobre`                                              | Texto corrido + três princípios. Sem números de tração inventados.                  |
| `/ajuda`                                              | FAQ em quatro grupos, uma aberta por vez.                                           |
| `/privacidade` `/termos` `/cookies` `/acessibilidade` | Todas usam `LegalPage.svelte`: índice fixo à esquerda no desktop, seções numeradas. |

**O texto não fica na rota.** Todo o conteúdo institucional vive em
`$lib/content/institucional.ts` — o nome, as quatro listas de seções legais, a data delas
(`atualizadoEm`), FAQ, canais e princípios.

**Só o que o produto faz hoje** (revisão de novembro de 2026, com o agentic-seo e o Cérebro de
`../spokke-seo`). Saíram a história e a equipe inventadas, a encarregada de dados com nome
fictício, o endereço e a razão social de exemplo, os nomes de cookie que não existiam e as respostas
da ajuda que não batiam com o produto (módulo mandando e-mail, código de seis letras, alemão na
lista de idiomas, fila de correção, "distratores mais escolhidos"). **A página de Cookies diz PARA
QUE serve cada tipo**, de cookie e de armazenamento local, sem os nomes nem a mecânica (pedido do
dono, 2026-11-11): a lista por nome, com o que cada um guardava, descrevia o funcionamento interno
do produto. Cookie novo com outra FINALIDADE entra lá como finalidade; trocar um nome não muda nada.
**A página de Status saiu**: mostrava uptime e incidentes que ninguém media, e um "Online" verde no
rodapé do painel. Ela volta quando houver monitoramento de verdade por trás (docs/selos-e-seguranca.md).
O CNPJ, a razão social e o endereço entram quando existirem; o CNPJ fica fora do site a pedido do
dono. Os e-mails usam o domínio do site, `spokke.com.br` (as caixas ainda precisam ser criadas).

Pendências de produto: o encarregado de dados com nome (a LGPD pede a identidade dele pública), e
encerrar a conta pelo próprio painel (hoje a política manda escrever para o suporte).

## Blog

`(site)/blog/**` — o como e o porquê em `docs/blog.md`; o desenho é o projeto "Blog" do Claude
Design. O que vale como regra de tela:

- **Sem autor, em lugar nenhum.** O topo do artigo diz "Publicado em", "Atualizado em" (quando
  houve) e o tempo de leitura. Não há nome, foto, caixa de autor nem página de autor — decisão do
  dono em 2026-11-10. O JSON-LD leva a marca como autora.
- **"Blog" é item fixo do menu e do rodapé**, e um teste garante artigo no ar (sem nenhum, as rotas
  do blog seriam 404). Rascunho e artigo agendado aparecem só em `pnpm dev`, com o selo "Rascunho".
  O topo do índice é o artigo com `destaque: true`.
- **Índice**: H1 com ponto de vista (não "Blog"), os temas como LINKS para os hubs, o guia em
  destaque, a faixa escura "Dirige uma escola de idiomas?" levando a `/blog/para-escolas`, a grade de
  cartões com a chamada do meio depois do sexto e a paginação com links de verdade.
- **Hub** (tema e escolas): migalhas, H1, abertura própria, o guia em destaque, todos os artigos,
  "Outros temas" e a conversão do público do hub. Menos de 3 artigos = `noindex`.
- **Artigo**: migalhas até o tema, chip do tema (e "Para escolas"), H1, linha fina, datas; o
  sumário em `<details>` no celular e em coluna fixa no desktop, a partir de quatro seções; a foto
  de capa (todo artigo no ar tem uma) e o corpo;
  compartilhar (copiar link e WhatsApp); a ponte para as escolas no artigo de professor; "Leia
  também" com três cartões compactos; a faixa de conversão escura.
- **A questão embutida corrige no servidor** (`corrigirExemplo`), com as mesmas peças do celular da
  home. Nada de correção no navegador, mesmo sendo demonstração.
- **No máximo três chamadas por artigo**, e a conversão segue o `publico` (professor → cadastro;
  escola → `/contato?assunto=escolas`), sempre com `?origem=blog-<slug>`. O contato repassa a
  origem ao aviso da equipe.
