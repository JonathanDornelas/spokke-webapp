---
paths:
  - 'prisma/**'
  - 'src/lib/server/db/**'
---

# Banco

PostgreSQL 16. Decisão de infra, não negociável.

## Modelo

```
Teacher ─┬─ Activity ─┬─ ActivityVersion (imutável) ─── Item
         │            └─ Publication (slug, settings)
         ├─ ContentUnit
         ├─ ContentUnit
         └─ MediaAsset (hash, url, kind, duration)   [não vence; sai com a última atividade]

Attempt (audioConsent) ─ AttemptItem (answer, score, ms, audioKey, audioExpiresAt)   [7 dias]

Publication ─── Attempt (name, anonId, seed) ─── AttemptItem (answer, score, ms)

Teacher ─┬─ Classroom ─── Student ─┬─ Invite ─── Delivery ─── Publication
         │                         └─ Attempt (studentId, opcional)
         ├─ Module ─┬─ ModuleActivity (position) ─── Activity       [N:N, ordenado]
         │          └─ ModuleClassroom (schedule) ─┬─ Classroom     [turma alocada]
         │                                          └─ ModuleSend (dueAt, status) ─── Activity
         ├─ AuditEvent (actor, type, data)   PlanRequest (pedido de plano)
         ├─ CreditEntry (delta, cicloInicio, refKey único)            [livro-razão]
         └─ SchoolMembership ─── School ─── SchoolInvite (token)      [plano Scholar]
Teacher ─── Notification (kind, key, data, count, readAt)          [o sino; docs/notificacoes.md]
Teacher ─── ProviderSubscription (id do provedor, plano, ciclo, status)   [Mercado Pago]
Job (fila)   ProviderEvent (idempotência do gateway)
Attempt ─── ProblemReport (motivo, status, contexto)      [relato do aluno; 180 dias]
```

**Perfil no `Teacher`**: `idiomas` (os que ele ensina, em ORDEM — o primeiro é o padrão da atividade
nova) e `idiomaDosAlunos` (padrão `pt-BR`). Não são campos do Better Auth: quem escreve é
`contaProfessor(teacher)` (`repos/teachers.ts`), filtrando pela lista de idiomas do produto.

**Cobrança no `Teacher`** (`docs/adr-002-billing.md`): `plan` guarda o NOSSO id (`basico` | `pro` |
`super`; `scholar` vem da filiação, nunca daqui), `trialEndsAt`, `planCycle`, `cycleAnchor` (âncora
dos créditos) e `cancelAtPeriodEnd`. A situação (trial vencido, carência) é DERIVADA dessas datas na
leitura. Só `$lib/server/billing/assinaturas.ts` escreve esses campos.

`Activity.archivedAt` tira a atividade do estoque do plano e fecha o link para quem ainda não
começou; `Activity.level` é o rótulo CEFR (`docs/adr-004-modulos-e-nivel.md`). `Delivery.envioId` e
`moduleId` agrupam a liberação de um módulo inteiro. `Delivery.porEmail` (padrão verdadeiro) é
falso em TODA liberação de módulo (módulo não manda e-mail): o convite nasce para TODOS os alunos —
é ele que abre a fase no mapa — e nenhum e-mail entra na fila. Os `Delivery` antigos com
`porEmail` verdadeiro são de quando o módulo mandava e-mail. "Envio", nos nomes internos
(`ModuleSend`, `enviada`, `processarEnviosDevidos`), é a liberação.

**Apagar uma atividade de vez** obedece aos três FKs `RESTRICT` (`Publication→ActivityVersion`,
`Attempt→Publication`, `AttemptItem→Item`): tentativas, depois publicações, depois a atividade —
`atividades(teacher).apagarDeVez`. Não troque esses RESTRICT por Cascade: são eles que impedem que
apagar um professor leve respostas de aluno por acidente.

`ContentUnit.targetLang` é a TAG DE IDIOMA do material (nula = sem idioma; `$lib/idiomas.ts`). Dentro
de uma atividade é sempre a dela — `createForActivity` e `link` a gravam, e só dão tag a quem não tem.
Na biblioteca, a escolhida; e ela só muda enquanto o material não está em atividade nenhuma.

`Notification` é o aviso do sino (docs/notificacoes.md). `key` AGRUPA enquanto não lida — o evento
com a mesma chave atualiza `count` e `data` em vez de criar outra linha —, e o texto NÃO é gravado:
sai de `kind` + `data` na leitura (`$lib/notificacoes`), com Zod. Escreve só
`$lib/server/notificacoes`; lê só `repos/notificacoes.ts`, escopado pelo professor.

`ProblemReport` é o relato de problema que o aluno manda de uma questão (auth.md "Dados do aluno e
LGPD", a terceira coleta). `contexto` é Json validado ao gravar (`server/relatos/schema.ts` para o que
o navegador manda; o resto o servidor monta do banco): a questão de autoria COM o gabarito, a
resposta da tela, a correção refeita, o aparelho e o diário da página — sem nome e sem IP. Tem
`teacherId` (para a intranet saber de quem é a atividade) e `attemptId` com `onDelete: Cascade`:
apagar a tentativa leva o relato. Escreve o Player (`repos/relatos.ts`, criar) e o worker (marcar,
purgar); LÊ só a intranet. Nenhuma tela do Spokke mostra relato, nem ao professor.

`CreditEntry` não tem contador ao lado: saldo = franquia do plano + soma dos lançamentos do ciclo.

**Turma do módulo e programação** (`docs/adr-004-modulos-e-nivel.md`, atualização):
`ModuleClassroom` é a turma ALOCADA ao módulo, única por par, e guarda a programação de envio em
`schedule` (Json, validado por `programacaoSchema` ao ler; nulo = sem programação) e a pausa em
`pausedAt`. `ModuleSend` é UMA linha por (alocação, atividade), com `dueAt` e o desfecho
(`programada` | `enviada` | `nao_saiu` | `pulada`, mais `reason`). Essa unicidade é o que torna o
envio idempotente: a atividade sai uma vez por turma pelo módulo. Nenhuma das duas tem
`teacherId`; o escopo é `module: { teacherId }` (`repos/programacoes.ts`). Tirar a turma apaga a
alocação e os envios futuros (Cascade), e os `Delivery` que já saíram ficam — o link é da
atividade.

`StudentAccount` é a conta OPCIONAL do aluno, com tabelas próprias de sessão e credencial (a
segunda instância de Better Auth — auth.md). `Student.accountId` liga a ficha de chamada a ela, e
só por um token: o do convite de atividade ou o do convite de CONTA (`accountInviteToken`, único,
com `accountInviteSentAt` marcando quando o e-mail saiu); `Attempt.accountId` guarda quem respondeu LOGADO. Os dois são
independentes de `studentId`: dá para responder logado sem estar na chamada de ninguém, e para
estar na chamada sem ter conta. Os três campos são `SetNull` — apagar conta ou aluno não apaga a
resposta de terceiro.

`Attempt.studentId` é **opcional, e nulo é o caminho normal**: o aluno entrou pelo link aberto e
a tentativa vale igual no relatório. Ele só chega preenchido quando o aluno veio por um link
pessoal, ou quando se identificou depois e as respostas daquele aparelho foram vinculadas. Por
isso a relação é `onDelete: SetNull` — apagar um aluno cadastrado não pode levar junto a
tentativa de quem entrou pelo link aberto.

## Versionamento imutável

Se o professor edita a atividade enquanto alunos respondem, tudo desalinha e o relatório dele
fica errado. `Publication` aponta para uma `ActivityVersion` congelada. Editar cria versão nova;
o professor decide se republica. `Attempt` guarda a versão com que começou.

Nunca faça `UPDATE` em `ActivityVersion` ou `Item` de uma versão publicada.

`AttemptItem` guarda o retorno do PROFESSOR junto da resposta: `comment`, `reviewedScore` e
`reviewedAt`. A nota do professor fica **separada** da automática em vez de sobrescrever
`score` — as duas verdades (o que a máquina achou e o que ele decidiu) é o que permite
desfazer a correção manual sem recorrigir. `reviewedAt` nulo num item de rubrica significa
"ainda não corrigida", nunca "errou".

`Activity` guarda `itemTarget` e `skills`: o que a etapa 1 do wizard passou a perguntar. Ficam
na ATIVIDADE e não na versão porque são preferência do professor — regerar os itens tem que
respeitar a mesma escolha sem ele repetir nada. A habilidade de cada ITEM continua derivada
(kernel.md); isto é o filtro aplicado sobre o que os geradores produziram.

`AttemptItem` tem `@@unique([attemptId, itemId])`: **uma resposta por item por tentativa**, e
`recordAnswer` é `upsert`. Com `create`, voltar para uma questão ou um clique duplo no
"Verificar" criava uma linha nova e o item contava duas vezes na distribuição de acerto do
professor — o banco de dev já tinha seis pares duplicados quando a restrição entrou.

`Item.discarded` é a etapa de revisão: descartar MARCA, não apaga — sem isso "Restaurar" não
teria o que restaurar. A publicação é que remove os descartados de vez, porque a versão
publicada é imutável e carregar item morto nela não faz sentido.

**Rascunho é uma `ActivityVersion` SEM `Publication`.** É essa a distinção que o código usa
(`atividades(teacher).draft()`): gerar itens reescreve o rascunho, publicar cria a `Publication`
que congela aquela mesma versão, e a edição seguinte abre a próxima. Não existe tabela de
rascunho à parte — e por isso `replaceDraftItems` procura a última versão _sem publicação_ antes
de escrever qualquer coisa.

**Nada disso tem nome na interface.** `versionNumber` é chave interna: o professor vê uma
atividade só, com estado (rascunho / no ar / no ar com mudanças por publicar). Ver paginas.md.
Duas consequências no repositório, as duas nascidas de bug:

- **`draftFromPublished(activityId)`** é o que "Editar atividade" usa. Publicar apaga o
  rascunho, então a tela de revisão abria VAZIA depois de publicar — a atividade sumia da frente
  do professor e o único caminho era gerar tudo de novo. A função devolve o rascunho quando já
  existe e, quando não, CLONA os itens do que está no ar numa versão nova. A publicada não é
  tocada (regra nº 7). É idempotente porque é chamada de um loader.
- **`publishDraft` move o link.** `Publication.slug` é `@unique` no produto inteiro, então
  republicar com o mesmo endereço estourava `Publication_slug_key`: o professor clicava,
  aparentemente nada acontecia, e sobrava uma versão sem publicação. A publicação anterior
  **não** é apagada (as tentativas apontam para ela) — o slug dela vira `<slug>~<versão>`, que
  nenhum professor consegue escolher (o dele é `^[a-z0-9-]+$`, sem `~`). Quem está respondendo
  não sente nada: o Player resolve a questão pelo `attemptId`, não pelo slug.

`Activity` guarda `sourceLang`/`targetLang` (tags de `LanguageProfile`): o par é escolhido na
etapa 1, antes de existir qualquer item, e define tokenização, direção e normalização.

## MediaAsset — o áudio é identificado pelo CONTEÚDO

**A identidade é `hash(texto, voz, velocidade)`, única por professor.** A chave no bucket é
`tts/<teacherId>/<hash>.mp3`, e a voz também sai do texto (`vozDoTexto`).

O dono passou por quatro lugares, e a história é o desenho:

1. **Hash global** — economizava tudo, mas a atividade publicada no 9º dia herdava um arquivo
   que morria no 10º.
2. **Atividade** — sobrevivia à expiração e sintetizava a mesma frase de novo a cada atividade.
3. **Material** — parecia certo, porque é de onde o texto sai. Não era: material é um
   FACILITADOR de montagem, e com `onDelete: Cascade` apagar um da biblioteca derrubava o áudio
   de uma atividade NO AR — o link ia a 503, a entrada tentava repor, e o worker estourava em
   foreign key até o job ir para `failed`. O link não voltava nunca mais.
4. **Conteúdo, escopado por professor** — o que está aqui.

O que a quarta resolve que as outras não: a atividade não depende de nada que o professor possa
jogar fora, a mesma frase em dois materiais é UM arquivo, e regerar funciona sempre porque o
texto está congelado no item (regra nº 7), não no material. A entrada do Player REPÕE o que
faltar (server.md "TTS").

**O áudio de atividade não vence.** Ele vivia 10 dias (regra de ciclo de vida no bucket mais uma
coluna `expiresAt` espelhando a data), e a entrada do Player resintetizava o vencido — um link de
três semanas abria em "gerando áudio". Com o limite de atividades por plano o estoque é finito, e
a coluna saiu (migration `audio_de_atividade_nao_vence`, que apagou antes as linhas vencidas:
sem a coluna elas contariam como prontas apontando para objeto que já não existia). Linha que
existe é arquivo que existe.

**Quem apaga é `limparAudioSemUso`** (`server/tts/limpeza.ts`), chamado por `apagarAtividade`:
"hashes de todos os itens que ainda existem" contra "áudios do professor", e o que sobra sai —
objeto primeiro, linha depois, para uma falha do bucket ser tentada de novo na próxima vez. A
conta é por conteúdo de propósito: a mesma frase em duas atividades é um arquivo só, e apagar
uma não leva o áudio da outra. Arquivar não apaga nada (desarquivar devolve tudo).

Regenerar reescreve `url` na mesma linha (`upsert`), nunca cria uma segunda.

## A gravação do aluno — 7 dias, e só com autorização

`AttemptItem.audioKey` guarda a CHAVE no bucket, não uma URL: o objeto é privado e quem serve é
uma rota do Studio que confere o dono (auth.md "A gravação de voz"). `audioExpiresAt` espelha a
regra de ciclo de vida de `fala/`, que são **7 dias** — o único prazo que sobrou no bucket: o
áudio de atividade é conteúdo do professor e não vence, e este é a voz de uma pessoa, gravada uma
vez.

As duas colunas só são preenchidas quando `Attempt.audioConsent` é verdadeiro. Esse campo fica
na TENTATIVA e não no aluno porque é isso que a pergunta significa: ele autorizou esta atividade,
neste dia.

## JSON no Postgres

`Item.prompt`, `Item.interaction`, `Item.grading`, `Item.locale` e `Publication.settings` são
JSON — o Prisma mapeia o tipo `Json` do schema para `jsonb` por padrão no Postgres.

- **Sempre valide com Zod ao ler.** O tipo do Prisma para JSON não garante nada.
- Para filtrar por dentro do JSON, crie um índice `GIN` sobre a coluna `jsonb` (ou uma expressão
  específica, ex. `(interaction->>'type')`). Faça isso reativamente, quando a query aparecer —
  não preventivamente.
- Não use full-text nativo do Postgres para conteúdo multilíngue — a configuração de idioma do
  `tsvector` é por coluna, não por linha, e este produto mistura idiomas na mesma tabela. Se
  busca virar requisito, plugue um mecanismo externo. Não é problema de MVP.

## Repositórios

Todo acesso a dado de professor passa por `$lib/server/db/repos/`, que exige o `Teacher` e
injeta o `teacherId` no filtro. Ver `.claude/rules/auth.md`.

`materiais(teacher).createForActivity` **reaproveita em vez de duplicar**: antes de criar, ele
procura um material equivalente do mesmo professor (`findEquivalent` — igualdade de `jsonb`,
que ignora a ordem das chaves, mais o mesmo `kind`) e liga aquele à atividade. Cadastrar a
mesma frase duas vezes criava duas linhas na biblioteca e o professor passava a ver duplicatas
que ele não fez. Ele devolve `{ id, reused }` — é o `reused` que a tela mostra como
"biblioteca".

**Repositório que participa de escrita com cota aceita `db: Db`** (o cliente ou a transação —
`src/lib/server/db/client.ts`): `atividades`, `materiais`, `uso` e `creditos`. Dentro de `comCota`
toda escrita vai pelo `tx`; com o `prisma` global ela iria por outra conexão, fora da trava.

Ligar duas coisas do professor (atividade em módulo, publicação em turma) confere **as duas pontas**:
conferir só uma deixaria um POST direto usar o recurso de outra pessoa.

As leituras ENTRE professores (painel interno e coordenação da escola) têm repositórios próprios que
só aceitam o escopo marcado do guard — `repos/admin.ts` e `repos/escola.ts` (auth.md).

O Player tem repositórios próprios, sem professor, com superfície mínima: resolver publicação
por slug, criar tentativa, gravar resposta.

Loader de página pode ler agregado direto do `prisma` (contagem de acerto, tentativas) — o que
ele NÃO pode é ler sem escopo: o `teacherId` entra no `where` mesmo quando a atividade já foi
resolvida pelo repositório. Repetir o escopo não custa nada e é ele que impede o vazamento.

## Migrations

`prisma migrate dev` em desenvolvimento, `prisma migrate deploy` no CI. Nunca edite migration
já aplicada. Nunca `db push` fora de protótipo local.

Migration que renomeia ou remove coluna com dado precisa de passo de cópia antes — este produto
tem dado de aluno que não pode ser perdido.
