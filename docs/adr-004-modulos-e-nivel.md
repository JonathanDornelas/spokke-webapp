# ADR-004 — Módulos e nível da atividade

**Estado:** aceito · outubro de 2026

## Contexto

O Todo pedia um "sistema de dificuldade" e "módulos para alocar atividades (ex.: intermediário,
frutas)". Havia quatro leituras possíveis de dificuldade; o dono escolheu a mais simples.

## Nível — um rótulo, não uma regra de geração

- `Activity.level` (texto, nulo = sem nível), validado contra `NIVEIS` em
  `src/lib/atividades/nivel.ts`: a escala **CEFR A1–C2** com nome amigável.
- CEFR vale para qualquer idioma, então o sistema continua agnóstico. Uma escala de um idioma só
  (JLPT, HSK) seria regra de língua fora do `LanguageProfile`.
- **Não muda os exercícios gerados.** Organiza, filtra e aparece para o aluno.
- Mora na ATIVIDADE (como o título), não na versão: trocar o nível não exige republicar.
- Onde aparece: etapa 1 do wizard (opcional), cabeçalho do detalhe (editável), lista (coluna e
  filtro), entrada do Player, histórico do aluno, seletor de atividades da turma.
- A copy pública "Menos campos" (`institucional.ts`) foi ajustada: o nível é um rótulo opcional.

Trocar a escala é editar `NIVEIS`; mudar um `id` pede migração dos valores gravados.

## Módulos — coleção ordenada, N:N

- `Module` (nome, descrição, cor da paleta de etiquetas) e `ModuleActivity` (posição). N:N: a mesma
  atividade pode estar em "Frutas" e em "Intermediário".
- Repositório `modulos(teacher)` (`src/lib/server/db/repos/modules.ts`): **ligar exige as duas
  pontas do professor**, e reordenar exige exatamente o mesmo conjunto de ids.
- Telas: `(studio)/modulos` e `(studio)/modulos/[id]` (reordenar arrastando **e** pelas setas), chips
  no detalhe da atividade, filtro na lista.
- **Enviar o módulo para a turma** (`src/lib/server/modulos/enviar.ts`): só atividades no ar e não
  arquivadas (as outras voltam relatadas); áudio faltando em qualquer uma barra o envio inteiro; um
  `Delivery` por atividade com o mesmo `envioId`. **Atualização de novembro de 2026: o módulo não
  manda mais e-mail — ele LIBERA** a atividade no mapa do aluno na data programada (o job
  `convite-modulo` e o "por e-mail" saíram, a pedido do dono).
- O aluno não vê "módulo" como entidade: recebe os links no e-mail, na ordem do módulo.
- A paleta de cor é compartilhada com as turmas (`src/lib/etiquetas.ts`): nunca verde nem âmbar.

## Fora do escopo

- Dificuldade medida pelos resultados e trilha adaptativa por aluno.
- Página pública do módulo (um link para o módulo inteiro).

## Atualização (outubro de 2026) — turmas do módulo, programação de envio e mapa do aluno

O dono pediu três coisas: escolher QUANDO e QUAIS atividades saem ("1 por semana, 1 por mês, toda
quinta"), exigir que a turma esteja alocada ao módulo para receber o envio, e mostrar o módulo no
painel do aluno como um mapa de fases no tema de jogo em 8 bits. Os briefings funcionais são
`docs/telas-modulos-professor.md` e `docs/telas-modulos-aluno.md`; o desenho veio do Claude Design.

**Turma alocada** (`ModuleClassroom`, único por módulo × turma). Só turma alocada recebe envio do
módulo, e é a alocação que põe o módulo no mapa dos alunos dela. Alocar confere as duas pontas
(`repos/programacoes.ts`). Tirar a turma cancela os envios futuros dela; o que já saiu continua
valendo, porque o link é da atividade. A migration alocou toda turma que já tinha recebido um
módulo pelo envio antigo, com a programação "tudo agora" e o que saiu marcado como enviado.

**Programação, uma por turma.** Ela mora em `ModuleClassroom.schedule` (Json validado por
`programacaoSchema`) e tem quatro modos: tudo agora, por semana, por intervalo e datas escolhidas.
Cada atividade tem uma linha `ModuleSend` (único por alocação × atividade) com `dueAt` e o
desfecho, que pode ser `programada`, `enviada`, `nao_saiu` ou `pulada`.

- **A conta das datas é UMA função pura** (`agendar`, `$lib/modulos/programacao.ts`), usada pela
  prévia da tela e pelo servidor, com o "hoje" de Brasília que o loader manda. A data que o
  professor vê é a que vai ser gravada.
- **Datas são texto `AAAA-MM-DD`**; o instante só aparece em `instanteDe`, com o fuso fixo de
  Brasília (sem horário de verão desde 2019). Dia 31 no "1 por mês" cai no último dia dos meses
  curtos, a mesma regra do ciclo de créditos.
- **A agenda é ancorada no início.** O que já saiu (ou não saiu) ocupa a vaga dele, então as
  outras não andam. "Enviar agora" adianta só aquela, e as outras datas não mudam. **Agenda
  atrasada recomeça de hoje**: retomar uma programação pausada redistribui a fila no mesmo ritmo.
- **O disparo é a fila que já existe.** Cada instante vira um job `envio-programado` com
  `runAfter`, que só diz QUAL alocação acordar. O que sai é decidido pelo banco na hora
  (`processarEnviosDevidos`), então reprogramar não precisa caçar job velho: ele acorda, não
  acha nada devido e termina. Cada linha é reivindicada com `updateMany` condicionado ao estado
  lido, e dois workers no mesmo instante não mandam o mesmo e-mail.
- **O que não pode sair "não sai", com o motivo, e não pula para a seguinte.** Rascunho espera a
  publicação (`publicarAtividade` destrava o envio sozinho). Arquivada espera o professor. Áudio
  faltando tenta de novo a cada 5 minutos, até 6 vezes. É o único estado em vermelho: no menu, no
  cartão do módulo, no aviso do detalhe e na pílula da turma.
- ~~Um e-mail por aluno por envio (`convite-modulo`)~~ — saiu em novembro de 2026: módulo só libera
  no mapa do aluno. Mandar UMA atividade por e-mail continua existindo, fora do módulo.

**O mapa do aluno** (`/aluno/modulos/[id]`, e o bloco "Seus módulos" em `/aluno`). Só para
quem tem conta com a ficha da turma ligada; quem entra pelo link aberto não tem mapa, e isso é o
caminho normal. O progresso sai das tentativas que já existem (`repos/mapa-aluno.ts`), sem
coleta nova e sem nada de outro aluno.

- Cada fase está concluída, em andamento, liberada, trancada (com a data em que abre) ou
  encerrada. "Jogar" e "Continuar" levam pelo link pessoal do convite, para a tentativa contar.
- **O mapa não tranca o link.** A ordem é sugestão; quem tranca é só a programação.
- **Estrelas só onde o professor liberou o resultado** (3 a partir de 90%, 2 a partir de 60%,
  1 para concluída). Com o resultado desligado, a fase é "concluída · sem placar".
- O tema é só do mapa e do cartão dele. A pixel art é DADO (grade de letras virando `path`,
  `$lib/modulos/pixel.ts`), no molde do avatar, e o personagem é o avatar do próprio aluno.
  A fonte pixel (Silkscreen, `font-pixel`) é um quarto papel tipográfico, só para rótulos
  decorativos `aria-hidden` ("MUNDO 1", "FASE 3").
- O avatar anda uma vez quando o aluno avançou, e a festa do módulo concluído toca uma vez. As
  duas memórias ficam no aparelho (`localStorage`) e não são dado sobre o aluno.

O professor tem "Ver como o aluno vê" (`/modulos/[id]/mapa?turma=`): o mesmo mapa com a
programação de uma turma e nenhum progresso de aluno.

**Ficou em aberto:** o aluno que entra na turma depois de a programação começar. Hoje o mapa dele
mostra o que a turma já recebeu como trancado, porque ele não tem convite daquelas atividades. Não
há "mandar as já enviadas para os novos".
