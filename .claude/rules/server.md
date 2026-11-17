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

Existem hoje: `(studio)/atividades/atividades.remote.ts` (o wizard inteiro — criar atividade e
editar os detalhes dela (`editarDetalhes`), adicionar material um a um ou colando uma lista,
editar/remover material, trazer material da biblioteca, o plano de geração
(`salvarPlanoDeGeracao`, `previaDoMaterial`), começar a geração e acompanhá-la (`gerarItens`,
`progressoDaGeracao`), descartar e aceitar questão, aceitar todas, responder a questão no palco
da revisão (`corrigirNaRevisao`, que corrige SEM gravar pelo `corrigirSemGravar` de
`server/player/veredito.ts` — o mesmo da atividade de exemplo — com a seed do runtime do palco),
mudar a ordem do roteiro
(`reordenarQuestoes`, que recusa a lista que não for exatamente a das de dentro), o editor de
questão (`questaoParaEditar`,
`previaDaQuestao`, `salvarQuestao`, que também cria do zero), publicar) e
`(studio)/atividades/[id]/previa/previa.remote.ts` (`corrigirResposta`: a correção da PRÉVIA DO
ALUNO, sem gravar nada, pelo `corrigirNaPrevia` de `$lib/server/atividades/previa.ts`, com a seed da
versão — a fala vai pelo endpoint `previa/fala`) e
`a/[slug]/player.remote.ts` (as três funções do aluno, mais a validação do código de acesso, as
duas da retomada, o `naoSouEu` do link pessoal e o `relatarProblema` — sem sessão, com a tentativa
como prova de origem, teto por IP e a lógica testável em `$lib/server/relatos`) e
`(studio)/turmas/turmas.remote.ts` (turmas, alunos e o envio de convite).
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
  Gerar a partir de FOTO ou VÍDEO vai por `(studio)/materiais/ia/arquivo/+server.ts`, um endpoint
  multipart pelo mesmo motivo da fala do aluno (arquivo em base64 dentro de JSON infla 33%), com
  o guard do professor e o mesmo `gerarPropostas`.
- `(studio)/materiais/traducao.remote.ts` — `sugerirTraducao`, a tradução sugerida enquanto o
  professor digita, com as outras traduções certas (`alternativas`, pelo mesmo filtro das questões
  de tradução: `variantesDaFrase`); não grava nada (ver "Tradução do material" abaixo).
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
  `apagarAtividade` (confere o título digitado), `definirNivel` e `renomearAtividade` (o título,
  editado no lugar na tela da atividade; `atividades(teacher).renomear`, que só toca a do
  professor) — e as versões EM MASSA da lista:
  `arquivarAtividades`, `desarquivarAtividades` (todas cabem na cota, ou nenhuma muda) e
  `apagarAtividades` (confere "apagar" digitado). `materiais.remote.ts`, o mesmo para a biblioteca:
  `apagarMateriais`, `arquivarMateriais` e `desarquivarMateriais` (dentro da cota). Os ids vêm da
  tela, o escopo vem da sessão: o repositório só toca o que é do professor, e o id de outro passa em
  silêncio.

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
- Se a publicação exige código de acesso, ele é a PRIMEIRA tela: o loader da entrada manda para
  `/codigo` quem ainda não passou por ele (`precisaDoCodigo`, `server/player/access-code.ts`). E
  `iniciarTentativa` o confere de novo, porque um POST direto não passa pela entrada — nada é
  devolvido antes disso.
- O item devolvido **nunca** contém `accepted`, `tokens` originais em ordem, ou qualquer campo
  do payload de autoria. Só o que `toRuntime()` produziu.

## E-mail

`server/email/` — `index.ts` escolhe o provedor, `smtp-provider.ts` envia, e cada e-mail tem o seu
montador sobre `base.ts` (moldura, cores, `escaparHtml`): `convite-aluno.ts`, `convite-escola.ts`,
`convite-conta.ts` (o convite para o aluno da chamada criar a conta — auth.md),
`redefinir-senha.ts` (o link
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

**Todo e-mail sai da moldura de `server/email/base.ts`** (faixa azul com o logo, corpo branco,
rodapé claro) e dos ajudantes dela (`secao`, `rotulo`, `titulo`, `paragrafo`, `botao`,
`linkReserva`, `nota`) — nenhum e-mail monta a própria casca. A tabela do conteúdo é
`width="100%"` com `max-width:600px`, com uma tabela fixa de 600px só para o Outlook: o
`width:600px; max-width:100%` de antes estourava no Gmail do celular. O link cru fica numa caixa
`table-layout:fixed`, que obriga o endereço longo a quebrar. **O logo vai EMBUTIDO** (anexo inline
`cid:`, de `server/email/logo.ts`, gerado por `scripts/gerar-logo-email.mjs` a partir do traço da
marca): aparece sem buscar nada no servidor. `base.test.ts` falha se alguma `<img>` apontar para
fora do e-mail.

`process.env` e não `$env/dynamic/private`, porque o worker importa este módulo fora do
SvelteKit — mesma razão do `server/tts`.

## Fila

Tabela `Job` no Postgres, sem Redis. O worker faz poll com `SELECT ... FOR UPDATE SKIP LOCKED`,
que é a primitiva que dá exclusão mútua entre workers concorrentes.

```
Job { id, type, payload JSON, status, attempts, lockedUntil, runAfter, lastError }
```

Tipos: `tts`, `convite`, `convite-escola`, `convite-conta`, `aviso-equipe`, `envio-programado`, `redefinir-senha`, `mercadopago` (a notificação do gateway, conferida pelo webhook — billing.md), `mercadopago-troca` (a troca de plano: cancela lá a assinatura substituída e devolve a parte não usada; se reagenda pelo `runAfter` enquanto o plano novo não está pago — billing.md "Troca de plano"), `intranet` (a ação pedida pelo painel interno, `../spokke-intranet` — o ÚNICO tipo que outro processo insere, e só ele: RLS em `"Job"` para o papel `spokke_intranet_leitor`; o schema `intranetJobSchema` tem um espelho lá; as ações são conceder/encerrar plano sem vencimento e `marcar-relato`, o estado de um relato de problema). (`convite-modulo` saiu com o e-mail do módulo.) O `convite-conta` não carrega o endereço: o worker lê a ficha na hora e não manda para quem já tem conta, para link que foi trocado nem pedido que já saiu (`conviteAindaVale`). Cada um tem o schema e o
`enqueue…` em `server/queue/index.ts` e o caso em `worker/index.ts`. **Suba o worker antes (ou junto)
do web** quando criar um tipo: tipo desconhecido lança erro e vai para `failed`. Os jobs falhados
aparecem no painel interno (`/admin`), com "Tentar de novo".

**A manutenção de hora em hora mora no mesmo laço do worker** (`manutencao()`, sem cron): hoje, a
retenção dos relatos de problema (180 dias, `server/relatos/retencao.ts`). Falhar ali não derruba a
fila; tenta de novo na hora seguinte.

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
- **Módulo não manda e-mail: ele LIBERA.** `despacharEnvio` cria os convites para TODOS os alunos
  (é o convite que abre a fase no mapa de quem tem conta) e grava `Delivery.porEmail = false`.
  Houve um canal `email` | `mapa` na programação, o job `convite-modulo` e um teto de 100 e-mails
  por dia na prévia; os três saíram. Uma programação gravada com `canal` é lida igual (o Zod
  descarta a chave).

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

**No diálogo a voz é de QUEM FALA** (`vozDoFalante`): o elenco, na ordem em que entra, anda pela
lista de vozes com um passo primo a partir de um ponto que sai das falas. Cada pessoa tem uma voz, a
mesma em todas as questões daquele diálogo, e duas pessoas só dividem voz quando o idioma tem menos
vozes que o elenco.

**Os arquivos de uma questão são de três tipos** (`audiosDoItem`, `server/player/runtime.ts`): a
frase de um prompt de áudio, cada fala de um diálogo com áudio e a palavra da Pronúncia, sempre nas
duas velocidades. `itemAudioHashes` é a lista achatada, e é ela que a fila, a etapa 4, a limpeza e o
envio contam: uma questão de diálogo só fica pronta com todas as falas sintetizadas.

**Lista de vozes vazia = sem item de escuta naquele idioma.** É o caso do árabe hoje: o modelo
não fala. Sem esse corte o gerador produzia item de escuta cujo TTS o provedor recusa, e a
publicação ficava travada em "gerando áudio" para sempre.

**O áudio de atividade não vence.** Ele vivia 10 dias (regra de ciclo de vida no prefixo `tts/`
e a mesma data em `MediaAsset.expiresAt`), e a entrada do Player resintetizava o vencido: um link
de três semanas abria em "gerando áudio" para a turma inteira. Com o limite de atividades por
plano o estoque é finito, e um MP3 de frase (~35 kB) custa menos que essa espera. Hoje ele fica
enquanto alguma atividade do professor o usa, e **apagar a atividade apaga o que só ela usava**
(`limparAudioSemUso`, `server/tts/limpeza.ts`; a conta é por conteúdo, então o arquivo
compartilhado com outra atividade fica). O bucket só tem a regra de `fala/` (7 dias).

**Quem enfileira é a GERAÇÃO dos itens, não a publicação.** A etapa 4 só libera o botão quando
todos os arquivos existem, e enfileirar apenas dentro de `publicarAtividade` era um impasse: o
professor não conseguia publicar porque faltava áudio, e o áudio não era pedido porque ele não
conseguia publicar — a tela ficava em "0 de 10" para sempre. Isso não aparecia enquanto
`TTS_PROVIDER` estava vazio, porque aí o gerador não produz item de escuta e o contador nasce
em "0 de 0". Gerando na etapa 2, a síntese acontece enquanto ele revisa na etapa 3.

**Só o que ENTRA pede áudio.** A geração grava também as questões "fora" (as que passaram da
quantidade), e sintetizar a escuta de todas seria fila e bucket para questões que talvez nunca
entrem. Aceitar uma questão de fora (`descartarItem` com `descartado: false`, "Aceitar todas")
pede o áudio dela na hora; a etapa 4 e o `publicarAtividade` contam e repõem só as de dentro.

**E o áudio que deixa de ser usado sai do bucket.** `limparAudioSemUso` conta como "em uso" só as
questões que vão para o aluno (as publicadas e as de dentro do rascunho), e roda quando uma questão
deixa de usar um áudio: gerar de novo (as questões antigas saem), tirar uma questão da atividade,
salvar no editor uma escuta que mudou a frase ou deixou de ser escuta, publicar (as de fora somem) e
apagar a atividade. A conta continua por conteúdo: o arquivo que outra questão usa fica.

**Toda síntese é CONFERIDA antes de ir para o bucket** (`server/tts/verificacao.ts`, pedido do dono
do repositório depois do relato R-LX4WSJ: "a fala ficou estranha, não parecia a mesma frase"). O
worker manda o arquivo ao reconhecedor de fonemas do serviço de áudio e compara o que ele ouviu com
o que a voz PRETENDIA dizer — os fonemas que o Kokoro usou, em IPA (`X-Phonemes-Ipa`) —, pela
fonética do kernel (`verificarSintese`, `kernel/language/sintese.ts`):

- **O que se mediu** nas nove vozes do inglês (25 frases e palavras, as duas velocidades, o Whisper
  como juiz): a versão NORMAL sai certa; a DEVAGAR às vezes nasce com um som a mais no começo, que
  se ouve como uma sílaba ("So I don't know", "A good morning", "A beautiful"). A conferência pega
  esses casos e não dá alarme nenhum na normal.
- **Reprovada a devagar, a reserva é a normal ESTICADA** (`esticar` no `/v1/tts/speak`: o serviço
  sintetiza na velocidade normal e estica a fala com o `atempo` do FFmpeg, sem mudar o tom), e ela é
  conferida de novo. Mais ou menos uma devagar em seis sai assim.
- **Reprovada a normal, não há reserva** (trocar a voz trocaria a voz da frase, que sai do texto):
  vai como saiu, marcada `suspeita`, e o log do worker diz o motivo.
- **Sem como ouvir** (o provedor de mentira, o reconhecedor desligado ou fora do ar, um idioma cuja
  escrita a fonética não mede), o áudio vai como sempre foi. Conferir nunca trava a fila.
- O desfecho fica em `MediaAsset.qualidade` (db.md). **O áudio de antes da conferência** (qualidade
  nula) é refeito UMA vez, na mesma chave, quando é versão devagar ou palavra da Pronúncia: quem pede
  é `enfileirarAudioFaltante` (com `refazer`), que agora roda em toda entrada do Player. O arquivo
  antigo fica no ar até o novo chegar, então o link nunca fecha por isso.

**Quando a regra da voz muda, o áudio muda de identidade** (o hash leva a voz): foi o que
aconteceu quando a palavra da Pronúncia passou a sair na voz de referência do inglês (kernel.md
"LanguageProfile"). A atividade que já existia pede arquivos que ainda não foram sintetizados, e a
entrada do Player a fecharia em "áudio sendo gerado" até o worker chegar neles.
`server/tts/pendencias.ts` (`pnpm audio:faltando`) enfileira o que falta de TODAS as atividades de
uma vez, e `deploy/scripts/atualizar.sh` o roda entre o worker novo e o web novo: o áudio novo fica
pronto com o web antigo ainda servindo o antigo. É operação, não tela — atravessa professores como
o worker, e cada job sai com o `teacherId` do dono. O áudio antigo não é apagado ali: sai pela
limpeza de sempre (`limparAudioSemUso`), e é o que `voltar.sh` precisaria.

**A LINHA DO TEMPO de cada áudio vem do próprio serviço de áudio**, junto da síntese
(`X-Phoneme-Times`, `LinhaDoTempo` no kernel): os sons que o TTS disse, em IPA, com o começo e o fim
de cada um no arquivo, e onde a fala começa e termina. O worker a guarda como veio em
`MediaAsset.trechos` (`server/tts/linha.ts`, o mesmo formato no cabeçalho, na coluna e na leitura),
para TODO áudio — o mesmo arquivo serve a uma escuta e a uma Pronúncia, porque é identificado pelo
conteúdo. Na Pronúncia, o runtime a casa com os fonemas do dicionário (`temposDosFonemas`, kernel.md
"Pronúncia") e a tela toca uma sílaba só e anda a boca no tempo de cada som.

- **Não sai do reconhecedor de fonemas** (saía, e a sílaba tocava fora do lugar — o retorno do dono
  do repositório foi "não está sincronizado e tem corte abrupto"): ele marca um INSTANTE por som, o
  pico do CTC, não onde o som começa e termina.
- **Quem sabe é o Kokoro**, que prevê a duração de cada fonema (`pred_dur`, quadros de 25 ms) e gera
  exatamente `soma × 600` amostras. Mas o som sai ADIANTADO em relação à soma: medido contra o
  silêncio do fechamento de "p", "t" e "k" (120 limites, quatro vozes), 74 ms na velocidade normal e
  102 ms na de 0,75 — o mesmo desvio que o `join_timestamps` do próprio Kokoro corrige. O serviço
  desconta `75 ms ÷ velocidade` (`audiotext-service/app/tempos.py`).
- **Os limites que se veem na onda são acertados por ela**, no áudio FINAL (depois do corte das
  pontas e do esticamento): antes de um fechamento (oclusiva, africada, o tepe) e de vogal para
  nasal, o limite vai para onde a energia do som de antes cai. É onde a sílaba seguinte começa: o
  "ha" de "happy" termina com a vogal, e o silêncio do "p" é do "pee". Entre duas vogais, ou antes
  de "l" e "r", não há vale que se meça, e fica a estimativa (uns 30 ms de erro num limite em dez).
  Houve uma versão que levava TODO limite ao ponto de menor energia; ela espremia o "aw" de
  "priority" em 36 ms.
- A versão esticada tem a linha DELA: os tempos da síntese normal, na proporção do esticamento.
- Áudio de antes disto não tem linha (a coluna é nula, ou está no formato antigo e não é lida): a
  sílaba só mostra a boca, até a palavra ser refeita (acima). **Por isso o serviço de áudio sobe
  ANTES do app num deploy**: refeito com o serviço antigo, o áudio ganha `qualidade` e fica sem linha.

## Geração das questões — em segundo plano, passo a passo

`gerarItens` não gera: ele grava o plano, confere a atividade e COMEÇA a geração
(`iniciarGeracao`, `$lib/server/atividades/geracao.ts`), devolvendo na hora. O trabalho
(`executarGeracao`, testável com tudo por parâmetro) anda em passos — ler os materiais (e o
dicionário do transcritor, no japonês e no chinês), traduzir as palavras do associar, montar,
separar pela quantidade (a questão reprovada pelas regras do kernel vai para as de fora), conferir
as outras traduções certas ("Tradução do material", abaixo), salvar e pedir o áudio — e cada passo
concluído atualiza o andamento, que a tela "Gerando" pergunta por `progressoDaGeracao`. **Nenhum
passo usa IA**: quem monta são os geradores do kernel, e quem confere é o kernel e o tradutor do
serviço de áudio.

- **O andamento mora na memória do processo web**, por atividade e só para o professor dela. É de
  minutos e o resultado (o rascunho) vai para o banco; processo que reinicia no meio aparece como
  "parou" (sem notícia há 4 minutos) e a tela oferece gerar de novo. Pronto ou falhado, ele fica 20
  minutos — o professor pode ter saído da tela.
- **Uma geração por atividade, três por professor.** Pedir de novo com uma andando não começa
  outra; cada geração é CPU e pedido ao tradutor, o mesmo serviço que transcreve a fala dos alunos.
- **Erro vira frase, nunca 500**: sem material, tipos que não geram nada ("ligue outro tipo"), ou o
  genérico — com o detalhe no log.
- Sem `getRequestEvent` lá dentro: o trabalho segue depois que a requisição terminou, então tudo
  que ele usa (o repositório do professor, o tradutor) entra pronto em `FontesDaGeracao`.

O `load` da etapa 4 e o `publicarAtividade` chamam o MESMO helper para repor o que faltar —
item editado depois de gerado tem texto novo, logo hash novo. Enfileirar de um `load` é efeito
colateral num GET, e é deliberado: `enfileirarAudioFaltante` pula o que tem áudio válido e o que
já está na fila, então recarregar não multiplica trabalho.

**E o contador anda sozinho.** Quem sintetiza é o worker, noutro processo; a etapa 4 recarrega o
loader a cada 3 s enquanto falta alguma coisa e para quando termina. Sem isso o áudio ficava
pronto e a tela não sabia.

Atividade com áudio pendente não fica acessível pelo link.

**Quem repõe o áudio que falta é a ENTRADA do Player**, não a publicação: publicar é um evento
único, e um job que falhou deixaria o link travado em "gerando áudio" para sempre. O
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
sozinho não bastaria: o worker pula o que já existe. A síntese nova grava na mesma chave do
bucket. A tela já desabilita a ação, mas toda remote function é endpoint
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
com teto por IP no lugar da tentativa e sem guardar nada; paginas.md "Exemplo"; e, na prévia do
aluno, `(studio)/atividades/[id]/previa/fala/+server.ts`, com a sessão do professor dono da
atividade e também sem guardar nada). O Player e a prévia passam as dicas pelo MESMO filtro de
vocabulário (`server/asr/vocabulario.ts`), que descarta a frase inteira que item antigo trazia ali.

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

**Na Pronúncia quem ouve é o RECONHECEDOR DE FONEMAS, não o Whisper** (`ouvirFala`,
`server/pronuncia`, o caminho único do Player e da prévia). O Whisper é modelo de língua e devolve a
palavra certa de uma pronúncia torta; o reconhecedor (`POST /v1/asr/phonemes` do serviço de áudio,
um wav2vec2 afinado para fonemas) devolve os SONS, cada um com a certeza e as alternativas que ele
considerou (`reconhecerFonemas`, `server/audiotext/client.ts`). A resposta vira
`{ transcript, sons }`, e o `transcript` é a leitura desses sons no rigor da questão ("prai · aw ·
huh · tee", `compararSons`) — é o que a tela mostra como "Ouvimos" antes do "Verificar". E é mais
barato: ~0,2 s por palavra, contra ~1,4 s do Whisper, que processa sempre uma janela de 30 s.

- **O que se ouviu é guardado INTEIRO na pré-transcrição** (`pre-transcricao.ts` guarda a resposta,
  não só o texto): o "Verificar" corrige exatamente o que a tela mostrou, sem rodar modelo de novo.
- **Sem o reconhecedor, a reserva é a de antes**: um 503 (motor desligado, carregando) ou 404
  (serviço anterior a ele) põe a Pronúncia na transcrição do Whisper por um minuto
  (`reconhecedorForaAte`), com os fonemas do dicionário por cima (`respostaDeFala`, a resposta
  `{ transcript, fonemas }`). Palavra fora do dicionário fica sem fonemas, e a correção diz que ouviu
  outra palavra. O dicionário (o CMU Pronouncing Dictionary) é carregado sob demanda, na primeira
  geração ou correção que precisa dele, e nunca vai para o browser.
- O reconhecedor não recebe dica nem idioma: ele não tem vocabulário, e é por isso que serve.

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
worker da publicação tenta de novo com backoff. O reconhecedor de fonemas tem a fila dele
(`fonemas`), com o mesmo teto do ASR: uma turma inteira gravando a mesma palavra ao mesmo tempo.

## IA — "Gerar com IA" (Gemini)

`docs/adr-003-ia-gemini.md`. Resumo das regras:

- A IA **propõe material**, nunca exercício, e nada entra na biblioteca antes de o professor marcar e
  confirmar. Aceitar passa por `gravarMateriais` (cota de estoque, reaproveitamento).
- Atrás de interface própria (`server/ia/provider.ts`); `LLM_PROVIDER` vazio = desligada. Ele é
  uma FILA em ordem (`"claude,gemini"`): `reserva.ts` passa o pedido ao seguinte quando o anterior
  lança `FalhaDoProvedor` — e só ela; outro erro é defeito e sobe. Os ids de modelo vêm de
  `CLAUDE_MODEL` e `GEMINI_MODEL`, nunca do código. O Claude (`claude-provider.ts`) lê a falha
  pelo `status`/`type` do erro (`billing_error` é "sem créditos"), nunca pelo texto.
- Saída estruturada (`responseJsonSchema` saído do mesmo Zod que valida a volta) e **revalidação de
  tudo** contra `contentUnitSchemas` — o provedor não é confiável para dizer que respeitou o formato.
- O prompt só leva rótulos de idioma do `LanguageProfile` (sem `if` por idioma) e o texto do
  professor delimitado, como dado. Nunca dado de aluno, nunca a nota privada do professor.
- Créditos: débito ANTES da chamada (transação curta, `refKey` = `requestId` do cliente), chamada
  FORA da transação com teto de tempo, estorno do que não serviu.
- **Raciocínio MÍNIMO** (`raciocinioMinimo` em `gemini-provider.ts`, que escolhe a opção certa para
  cada geração do Gemini a partir do `GEMINI_MODEL`): os tokens de raciocínio são cobrados como saída
  e os preços dos planos contam com ele desligado. Ligar é refazer a conta (adr-002 "Preços").
  **Modelo que recusa o nível sobe um degrau** (`raciocinioAcima`: MINIMAL → LOW → MEDIUM, nunca o
  padrão do modelo) e fica nele pelo resto do processo — o `gemini-3.8-flash` não aceita o MINIMAL, e
  toda geração voltava "recusou". **Todo motivo de recusa vai para o log** (`[ia] o Gemini
recusou: …`), o 503 de sobrecarga ganha UMA nova tentativa, e a tela diz o que fazer: sobrecarga
  ("tente em alguns minutos"), limite da chave (429) ou recusa.
- Cada geração respondida grava os tokens em `AiUsage` (`registrarUso`), DEPOIS do estorno e sem
  nunca derrubar a geração: medir não pode custar ao professor o que ele pediu. Grava também a
  fonte (`prompt`, `imagem`, `video`) e os segundos de fala.
- **Foto e vídeo** (adr-003, seção 6). A foto vai inteira (reduzida e recodificada em JPEG no
  navegador); do vídeo vai só a FALA do trecho escolhido, num WAV mono de 16 kHz e 8 bits montado no
  navegador — o vídeo em si não sobe, e dez minutos de fala cabem nos 10M do `BODY_SIZE_LIMIT`. O
  servidor decide o tipo da foto pelos bytes e a duração da fala pelo cabeçalho do WAV
  (`$lib/ia/arquivo.ts`, o mesmo módulo que o navegador usa para montar). Cada provedor declara o
  que LÊ (`GeradorDeMateriais.le`): o Claude lê imagem, o Gemini lê imagem e áudio, e a fila de
  reserva só passa o pedido a quem lê aquele tipo. Arquivo que ninguém ligado lê é recusado ANTES
  de cobrar. **Nada é guardado**: nem bucket, nem banco.
- **O custo é UMA conta**, `custoDaGeracao` (`$lib/billing/ia.ts`), no botão da tela e no débito:
  as propostas mais a leitura do arquivo (`CUSTO_IA.porImagem`, `CUSTO_IA.porMinutoDeFala` por
  minuto começado). Sem nenhuma proposta que sirva, volta tudo, leitura junto.
- **O par de frases vem com as VARIAÇÕES da tradução** (`variants`, até `MAX_VARIACOES_DA_IA`, 3):
  viram resposta aceita na questão de tradução (kernel.md "Respostas aceitas"). `validarProposta`
  as limpa (sem vazia, sem repetir a tradução nem a frase original) e não grava a chave quando não
  sobra nenhuma. **A proposta que "traduz" repetindo o original é descartada** (`repeteOOriginal`,
  o caso da "la cometa") e estornada como qualquer inválida.
- **A frase que o professor já tem SEM variações é a mesma frase** (`comoNaBiblioteca`): o
  reaproveitamento compara o material inteiro, e as variações da IA fariam a proposta deixar de
  casar — aceitar criaria uma segunda linha igual. A proposta vira a que existe, e as variações da
  IA ficam de fora: o material do professor não muda por causa de uma proposta. Vale ao propor
  ("você já tem") e ao aceitar.
- **A IA só gera material.** Conferir questão e traduzir não passam por ela (pedido do dono do
  repositório, 2026-11-17): são as regras do kernel e o tradutor do serviço de áudio, que roda na
  nossa máquina. Houve um revisor de IA, pronto e desligado; saiu antes de ser ligado.

## Tradução do material

`docs/adr-006-traducao.md`. O professor cadastra no idioma que ensina e a frase do aluno sai do
tradutor — **MADLAD-400 3B** (Apache 2.0, int8 no CTranslate2), o terceiro motor do
`audiotext-service` (`POST /v1/translate`, em lote). `server/traducao/` é a interface
(`TRANSLATE_PROVIDER`: vazio desliga, `audiotext` liga); `server/audiotext/client.ts` manda pedidos
de até 32 textos, em sequência, e recusa resposta com contagem diferente da pedida.

- **Só preenche o que veio em BRANCO.** A tradução que o professor escreveu nunca é trocada; a da
  IA também não (ela já vem no material). `completarTraducoes` é a regra, e é genérica no formato
  (`target`→`source` no par de frases, `term`→`translation` no vocabulário).
- **Quem garante é o servidor, ao gravar**: `preencherTraducao` (um material) e `traduzirLote` (a
  lista colada) rodam antes de `montarMaterial`, nos dois lugares que cadastram material — wizard e
  biblioteca. A sugestão ao vivo do formulário (`materiais/traducao.remote.ts`, `sugerirTraducao`)
  é conforto: não grava nada, tem guard e teto por professor (120 em 10 min — cada pedido é CPU do
  serviço que também transcreve a fala dos alunos), e pode falhar à vontade.
- **As variações vêm junto quando é o SERVIDOR quem traduz** — a lista colada, e a frase salva
  antes de a sugestão chegar (o botão não espera): `preencherTraducao` e `traduzirLote` pedem
  também as variações (`variantesDasFrases`, o mesmo funil das questões de tradução, dois pedidos
  para a lista inteira) e as gravam em `SentencePair.variants`, somadas às do professor. Sem isso
  o material entrava sem as variações que a tela teria mostrado. Falhar nelas não impede gravar.
- **Lote é tudo ou nada.** Tradutor fora do ar no meio da lista colada = nada gravado e a tela pede
  a tradução depois do separador. Um material avulso falha com `AVISO_SEM_TRADUTOR`, nunca 500.
- **A tradução é CONFERIDA antes de ser gravada** (`traduzirConferindo`), pelo próprio tradutor e
  sem IA — o desenho da voz, que é ouvida antes de ir para o bucket ("TTS", acima). Duas regras:
  - **A que volta IGUAL ao original é reprovada** (o caso da "la cometa" de kernel.md "Conferência
    de qualidade"), pelo normalizador dos dois perfis: "La cometa." é "la cometa". Vale para frase e
    para palavra. A palavra igual nas duas línguas ("hotel", "feliz" do espanhol) cai junto: o
    professor a escreve, e é ele quem diz que é a mesma.
  - **A da PALAVRA passa pela ida e volta** (`idaEVolta`, o vocabulário). Medido no MADLAD com 88
    palavras de aula, do espanhol e do inglês: solta, sem contexto, uma em quatro sai errada ("el
    perro" → "Sobre o cão", "el tenedor" → "com o garfo", "la rata" → "a taxa", "hat" → "O quê?").
    A certa quase sempre está entre as outras hipóteses do feixe, e o que separa é traduzir de
    volta. Então o servidor pede as alternativas, traduz de volta até três delas
    (`CANDIDATAS_POR_PALAVRA`, com as alternativas da volta) e fica com a PRIMEIRA cuja volta dá o
    original: "o cão", "o garfo". Entre formas que a correção igualaria ("O chefe.", "o chefe"),
    fica a que tem a forma do original, sem ponto e na mesma caixa — numa questão de escolher, a
    única alternativa com maiúscula entregaria a resposta. São dois pedidos para a lista inteira.
  - **Reprovada, fica em BRANCO**, e o professor escreve: tradução errada em silêncio é pior que
    campo vazio. O material avulso responde "o tradutor automático não soube traduzir …, escreva a
    tradução"; a linha da lista colada fica de fora e VOLTA ao campo, já com o separador
    (`semTraducaoDe`); a sugestão ao vivo não preenche.
  - **O preço, medido junto**: em palavra solta, mais ou menos uma em três fica em branco — as
    erradas ("la rata", "la playa" → "Perto da praia"), as iguais nas duas línguas e algumas certas
    que não voltam ("parents" → "pais" volta "country", "eraser" → "borracha" volta "rubber"). Em
    troca, o que entra está certo. No japonês a qualidade da palavra solta é baixa ("犬" → "Cães."),
    e a ida e volta não a conserta. Frase não passa pela ida e volta: nela o tradutor acerta
    (adr-006), e a volta raramente devolve as mesmas palavras.
- **O par de idiomas**: no wizard, `activity.targetLang` → `activity.sourceLang`; na biblioteca, o
  idioma do material → o `linguaDoAluno` que a página manda num campo escondido (a mesma língua que
  ela usa para a IA). Material "sem idioma" não tem de onde traduzir.
- **Os idiomas do tradutor são uma lista FECHADA** em `audiotext-service/app/traducao.py`, pelo
  código base; `traducao.test.ts` confere que todo `LanguageProfile` está nela.
- **O tradutor é o motor opcional do serviço**: ele sobe depois do Whisper e do Kokoro, e falhar ao
  carregá-lo não tira voz e fala do ar (`/health` segue `ok`, com `translate_ready: false`).
- **Ele também alimenta o "ligue os pares" do fecho**: `gerarItens` chama `paresDasFrases`, que
  escolhe palavras das frases (kernel puro), traduz num pedido e só guarda o par que faz a IDA E
  VOLTA (kernel.md "closing-match"). Sem tradutor ou com ele fora, volta vazio e a geração segue.
- **E as variantes aceitas da questão de tradução** (kernel.md "Respostas aceitas",
  `server/atividades/variantes-aceitas.ts`): depois de separar pela quantidade,
  `comVariantesDaTraducao` pega os "traduza para o português" — os que entraram E os de fora, que
  podem entrar na revisão e não podem chegar lá sem elas. Quatro passos, todos no tradutor:
  1. **O feixe**: as traduções ALTERNATIVAS da frase (`alternatives` no `/v1/translate`, as
     hipóteses perto da melhor na pontuação do modelo).
  2. **O tamanho da diferença**, no kernel (`variantesProximas`).
  3. **O sentido, pela ida e volta**: a variante traduzida de novo tem de dar a frase original, ou
     o mesmo que a resposta do professor dá. A que não volta ganha uma segunda chance — vale se a
     frase estiver entre as outras hipóteses da volta.
  4. **O sujeito explícito, pelo COMEÇO FORÇADO** (`Tradutor.comecandoPor`, o `target_prefix` do
     `/v1/translate`): quando nenhuma resposta aceita traz o pronome, o modelo traduz a frase
     obrigado a começar por "Eu" (depois "Nós"), e o pronome só vale se ele escrever a frase do
     professor, ou uma variante aprovada, depois dele. Era a ida e volta que escolhia, e ela
     aprovava lixo: o modelo ignora um pronome sobrando, e "Eu onde fica a estação de trem?", "Eu há
     um gato no jardim" e "Nós está muito frio hoje" viravam resposta aceita (medido: uma frase em
     três). Começando por "Eu", "There is a cat in the garden" sai "Eu tenho um gato no jardim", e
     a candidata errada não aparece.
  - **Medido em 36 frases de aula** (espanhol e inglês para o português): 31 ganham variações e
    nenhuma sem sentido entra. Custa uns 20 a 25 s para 18 frases, no passo "Conferindo outras
    traduções certas" da tela "Gerando".
  - Nunca trava a geração: sem tradutor, fora do ar ou com resposta estranha, os itens seguem como
    vieram, e o que um passo aprovou não se perde porque o seguinte falhou. **Serviço de áudio
    anterior ao começo forçado** ignora o campo e devolve a tradução livre: o sujeito só não é
    proposto. Por isso, num deploy, o serviço de áudio sobe ANTES do app.
- **"Sugerir outras traduções"** (`sugerirRespostas`, no editor de questão): o mesmo funil para UMA
  questão de tradução, a pedido do professor — a que ele editou, a de antes desta melhoria, a que
  foi gerada com o tradutor fora. Não grava: a tela põe as novas em "Também aceitas". Guard e teto
  por professor (40 em 10 min).

## Notificações

`docs/notificacoes.md` é o mapa (o que avisa, o que não avisa e por quê). As regras de código:

- **Quem grava é `$lib/server/notificacoes`, e nunca uma remote function.** `notificar(teacherId,
evento)` recebe o professor de quem chama porque é chamado onde não há sessão dele — o Player
  (resposta de rubrica), o worker (áudio que a fila desistiu de gerar), a programação de módulos, a
  cobrança e a escola. A leitura é `repos/notificacoes.ts`, com o professor da SESSÃO
  (`notificacoesDoSino`, `marcarNotificacaoLida`, `marcarTodasLidas` em `studio.remote.ts`).
- **Avisar nunca derruba quem avisa**: tudo ali engole o erro com `console.warn`. No Player o
  aviso nem é esperado (`void`): o aluno não espera o sino de outra pessoa.
- **Dentro de transação, o aviso sai DEPOIS do commit** — `ativarPlano` chamado por
  `atenderPedido` não avisa (quem avisa é `atenderPedido`, depois do `$transaction`). Um aviso de
  plano ativo para uma ativação desfeita mentiria, e um erro do aviso dentro da transação a abortaria.
- **O que o aviso pedia aconteceu, ele se resolve**: a correção pela contagem do banco
  (`atualizarCorrecao`), a liberação que saiu e o "Gerar áudio de novo" por
  `resolverNotificacoes`.

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
