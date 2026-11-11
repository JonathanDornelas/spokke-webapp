# Mapa de páginas — Spokke

> **Documento HISTÓRICO** (setembro de 2026): foi o briefing para o Claude Design desenhar as telas.
> Ele usa nomes que já mudaram — `(marketing)` virou `(site)`, `dashboard` e `correcao` não existem,
> `assinatura` virou uma aba de `conta` — e não tem turmas, alunos, módulos, escola nem o painel
> interno. **O mapa vigente é `.claude/rules/paginas.md`**; as decisões, os ADRs desta pasta. O
> "Apêndice A" citado lá está resolvido em boa parte pelo `docs/adr-002-billing.md`.

Inventário de todas as telas que o produto precisa, derivado de `CLAUDE.md` e de
`.claude/rules/{kernel,server,auth,billing,db,design-system,components,home,testing}.md`. Não
inventa fluxo: cada página aqui existe porque uma regra, uma entidade de banco ou uma remote
function já a exige. Onde a documentação é omissa, isso está marcado como decisão em aberto, não
resolvida por conta própria.

Este documento é o material de entrada para o Claude Design desenhar as telas que ainda não têm
referência visual. Duas telas já têm HTML de referência navegável e **não devem ser redesenhadas
do zero**: `docs/design-system.html` (catálogo de componentes + mockups de Studio) e
`docs/home.html` (página pública). Onde uma página abaixo já aparece esboçada em um desses
arquivos, isso está indicado explicitamente.

## Como ler cada ficha

- **Rota** — caminho sugerido dentro da estrutura de `src/routes/` do `CLAUDE.md`. Grupos entre
  parênteses (`(studio)`, `(marketing)`) não aparecem na URL.
- **Quem acessa** — Professor autenticado, Aluno anônimo, ou público (ninguém logado).
- **Por que existe** — o problema de produto que a tela resolve, uma frase.
- **O que mostra e faz** — funcionalidade, não layout. O layout é trabalho do Claude Design.
- **Dados** — quais entidades de `db.md` a tela lê ou grava.
- **Estados** — variações que precisam de desenho próprio (vazio, carregando, erro, bloqueado),
  além do estado "feliz".
- **Regras que amarram esta tela** — subconjunto das 9 regras invioláveis de `CLAUDE.md` que
  restringem o que pode aparecer aqui. Isso importa para o design porque algumas telas **não
  podem** mostrar certos dados, não importa quão útil pareça.

---

## Visão geral

| #   | Página                                    | Rota sugerida                                  | Quem acessa | Referência visual existente                                   |
| --- | ----------------------------------------- | ---------------------------------------------- | ----------- | ------------------------------------------------------------- |
| 1   | Home                                      | `/`                                            | Público     | ✅ implementada (`src/routes/+page.svelte`), `docs/home.html` |
| 2   | Exemplo ao vivo                           | `a/[slug-de-demonstração]`                     | Público     | reaproveita a página 15                                       |
| 3   | Entrar                                    | `/entrar`                                      | Público     | não desenhada                                                 |
| 4   | Cadastro                                  | `/cadastro`                                    | Público     | não desenhada                                                 |
| 5   | Esqueci a senha                           | `/esqueci-senha`                               | Público     | não desenhada                                                 |
| 6   | Redefinir senha                           | `/redefinir-senha`                             | Público     | não desenhada                                                 |
| 7   | Atividades (dashboard do Studio)          | `(studio)/dashboard`                           | Professor   | esboço em `design-system.html`                                |
| 8   | Nova atividade — detalhes                 | `(studio)/atividades/nova`                     | Professor   | não desenhada                                                 |
| 9   | Nova atividade — materiais                | `(studio)/atividades/[id]/materiais`           | Professor   | não desenhada                                                 |
| 10  | Nova atividade — revisão de itens gerados | `(studio)/atividades/[id]/revisar`             | Professor   | não desenhada                                                 |
| 11  | Editor de item                            | `(studio)/atividades/[id]/itens/[itemId]`      | Professor   | esboço em `design-system.html` ("Editor · item 4")            |
| 12  | Publicar atividade                        | `(studio)/atividades/[id]/publicar`            | Professor   | não desenhada                                                 |
| 13  | Materiais (biblioteca de conteúdo)        | `(studio)/materiais`                           | Professor   | não desenhada                                                 |
| 14  | Resultados — visão geral                  | `(studio)/resultados`                          | Professor   | esboço em `design-system.html`                                |
| 15  | Resultados — detalhe de atividade         | `(studio)/resultados/[activityId]`             | Professor   | esboço parcial em `design-system.html`                        |
| 16  | Resultados — tentativa individual         | `(studio)/resultados/[activityId]/[attemptId]` | Professor   | não desenhada                                                 |
| 17  | Fila de correção manual (writing longo)   | `(studio)/correcao`                            | Professor   | não desenhada                                                 |
| 18  | Assinatura                                | `(studio)/assinatura`                          | Professor   | não desenhada (rota já referenciada em `billing.md`)          |
| 19  | Conta e conta                             | `(studio)/conta`                               | Professor   | não desenhada                                                 |
| 20  | Privacidade — política pública            | `/privacidade`                                 | Público     | não desenhada                                                 |
| 21  | Onboarding / estado vazio                 | dentro da página 7                             | Professor   | não desenhada                                                 |
| 22  | Entrada do Player — código de acesso      | `a/[slug]` (etapa condicional)                 | Aluno       | não desenhada                                                 |
| 23  | Entrada do Player — nome                  | `a/[slug]` (etapa)                             | Aluno       | esboço em `home.html` (hero)                                  |
| 24  | Questão do Player (8 variações)           | `a/[slug]` (etapa)                             | Aluno       | 6 de 8 esboçadas em `design-system.html`/`home.html`          |
| 25  | Envio pendente de correção humana         | `a/[slug]` (etapa)                             | Aluno       | não desenhada                                                 |
| 26  | Resultado do Player                       | `a/[slug]` (etapa final)                       | Aluno       | esboço parcial em `home.html` (bloco 4)                       |
| 27  | Link indisponível / expirado / sem áudio  | `a/[slug]` (estado de erro)                    | Aluno       | não desenhada                                                 |
| 28  | Contato                                   | `/contato`                                     | Público     | não desenhada                                                 |
| 29  | 404                                       | `+error.svelte` global                         | Qualquer    | não desenhada                                                 |
| 30  | Erro genérico (500)                       | `+error.svelte` global                         | Qualquer    | não desenhada                                                 |

Catálogo de componentes (`/dev/components`) e as duas páginas de referência estática em `docs/`
não entram nessa lista — não são páginas de produto, são ferramenta interna e material de
handoff.

---

## 1. Público / marketing

### 1.1 Home — `/`

Já implementada. Ver `.claude/rules/home.md` para a especificação completa (7 blocos, voz, toggle
de tema, reaproveitamento de componentes). Incluída aqui só para registro — nenhuma ação
pendente.

### 1.2 Exemplo ao vivo — `a/[slug]` de uma atividade de demonstração

**Por que existe:** o CTA "Abrir um exemplo" da home (`home.html`, bloco 7) precisa apontar para
algo real. Não é uma página nova — é a página 24 (Player) apontando para uma `Publication` real,
marcada como demonstração, que qualquer visitante pode responder sem que isso vire lead nem crie
ruído nos resultados de um professor de verdade.

**Decisão em aberto:** quem é o "dono" dessa atividade de demonstração — uma conta interna fixa,
seedada em todo ambiente, ou uma atividade fora do modelo `Teacher` inteiramente. Isso é decisão
de produto/infra, não de design; a tela em si é idêntica à página 24.

### 1.3 Privacidade — `/privacidade`

**Quem acessa:** público.
**Por que existe:** LGPD exige política pública. `auth.md` estabelece minimização de dado do
aluno (nome/apelido + `anonId`, sem e-mail, sem dado sensível) — esta página é onde isso é
declarado publicamente, incluindo o que o professor pode e não pode ver sobre um aluno.

**O que mostra:** texto legal padrão (o quê é coletado, por quanto tempo, como o professor pode
apagar tentativas de um aluno — ver página 19). Sem interatividade. Prioridade baixa de design;
pode herdar o layout de texto-longo mais simples do site.

### 1.4 Contato — `/contato`

**Quem acessa:** público.
**Por que existe:** rota de saída óbvia para quem tem dúvida antes de assinar. Não está em
nenhuma regra do projeto — é convenção de site institucional. Prioridade baixa; formulário simples
(nome, e-mail, mensagem) ou link de e-mail direto, decisão de produto não coberta pela
documentação.

---

## 2. Autenticação (Better Auth)

Nenhuma dessas quatro tem mockup em `design-system.html`/`home.html`. `auth.md` estabelece que o
guard de sessão vive em `hooks.server.ts`, nunca em `+layout.server.ts` — isso é comportamento de
servidor, não muda o desenho da tela, mas importa para saber que **não existe "flash" de
conteúdo protegido**: o redirecionamento para `/entrar` acontece antes de qualquer HTML do Studio
ser enviado.

### 2.1 Entrar — `/entrar`

**Quem acessa:** público (redireciona para `(studio)/dashboard` se já houver sessão).
**O que mostra e faz:** e-mail + senha, submit para o fluxo do Better Auth. Link para "Esqueci a
senha" e para "Cadastro". Se a rota protegida original que disparou o redirect existir, retorna
para ela após o login (padrão `?redirectTo=`).
**Estados:** vazio, erro de credencial (mensagem genérica — nunca "e-mail não existe", para não
vazar quais e-mails têm conta), carregando durante submit.

### 2.2 Cadastro — `/cadastro`

**Quem acessa:** público. É o ponto de entrada de todo professor novo — a home aponta CTAs
primários para cá (ou para o dashboard, se logado).
**O que mostra e faz:** nome, e-mail, senha. Ao concluir, cria `Teacher` e inicia sessão. Se
houver período de trial (ver `billing.md`), este é o momento em que ele começa a contar —
comunicar isso na tela é "14 dias grátis". O teste vai exigir cartão, cadastrado no gateway quando
ele existir (`billing.md` "Trial"); até lá a tela não fala de cartão.
**Estados:** vazio, e-mail já cadastrado, senha fraca, carregando.

### 2.3 Esqueci a senha — `/esqueci-senha`

**O que mostra e faz:** campo de e-mail, envia link de redefinição. Confirmação neutra ("se esse
e-mail existir, enviamos um link") — mesma lógica de não vazar quais contas existem.

### 2.4 Redefinir senha — `/redefinir-senha`

**Quem acessa:** público, mas só com token válido na URL (enviado por e-mail a partir da página
2.3).
**O que mostra e faz:** nova senha + confirmação. Token inválido/expirado é um estado de erro
próprio, com caminho de volta para 2.3.

---

## 3. Studio (professor autenticado)

Grupo de rotas `(studio)/**`. Toda página aqui pressupõe sessão válida (regra 3) e toda leitura de
dado do professor passa por repositório escopado por `teacherId` (regra 4) — isso não é visível
no design, mas significa que **nenhuma tela do Studio pode assumir que existe só um professor no
banco**: contadores, listas e buscas são sempre relativos ao professor logado, nunca globais.

O mockup de Studio em `design-system.html` já fixa a navegação principal: barra lateral com
**Atividades / Resultados / Materiais / Assinatura**. As fichas abaixo seguem essa divisão e
acrescentam duas páginas que a navegação principal não cobre (Conta, Fila de correção manual).

### 3.1 Atividades (dashboard) — `(studio)/dashboard`

**Por que existe:** é a tela em que o professor vive. Primeira coisa que vê ao entrar no Studio.
**O que mostra e faz:**

- Lista das `Activity` do professor, com filtro por status (Todas / Publicadas / Rascunhos —
  já esboçado em `design-system.html`).
- Por atividade: título, idioma alvo, status (badge), contagem de tentativas, data da última
  edição.
- CTA principal "+ Nova atividade" (abre página 3.2).
- Clicar numa atividade leva ao editor dela, na etapa em que ela parou (rascunho não publicado
  volta para materiais/revisão; publicada volta para a visão geral dela, que é a página 3.10).

**Dados:** `Activity` (+ `ActivityVersion` mais recente, para saber se há rascunho não publicado).
**Estados:** vazio (nenhuma atividade ainda — ver 3.8, Onboarding), lista normal, carregando.

### 3.2 Nova atividade — detalhes — `(studio)/atividades/nova`

**Por que existe:** primeiro passo do fluxo de criação. `kernel.md` deixa claro que o professor
nunca escolhe habilidade (listening/speaking/reading/writing) diretamente — ela é derivada da
combinação de Prompt × Interação × Correção que sai dos geradores. Esta tela, portanto, **não
tem um seletor de habilidade**.

**O que mostra e faz:** título da atividade, idioma alvo, idioma de origem do aluno (para
traduções). Ao salvar, cria a `Activity` (sem `ActivityVersion` ainda) e segue para materiais.

**Dados:** grava `Activity`.
**Estados:** vazio, validação (título obrigatório).

### 3.3 Nova atividade — materiais — `(studio)/atividades/[id]/materiais`

**Por que existe:** é o "Nível 1" de autoria de `kernel.md` — o professor cola conteúdo simples,
sem nunca escrever JSON nem configurar interação manualmente nesta etapa.

**O que mostra e faz:** interface para cadastrar `ContentUnit`s de um dos quatro tipos:

| Tipo         | Forma de entrada                                 |
| ------------ | ------------------------------------------------ |
| SentencePair | frase no idioma alvo + tradução                  |
| VocabItem    | palavra/expressão + definição/tradução           |
| Passage      | texto corrido (parágrafo) no idioma alvo         |
| Dialogue     | troca de falas entre dois ou mais interlocutores |

Pode colar várias entradas de uma vez (ex.: lista de frases, uma por linha) ou adicionar uma a
uma. Cada `ContentUnit` cadastrado aqui também fica disponível na biblioteca de Materiais (página
3.6) para reuso em outras atividades.

**Dados:** grava `ContentUnit` (associado à `Activity` e ao `Teacher`).
**Estados:** vazio (nenhum material ainda — bloqueia avançar), lista de materiais já adicionados,
edição/remoção de um item antes de gerar.

### 3.4 Nova atividade — revisão de itens gerados — `(studio)/atividades/[id]/revisar`

**Por que existe:** é o "Nível 2" de `kernel.md`. Os geradores (`translate-assemble`,
`translate-type`, `listen-assemble`, `listen-type`, `listen-choice`, `cloze-target`,
`speak-target`, e os equivalentes de vocabulário/passagem/diálogo) rodam sobre os `ContentUnit`s
da etapa anterior e propõem uma lista de `Item`s automaticamente. **O professor nunca vê JSON** —
ele revisa cada item proposto em linguagem natural, edita ou descarta.

**O que mostra e faz:** lista dos itens propostos, agrupados por `ContentUnit` de origem. Cada
item mostra um resumo legível ("Listening → escolher entre 4 opções", "Montar frase a partir de:
'She works at a bookshop'"). Ações por item: aceitar como está, editar (abre página 3.5), descartar.
Ação em massa: aceitar todos, gerar novamente (com outro gerador, se mais de um se aplica ao
mesmo `ContentUnit`).

**Dados:** lê `ContentUnit`, grava/edita `Item` (ainda em rascunho, dentro de uma `ActivityVersion`
não publicada).
**Estados:** carregando (geração pode não ser instantânea), vazio (gerador não encontrou nada
aplicável a um material específico — precisa avisar por quê, ex. "frase curta demais para
listening"), lista revisada.

### 3.5 Editor de item — `(studio)/atividades/[id]/itens/[itemId]`

**Já esboçado em `design-system.html`** ("Editor · item 4"). Confirma a estrutura: enunciado,
seletor de tipo de interação, campo de frase/conteúdo alvo, gabarito (rotulado explicitamente
como "fica só no servidor"), toggles de configuração de correção.

**Por que existe:** é o "Nível 3" de `kernel.md` — autoria manual, para quando o professor quer
ajustar um item além do que o gerador propôs, ou criar um item do zero sem passar por gerador.

**O que mostra e faz:** formulário **gerado dinamicamente a partir do `authoringSchema`** (Zod)
do tipo de interação escolhido — os campos mudam conforme o tipo (choice/assemble/type/cloze/
match/order/select/speak, ver seção 5 deste documento para o que cada um precisa mostrar).
Comum a todos: enunciado, prompt (texto/áudio/imagem/composto), gabarito e variantes aceitas
(com sugestões de variantes propostas pelo sistema — ex. "aceitar também sem acento" —
aprováveis com um clique), configuração de tolerância de correção (ignorar acentos, ignorar
maiúsculas, correção exata vs. tolerante vs. sequência vs. conjunto vs. ASR vs. rubrica, conforme
`kernel.md`). Botão de pré-visualizar o item como o aluno vai vê-lo — **esse preview usa
`toRuntime()`**, o mesmo payload que vai para o browser do aluno; é assim que a tela garante
visualmente, e não só por regra, que o gabarito não vaza.

**Dados:** lê/grava `Item` dentro da `ActivityVersion` em rascunho.
**Estados:** por tipo de interação (8 variações de formulário), erro de validação do Zod,
prévia carregando.

**Regra que amarra esta tela:** regra 1 (gabarito nunca vai para o browser em atividade
avaliada) — a área de gabarito desta tela é a única do produto onde o gabarito aparece de fato, e
precisa ser visualmente distinta ("isto fica só aqui") do restante do formulário, que é o que
depois vira o payload público.

### 3.6 Materiais (biblioteca) — `(studio)/materiais`

**Por que existe:** os `ContentUnit`s cadastrados durante a criação de uma atividade (página 3.3)
não pertencem a ela sozinhos — `db.md` os modela como filhos do `Teacher`, reutilizáveis entre
atividades. Esta página é o CRUD central deles, fora do fluxo de criação.

**O que mostra e faz:** lista de todos os `ContentUnit`s do professor, filtrável por tipo
(SentencePair/VocabItem/Passage/Dialogue) e por idioma. Permite criar material solto (sem estar
no meio da criação de uma atividade), editar, apagar (com aviso se estiver em uso por algum item
publicado — apagar não deve quebrar uma `ActivityVersion` já publicada, regra 7).

**Dados:** `ContentUnit`.
**Estados:** vazio, lista, edição, aviso de "em uso" ao tentar apagar.

### 3.7 Nova atividade — publicar — `(studio)/atividades/[id]/publicar`

**Por que existe:** materializa a regra 7 (`ActivityVersion` publicada é imutável) como um passo
explícito e consciente, não um efeito colateral de salvar.

**O que mostra e faz:** resumo da atividade (quantos itens, quais habilidades resultam da
combinação escolhida — mostradas aqui, derivadas, nunca escolhidas), configurações da
`Publication`: slug do link (editável, com verificação de unicidade), código de acesso opcional,
se o aluno vê o resultado ao terminar ou não. Botão "Publicar" gera a `ActivityVersion` imutável e
o link. Se já existir uma versão publicada anteriormente, publicar de novo cria uma nova versão —
a tela deve deixar isso explícito ("isso cria a versão 2; tentativas em andamento na versão 1
continuam na versão 1 até terminarem").

Bloqueia publicação se houver job de TTS pendente para algum item de áudio (`server.md`: TTS é
gerado no momento da publicação, e a publicação **espera** todos os jobs terminarem antes de
ficar disponível) — ver estado "gerando áudio" abaixo.

**Dados:** grava `ActivityVersion` (congela os `Item`s), `Publication`.
**Estados:** resumo pronto para publicar, gerando áudio (job de TTS em andamento — barra de
progresso ou spinner, não é instantâneo), publicado com sucesso (mostra o link e QR code, se
aplicável), erro de slug duplicado.

**Regra que amarra esta tela:** regra 7 (imutabilidade) e regra 8 (aleatorização determinística —
a seed é fixada por tentativa, não por versão; não é campo desta tela, mas explica por que
"embaralhar itens" não é uma opção configurável aqui — é automático e por aluno).

### 3.8 Onboarding / estado vazio — dentro de `(studio)/dashboard`

**Por que existe:** primeiro acesso de um professor recém-cadastrado, sem nenhuma `Activity`
ainda. Não é uma rota própria — é o estado vazio da página 3.1, mas merece ficha própria porque a
primeira impressão do Studio é ela, não a lista populada.

**O que mostra e faz:** substitui a lista vazia por uma chamada direta para criar a primeira
atividade, possivelmente com um atalho para abrir uma atividade de exemplo já pronta (mesmo
conceito da página 1.2, mas do lado do professor: ver como fica antes de montar a própria).

### 3.9 Fila de correção manual — `(studio)/correcao`

**Por que existe:** `kernel.md` lista `rubric` como uma das formas de correção (writing longo) —
ao contrário de exact/tolerant/sequence/set/asr, uma resposta de rubrica não tem veredito
automático; alguém humano precisa ler e decidir. O mockup de Resultados em `design-system.html`
já expõe um contador ("3 writing a corrigir") que aponta para esta fila.

**O que mostra e faz:** lista de respostas de `AttemptItem` com correção pendente, agrupadas por
atividade. Para cada uma: o enunciado, a resposta do aluno, campo de nota/feedback (conforme a
rubrica configurada no item). Ao corrigir, atualiza o resultado da tentativa — se o aluno tinha
permissão de ver feedback, ele passa a ver esse resultado a partir daqui (antes disso, ver página
25, "pendente de correção").

**Dados:** `AttemptItem` (com correção pendente), `Item` (para o enunciado e a rubrica), `Attempt`.
**Estados:** vazio (fila zerada — bom sinal, comunicar como tal, não como erro), lista com
pendências, item sendo corrigido, corrigido com sucesso.

**Regra que amarra esta tela:** regra 2 (correção sempre no servidor) — mesmo sendo humana e não
automática, o veredito final é persistido pelo servidor a partir desta tela, nunca calculado ou
exibido antes de o professor confirmar.

### 3.10 Resultados — visão geral por atividade — `(studio)/resultados/[activityId]`

**Já esboçado em `design-system.html`.** Confirma: número de tentativas, taxa média de acerto,
contador de writing pendente de correção (linka para 3.9), gráfico de barras dos itens mais
errados.

**Por que existe:** é o retorno de valor do produto para o professor — sem isso, publicar uma
atividade não tem propósito visível.

**O que mostra e faz:** métricas agregadas da atividade (todas as versões publicadas, ou
filtrável por versão — decisão de produto, `db.md` modela `Attempt` pinado a uma
`ActivityVersion` específica, então tecnicamente é possível separar por versão). Lista de
tentativas recentes, cada uma levando à página 3.11. Ranking de itens com maior taxa de erro
(ajuda o professor a identificar o que a turma não entendeu).

**Dados:** `Attempt`, `AttemptItem`, agregados por `Item`/`ActivityVersion`/`Publication`.
**Estados:** vazio (atividade publicada mas ainda sem nenhuma tentativa), dados normais,
carregando agregação.

### 3.11 Resultados — visão geral do Studio — `(studio)/resultados`

**Por que existe:** ponto de entrada da navegação principal ("Resultados" na barra lateral) antes
de escolher uma atividade específica.

**O que mostra e faz:** lista de atividades publicadas com suas métricas resumidas lado a lado
(mesma lógica de comparação entre turmas/atividades), cada uma levando à página 3.10.

**Dados:** agregação leve sobre todas as `Activity` publicadas do professor.
**Estados:** vazio (nenhuma atividade publicada ainda), lista.

### 3.12 Resultados — tentativa individual — `(studio)/resultados/[activityId]/[attemptId]`

**Por que existe:** drill-down necessário para o professor entender o desempenho de um aluno
específico, item por item — a agregação da página 3.10 não substitui isso.

**O que mostra e faz:** nome/apelido do aluno, data, tempo total. Lista de `AttemptItem`, cada um
mostrando o item (enunciado), a resposta dada, e o veredito (certo/quase/parcial/errado/pendente
— "quase" é estado próprio, não um meio-termo visual entre certo e errado, conforme regra da
correção tolerante). Ação para apagar a tentativa (atende à exigência de LGPD de `auth.md`: o
professor precisa conseguir apagar dados de um aluno).

**Dados:** `Attempt`, `AttemptItem`, `Item`.
**Estados:** normal, tentativa com item(ns) ainda pendente(s) de correção manual (linka para 3.9),
confirmação de exclusão.

### 3.13 Assinatura — `(studio)/assinatura`

**Rota já referenciada em `billing.md`** (`paths: - 'src/routes/(studio)/assinatura/**'`), sem
mockup visual ainda.

**Por que existe:** ponto único de gestão de cobrança. `billing.md` estabelece que o gateway (o
Mercado Pago) nunca é chamado diretamente do produto — tudo passa por uma abstração
`BillingProvider` — e que o estado de verdade da assinatura vem do webhook, nunca do redirect do
checkout. Para o design, isso
significa que **esta tela não pode assumir que o pagamento foi confirmado só porque o professor
voltou de um checkout** — o estado "processando" é real e pode durar alguns segundos.

**O que mostra e faz:** plano atual, status (trial / ativo / atrasado / cancelado), data da
próxima cobrança ou fim do período. O Mercado Pago não tem portal de cliente: troca de cartão e
faturas ficam na conta do Mercado Pago de quem paga, não recriadas aqui. Botão de cancelar no fim
do período (que cancela lá primeiro) — e, como lá a assinatura cancelada não volta, "Assinar de
novo" no lugar de "Desfazer cancelamento". Se a assinatura estiver em atraso, aviso do que já está bloqueado — `billing.md`
descreve "degradação, não desligamento": links já publicados continuam funcionando para os
alunos mesmo com assinatura vencida; o que trava é criar/publicar atividade nova. Este aviso
precisa deixar essa distinção clara, para não assustar o professor achando que os links já
publicados vão parar de funcionar.

**Dados:** estado de assinatura (fonte: webhook do Mercado Pago, aplicado por `assinaturas.ts` aos
campos do `Teacher`; o id de cada assinatura no provedor fica em `ProviderSubscription`).
**Estados:** trial ativo (com contagem regressiva, se houver trial), ativo, pagamento atrasado
(com o aviso de degradação), cancelado, processando (voltando do checkout, aguardando o webhook
confirmar).

### 3.14 Conta — `(studio)/conta`

**Por que existe:** gestão do próprio cadastro, separada de cobrança. Não está em nenhuma regra
explícita, mas é necessário para qualquer produto com Better Auth (troca de senha, dado de
perfil).

**O que mostra e faz:** nome, e-mail (com fluxo de confirmação se trocado), troca de senha,
encerramento de conta (decisão de produto sobre o que acontece com as atividades publicadas do
professor ao encerrar — não coberta pela documentação, sinalizar como pendência se o Claude
Design precisar de comportamento definido).

**Dados:** `Teacher`.
**Estados:** normal, confirmação de e-mail pendente, confirmação de encerramento de conta.

---

## 4. Player (aluno anônimo)

Grupo de rotas `a/[slug]`. `server.md` define o fluxo em três remote functions públicas:
`iniciarTentativa`, `responderItem`, `finalizarTentativa`. As páginas 4.1 a 4.6 abaixo são estados
de uma única experiência de página única (SPA-like dentro da rota), não navegações separadas —
mas cada uma precisa de desenho próprio porque representa um momento distinto para o aluno.

**Regra que amarra todo este grupo:** regra 3 — cada uma dessas três remote functions começa pelo
próprio guard/validação; estar "dentro" da rota `a/[slug]` não protege nada sozinho. Isso importa
para o design porque cada etapa pode falhar independentemente (ex. `attemptId` inválido no meio
de uma tentativa) e precisa de um estado de erro que não deixe o aluno preso.

### 4.1 Entrada — código de acesso (condicional) — etapa de `a/[slug]`

**Por que existe:** `server.md`/publicação opcionalmente exige um "código de acesso" configurado
na página 3.7. Só aparece se a `Publication` tiver essa opção ativada.

**O que mostra e faz:** campo único de código, validação antes de liberar a etapa seguinte (nome).
**Estados:** vazio, código incorreto (mensagem genérica, sem contagem de tentativas visível ao
aluno — rate limiting existe no servidor, não precisa aparecer na UI).

### 4.2 Entrada — nome do aluno — etapa de `a/[slug]`

**Esboçada em `home.html`** (hero — mesmo padrão visual, aplicado à página real em vez da
demonstração). É o único dado de identificação que o aluno fornece — nenhum e-mail, nenhuma
conta, conforme o modelo de produto do `CLAUDE.md`.

**O que mostra e faz:** nome ou apelido, botão para começar. Ao confirmar, chama
`iniciarTentativa`, que cria o `Attempt` e fixa a seed de aleatorização (regra 8) e a
`ActivityVersion` (imutável a partir daqui, mesmo que o professor publique uma versão nova
depois).

Se o aluno já tinha uma tentativa incompleta no mesmo dispositivo (via `anonId` em cookie,
conforme `auth.md`), esta etapa deveria oferecer retomar em vez de recomeçar do zero — mencionado
como recurso do Player em `home.md` ("retomada onde parou"). A forma exata de detectar isso
(cookie vs. reentrada de nome) não está especificada em detalhe na documentação; sinalizado aqui
como algo que o design precisa cobrir com um estado próprio ("Continuar de onde parou" vs. "Começar
de novo"), mesmo que a regra de negócio exata seja refinada depois.

**Dados:** grava `Attempt` (nome/apelido do aluno, `anonId`, seed, `ActivityVersion` pinada).
**Estados:** vazio, retomada disponível, carregando.

### 4.3 Questão do Player — etapa de `a/[slug]`, uma casca com 8 variações

**Não é uma tela por tipo — é uma casca única** (`PlayerQuestionShell`, já existe como componente)
que muda de conteúdo conforme o `interaction` do `Item` atual. 6 das 8 variações já têm referência
visual (`design-system.html` e o hero de `home.html`); 2 não têm nenhuma. A tabela abaixo é o
detalhamento que falta para o Claude Design cobrir as 8 por completo.

| Interação  | O que o aluno vê e faz                                                                                                                                                                               | Referência visual               |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `choice`   | Pergunta (texto ou áudio) + opções para escolher uma. Usado para listening e para leitura com pergunta de compreensão.                                                                               | ✅ "Listening" no hero/catálogo |
| `assemble` | Fragmentos/palavras soltas que o aluno organiza em ordem para montar uma frase.                                                                                                                      | ✅ "Assemble" no hero/catálogo  |
| `type`     | Campo de texto livre. Usado tanto para resposta curta tolerante quanto para writing longo (rubrica) — o segundo caso usa uma área de texto maior, com rascunho salvo localmente antes de enviar.     | ✅ "Writing longo" no catálogo  |
| `cloze`    | Frase com uma lacuna; o aluno completa a palavra/expressão que falta.                                                                                                                                | ✅ "Escrita tolerante" no hero  |
| `speak`    | Grava a própria voz (via `Recorder`) respondendo a um alvo falado ou escrito; enviado para ASR.                                                                                                      | ✅ "Speaking" no hero/catálogo  |
| `select`   | Um texto (passagem) é mostrado e o aluno seleciona um trecho/palavra dentro dele — diferente de `choice`, a resposta é uma seleção dentro do próprio texto, não uma lista de alternativas fora dele. | ❌ sem referência visual        |
| `match`    | Duas colunas de itens (ex.: palavra ↔ tradução, ou pergunta ↔ resposta); o aluno pareia os itens correspondentes.                                                                                    | ❌ sem referência visual        |
| `order`    | Lista de itens (frases, falas de um diálogo) fora de ordem; o aluno reordena arrastando ou por outra forma acessível de reordenação.                                                                 | ❌ sem referência visual        |

Comum a todas: cabeçalho de progresso (X de N — já esboçado como "Progresso" no catálogo, com
animação de barra), estado de "verificando" após o aluno responder (a correção acontece no
servidor via `responderItem` — regra 2 — então nunca é instantânea do lado do cliente, mesmo que
pareça rápida; a UI precisa de um estado de espera real, não fingido), e o `CorrectionState` com
os cinco vereditos (certo / quase / parcial / errado / pendente), já com a animação `en-feedback-in`
documentada em `components.md`.

**Dados:** lê `Item` via `toRuntime()` (nunca o objeto de autoria completo — regra 1), grava
`AttemptItem` por resposta.
**Estados por interação:** vazio/carregando o próximo item, respondendo, verificando, veredito
(um dos cinco), transição para o próximo item (já esboçada como "Transição entre questões" no
catálogo).

**Regras que amarram esta tela:** regra 1 (payload nunca inclui gabarito), regra 2 (correção no
servidor — nenhum veredito é calculado no browser, nem para dar feedback "otimista"), regra 5
(tokenização via `Intl.Segmenter`, nunca `split(' ')` — relevante para `assemble`/`order`, que
fragmentam texto em unidades), regra 6 (comparação de string normalizada — relevante para
`type`/`cloze`, mas a normalização acontece no servidor; a UI não precisa simular isso, só não
pode implementar sua própria comparação no cliente), regra 8 (aleatorização determinística pela
seed da tentativa — a ordem de opções em `choice`/`match` não pode reembaralhar a cada render).

### 4.4 Envio pendente de correção humana — etapa de `a/[slug]`

**Por que existe:** quando o item respondido usa correção por `rubric` (writing longo), não há
veredito imediato — precisa passar pela fila da página 3.9 antes de existir um resultado.

**O que mostra e faz:** confirmação de que a resposta foi recebida, sem veredito. Se a atividade
tiver mais itens depois deste, o aluno segue normalmente; o "pendente" só afeta o resultado final
desse item específico, não trava o fluxo.

### 4.5 Resultado do Player — etapa final de `a/[slug]`

**Esboçado parcialmente em `home.html`** (bloco 4, sobre correção) — mas ali é uma composição de
marketing, não a tela real de resultado. Precisa de desenho próprio.

**Por que existe:** é o fechamento da tentativa, condicionado à configuração de feedback da
`Publication` (página 3.7: "se o professor permitir").

**O que mostra e faz:**

- **Se feedback está habilitado:** resumo dos vereditos por item (mesma paleta de cinco estados
  da página 4.3), pontuação/acerto geral, indicação clara de quais itens ainda estão com
  correção pendente (linkando conceitualmente à página 4.4, sem expor nada do lado do professor).
- **Se feedback está desabilitado:** tela neutra de conclusão ("Respostas enviadas") sem revelar
  nenhum veredito — este é o caminho mais restritivo e precisa existir como estado real, não como
  fallback improvisado, porque `server.md`/`CLAUDE.md` tratam isso como escolha explícita do
  professor.

**Dados:** lê `Attempt`/`AttemptItem` agregados (via `finalizarTentativa`).
**Estados:** feedback habilitado (completo ou com pendências), feedback desabilitado, carregando
o fechamento.

### 4.6 Link indisponível / expirado / sem áudio — estado de erro de `a/[slug]`

**Por que existe:** vários motivos distintos levam a essa família de erro, e `server.md`
especifica um deles com precisão: **uma atividade com jobs de TTS ainda pendentes não fica
acessível** — não é o mesmo que "não existe".

**O que mostra e faz:** mensagens distintas por causa, não uma genérica única:

- Slug não existe / nunca foi publicado → 404 do produto (distinto do 404 de rota, ver 5.1).
- Publicação existente mas despublicada pelo professor → aviso de que o link não está mais ativo.
- Áudio ainda sendo gerado (job de TTS em andamento) → estado de espera, sem indicar prazo exato
  já que a geração é assíncrona; opção de tentar novamente.
- Código de acesso necessário e não fornecido/errado → volta para a página 4.1, não é bem um
  erro.

---

## 5. Erros e utilitário (todo o site)

### 5.1 404 — `+error.svelte` global

Página não encontrada, fora do contexto de uma atividade específica (isso é diferente do "link
indisponível" da página 4.6, que é um erro de produto, não de roteamento). Tom consistente com a
home — não é uma tela "assustadora".

### 5.2 Erro genérico (500) — `+error.svelte` global

Falha inesperada de servidor. Sem detalhe técnico exposto (stack trace nunca no HTML enviado ao
cliente — isso vale tanto para Studio quanto para Player). Ação de voltar ao início.

---

## Apêndice A — Decisões que este documento tomou por conta própria

Marcadas ao longo do texto, reunidas aqui para revisão rápida antes de repassar ao Claude Design:

1. Rotas exatas do Studio (`(studio)/atividades/...`, `(studio)/resultados/...` etc.) são
   propostas, não uma convenção já fixada em `CLAUDE.md` além da rota de Assinatura, que
   `billing.md` já cita literalmente.
2. `(studio)/dashboard` foi tratado como sinônimo de "Atividades" (a navegação principal do
   mockup usa "Atividades" como rótulo; o dashboard existente no projeto foi assumido como sendo
   essa mesma tela, não uma terceira visão de resumo separada).
3. A forma de detectar retomada de tentativa (cookie `anonId` vs. outro mecanismo) não está
   especificada — sinalizado como algo a resolver com um estado de UI, mesmo sem a regra de
   negócio exata definida.
4. O "dono" da atividade de demonstração pública (página 1.2) é uma decisão de produto/infra, não
   assumida aqui.
5. Trial: definido em `billing.md` "Trial" (14 dias, vai exigir cartão no gateway).

## Apêndice B — O que fica pendente mesmo depois de todas as páginas desenhadas

Do `CLAUDE.md`, seção "Pendências", ainda sem resposta e com efeito direto sobre páginas deste
mapa:

- **Provedor de TTS e ASR indefinido** — afeta o tempo de espera real nas páginas 3.7 (publicar,
  estado "gerando áudio") e 4.3 (interação `speak`, tempo até o veredito de ASR chegar). O design
  pode e deve prever esses estados de espera; só não pode assumir uma duração específica.
- **Cobrança:** Stripe primeiro, atrás de interface própria (`docs/adr-002-billing.md` é citado
  em `CLAUDE.md` mas ainda não existe como arquivo neste repositório) — a página 3.13 (Assinatura)
  é a mais exposta a essa indefinição.
