---
paths:
  - 'src/lib/server/**'
  - 'src/**/*.remote.ts'
  - 'src/hooks.server.ts'
  - 'worker/**'
---

# Servidor

## Remote functions

Toda função de servidor vive em `*.remote.ts` e é chamada direto do componente. Sem DTO manual,
sem `fetch`, sem manter tipo de request e response em sincronia.

**Cada remote function é um endpoint HTTP público e endereçável.** Estar dentro de uma página
protegida não protege nada. Toda função que toca dado de professor começa assim:

```ts
export const publicarAtividade = command(schema, async (input) => {
	const teacher = requireTeacher(getRequestEvent().locals);
	// ...
});
```

Use `query` para leitura, `command` para escrita, `form` para submissão de formulário.
`form` tem suporte a schema com `input` e `issues` — é o que sustenta os formulários do Studio
gerados a partir do `authoringSchema`.

**Tudo que uma remote function retorna é serializado para o browser.** Nunca devolva entidade
do Prisma direto. Monte um DTO explícito, sempre.

**Um arquivo `.remote.ts` só pode exportar remote functions.** Qualquer outro export (um schema
Zod compartilhado, um helper) quebra o build com "all exports from this file must be remote
functions". Schema compartilhado mora em `$lib/server/...` — foi por isso que
`publicationSettingsSchema` foi parar em `$lib/server/player/settings.ts`.

Existem hoje: `(studio)/atividades/atividades.remote.ts` (o wizard inteiro — criar atividade,
adicionar material um a um ou colando uma lista, editar/remover material, trazer material da
biblioteca, gerar itens, descartar e restaurar item, aceitar todos, criar item manual, salvar
item, publicar) e
`a/[slug]/player.remote.ts` (as três funções do aluno, mais a validação do código de acesso, as
duas da retomada e o `naoSouEu` do link pessoal) e `(studio)/turmas/turmas.remote.ts` (turmas,
alunos e o envio de convite).
E `aluno/aluno.remote.ts` (`adotarMinhasTentativas` e `gravarMeuAvatar`, as duas escritas da área
do aluno) — que abre pelo `requireAluno`, não pelo `requireTeacher`: usar o guard errado daria
acesso de professor a quem não é.
E `exemplo/exemplo.remote.ts` (`corrigirExemplo`), a única sem guard nenhum, e de propósito: ela
não lê nem grava dado de ninguém, só corrige contra os itens fixos de `$lib/server/exemplo`. O
que ela tem é teto por IP, porque corrigir é CPU do mesmo processo que atende os alunos.

Nas duas, **o id vem da SESSÃO, nunca do corpo do pedido**: um `accountId` no input deixaria
qualquer pessoa adotar tentativas alheias ou trocar o avatar de um aluno — que é o que a turma dele
vê ao lado do nome. A prova de que a tentativa é deste aparelho é o `anonId` do cookie, que é
`httpOnly`. `gravarMeuAvatar` existe também em `(studio)/studio.remote.ts`, para o professor, com a
mesma disciplina — e as duas validam pelo `codigoDeAvatarSchema`, que NORMALIZA: `montarAvatar`
aguenta código podre, mas aguentar não é razão para gravar `99-99-99`.
E `(studio)/materiais/materiais.remote.ts` (a biblioteca avulsa: criar um a um ou colando uma
lista, editar e apagar), `(studio)/resultados/resultados.remote.ts` (`comentarResposta` e
`apagarTentativa` — a correção deixou de ser uma fila e virou uma ação em cima da resposta) e
`(studio)/studio.remote.ts` (`buscarNoStudio`, a busca do cabeçalho).

Os que vieram com planos, módulos e escola, cada um com o seu guard:

- `(studio)/conta/conta.remote.ts` — `solicitarPlano`, `cancelarPedido`, `agendarCancelamento`,
  `desfazerCancelamento`, `sairDaEscola`. O id vem da sessão.
- `(studio)/materiais/ia.remote.ts` — `gerarPropostasIa` e `aceitarPropostasIa` (ver "IA" abaixo).
- `(studio)/modulos/modulos.remote.ts` — CRUD de módulo (com `duplicarModulo`: atividades e ordem, sem
  turmas nem programação), acrescentar/remover/reordenar, as turmas
  do módulo (`alocarTurmas`, `desalocarTurma`) e a programação de envio (`salvarProgramacao`,
  `pausarProgramacao`, `enviarAgora`, `tentarDeNovo`). Tudo delega para
  `$lib/server/modulos/programacao.ts`, que é testável sem SvelteKit; o envio em si (preparar e
  despachar) é `$lib/server/modulos/enviar.ts`. Ver "Programação de envio" abaixo.
- `(studio)/escola/escola.remote.ts` — `requireCoordenacao` em convidar, revogar e remover;
  `requireTeacher` no `aceitarConvite`.
- `(admin)/admin/admin.remote.ts` — **`requirePlatformAdmin` em toda função** (remote function não
  passa pelo hook): ativar plano, trial, cancelar, atender pedido, créditos de cortesia, escolas,
  reenfileirar job.
- `atividades.remote.ts` ganhou `arquivarAtividade`, `desarquivarAtividade` (dentro da cota),
  `apagarAtividade` (confere o título digitado) e `definirNivel`.

**Lógica que precisa de teste mora em `$lib/server`, não no `.remote.ts`.** O SvelteKit recusa
importar um `.remote.ts` cujos exports não são remote functions de verdade — então a remote confere a
sessão e delega (`enviarModulo`, `gerarPropostas`, `gravarMateriais`, `assinaturas.ts`).

`comentarResposta` escreve com `updateMany` e o escopo no `where`, não `update` por id: é esse
filtro que impede um POST direto de comentar a resposta de outro professor, e um `findFirst`
antes seria uma checagem que a corrida entre as duas consultas poderia furar.

Leitura de página continua em `+page.server.ts`: loader é dado de página, não endpoint chamado
do componente.

**O link do aluno não é input.** Ele sai do id da atividade (`server/player/slug.ts`), então
é único por construção e estável entre publicações — não existe `slugDisponivel` nem
`slugTaken` para consultar, e `publicarAtividade` NÃO aceita `slug` no schema. Aceitar um slug
vindo do cliente seria aceitar que alguém escolhesse o endereço de outra pessoa por um POST
direto (regra nº 3: toda remote function é endpoint público).

Checkbox em `form()` precisa de campo opcional de STRING, não boolean — o SvelteKit recusa
boolean não-opcional no schema, porque checkbox desmarcado não envia nada.

## A fronteira de segurança do Player

O fluxo do aluno tem três funções e nenhuma delas recebe sessão:

- `iniciarTentativa(slug, nome)` → cria `Attempt`, gera a seed, devolve o primeiro item já
  passado por `toRuntime()`
- `responderItem(attemptId, itemId, answer)` → corrige **no servidor** e persiste a resposta
  já validada pelo `answerSchema` da interação. Nunca embrulhe o `unknown` num objeto para
  escapar do tipo do Prisma: era assim que a resposta ia para o banco como `{ answer: { text } }`
  e a tela de revisão do aluno mostrava um traço no lugar do que ele escreveu.
- `finalizarTentativa(attemptId)` → devolve o resultado, ou nada se o professor desabilitou

Regras:

- O `attemptId` é um identificador não sequencial e não adivinhável.
- Rate limit por IP em `iniciarTentativa` e `responderItem`. Sem isso, um script de três linhas
  enche o relatório do professor de lixo.
- Se a publicação exige código de acesso, ele é validado em `iniciarTentativa` e nada é
  devolvido antes disso.
- O item devolvido **nunca** contém `accepted`, `tokens` originais em ordem, ou qualquer campo
  do payload de autoria. Só o que `toRuntime()` produziu.

## E-mail

`server/email/` — `index.ts` escolhe o provedor, `smtp-provider.ts` envia, e cada e-mail tem o seu
montador sobre `base.ts` (moldura, cores, `escaparHtml`): `convite-aluno.ts`, `convite-modulo.ts`
(UM e-mail por aluno com todos os links do módulo), `convite-escola.ts`, `redefinir-senha.ts` (o link
de "esqueci a senha" das duas contas — ver auth.md "Senha") e `aviso-equipe.ts`
(pedido de plano e formulário de contato, para `CONTATO_PARA`, com Reply-To de quem escreveu).

**Todo texto que veio de uma pessoa passa por `escaparHtml`** antes de entrar no HTML — nome de
professor, título de atividade, de turma, de módulo, de escola, mensagem de contato. O convite do
aluno injetava esses nomes crus; um título com `<a href>` virava link no e-mail da turma inteira.

O formulário de contato tem campo-isca e limite por IP (`$lib/server/limite-por-ip.ts`): cada
mensagem é um e-mail, e o plano grátis do Resend dá 100 por dia — um robô travaria os convites.

**SMTP, e não a API de um provedor.** Todo serviço fala SMTP — Resend, Brevo, Mailgun, Gmail com
senha de app —, e escolher a API de um deles amarraria o produto a um fornecedor para ganhar
nada: não há webhook de entrega, nem template remoto, nem segmentação. Trocar de fornecedor é
uma linha de configuração.

**O escolhido é o Resend**, no plano grátis: `smtps://resend:re_CHAVE@smtp.resend.com:465` — o
usuário é literalmente `resend` e a senha é a API key. O plano grátis dá 3.000/mês, 100/dia e
até 3 domínios. **Sem verificar um domínio ele só entrega para o e-mail da própria conta** — o
remetente é então o compartilhado `onboarding@resend.dev`, que serve para testar e não para
mandar convite a uma turma.
`EMAIL_PROVIDER=smtp` + `SMTP_URL` + `EMAIL_FROM`; vazio continua registrando no log e não
finge que mandou — e era esse o estado de fábrica, o que fazia "não está enviando" ser a
configuração, não um defeito.

**Em dev, o caminho é o provedor de LOG** — apague `EMAIL_PROVIDER` e o convite inteiro, com o
link, sai no console do worker. Não precisa de container de e-mail nem de credencial, e é o
bastante para percorrer o fluxo do professor. Houve um `maildev` em compose próprio para isso;
ele saiu a pedido do dono do repositório, porque o log já resolvia e era um container a menos.

Quem envia é o WORKER, que roda em container: a `SMTP_URL` não é sobrescrita pelo compose
justamente porque um SMTP de verdade é sempre remoto. As opções de pool vão na própria URL — o Gmail corta quem abre muitos fluxos,
um SMTP próprio não liga, e quem opera é que sabe qual é o caso. **Tabela de 600px, cor literal, sem `var()`, sem flexbox**:
cliente de e-mail não é browser moderno. O link cru aparece sempre em TEXTO, não só atrás do
botão, porque cliente de e-mail engole botão; o código de acesso vem depois dele, como terceira
alternativa. Sem pixel de rastreio e sem imagem remota — a abertura só é registrada quando o
aluno clica.

`process.env` e não `$env/dynamic/private`, porque o worker importa este módulo fora do
SvelteKit — mesma razão do `server/tts`.

## Fila

Tabela `Job` no Postgres, sem Redis. O worker faz poll com `SELECT ... FOR UPDATE SKIP LOCKED`,
que é a primitiva que dá exclusão mútua entre workers concorrentes.

```
Job { id, type, payload JSON, status, attempts, lockedUntil, runAfter, lastError }
```

Tipos: `tts`, `convite`, `convite-modulo`, `convite-escola`, `aviso-equipe`, `envio-programado`, `redefinir-senha`. Cada um tem o schema e o
`enqueue…` em `server/queue/index.ts` e o caso em `worker/index.ts`. **Suba o worker antes (ou junto)
do web** quando criar um tipo: tipo desconhecido lança erro e vai para `failed`. Os jobs falhados
aparecem no painel interno (`/admin`), com "Tentar de novo".

Regras: todo job é idempotente, tem número máximo de tentativas, e falha com backoff.
Um job que estourou as tentativas vai para `failed` e aparece no painel — nunca some em silêncio.

**O worker DRENA a fila; só dorme quando ela está vazia.** Havia um `setTimeout` de 2 s depois de
CADA job, então publicar dez áudios custava vinte segundos de sono puro — mais do que a síntese
inteira levava. Medido nos mesmos dez áudios: **53,9 s antes, 35,4 s depois**.

**Concorrência: três, e para TTS ela não acelera nada.** Também medido — 10 áudios em 34,0 s com
concorrência 1, 35,4 s com 3, 36,9 s com 6. O serviço de áudio é CPU-bound nos 2 vCPU dele: duas
sínteses em paralelo levam o dobro do tempo de uma (1,0 s → 2,0 s), quatro levam o quádruplo. Não
existe vaga ociosa para preencher. O que a concorrência serve é os jobs de `convite`, onde a
espera é de REDE: trinta convites em série são trinta idas e voltas somadas. `WORKER_CONCURRENCY`
ajusta, e o teto de verdade do TTS continua sendo a máquina do serviço de áudio.

Se o volume crescer a ponto de o poll pesar, aí sim BullMQ. Não antes.

### Programação de envio — job agendado, sem cron

O envio programado de um módulo (`docs/adr-004-modulos-e-nivel.md`, atualização) usa a própria fila:
cada instante programado vira um job `envio-programado` com `runAfter`. **O job só diz QUAL alocação
acordar** (`{ allocationId }`); o que sai é decidido pelo banco na hora, em `processarEnviosDevidos`.
Por isso reprogramar não precisa achar e apagar job velho: ele acorda, não encontra nada devido e
termina. As regras que seguram isso:

- **A data vem de `agendar`** (`$lib/modulos/programacao.ts`, pura), a mesma conta que a prévia da
  tela faz. Datas são texto `AAAA-MM-DD` e o instante sai de `instanteDe`, em Brasília.
- **Cada `ModuleSend` é reivindicado com `updateMany` condicionado ao estado lido** (`status` +
  `updatedAt`) antes de despachar: dois workers acordados no mesmo instante não mandam o mesmo
  e-mail. Se o despacho falhar, as linhas voltam para `programada` e o job tenta de novo.
- **O que não pode sair vira `nao_saiu` com o motivo, e não pula para a seguinte.** Áudio faltando
  agenda uma nova tentativa em 5 minutos (até 6); rascunho é destravado por `publicarAtividade`
  (`liberarEnviosQueEsperavamPublicacao`).
- **O canal é da programação** (`Programacao.canal`, `email` | `mapa`, padrão `email` — o que já
  estava gravado continua mandando e-mail). Em `mapa`, `despacharEnvio` cria os convites para todos
  os alunos, grava `Delivery.porEmail = false` e não enfileira `convite-modulo`; `cargaPorDia` não
  conta essa alocação no teto de 100 e-mails.
- **O worker monta os links do e-mail com `ORIGIN`** (ou `BETTER_AUTH_URL`), porque não há request.
  Na tela ("tudo agora", "enviar agora") vale a origem do request, como no envio de atividade.

## TTS

**Gerado na publicação, nunca em runtime.** O aluno recebe arquivo estático.

O hash é `hash(texto, voz, velocidade)` — o que torna a geração idempotente. Gere sempre duas
velocidades: normal e reduzida. Elas são os ARQUIVOS; o degrau de 0,5× do player sai de
`playbackRate` (components.md "Áudio").

**O arquivo é MP3, não WAV** (`TTS_EXTENSAO`). Voz mono de 24 kHz comprime ~6x — medido: 222 kB
viram 35 kB numa frase de 4,6 s —, e o que se perde é inaudível na faixa da fala. A prova é o
caminho mais duro que existe: o Whisper transcreve o MP3 palavra por palavra igual ao WAV. Cada
questão de escuta são dois arquivos, servidos a cada aluno que abre o link.

**A chave do objeto leva o PROFESSOR: `tts/<teacherId>/<hash>.mp3`**, e `MediaAsset` é único por
`(teacherId, hash)` (db.md). O hash já identifica o conteúdo, então o prefixo não precisa dizer
de onde a frase veio — e não DEVE: material é facilitador de montagem, e apagar um não pode
mexer numa atividade no ar.

**A voz varia por FRASE.** `LanguageProfile.tts.voices` é uma LISTA, e `vozDoTexto`
(`kernel/language/voice.ts`) escolhe uma a partir do texto — determinística, sem estado,
calculável no servidor, no worker e ao montar a questão. Uma atividade inteira na mesma voz
treina o aluno a entender aquela pessoa, não o idioma. Saindo do texto, a frase soa igual toda
vez que ele a encontra e o arquivo continua sendo um só.

**Lista de vozes vazia = sem item de escuta naquele idioma.** É o caso do árabe hoje: o modelo
não fala. Sem esse corte o gerador produzia item de escuta cujo TTS o provedor recusa, e a
publicação ficava travada em "gerando áudio" para sempre.

**O áudio vive 10 dias.** Quem apaga é a regra de ciclo de vida do próprio bucket, ancorada no
prefixo `tts/` (o container `init` de `docker/minio.yml` a escreve); `TTS_DIAS_DE_VIDA`
(`server/tts/index.ts`) é a MESMA data do lado de cá, gravada em `MediaAsset.expiresAt`. Os dois
prazos têm de bater: divergindo, o banco aponta para objeto que já sumiu — ou o bucket guarda
lixo que ninguém pede.

**Quem enfileira é a GERAÇÃO dos itens, não a publicação.** A etapa 4 só libera o botão quando
todos os arquivos existem, e enfileirar apenas dentro de `publicarAtividade` era um impasse: o
professor não conseguia publicar porque faltava áudio, e o áudio não era pedido porque ele não
conseguia publicar — a tela ficava em "0 de 10" para sempre. Isso não aparecia enquanto
`TTS_PROVIDER` estava vazio, porque aí o gerador não produz item de escuta e o contador nasce
em "0 de 0". Gerando na etapa 2, a síntese acontece enquanto ele revisa na etapa 3.

O `load` da etapa 4 e o `publicarAtividade` chamam o MESMO helper para repor o que faltar —
item editado depois de gerado tem texto novo, logo hash novo. Enfileirar de um `load` é efeito
colateral num GET, e é deliberado: `enfileirarAudioFaltante` pula o que tem áudio válido e o que
já está na fila, então recarregar não multiplica trabalho.

**E o contador anda sozinho.** Quem sintetiza é o worker, noutro processo; a etapa 4 recarrega o
loader a cada 3 s enquanto falta alguma coisa e para quando termina. Sem isso o áudio ficava
pronto e a tela não sabia.

Atividade com áudio pendente não fica acessível pelo link.

**Quem repõe o áudio expirado é a ENTRADA do Player**, não a publicação: publicar é um evento
único, e a atividade de duas semanas atrás ficaria travada em "gerando áudio" para sempre. O
loader de `a/[slug]` chama `enfileirarAudioFaltante` (`server/tts/enfileirar.ts`) antes de
devolver o 503 de `audioPending`, e é o mesmo helper que `publicarAtividade` usa. Ele é
idempotente nas duas pontas — pula o que tem `MediaAsset` válido e pula o que já está na fila —,
porque aquela tela é pública: trinta alunos abrindo o link juntos não podem virar trinta jobs.

**A URL do áudio não é gravada no `Item`.** Ela é derivada na hora de montar a questão
(`itemAudioRefs` em `server/player/runtime.ts`, que devolve `{ contentUnitId, hash }`), porque
escrever o `mediaId` depois da publicação seria `UPDATE` numa versão publicada — proibido pela
regra inviolável nº 7.

**Áudio faltando barra as DUAS saídas, no servidor.** `publicarAtividade` recusa e diz quantos
faltam; `enviarParaTurmas` também — mandar trinta e-mails de uma atividade cujo link responde
503 é fazer a turma inteira bater numa porta fechada, e o professor só descobre pelo aluno que
reclamou. Os dois enfileiram o que falta de passagem, para o caminho de conserto não depender de
o professor achar um botão.

**"Gerar áudio de novo" (`regerarAudio`) APAGA as linhas antes de enfileirar.** Enfileirar
sozinho não bastaria: o worker pula o que já existe e não expirou, e a regra de ciclo de vida do
bucket conta a partir da última gravação do objeto — só reescrevendo o arquivo o relógio dos 10
dias recomeça. A tela já desabilita a ação, mas toda remote function é endpoint
público (regra nº 3) e versão publicada é imutável (regra nº 7): um POST direto congelaria para
sempre uma atividade cujas questões de escuta não tocam, e nem republicar consertaria para quem
abriu o link no meio.

`TTS_PROVIDER` vazio significa **sem item de escuta**, não item mudo: o gerador nem produz.
`TTS_PROVIDER=audiotext` é o microserviço de Whisper + Kokoro (`../audiotext-service`, o outro
projeto do workspace), que fala com o produto por `server/audiotext/client.ts`.
`TTS_PROVIDER=stub` continua ligando um WAV silencioso (`tts/stub-provider.ts`), para exercitar
fila, storage e a espera da publicação sem subir o serviço de áudio.

## ASR

`MediaRecorder` no browser (webm/opus) → upload → transcrição → comparação normalizada.

**A transcrição acontece no SERVIDOR, e o browser manda som — nunca veredito.** O
`answerSchema` do `speak` é `{ transcript }`, então deixar o cliente preenchê-lo era deixar o
aluno digitar a resposta que quisesse: a correção continuaria "no servidor" corrigindo um texto
que o próprio aluno escolheu (regra inviolável nº 2). Quem recebe o áudio é
`routes/a/[slug]/fala/+server.ts` (e, na atividade de exemplo, `routes/exemplo/fala/+server.ts`,
com teto por IP no lugar da tentativa e sem guardar nada; paginas.md "Exemplo").

**É um endpoint, não uma remote function** — o único caminho do Player que sobe binário. Remote
function fala JSON, e áudio em base64 infla 33%. Ele segue todas as regras do Player mesmo
assim: sem sessão, autorizado pelo `attemptId` (imprevisível), conferindo que a tentativa é
DESTA publicação, que o item existe nela e que ele é mesmo de fala.

Os `hints` do `LanguageProfile` e do payload de autoria vão para o serviço de áudio, nunca para
o browser: é a única parte do gabarito que atravessa, e atravessa para o modelo.

Limite a duração do áudio — ASR é cobrado por minuto. O teto do lado do aluno é de **10 s**
(`client/gravacao.svelte.ts`, que encerra sozinho quando ele para de falar) e o do servidor é
10 MB.

**A gravação é descartada, A NÃO SER que o aluno autorize guardá-la.** A pergunta é feita na
ENTRADA da atividade, antes da primeira questão, desmarcada por padrão, e a resposta vive em
`Attempt.audioConsent` — é dado pessoal novo (auth.md), então consentimento presumido está fora
de questão. Sem a marca, o comportamento é o de sempre: transcreve e joga fora.

Com a marca, o objeto vai para `fala/<attemptId>/<itemId>.<ext>` e vive **7 dias** — contra os
10 do áudio de atividade, porque aquele é conteúdo do professor e se regenera sozinho, e este é
a voz de uma pessoa e não se recria. O prefixo `fala/` **não tem leitura anônima**: quem serve é
`resultados/[activityId]/[attemptId]/audio/[itemId]`, uma rota do Studio com o `teacherId` no
`where` da consulta. Uma URL pública ali seria a voz de um aluno acessível a quem descobrisse o
endereço.

Guardar acontece DEPOIS de gravar a resposta: falha no bucket não pode custar ao aluno a
resposta que ele acabou de dar.

**Dois modos, um endpoint.** `modo=ouvir` só transcreve e devolve o texto: é o que a tela chama
assim que a gravação para sozinha, para o aluno ver o que foi entendido ANTES de enviar — e
decidir entre enviar e regravar. O modo padrão corrige e grava. Os dois passam pelas mesmas
checagens (tentativa desta publicação, item de fala): ouvir também é uma chamada de ASR paga com
CPU. E o Whisper roda UMA vez por gravação: `server/asr/pre-transcricao.ts` guarda a
transcrição por (tentativa, item) com o hash dos bytes, na memória do processo web, por 10
minutos; o "Verificar" chega com os mesmos bytes e reaproveita. Regravou, o hash não bate,
transcreve de novo. Não é transcrição AO VIVO, palavra por palavra — o motor trabalha sobre o
áudio inteiro; mostrar outro motor (o do browser) enquanto o aluno fala mostraria uma coisa e
corrigiria outra.

Serviço de áudio fora do ar vira **503 com mensagem**, nunca 500 na cara do aluno no meio do
exercício: `speak` nunca reprova de forma dura (kernel.md) e o "Pular" do rodapé é o caminho.

`ASR_PROVIDER` vazio significa **sem item de fala** — o gerador nem produz.

## A fila do serviço de áudio

**Serializar não é limitar, e essa era a lacuna.** O semáforo dentro de cada motor já impedia
duas inferências ao mesmo tempo, mas trinta alunos apertando "Verificar" no mesmo segundo
viravam trinta threads, cada uma segurando o áudio inteiro na memória, todas paradas na fila do
mesmo modelo. O primeiro respondia em um segundo e o trigésimo em quarenta — tempo em que o
browser dele já desistiu, mas o servidor continua trabalhando para ninguém.

`audiotext-service/app/fila.py` acrescenta o **teto de espera**: passando dele, 503 imediato com
`Retry-After`. Verificado com 20 pedidos simultâneos contra um teto de 9 — 11 recusados na hora,
9 atendidos. `/v1/info` expõe `queues` (simultâneos, teto, quantos agora), que é o que responde
"está devolvendo 503 porque caiu ou porque está cheio?" sem abrir o log.

Do lado de cá o 503 já tem tratamento: em `speak` ele vira a mensagem de pular a questão, e o
worker da publicação tenta de novo com backoff.

## IA — "Gerar com IA" (Gemini)

`docs/adr-003-ia-gemini.md`. Resumo das regras:

- A IA **propõe material**, nunca exercício, e nada entra na biblioteca antes de o professor marcar e
  confirmar. Aceitar passa por `gravarMateriais` (cota de estoque, reaproveitamento).
- Atrás de interface própria (`server/ia/provider.ts`); `LLM_PROVIDER` vazio = desligada. O id do
  modelo vem de `GEMINI_MODEL`, nunca do código.
- Saída estruturada (`responseJsonSchema` saído do mesmo Zod que valida a volta) e **revalidação de
  tudo** contra `contentUnitSchemas` — o provedor não é confiável para dizer que respeitou o formato.
- O prompt só leva rótulos de idioma do `LanguageProfile` (sem `if` por idioma) e o texto do
  professor delimitado, como dado. Nunca dado de aluno, nunca a nota privada do professor.
- Créditos: débito ANTES da chamada (transação curta, `refKey` = `requestId` do cliente), chamada
  FORA da transação com teto de tempo, estorno do que não serviu.

## Mídia

Storage S3-compatível, chave por hash. Nada de nome de arquivo derivado de input do usuário.
Áudio é servido em toda questão de listening, então prefira um provedor sem cobrança de egress.

O objeto vive sob `tts/<teacherId>/`: o prefixo é escopo de tenant, não procedência.

Em dev é o **MinIO** de `docker/minio.yml`, que tem compose e volume PRÓPRIOS — o banco e a
aplicação também têm os deles, e é o que impede reconstruir a aplicação de encostar em áudio
publicado. O container `init` cria o bucket, dá leitura anônima SÓ ao prefixo `tts/` (o resto do
bucket não tem por que ser público) e importa a regra de ciclo de vida — `import`, e não
`rule add`, porque subir o compose de novo não pode empilhar uma segunda regra igual.

## Prisma 7

ESM, sem engine Rust, e o driver adapter de Postgres (`@prisma/adapter-pg`, sobre `pg`) é
instalado explicitamente — a versão 7 não empacota mais os drivers. Instância única exportada de
`$lib/server/db/client.ts`, nunca criada ad hoc. O worker importa a mesma instância.
