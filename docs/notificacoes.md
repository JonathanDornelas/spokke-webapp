# Notificações — o sino do Studio

O sino do cabeçalho existia desde o desenho e não fazia nada: era um ícone com um ponto âmbar
quando havia resposta para corrigir. Este documento é o mapa do que ele avisa hoje, e do que ele
de propósito NÃO avisa.

## A regra

**Entra no sino o que pede uma ação do professor, ou o desfecho de algo que ele começou e não está
olhando.** O resto ele vê abrindo a tela — e avisar também ensinaria a ignorar o sino, que é o
caminho mais curto para ele perder o aviso que importa.

## O que avisa

| Tipo             | Quando                                                              | Agrupa                         | Leva a                      |
| ---------------- | ------------------------------------------------------------------- | ------------------------------ | --------------------------- |
| `correcao`       | chega uma resposta de escrita (rubrica) para ele dar nota           | por atividade, com a contagem  | os resultados da atividade  |
| `liberacao`      | uma liberação de módulo não aconteceu na data (rascunho, arquivada, | por turma e atividade          | a programação daquela turma |
|                  | ou áudio depois de esgotar as tentativas)                           |                                |                             |
| `audio`          | a fila desistiu de gerar um áudio — o link da atividade fica em 503 | por atividade                  | a atividade                 |
| `aluno-entrou`   | um aluno da chamada ligou a conta à turma                           | por turma ("Ana e mais 3")     | a turma                     |
| `plano`          | a equipe (ou, com o gateway, o provedor) ativou o plano, estendeu o | não agrupa                     | a aba de assinatura         |
|                  | teste, cancelou agora ou deu créditos de cortesia                   |                                |                             |
| `escola`         | um professor aceitou o convite da escola — para a coordenação       | por escola                     | a área da escola            |
| `trial-acabando` | três dias antes do fim do teste, e no último                        | um por marco                   | os planos                   |
| `terminou`       | um aluno terminou uma atividade (a primeira vez que a tentativa     | por atividade ("Ana e mais 3") | os resultados da atividade  |
|                  | termina; recarregar a tela final não conta de novo)                 |                                |                             |

Detalhes que valem como regra:

- **"Para corrigir" se resolve sozinho.** A contagem é sempre a do banco (`atualizarCorrecao`), não
  um +1: o professor deu a última nota, a notificação vira lida. Um sino que continua chamando por
  algo feito é o que faz ninguém olhar para ele.
- **A liberação que saiu depois resolve o aviso dela**, e "Gerar áudio de novo" resolve o do áudio:
  as duas ações são a resposta ao que o aviso pedia (`resolverNotificacoes`).
- **Áudio com tentativas pela frente não avisa.** A liberação que espera o áudio tenta de novo a
  cada cinco minutos e quase sempre sai sozinha; o sino só entra quando as tentativas acabam. Pelo
  mesmo motivo, só o WORKER avisa liberação: "Liberar agora" e "Tentar de novo" mostram o resultado
  na própria tela.
- **Plano: só o que OUTRA pessoa fez.** O que o próprio professor fez (cancelar no fim do período,
  pedir um plano), ele acabou de ver. O cancelamento agendado também fica de fora: não muda nada até
  o fim do período.
- **A escola vê nomes de PROFESSOR, nunca de aluno** — a mesma regra da área da coordenação
  (auth.md).
- **Agrupar é por chave, e só enquanto não lida** (`Notification.key`). Lida, o próximo evento abre
  uma notificação nova. Trinta alunos entrando numa tarde são um aviso; amanhã, outro.
- **Tentativa terminada entrou a pedido do dono do repositório (2026-11-10).** Ficava de fora por
  ser o fluxo normal — trinta vezes por atividade —, e é o agrupamento por atividade que a torna
  um aviso só: "Ana e mais 29 terminaram Present perfect".

## Na barra lateral

O sino não é o único lugar: **cada item da barra lateral do Studio mostra o número de avisos não
lidos dele** (`SECAO_DO_AVISO`, `$lib/notificacoes`) — Resultados conta quem terminou, Turmas quem
entrou com a conta, Atividades o áudio que falhou, Escola quem entrou na escola e Assinatura o que
a equipe fez no plano e o fim do teste. No celular, as abas de Atividades, Turmas e Resultados.

- **Azul, a cor do sino**: "tem novidade" não é erro. **Vermelho só em Atividades**, porque ali o
  aviso é um link fora do ar. O número âmbar de Resultados (respostas para corrigir) e o vermelho de
  Módulos (liberação que não saiu) continuam saindo da conta do banco, e por isso a correção e a
  liberação NÃO entram na conta de avisos — seria contar a mesma coisa duas vezes. Na aba do
  celular cabe um número só, e a correção pendente vence.
- **Abrir a tela de destino conta como ver** (`marcarVisto`, `$lib/client/avisos.ts`): os
  resultados da atividade, a atividade, a turma, a escola e a aba da assinatura. É a PÁGINA que
  marca, quando monta, e não o loader: o Studio pré-carrega dados ao passar o ponteiro sobre um
  link (`data-sveltekit-preload-data="hover"`), e o loader marcaria como visto o que ninguém abriu.
- **A lista de Resultados diz onde está a novidade**: a linha da atividade ganha "N novas" até ele
  abrir os resultados dela. Sem isso o número da barra não levava a lugar nenhum.
- Os números saem da MESMA consulta do sino (`notificacoesDoSino`, que devolve `porSecao` e
  `terminadasPorAtividade`): atualizam a cada minuto e, quando algo vira lido — pela tela de
  destino ou pelo sino —, o evento `spokke:avisos-lidos` faz o layout e o sino recarregarem na
  hora. O loader do layout não roda de novo numa navegação, então não serve para isso.

## O que NÃO avisa, e por quê

- **E-mail que saiu, liberação que aconteceu na data.** É o caminho esperado — avisar o que deu certo
  é ruído.
- **E-mail que voltou.** O produto manda por SMTP (server.md "E-mail"), e SMTP não devolve aviso de
  devolução: o servidor do Resend aceita e a devolução acontece depois, fora do nosso alcance. Hoje
  nada no código marca `Invite.bouncedAt`. Quando houver um aviso de devolução (o webhook do
  provedor), ele entra aqui como `email-voltou`, agrupado por turma.
- **Proposta da IA pronta.** Gerar é síncrono: o professor está na tela esperando.
- **Avisos para o aluno.** O mapa do módulo já mostra a fase nova quando ela abre; um segundo canal
  para a mesma coisa fica para quando houver pedido.

## Como funciona

- **Tabela `Notification`** (db.md): `kind`, `key`, `data` (JSON validado com Zod ao ler), `count`,
  `readAt`. O TEXTO não é gravado: sai de `kind` + `data` em `$lib/notificacoes`
  (`textoDaNotificacao`), então uma copy corrigida vale para o que já existe — e uma linha cujo
  `data` não valida mais é pulada, não quebra o sino.
- **Quem grava** é `$lib/server/notificacoes` (`notificar`, `atualizarCorrecao`,
  `resolverNotificacoes`, `avisarFimDoTrial`) — interno do servidor, chamado pelo Player, pelo
  worker, pela programação de módulos, pela cobrança e pela escola, contextos sem a sessão do
  professor. **Avisar nunca derruba quem avisa**: uma falha vira `console.warn`. Na cobrança e na
  escola o aviso sai DEPOIS do commit — um aviso de plano ativo para uma ativação desfeita mentiria.
- **Quem lê** é `repos/notificacoes.ts`, com o `teacherId` da sessão em todo `where` (regra nº 4),
  pelas remote functions `notificacoesDoSino`, `marcarNotificacaoLida` e `marcarTodasLidas`
  (`studio.remote.ts`).
- **O sino** (`NotificacoesSino.svelte`) atualiza ao abrir e a cada minuto com a aba à vista — quem
  dispara é outro processo. Abrir uma notificação a marca como lida e leva à tela onde a coisa se
  resolve. O número no sino é o de não lidas, na cor da marca: vermelho é do erro e da devolução, e
  "tem algo novo" não é erro.
- **O fim do teste** é criado na leitura do Studio (`+layout.server.ts`), idempotente pela chave
  (data do fim + marco). Escrever num load é deliberado, como o `enfileirarAudioFaltante`.
- **Retenção**: notificação lida há mais de 90 dias sai quando chega uma nova. O sino não é arquivo
  — o histórico de verdade da conta é o `AuditEvent`.
